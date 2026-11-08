-- Plataforma AlianzaIA · migración de seguridad 2026-11-08 (aplicada en producción el 8-nov-2026)
-- clave_minimis() es SECURITY DEFINER y devuelve la clave de cifrado de declaraciones_minimis
-- (Supabase Vault). Con el "grant execute on all functions ... to authenticated" cualquier usuario
-- con sesión podía llamarla por POST /rest/v1/rpc/clave_minimis. Solo la usan funciones
-- SECURITY DEFINER (declarar_minimis), que se ejecutan como owner y siguen funcionando.
-- La clave del Vault (minimis_clave) se rotó fuera de este fichero; aquí no hay ningún secreto.
begin;
revoke execute on function public.clave_minimis() from public, anon, authenticated;
-- Funciones de trigger / event trigger SECURITY DEFINER: no se llaman por la API (los triggers
-- no comprueban EXECUTE al dispararse), así que se cierran por defensa en profundidad.
revoke execute on function public.auditar(), public.evento_flujo_encadenar(),
  public.transaccion_encadenar(), public.rls_auto_enable() from public, anon, authenticated;
-- Las funciones nuevas creadas por postgres en public no se conceden solas a nadie;
-- hay que darlas explícitamente (las existentes no cambian).
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
commit;
