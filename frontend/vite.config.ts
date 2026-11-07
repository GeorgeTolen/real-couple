import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  build: { chunkSizeWarningLimit: 8000 },
  server: { proxy: { '/api': 'http://localhost:8000' } },
})
