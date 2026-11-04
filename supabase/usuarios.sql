-- =====================================================================
-- Kalo · Gestión de cuentas (copia solo la línea que necesites)
-- Requiere haber ejecutado 01_fase_a_seguridad.sql.
-- =====================================================================

-- Ver quién tiene acceso y dónde
select email,
       coalesce(raw_app_meta_data ->> 'kalo_rol', 'SIN ACCESO') as rol,
       coalesce(raw_app_meta_data ->> 'kalo_local', '') as local,
       last_sign_in_at as ultimo_ingreso
  from auth.users
 order by rol, local, email;

-- Nueva persona: primero créala en Authentication → Users → Add user
-- (marca "Auto Confirm User"), luego asígnale rol y local:
--   select public.kalo_asignar('nombre.apellido@correo.com', 'cajero', 'LAS BRISAS');
--   select public.kalo_asignar('nombre.apellido@correo.com', 'cajero', 'LOS PINOS');
--   select public.kalo_asignar('nombre.apellido@correo.com', 'cajero', 'EL POLIDEPORTIVO');
--   select public.kalo_asignar('nombre.apellido@correo.com', 'admin');

-- Cambiar la contraseña de una cuenta (útil para las de los locales, cuyos
-- correos no reciben mensajes de recuperación). Usa 12 caracteres o más:
--   update auth.users
--      set encrypted_password = extensions.crypt('Nueva-Clave-Larga-2026', extensions.gen_salt('bf'))
--    where email = 'lasbrisas_kalo@gmail.com';

-- Alguien deja de trabajar: quítale el acceso (y si quieres, bórralo en
-- Authentication → Users):
--   select public.kalo_quitar_acceso('nombre.apellido@correo.com');

-- Un admin perdió el teléfono con la app de 2FA: borra su factor para que
-- pueda volver a activarlo (si ya ejecutaste la fase C, mientras tanto no
-- tendrá permisos de admin):
--   delete from auth.mfa_factors
--    where user_id = (select id from auth.users where email = 'correo@del.admin');
