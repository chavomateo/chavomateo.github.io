-- AlianzaIA Data Spaces v0.9
-- Casos de uso, matching explicable, solicitudes y eventos de flujo.
-- Aplicar después de schema.sql y dataspaces-v0.8.sql. No despliega ni activa participantes.

begin;

create table casos_uso_datos (
  id uuid primary key default gen_random_uuid(),
  espacio_id uuid not null references espacios_datos(id),
  codigo text not null,
  titulo text not null,
  reto text not null,
  resultado_esperado text not null,
  kpis jsonb not null default '[]',
  estado text not null default 'borrador'
    check (estado in ('borrador','validacion','piloto','completado','cancelado')),
  etiqueta_simulacion boolean not null default true,
  responsable_id uuid references participantes_espacio(id),
  creado_por uuid references perfiles(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (espacio_id,codigo),
  check (jsonb_typeof(kpis)='array')
);

create table productos_caso_uso (
  caso_id uuid not null references casos_uso_datos(id) on delete cascade,
  producto_id uuid not null references productos_datos(id),
  finalidad text not null,
  requerido boolean not null default true,
  primary key (caso_id,producto_id)
);

create table matches_caso_candidato (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references casos_uso_datos(id) on delete cascade,
  candidato_id uuid not null references candidatos_participante(id),
  puntuacion numeric(5,2) not null check (puntuacion between 0 and 100),
  explicacion jsonb not null default '[]',
  estado text not null default 'sugerido'
    check (estado in ('sugerido','revisado','descartado','invitado','aceptado')),
  revisado_por uuid references perfiles(id),
  revisado_en timestamptz,
  unique (caso_id,candidato_id),
  check (jsonb_typeof(explicacion)='array'),
  check ((estado='sugerido' and revisado_en is null) or estado<>'sugerido')
);

create table solicitudes_acceso_datos (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos_datos(id),
  consumidor_id uuid not null references participantes_espacio(id),
  caso_id uuid references casos_uso_datos(id),
  finalidad text not null,
  alcance text[] not null,
  estado text not null default 'borrador' check (estado in
    ('borrador','enviada','informacion_requerida','evaluacion','condiciones','firma','activa','suspendida','revocada','caducada','denegada')),
  motivo_estado text,
  responsable_id uuid references perfiles(id),
  siguiente_accion text,
  plazo_objetivo timestamptz,
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  check (estado not in ('denegada','suspendida','revocada') or motivo_estado is not null)
);

create table eventos_flujo_datos (
  n bigserial primary key,
  id uuid not null unique default gen_random_uuid(),
  espacio_id uuid not null references espacios_datos(id),
  flujo_id text not null,
  tipo text not null check (tipo in ('adhesion','publicacion','solicitud','politica','contrato','transferencia','resultado','evidencia','incidencia')),
  estado text not null,
  actor_id uuid references participantes_espacio(id),
  objeto_tipo text not null,
  objeto_id uuid,
  detalle jsonb not null default '{}',
  hash_prev text not null,
  hash text not null,
  creado_en timestamptz not null default now(),
  unique (espacio_id,flujo_id,n)
);

create or replace function evento_flujo_encadenar() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_prev text;
begin
  perform pg_advisory_xact_lock(hashtext('eventos_flujo:'||new.espacio_id::text||':'||new.flujo_id));
  select hash into v_prev from eventos_flujo_datos
    where espacio_id=new.espacio_id and flujo_id=new.flujo_id order by n desc limit 1;
  new.hash_prev:=coalesce(v_prev,'GENESIS');
  new.hash:=encode(digest(new.hash_prev||'|'||new.id::text||'|'||new.flujo_id||'|'||new.tipo||'|'||new.estado||'|'||new.objeto_tipo||'|'||coalesce(new.objeto_id::text,'')||'|'||new.detalle::text||'|'||new.creado_en::text,'sha256'),'hex');
  return new;
end $$;
create trigger eventos_flujo_encadenar before insert on eventos_flujo_datos for each row execute function evento_flujo_encadenar();
create trigger eventos_flujo_inmutables before update or delete on eventos_flujo_datos for each row execute function solo_insercion();

do $$ declare t text; begin
  foreach t in array array['casos_uso_datos','productos_caso_uso','matches_caso_candidato','solicitudes_acceso_datos','eventos_flujo_datos'] loop
    execute format('alter table %I enable row level security',t);
    execute format('create policy %I_staff_lee on %I for select using (es_staff())',t,t);
  end loop;
end $$;
create policy casos_piloto_publicos on casos_uso_datos for select using (estado in ('piloto','completado'));
create policy productos_casos_publicos on productos_caso_uso for select using (
  exists(select 1 from casos_uso_datos c where c.id=caso_id and c.estado in ('piloto','completado')));
create policy consumidor_ve_solicitud on solicitudes_acceso_datos for select using (
  exists(select 1 from participantes_espacio p where p.id=consumidor_id and p.empresa_id=mi_empresa()));
create policy partes_ven_eventos on eventos_flujo_datos for select using (
  actor_id is null or exists(select 1 from participantes_espacio p where p.id=actor_id and p.empresa_id=mi_empresa()));

do $$ declare t text; begin
  foreach t in array array['casos_uso_datos','productos_caso_uso','matches_caso_candidato','solicitudes_acceso_datos'] loop
    execute format('create policy %I_gestor_escribe on %I for all using (mi_rol()=''gestor'') with check (mi_rol()=''gestor'')',t,t);
    execute format('create trigger %I_audit after insert or update or delete on %I for each row execute function auditar()',t,t);
  end loop;
end $$;
create policy gestor_inserta_evento on eventos_flujo_datos for insert with check (mi_rol()='gestor');

comment on table casos_uso_datos is 'Reto, productos, resultado, KPI y evidencia: unidad de valor del espacio.';
comment on table matches_caso_candidato is 'Sugerencias explicables; nunca validan participantes ni autorizan acceso.';
comment on table eventos_flujo_datos is 'Timeline append-only que reconstruye decisiones y evidencias por flujo.';

commit;
