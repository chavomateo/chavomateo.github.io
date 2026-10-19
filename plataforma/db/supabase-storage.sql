-- Plataforma AlianzaIA · almacén de documentos firmados (Supabase Storage, región UE)
-- Se aplica DESPUÉS de schema.sql. Guarda el PDF firmado, el certificado de auditoría y el
-- anexo de Dropbox Sign (rutas en firmas_externas) y las copias en PDF de las declaraciones
-- (copias_enviadas). Llevan nombre, email e IP de los firmantes: bucket privado y solo el gestor.
-- La función que genera y envía el PDF usa la service_role (no pasa por estas políticas).
-- Plazo de conservación: lo fija Legal (parametro_legal 'conservacion_firmas_anos').

insert into storage.buckets (id, name, public)
values ('firmas', 'firmas', false)
on conflict (id) do update set public = false;

-- Solo el gestor lee y sube. Sin políticas de UPDATE ni DELETE: nadie las puede cambiar ni
-- borrar desde la API (una corrección se sube como fichero nuevo y se anota con sustituye_a).
create policy firmas_gestor_lee on storage.objects for select to authenticated
  using (bucket_id = 'firmas' and public.mi_rol() = 'gestor');
create policy firmas_gestor_sube on storage.objects for insert to authenticated
  with check (bucket_id = 'firmas' and public.mi_rol() = 'gestor');
