-- =====================================================================
-- Plataforma AlianzaIA · Esquema de datos MVP (PostgreSQL / Supabase UE)
-- Titularidad: Asociación Española de Startups (AES), coordinadora.
-- Versión 0.6 · 19-oct-2026 · BORRADOR (no aplicado en ningún entorno)
--   0.2: campos de las fichas v1 de alianza-ceo (listas cerradas, flujo de estados, casos_internos)
--   0.3: registro de aceptaciones (versión, hora, IP) y minimis en cada asignación (Legal)
--   0.4: firma electrónica simple (art. 25 eIDAS) en cada asignación
--   0.5: firmas_externas adaptada a registro manual por el gestor (Dropbox Sign sin API),
--        soporte para administradores mancomunados (doble firmante) y custodia de audit trail
--   0.6: correcciones de Legal (19-oct): total declarado frente a la tabla (con o sin anexo,
--        revisión del anexo por AES), renovación a los 30 días con la casilla de la plataforma
--        (sin volver a firmar), motivos tasados para volver a firmar en Dropbox Sign y doble
--        aceptación de la casilla y del A-bis en régimen mancomunado
--
-- Módulos: a) casos · b) diagnóstico · c) hub de créditos · d) formación
--          e) área de empresa · transversal (roles, auditoría, ledger)
-- Principios:
--   * RLS activado en todas las tablas: cada empresa solo ve lo suyo.
--   * Rol auditor (Red.es / FEDER): solo lectura sobre todo.
--   * ledger: solo inserción, encadenado por hash, correcciones con
--     contraasiento. Nunca UPDATE ni DELETE.
--   * Sin marcas de partners en lo público: campo nombre_publico genérico.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Transversal: roles y perfiles
-- ---------------------------------------------------------------------
create type rol_plataforma as enum ('empresa', 'gestor', 'mentor', 'auditor');

create table empresas (
  id              uuid primary key default gen_random_uuid(),
  nif             text not null unique,
  razon_social    text not null,
  tipo            text not null check (tipo in ('startup', 'pyme', 'autonomo', 'otra')),
  tamano          text check (tamano in ('micro', 'pequena', 'mediana')),
  cnae            text,
  provincia       text,
  ccaa            text,
  fecha_constitucion date,
  minimis_declarado   boolean not null default false,
  minimis_fecha       timestamptz,
  minimis_importe_3a  numeric(12,2),           -- ayudas de minimis recibidas en 3 ejercicios
  consentimiento_rgpd timestamptz,              -- obsoleto: ver tabla aceptaciones
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente', 'validada', 'baja')),
  creado_en       timestamptz not null default now()
);

create table perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  empresa_id  uuid references empresas(id),
  nombre      text,
  cargo       text,
  rol         rol_plataforma not null default 'empresa',
  creado_en   timestamptz not null default now()
);

-- Helpers para RLS
create or replace function mi_rol() returns rol_plataforma
  language sql stable security definer set search_path = public as
  $$ select rol from perfiles where id = auth.uid() $$;

create or replace function mi_empresa() returns uuid
  language sql stable security definer set search_path = public as
  $$ select empresa_id from perfiles where id = auth.uid() $$;

create or replace function es_staff() returns boolean
  language sql stable as $$ select mi_rol() in ('gestor', 'auditor') $$;

-- Tablas que solo admiten INSERT (aceptaciones, declaraciones, correcciones)
create or replace function solo_insercion() returns trigger language plpgsql as $$
begin
  raise exception '% es solo de inserción: se conserva tal cual (10 años en minimis)', tg_table_name;
end $$;

-- ---------------------------------------------------------------------
-- Textos legales y registro de aceptaciones (textos de Legal, apdo. 5)
-- ---------------------------------------------------------------------
create table textos_legales (
  documento     text not null check (documento in
                  ('condiciones', 'privacidad', 'aviso_legal', 'cookies', 'comercial', 'minimis', 'lectura_facturacion')),
  version       text not null,                   -- p. ej. 1.0
  texto         text not null,                   -- texto exacto que se muestra
  sha256        text generated always as (encode(digest(texto, 'sha256'), 'hex')) stored,
  vigente_desde timestamptz not null default now(),
  primary key (documento, version)
);

-- Cada aceptación (o rechazo de la casilla opcional) con fecha, hora,
-- versión del texto, usuario e IP. Nunca se modifica ni se borra.
create table aceptaciones (
  id          uuid primary key default gen_random_uuid(),
  perfil_id   uuid not null references perfiles(id),
  empresa_id  uuid references empresas(id),
  documento   text not null,
  version     text not null,
  aceptado    boolean not null,
  representa_empresa boolean,                  -- «declaro que represento a la empresa» (obligatorio en minimis)
  documento_contenido text,                    -- documento exacto aceptado si se personaliza (minimis)
  documento_sha256 text not null,              -- huella del documento aceptado
  ip          inet,
  user_agent  text,
  creado_en   timestamptz not null default now(),
  foreign key (documento, version) references textos_legales(documento, version)
);
create trigger aceptaciones_inmutable before update or delete on aceptaciones
  for each row execute function solo_insercion();

-- La IP la pone el servidor (cabeceras de PostgREST), no el navegador.
create or replace function ip_peticion() returns inet
  language plpgsql stable as $$
declare h json; v text;
begin
  h := nullif(current_setting('request.headers', true), '')::json;
  v := coalesce(nullif(split_part(h->>'x-forwarded-for', ',', 1), ''), h->>'x-real-ip');
  return nullif(trim(v), '')::inet;
exception when others then return null;
end $$;

-- p_contenido: documento personalizado (p. ej. la declaración de minimis con los
-- datos de la empresa y de la solicitud). La huella la calcula el servidor; si no
-- hay contenido propio, es la del texto legal de esa versión.
create or replace function registrar_aceptacion(p_documento text, p_version text, p_aceptado boolean,
  p_representa boolean default null, p_contenido text default null)
  returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; h json; v_sha text;
begin
  if auth.uid() is null then raise exception 'hay que iniciar sesión'; end if;
  if p_documento in ('condiciones', 'privacidad', 'minimis') and not p_aceptado then
    raise exception 'la aceptación de % es obligatoria', p_documento;
  end if;
  if p_documento = 'minimis' and p_representa is not true then
    raise exception 'hay que declarar que se actúa en representación de la empresa';
  end if;
  select sha256 into v_sha from textos_legales where documento = p_documento and version = p_version;
  if v_sha is null then raise exception 'no existe el texto % versión %', p_documento, p_version; end if;
  if p_contenido is not null then v_sha := encode(digest(p_contenido, 'sha256'), 'hex'); end if;
  h := nullif(current_setting('request.headers', true), '')::json;
  insert into aceptaciones (perfil_id, empresa_id, documento, version, aceptado, representa_empresa,
    documento_contenido, documento_sha256, ip, user_agent)
  values (auth.uid(), mi_empresa(), p_documento, p_version, p_aceptado, p_representa,
    p_contenido, v_sha, ip_peticion(), h->>'user-agent')
  returning id into v_id;
  return v_id;
end $$;

-- Copia en PDF del documento aceptado, enviada por email a la empresa.
-- La genera y envía el servidor (función serverless) y deja aquí la constancia.
create table copias_enviadas (
  id            uuid primary key default gen_random_uuid(),
  aceptacion_id uuid not null references aceptaciones(id),
  pdf_sha256    text not null,
  pdf_ruta      text not null,                   -- ruta en el almacén privado (bucket UE)
  destinatario  text not null,
  id_mensaje    text,                            -- Message-ID del envío
  enviado_en    timestamptz not null default now()
);
create trigger copias_inmutable before update or delete on copias_enviadas
  for each row execute function solo_insercion();

-- Firmas hechas fuera de la plataforma (Dropbox Sign vía web, registro manual por gestor).
-- Soporta administradores únicos, solidarios y mancomunados (2 firmantes requeridos).
create table firmas_externas (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null references empresas(id),
  tipo                 text not null check (tipo in ('declaracion_alta', 'revocacion')),
  proveedor            text not null default 'dropbox_sign',
  ref_firma            text not null,                 -- signature_request_id de Dropbox Sign
  regimen_administracion text not null default 'unico'
                       check (regimen_administracion in ('unico', 'solidario', 'mancomunado')),
  -- Documento firmado y certificado de auditoría
  documento_sha256     text not null,                 -- huella SHA-256 del PDF firmado
  documento_ruta       text,                          -- ruta en bucket privado de almacenamiento
  audit_trail_sha256   text,                          -- huella SHA-256 del log de auditoría
  audit_trail_ruta     text,
  texto_version        text,                          -- versión del texto firmado (mancomunados: v1.1 sin cambios)
  -- Ayudas declaradas en el documento firmado (3 años, empresa única)
  total_ayudas_eur     numeric(12,2) check (total_ayudas_eur >= 0),  -- total que declara la empresa
  suma_tabla_eur       numeric(12,2) check (suma_tabla_eur >= 0),    -- suma de las filas de la tabla
  num_ayudas           int check (num_ayudas >= 0),
  con_anexo            boolean not null default false,               -- más de 8 ayudas: van en anexo
  anexo_sha256         text,
  anexo_ruta           text,
  -- Firmante principal (o primer administrador)
  firmante_nombre      text not null,
  firmante_email       text not null,
  firmante_cargo       text not null,
  firmado_en           timestamptz not null,
  -- Segundo firmante (obligatorio en régimen mancomunado)
  firmante2_nombre     text,
  firmante2_email      text,
  firmante2_cargo      text,
  firmado2_en          timestamptz,
  -- Auditoría del registro manual por el gestor de la plataforma
  registrado_por       uuid not null references perfiles(id),
  notas_verificacion   text,
  creado_en            timestamptz not null default now(),
  unique (proveedor, ref_firma, tipo),
  constraint firmas_mancomunadas_completas check (
    regimen_administracion <> 'mancomunado' or
    (firmante2_nombre is not null and firmante2_email is not null and firmado2_en is not null)
  ),
  -- La declaración del alta guarda PDF y certificado de auditoría con sus huellas, y el total.
  constraint firmas_alta_completa check (tipo <> 'declaracion_alta' or (
    documento_ruta is not null and audit_trail_sha256 is not null and audit_trail_ruta is not null
    and texto_version is not null and total_ayudas_eur is not null and suma_tabla_eur is not null
    and num_ayudas is not null)),
  -- Sin anexo (hasta 8 ayudas): el total coincide con la tabla. Con anexo (más de 8): el total
  -- es igual o mayor que la tabla, el anexo se guarda con su huella y AES lo revisa a mano.
  constraint firmas_total_coherente check (tipo <> 'declaracion_alta' or
    (not con_anexo and num_ayudas <= 8 and total_ayudas_eur = suma_tabla_eur) or
    (con_anexo and num_ayudas > 8 and total_ayudas_eur >= suma_tabla_eur
       and anexo_sha256 is not null and anexo_ruta is not null))
);
create trigger firmas_inmutable before update or delete on firmas_externas
  for each row execute function solo_insercion();

-- Revisión manual del anexo por AES (obligatoria antes de la primera asignación si hay anexo).
create table revisiones_anexo (
  id           uuid primary key default gen_random_uuid(),
  firma_id     uuid not null references firmas_externas(id),
  conforme     boolean not null,
  notas        text,
  revisado_por uuid not null references perfiles(id),
  creado_en    timestamptz not null default now()
);
create trigger revisiones_anexo_inmutable before update or delete on revisiones_anexo
  for each row execute function solo_insercion();

-- Última anotación de firma de la empresa (alta o revocación).
create or replace function firma_alta_actual(p_empresa uuid) returns firmas_externas
  language sql stable security definer set search_path = public as $$
  select * from firmas_externas where empresa_id = p_empresa
   order by greatest(firmado_en, coalesce(firmado2_en, firmado_en)) desc, creado_en desc limit 1 $$;

-- Firma del alta vigente: la última anotación es una declaración de alta (no una revocación),
-- con las dos firmas si es mancomunada, de hace menos de 12 meses y, si lleva anexo, revisada
-- por AES como conforme. Los 30 días NO caducan la firma: se renueva con la casilla.
create or replace function firma_alta_vigente(p_empresa uuid) returns boolean
  language plpgsql stable security definer set search_path = public as $$
declare f firmas_externas;
begin
  f := firma_alta_actual(p_empresa);
  if f.id is null or f.tipo <> 'declaracion_alta' then return false; end if;
  if f.regimen_administracion = 'mancomunado' and (f.firmante2_nombre is null or f.firmado2_en is null) then
    return false;
  end if;
  if greatest(f.firmado_en, coalesce(f.firmado2_en, f.firmado_en))
       < now() - make_interval(months => parametro_legal('minimis_refirma_meses')::int) then
    return false;
  end if;
  if f.con_anexo and not coalesce((select conforme from revisiones_anexo where firma_id = f.id
                                    order by creado_en desc limit 1), false) then
    return false;
  end if;
  return true;
end $$;

-- ---------------------------------------------------------------------
-- a) Catálogo de casos de uso replicables
-- ---------------------------------------------------------------------
-- Campos según «CAMPOS-Fichas-Casos-de-Uso-v1» (alianza-ceo, 19-oct).
-- Listas cerradas: sector = 19 macroáreas de AES + «Transversal».
create or replace function lista_sectores() returns text[] language sql immutable as $$
  select array['Fintech & Seguros','Salud & Bienestar','Educación','Trabajo & Personas',
    'Legal & Servicios','Inmobiliario & Construcción','Alimentación & Agro','Movilidad & Logística',
    'Turismo','Energía & Sostenibilidad','Comercio & Consumo','Software & Datos','IA & Deeptech',
    'Marketing & Medios','Industria','Deporte & Gaming','Cultura','Sector público & Impacto',
    'Telecom','Transversal'] $$;

create table casos (
  id              uuid primary key default gen_random_uuid(),
  codigo          text not null unique check (codigo ~ '^CU-([0-9]{2}|EJ[0-9]+)$'),
  titulo          text not null check (char_length(titulo) <= 80),
  resumen         text not null check (char_length(resumen) <= 300),
  sector          text not null check (sector = any (lista_sectores())),
  funcion         text not null check (funcion in ('Atención al cliente', 'Ventas y marketing',
                    'Operaciones y producción', 'Finanzas y administración', 'Personas (RR. HH.)',
                    'Logística y compras', 'Calidad y mantenimiento', 'Legal y cumplimiento')),
  tamano_objetivo text[] not null default '{}'
                  check (tamano_objetivo <@ array['startup','micro','pequena','mediana']),
  -- Contenido
  problema        text,
  solucion        text,
  tecnologias     text[] not null default '{}'
                  check (tecnologias <@ array['IA generativa (texto)','Agentes','Visión artificial','Voz',
                    'Predicción / ML clásico','Clasificación y extracción de documentos','Automatización con IA']),
  datos_necesarios text,
  requisitos      text,
  madurez_minima  smallint check (madurez_minima between 1 and 5),
  dimensiones_dmat text[] not null default '{}'   -- enlace con el diagnóstico y la hoja de ruta
                  check (dimensiones_dmat <@ array['D1','D2','D3','D4','D5','D6']),
  -- Implantación (siempre tramos orientativos, nunca precio cerrado)
  plazo_orientativo text,                         -- semanas, p. ej. «4-6 semanas»
  coste_orientativo text check (coste_orientativo in   -- mismos tramos que D1.3
                    ('Menos de 2.000 €', '2.000-10.000 €', '10.000-50.000 €', 'Más de 50.000 €')),
  esfuerzo_interno text check (esfuerzo_interno in
                    ('Menos de 40 h', '40-160 h', '160-500 h', 'Más de 500 h')),
  fases           jsonb not null default '[]'     -- [{orden, nombre, semanas, entregable}]
                  check (jsonb_typeof(fases) = 'array'),
  -- Impacto: [{nombre, unidad, como_medir_linea_base, objetivo_orientativo}]
  kpis            jsonb not null default '[]' check (jsonb_typeof(kpis) = 'array'),
  -- Replicabilidad (Red.es: ≥15 reutilizables; objetivo 18 de 36)
  replicable      boolean not null default false,
  sectores_replicables text[] not null default '{}' check (sectores_replicables <@ lista_sectores()),
  licencia_reutilizacion text,                    -- pendiente de Legal
  -- Cumplimiento
  riesgo_ai_act   text not null default 'minimo' check (riesgo_ai_act in ('minimo', 'limitado', 'alto')),
  datos_personales text not null default 'no'
                  check (datos_personales in ('no', 'si', 'categorias_especiales')),
  notas_rgpd      text,
  -- Conexión con los módulos de apoyo
  frenos_que_resuelve text[] not null default '{}' -- códigos de la pregunta X1
                  check (frenos_que_resuelve <@ array['coste','personal','datos','por_donde_empezar','rgpd']),
  creditos_aplicables text not null default 'ninguno'   -- genérico, sin marcas
                  check (creditos_aplicables in ('ninguno', 'cloud', 'tokens_ia', 'ambos')),
  -- Gestión (los campos [i] van en casos_internos, que solo ve el staff)
  estado          text not null default 'borrador'
                  check (estado in ('borrador', 'validado_alianza', 'validado_legal', 'publicado')),
  publicado       boolean generated always as (estado = 'publicado') stored,
  actualizado_en  timestamptz not null default now(),
  -- Una ficha publicada tiene que estar completa
  constraint casos_publicable check (estado <> 'publicado' or (
    problema is not null and solucion is not null and coste_orientativo is not null
    and plazo_orientativo is not null and madurez_minima is not null
    and jsonb_array_length(kpis) >= 2 and cardinality(tamano_objetivo) > 0))
);

-- Flujo de estados: borrador → validado_alianza → (validado_legal) → publicado.
-- Riesgo alto del AI Act o categorías especiales de datos: Legal obligatorio.
create or replace function casos_flujo() returns trigger language plpgsql as $$
declare previo text := case when tg_op = 'UPDATE' then old.estado else 'borrador' end;
begin
  new.actualizado_en := now();
  if new.estado = 'publicado' and previo <> 'publicado' then
    if (new.riesgo_ai_act = 'alto' or new.datos_personales = 'categorias_especiales')
       and previo <> 'validado_legal' then
      raise exception 'caso %: riesgo alto o categorías especiales: necesita «validado_legal» antes de publicar', new.codigo;
    elsif previo not in ('validado_alianza', 'validado_legal') then
      raise exception 'caso %: no se publica sin validar', new.codigo;
    end if;
  end if;
  -- Si cambia el riesgo de una ficha publicada a alto, vuelve a revisión de Legal
  if tg_op = 'UPDATE' and new.estado = 'publicado'
     and (new.riesgo_ai_act = 'alto' or new.datos_personales = 'categorias_especiales')
     and not (old.riesgo_ai_act = 'alto' or old.datos_personales = 'categorias_especiales') then
    new.estado := 'validado_alianza';
  end if;
  return new;
end $$;
create trigger casos_flujo before insert or update on casos
  for each row execute function casos_flujo();

-- [i] Datos internos: nunca se publican (ni nombres de partners ni importes).
create table casos_internos (
  caso_id             uuid primary key references casos(id) on delete cascade,
  proveedor_tipo      text check (proveedor_tipo in
                        ('integradora', 'startup_proveedora', 'consultora', 'desarrollo_propio')),
  partida_presupuesto text check (partida_presupuesto ~ '^P[1-9]$'),   -- P1-P9 del CFO
  notas               text
);

create table casos_recursos (
  id        uuid primary key default gen_random_uuid(),
  caso_id   uuid not null references casos(id) on delete cascade,
  tipo      text not null check (tipo in ('blueprint', 'guia', 'plantilla', 'video', 'codigo')),
  titulo    text not null,
  url       text not null
);

create table solicitudes_caso (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id),
  caso_id     uuid not null references casos(id),
  motivo      text,
  estado      text not null default 'recibida'
              check (estado in ('recibida', 'en_curso', 'implantado', 'descartada')),
  creado_en   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- b) Autodiagnóstico de madurez (6 dimensiones alineadas con el DMAT CE)
-- ---------------------------------------------------------------------
create table preguntas (
  id          text primary key,                  -- p. ej. D1.3
  version     smallint not null default 1,
  dimension   smallint not null check (dimension between 1 and 6),
  texto       text not null,
  tipo        text not null check (tipo in ('escala', 'unica', 'multiple', 'sino')),
  opciones    jsonb not null,                    -- [{valor, etiqueta, puntos}]
  peso        numeric(4,2) not null default 1,
  orden       smallint not null
);

create table diagnosticos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas(id),
  version_cuestionario smallint not null,
  es_linea_base boolean not null default false,  -- T0 para medir impacto
  puntuaciones  jsonb,                           -- {d1: 0-100, …}
  nivel_global  smallint check (nivel_global between 1 and 5),
  completado_en timestamptz,
  creado_en     timestamptz not null default now()
);

create table respuestas (
  diagnostico_id uuid not null references diagnosticos(id) on delete cascade,
  pregunta_id    text not null references preguntas(id),
  valor          jsonb not null,
  primary key (diagnostico_id, pregunta_id)
);

create table recomendaciones (
  id             uuid primary key default gen_random_uuid(),
  diagnostico_id uuid not null references diagnosticos(id) on delete cascade,
  caso_id        uuid references casos(id),
  horizonte      text check (horizonte in ('3m', '6m', '12m')),
  texto          text not null,
  prioridad      smallint
);

-- ---------------------------------------------------------------------
-- c) Hub de créditos cloud y tokens de IA
-- ---------------------------------------------------------------------
create table proveedores (
  id              uuid primary key default gen_random_uuid(),
  nombre_interno  text not null,                 -- marca real: SOLO staff
  nombre_publico  text not null,                 -- genérico: «Proveedor cloud A»
  tipo            text not null check (tipo in ('cloud', 'modelos_ia', 'mixto')),
  region_ue       boolean,
  dpa_firmado     boolean not null default false
);

create table programas_credito (
  id              uuid primary key default gen_random_uuid(),
  proveedor_id    uuid not null references proveedores(id),
  nombre_publico  text not null,
  tipo            text not null check (tipo in ('cloud', 'tokens')),
  modo_activacion text not null
                  check (modo_activacion in ('codigo', 'cuenta_facturacion', 'clave_api', 'enlace_alta')),
  elegibilidad    text,
  importe_max_eur numeric(12,2),
  caducidad_meses smallint,
  fuente_info     text,
  fecha_info      date,
  verificado      boolean not null default false -- «a verificar» hasta confirmarlo
);

create table lotes_credito (
  id                 uuid primary key default gen_random_uuid(),
  programa_id        uuid not null references programas_credito(id),
  miembro_receptor   text not null,              -- miembro de la agrupación que recibe la cesión
  unidades           numeric(16,4) not null,
  unidad             text not null,              -- USD, EUR, millones de tokens…
  valor_eur_tarifa   numeric(12,2) not null,     -- valor a tarifa pública
  fuente_tarifa      text not null,
  fecha_tarifa       date not null,
  documento_cesion   text,                       -- ruta en Storage (cesión en firme)
  caduca_en          date,
  estado             text not null default 'previsto'
                     check (estado in ('previsto', 'cedido', 'agotado', 'caducado'))
);

create table solicitudes_credito (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references empresas(id),
  programa_id       uuid not null references programas_credito(id),
  caso_id           uuid references casos(id),
  necesidad         text not null,
  consumo_estimado_eur numeric(12,2),
  estado            text not null default 'recibida'
                    check (estado in ('recibida', 'elegible', 'asignada', 'rechazada', 'cerrada')),
  motivo_estado     text,
  creado_en         timestamptz not null default now()
);

-- Minimis (Reg. UE 2023/2831): la ayuda nace al ASIGNAR, por el importe
-- asignado a tarifa pública. Límite: 300.000 € por empresa única en
-- cualquier periodo de 3 años, sumando créditos y servicios valorados.
-- Declaración en el alta y en CADA asignación. Conservación: 10 años.
create or replace function clave_minimis() returns text
  language plpgsql stable security definer set search_path = public as $$
declare k text;
begin
  if to_regclass('vault.decrypted_secrets') is not null then
    execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'minimis_clave'$q$
      into k;
  end if;
  k := coalesce(k, nullif(current_setting('app.minimis_clave', true), ''));
  if k is null then raise exception 'falta la clave de cifrado de minimis (Vault: minimis_clave)'; end if;
  return k;
end $$;

create table declaraciones_minimis (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references empresas(id),
  solicitud_id      uuid not null,                -- una por asignación (la del alta se firma fuera: firmas_externas)
  ayudas_otras_eur  numeric(12,2) not null check (ayudas_otras_eur >= 0), -- minimis de otras fuentes, 3 años, empresa única
  sector_excluido   boolean not null,             -- art. 1 (pesca, producción agrícola primaria…)
  -- Hechos declarados en la casilla de renovación (punto 10) y en la confirmación corta (A-bis)
  cambio_representacion boolean not null default false, -- cambia el representante o las empresas vinculadas
  ayuda_nueva_max_eur numeric(12,2) not null default 0 check (ayuda_nueva_max_eur >= 0), -- mayor ayuda nueva desde la última firma
  detalle_cifrado   bytea not null,               -- empresa única y ayudas, cifrado por columna (EUDPO)
  aceptacion_id     uuid not null references aceptaciones(id),
  declarado_por     uuid not null references perfiles(id),
  creado_en         timestamptz not null default now()
);
create trigger declaraciones_inmutable before update or delete on declaraciones_minimis
  for each row execute function solo_insercion();

create or replace function declarar_minimis(p_solicitud uuid, p_ayudas_otras numeric,
  p_sector_excluido boolean, p_detalle jsonb, p_version text, p_representa boolean,
  p_cambio_representacion boolean default false, p_ayuda_nueva_max numeric default 0)
  returns uuid language plpgsql security definer set search_path = public as $$
declare v_acept uuid; v_id uuid; v_doc text; e empresas; v_texto text;
begin
  if mi_empresa() is null then raise exception 'el usuario no tiene empresa'; end if;
  if p_solicitud is null or not exists (select 1 from solicitudes_credito
       where id = p_solicitud and empresa_id = mi_empresa()) then
    raise exception 'la solicitud no es de tu empresa';
  end if;
  select * into e from empresas where id = mi_empresa();
  select texto into v_texto from textos_legales where documento = 'minimis' and version = p_version;
  -- Documento exacto que se acepta: es el que va en el PDF y del que sale la huella
  v_doc := coalesce(v_texto, '') || E'\n\n---\n' || jsonb_pretty(jsonb_build_object(
    'empresa', e.razon_social, 'nif', e.nif, 'solicitud', p_solicitud,
    'ayudas_minimis_otras_3_anos_eur', p_ayudas_otras, 'sector_excluido', p_sector_excluido,
    'cambio_representante_o_vinculadas', coalesce(p_cambio_representacion, false),
    'mayor_ayuda_nueva_desde_ultima_firma_eur', coalesce(p_ayuda_nueva_max, 0),
    'version_texto', p_version,
    'fecha', to_char(now() at time zone 'Europe/Madrid', 'YYYY-MM-DD HH24:MI:SS')));
  v_acept := registrar_aceptacion('minimis', p_version, true, p_representa, v_doc);
  insert into declaraciones_minimis (empresa_id, solicitud_id, ayudas_otras_eur, sector_excluido,
    cambio_representacion, ayuda_nueva_max_eur, detalle_cifrado, aceptacion_id, declarado_por)
  values (mi_empresa(), p_solicitud, p_ayudas_otras, p_sector_excluido,
    coalesce(p_cambio_representacion, false), coalesce(p_ayuda_nueva_max, 0),
    pgp_sym_encrypt(p_detalle::text, clave_minimis()), v_acept, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Mancomunados: la casilla y el A-bis los aceptan LOS DOS administradores. El segundo acepta
-- el mismo documento (misma huella). Si no tiene cuenta, hay que volver a firmar en Dropbox Sign.
create table coaceptaciones_minimis (
  id             uuid primary key default gen_random_uuid(),
  declaracion_id uuid not null unique references declaraciones_minimis(id),
  aceptacion_id  uuid not null references aceptaciones(id),
  perfil_id      uuid not null references perfiles(id),
  creado_en      timestamptz not null default now()
);
create trigger coaceptaciones_inmutable before update or delete on coaceptaciones_minimis
  for each row execute function solo_insercion();

create or replace function coaceptar_minimis(p_declaracion uuid, p_representa boolean)
  returns uuid language plpgsql security definer set search_path = public as $$
declare d declaraciones_minimis; a aceptaciones; v_acept uuid; v_id uuid;
begin
  select * into d from declaraciones_minimis where id = p_declaracion;
  if d.id is null or d.empresa_id is distinct from mi_empresa() then
    raise exception 'la declaración no es de tu empresa';
  end if;
  if d.declarado_por = auth.uid() then
    raise exception 'la segunda aceptación tiene que hacerla el otro administrador mancomunado';
  end if;
  select * into a from aceptaciones where id = d.aceptacion_id;
  v_acept := registrar_aceptacion('minimis', a.version, true, p_representa, a.documento_contenido);
  insert into coaceptaciones_minimis (declaracion_id, aceptacion_id, perfil_id)
  values (d.id, v_acept, auth.uid()) returning id into v_id;
  return v_id;
end $$;

-- Servicios gratuitos valorados (formación, mentoría, PoC, diagnóstico
-- asistido): también son minimis y consumen el mismo límite.
create table servicios_valorados (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas(id),
  tipo          text not null check (tipo in ('formacion', 'mentoria', 'prueba_concepto', 'diagnostico', 'otro')),
  concepto      text not null,
  importe_eur   numeric(12,2) not null check (importe_eur > 0),  -- coste documentado por empresa
  fecha         date not null default current_date,
  declaracion_minimis_id uuid not null references declaraciones_minimis(id),
  comunicado_en timestamptz,                      -- comunicación escrita a la empresa
  registrado_por uuid references perfiles(id),
  creado_en     timestamptz not null default now()
);

create table asignaciones (
  id            uuid primary key default gen_random_uuid(),
  solicitud_id  uuid not null unique references solicitudes_credito(id),
  lote_id       uuid not null references lotes_credito(id),
  empresa_id    uuid not null references empresas(id),
  importe_eur   numeric(12,2) not null check (importe_eur > 0),
  ref_activacion_secreto uuid,                   -- id en Supabase Vault, nunca en claro
  activada_en   timestamptz,
  caduca_en     date,
  asignado_por  uuid not null references perfiles(id),
  declaracion_minimis_id uuid not null references declaraciones_minimis(id),
  comunicado_en timestamptz,                      -- comunicación escrita: importe y carácter de minimis
  creado_en     timestamptz not null default now()
);

-- Si el crédito caduca o se devuelve sin usar, se minora la ayuda
-- (y hay que reflejarlo también en el registro de minimis).
create table correcciones_minimis (
  id            uuid primary key default gen_random_uuid(),
  asignacion_id uuid not null references asignaciones(id),
  importe_eur   numeric(12,2) not null check (importe_eur < 0),
  motivo        text not null check (motivo in ('caducidad', 'devolucion', 'revocacion', 'error')),
  registrado_por uuid references perfiles(id),
  creado_en     timestamptz not null default now()
);
create trigger correcciones_inmutable before update or delete on correcciones_minimis
  for each row execute function solo_insercion();

-- Ayudas de minimis concedidas por la plataforma a cada empresa
create view ayudas_minimis as
  select empresa_id, creado_en::date as fecha, importe_eur, 'asignacion'::text as origen, id as ref
    from asignaciones
  union all
  select a.empresa_id, c.creado_en::date, c.importe_eur, 'correccion', c.id
    from correcciones_minimis c join asignaciones a on a.id = c.asignacion_id
  union all
  select empresa_id, fecha, importe_eur, 'servicio', id from servicios_valorados;

-- Bloqueo: declaración vigente de la misma empresa y tope de 300.000 €
-- Validez de la declaración de minimis. La fija Legal: hasta entonces, 30 días
-- PROVISIONALES. Se cambia con un INSERT nuevo (el histórico se conserva).
create table parametros_legales (
  clave       text not null,
  valor       text not null,
  provisional boolean not null default true,
  fuente      text,
  creado_en   timestamptz not null default now(),
  primary key (clave, creado_en)
);
create trigger parametros_inmutable before update or delete on parametros_legales
  for each row execute function solo_insercion();
insert into parametros_legales (clave, valor, provisional, fuente) values
  ('minimis_validez_dias', '30', false, 'Legal Counsel (19-oct-2026, Anexo 5-bis A): se renueva con la casilla'),
  ('minimis_refirma_meses', '12', false, 'Legal Counsel (19-oct-2026): volver a firmar a los 12 meses'),
  ('minimis_refirma_ayuda_nueva_eur', '50000', false, 'Legal Counsel (19-oct-2026): ayuda nueva de más de 50.000 €'),
  ('minimis_refirma_acumulado_eur', '240000', false, 'Legal Counsel (19-oct-2026): recibidas + nueva > 240.000 €');
create or replace function parametro_legal(p_clave text) returns text
  language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  select valor into v from parametros_legales where clave = p_clave order by creado_en desc limit 1;
  if v is null then raise exception 'falta el parámetro legal %', p_clave; end if;
  return v;
end $$;
create or replace function minimis_validez() returns interval
  language sql stable security definer set search_path = public as $$
  select make_interval(days => parametro_legal('minimis_validez_dias')::int) $$;

create or replace function minimis_comprobar() returns trigger
  language plpgsql as $$
declare d declaraciones_minimis; f firmas_externas; v_total numeric; v_fecha date := current_date;
  v_motivos text[] := '{}';
begin
  select * into d from declaraciones_minimis where id = new.declaracion_minimis_id;
  if d.empresa_id is distinct from new.empresa_id then
    raise exception 'la declaración de minimis no es de esta empresa';
  end if;
  if tg_table_name = 'asignaciones' then
    if d.solicitud_id is distinct from (to_jsonb(new)->>'solicitud_id')::uuid then
      raise exception 'cada asignación necesita su propia confirmación de minimis (A-bis de esta solicitud)';
    end if;
  else
    v_fecha := (to_jsonb(new)->>'fecha')::date;
  end if;
  if d.creado_en < now() - minimis_validez() then
    raise exception 'la declaración de minimis tiene más de % días: hay que renovarla marcando la casilla en la plataforma (no hace falta volver a firmar)',
      parametro_legal('minimis_validez_dias');
  end if;
  if d.sector_excluido then
    raise exception 'la empresa declara operar en un sector excluido del Reg. 2023/2831';
  end if;
  if not firma_alta_vigente(new.empresa_id) then
    raise exception 'no hay firma del alta vigente en Dropbox Sign (no consta, está revocada, tiene más de % meses o el anexo no lo ha revisado AES)',
      parametro_legal('minimis_refirma_meses');
  end if;
  if not exists (select 1 from copias_enviadas where aceptacion_id = d.aceptacion_id) then
    raise exception 'no consta el envío a la empresa de la copia en PDF de la declaración';
  end if;
  -- Ventana móvil de 3 años contada hacia atrás desde cada asignación (es un cálculo, no un motivo de firma)
  select coalesce(sum(importe_eur), 0) into v_total from ayudas_minimis
   where empresa_id = new.empresa_id and fecha > v_fecha - interval '3 years';
  if d.ayudas_otras_eur + v_total + new.importe_eur > 300000 then
    raise exception 'supera el límite de minimis: % € declarados + % € de la plataforma + % € nuevos > 300.000 €',
      d.ayudas_otras_eur, v_total, new.importe_eur;
  end if;
  -- Motivos tasados para volver a firmar en Dropbox Sign (los 12 meses ya los mira firma_alta_vigente).
  -- Si hay alguno, la firma vigente tiene que ser posterior a esta confirmación.
  f := firma_alta_actual(new.empresa_id);
  if d.cambio_representacion then
    v_motivos := v_motivos || 'cambia el representante o las empresas vinculadas'::text;
  end if;
  if d.ayuda_nueva_max_eur > parametro_legal('minimis_refirma_ayuda_nueva_eur')::numeric then
    v_motivos := v_motivos || format('ayuda nueva de más de %s €', parametro_legal('minimis_refirma_ayuda_nueva_eur'));
  end if;
  if d.ayudas_otras_eur + v_total + new.importe_eur > parametro_legal('minimis_refirma_acumulado_eur')::numeric then
    v_motivos := v_motivos || format('las ayudas más esta asignación superan %s €', parametro_legal('minimis_refirma_acumulado_eur'));
  end if;
  if f.regimen_administracion = 'mancomunado'
     and not exists (select 1 from coaceptaciones_minimis where declaracion_id = d.id) then
    v_motivos := v_motivos || 'falta la aceptación del segundo administrador mancomunado'::text;
  end if;
  if cardinality(v_motivos) > 0
     and least(f.firmado_en, coalesce(f.firmado2_en, f.firmado_en)) < d.creado_en then
    raise exception 'hay que volver a firmar en Dropbox Sign antes de asignar: %', array_to_string(v_motivos, '; ');
  end if;
  return new;
end $$;
create trigger asignaciones_minimis before insert on asignaciones
  for each row execute function minimis_comprobar();
create trigger servicios_minimis before insert on servicios_valorados
  for each row execute function minimis_comprobar();

create table consumos (
  id            uuid primary key default gen_random_uuid(),
  asignacion_id uuid not null references asignaciones(id),
  empresa_id    uuid not null references empresas(id),
  periodo_desde date not null,
  periodo_hasta date not null,
  importe_eur   numeric(12,2) not null,
  unidades      numeric(16,4),
  origen        text not null check (origen in ('api', 'pasarela', 'manual')),
  evidencia_id  uuid,
  cargado_por   uuid references perfiles(id),
  creado_en     timestamptz not null default now()
);

create table evidencias (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null,                     -- informe partner, factura, captura…
  ruta        text not null,                     -- Storage
  sha256      text not null,
  subido_por  uuid references perfiles(id),
  creado_en   timestamptz not null default now()
);

-- Libro de registro inmutable con cadena de hashes
create table ledger (
  n             bigserial primary key,
  ts            timestamptz not null default now(),
  tipo          text not null check (tipo in ('cesion', 'asignacion', 'activacion', 'consumo', 'cierre', 'contraasiento')),
  lote_id       uuid references lotes_credito(id),
  empresa_id    uuid references empresas(id),
  asignacion_id uuid references asignaciones(id),
  importe_eur   numeric(12,2) not null,          -- negativo en contraasientos
  corrige_n     bigint references ledger(n),
  detalle       jsonb not null default '{}',
  actor         uuid,
  hash_prev     text not null,
  hash          text not null
);

create or replace function ledger_encadenar() returns trigger
  language plpgsql as $$
declare prev text;
begin
  perform pg_advisory_xact_lock(hashtext('ledger'));
  select hash into prev from ledger order by n desc limit 1;
  new.hash_prev := coalesce(prev, 'GENESIS');
  new.ts := now();
  new.actor := auth.uid();
  new.hash := encode(digest(
      new.hash_prev || '|' || new.ts::text || '|' || new.tipo || '|' ||
      coalesce(new.lote_id::text, '') || '|' || coalesce(new.empresa_id::text, '') || '|' ||
      coalesce(new.asignacion_id::text, '') || '|' || new.importe_eur::text || '|' ||
      new.detalle::text, 'sha256'), 'hex');
  return new;
end $$;

create trigger ledger_bi before insert on ledger
  for each row execute function ledger_encadenar();

create or replace function ledger_inmutable() returns trigger
  language plpgsql as $$
begin
  raise exception 'ledger es solo de inserción: usa un contraasiento';
end $$;

create trigger ledger_no_update before update or delete on ledger
  for each row execute function ledger_inmutable();

-- Saldo disponible por lote (cedido − asignado + contraasientos)
create view saldo_lotes as
  select l.id as lote_id, l.valor_eur_tarifa,
         l.valor_eur_tarifa - coalesce(sum(a.importe_eur), 0) as disponible_eur
  from lotes_credito l
  left join asignaciones a on a.lote_id = l.id
  group by l.id;

-- ---------------------------------------------------------------------
-- d) Formación y blueprints
-- ---------------------------------------------------------------------
create table recursos (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('video', 'documento', 'blueprint', 'webinar')),
  titulo      text not null,
  descripcion text,
  url         text not null,
  duracion_min smallint,
  nivel       smallint check (nivel between 1 and 5),
  publicado   boolean not null default false
);

create table itinerarios (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null,
  descripcion text,
  recursos    uuid[] not null default '{}'
);

create table progreso (
  perfil_id   uuid not null references perfiles(id),
  recurso_id  uuid not null references recursos(id),
  empresa_id  uuid not null references empresas(id),
  completado_en timestamptz not null default now(),
  minutos     smallint,
  primary key (perfil_id, recurso_id)
);

create table mentorias (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id),
  mentor_id   uuid references perfiles(id),
  tema        text not null,
  estado      text not null default 'solicitada'
              check (estado in ('solicitada', 'programada', 'realizada', 'cancelada')),
  fecha       timestamptz,
  horas       numeric(4,1)
);

-- ---------------------------------------------------------------------
-- e) Indicadores de impacto por empresa
-- ---------------------------------------------------------------------
create table kpis_empresa (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id),
  indicador   text not null,                     -- casos implantados, horas formación…
  valor       numeric(14,2) not null,
  periodo     date not null,
  fuente      text not null default 'plataforma',
  unique (empresa_id, indicador, periodo)
);

-- ---------------------------------------------------------------------
-- Auditoría de acciones
-- ---------------------------------------------------------------------
create table audit_log (
  n         bigserial primary key,
  ts        timestamptz not null default now(),
  actor     uuid default auth.uid(),
  tabla     text not null,
  accion    text not null,
  fila_id   text,
  antes     jsonb,
  despues   jsonb
);

create or replace function auditar() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (tabla, accion, fila_id, antes, despues)
  values (tg_table_name, tg_op,
          coalesce((to_jsonb(new)->>'id'), (to_jsonb(old)->>'id')),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['empresas','perfiles','firmas_externas','revisiones_anexo','coaceptaciones_minimis','copias_enviadas','casos','casos_internos','solicitudes_caso','diagnosticos','servicios_valorados',
    'proveedores','programas_credito','lotes_credito','solicitudes_credito','asignaciones',
    'consumos','evidencias','mentorias','kpis_empresa']
  loop
    execute format('create trigger %I_audit after insert or update or delete on %I
                    for each row execute function auditar()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- RLS (políticas base; se afinan al montar las pantallas)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['empresas','perfiles','textos_legales','aceptaciones','copias_enviadas','firmas_externas',
    'revisiones_anexo','declaraciones_minimis','coaceptaciones_minimis','servicios_valorados','parametros_legales',
    'correcciones_minimis','casos','casos_internos','casos_recursos','solicitudes_caso',
    'preguntas','diagnosticos','respuestas','recomendaciones','proveedores','programas_credito',
    'lotes_credito','solicitudes_credito','asignaciones','consumos','evidencias','ledger',
    'recursos','itinerarios','progreso','mentorias','kpis_empresa','audit_log']
  loop
    execute format('alter table %I enable row level security', t);
    -- staff (gestor y auditor) lee todo
    execute format('create policy %I_staff_lee on %I for select using (es_staff())', t, t);
  end loop;
end $$;

-- Contenido público (catálogo, cuestionario, formación publicada)
create policy casos_publico on casos for select using (publicado);
create policy casos_rec_publico on casos_recursos for select
  using (exists (select 1 from casos c where c.id = caso_id and c.publicado));
create policy preguntas_publico on preguntas for select using (true);
create policy textos_publico on textos_legales for select using (true);
create policy acept_propia on aceptaciones for select using (perfil_id = auth.uid());
create policy decl_propia on declaraciones_minimis for select using (empresa_id = mi_empresa());
create policy copias_propias on copias_enviadas for select
  using (exists (select 1 from aceptaciones a where a.id = aceptacion_id and a.perfil_id = auth.uid()));
create policy firmas_propias on firmas_externas for select using (empresa_id = mi_empresa());
create policy gestor_firmas on firmas_externas for insert with check (mi_rol() = 'gestor');
create policy revisiones_propias on revisiones_anexo for select
  using (exists (select 1 from firmas_externas f where f.id = firma_id and f.empresa_id = mi_empresa()));
create policy gestor_revisiones on revisiones_anexo for insert with check (mi_rol() = 'gestor');
create policy coacept_propias on coaceptaciones_minimis for select
  using (exists (select 1 from declaraciones_minimis d where d.id = declaracion_id and d.empresa_id = mi_empresa()));
create policy serv_propios on servicios_valorados for select using (empresa_id = mi_empresa());
create policy gestor_servicios on servicios_valorados for insert with check (mi_rol() = 'gestor');
create policy gestor_correcciones on correcciones_minimis for insert with check (mi_rol() = 'gestor');
create policy gestor_textos on textos_legales for insert with check (mi_rol() = 'gestor');
create policy gestor_parametros on parametros_legales for insert with check (mi_rol() = 'gestor');
create policy recursos_publico on recursos for select using (publicado);
create policy itinerarios_publico on itinerarios for select using (true);
create policy programas_publico on programas_credito for select using (auth.uid() is not null);

-- La empresa ve y crea lo suyo
create policy empresa_propia on empresas for select using (id = mi_empresa());
create policy perfil_propio on perfiles for select using (id = auth.uid());
create policy sol_caso_propia on solicitudes_caso for all
  using (empresa_id = mi_empresa()) with check (empresa_id = mi_empresa());
create policy diag_propio on diagnosticos for all
  using (empresa_id = mi_empresa()) with check (empresa_id = mi_empresa());
create policy resp_propia on respuestas for all
  using (exists (select 1 from diagnosticos d where d.id = diagnostico_id and d.empresa_id = mi_empresa()))
  with check (exists (select 1 from diagnosticos d where d.id = diagnostico_id and d.empresa_id = mi_empresa()));
create policy reco_propia on recomendaciones for select
  using (exists (select 1 from diagnosticos d where d.id = diagnostico_id and d.empresa_id = mi_empresa()));
create policy sol_cred_propia on solicitudes_credito for select using (empresa_id = mi_empresa());
create policy sol_cred_crea on solicitudes_credito for insert
  with check (empresa_id = mi_empresa() and estado = 'recibida');
create policy asig_propia on asignaciones for select using (empresa_id = mi_empresa());
create policy consumo_propio on consumos for select using (empresa_id = mi_empresa());
create policy progreso_propio on progreso for all
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid() and empresa_id = mi_empresa());
create policy mentoria_propia on mentorias for all
  using (empresa_id = mi_empresa()) with check (empresa_id = mi_empresa());
create policy kpis_propios on kpis_empresa for select using (empresa_id = mi_empresa());

-- Solo el gestor escribe en el hub y en el ledger (el auditor nunca escribe)
create policy gestor_escribe_asig on asignaciones for insert with check (mi_rol() = 'gestor');
create policy gestor_escribe_cons on consumos for insert with check (mi_rol() = 'gestor');
create policy gestor_escribe_ledger on ledger for insert with check (mi_rol() = 'gestor');
create policy gestor_lotes on lotes_credito for all
  using (mi_rol() = 'gestor') with check (mi_rol() = 'gestor');
create policy gestor_programas on programas_credito for all
  using (mi_rol() = 'gestor') with check (mi_rol() = 'gestor');
create policy gestor_casos on casos for all
  using (mi_rol() = 'gestor') with check (mi_rol() = 'gestor');
create policy gestor_casos_int on casos_internos for all
  using (mi_rol() = 'gestor') with check (mi_rol() = 'gestor');
create policy gestor_sol_cred on solicitudes_credito for update
  using (mi_rol() = 'gestor') with check (mi_rol() = 'gestor');

-- proveedores.nombre_interno no debe salir a la empresa: la empresa
-- solo consulta programas_credito (nombre_publico); proveedores es staff.
