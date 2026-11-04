-- =====================================================================
-- Kalo · Diagnóstico (solo lectura): estructura, seguridad y volumen.
-- Útil si algún script falla: ejecútalo y comparte el resultado.
-- =====================================================================
select jsonb_pretty(jsonb_build_object(
  'postgres', version(),
  'tablas', (select jsonb_agg(jsonb_build_object('tabla', c.relname, 'rls', c.relrowsecurity) order by c.relname)
               from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'),
  'columnas', (select jsonb_agg(jsonb_build_object('tabla', table_name, 'columna', column_name,
                                                   'tipo', data_type, 'default', column_default)
                                order by table_name, ordinal_position)
                 from information_schema.columns
                where table_schema = 'public' and table_name in ('productos', 'ventas', 'combo_items', 'venta_items')),
  'politicas', (select jsonb_agg(jsonb_build_object('tabla', tablename, 'politica', policyname, 'operacion', cmd,
                                                    'roles', roles, 'using', qual, 'check', with_check))
                  from pg_policies where schemaname = 'public'),
  'funciones', (select jsonb_agg(p.oid::regprocedure::text order by p.proname)
                  from pg_proc p where p.pronamespace = 'public'::regnamespace),
  'ventas_por_local', (select jsonb_object_agg(coalesce(local, '(vacío)'), n)
                         from (select local, count(*) as n from public.ventas group by local) s),
  'productos_por_local', (select jsonb_object_agg(coalesce(local, '(vacío)'), n)
                            from (select local, count(*) as n from public.productos group by local) s),
  'cuentas', (select jsonb_agg(jsonb_build_object('email', email,
                                                  'rol', raw_app_meta_data ->> 'kalo_rol',
                                                  'local', raw_app_meta_data ->> 'kalo_local') order by email)
                from auth.users)
)) as diagnostico;
