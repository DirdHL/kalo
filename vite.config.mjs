import { defineConfig } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: '/kalo/',
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
})
