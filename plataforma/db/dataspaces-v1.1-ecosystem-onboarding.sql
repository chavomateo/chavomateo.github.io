-- AlianzaIA Data Spaces v1.1 - alta de actores y publicacion federada.
-- Apply after dataspaces-v1.0-hardening.sql.

begin;

create table solicitudes_alta_ecosistema (
  id uuid primary key default gen_random_uuid(),
  solicitante_perfil_id uuid not null default auth.uid() references perfiles(id),
  empresa_id uuid not null default mi_empresa() references empresas(id),
  espacio_id uuid references espacios_datos(id),
  tipo_principal text not null check (tipo_principal in (
    'espacio_datos','proveedor_servicios_ia','startup','pyme',
    'empresa_tractora','investigador','administracion_publica')),
  capacidades text[] not null default '{}'
    check (capacidades <@ array['consumir_datos','publicar_datasets','publicar_apis',
      'publicar_servicios_ia','proponer_retos','investigar','operar_espacio']::text[]),
  nombre_declarado text not null,
  identificador_legal text,
  pais text not null default 'ES',
  web text,
  descripcion text not null,
  catalogo_dcat_url text,
  estado text not null default 'borrador'
    check (estado in ('borrador','enviada','en_revision','requiere_subsanacion',
      'aprobada','rechazada','retirada')),
  enviada_en timestamptz,
  resuelta_en timestamptz,
  revisada_por uuid references perfiles(id),
  motivo_revision text,
  participante_id uuid references participantes_espacio(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check ('publicar_datasets' <> all(capacidades) or identificador_legal is not null),
  check (tipo_principal <> 'espacio_datos' or 'operar_espacio' = any(capacidades)),
  check (estado <> 'enviada' or enviada_en is not null),
  check (estado not in ('aprobada','rechazada') or resuelta_en is not null),
  check (estado <> 'aprobada' or participante_id is not null)
);

create unique index solicitudes_alta_ecosistema_abiertas
  on solicitudes_alta_ecosistema(empresa_id,tipo_principal)
  where estado in ('borrador','enviada','en_revision','requiere_subsanacion');

create table tipos_actor_participante (
  participante_id uuid not null references participantes_espacio(id) on delete cascade,
  tipo text not null check (tipo in (
    'espacio_datos','proveedor_servicios_ia','startup','pyme',
    'empresa_tractora','investigador','administracion_publica')),
  verificado boolean not null default false,
  evidencia_id uuid references evidencias(id),
  aprobado_por uuid references perfiles(id),
  aprobado_en timestamptz,
  primary key (participante_id,tipo),
  check (not verificado or (aprobado_por is not null and aprobado_en is not null))
);

create table catalogos_federados (
  id uuid primary key default gen_random_uuid(),
  espacio_id uuid not null references espacios_datos(id),
  participante_id uuid not null references participantes_espacio(id),
  titulo text not null,
  endpoint_url text not null,
  protocolo text not null check (protocolo in ('dcat_ap','json_ld','ckan','openapi','manual')),
  modo text not null default 'enlazado' check (modo in ('enlazado','harvest','manual')),
  version_perfil text,
  licencia_metadatos_uri text,
  estado text not null default 'borrador'
    check (estado in ('borrador','revision','activo','suspendido','retirado')),
  ultima_sincronizacion timestamptz,
  ultimo_error text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (espacio_id,endpoint_url)
);

alter table productos_datos
  add column catalogo_origen_id uuid references catalogos_federados(id),
  add column tipo_producto text not null default 'dataset'
    check (tipo_producto in ('dataset','api','servicio_ia','modelo_ia','algoritmo'));

create table solicitudes_publicacion_datos (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos_datos(id),
  solicitante_perfil_id uuid not null default auth.uid() references perfiles(id),
  declara_derechos boolean not null,
  declara_calidad boolean not null,
  declara_condiciones_uso boolean not null,
  estado text not null default 'enviada'
    check (estado in ('enviada','en_revision','requiere_subsanacion','aprobada','rechazada','retirada')),
  enviada_en timestamptz not null default now(),
  resuelta_en timestamptz,
  revisada_por uuid references perfiles(id),
  motivo_revision text,
  creado_en timestamptz not null default now(),
  check (estado <> 'enviada' or (declara_derechos and declara_calidad and declara_condiciones_uso)),
  check (estado not in ('aprobada','rechazada') or resuelta_en is not null)
);

create unique index solicitudes_publicacion_abiertas
  on solicitudes_publicacion_datos(producto_id)
  where estado in ('enviada','en_revision','requiere_subsanacion');

create or replace function validar_ecosistema_dataspace() returns trigger
language plpgsql set search_path = public as $$
declare
  v_espacio uuid;
begin
  if tg_table_name = 'catalogos_federados' then
    select espacio_id into v_espacio from participantes_espacio where id = new.participante_id;
    if v_espacio is distinct from new.espacio_id then
      raise exception 'el catalogo y su participante pertenecen a espacios distintos';
    end if;
    if not exists (
      select 1 from tipos_actor_participante t
      where t.participante_id = new.participante_id
        and t.tipo = 'espacio_datos' and t.verificado
    ) then
      raise exception 'solo un espacio de datos verificado puede registrar un catalogo federado';
    end if;
  elsif tg_table_name = 'productos_datos' then
    if new.catalogo_origen_id is not null then
      select espacio_id into v_espacio from catalogos_federados where id = new.catalogo_origen_id;
      if v_espacio is distinct from new.espacio_id then
        raise exception 'el catalogo de origen y el producto pertenecen a espacios distintos';
      end if;
    end if;
  elsif tg_table_name = 'solicitudes_publicacion_datos' then
    if not coalesce(es_staff(),false) and not exists (
      select 1 from productos_datos p
      join participantes_espacio pe on pe.id = p.proveedor_id
      join roles_participante r on r.participante_id = pe.id
      where p.id = new.producto_id and pe.empresa_id = mi_empresa()
        and pe.estado = 'activo' and r.rol in ('productor','proveedor')
        and r.vigente_desde <= now() and (r.vigente_hasta is null or r.vigente_hasta > now())
    ) then
      raise exception 'el solicitante no es un proveedor activo del producto';
    end if;
  end if;
  return new;
end $$;

create trigger catalogos_federados_consistencia before insert or update on catalogos_federados
  for each row execute function validar_ecosistema_dataspace();
create trigger productos_datos_catalogo_consistencia before insert or update of catalogo_origen_id on productos_datos
  for each row execute function validar_ecosistema_dataspace();
create trigger solicitudes_publicacion_consistencia before insert or update on solicitudes_publicacion_datos
  for each row execute function validar_ecosistema_dataspace();

create or replace function resolver_publicacion_producto(
  p_solicitud uuid,p_aprobar boolean,p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v solicitudes_publicacion_datos%rowtype;
begin
  if auth.uid() is null or (select rol from perfiles where id=auth.uid()) <> 'gestor' then
    raise exception 'solo un gestor autenticado puede resolver publicaciones';
  end if;
  select * into v from solicitudes_publicacion_datos where id=p_solicitud for update;
  if not found or v.estado not in ('enviada','en_revision','requiere_subsanacion') then
    raise exception 'solicitud inexistente o ya resuelta';
  end if;
  if p_aprobar then
    update productos_datos set estado='publicado',publicado_en=coalesce(publicado_en,now()),
      actualizado_en=now() where id=v.producto_id;
    update solicitudes_publicacion_datos set estado='aprobada',resuelta_en=now(),
      revisada_por=auth.uid(),motivo_revision=p_motivo where id=v.id;
  else
    update productos_datos set estado='revision',publicado_en=null,actualizado_en=now()
      where id=v.producto_id;
    update solicitudes_publicacion_datos set estado='requiere_subsanacion',
      revisada_por=auth.uid(),motivo_revision=p_motivo where id=v.id;
  end if;
end $$;

alter table solicitudes_alta_ecosistema enable row level security;
alter table tipos_actor_participante enable row level security;
alter table catalogos_federados enable row level security;
alter table solicitudes_publicacion_datos enable row level security;

create policy solicitud_alta_propia_lee on solicitudes_alta_ecosistema for select
  using (solicitante_perfil_id = auth.uid() or empresa_id = mi_empresa());
create policy solicitud_alta_propia_crea on solicitudes_alta_ecosistema for insert
  with check (solicitante_perfil_id = auth.uid() and empresa_id = mi_empresa()
    and estado in ('borrador','enviada'));
create policy solicitud_alta_propia_edita on solicitudes_alta_ecosistema for update
  using (solicitante_perfil_id = auth.uid()
    and estado in ('borrador','requiere_subsanacion'))
  with check (solicitante_perfil_id = auth.uid() and empresa_id = mi_empresa()
    and estado in ('borrador','enviada'));

create policy actor_participante_propio_lee on tipos_actor_participante for select using (
  exists(select 1 from participantes_espacio p
    where p.id=participante_id and p.empresa_id=mi_empresa()));
create policy catalogo_propio_lee on catalogos_federados for select using (
  exists(select 1 from participantes_espacio p
    where p.id=participante_id and p.empresa_id=mi_empresa()));
create policy catalogo_propio_crea on catalogos_federados for insert with check (
  estado in ('borrador','revision') and exists(select 1 from participantes_espacio p
    where p.id=participante_id and p.empresa_id=mi_empresa() and p.estado='activo'));
create policy catalogo_propio_edita on catalogos_federados for update using (
  exists(select 1 from participantes_espacio p
    where p.id=participante_id and p.empresa_id=mi_empresa()))
  with check (estado in ('borrador','revision','retirado') and exists(
    select 1 from participantes_espacio p
    where p.id=participante_id and p.empresa_id=mi_empresa() and p.estado='activo'));

create policy solicitud_publicacion_propia_lee on solicitudes_publicacion_datos for select using (
  solicitante_perfil_id=auth.uid() or exists(select 1 from productos_datos pd
    join participantes_espacio pe on pe.id=pd.proveedor_id
    where pd.id=producto_id and pe.empresa_id=mi_empresa()));
create policy solicitud_publicacion_propia_crea on solicitudes_publicacion_datos for insert
  with check (solicitante_perfil_id=auth.uid() and estado='enviada');

-- Un proveedor puede preparar y remitir borradores, pero no autopublicarlos.
drop policy if exists proveedor_gestiona_producto on productos_datos;
create policy proveedor_lee_sus_productos on productos_datos for select using (
  exists(select 1 from participantes_espacio pe
    where pe.id=proveedor_id and pe.empresa_id=mi_empresa()));
create policy proveedor_crea_borrador on productos_datos for insert with check (
  estado in ('borrador','revision') and exists(select 1 from participantes_espacio pe
    join roles_participante r on r.participante_id=pe.id
    where pe.id=proveedor_id and pe.empresa_id=mi_empresa() and pe.estado='activo'
      and r.rol in ('productor','proveedor') and r.vigente_desde<=now()
      and (r.vigente_hasta is null or r.vigente_hasta>now())));
create policy proveedor_edita_borrador on productos_datos for update using (
  exists(select 1 from participantes_espacio pe
    where pe.id=proveedor_id and pe.empresa_id=mi_empresa()))
  with check (estado in ('borrador','revision','retirado') and exists(
    select 1 from participantes_espacio pe
    where pe.id=proveedor_id and pe.empresa_id=mi_empresa()));

do $$ declare t text; begin
  foreach t in array array['solicitudes_alta_ecosistema','tipos_actor_participante',
    'catalogos_federados','solicitudes_publicacion_datos']
  loop
    execute format('create policy %I_staff_lee on %I for select using (es_staff())',t,t);
    execute format('create policy %I_gestor_escribe on %I for all using (mi_rol()=''gestor'') with check (mi_rol()=''gestor'')',t,t);
    execute format('create trigger %I_audit after insert or update or delete on %I for each row execute function auditar()',t,t);
  end loop;
end $$;

grant select,insert,update,delete on solicitudes_alta_ecosistema,
  tipos_actor_participante,catalogos_federados,solicitudes_publicacion_datos to authenticated;
grant insert,update on productos_datos to authenticated;

revoke execute on function validar_ecosistema_dataspace() from public,anon,authenticated;
revoke execute on function resolver_publicacion_producto(uuid,boolean,text) from public,anon;
grant execute on function resolver_publicacion_producto(uuid,boolean,text) to authenticated;

-- El catálogo anónimo nunca recibe URLs de acceso de productos restringidos.
-- La vista se ejecuta con los permisos del propietario y solo proyecta campos seguros.
create view catalogo_distribuciones_publicas as
select d.id,d.producto_id,d.titulo,d.formato,d.media_type,
  case when p.nivel_acceso='publico' then d.access_url else null end as access_url,
  case when p.nivel_acceso='publico' then d.download_url else null end as download_url,
  case when p.nivel_acceso='publico' then d.servicio_acceso else null end as servicio_acceso,
  d.esquema_uri,d.openapi_uri,d.disponibilidad_objetivo
from distribuciones_datos d join productos_datos p on p.id=d.producto_id
where p.estado='publicado' and d.estado='activo';
revoke select on distribuciones_datos from anon;
grant select on catalogo_distribuciones_publicas to anon,authenticated;

comment on table solicitudes_alta_ecosistema is
  'Alta revisable de espacios de datos, proveedores IA, startups, pymes, tractoras, investigadores y AAPP.';
comment on table catalogos_federados is
  'Catalogos de espacios de datos verificados; enlazados o recolectados sin centralizar sus datasets.';
comment on table solicitudes_publicacion_datos is
  'Flujo de revision: el proveedor declara derechos, calidad y condiciones antes de publicar.';

commit;
