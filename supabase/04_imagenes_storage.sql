-- =====================================================================
-- Kalo · 04 · Imágenes de productos subidas desde la app (Supabase Storage)
--
-- Crea el "bucket" de archivos `imagenes` y sus permisos. No toca las tablas
-- de productos ni de ventas: las fotos viven en Storage y el producto solo
-- guarda su nombre (ej. sb:GALLETA-OREO-36G.webp) en la columna imagen.
--
-- Quién puede qué:
--   · Ver la foto: cualquiera que tenga el enlace (el bucket es público, como
--     las imágenes que ya vienen con la app). Son fotos de productos.
--   · Ver la lista, subir y borrar: solo cuentas de Kalo (admin o cajero).
--   · Solo se aceptan WEBP, JPG o PNG de hasta 2 MB, con nombres simples
--     (letras mayúsculas, números y guiones). La app comprime antes de subir.
--
-- Se ejecuta una vez en Supabase → SQL Editor → New query → Run.
-- Volver a ejecutarlo no rompe nada. Necesita la fase A (función kalo_rol).
-- =====================================================================

do $$
begin
  if to_regprocedure('public.kalo_rol()') is null then
    raise exception 'Primero ejecuta 01_fase_a_seguridad.sql (falta public.kalo_rol).';
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('imagenes', 'imagenes', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
   set public = excluded.public,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists kalo_imagenes_ver on storage.objects;
drop policy if exists kalo_imagenes_subir on storage.objects;
drop policy if exists kalo_imagenes_borrar on storage.objects;

-- Listar las imágenes en el selector (y requisito de Storage para poder borrar).
create policy kalo_imagenes_ver on storage.objects for select to authenticated
  using (bucket_id = 'imagenes' and coalesce(public.kalo_rol() in ('admin', 'cajero'), false));

-- Subir: solo nombres simples en la raíz del bucket (sin carpetas ni caracteres raros).
create policy kalo_imagenes_subir on storage.objects for insert to authenticated
  with check (
    bucket_id = 'imagenes'
    and coalesce(public.kalo_rol() in ('admin', 'cajero'), false)
    and name ~ '^[A-Z0-9][A-Z0-9-]{0,79}\.(webp|jpg|png)$'
  );

-- Borrar: cualquier vendedora o admin (pedido del negocio).
create policy kalo_imagenes_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'imagenes' and coalesce(public.kalo_rol() in ('admin', 'cajero'), false));

-- Comprobación: debe mostrar el bucket y las 3 políticas.
select b.id as bucket, b.public as publico, b.file_size_limit as max_bytes, b.allowed_mime_types as tipos,
       (select string_agg(p.policyname, ', ' order by p.policyname)
          from pg_policies p
         where p.schemaname = 'storage' and p.tablename = 'objects' and p.policyname like 'kalo_imagenes_%') as politicas
  from storage.buckets b
 where b.id = 'imagenes';
