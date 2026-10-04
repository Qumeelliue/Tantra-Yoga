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
    // Проверки боя идут дольше, чем раньше, и это не из-за «медленного кода».
    //
    // Стенд стал честным: он действительно растрирует заливки и спрайты, а не
    // делает вид (см. `tests/helpers/dom.js`, «Матрица 2×3» и заливки). Плюс
    // комната стала больше (896×896 вместо 620×900), и бой в тестовых кадрах идёт
    // дольше. При пятисекундном умолчании проверка падала по таймауту и НЕ
    // говорила ничего: ни «поломалось», ни «работает». Здесь 45 секунд — с
    // запасом на самый долгий проход боя.
    testTimeout: 45000,
    hookTimeout: 45000,
  },
})
