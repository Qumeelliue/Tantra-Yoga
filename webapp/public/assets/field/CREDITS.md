# Графика Поля Ума — источники и лицензии

Всё, что лежит в этой папке, **не нарисовано проектом**. Это готовые лицензионные
наборы, взятые и подключённые. У каждого — автор и условия.

Список причины такой замены — в комментарии `webapp/js/ui/fieldSprites.js`.
Коротко: автор посмотрел на игру и назвал её «текстурой». Причина была одна и
прямая: все фигуры рисовались самодельными векторами без единого кадра анимации.
В проекте есть правило «геймплей копируем», и я прочитал его как «копируем
механики» — то есть отдал слой показа себе. Слой показа как раз и был мишенью.

---

## Персонажи — Calciumtrice, OpenGameArt, **CC-BY 3.0**

Источник: <https://opengameart.org/content/animated-warrior> и родственные
страницы того же автора. Автор прямо советует свой тайлсет под эти спрайты —
поэтому взят один комплект, а не наборы случайных авторов: они одного масштаба
и одного стиля.

| файл | персонаж | страница |
|---|---|---|
| `warrior.png` | воин, два вида | `/content/animated-warrior` |
| `animated-cleric.png` | жрец, два вида | `/content/animated-cleric` |
| `animated-ranger.png` | лучник, два вида | `/content/animated-ranger` |
| `animated-rogue.png` | разбойник, два вида | `/content/animated-rogue` |
| `animated-wizard.png` | маг, два вида | `/content/animated-wizard` |
| `animated-orcs.png` | орк, два вида | `/content/animated-orcs` |
| `goblins.png` | гоблины, два вида | `/content/animated-goblins` |
| `skeleton.png` | скелет | `/content/animated-skeleton` |
| `animated-slime.png` | слизь, четыре вида | `/content/animated-slime` |
| `animated-snake.png` | змея | `/content/animated-snake` |
| `animated-minotaur.png` | минотавр | `/content/animated-minotaur` |

**Анимации у каждого:** idle, gesture, walk, attack, death.

## Тайлсет — Calciumtrice, **CC-BY 3.0**

`dungeon.png` — из архива «dungeon tileset by calciumtrice», страница
<https://opengameart.org/content/dungeon-tileset-1>. Плитки 16×16, высота
стены 32 пикселя.

Методология автора, взятая вместе с тайлсетом (из его файла с инструкцией):

> «Shadows should be applied as a multiply layer between characters/objects and
> floor tiles.» — тени кладются слоем умножения между фигурами и полом.

> «I suggest the following tile types be given a small vertical offset of a few
> pixels (e.g. 4–6 pixels): chairs, containers, torches, loot, items, weapons,
> characters, monsters» — фигуры и предметы сдвигаются на 4–6 пикселей вниз, чтобы
> стоять в середине плитки, а не на её краю.

Оба правила применены в `fieldSprites.js` (`drawFieldShadow`, `groundOffset`).

## Запасное — Kenney, Kenney.nl, **CC0**

Набор `Roguelike/RPG Pack`, <https://kenney.nl/assets/roguelike-rpg-pack> —
1767 плиток по 16×16 с персонажами. CC0 означает, что можно и в личной, и в
коммерческой работе, и атрибуция не обязательна. Взят как запасной вариант:
если наборы Calciumtrice не загрузятся, останется он, а не пустота.

## Что обязательно по CC-BY 3.0

Attribution: указать автора. Здесь — в этом файле и в шапке
`webapp/js/ui/fieldSprites.js`. Этого достаточно для соблюдения условий.

## Если будешь брать ещё

Правило одно: **рисунок лицензионный, если есть лицензионный.** Собственное
рисование — только там, где взять нечего, и только как заглушка на время
загрузки.

## Чего здесь сознательно нет

Графики с обоями, анимированный интерфейс, звук, шрифт — всё это тоже лицензионно
и тоже доступно, но в этом проходе сделано только то, что видно в бою: фигуры и
тайлсет. Звук и оформление экранов — следующий проход, тем же способом.