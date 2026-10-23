-- Plataforma AlianzaIA - extensión de espacios de datos (CRED / UNE 0087:2025)
-- Versión 0.8 · 23-oct-2026 · BORRADOR, no aplicada en producción.
-- Se ejecuta DESPUÉS de schema.sql v0.7. Los datos permanecen en origen: esta
-- capa gobierna participantes, catálogo, políticas, contratos y evidencias.

begin;

-- ---------------------------------------------------------------------------
-- Espacio, participantes, roles y ciclo de adhesión
-- ---------------------------------------------------------------------------
create table espacios_datos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  descripcion text not null,
  sector text not null,
  promotor_empresa_id uuid references empresas(id),
  autoridad_gobierno text,
  operador text,
  jurisdiccion text not null default 'ES/UE',
  web_publica text,
  contacto_publico text,
  modelo_negocio_version text,
  gobernanza_version text,
  arquitectura_version text,
  plan_sostenibilidad_version text,
  estado text not null default 'diseno'
    check (estado in ('diseno','piloto','operativo','suspendido','cerrado')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table participantes_espacio (
  id uuid primary key default gen_random_uuid(),
  espacio_id uuid not null references espacios_datos(id),
  empresa_id uuid references empresas(id),
  nombre_legal text not null,
  identificador_legal text,
  identificador_did text,
  pais text not null default 'ES',
  web text,
  resumen_caso_uso text,
  tema_propuesto text,
  encaje_preliminar text check (encaje_preliminar in ('alto','medio','bajo','sin_evaluar')),
  origen text not null default 'alta_plataforma',
  referencia_origen text,
  estado text not null default 'candidato'
    check (estado in ('candidato','solicitante','en_revision','activo','suspendido','baja','rechazado')),
  validado_por uuid references perfiles(id),
  validado_en timestamptz,
  creado_en timestamptz not null default now(),
  unique (espacio_id, empresa_id),
  unique (espacio_id, origen, referencia_origen),
  check (estado <> 'activo' or (identificador_legal is not null and validado_en is not null))
);

-- Pre-onboarding separado: una conexión comercial no crea membresía ni acceso.
-- No se guardan emails ni teléfonos en este repositorio; la referencia apunta al CRM.
create table candidatos_participante (
  id uuid primary key default gen_random_uuid(),
  espacio_id uuid references espacios_datos(id),
  nombre_declarado text,
  dominio text,
  web text,
  resumen_caso_uso text,
  tema_propuesto text,
  encaje_preliminar text check (encaje_preliminar in ('alto','medio','bajo','sin_evaluar')),
  sistema_origen text not null,
  referencia_origen text not null,
  estado_revision text not null default 'pendiente'
    check (estado_revision in ('pendiente','requiere_revision','validado','descartado','convertido')),
  participante_id uuid references participantes_espacio(id),
  creado_en timestamptz not null default now(),
  revisado_en timestamptz,
  revisado_por uuid references perfiles(id),
  unique (sistema_origen, referencia_origen),
  check (estado_revision <> 'convertido' or participante_id is not null)
);

create table roles_participante (
  participante_id uuid not null references participantes_espacio(id),
  rol text not null check (rol in
    ('promotor','autoridad_gobierno','operador','productor','proveedor','consumidor','intermediario','auditor')),
  vigente_desde timestamptz not null default now(),
  vigente_hasta timestamptz,
  aprobado_por uuid references perfiles(id),
  primary key (participante_id, rol, vigente_desde),
  check (vigente_hasta is null or vigente_hasta > vigente_desde)
);

create table adhesiones_espacio (
  id uuid primary key default gen_random_uuid(),
  participante_id uuid not null references participantes_espacio(id),
  version_reglas text not null,
  documento_sha256 text not null check (length(documento_sha256) = 64),
  evidencia_id uuid references evidencias(id),
  estado text not null default 'solicitada'
    check (estado in ('solicitada','en_revision','aceptada','rechazada','revocada','baja')),
  solicitada_en timestamptz not null default now(),
  resuelta_en timestamptz,
  resuelta_por uuid references perfiles(id),
  motivo text,
  check ((estado in ('aceptada','rechazada','revocada','baja')) = (resuelta_en is not null))
);

create table credenciales_participante (
  id uuid primary key default gen_random_uuid(),
  participante_id uuid not null references participantes_espacio(id),
  sujeto text not null,
  tipo text not null check (tipo in ('oidc','x509','did','vc','api_client')),
  emisor text not null,
  huella text not null,
  emitida_en timestamptz,
  expira_en timestamptz,
  revocada_en timestamptz,
  metadatos jsonb not null default '{}',
  unique (tipo, emisor, huella)
);

-- ---------------------------------------------------------------------------
-- Catálogo DCAT-AP, calidad, distribuciones y conectores
-- ---------------------------------------------------------------------------
create table vocabularios_espacio (
  id uuid primary key default gen_random_uuid(),
  espacio_id uuid not null references espacios_datos(id),
  nombre text not null,
  uri text not null,
  version text not null,
  sha256 text check (sha256 is null or length(sha256) = 64),
  vigente boolean not null default true,
  unique (espacio_id, uri, version)
);

create table productos_datos (
  id uuid primary key default gen_random_uuid(),
  espacio_id uuid not null references espacios_datos(id),
  proveedor_id uuid not null references participantes_espacio(id),
  identificador_uri text not null,
  titulo text not null,
  descripcion text not null,
  version text not null,
  temas text[] not null default '{}',
  palabras_clave text[] not null default '{}',
  idioma text[] not null default array['es'],
  cobertura_espacial text,
  inicio_periodo date,
  fin_periodo date,
  frecuencia_actualizacion text,
  derechos_titular text not null,
  licencia_uri text,
  nivel_acceso text not null default 'restringido'
    check (nivel_acceso in ('publico','registrado','restringido','confidencial')),
  contiene_datos_personales boolean not null default false,
  contiene_categorias_especiales boolean not null default false,
  base_juridica text,
  finalidad_permitida text,
  procedencia text not null,
  conservacion text,
  conforms_to text[] not null default array['DCAT-AP'],
  metadatos_jsonld jsonb not null default '{}',
  estado text not null default 'borrador'
    check (estado in ('borrador','revision','publicado','retirado','suspendido')),
  publicado_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (espacio_id, identificador_uri, version),
  check (not contiene_categorias_especiales or contiene_datos_personales),
  check (estado <> 'publicado' or publicado_en is not null),
  check (not contiene_datos_personales or base_juridica is not null)
);

create table metricas_calidad_dato (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos_datos(id),
  dimension text not null check (dimension in
    ('exactitud','completitud','consistencia','actualidad','unicidad','validez','disponibilidad')),
  valor numeric(10,4) not null,
  unidad text not null,
  metodo text not null,
  medida_en timestamptz not null default now(),
  evidencia_id uuid references evidencias(id)
);

create table conectores_datos (
  id uuid primary key default gen_random_uuid(),
  espacio_id uuid not null references espacios_datos(id),
  participante_id uuid not null references participantes_espacio(id),
  nombre text not null,
  tipo text not null check (tipo in ('api','edc','ids','fiware','simpl','sftp','descarga','consulta_federada')),
  endpoint text,
  especificacion_uri text,
  version text,
  autenticacion text not null,
  cifrado_transito text not null,
  estado text not null default 'pruebas'
    check (estado in ('pruebas','activo','degradado','suspendido','retirado')),
  ultima_prueba_en timestamptz,
  evidencia_prueba_id uuid references evidencias(id),
  unique (espacio_id, participante_id, nombre)
);

create table distribuciones_datos (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos_datos(id),
  conector_id uuid references conectores_datos(id),
  titulo text not null,
  formato text not null,
  media_type text,
  access_url text,
  download_url text,
  servicio_acceso text,
  checksum_algoritmo text default 'SHA-256',
  checksum text,
  esquema_uri text,
  openapi_uri text,
  disponibilidad_objetivo numeric(5,2) check (disponibilidad_objetivo between 0 and 100),
  estado text not null default 'borrador'
    check (estado in ('borrador','activo','suspendido','retirado')),
  check (access_url is not null or download_url is not null or servicio_acceso is not null)
);

-- Vista pública interoperable. No expone endpoints restringidos ni datos en origen.
create view catalogo_dcat_ap with (security_invoker = true) as
select p.id, p.identificador_uri as identifier, p.titulo as title, p.descripcion as description,
       p.temas as theme, p.palabras_clave as keyword, p.idioma as language,
       p.derechos_titular as rights_holder, p.licencia_uri as license,
       p.nivel_acceso as access_rights, p.conforms_to,
       jsonb_build_object(
         '@context','https://www.w3.org/ns/dcat.jsonld', '@type','dcat:Dataset',
         '@id',p.identificador_uri, 'dct:title',p.titulo, 'dct:description',p.descripcion,
         'dct:license',p.licencia_uri, 'dct:conformsTo',to_jsonb(p.conforms_to)
       ) || p.metadatos_jsonld as jsonld
from productos_datos p where p.estado = 'publicado';

-- ---------------------------------------------------------------------------
-- Políticas ODRL, contratos, autorización y transacciones
-- ---------------------------------------------------------------------------
create table politicas_uso_datos (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos_datos(id),
  version text not null,
  odrl_jsonld jsonb not null,
  licencia_uri text,
  finalidades text[] not null default '{}',
  prohibiciones text[] not null default '{}',
  obligaciones text[] not null default '{}',
  retencion_dias int check (retencion_dias is null or retencion_dias >= 0),
  territorio text,
  transferencias_ulteriores boolean not null default false,
  texto_legible text not null,
  sha256 text generated always as (encode(digest(odrl_jsonld::text || texto_legible, 'sha256'),'hex')) stored,
  vigente_desde timestamptz not null default now(),
  vigente_hasta timestamptz,
  unique (producto_id, version),
  check (jsonb_typeof(odrl_jsonld) = 'object'),
  check (vigente_hasta is null or vigente_hasta > vigente_desde)
);

create table contratos_datos (
  id uuid primary key default gen_random_uuid(),
  espacio_id uuid not null references espacios_datos(id),
  producto_id uuid not null references productos_datos(id),
  politica_id uuid not null references politicas_uso_datos(id),
  proveedor_id uuid not null references participantes_espacio(id),
  consumidor_id uuid not null references participantes_espacio(id),
  version text not null,
  documento_sha256 text not null check (length(documento_sha256) = 64),
  evidencia_id uuid references evidencias(id),
  estado text not null default 'propuesto'
    check (estado in ('propuesto','aceptado','activo','suspendido','resuelto','expirado')),
  aceptado_proveedor_en timestamptz,
  aceptado_consumidor_en timestamptz,
  vigente_desde timestamptz,
  vigente_hasta timestamptz,
  creado_en timestamptz not null default now(),
  unique (producto_id, proveedor_id, consumidor_id, version),
  check (proveedor_id <> consumidor_id),
  check (estado not in ('aceptado','activo') or
         (aceptado_proveedor_en is not null and aceptado_consumidor_en is not null)),
  check (estado <> 'activo' or vigente_desde is not null)
);

create table autorizaciones_datos (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos_datos(id),
  distribucion_id uuid not null references distribuciones_datos(id),
  consumidor_id uuid not null references participantes_espacio(id),
  alcance text[] not null,
  finalidad text not null,
  emitida_en timestamptz not null default now(),
  expira_en timestamptz,
  revocada_en timestamptz,
  emitida_por uuid references perfiles(id),
  unique (contrato_id, distribucion_id, consumidor_id)
);

create table transacciones_datos (
  n bigserial primary key,
  id uuid not null unique default gen_random_uuid(),
  espacio_id uuid not null references espacios_datos(id),
  contrato_id uuid not null references contratos_datos(id),
  autorizacion_id uuid not null references autorizaciones_datos(id),
  distribucion_id uuid not null references distribuciones_datos(id),
  proveedor_id uuid not null references participantes_espacio(id),
  consumidor_id uuid not null references participantes_espacio(id),
  tipo text not null check (tipo in ('transferencia','descarga','consulta','ejecucion_algoritmo','servicio')),
  estado text not null check (estado in ('autorizada','iniciada','completada','denegada','fallida')),
  motivo text,
  bytes_transferidos bigint check (bytes_transferidos is null or bytes_transferidos >= 0),
  checksum_resultado text,
  correlacion text not null,
  iniciada_en timestamptz,
  finalizada_en timestamptz,
  detalle jsonb not null default '{}',
  hash_prev text not null,
  hash text not null,
  creado_en timestamptz not null default now(),
  unique (espacio_id, correlacion),
  check (proveedor_id <> consumidor_id),
  check (finalizada_en is null or iniciada_en is null or finalizada_en >= iniciada_en)
);

create or replace function transaccion_encadenar() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_prev text;
begin
  perform pg_advisory_xact_lock(hashtext('transacciones_datos:' || new.espacio_id::text));
  select hash into v_prev from transacciones_datos
   where espacio_id = new.espacio_id order by n desc limit 1;
  new.hash_prev := coalesce(v_prev, 'GENESIS');
  new.hash := encode(digest(new.hash_prev || '|' || new.id::text || '|' ||
    new.contrato_id::text || '|' || new.proveedor_id::text || '|' ||
    new.consumidor_id::text || '|' || new.tipo || '|' || new.estado || '|' ||
    new.correlacion || '|' || new.creado_en::text || '|' || new.detalle::text, 'sha256'),'hex');
  return new;
end $$;
create trigger transacciones_encadenar before insert on transacciones_datos
  for each row execute function transaccion_encadenar();
create trigger transacciones_inmutables before update or delete on transacciones_datos
  for each row execute function solo_insercion();

-- Única puerta para iniciar intercambios: comprueba membresía, producto,
-- distribución, contrato, autorización y vigencia antes de dejar una traza.
create or replace function solicitar_transaccion(
  p_autorizacion uuid, p_tipo text, p_correlacion text, p_detalle jsonb default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare a autorizaciones_datos; c contratos_datos; d distribuciones_datos;
        p productos_datos; v_id uuid; v_proveedor participantes_espacio; v_consumidor participantes_espacio;
begin
  select * into a from autorizaciones_datos where id = p_autorizacion;
  if not found or a.revocada_en is not null or (a.expira_en is not null and a.expira_en <= now()) then
    raise exception 'autorización inexistente, revocada o caducada';
  end if;
  select * into c from contratos_datos where id = a.contrato_id;
  select * into d from distribuciones_datos where id = a.distribucion_id;
  select * into p from productos_datos where id = c.producto_id;
  select * into v_proveedor from participantes_espacio where id = c.proveedor_id;
  select * into v_consumidor from participantes_espacio where id = c.consumidor_id;
  if c.estado <> 'activo' or c.vigente_desde > now() or
     (c.vigente_hasta is not null and c.vigente_hasta <= now()) then
    raise exception 'contrato no activo o fuera de vigencia';
  end if;
  if p.estado <> 'publicado' or d.estado <> 'activo' then
    raise exception 'producto o distribución no disponibles';
  end if;
  if v_proveedor.estado <> 'activo' or v_consumidor.estado <> 'activo' then
    raise exception 'proveedor o consumidor no activos';
  end if;
  if a.consumidor_id <> c.consumidor_id or d.producto_id <> c.producto_id then
    raise exception 'autorización incoherente con el contrato';
  end if;
  insert into transacciones_datos(espacio_id,contrato_id,autorizacion_id,distribucion_id,
    proveedor_id,consumidor_id,tipo,estado,correlacion,detalle,hash_prev,hash)
  values(c.espacio_id,c.id,a.id,d.id,c.proveedor_id,c.consumidor_id,p_tipo,'autorizada',
    p_correlacion,coalesce(p_detalle,'{}'),'PENDIENTE','PENDIENTE') returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Gobernanza, incidencias y matriz binaria de los 23 criterios CRED
-- ---------------------------------------------------------------------------
create table incidencias_gobernanza (
  id uuid primary key default gen_random_uuid(),
  espacio_id uuid not null references espacios_datos(id),
  participante_id uuid references participantes_espacio(id),
  tipo text not null check (tipo in ('consulta','reclamacion','conflicto','incumplimiento','seguridad','privacidad')),
  resumen text not null,
  estado text not null default 'abierta'
    check (estado in ('abierta','en_revision','resuelta','desestimada','escalada')),
  abierta_en timestamptz not null default now(),
  cerrada_en timestamptz,
  resolucion text,
  evidencia_id uuid references evidencias(id),
  check ((estado in ('resuelta','desestimada')) = (cerrada_en is not null))
);

create table criterios_cred (
  codigo text primary key,
  dimension text not null check (dimension in
    ('modelo_negocio','gobernanza','tecnica_seguridad','interoperabilidad','funcional')),
  orden smallint not null unique,
  criterio text not null,
  evidencia_sugerida text not null,
  version_fuente text not null default 'Guía CRED v1 17-11-2025'
);

insert into criterios_cred(codigo,dimension,orden,criterio,evidencia_sugerida) values
('Neg.1','modelo_negocio',1,'Modelo de negocio documentado con objetivos, propuesta de valor, participantes y fuentes de ingresos','Plan de negocio, memoria estratégica o equivalente'),
('Neg.2','modelo_negocio',2,'Participantes y roles identificados: proveedores, consumidores, operadores y autoridad de gobierno','Organigrama, estatutos o documentación de gobernanza'),
('Neg.3','modelo_negocio',3,'Plan de sostenibilidad o escalado que garantice continuidad y nuevos participantes','Planificación o estrategia de crecimiento'),
('Gob.1','gobernanza',4,'Constitución formal de la autoridad de gobierno','Estatuto, acta o documentación constitutiva'),
('Gob.2','gobernanza',5,'Marco de gobernanza documentado con reglas, roles y responsabilidades','Libro de reglas, reglamento interno o equivalente'),
('Gob.3','gobernanza',6,'Procedimientos documentados de adhesión, permanencia y salida','Formularios, contratos, procesos publicados o registros'),
('Gob.4','gobernanza',7,'Mecanismos de resolución de conflictos y rendición de cuentas','Protocolo de incidencias, reclamaciones y control'),
('Gob.5','gobernanza',8,'Portal o repositorio de transparencia accesible','URL o repositorio de políticas e informes'),
('Tec.1','tecnica_seguridad',9,'Arquitectura técnica definida y documentada','Diagrama, documentación técnica o ficha de diseño'),
('Tec.2','tecnica_seguridad',10,'Identificación y autenticación de participantes y servicios','Identidad digital, credenciales verificables y logs'),
('Tec.3','tecnica_seguridad',11,'Catálogo estructurado para publicar y descubrir datos y servicios','Catálogo DCAT/DCAT-AP operativo'),
('Tec.4','tecnica_seguridad',12,'Mecanismos de transferencia y control con integridad y trazabilidad','Conectores, registros y logs de validación'),
('Tec.5','tecnica_seguridad',13,'Medidas de seguridad y privacidad, cifrado, aislamiento y control de acceso conforme al RGPD','Políticas, controles y registros de privacidad'),
('Tec.6','tecnica_seguridad',14,'Mecanismos de cumplimiento y auditoría trazable','Logs, informes y certificaciones'),
('Int.1','interoperabilidad',15,'Capacidades digitales para transferencia disponible y controlada','Pruebas de descarga, API o conector y protocolos'),
('Int.2','interoperabilidad',16,'Autenticación, autorización y registro para acceso solo de participantes acreditados','Flujos de identidad, autorización y logs'),
('Int.3','interoperabilidad',17,'Control de reglas, políticas y contratos antes de cada transferencia','Validaciones y denegaciones registradas'),
('Int.4','interoperabilidad',18,'Protocolos y especificaciones interoperables','DCAT-AP, RDF, JSON-LD, OpenAPI, IDS-RAM o equivalentes'),
('Int.5','interoperabilidad',19,'Registro íntegro, trazable y no repudiable de transacciones','Logs encadenados, observabilidad y auditorías'),
('Fun.1','funcional',20,'Evidencia funcional de adhesión de un participante','Registro o demostración del alta'),
('Fun.2','funcional',21,'Evidencia funcional de publicación en catálogo','Registro o demostración de publicación'),
('Fun.3','funcional',22,'Evidencia funcional de consulta o descubrimiento','Registro de búsqueda o demostración'),
('Fun.4','funcional',23,'Evidencia de transacción efectiva entre participantes','Logs, contrato ejecutado, API o registro de intercambio');

create table evidencias_cred (
  id uuid primary key default gen_random_uuid(),
  espacio_id uuid not null references espacios_datos(id),
  criterio_codigo text not null references criterios_cred(codigo),
  tipo text not null check (tipo in ('documental','tecnica','observable')),
  titulo text not null,
  uri text not null,
  sha256 text not null check (length(sha256) = 64),
  emitida_en timestamptz not null,
  vigente_hasta timestamptz,
  registrada_por uuid references perfiles(id),
  registrada_en timestamptz not null default now(),
  check (vigente_hasta is null or vigente_hasta > emitida_en)
);
create trigger evidencias_cred_inmutables before update or delete on evidencias_cred
  for each row execute function solo_insercion();

create table evaluaciones_cred (
  id uuid primary key default gen_random_uuid(),
  espacio_id uuid not null references espacios_datos(id),
  criterio_codigo text not null references criterios_cred(codigo),
  cumple boolean not null,
  justificacion text not null,
  evaluada_por uuid references perfiles(id),
  evaluada_en timestamptz not null default now(),
  evidencia_id uuid references evidencias_cred(id),
  sustituye_a uuid references evaluaciones_cred(id),
  check (not cumple or evidencia_id is not null)
);
create trigger evaluaciones_cred_inmutables before update or delete on evaluaciones_cred
  for each row execute function solo_insercion();

create view estado_conformidad_cred with (security_invoker = true) as
with vigentes as (
  select distinct on (espacio_id, criterio_codigo) * from evaluaciones_cred
  order by espacio_id, criterio_codigo, evaluada_en desc
)
select e.id as espacio_id, count(v.criterio_codigo) as evaluados,
       count(*) filter (where v.cumple) as cumplidos,
       23 - count(*) filter (where v.cumple) as pendientes,
       count(*) filter (where v.cumple) = 23 as conforme
from espacios_datos e left join vigentes v on v.espacio_id=e.id group by e.id;

-- ---------------------------------------------------------------------------
-- RLS, auditoría y permisos por propietario/consumidor
-- ---------------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array[
    'espacios_datos','participantes_espacio','candidatos_participante','roles_participante','adhesiones_espacio',
    'credenciales_participante','vocabularios_espacio','productos_datos','metricas_calidad_dato',
    'conectores_datos','distribuciones_datos','politicas_uso_datos','contratos_datos',
    'autorizaciones_datos','transacciones_datos','incidencias_gobernanza','criterios_cred',
    'evidencias_cred','evaluaciones_cred']
  loop
    execute format('alter table %I enable row level security',t);
    execute format('create policy %I_staff_lee on %I for select using (es_staff())',t,t);
  end loop;
end $$;

create policy espacios_publicos on espacios_datos for select using (estado in ('piloto','operativo'));
create policy criterios_publicos on criterios_cred for select using (true);
create policy productos_publicados on productos_datos for select using (estado='publicado');
create policy distribuciones_publicadas on distribuciones_datos for select using (
  exists(select 1 from productos_datos p where p.id=producto_id and p.estado='publicado'));
create policy participante_ve_su_ficha on participantes_espacio for select using (empresa_id=mi_empresa());
create policy participante_ve_sus_roles on roles_participante for select using (
  exists(select 1 from participantes_espacio p where p.id=participante_id and p.empresa_id=mi_empresa()));
create policy participante_ve_su_adhesion on adhesiones_espacio for select using (
  exists(select 1 from participantes_espacio p where p.id=participante_id and p.empresa_id=mi_empresa()));
create policy proveedor_gestiona_producto on productos_datos for all using (
  exists(select 1 from participantes_espacio pe where pe.id=proveedor_id and pe.empresa_id=mi_empresa()))
  with check (exists(select 1 from participantes_espacio pe where pe.id=proveedor_id and pe.empresa_id=mi_empresa()));
create policy partes_ven_contrato on contratos_datos for select using (
  exists(select 1 from participantes_espacio p where p.id in (proveedor_id,consumidor_id) and p.empresa_id=mi_empresa()));
create policy partes_ven_transaccion on transacciones_datos for select using (
  exists(select 1 from participantes_espacio p where p.id in (proveedor_id,consumidor_id) and p.empresa_id=mi_empresa()));
create policy participante_crea_incidencia on incidencias_gobernanza for insert with check (
  participante_id is null or exists(select 1 from participantes_espacio p where p.id=participante_id and p.empresa_id=mi_empresa()));
create policy participante_ve_incidencia on incidencias_gobernanza for select using (
  exists(select 1 from participantes_espacio p where p.id=participante_id and p.empresa_id=mi_empresa()));

do $$ declare t text; begin
  foreach t in array array['espacios_datos','participantes_espacio','candidatos_participante','roles_participante','adhesiones_espacio',
    'credenciales_participante','vocabularios_espacio','productos_datos','metricas_calidad_dato',
    'conectores_datos','distribuciones_datos','politicas_uso_datos','contratos_datos',
    'autorizaciones_datos','incidencias_gobernanza','evidencias_cred','evaluaciones_cred']
  loop
    execute format('create policy %I_gestor_escribe on %I for all using (mi_rol()=''gestor'') with check (mi_rol()=''gestor'')',t,t);
    execute format('create trigger %I_audit after insert or update or delete on %I for each row execute function auditar()',t,t);
  end loop;
end $$;

create policy gestor_inserta_transaccion on transacciones_datos for insert with check (mi_rol()='gestor');

comment on table productos_datos is 'Catálogo DCAT-AP: metadatos y condiciones; los datos permanecen en el sistema de origen.';
comment on function solicitar_transaccion is 'Policy enforcement point: no deja iniciar una transferencia sin contrato, autorización, miembros y distribución vigentes.';

commit;
