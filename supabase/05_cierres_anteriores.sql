-- =====================================================================
-- Kalo · 05 · Las vendedoras pueden ver el cierre de caja de días anteriores
--
-- Crea la función cierre_de_caja(local, día). Devuelve SOLO los totales del
-- cierre de un día: cantidad de ventas, total cobrado, efectivo, Yape/Plin,
-- descuentos y reembolsos.
--
-- Lo que NO cambia:
--   · La vendedora sigue sin poder leer las ventas una por una de otros días
--     (la tabla ventas la sigue limitando a hoy).
--   · Solo ve los cierres de SU local, y de un día a la vez: no puede pedir
--     totales de un mes (Estadísticas sigue siendo solo para admins).
--   · El admin puede ver el cierre de cualquier local y día.
--
-- Se ejecuta una vez en Supabase → SQL Editor → New query → Run.
-- Volver a ejecutarlo no rompe nada. Necesita la fase A.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.kalo_puede_operar(text)') is null then
    raise exception 'Primero ejecuta 01_fase_a_seguridad.sql (falta public.kalo_puede_operar).';
  end if;
end $$;

create or replace function public.cierre_de_caja(p_local text, p_dia date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_desde     timestamptz;
  v_hasta     timestamptz;
  v_resultado jsonb;
begin
  if auth.uid() is null then
    raise exception 'Tu sesión expiró. Vuelve a iniciar sesión.' using errcode = '28000';
  end if;
  if p_local is null or p_dia is null or not public.kalo_puede_operar(p_local) then
    raise exception 'No tienes permiso para ver el cierre de este local.' using errcode = '42501';
  end if;
  if p_dia > (now() at time zone 'America/Lima')::date then
    raise exception 'Ese día todavía no llega.' using errcode = '22023';
  end if;

  -- El día completo en hora de Perú
  v_desde := p_dia::timestamp at time zone 'America/Lima';
  v_hasta := (p_dia + 1)::timestamp at time zone 'America/Lima';

  -- Mismas reglas que el cierre de la app: los reembolsos no suman a la caja;
  -- en ventas antiguas sin efectivo/yape guardados se usa el método de pago.
  select jsonb_build_object(
           'cantidad',            count(*) filter (where not r.reembolsada),
           'ventas',              round(coalesce(sum(r.total)     filter (where not r.reembolsada), 0), 2),
           'descuentos',          round(coalesce(sum(r.descuento) filter (where not r.reembolsada), 0), 2),
           'efectivo',            round(coalesce(sum(r.efectivo)  filter (where not r.reembolsada), 0), 2),
           'yape',                round(coalesce(sum(r.yape)      filter (where not r.reembolsada), 0), 2),
           'cantidad_reembolsos', count(*) filter (where r.reembolsada),
           'reembolsos',          round(coalesce(sum(r.total)     filter (where r.reembolsada), 0), 2))
    into v_resultado
    from (
      select coalesce(v.estado = 'reembolsada', false) as reembolsada,
             coalesce(v.total::numeric, 0) as total,
             coalesce(v.descuento::numeric, 0) as descuento,
             case when v.efectivo is null and v.yape is null
                  then case when v.metodo_pago = 'Yape' then 0 else coalesce(v.total::numeric, 0) end
                  else coalesce(v.efectivo::numeric, 0) end as efectivo,
             case when v.efectivo is null and v.yape is null
                  then case when v.metodo_pago = 'Yape' then coalesce(v.total::numeric, 0) else 0 end
                  else coalesce(v.yape::numeric, 0) end as yape
        from public.ventas v
       where v.local = p_local
         and v.fecha >= v_desde
         and v.fecha < v_hasta
    ) r;

  return v_resultado;
end $$;

revoke all on function public.cierre_de_caja(text, date) from public, anon;
grant execute on function public.cierre_de_caja(text, date) to authenticated;

-- Comprobación: debe mostrar la función y "authenticated" con permiso.
select p.proname as funcion,
       pg_get_function_identity_arguments(p.oid) as parametros,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_puede,
       has_function_privilege('anon', p.oid, 'execute') as anon_puede
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.proname = 'cierre_de_caja';
