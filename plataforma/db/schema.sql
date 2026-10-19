-- =====================================================================
-- Plataforma AlianzaIA · Esquema de datos MVP (PostgreSQL / Supabase UE)
-- Titularidad: Asociación Española de Startups (AES), coordinadora.
-- Versión 0.1 · 19-oct-2026 · BORRADOR (no aplicado en ningún entorno)
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
  consentimiento_rgpd timestamptz not null,
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

-- ---------------------------------------------------------------------
-- a) Catálogo de casos de uso replicables
-- ---------------------------------------------------------------------
create table casos (
  id              uuid primary key default gen_random_uuid(),
  codigo          text not null unique,          -- p. ej. CU-01
  titulo          text not null,
  resumen         text not null,
  sector          text not null,
  funcion         text,                          -- atención al cliente, operaciones…
  tecnologias     text[] not null default '{}',
  madurez_minima  smallint check (madurez_minima between 1 and 5),
  replicable      boolean not null default false, -- paquete replicable (18 de 36)
  problema        text,
  solucion        text,
  requisitos      text,
  coste_orientativo text,
  plazo_orientativo text,
  kpis            jsonb not null default '[]',
  dimensiones_dmat text[] not null default '{}',  -- enlace con el diagnóstico
  publicado       boolean not null default false,
  actualizado_en  timestamptz not null default now()
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
  creado_en     timestamptz not null default now()
);

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
  foreach t in array array['empresas','perfiles','casos','solicitudes_caso','diagnosticos',
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
  foreach t in array array['empresas','perfiles','casos','casos_recursos','solicitudes_caso',
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
create policy gestor_sol_cred on solicitudes_credito for update
  using (mi_rol() = 'gestor') with check (mi_rol() = 'gestor');

-- proveedores.nombre_interno no debe salir a la empresa: la empresa
-- solo consulta programas_credito (nombre_publico); proveedores es staff.
