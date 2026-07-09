import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const shared = resolve(__dirname, 'shared')

export default defineConfig({
  main: {
    build: { rollupOptions: { input: { index: resolve(__dirname, 'electron/main.ts') } } },
    resolve: { alias: { '@shared': shared } },
  },
  preload: {
    build: { rollupOptions: { input: { index: resolve(__dirname, 'electron/preload.ts') } } },
    resolve: { alias: { '@shared': shared } },
  },
  renderer: {
    root: '.',
    server: { host: '127.0.0.1' },
    build: { rollupOptions: { input: resolve(__dirname, 'index.html') } },
    plugins: [react()],
    resolve: { alias: { '@shared': shared } },
  },
})
