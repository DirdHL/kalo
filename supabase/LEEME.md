# Kalo · Base de datos (Supabase)

Esta carpeta guarda la seguridad de Kalo **dentro de la base de datos**. La app (lo que corre en el navegador) puede ser leída y modificada por cualquiera, así que las reglas importantes viven aquí:

- Cada cajero ve y modifica **solo su local**; el admin, todos. De las ventas, la vendedora solo ve **las de hoy** (su cierre de caja del día). Estadísticas (mes, margen, más vendidos y Excel) es solo para admins.
- Nadie sin sesión puede leer ni tocar productos o ventas.
- Las ventas y reembolsos se hacen con funciones que validan todo y se ejecutan completas o no se ejecutan: `registrar_venta`, `reembolsar_venta` y `crear_combo`.
- Reembolsos: el admin siempre; el cajero solo de su local y hasta 15 minutos después de cobrar. Queda quién, cuándo y por qué.

| Archivo | Qué hace | Cuándo |
|---|---|---|
| `01_fase_a_seguridad.sql` | Roles, RLS, funciones nuevas, tablas `venta_items` y `combo_items`, copia de datos antiguos | Primero. La app anterior sigue funcionando |
| `02_fase_b_cierre.sql` | Cierra la escritura directa de ventas (solo por las funciones) | Después de publicar la app nueva |
| `03_fase_c_2fa_admins.sql` | Exige verificación en dos pasos a los admins | Cuando ambos admins la activaron |
| `04_imagenes_storage.sql` | Crea el bucket de Storage `imagenes` para que las vendedoras suban y borren fotos de productos desde Inventario | Antes de publicar la versión con "Subir imagen" |
| `usuarios.sql` | Ver, agregar o quitar cuentas | Cuando cambie el personal |
| `diagnostico.sql` | Muestra estructura, políticas y cuentas (solo lectura) | Si algo falla |

## Orden para publicar (sin cortar la caja)

Todo se hace en **Supabase → SQL Editor → New query**: pegar el archivo completo y presionar **Run**.

1. **Fase A**: ejecuta `01_fase_a_seguridad.sql`. Al final aparece una tabla con cada cuenta y su rol: revisa que los 3 locales y los 2 admins estén bien. Las cuentas que digan `SIN ACCESO` no podrán entrar a Kalo.
2. **Cierra los registros públicos**: Authentication → Sign In / Providers → desactiva **Allow new users to sign up**. Así nadie puede crearse una cuenta por su cuenta.
3. **Cambia las contraseñas** de las 5 cuentas: sus correos estuvieron visibles en el código publicado. Los correos de los locales no reciben mensajes, así que usa la línea "Cambiar la contraseña" de `usuarios.sql`. Usa contraseñas de 12 caracteres o más.
4. **Publica la app nueva**: une la rama `mejoras-seguridad` a `main` y súbela. GitHub la publica en unos 2 minutos (pestaña Actions).
5. En **cada caja**, abre Kalo y recarga con **Ctrl+F5**. Haz una venta de prueba y reembólsala.
6. **Fase B**: ejecuta `02_fase_b_cierre.sql`.
7. **2FA de los admins**: cada admin entra a Kalo, presiona **Activar 2FA** en la barra superior y escanea el código con Google Authenticator, Microsoft Authenticator o similar. Revisa antes que esté activo en Authentication → Multi-Factor → TOTP.
8. **Fase C**, opcional pero recomendada: ejecuta `03_fase_c_2fa_admins.sql` cuando ambos admins tengan 2FA. Desde ahí, sin el código de 6 dígitos no hay permisos de admin.

Si vuelves a ejecutar la fase A más adelante, no pasa nada: no reabre lo que cerró la fase B.

## Cuentas del personal

Lo más seguro es **una cuenta por persona**, no una compartida por local. Así cada venta y cada reembolso quedan con nombre, y cuando alguien se va basta con quitarle el acceso.

1. Authentication → Users → **Add user** → correo y contraseña, marcando **Auto Confirm User**.
2. En el SQL Editor: `select public.kalo_asignar('correo@ejemplo.com', 'cajero', 'LAS BRISAS');`
3. Para quitar el acceso: `select public.kalo_quitar_acceso('correo@ejemplo.com');`

`usuarios.sql` tiene estas líneas listas para copiar.

## Respaldos semanales

El flujo `.github/workflows/backup.yml` guarda cada lunes una copia **cifrada** de las tablas. Para activarlo, en GitHub → Settings → Secrets and variables → Actions crea dos secretos:

- `SUPABASE_DB_URL`: en Supabase → Connect → **Session pooler**, copia la cadena `postgresql://…` y reemplaza `[YOUR-PASSWORD]` por la contraseña de la base de datos.
- `BACKUP_PASSPHRASE`: una frase larga que solo tú conozcas. **Guárdala en un lugar seguro**: sin ella los respaldos no se pueden abrir.

Luego, en Actions → *Respaldo de la base de datos* → **Run workflow**, para probarlo una vez. Los archivos quedan 90 días en *Artifacts*. GitHub pausa las tareas programadas de un repositorio público tras 60 días sin cambios: si eso pasa, vuelve a activarla desde Actions.

**Para restaurar**, en una PC con Docker:

```bash
gpg -d kalo-AAAA-MM-DD.dump.gpg > kalo.dump
docker run --rm -i postgres:18 pg_restore --clean --if-exists --no-owner -d "CADENA_SESSION_POOLER" < kalo.dump
```

Después ejecuta de nuevo `01` y `02` (y `03` si la usabas). El respaldo no incluye las cuentas de acceso: si el proyecto de Supabase es nuevo, créalas otra vez y asígnalas con `usuarios.sql`.

## Si algo falla

- **Un cajero no puede entrar**: ejecuta la primera consulta de `usuarios.sql` y revisa que su cuenta tenga rol `cajero` y el local correcto.
- **"La base de datos todavía no tiene la actualización de seguridad"**: falta ejecutar la fase A.
- **Un admin perdió el celular con el 2FA**: usa la última línea de `usuarios.sql` para borrar su factor y que lo active de nuevo.
- **Cualquier otra cosa**: ejecuta `diagnostico.sql` y comparte el resultado.
