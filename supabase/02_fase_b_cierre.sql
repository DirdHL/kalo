-- =====================================================================
-- Kalo · Fase B — Cierre (ejecutar DESPUÉS de publicar la nueva versión)
-- ---------------------------------------------------------------------
-- Desde aquí las ventas y los reembolsos solo se pueden hacer con
-- registrar_venta y reembolsar_venta: nadie puede insertar ni modificar
-- ventas directamente, ni con montos inventados.
-- Antes de ejecutarlo: abre Kalo en cada caja y recarga la página (Ctrl+F5)
-- para que ninguna siga con la versión anterior.
-- =====================================================================

begin;

do $$
begin
  if to_regprocedure('public.kalo_migrar_legado()') is null then
    raise exception 'Primero ejecuta 01_fase_a_seguridad.sql (o esta fase B ya se ejecutó).';
  end if;
  -- Copia lo que la versión anterior haya registrado durante el cambio.
  raise notice '%', public.kalo_migrar_legado();
end $$;

-- Ventas: solo a través de las funciones.
drop policy if exists kalo_ventas_legado_crear on public.ventas;
drop policy if exists kalo_ventas_legado_editar on public.ventas;
revoke insert, update, delete on public.ventas from authenticated;

-- Productos: la app ahora los desactiva; borrar de verdad queda solo para admins.
drop policy if exists kalo_productos_borrar on public.productos;
create policy kalo_productos_borrar on public.productos for delete to authenticated
  using ((select public.kalo_es_admin()));

-- Los combos ya usan combo_items; el código "COMBO:..." deja de usarse.
update public.productos p
   set codigo = null
 where p.codigo like 'COMBO:%'
   and exists (select 1 from public.combo_items ci where ci.combo_id = p.id);

drop function public.kalo_migrar_legado();
drop function if exists public.kalo_numero(text);

-- Marca para que, si alguien vuelve a ejecutar la fase A, no reabra estos permisos.
comment on table public.ventas is 'Ventas de Kalo. Solo se escriben con registrar_venta y reembolsar_venta (kalo:fase_b).';

commit;

notify pgrst, 'reload schema';

select tablename as tabla, policyname as politica, cmd as operacion
  from pg_policies
 where schemaname = 'public' and tablename in ('productos', 'ventas', 'combo_items', 'venta_items')
 order by 1, 3;
