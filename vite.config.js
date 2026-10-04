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
    // Файлы идут по одному.
    //
    // Раньше файлы шли параллельно и делили воркер. Деление воркера экономит
    // время, но три файла, которые ведут забег целиком, начали зависеть от
    // того, какой файл попал в тот же воркер: модуль игры кэшируется и помнит
    // прошлый забег, а свежий DOM его не сбрасывает. По отдельности эти файлы
    // проходят, в общем прогоне падают — то есть проверка результата зависела
    // от разложения по воркерам.
    //
    // Разложение файлов по воркерам — не часть проверки. Платим временем.
    fileParallelism: false,
    isolate: true,
  },
})
