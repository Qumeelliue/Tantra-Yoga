// ПОЛ ИЗ ТАЙЛСЕТА: ЛИЦЕНЗИОННЫЙ, СОБРАН ОДИН РАЗ И ВИДЕН НА ЭКРАНЕ.
//
// ## Зачем
//
// Пол и стены Поля Ума были единственной частью картинки, оставшейся
// самодельной: персонажи стали лицензионными спрайтами, а под ними —
// собственный векторный фон. Автор смотрел на игру и говорил про «текстуру», и
// половина этого слова была про пол.
//
// ## Главная ловушка, и почему она здесь проверяется
//
// В наборе Calciumtrice **два разных размера**: плитки пола 16×16, а кадр
// персонажа 32×32. Автор пишет это в своей инструкции прямым текстом. Первая
// версия кода взяла для пола те же 32 — и молча получала кусок 2×2 плитки,
// то есть на пол выходила бы четверть тайлсета, натянутая как обои.
//
// ## Второе: пол нельзя рисовать «как придётся»
//
// Плиток на кадр около тысячи, и на телефоне тысяча вызовов drawImage за кадр —
// это дорого. Пол собирается ОДИН раз в отдельный холст на всю арену и
// выводится одним drawImage. Это проверяется: пол обязан быть готов и лежать
// на весь мир, а не на кадр.

import { describe, it, expect, beforeAll } from 'vitest'
import { installDom } from './helpers/dom.js'
import {
  FLOOR_CELL, ANIM_CELL, FLOOR_TILES, buildFloorCanvas, floorReady, loadFieldTileset,
} from '../webapp/js/ui/fieldSprites.js'
import { readPng } from '../scripts/pngReader.mjs'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const TILESET = join(root, 'webapp/public/assets/field/dungeon.png')

describe('Размеры набора: плитка пола и кадр фигуры — разные', () => {
  it('пол — это плитка 16×16, а фигура — кадр 32×32', () => {
    // Проверка на самое частое здесь: взять один размер на всё.
    expect(FLOOR_CELL, 'пол должен брать плитку, а не кадр фигуры').toBe(16)
    expect(ANIM_CELL, 'фигура должна брать кадр 32×32').toBe(32)
    expect(FLOOR_CELL, 'размеры совпали — половина набора будет читаться неверно')
      .not.toBe(ANIM_CELL)
  })

  it('взятые номера плиток помещаются в лист', () => {
    expect(existsSync(TILESET), 'нет файла тайлсета в assets/field').toBe(true)
    const img = readPng(TILESET)
    const cols = Math.floor(img.w / FLOOR_CELL)
    const rows = Math.floor(img.h / FLOOR_CELL)
    expect(FLOOR_TILES.length, 'пол собран из одной плитки — это не пол, а заливка цветом')
      .toBeGreaterThanOrEqual(4)
    for (const [r, c] of FLOOR_TILES) {
      expect(r, `ряд плитки ${r} вне листа (строк ${rows})`).toBeLessThan(rows)
      expect(c, `колонка плитки ${c} вне листа (столбцов ${cols})`).toBeLessThan(cols)
      expect(r, 'отрицательный ряд').toBeGreaterThanOrEqual(0)
      expect(c, 'отрицательная колонка').toBeGreaterThanOrEqual(0)
    }
  })

  it('отобранные плитки — средний тон и ровные, то есть это земля, а не стена', () => {
    // Тот же отбор, что делался при подготовке: земля под ногами — средний тон,
    // малый разброс и БЕЗ резкой горизонтальной границы (граница — это стена).
    const img = readPng(TILESET)
    const lum = (x, y) => {
      const i = (y * img.w + x) * 4
      return (img.data[i] * 3 + img.data[i + 1] * 6 + img.data[i + 2]) / 10
    }
    for (const [r, c] of FLOOR_TILES) {
      let sum = 0
      let n = 0
      let mn = 999
      let mx = -1
      const rowsY = []
      for (let dy = 0; dy < FLOOR_CELL; dy++) {
        let rs = 0
        let rn = 0
        for (let dx = 0; dx < FLOOR_CELL; dx++) {
          const l = lum(c * FLOOR_CELL + dx, r * FLOOR_CELL + dy)
          rs += l
          rn++
        }
        rowsY.push(rs / rn)
      }
      for (let dy = 0; dy < FLOOR_CELL; dy++) {
        for (let dx = 0; dx < FLOOR_CELL; dx++) {
          const l = lum(c * FLOOR_CELL + dx, r * FLOOR_CELL + dy)
          sum += l
          n++
          mn = Math.min(mn, l)
          mx = Math.max(mx, l)
        }
      }
      const top = (rowsY[0] + rowsY[1] + rowsY[2]) / 3
      const bot = (rowsY[FLOOR_CELL - 3] + rowsY[FLOOR_CELL - 2] + rowsY[FLOOR_CELL - 1]) / 3
      const mean = sum / n
      const label = `плитка (${r},${c})`
      expect(mean, `${label}: тон ${Math.round(mean)} — это не земля, а пустое место или свечение`)
        .toBeGreaterThan(45)
      expect(mean, `${label}: тон ${Math.round(mean)} — слишком светло для пола подземелья`)
        .toBeLessThan(200)
      expect(Math.abs(top - bot), `${label}: разница верха и низа ${Math.round(Math.abs(top - bot))} — `
        + 'это стена, а не пол. Стена узнаётся по резкой горизонтальной границе')
        .toBeLessThan(45)
      expect(mx - mn, `${label}: разброс ${Math.round(mx - mn)} — на плитке что-то нарисовано, `
        + 'и это будет стоять посреди пола').toBeLessThan(120)
    }
  })
})

describe('Пол собирается один раз и покрывает всю арену', () => {
  let cv = null
  beforeAll(async () => {
    // Стенд обязателен: без него нет ни `document`, ни `Image`, и тайлсет
    // грузиться не будет. Проверка пола — первая, которой понадобился стенд с
    // настоящими пикселями, а не только со списком элементов.
    installDom()
    const ok = await loadFieldTileset()
    expect(ok, 'тайлсет не загрузился — пол будет процедурным').toBe(true)
    cv = buildFloorCanvas(320, 480)
  })

  it('пол готов и лежит на весь мир, а не на кадр', () => {
    expect(floorReady(), 'пол не собран — на экране будет пустота').toBe(true)
    expect(cv, 'buildFloorCanvas вернул пусто').toBeTruthy()
    expect(cv.width, `пол шириной ${cv && cv.width}, а мир 320`).toBe(320)
    expect(cv.height, `пол высотой ${cv && cv.height}, а мир 480`).toBe(480)
  })

  it('повторный сбор возвращает тот же холст, а не новый', () => {
    // Причина, по которой пол вообще собирается заранее: если бы он
    // пересобирался каждый кадр, это было бы тысяча drawImage на кадр.
    const again = buildFloorCanvas(320, 480)
    expect(again, 'повторный сбор вернул null').toBe(cv)
  })

  it('смена размера арены пересобирает пол — иначе пол был бы чужого размера', () => {
    const bigger = buildFloorCanvas(400, 600)
    expect(bigger, 'пол не пересобрался под новую арену').toBeTruthy()
    expect(bigger.width, 'пол остался прежней ширины').toBe(400)
    expect(bigger.height, 'пол остался прежней высоты').toBe(600)
  })

  it('пустая плитка не остаётся: пол покрыт целиком', () => {
    // Дырка в полу видна как «мигание фона» при движении — и заметить её можно
    // только глазами, поэтому проверяем число непрозрачных точек у края.
    const g = cv.getContext('2d')
    const px = g.getImageData(0, 0, Math.min(cv.width, 64), Math.min(cv.height, 64))
    let painted = 0
    for (let i = 3; i < px.data.length; i += 4) if (px.data[i] > 0) painted++
    expect(painted, `в углу пола ${painted} непрозрачных точек из `
      + `${px.data.length / 4} — пол не покрыт`).toBeGreaterThan((px.data.length / 4) * 0.9)
  })
})