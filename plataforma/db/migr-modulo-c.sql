-- Plataforma AlianzaIA · migración del módulo c (esquema 0.5) sobre la base ya creada en Supabase
begin;
create table if not exists servicios_oferta (
  id                uuid primary key default gen_random_uuid(),
  aportante_interno text not null,                -- marca real: SOLO staff
  aportante_publico text not null,                -- genérico: «Empresa líder en IA A»
  tipo              text not null check (tipo in ('formacion', 'mentoria', 'consultoria', 'prueba_concepto', 'diagnostico', 'otro')),
  concepto          text not null,
  descripcion       text,
  importe_eur       numeric(12,2) not null check (importe_eur > 0),
  plazas            integer not null check (plazas >= 0),
  modalidad         text,
  publicado         boolean not null default false
);
alter table solicitudes_credito alter column programa_id drop not null;
alter table solicitudes_credito add column if not exists servicio_id uuid references servicios_oferta(id);
alter table solicitudes_credito drop constraint if exists solicitudes_credito_estado_check;
update solicitudes_credito set estado = case estado when 'recibida' then 'pendiente' when 'elegible' then 'validada' else estado end;
alter table solicitudes_credito alter column estado set default 'pendiente';
alter table solicitudes_credito add constraint solicitudes_credito_estado_check check (estado in ('pendiente', 'validada', 'asignada', 'activada', 'cerrada', 'rechazada'));
alter table solicitudes_credito drop constraint if exists solicitudes_programa_o_servicio;
alter table solicitudes_credito add constraint solicitudes_programa_o_servicio check ((programa_id is null) <> (servicio_id is null));
alter table servicios_valorados drop constraint if exists servicios_valorados_tipo_check;
alter table servicios_valorados add constraint servicios_valorados_tipo_check check (tipo in ('formacion', 'mentoria', 'consultoria', 'prueba_concepto', 'diagnostico', 'otro'));
alter table servicios_valorados add column if not exists solicitud_id uuid unique references solicitudes_credito(id);
alter table servicios_valorados add column if not exists servicio_id uuid references servicios_oferta(id);
alter table servicios_valorados add column if not exists activada_en timestamptz;
alter table ledger drop constraint if exists ledger_tipo_check;
alter table ledger add constraint ledger_tipo_check check (tipo in ('cesion', 'asignacion', 'activacion', 'consumo', 'servicio', 'cierre', 'contraasiento'));
drop trigger if exists servicios_oferta_audit on servicios_oferta;
create trigger servicios_oferta_audit after insert or update or delete on servicios_oferta for each row execute function auditar();
alter table servicios_oferta enable row level security;
drop policy if exists servicios_oferta_staff_lee on servicios_oferta;
create policy servicios_oferta_staff_lee on servicios_oferta for select using (es_staff());
drop policy if exists gestor_servicios_oferta on servicios_oferta;
create policy gestor_servicios_oferta on servicios_oferta for all using (mi_rol() = 'gestor') with check (mi_rol() = 'gestor');
drop policy if exists servicios_oferta_publicados on servicios_oferta;
create policy servicios_oferta_publicados on servicios_oferta for select using (publicado and auth.uid() is not null);
drop policy if exists sol_cred_crea on solicitudes_credito;
create policy sol_cred_crea on solicitudes_credito for insert
  with check (empresa_id = mi_empresa() and estado = 'pendiente'
              and exists (select 1 from empresas e where e.id = mi_empresa() and e.estado = 'validada'));
-- Las marcas reales solo las ve el personal de AES
grant select, insert, update on servicios_oferta to authenticated;
revoke select (aportante_interno) on servicios_oferta from authenticated;
revoke select (nombre_interno) on proveedores from authenticated;
commit;

-- Ocultar las marcas reales a nivel de columna (un permiso de tabla las incluiría todas)
begin;
revoke select on servicios_oferta, proveedores from authenticated;
grant select (id, aportante_publico, tipo, concepto, descripcion, importe_eur, plazas, modalidad, publicado) on servicios_oferta to authenticated;
grant select (id, nombre_publico, tipo, region_ue, dpa_firmado) on proveedores to authenticated;
-- El personal de AES las lee con estas funciones (comprueban el rol)
create or replace function staff_servicios_oferta() returns setof servicios_oferta
  language plpgsql stable security definer set search_path = public as $$
begin if not es_staff() then raise exception 'solo personal de AES'; end if; return query select * from servicios_oferta order by concepto; end $$;
create or replace function staff_proveedores() returns setof proveedores
  language plpgsql stable security definer set search_path = public as $$
begin if not es_staff() then raise exception 'solo personal de AES'; end if; return query select * from proveedores order by nombre_interno; end $$;
revoke execute on function staff_servicios_oferta(), staff_proveedores() from anon, public;
grant execute on function staff_servicios_oferta(), staff_proveedores() to authenticated;
commit;
