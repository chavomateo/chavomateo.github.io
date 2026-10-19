-- Plataforma AlianzaIA · permisos de la API de datos de Supabase (auto-expose desactivado)
-- Se aplica DESPUÉS de schema.sql. La seguridad la da RLS; aquí solo se abre la API.
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
revoke execute on all functions in schema public from anon, public;
-- Lectura pública sin sesión solo de lo publicado (filtrado por las políticas RLS)
grant select on casos, preguntas, programas_credito, recursos, itinerarios, textos_legales, parametros_legales to anon;
-- Las vistas respetan RLS del usuario que consulta
alter view ayudas_minimis set (security_invoker = true);
alter view saldo_lotes set (security_invoker = true);
revoke all on ayudas_minimis, saldo_lotes from anon;
-- Clave de cifrado de las declaraciones de minimis en Supabase Vault (no se imprime)
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'minimis_clave') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'minimis_clave', 'Cifrado del detalle de minimis');
  end if;
end $$;
-- Las políticas RLS llaman a estas funciones auxiliares; para anon devuelven null/false
grant execute on function mi_rol(), es_staff(), mi_empresa() to anon;
-- firma_alta_actual() devuelve la fila entera de firmas_externas (nombres, emails, IP): no se
-- expone por la API. La empresa usa mi_firma_alta_vigente(); el gestor lee la tabla con RLS.
revoke execute on function firma_alta_actual(uuid), firma_alta_vigente(uuid) from authenticated, anon, public;
