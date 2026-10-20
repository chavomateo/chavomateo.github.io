-- Plataforma AlianzaIA · alta de empresa desde la web (se aplica tras schema.sql y supabase-grants.sql)
-- La persona entra con el enlace del correo y da de alta su empresa en una sola llamada.
-- La empresa queda «pendiente» hasta que un gestor de AES la valida.
create or replace function alta_empresa(p_nif text, p_razon_social text, p_tipo text, p_tamano text,
  p_cnae text, p_ccaa text, p_provincia text, p_nombre text, p_cargo text)
  returns uuid language plpgsql security definer set search_path = public as $$
declare v_emp uuid; v_nif text := upper(regexp_replace(coalesce(p_nif, ''), '[\s.-]', '', 'g'));
begin
  if auth.uid() is null then raise exception 'hay que iniciar sesión'; end if;
  if exists (select 1 from perfiles where id = auth.uid() and empresa_id is not null) then
    raise exception 'tu usuario ya está vinculado a una empresa';
  end if;
  if v_nif !~ '^([A-HJNP-SUVW][0-9]{7}[0-9A-J]|[0-9]{8}[A-Z]|[XYZ][0-9]{7}[A-Z])$' then
    raise exception 'el NIF no tiene un formato válido';
  end if;
  if coalesce(trim(p_razon_social), '') = '' then raise exception 'falta la razón social'; end if;
  if exists (select 1 from empresas where nif = v_nif) then
    raise exception 'Ya hay una empresa dada de alta con ese NIF. Pide acceso a la persona que la registró.';
  end if;
  insert into empresas (nif, razon_social, tipo, tamano, cnae, ccaa, provincia)
  values (v_nif, trim(p_razon_social), p_tipo, nullif(p_tamano, ''), nullif(p_cnae, ''), nullif(p_ccaa, ''), nullif(p_provincia, ''))
  returning id into v_emp;
  insert into perfiles (id, empresa_id, nombre, cargo, rol)
  values (auth.uid(), v_emp, nullif(trim(p_nombre), ''), nullif(trim(p_cargo), ''), 'empresa')
  on conflict (id) do update set empresa_id = excluded.empresa_id, nombre = excluded.nombre, cargo = excluded.cargo;
  return v_emp;
end $$;

-- Estado de la cuenta de quien ha iniciado sesión (perfil + empresa), para pintar el área de empresa
create or replace function mi_cuenta() returns json
  language sql stable security definer set search_path = public as $$
  select json_build_object(
    'perfil', (select row_to_json(p) from perfiles p where p.id = auth.uid()),
    'empresa', (select row_to_json(e) from empresas e join perfiles p on p.empresa_id = e.id where p.id = auth.uid()),
    'aceptaciones', (select coalesce(json_agg(json_build_object('documento', a.documento, 'version', a.version, 'aceptado', a.aceptado, 'creado_en', a.creado_en) order by a.creado_en), '[]'::json)
                     from aceptaciones a where a.perfil_id = auth.uid()))
$$;

revoke execute on function alta_empresa(text,text,text,text,text,text,text,text,text), mi_cuenta() from anon, public;
grant execute on function alta_empresa(text,text,text,text,text,text,text,text,text), mi_cuenta() to authenticated;
