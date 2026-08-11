import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: path.join(root, 'webapp'),
  resolve: {
    alias: {
      '@content': path.join(root, 'content'),
      '@webapp': path.join(root, 'webapp'),
    },
  },
  server: {
    host: true,
    fs: { allow: [root] },
  },
  build: {
    outDir: path.join(root, 'dist'),
    emptyOutDir: true,
  },
  test: {
    root,
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
})
