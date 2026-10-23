-- AlianzaIA Data Spaces v1.0 - isolation, authorization and least privilege.
-- Apply after dataspaces-v0.8.sql and dataspaces-v0.9.sql.

begin;

create or replace function validar_consistencia_dataspace() returns trigger
language plpgsql set search_path = public as $$
declare
  v_espacio uuid;
  v_otro_espacio uuid;
  v_producto uuid;
  v_consumidor uuid;
begin
  if tg_table_name = 'productos_datos' then
    select espacio_id into v_espacio from participantes_espacio where id = new.proveedor_id;
    if v_espacio is distinct from new.espacio_id then
      raise exception 'el proveedor no pertenece al espacio del producto';
    end if;
  elsif tg_table_name = 'conectores_datos' then
    select espacio_id into v_espacio from participantes_espacio where id = new.participante_id;
    if v_espacio is distinct from new.espacio_id then
      raise exception 'el participante no pertenece al espacio del conector';
    end if;
  elsif tg_table_name = 'distribuciones_datos' then
    if new.conector_id is not null then
      select espacio_id into v_espacio from productos_datos where id = new.producto_id;
      select espacio_id into v_otro_espacio from conectores_datos where id = new.conector_id;
      if v_espacio is distinct from v_otro_espacio then
        raise exception 'el conector y el producto pertenecen a espacios distintos';
      end if;
    end if;
  elsif tg_table_name = 'contratos_datos' then
    select espacio_id into v_espacio from productos_datos where id = new.producto_id;
    if v_espacio is distinct from new.espacio_id then
      raise exception 'el producto no pertenece al espacio del contrato';
    end if;
    if not exists (
      select 1 from participantes_espacio
      where id = new.proveedor_id and espacio_id = new.espacio_id
    ) or not exists (
      select 1 from participantes_espacio
      where id = new.consumidor_id and espacio_id = new.espacio_id
    ) then
      raise exception 'las partes no pertenecen al espacio del contrato';
    end if;
    select producto_id into v_producto from politicas_uso_datos where id = new.politica_id;
    if v_producto is distinct from new.producto_id then
      raise exception 'la politica no corresponde al producto del contrato';
    end if;
  elsif tg_table_name = 'autorizaciones_datos' then
    select producto_id, consumidor_id into v_producto, v_consumidor
      from contratos_datos where id = new.contrato_id;
    if v_consumidor is distinct from new.consumidor_id then
      raise exception 'el consumidor no corresponde al contrato';
    end if;
    if not exists (
      select 1 from distribuciones_datos
      where id = new.distribucion_id and producto_id = v_producto
    ) then
      raise exception 'la distribucion no corresponde al producto contratado';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists productos_datos_consistencia on productos_datos;
create trigger productos_datos_consistencia before insert or update on productos_datos
  for each row execute function validar_consistencia_dataspace();
drop trigger if exists conectores_datos_consistencia on conectores_datos;
create trigger conectores_datos_consistencia before insert or update on conectores_datos
  for each row execute function validar_consistencia_dataspace();
drop trigger if exists distribuciones_datos_consistencia on distribuciones_datos;
create trigger distribuciones_datos_consistencia before insert or update on distribuciones_datos
  for each row execute function validar_consistencia_dataspace();
drop trigger if exists contratos_datos_consistencia on contratos_datos;
create trigger contratos_datos_consistencia before insert or update on contratos_datos
  for each row execute function validar_consistencia_dataspace();
drop trigger if exists autorizaciones_datos_consistencia on autorizaciones_datos;
create trigger autorizaciones_datos_consistencia before insert or update on autorizaciones_datos
  for each row execute function validar_consistencia_dataspace();

create or replace function solicitar_transaccion(
  p_autorizacion uuid, p_tipo text, p_correlacion text, p_detalle jsonb default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  a autorizaciones_datos;
  c contratos_datos;
  d distribuciones_datos;
  p productos_datos;
  v_id uuid;
  v_proveedor participantes_espacio;
  v_consumidor participantes_espacio;
  v_actor_empresa uuid;
begin
  if auth.uid() is null then
    raise exception 'se requiere una identidad autenticada';
  end if;
  select * into a from autorizaciones_datos where id = p_autorizacion;
  if not found or a.revocada_en is not null or (a.expira_en is not null and a.expira_en <= now()) then
    raise exception 'autorizacion inexistente, revocada o caducada';
  end if;
  select * into c from contratos_datos where id = a.contrato_id;
  select * into d from distribuciones_datos where id = a.distribucion_id;
  select * into p from productos_datos where id = c.producto_id;
  select * into v_proveedor from participantes_espacio where id = c.proveedor_id;
  select * into v_consumidor from participantes_espacio where id = c.consumidor_id;

  v_actor_empresa := mi_empresa();
  if not coalesce(es_staff(), false) and not exists (
    select 1 from participantes_espacio pe
    where pe.id in (c.proveedor_id, c.consumidor_id)
      and pe.empresa_id = v_actor_empresa
      and pe.estado = 'activo'
  ) then
    raise exception 'el actor no es parte autorizada de la transaccion';
  end if;
  if c.estado <> 'activo' or c.vigente_desde > now() or
     (c.vigente_hasta is not null and c.vigente_hasta <= now()) then
    raise exception 'contrato no activo o fuera de vigencia';
  end if;
  if p.estado <> 'publicado' or d.estado <> 'activo' then
    raise exception 'producto o distribucion no disponibles';
  end if;
  if v_proveedor.estado <> 'activo' or v_consumidor.estado <> 'activo' then
    raise exception 'proveedor o consumidor no activos';
  end if;
  if p.espacio_id <> c.espacio_id or
     v_proveedor.espacio_id <> c.espacio_id or
     v_consumidor.espacio_id <> c.espacio_id or
     a.consumidor_id <> c.consumidor_id or
     d.producto_id <> c.producto_id then
    raise exception 'autorizacion incoherente con el contrato o el espacio';
  end if;
  insert into transacciones_datos(espacio_id,contrato_id,autorizacion_id,distribucion_id,
    proveedor_id,consumidor_id,tipo,estado,correlacion,detalle,hash_prev,hash)
  values(c.espacio_id,c.id,a.id,d.id,c.proveedor_id,c.consumidor_id,p_tipo,'autorizada',
    p_correlacion,coalesce(p_detalle,'{}'),'PENDIENTE','PENDIENTE') returning id into v_id;
  return v_id;
end $$;

-- CRED migrations run after the general grants file. Open only the required
-- objects and let row-level security decide which rows each role may access.
grant select on espacios_datos, participantes_espacio, candidatos_participante,
  roles_participante, adhesiones_espacio, credenciales_participante,
  vocabularios_espacio, productos_datos, metricas_calidad_dato, conectores_datos,
  distribuciones_datos, politicas_uso_datos, contratos_datos, autorizaciones_datos,
  transacciones_datos, incidencias_gobernanza, criterios_cred, evidencias_cred,
  evaluaciones_cred, casos_uso_datos, productos_caso_uso, matches_caso_candidato,
  solicitudes_acceso_datos, eventos_flujo_datos to authenticated;
grant insert, update, delete on participantes_espacio, candidatos_participante,
  roles_participante, adhesiones_espacio, credenciales_participante,
  vocabularios_espacio, productos_datos, metricas_calidad_dato, conectores_datos,
  distribuciones_datos, politicas_uso_datos, contratos_datos, autorizaciones_datos,
  transacciones_datos, incidencias_gobernanza, evidencias_cred, evaluaciones_cred,
  casos_uso_datos, productos_caso_uso, matches_caso_candidato,
  solicitudes_acceso_datos, eventos_flujo_datos to authenticated;
grant usage, select on sequence transacciones_datos_n_seq to authenticated;
grant select on espacios_datos, criterios_cred, productos_datos,
  distribuciones_datos, catalogo_dcat_ap to anon;
grant select on catalogo_dcat_ap, estado_conformidad_cred to authenticated;
alter view catalogo_dcat_ap set (security_invoker = true);

revoke execute on function validar_consistencia_dataspace() from public, anon, authenticated;
revoke execute on function transaccion_encadenar() from public, anon, authenticated;
revoke execute on function solicitar_transaccion(uuid,text,text,jsonb) from public, anon;
grant execute on function solicitar_transaccion(uuid,text,text,jsonb) to authenticated;

commit;
