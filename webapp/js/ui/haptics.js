// Тактильный фидбек (Telegram HapticFeedback API, Bot API 6.1+).
// Фолбэк на navigator.vibrate для браузера. Тихая обёртка: ни один вызов не падает.
// Правила «как не раздражать» (§исследование): 1 смысл на событие, анти-спам 150мс,
// в «покое» (самадхи) — ноль вибраций.

let enabled = true
let last = 0

export function setHaptics(on) { enabled = on }

function tg() {
  try { return window.Telegram?.WebApp?.HapticFeedback || null } catch { return null }
}

function throttled(ts) {
  const now = Date.now()
  if (now - last < 150) return false
  last = now
  return true
}

export const haptics = {
  // «удар»: light / medium / heavy / rigid / soft
  impact(style) {
    if (!enabled || !throttled()) return
    const h = tg()
    if (h) { try { h.impactOccurred(style) } catch {} return }
    try { navigator.vibrate && navigator.vibrate(style === 'light' || style === 'soft' ? 15 : 35) } catch {}
  },
  // итог: error / success / warning
  notify(type) {
    if (!enabled || !throttled()) return
    const h = tg()
    if (h) { try { h.notificationOccurred(type) } catch {} return }
    try { navigator.vibrate && navigator.vibrate(type === 'success' ? [20, 40, 20] : type === 'error' ? 40 : 25) } catch {}
  },
  // смена выбора (не подтверждение!)
  selection() {
    if (!enabled || !throttled()) return
    const h = tg()
    if (h) { try { h.selectionChanged() } catch {} }
  },
}
