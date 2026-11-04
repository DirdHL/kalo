-- =====================================================================
-- Kalo · Fase A — Seguridad en la base de datos
-- ---------------------------------------------------------------------
-- 1. Guarda el rol (admin/cajero) y el local de cada cuenta.
-- 2. Activa RLS: cada cajero ve y modifica solo su local, y de las ventas solo
--    ve las de hoy (para su cierre de caja). El admin ve todo.
-- 3. Crea registrar_venta, reembolsar_venta y crear_combo: cada operación
--    se hace completa en la base o no se hace.
-- 4. Crea venta_items y combo_items y copia ahí los datos antiguos.
--
-- La versión actual de la app sigue funcionando después de esto, así que
-- puedes ejecutarlo en horario de atención. Se puede ejecutar más de una vez.
-- Cómo: Supabase → SQL Editor → New query → pegar todo → Run.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Verificaciones previas
-- ---------------------------------------------------------------------
do $$
declare
  faltan text;
begin
  if to_regclass('public.productos') is null or to_regclass('public.ventas') is null then
    raise exception 'No encontré las tablas public.productos y public.ventas.';
  end if;

  select string_agg(req.tabla || '.' || req.col, ', ') into faltan
    from (values
      ('productos', 'id'), ('productos', 'codigo'), ('productos', 'nombre'), ('productos', 'categoria'),
      ('productos', 'imagen'), ('productos', 'precio_compra'), ('productos', 'precio_venta'),
      ('productos', 'stock'), ('productos', 'alerta_stock'), ('productos', 'lotes'), ('productos', 'local'),
      ('ventas', 'id'), ('ventas', 'fecha'), ('ventas', 'subtotal'), ('ventas', 'descuento'),
      ('ventas', 'total'), ('ventas', 'metodo_pago'), ('ventas', 'efectivo'), ('ventas', 'yape'),
      ('ventas', 'costo_total'), ('ventas', 'detalles'), ('ventas', 'local')
    ) as req(tabla, col)
   where not exists (
     select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = req.tabla and c.column_name = req.col);
  if faltan is not null then
    raise exception 'Faltan columnas que la app usa: %', faltan;
  end if;

  if not exists (select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls))
     and exists (select 1 from pg_tables where schemaname = 'public'
                  and tablename in ('productos', 'ventas') and tableowner <> current_user) then
    raise exception 'Ejecuta este script desde el SQL Editor de Supabase (usuario postgres).';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Rol y local de cada cuenta (en auth.users.raw_app_meta_data,
--    que el usuario no puede modificar)
-- ---------------------------------------------------------------------
create or replace function public.kalo_rol()
returns text
language sql stable security definer set search_path = ''
as $$
  select u.raw_app_meta_data ->> 'kalo_rol' from auth.users u where u.id = auth.uid()
$$;

-- Local donde la sesión puede operar como cajero (null para admins y cuentas sin acceso).
create or replace function public.kalo_local()
returns text
language sql stable security definer set search_path = ''
as $$
  select case when u.raw_app_meta_data ->> 'kalo_rol' = 'cajero'
              then u.raw_app_meta_data ->> 'kalo_local' end
    from auth.users u where u.id = auth.uid()
$$;

-- ¿La sesión tiene permisos de administrador? (La fase C además exige 2FA.)
create or replace function public.kalo_es_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.kalo_rol() = 'admin', false)
$$;

-- Inicio del día de hoy en hora de Perú. Las vendedoras solo ven ventas desde
-- este momento: el cierre de caja del día, no el historial ni los totales del negocio.
create or replace function public.kalo_inicio_del_dia()
returns timestamptz
language sql stable set search_path = ''
as $$
  select date_trunc('day', now() at time zone 'America/Lima') at time zone 'America/Lima'
$$;

-- ¿Puede la sesión vender o crear combos en este local? Nunca devuelve null
-- (en PL/pgSQL "not null" no es verdadero, y un if dejaría pasar a cualquiera).
create or replace function public.kalo_puede_operar(p_local text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.kalo_es_admin() or p_local = public.kalo_local(), false)
$$;

-- Lo que la app necesita saber de la sesión actual.
create or replace function public.mi_perfil()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
           'email', u.email,
           'rol', u.raw_app_meta_data ->> 'kalo_rol',
           'local', u.raw_app_meta_data ->> 'kalo_local',
           'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
           'admin_activo', public.kalo_es_admin())
    from auth.users u where u.id = auth.uid()
$$;

-- Asigna rol y local a una cuenta. Solo desde el SQL Editor (ver usuarios.sql).
create or replace function public.kalo_asignar(p_email text, p_rol text, p_local text default null)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_filas integer;
begin
  if p_rol is null or p_rol not in ('admin', 'cajero') then
    raise exception 'El rol debe ser admin o cajero.';
  end if;
  if p_rol = 'cajero' and coalesce(p_local, '') not in ('LAS BRISAS', 'LOS PINOS', 'EL POLIDEPORTIVO') then
    raise exception 'Local inválido: %. Usa LAS BRISAS, LOS PINOS o EL POLIDEPORTIVO.', p_local;
  end if;
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
           || jsonb_build_object('kalo_rol', p_rol,
                                 'kalo_local', case when p_rol = 'cajero' then p_local end)
   where lower(email) = lower(btrim(p_email));
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    return 'No existe la cuenta ' || p_email || ': créala en Authentication → Users.';
  end if;
  return p_email || ' → ' || p_rol || coalesce(' en ' || case when p_rol = 'cajero' then p_local end, '');
end $$;

-- Quita el acceso a Kalo de una cuenta (por ejemplo, alguien que dejó de trabajar).
create or replace function public.kalo_quitar_acceso(p_email text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_filas integer;
begin
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'kalo_rol' - 'kalo_local'
   where lower(email) = lower(btrim(p_email));
  get diagnostics v_filas = row_count;
  return case when v_filas = 0 then 'No existe la cuenta ' || p_email
              else p_email || ' ya no tiene acceso a Kalo.' end;
end $$;

revoke all on function public.kalo_rol, public.kalo_local, public.kalo_es_admin, public.kalo_puede_operar, public.kalo_inicio_del_dia, public.mi_perfil from public, anon;
grant execute on function public.kalo_rol, public.kalo_local, public.kalo_es_admin, public.kalo_puede_operar, public.kalo_inicio_del_dia, public.mi_perfil to authenticated;
revoke all on function public.kalo_asignar, public.kalo_quitar_acceso from public, anon, authenticated;

do $$
begin
  perform public.kalo_asignar('zzenisx1234@gmail.com', 'admin');
  perform public.kalo_asignar('nuevohorizonte@gmail.com', 'admin');
  perform public.kalo_asignar('lasbrisas_kalo@gmail.com', 'cajero', 'LAS BRISAS');
  perform public.kalo_asignar('lospinos_kalo@gmail.com', 'cajero', 'LOS PINOS');
  perform public.kalo_asignar('poli_kalo@gmail.com', 'cajero', 'EL POLIDEPORTIVO');
end $$;

-- ---------------------------------------------------------------------
-- 2. Columnas nuevas
-- ---------------------------------------------------------------------
alter table public.productos add column if not exists activo boolean not null default true;

alter table public.ventas add column if not exists estado text;
alter table public.ventas add column if not exists creado_por uuid default auth.uid();
alter table public.ventas add column if not exists creado_por_email text default (auth.jwt() ->> 'email');
alter table public.ventas add column if not exists reembolsado_por uuid;
alter table public.ventas add column if not exists reembolsado_por_email text;
alter table public.ventas add column if not exists reembolsado_en timestamptz;
alter table public.ventas add column if not exists motivo_reembolso text;

-- Solo valida filas nuevas o editadas (not valid), para no fallar por datos antiguos.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'productos_precios_no_negativos') then
    alter table public.productos add constraint productos_precios_no_negativos
      check (coalesce(precio_compra, 0) >= 0 and coalesce(precio_venta, 0) >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'productos_stock_no_negativo') then
    alter table public.productos add constraint productos_stock_no_negativo
      check (stock is null or stock >= 0) not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Tablas nuevas (sus claves usan el mismo tipo que productos.id y ventas.id)
-- ---------------------------------------------------------------------
do $$
declare
  t_producto text;
  t_venta text;
begin
  select format_type(a.atttypid, a.atttypmod) into t_producto
    from pg_attribute a where a.attrelid = 'public.productos'::regclass and a.attname = 'id';
  select format_type(a.atttypid, a.atttypmod) into t_venta
    from pg_attribute a where a.attrelid = 'public.ventas'::regclass and a.attname = 'id';

  execute format($sql$
    create table if not exists public.combo_items (
      combo_id    %1$s    not null references public.productos(id) on delete cascade,
      producto_id %1$s    not null references public.productos(id),
      cantidad    integer not null check (cantidad between 1 and 9999),
      primary key (combo_id, producto_id),
      check (combo_id <> producto_id)
    )$sql$, t_producto);

  execute format($sql$
    create table if not exists public.venta_items (
      id              bigint generated always as identity primary key,
      venta_id        %2$s not null references public.ventas(id) on delete cascade,
      producto_id     %1$s references public.productos(id) on delete set null,
      nombre          text not null,
      cantidad        integer not null check (cantidad > 0),
      precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
      costo_unitario  numeric(12,4) not null default 0 check (costo_unitario >= 0),
      componentes     jsonb
    )$sql$, t_producto, t_venta);
end $$;

create index if not exists combo_items_producto_idx on public.combo_items (producto_id);
create index if not exists venta_items_venta_idx on public.venta_items (venta_id);
create index if not exists venta_items_producto_idx on public.venta_items (producto_id);
create index if not exists ventas_local_fecha_idx on public.ventas (local, fecha);
create index if not exists productos_local_idx on public.productos (local);

-- ---------------------------------------------------------------------
-- 4. Seguridad por filas (RLS)
-- ---------------------------------------------------------------------
-- Las políticas anteriores de estas tablas se reemplazan por completo.
do $$
declare
  r record;
begin
  for r in select policyname, tablename from pg_policies
            where schemaname = 'public'
              and tablename in ('productos', 'ventas', 'combo_items', 'venta_items')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.productos   enable row level security;
alter table public.ventas      enable row level security;
alter table public.combo_items enable row level security;
alter table public.venta_items enable row level security;

-- Sin sesión iniciada no se puede tocar nada de esto.
revoke all on public.productos, public.ventas, public.combo_items, public.venta_items from anon;
revoke truncate, references, trigger on public.productos, public.ventas, public.combo_items, public.venta_items from authenticated;
grant select, insert, update, delete on public.productos to authenticated;
grant select on public.ventas, public.combo_items, public.venta_items to authenticated;
revoke insert, update, delete on public.combo_items, public.venta_items from authenticated;

create policy kalo_productos_ver on public.productos for select to authenticated
  using ((select public.kalo_es_admin()) or local = (select public.kalo_local()));
create policy kalo_productos_crear on public.productos for insert to authenticated
  with check ((select public.kalo_es_admin()) or local = (select public.kalo_local()));
create policy kalo_productos_editar on public.productos for update to authenticated
  using ((select public.kalo_es_admin()) or local = (select public.kalo_local()))
  with check ((select public.kalo_es_admin()) or local = (select public.kalo_local()));

-- Admin: todas las ventas. Vendedora: solo las de hoy de su local.
create policy kalo_ventas_ver on public.ventas for select to authenticated
  using ((select public.kalo_es_admin())
         or (local = (select public.kalo_local()) and fecha >= (select public.kalo_inicio_del_dia())));

-- Permisos temporales para la versión anterior de la app (registra, reembolsa y
-- borra directamente). La fase B los quita y deja una marca en la tabla ventas:
-- si este script se vuelve a ejecutar después, no los reabre.
do $$
begin
  if coalesce(obj_description('public.ventas'::regclass, 'pg_class'), '') like '%kalo:fase_b%' then
    create policy kalo_productos_borrar on public.productos for delete to authenticated
      using ((select public.kalo_es_admin()));
    revoke insert, update, delete on public.ventas from authenticated;
  else
    create policy kalo_productos_borrar on public.productos for delete to authenticated
      using ((select public.kalo_es_admin()) or local = (select public.kalo_local()));
    grant insert, update on public.ventas to authenticated;
    create policy kalo_ventas_legado_crear on public.ventas for insert to authenticated
      with check ((select public.kalo_es_admin()) or local = (select public.kalo_local()));
    create policy kalo_ventas_legado_editar on public.ventas for update to authenticated
      using ((select public.kalo_es_admin()) or local = (select public.kalo_local()))
      with check ((select public.kalo_es_admin()) or local = (select public.kalo_local()));
  end if;
end $$;

-- Se ven los componentes y el detalle de lo que la persona ya puede ver.
create policy kalo_combo_items_ver on public.combo_items for select to authenticated
  using (exists (select 1 from public.productos p where p.id = combo_id));
create policy kalo_venta_items_ver on public.venta_items for select to authenticated
  using (exists (select 1 from public.ventas v where v.id = venta_id));

-- ---------------------------------------------------------------------
-- 5. Operaciones de negocio
-- ---------------------------------------------------------------------
do $$
declare
  f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.proname in ('registrar_venta', 'reembolsar_venta', 'crear_combo', 'resumen_productos')
  loop
    execute 'drop function ' || f;
  end loop;
end $$;

-- Registra una venta completa: valida permisos, toma precios y costos de la
-- base, descuenta stock (también el de los componentes de combos) y guarda
-- la venta con su detalle. Si algo falla, no se guarda nada.
-- p_items: [{"id": <producto>, "cantidad": <entero>}, ...]
create function public.registrar_venta(
  p_local          text,
  p_items          jsonb,
  p_descuento      numeric default 0,
  p_metodo         text    default 'Efectivo',
  p_efectivo       numeric default null,
  p_yape           numeric default null,
  p_total_esperado numeric default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_item        jsonb;
  v_id          public.productos.id%type;
  v_prod        record;
  v_comp        record;
  v_componentes jsonb;
  v_costo_unit  numeric;
  v_precio      numeric;
  v_stock       jsonb := '{}'::jsonb;
  v_items       jsonb := '[]'::jsonb;
  v_subtotal    numeric := 0;
  v_costo       numeric := 0;
  v_descuento   numeric;
  v_total       numeric;
  v_efectivo    numeric;
  v_yape        numeric;
  v_venta_id    public.ventas.id%type;
  v_fecha       timestamptz;
  r             record;
begin
  if v_uid is null then
    raise exception 'Tu sesión expiró. Vuelve a iniciar sesión.' using errcode = '28000';
  end if;
  if p_local is null or not public.kalo_puede_operar(p_local) then
    raise exception 'No tienes permiso para vender en %.', coalesce(p_local, 'ese local') using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El ticket está vacío.';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'El ticket tiene demasiados productos.';
  end if;
  if p_metodo is null or p_metodo not in ('Efectivo', 'Yape', 'Ambos') then
    raise exception 'Selecciona un método de pago válido.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(v_item ->> 'id', '') = ''
       or coalesce(v_item ->> 'cantidad', '') !~ '^[1-9][0-9]{0,3}$' then
      raise exception 'El ticket tiene un producto o una cantidad inválida.';
    end if;
  end loop;

  -- Líneas del ticket (agrupadas, en el orden en que se agregaron)
  for r in
    select e ->> 'id' as id_txt, sum((e ->> 'cantidad')::integer)::integer as cantidad
      from jsonb_array_elements(p_items) with ordinality as t(e, orden)
     group by e ->> 'id'
     order by min(orden)
  loop
    begin
      v_id := r.id_txt;
    exception when others then
      raise exception 'El ticket tiene un producto inválido.';
    end;

    select p.id, p.nombre, p.precio_venta, p.precio_compra, p.stock, p.activo
      into v_prod
      from public.productos p
     where p.id = v_id and p.local = p_local;
    if not found or not v_prod.activo then
      raise exception 'Un producto del ticket ya no está disponible. Actualiza la pantalla.';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object('producto_id', ci.producto_id::text, 'cantidad', ci.cantidad)
                              order by ci.producto_id::text), '[]'::jsonb),
           coalesce(sum(coalesce(c.precio_compra, 0)::numeric * ci.cantidad), 0)
      into v_componentes, v_costo_unit
      from public.combo_items ci
      join public.productos c on c.id = ci.producto_id
     where ci.combo_id = v_prod.id;

    if jsonb_array_length(v_componentes) > 0 then
      -- Combo: se descuenta el stock de cada componente.
      for v_comp in select ci.producto_id::text as id, ci.cantidad
                      from public.combo_items ci where ci.combo_id = v_prod.id loop
        v_stock := jsonb_set(v_stock, array[v_comp.id],
                             to_jsonb(coalesce((v_stock ->> v_comp.id)::integer, 0) + v_comp.cantidad * r.cantidad));
      end loop;
    else
      v_componentes := null;
      v_costo_unit := coalesce(v_prod.precio_compra, 0)::numeric;
      if v_prod.stock is not null then
        v_stock := jsonb_set(v_stock, array[v_prod.id::text],
                             to_jsonb(coalesce((v_stock ->> v_prod.id::text)::integer, 0) + r.cantidad));
      end if;
    end if;

    v_precio := round(coalesce(v_prod.precio_venta, 0)::numeric, 2);
    v_subtotal := v_subtotal + v_precio * r.cantidad;
    v_costo := v_costo + v_costo_unit * r.cantidad;
    v_items := v_items || jsonb_build_object(
      'producto_id', to_jsonb(v_prod.id),
      'nombre', replace(v_prod.nombre, '_', ' '),
      'cantidad', r.cantidad,
      'precio_unitario', v_precio,
      'costo_unitario', round(v_costo_unit, 4),
      'componentes', v_componentes);
  end loop;

  -- Descuento, total y forma de pago
  v_subtotal := round(v_subtotal, 2);
  v_descuento := round(coalesce(p_descuento, 0), 2);
  if v_descuento < 0 or v_descuento > v_subtotal then
    raise exception 'El descuento debe estar entre S/ 0.00 y el subtotal (S/ %).', to_char(v_subtotal, 'FM9999999990.00');
  end if;
  v_total := v_subtotal - v_descuento;

  if p_total_esperado is not null and round(p_total_esperado, 2) <> v_total then
    raise exception 'Los precios cambiaron: el total correcto es S/ %. Revisa el ticket antes de cobrar.',
      to_char(v_total, 'FM9999999990.00') using errcode = 'KL001';
  end if;

  if p_metodo = 'Efectivo' then
    v_efectivo := v_total;
    v_yape := 0;
  elsif p_metodo = 'Yape' then
    v_efectivo := 0;
    v_yape := v_total;
  else
    v_efectivo := round(coalesce(p_efectivo, -1), 2);
    v_yape := round(coalesce(p_yape, -1), 2);
    if v_efectivo < 0 or v_yape < 0 then
      raise exception 'Los montos de efectivo y Yape deben ser mayores o iguales a cero.';
    end if;
    if v_efectivo + v_yape <> v_total then
      raise exception 'Efectivo + Yape (S/ %) no coincide con el total (S/ %).',
        to_char(v_efectivo + v_yape, 'FM9999999990.00'), to_char(v_total, 'FM9999999990.00');
    end if;
  end if;

  -- Descontar stock bloqueando las filas siempre en el mismo orden
  for r in select key as id_txt, value::integer as cantidad from jsonb_each_text(v_stock) order by key loop
    v_id := r.id_txt;
    select p.id, p.nombre, p.stock, p.activo into v_prod
      from public.productos p
     where p.id = v_id and p.local = p_local
       for update;
    if not found or not v_prod.activo then
      raise exception 'Un producto de un combo ya no está disponible. Revisa el combo en Inventario.';
    end if;
    if v_prod.stock is not null then
      if v_prod.stock < r.cantidad then
        raise exception 'Stock insuficiente para %. Disponible: %.', replace(v_prod.nombre, '_', ' '), v_prod.stock;
      end if;
      update public.productos set stock = stock - r.cantidad where id = v_prod.id;
    end if;
  end loop;

  insert into public.ventas (subtotal, descuento, total, metodo_pago, efectivo, yape, costo_total,
                             detalles, local, creado_por, creado_por_email)
  values (v_subtotal, v_descuento, v_total, p_metodo, v_efectivo, v_yape, round(v_costo, 2),
          (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', i -> 'producto_id', 'nombre', i ->> 'nombre',
                    'qty', (i ->> 'cantidad')::integer, 'precio_venta', (i ->> 'precio_unitario')::numeric)), '[]'::jsonb)
             from jsonb_array_elements(v_items) i),
          p_local, v_uid, auth.jwt() ->> 'email')
  returning id, fecha into v_venta_id, v_fecha;

  insert into public.venta_items (venta_id, producto_id, nombre, cantidad, precio_unitario, costo_unitario, componentes)
  select x.venta_id, x.producto_id, x.nombre, x.cantidad, x.precio_unitario, x.costo_unitario, x.componentes
    from jsonb_populate_recordset(null::public.venta_items,
           (select jsonb_agg(i || jsonb_build_object('venta_id', to_jsonb(v_venta_id)))
              from jsonb_array_elements(v_items) i)) x;

  return jsonb_build_object(
    'id', v_venta_id, 'fecha', v_fecha, 'local', p_local,
    'subtotal', v_subtotal, 'descuento', v_descuento, 'total', v_total,
    'metodo_pago', p_metodo, 'efectivo', v_efectivo, 'yape', v_yape,
    'items', (select jsonb_agg(jsonb_build_object('nombre', i ->> 'nombre',
                                                  'cantidad', (i ->> 'cantidad')::integer,
                                                  'precio_unitario', (i ->> 'precio_unitario')::numeric))
                from jsonb_array_elements(v_items) i));
end $$;

-- Reembolsa una venta y devuelve el stock. Admin: siempre. Cajero: solo
-- ventas de su local y hasta 15 minutos después de cobrar. Guarda quién,
-- cuándo y por qué.
create function public.reembolsar_venta(p_venta_id public.ventas.id%type, p_motivo text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_venta  record;
  v_motivo text := left(btrim(coalesce(p_motivo, '')), 300);
  v_id     public.productos.id%type;
  r        record;
begin
  if auth.uid() is null then
    raise exception 'Tu sesión expiró. Vuelve a iniciar sesión.' using errcode = '28000';
  end if;
  if length(v_motivo) < 3 then
    raise exception 'Escribe el motivo del reembolso.';
  end if;

  select v.id, v.local, v.fecha, v.estado into v_venta
    from public.ventas v where v.id = p_venta_id
     for update;
  if not found then
    raise exception 'La venta no existe.';
  end if;
  if not public.kalo_es_admin() then
    if v_venta.local is distinct from public.kalo_local() then
      raise exception 'No puedes reembolsar ventas de otro local.' using errcode = '42501';
    end if;
    if coalesce(v_venta.fecha, '-infinity') < now() - interval '15 minutes' then
      raise exception 'Pasaron más de 15 minutos desde la venta: solo un administrador puede reembolsarla.'
        using errcode = '42501';
    end if;
  end if;
  if v_venta.estado = 'reembolsada' then
    raise exception 'Esta venta ya fue reembolsada.';
  end if;
  if not exists (select 1 from public.venta_items vi where vi.venta_id = v_venta.id) then
    raise exception 'La venta no tiene detalle de productos; no se puede devolver el stock automáticamente.';
  end if;

  -- Devolver stock (mismo orden de bloqueo que registrar_venta)
  for r in
    select x.id_txt, sum(x.cantidad)::integer as cantidad
      from (
        select c ->> 'producto_id' as id_txt, (c ->> 'cantidad')::integer * vi.cantidad as cantidad
          from public.venta_items vi
         cross join lateral jsonb_array_elements(
                 case when jsonb_typeof(vi.componentes) = 'array' then vi.componentes else '[]'::jsonb end) c
         where vi.venta_id = v_venta.id
        union all
        select vi.producto_id::text, vi.cantidad
          from public.venta_items vi
         where vi.venta_id = v_venta.id and vi.componentes is null and vi.producto_id is not null
      ) x
     where x.id_txt is not null
     group by x.id_txt
     order by x.id_txt
  loop
    begin
      v_id := r.id_txt;
    exception when others then
      continue;
    end;
    update public.productos
       set stock = stock + r.cantidad
     where id = v_id and local = v_venta.local and stock is not null;
  end loop;

  update public.ventas
     set estado = 'reembolsada',
         reembolsado_por = auth.uid(),
         reembolsado_por_email = auth.jwt() ->> 'email',
         reembolsado_en = now(),
         motivo_reembolso = v_motivo
   where id = v_venta.id;

  return jsonb_build_object('id', v_venta.id, 'estado', 'reembolsada');
end $$;

-- Crea un combo y sus componentes en un solo paso.
-- p_items: [{"id": <producto>, "cantidad": <entero>}, ...] (mínimo 2 productos distintos)
create function public.crear_combo(p_local text, p_nombre text, p_precio numeric, p_imagen text, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_nombre   text := btrim(coalesce(p_nombre, ''));
  v_combo_id public.productos.id%type;
  v_id       public.productos.id%type;
  v_items    jsonb := '[]'::jsonb;
  v_count    integer;
  r          record;
begin
  if auth.uid() is null then
    raise exception 'Tu sesión expiró. Vuelve a iniciar sesión.' using errcode = '28000';
  end if;
  if p_local is null or not public.kalo_puede_operar(p_local) then
    raise exception 'No tienes permiso para crear combos en %.', coalesce(p_local, 'ese local') using errcode = '42501';
  end if;
  if v_nombre = '' or length(v_nombre) > 120 then
    raise exception 'Escribe un nombre para el combo (máximo 120 caracteres).';
  end if;
  if p_precio is null or p_precio <= 0 or p_precio > 100000 then
    raise exception 'Ingresa un precio válido para el combo.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Selecciona los productos del combo.';
  end if;

  for r in select e ->> 'id' as id_txt, e ->> 'cantidad' as cantidad_txt from jsonb_array_elements(p_items) e loop
    if coalesce(r.id_txt, '') = '' or coalesce(r.cantidad_txt, '') !~ '^[1-9][0-9]{0,3}$' then
      raise exception 'Las cantidades del combo deben ser números enteros mayores a cero.';
    end if;
    begin
      v_id := r.id_txt;
    exception when others then
      raise exception 'El combo tiene un producto inválido.';
    end;
    if not exists (select 1 from public.productos p
                    where p.id = v_id and p.local = p_local and p.activo
                      and p.categoria is distinct from 'Combos'
                      and not exists (select 1 from public.combo_items ci where ci.combo_id = p.id)) then
      raise exception 'Un producto del combo no existe en este local o es otro combo.';
    end if;
    v_items := v_items || jsonb_build_object('producto_id', to_jsonb(v_id), 'cantidad', r.cantidad_txt::integer);
  end loop;

  select count(distinct i ->> 'producto_id') into v_count from jsonb_array_elements(v_items) i;
  if v_count < 2 or v_count <> jsonb_array_length(v_items) then
    raise exception 'Selecciona al menos 2 productos distintos para armar el combo.';
  end if;

  insert into public.productos (nombre, categoria, precio_compra, precio_venta, stock, alerta_stock, codigo, imagen, local)
  values (v_nombre, 'Combos', 0, round(p_precio, 2), null, null, null,
          nullif(left(btrim(coalesce(p_imagen, '')), 200), ''), p_local)
  returning id into v_combo_id;

  insert into public.combo_items (combo_id, producto_id, cantidad)
  select x.combo_id, x.producto_id, x.cantidad
    from jsonb_populate_recordset(null::public.combo_items,
           (select jsonb_agg(i || jsonb_build_object('combo_id', to_jsonb(v_combo_id)))
              from jsonb_array_elements(v_items) i)) x;

  return jsonb_build_object('id', v_combo_id);
end $$;

-- Productos más vendidos de un local en un periodo (respeta RLS).
create function public.resumen_productos(p_local text, p_desde timestamptz, p_hasta timestamptz)
returns table (producto text, unidades bigint, total_vendido numeric, costo_total numeric)
language sql stable security invoker set search_path = ''
as $$
  select max(vi.nombre),
         sum(vi.cantidad)::bigint,
         sum(vi.cantidad * vi.precio_unitario),
         sum(vi.cantidad * vi.costo_unitario)
    from public.venta_items vi
    join public.ventas v on v.id = vi.venta_id
   where v.local = p_local
     and v.fecha >= p_desde and v.fecha < p_hasta
     and v.estado is distinct from 'reembolsada'
   group by coalesce(vi.producto_id::text, 'n:' || vi.nombre)
   order by sum(vi.cantidad * vi.precio_unitario) desc, sum(vi.cantidad) desc
   limit 100
$$;

revoke all on function public.registrar_venta, public.reembolsar_venta, public.crear_combo, public.resumen_productos from public, anon;
grant execute on function public.registrar_venta, public.reembolsar_venta, public.crear_combo, public.resumen_productos to authenticated;

-- ---------------------------------------------------------------------
-- 6. Copiar datos antiguos a combo_items y venta_items
--    (la fase B lo vuelve a ejecutar por si se registró algo en el cambio)
-- ---------------------------------------------------------------------
create or replace function public.kalo_numero(p text)
returns numeric
language sql immutable set search_path = ''
as $$
  select case when p ~ '^\s*-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?\s*$' then p::numeric else 0 end
$$;

create or replace function public.kalo_migrar_legado()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_componentes integer;
  v_lineas integer;
begin
  -- Combos guardados como "COMBO:id-cantidad,id-cantidad" en productos.codigo
  with partes as (
    select p.id as combo_id, p.local, x.arr[1] as componente, x.arr[2]::integer as cantidad
      from public.productos p
     cross join lateral unnest(string_to_array(substr(p.codigo, 7), ',')) as t(parte)
     cross join lateral regexp_match(btrim(t.parte), '^(.+)-([1-9][0-9]{0,3})$') as x(arr)
     where p.codigo like 'COMBO:%'
       and not exists (select 1 from public.combo_items ci where ci.combo_id = p.id)
  )
  insert into public.combo_items (combo_id, producto_id, cantidad)
  select pa.combo_id, c.id, least(sum(pa.cantidad), 9999)::integer
    from partes pa
    join public.productos c on c.id::text = pa.componente and c.local = pa.local
   where c.id <> pa.combo_id
   group by pa.combo_id, c.id
  on conflict do nothing;
  get diagnostics v_componentes = row_count;

  -- Detalle de ventas guardado como JSON en ventas.detalles
  with fuente as (
    select v.id as venta_id, e.it, e.orden
      from public.ventas v
     cross join lateral jsonb_array_elements(
             case when jsonb_typeof(v.detalles::jsonb) = 'array' then v.detalles::jsonb else '[]'::jsonb end
           ) with ordinality as e(it, orden)
     where not exists (select 1 from public.venta_items vi where vi.venta_id = v.id)
       and jsonb_typeof(e.it) = 'object'
       and coalesce(e.it ->> 'qty', '') ~ '^[1-9][0-9]{0,5}$'
  )
  insert into public.venta_items (venta_id, producto_id, nombre, cantidad, precio_unitario, costo_unitario, componentes)
  select f.venta_id,
         p.id,
         left(coalesce(nullif(btrim(replace(f.it ->> 'nombre', '_', ' ')), ''), 'Producto'), 200),
         (f.it ->> 'qty')::integer,
         round(greatest(public.kalo_numero(f.it ->> 'precio_venta'), 0), 2),
         case when f.it ->> 'codigo' like 'COMBO:%' then
           coalesce((select sum(greatest(coalesce(cp.precio_compra, 0)::numeric, 0) * x.arr[2]::integer)
                       from unnest(string_to_array(substr(f.it ->> 'codigo', 7), ',')) as t(parte)
                      cross join lateral regexp_match(btrim(t.parte), '^(.+)-([1-9][0-9]{0,3})$') as x(arr)
                       join public.productos cp on cp.id::text = x.arr[1]), 0)
         else greatest(public.kalo_numero(f.it ->> 'precio_compra'), 0) end,
         case when f.it ->> 'codigo' like 'COMBO:%' then
           (select jsonb_agg(jsonb_build_object('producto_id', x.arr[1], 'cantidad', x.arr[2]::integer))
              from unnest(string_to_array(substr(f.it ->> 'codigo', 7), ',')) as t(parte)
             cross join lateral regexp_match(btrim(t.parte), '^(.+)-([1-9][0-9]{0,3})$') as x(arr)
             where x.arr is not null)
         end
    from fuente f
    left join public.productos p on p.id::text = f.it ->> 'id'
   order by f.venta_id, f.orden;
  get diagnostics v_lineas = row_count;

  return format('Componentes de combos copiados: %s. Líneas de venta copiadas: %s.', v_componentes, v_lineas);
end $$;

revoke all on function public.kalo_numero, public.kalo_migrar_legado from public, anon, authenticated;

do $$
begin
  raise notice '%', public.kalo_migrar_legado();
end $$;

commit;

-- Que la API vea las tablas y funciones nuevas de inmediato.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Resultado: revisa que cada cuenta tenga el rol y local correctos.
-- Las cuentas "SIN ACCESO" no podrán entrar a Kalo (usa usuarios.sql).
-- ---------------------------------------------------------------------
select 'cuenta' as tipo, u.email as detalle,
       coalesce(u.raw_app_meta_data ->> 'kalo_rol', 'SIN ACCESO') as rol,
       coalesce(u.raw_app_meta_data ->> 'kalo_local', '') as local
  from auth.users u
union all
select 'ventas con detalle',
       count(*) filter (where exists (select 1 from public.venta_items vi where vi.venta_id = v.id)) || ' de ' || count(*),
       '', ''
  from public.ventas v
union all
select 'combos con componentes',
       count(*) filter (where exists (select 1 from public.combo_items ci where ci.combo_id = p.id)) || ' de ' || count(*),
       '', ''
  from public.productos p
 where p.categoria = 'Combos' or p.codigo like 'COMBO:%'
order by 1, 2;
