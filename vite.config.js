import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: '/kalo/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        brisas: resolve(__dirname, 'brisas.html'),
        pinos: resolve(__dirname, 'pinos.html'),
        polideportivo: resolve(__dirname, 'polideportivo.html')
      }
    }
  }
})
