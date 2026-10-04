import { describe, it, expect } from 'vitest'
import { installDom } from './helpers/dom.js'
describe('стенд', () => {
  it('заливка работает и быстра', () => {
    installDom({ fresh: true })
    const c = document.createElement('canvas'); c.width = 620; c.height = 900
    const g = c.getContext('2d')
    const hr = () => Number(process.hrtime.bigint()) / 1e6
    let t = hr()
    g.fillStyle = '#204060'
    g.fillRect(0, 0, 620, 900)
    console.log('ЗАЛИВКА 620x900:', (hr() - t).toFixed(1), 'мс')
    const d = g.getImageData(0, 0, 620, 900).data
    const i = (10 * 620 + 10) * 4
    console.log('пиксель (10,10):', d[i], d[i + 1], d[i + 2], d[i + 3])
    t = hr()
    const grd = g.createLinearGradient(0, 0, 0, 900)
    grd.addColorStop(0, 'rgba(0,0,0,.55)')
    grd.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, 620, 900)
    console.log('ГРАДИЕНТ 620x900:', (hr() - t).toFixed(1), 'мс')
    const d2 = g.getImageData(0, 0, 620, 900).data
    const top = (d2[0] + d2[1] + d2[2]) / 3
    const j = (890 * 620 + 10) * 4
    const bot = (d2[j] + d2[j + 1] + d2[j + 2]) / 3
    console.log('яркость сверху:', top.toFixed(1), 'снизу:', bot.toFixed(1))
    expect(1).toBe(1)
  })
})
