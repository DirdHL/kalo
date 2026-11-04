-- =====================================================================
-- Kalo · Fase C — Verificación en dos pasos obligatoria para admins
-- ---------------------------------------------------------------------
-- Ejecutar cuando TODOS los administradores ya activaron la verificación
-- en dos pasos desde Kalo (botón "Activar 2FA" en la barra superior).
-- Después de esto, una sesión de admin que no ingresó su código de 6
-- dígitos no tiene permisos de administrador en la base de datos.
-- =====================================================================

begin;

do $$
declare
  sin_2fa text;
begin
  select string_agg(u.email, ', ') into sin_2fa
    from auth.users u
   where u.raw_app_meta_data ->> 'kalo_rol' = 'admin'
     and not exists (select 1 from auth.mfa_factors f
                      where f.user_id = u.id and f.status = 'verified');
  if sin_2fa is not null then
    raise exception 'Estos administradores aún no activaron la verificación en dos pasos: %. Actívenla desde Kalo y vuelve a ejecutar este script.', sin_2fa;
  end if;
end $$;

create or replace function public.kalo_es_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.kalo_rol() = 'admin', false)
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

commit;

-- Para deshacerlo (por ejemplo, si un admin perdió su teléfono), vuelve a
-- crear la función sin la segunda condición:
--   create or replace function public.kalo_es_admin() returns boolean
--   language sql stable security definer set search_path = '' as $$
--     select coalesce(public.kalo_rol() = 'admin', false) $$;
