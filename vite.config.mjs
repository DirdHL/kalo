import { defineConfig, loadEnv } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = dirname(fileURLToPath(import.meta.url))

// Content-Security-Policy: el navegador solo ejecuta scripts de este sitio y solo
// se conecta a Supabase. Si alguien lograra inyectar HTML, no podría cargar
// código externo ni enviar datos a otro servidor.
function kaloCsp(supabaseUrl) {
  let supabaseOrigin = ''
  try {
    supabaseOrigin = new URL(supabaseUrl).origin
  } catch {
    supabaseOrigin = ''
  }
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src 'self' ${supabaseOrigin}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ')

  return {
    name: 'kalo-csp',
    apply: 'build',
    configResolved() {
      if (!supabaseOrigin) {
        throw new Error('Falta VITE_SUPABASE_URL (archivo .env o secretos de GitHub): sin ella la app no podría conectarse a Supabase.')
      }
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        // El libro de reclamaciones es de otro negocio y usa servicios externos: se deja igual.
        if (/libro-reclamaciones/.test(ctx.filename || ctx.path || '')) return html
        const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`
        return /<meta charset="UTF-8">/i.test(html)
          ? html.replace(/<meta charset="UTF-8">/i, match => `${match}\n    ${meta}`)
          : html.replace(/<head>/i, `<head>\n    ${meta}`)
      }
    }
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectDir, 'VITE_')
  return {
    base: '/kalo/',
    plugins: [kaloCsp(env.VITE_SUPABASE_URL)],
    build: {
      rollupOptions: {
        input: {
          main: resolve(projectDir, 'index.html'),
          brisas: resolve(projectDir, 'brisas.html'),
          pinos: resolve(projectDir, 'pinos.html'),
          polideportivo: resolve(projectDir, 'polideportivo.html'),
          libroReclamaciones: resolve(projectDir, 'libro-reclamaciones/libro-reclamaciones.html')
        }
      }
    }
  }
})
