import path from 'node:path'
import babel from '@rolldown/plugin-babel'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** Build de biblioteca: ESM + React Compiler aplicado; dependências ficam como peer/externas. */
const external = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react/compiler-runtime',
  /^@base-ui\//,
  /^@dnd-kit\//,
  /^@tanstack\//,
  /^nuqs/,
  /^lucide-react/,
  'clsx',
  'tailwind-merge',
  'class-variance-authority',
]

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  build: {
    outDir: 'dist-lib',
    emptyOutDir: true,
    copyPublicDir: false,
    sourcemap: true,
    lib: { entry: path.resolve(import.meta.dirname, 'src/components/taskboard/index.ts'), formats: ['es'], fileName: 'index' },
    rolldownOptions: { external },
  },
})
