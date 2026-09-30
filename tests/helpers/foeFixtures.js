// Подставные оки для тестов. Живут отдельно, чтобы тесты боя не зависели
// от того, что лежит в content/enemies.json.
export function mkFoe(over = {}) {
  return { id: 'krodha', name: 'Кродха', x: 100, y: 300, calmMax: 0.5, hp: 30, ...over }
}

export function mkBossDef(over = {}) {
  return {
    id: 'test_boss', name: 'Владыка', isBoss: true, hp: 40, calmMax: 3,
    moves: [
      { name: 'Удар', intent: 'attack', damage: 8, effects: [{ kind: 'damage', amount: 8, target: 'player' }] },
      { name: 'Покров', intent: 'defend', damage: 0, effects: [{ kind: 'block', amount: 8, target: 'self' }] },
    ],
    onThreshold: { at: 'hp_lte_50', effect: 'rage', log: 'владыка сломался' },
    ...over,
  }
}
