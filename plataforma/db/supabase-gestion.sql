-- Plataforma AlianzaIA · permisos del gestor de AES para operar desde la web (tras schema.sql)
drop policy if exists gestor_valida_empresa on empresas;
create policy gestor_valida_empresa on empresas for update using (mi_rol() = 'gestor') with check (mi_rol() = 'gestor');
drop policy if exists gestor_proveedores on proveedores;
create policy gestor_proveedores on proveedores for all using (mi_rol() = 'gestor') with check (mi_rol() = 'gestor');
-- La empresa solo puede validar/dar de baja a través del gestor: nunca cambia su propio estado
create or replace function empresas_estado_solo_gestor() returns trigger language plpgsql as $$
begin
  if new.estado is distinct from old.estado and coalesce(mi_rol()::text, '') <> 'gestor' and auth.uid() is not null then
    raise exception 'solo un gestor de AES puede cambiar el estado de la empresa';
  end if;
  return new;
end $$;
drop trigger if exists empresas_estado on empresas;
create trigger empresas_estado before update on empresas for each row execute function empresas_estado_solo_gestor();
