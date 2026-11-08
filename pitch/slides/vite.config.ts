import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Один самодостаточный HTML: скрипты, стили, шрифт и снимки встроены.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4000,
  },
  // данные лежат в docs/pitch/data, двумя уровнями выше
  server: { fs: { allow: ['../..'] } },
})
