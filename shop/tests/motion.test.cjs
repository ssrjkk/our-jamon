// Гейт слоя движения и линейки выдержки.
//
// Движение — единственный класс правок, который не видно на скриншоте и который нельзя
// поймать глазами: анимация, не заглушённая под «меньше движения», и правило, прячущее
// текст до первого кадра, выглядят одинаково ровно. Поэтому здесь проверяются не вкус,
// а инварианты: откуда берутся длительности, что имеет право держать opacity: 0, чем
// заканчивается каждый кадр и какой слой перекрывает клик.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSystem } = require('./helpers.cjs');

const root = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8');
// Комментарии вырезаются с сохранением переводов строк: селектор должен быть тем, что
// читает браузер, а номер строки в отчёте — тем, где сидит правка.
const css = raw.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '));
const строка = (позиция) => raw.slice(0, позиция).split('\n').length;

const правила = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map((match) => ({ sel: match[1].trim().replace(/\s+/g, ' '), body: match[2], line: строка(match.index) }))
  .filter((правило) => !правило.sel.startsWith('@'));

const корень = (/:root\s*\{([\s\S]*?)\n\}/.exec(css) || [])[1] || '';
const токен = (имя) => (new RegExp(`${имя}\\s*:\\s*([^;]+);`).exec(корень) || [])[1]?.trim();

/** Тело @keyframes по имени: вложенные фигурные скобки ломают плоский разбор, поэтому рамка ищется по балансу. */
function кадры(имя) {
  const начало = css.indexOf(`@keyframes ${имя}`);
  assert.notEqual(начало, -1, `globals.css: нет @keyframes ${имя}`);
  let глубина = 0;
  let конец = css.indexOf('{', начало);
  for (let i = конец; i < css.length; i += 1) {
    if (css[i] === '{') глубина += 1;
    else if (css[i] === '}' && (глубина -= 1) === 0) { конец = i; break; }
  }
  const out = new Map();
  const тело = css.slice(css.indexOf('{', начало) + 1, конец);
  // Кадры пишутся и поодиночке, и списком (`0%, 100% { … }`): без разбора списка
  // проверка ниже не увидела бы финального кадра и упала бы на правильном CSS.
  for (const m of тело.matchAll(/((?:from|to|\d+%)(?:\s*,\s*(?:from|to|\d+%))*)\s*\{([^}]*)\}/g)) {
    for (const селектор of m[1].split(',')) {
      const ключ = селектор.trim();
      out.set(ключ === 'from' ? '0%' : ключ === 'to' ? '100%' : ключ, m[2].trim().replace(/\s+/g, ' '));
    }
  }
  return out;
}

const нормаль = (тело) => тело.replace(/;\s*$/, '').trim();
const миллисекунды = (значение) => {
  const m = /^([\d.]+)(ms|s)$/.exec(значение);
  assert.ok(m, `длительность «${значение}» не читается`);
  return Number(m[1]) * (m[2] === 's' ? 1000 : 1);
};

/** Значение токена длительности: кратная ступень шкалы пишется как calc(var(--dur-enter) * 1.6). */
function длительностьТокена(имя) {
  const значение = токен(имя);
  assert.ok(значение, `globals.css: в :root нет токена ${имя}`);
  const кратное = /^calc\(var\((--[\w-]+)\)\s*\*\s*([\d.]+)\)$/.exec(значение);
  if (!кратное) return миллисекунды(значение);
  return длительностьТокена(кратное[1]) * Number(кратное[2]);
}

/** [начало, конец) сбалансированного блока по заголовку: вложенные скобки ломают плоский разбор. */
function диапазон(текст, заголовок) {
  const начало = текст.indexOf(заголовок);
  assert.notEqual(начало, -1, `globals.css: нет блока ${заголовок}`);
  let глубина = 0;
  for (let i = текст.indexOf('{', начало); i < текст.length; i += 1) {
    if (текст[i] === '{') глубина += 1;
    else if (текст[i] === '}' && (глубина -= 1) === 0) return [начало, i + 1];
  }
  assert.fail(`globals.css: блок ${заголовок} не закрыт`);
}

// 1. Одна шкала длительностей. Правило без токена — это цифра, которую потом никто не
// сводит с остальными, а «кратно круче» набирается именно из таких цифр.
test('длительности и кривые движения живут токенами, в правилах нет сырых секунд', () => {
  const порядок = ['--dur-press', '--dur-control', '--dur-enter', '--dur-wipe', '--dur-ambient'];
  const значения = порядок.map((имя) => длительностьТокена(имя));
  for (let i = 1; i < значения.length; i += 1) {
    assert.ok(значения[i] > значения[i - 1], `${порядок[i]}=${значения[i]}мс не длиннее ${порядок[i - 1]}=${значения[i - 1]}мс — шкала неупорядочена`);
  }
  for (const имя of ['--ease-cut', '--ease-settle', '--stagger', '--reveal-shift', '--reveal-bleed']) {
    assert.ok(токен(имя), `globals.css: в :root нет токена ${имя}`);
  }
  // Край маски обязан смотреть наружу узла: положительный bleed срезал бы рамку,
  // скругление и тень самого узла, и «приехавший» заголовок остался бы с откушенным углом.
  const bleed = /^(-?[\d.]+)(em|rem|px)$/.exec(токен('--reveal-bleed'));
  assert.ok(bleed, `--reveal-bleed=${токен('--reveal-bleed')} не длина`);
  assert.ok(Number(bleed[1]) < 0, `--reveal-bleed=${токен('--reveal-bleed')} не отрицательный: конечный кадр режет сам узел`);
  assert.equal(токен('--ease-settle').includes('cubic-bezier'), true, '--ease-settle не пружинная кривая: посадка контролов перестала быть посадкой');

  const внеКорня = css.replace(корень, '');
  // Единственное место, где длительность — не выбор дизайна, а выключатель: блок
  // «меньше движения». Исключение привязано к диапазону этого блока, а не к списку
  // селекторов, и ниже у него свой числовой потолок — лазейка не может спрятать анимацию.
  const резерв = диапазон(внеКорня, '@media (prefers-reduced-motion: reduce)');
  const declarations = [...внеКорня.matchAll(/\b((?:transition|animation)(?:-[a-z-]+)?)\s*:\s*([^;{}]+)/g)];
  const сырые = (текст, [начало, конец]) => [...текст.matchAll(/\b((?:transition|animation)(?:-[a-z-]+)?)\s*:\s*([^;{}]+)/g)]
    .filter((m) => /(?:^|[\s,(])[\d.]+m?s\b/.test(m[2]))
    .filter((m) => m.index < начало || m.index >= конец)
    .map((m) => `${m[1]}: ${m[2].trim()}`);
  assert.ok(declarations.length >= 20, `правил движения стало ${declarations.length} — свип теряет опору`);
  assert.deepEqual(сырые(внеКорня, резерв), [], 'длительность задана цифрой в правиле, а не токеном шкалы');

  /** Чем блок «меньше движения» перестаёт быть выключателем: длительностью больше миллисекунды либо без !important. */
  const щели = (блок) => [...блок.matchAll(/\b((?:transition|animation)(?:-[a-z-]+)?)\s*:\s*([^;{}]+)/g)]
    .filter((m) => /(?:^|[\s,(])[\d.]+m?s\b/.test(m[2]))
    .filter((m) => !/!important/.test(m[2]) || миллисекунды(/((?:[\d.]+)m?s)\b/.exec(m[2])[1]) > 1)
    .map((m) => `${m[1]}: ${m[2].trim()}`);
  const блок = внеКорня.slice(...резерв);
  for (const имя of ['transition-duration', 'animation-duration']) {
    assert.match(блок, new RegExp(`${имя}\\s*:\\s*[\\d.]+m?s\\s*!important`), `блок «меньше движения» не заглушает ${имя}: движение туда доезжает`);
  }
  assert.deepEqual(щели(блок), [], 'длительность в блоке «меньше движения» не выключена: заглушка обязана быть ≤1мс и с !important');
  // Детектор обязан быть живым: заглушить его так же легко, как и забыть.
  assert.equal(/(?:^|[\s,(])[\d.]+m?s\b/.test('0.22s var(--ease-cut)'), true, 'детектор сырых длительностей не видит заведомое нарушение');
  assert.equal(/(?:^|[\s,(])[\d.]+m?s\b/.test('var(--dur-control) var(--ease-cut)'), false, 'детектор считает нарушением токен');
  // Длительность всё чаще живёт в длинной форме (`animation-delay`), а не в шортханде:
  // без захвата суффикса детектор молчал бы ровно на тех правилах, что пишет слой движения.
  assert.equal(/\b((?:transition|animation)(?:-[a-z-]+)?)\s*:/.test('animation-delay: calc(var(--reveal-i, 0) * var(--stagger));'), true,
    'детектор не видит длинную форму animation-*');
  assert.equal(/(?:^|[\s,(])[\d.]+m?s\b/.test('calc(var(--reveal-i, 0) * 70ms)'), true,
    'детектор не видит сырую длительность внутри calc');
  // Лазейка «меньше движения» обязана быть ровно размером с блок: та же сырая длительность
  // сразу за его скобкой остаётся нарушением, а заглушка тяжелее миллисекунды или без
  // !important ловится внутри него.
  const проба = `${внеКорня.slice(0, резерв[1])}\n.btn-x { animation-duration: .45s }\n`;
  assert.deepEqual(сырые(проба, диапазон(проба, '@media (prefers-reduced-motion: reduce)')), ['animation-duration: .45s'],
    'исключение шире блока «меньше движения»: сырую длительность вне него не поймать');
  assert.equal(щели(блок.replace('transition-duration: .01ms !important', 'transition-duration: .45s !important')).length, 1,
    'выключатель тяжелее миллисекунды не ловится');
  assert.equal(щели(блок.replace('animation-duration: .01ms !important', 'animation-duration: .01ms')).length, 1,
    'заглушка без !important не ловится: её перебивает любое правило');
});

// 2. Скрытое до первого кадра — единственная правка, которая может оставить покупателя
// перед пустым экраном, если JavaScript не дожил до анимации. Поэтому прячет только
// атрибут слоя движения.
test('прячет текст только слой движения, и ни одно правило не делает это в обход него', () => {
  const скрытые = правила.filter((п) => /\[data-reveal\]/.test(п.sel) && /opacity:\s*0(?:[;\s]|$)/.test(п.body));
  assert.ok(скрытые.length >= 1, 'правило, прячущее [data-reveal], исчезло из globals.css — свип стал пустым');
  for (const правило of скрытые) {
    assert.match(правило.sel, /\[data-motion="on"\]/, `globals.css:${правило.line}: ${правило.sel} прячет контент без атрибута слоя движения`);
  }
  assert.equal(правила.some((п) => /^\[data-reveal\](?![^[]*data-motion)/.test(п.sel) && /opacity:\s*0/.test(п.body)), false,
    'появилось голое [data-reveal] с opacity: 0: без JavaScript раздел не отрисуется никогда');
  // Чем именно слой отмечает показанный узел — не косметика: отметка обязана быть такой,
  // чтобы повторный обход не переставлял её заново на каждом кадре. Класс для этого не
  // годился бы ещё и потому, что его пришлось бы вычищать из CSS при каждой правке.
  const слой = fs.readFileSync(path.join(root, 'components/Motion.tsx'), 'utf8');
  assert.match(слой, /setProperty\('--reveal-name'/, 'слой движения перестал отмечать показ кастомным свойством — свип ниже потерял опору');
  assert.doesNotMatch(слой, /classList\.add\('is-revealed'\)/,
    'слой движения снова пишет класс на узел до гидратации: React выдаёт «attributes of the server rendered HTML didn\'t match»');
  assert.doesNotMatch(css, /\.is-revealed/, 'в globals.css осталось правило .is-revealed: показ узла снова привязан к классу');
});

// 2.5. Отметка показа ставится на узел, который React ещё не догидратировал (панель
// каталога за отложенной границей). React 19 сверяет DOM-атрибуты с пропами, и ЛЮБОЙ
// чужой атрибут — хоть класс, хоть style — печатает «A tree hydrated but some attributes
// of the server rendered HTML didn't match». Снимается это только самим узлом:
// suppressHydrationWarning. Терять его по девяти файлам нельзя, поэтому якорь показа
// и снятие сверки выдаются одним пропом.
test('каждый узел под показ слоя помечен revealProps, а не руками', () => {
  const helper = fs.readFileSync(path.join(root, 'lib/reveal.ts'), 'utf8');
  assert.match(helper, /suppressHydrationWarning:\s*true/, 'lib/reveal.ts: revealProps перестал снимать сверку атрибутов — ошибка гидратации вернётся на каждой карточке');
  assert.match(helper, /'data-reveal':\s*true/, 'lib/reveal.ts: revealProps больше не ставит data-reveal, и правило слоя остаётся без якоря');

  const файлы = [];
  for (const папка of ['app', 'components']) {
    const обход = (каталог) => {
      for (const имя of fs.readdirSync(каталог)) {
        const полный = path.join(каталог, имя);
        if (fs.statSync(полный).isDirectory()) обход(полный);
        else if (/\.tsx$/.test(имя)) файлы.push(полный);
      }
    };
    обход(path.join(root, папка));
  }
  // Комментарии и строки вырезаются: querySelectorAll('[data-reveal]') — это селектор
  // слоя, а упоминание в комментарии — рассуждение, а не разметка.
  const внеСтрок = (текст) => текст
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, "''")
    .replace(/\/\/[^\n]*/g, '');
  // Дальше сверяется только вырезанный текст: комментарий про revealProps не обязан
  // тащить импорт, а разметка — обязана.
  const код = new Map(файлы.map((файл) => [файл, внеСтрок(fs.readFileSync(файл, 'utf8'))]));
  const руками = файлы.filter((файл) => /data-reveal/.test(код.get(файл)));
  // Срезание строк и комментариев не должно ослепить детектор: разметка обязана остаться видимой.
  assert.match(внеСтрок('<article data-reveal>\n// data-reveal\nconst с = ' + JSON.stringify('[data-reveal]') + ';\n'), /^<article data-reveal>/,
    'детектор вырезает вместе со строками и саму разметку: проверка ничего не обещает');
  assert.deepEqual(руками.map((файл) => path.relative(root, файл)), [],
    'data-reveal проставлен руками: у этих узлов сверка атрибутов не снята, и браузер снова видит ошибку гидратации');
  // Импорт требует тот же файл, что и разметка: строка модуля вырезается вместе со
  // строками, поэтому здесь сверка по исходному тексту, но только по фактическим узлам.
  // Помечает узел любой из двух хелперов, и файл вправе взять только один: панель фото-
  // выборов (BuyerChoices) размечена целиком срезами, и revealProps ей не нужен.
  const разметка = файлы.filter((файл) => /\{\.\.\.reveal(Props|Into\()/.test(код.get(файл)));
  assert.ok(разметка.length >= 6, `файлов с разметкой показа всего ${разметка.length}: каталог и главная размечаются разными руками`);
  const безИмпорта = разметка.filter((файл) => !/import \{[^}]*\breveal(Props|Into)\b[^}]*\} from '@\/lib\/reveal';/.test(fs.readFileSync(файл, 'utf8')));
  assert.deepEqual(безИмпорта.map((файл) => path.relative(root, файл)), [], 'revealProps/revealInto используется без импорта из lib/reveal');
  // Четыре панели вкладок скрываются до перехода по вкладке, и разметить их «по ходу»
  // легче всего забыть: замер 2026-11-14 дал 0 узлов под показом в #scenarios, #shop,
  // #buyer-choices и #weight-system против 6 в #aging — то есть три панели из семи жила
  // без лесенки. Браузерный гейт ловит это только после клика по вкладке, здесь опора —
  // сам файл панели.
  const панели = ['Scenarios', 'BuyerChoices', 'ShopPanel', 'ScaleTerminal']
    .map((имя) => `components${path.sep}${имя}.tsx`);
  const размечено = new Set(разметка.map((файл) => path.relative(root, файл)));
  assert.deepEqual(панели.filter((имя) => !размечено.has(имя)), [],
    'файл панели вкладок остался без revealProps: показывать на панели нечего, и видна панель только после перехода по вкладке');
  const подъёмы = файлы.reduce((сумма, файл) => сумма + (код.get(файл).match(/\{\.\.\.revealProps\}/g) || []).length, 0);
  const срезы = файлы.reduce((сумма, файл) => сумма + (код.get(файл).match(/\{\.\.\.revealInto\(/g) || []).length, 0);
  assert.ok(подъёмы + срезы >= 20, `разметок показа осталось ${подъёмы} + ${срезы}: замер 2026-11-14 даёт 11 + 12, и меньше двадцати — это снятая панель`);
  assert.ok(срезы >= 10, `разметок revealInto осталось ${срезы}: вариант снят, и панель вернулась к одному подъёму на все узлы`);

  // Вариант появления живёт в трёх местах и обязан называть одно и то же: разметка
  // (revealInto('mask')), слой («nh-» + data-reveal-into) и CSS (@keyframes nh-mask).
  // Расхождение здесь не выглядит ошибкой: animation-name без такого кадра не запускается,
  // базовое правило оставляет узлу opacity: 0, и на скриншоте это пустое место там, где
  // только что был заголовок. Строки в этих файлах — аргументы, а не рассуждения, поэтому
  // вырезаются только комментарии.
  const внеКомментариев = (текст) => текст.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const имена = файлы.flatMap((файл) => [...внеКомментариев(fs.readFileSync(файл, 'utf8')).matchAll(/revealInto\('([a-z-]+)'\)/g)].map((m) => m[1]));
  assert.deepEqual([...new Set(имена)].filter((имя) => !css.includes(`@keyframes nh-${имя}`)), [],
    'у варианта появления нет @keyframes с тем же именем: узел останется вырезанным навсегда');
  assert.deepEqual(имена.filter((имя) => !['mask', 'clip'].includes(имя)), [],
    'revealInto вызван с вариантом, которого нет в сигнатуре lib/reveal.ts');
  assert.match(helper, /'data-reveal-into':\s*into/, 'lib/reveal.ts: revealInto больше не передаёт вариант атрибутом, и слой его не прочитает');
  const слой = fs.readFileSync(path.join(root, 'components/Motion.tsx'), 'utf8');
  assert.match(слой, /`nh-\$\{node\.dataset\.revealInto \|\| 'rise'\}`/,
    'components/Motion.tsx: слой перестал читать вариант из разметки — срез и шторка снова стали подъёмом');
});

// 2.6. Порядок атрибутов в JSX решает, ругается ли React. `<article {...revealProps}
// key={…}>` лишает transform знания о статических детях, и React печатает «Each child in a
// list should have a unique "key" prop» на каждый дочерний узел карточки — четыре предупреждения
// на главную, которые ловит браузерный гейт «без ошибок скриптов». С `key` первым тем же
// узлом warning исчезает, поэтому правило держится на порядке, а не на догадке.
test('key стоит до spread: иначе React считает детей карточек списком без ключей', () => {
  const внеСтрок = (текст) => текст
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, "''")
    .replace(/\/\/[^\n]*/g, '');
  const нарушения = (исходник) => [...внеСтрок(исходник).matchAll(/<([A-Za-z][\w.]*)((?:[^<>]|=>)*)>/g)]
    .filter(([, имя, атрибуты]) => {
      const spread = атрибуты.search(/\{\s*\.\.\./);
      const key = атрибуты.search(/(?:^|[\s{])key=/);
      return spread >= 0 && key > spread;
    })
    .map(([, имя]) => имя);

  // Детектор обязан видеть и нарушение, и норму: без этой пары проверка — машина молчания.
  assert.deepEqual(нарушения('<article {...revealProps} key={stage.query}><p>а</p></article>'), ['article'],
    'детектор не видит заведомый spread-перед-key: предупреждение React вернётся незамеченным');
  assert.deepEqual(нарушения('<article key={stage.query} {...revealProps}><p>а</p></article>'), [],
    'детектор считает нормой заведомую норму: key первым не должен попадать в нарушение');
  assert.deepEqual(нарушения('<button type="button" onClick={() => set(1)} {...revealProps}>Сброс</button>'), [],
    'детектор спотыкается про стрелочную функцию внутри тега');

  const файлы = [];
  for (const папка of ['app', 'components']) {
    const обход = (каталог) => {
      for (const имя of fs.readdirSync(каталог)) {
        const полный = path.join(каталог, имя);
        if (fs.statSync(полный).isDirectory()) обход(полный);
        else if (/\.tsx$/.test(имя)) файлы.push(полный);
      }
    };
    обход(path.join(root, папка));
  }
  const найденные = файлы.flatMap((файл) => нарушения(fs.readFileSync(файл, 'utf8')).map(() => path.relative(root, файл).replace(/\\/g, '/')));
  assert.deepEqual(найденные, [], 'key стоит после spread: React печатает предупреждение про ключи на каждого ребёнка этих узлов');
});

// 2.7. Геометрия среза. Кадры nh-mask и nh-clip — единственное, что отличает «фотография
// выезжает из-под края» от «появилась из ниоткуда», и самое хрупкое место правки: опечатка
// в стороне inset() или потерянный в кадре opacity не ломают сборку, не видны в typecheck и
// на одном скриншоте. Итог всегда один — пустое место там, где только что был заголовок:
// базовое правило держит узел на opacity: 0, а кадр без этого свойства его не снимает.
test('срез и шторка стартуют вырезанными целиком и приезжают без следа', () => {
  /** Разбор inset() по сторонам: пробел внутри calc() — часть значения, а не разделитель. */
  function стороны(значение) {
    const m = /^inset\((.+)\)$/.exec(значение.trim());
    assert.ok(m, `вырез не разбивается на стороны: «${значение}»`);
    const части = [];
    let текущее = '';
    let глубина = 0;
    for (const символ of m[1].replace(/\s+/g, ' ').trim()) {
      if (символ === '(') глубина += 1;
      else if (символ === ')') глубина -= 1;
      if (символ === ' ' && глубина === 0) {
        if (текущее) части.push(текущее);
        текущее = '';
        continue;
      }
      текущее += символ;
    }
    if (текущее) части.push(текущее);
    assert.ok(части.length === 1 || части.length === 4, `inset задан ${части.length} сторонами, а не одной и не четырьмя: «${значение}»`);
    return части.length === 4 ? части : [части[0], части[0], части[0], части[0]];
  }
  const свойства = (тело) => Object.fromEntries([...тело.matchAll(/([a-z-]+)\s*:\s*([^;]+)/g)].map((m) => [m[1], m[2].trim()]));
  const кадр = (имя, ключ) => {
    const тело = кадры(имя).get(ключ);
    assert.ok(тело, `globals.css: у @keyframes ${имя} нет кадра ${ключ}`);
    return свойства(тело);
  };
  // top right bottom left: заголовок срезается справа (едет слева направо), фотография —
  // сверху (шторка поднимается от нижнего края).
  const ход = [['nh-mask', 1], ['nh-clip', 0]];
  for (const [имя, сторона] of ход) {
    const начало = кадр(имя, '0%');
    const конец = кадр(имя, '100%');
    assert.equal(начало.opacity, '1', `${имя} 0%: в кадре нет opacity: 1 — узел стартует невидимым`);
    assert.equal(конец.opacity, '1', `${имя} 100%: в кадре нет opacity: 1 — после анимации узел снова скрыт`);
    assert.deepEqual(стороны(начало['clip-path']),
      ['var(--reveal-bleed)', 'var(--reveal-bleed)', 'var(--reveal-bleed)', 'var(--reveal-bleed)']
        .map((значение, индекс) => (индекс === сторона ? 'calc(100% - var(--reveal-bleed))' : значение)),
      `${имя} 0%: вырез не уходит за 100% по нужной стороне — появления нет, есть только движение`);
    assert.deepEqual(стороны(конец['clip-path']), Array(4).fill('var(--reveal-bleed)'),
      `${имя} 100%: вырез не свёрнут в bleed — у узла остаётся отрезанный край, рамка или тень`);
  }
  // Шторка едет вместе с подъёмом, и финальный кадр обязан вернуть transform: none, иначе
  // фотография останется сдвинутой после окончания хода.
  assert.match(кадр('nh-clip', '0%').transform, /translateY\(calc\(var\(--reveal-shift\) \* [\d.]+\)\)/,
    'nh-clip 0%: шторка перестала стартовать со сдвигом — ход совпал с чистой маской');
  assert.equal(кадр('nh-clip', '100%').transform, 'none', 'nh-clip 100%: transform не снят — узел доезжает смещённым');

  // Порядок в файле = порядок каскада: у базового правила и перекрытия одинаковая
  // специфичность, и более длинная выдержка доезжает до узла, только если стоит ниже.
  // Перестановка местами молчалива: анимация остаётся, просто едет в 1.6 раза быстрее
  // задуманного, и на скриншоте разницу не увидеть.
  const база = правила.findIndex((п) => п.sel === '[data-motion="on"] [data-reveal]');
  const поверх = правила.findIndex((п) => п.sel === '[data-motion="on"] [data-reveal-into]');
  assert.ok(поверх > база && база >= 0,
    `перекрытие длительности среза стоит на ${поверх}, базовое правило на ${база}: одинаковая специфичность, ниже — побеждает`);
  assert.match(правила[поверх].body, /animation-duration:\s*var\(--dur-wipe\)/,
    'перекрытие берёт длительность не из --dur-wipe: шкала среза снова разъехалась со шкалой подъёма');
  assert.ok(длительностьТокена('--dur-wipe') > длительностьТокена('--dur-enter'),
    `--dur-wipe=${длительностьТокена('--dur-wipe')}мс не длиннее --dur-enter=${длительностьТокена('--dur-enter')}мс: срез короче подъёма`);
});

// 3. Глобальный медиазапрос reduce обрывает анимацию на первом же кадре, поэтому цикл,
// у которого 0% и 100% разные, оставил бы слой в чужом состоянии навсегда.
test('зацикленные кадры нейтральны к обрыву, а разовые заканчиваются видимым состоянием', () => {
  // Медиазапрос целиком: плоский разбор правил съедает его контекст, а именно здесь
  // живёт механизм, на котором держатся все инварианты ниже.
  const снижено = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/.exec(css);
  assert.ok(снижено, 'globals.css: нет медиазапроса prefers-reduced-motion');
  assert.match(снижено[1], /animation-duration:\s*\.01ms\s*!important/, 'под reduce длительность цикла не обрывается');
  assert.match(снижено[1], /transition-duration:\s*\.01ms\s*!important/, 'под reduce переходы не обрываются');
  for (const имя of ['nh-light', 'nh-breathe']) {
    const карта = кадры(имя);
    assert.ok(карта.has('0%') && карта.has('100%'), `@keyframes ${имя}: нет пары 0%/100%`);
    assert.equal(нормаль(карта.get('100%')), нормаль(карта.get('0%')), `@keyframes ${имя}: 0% и 100% расходятся — под reduce цикл обрывается на чужом кадре`);
  }
  const rise = кадры('nh-rise');
  assert.match(нормаль(rise.get('100%')), /opacity:\s*1/, 'nh-rise заканчивается невидимым состоянием: текст остаётся спрятанным после показа');
  assert.match(нормаль(rise.get('100%')), /transform:\s*none/, 'nh-rise заканчивается со смещением: строка встала бы не на своё место');
  for (const [имя, ожидание] of [['nh-pop', /scale\(1\)/], ['nh-rule', /scaleX\(1\)/]]) {
    assert.match(нормаль(кадры(имя).get('100%')), ожидание, `@keyframes ${имя}: последний кадр не тождественный — посадка оставляет контрол изменённым`);
  }
});

// 4. Псевдоэлемент участвует в hit-testing: декоративная плёнка поверх карточки забирает
// клик у того, что под ней. Именно так блик на стекле витрины выключает ссылку.
test('ни один покрывающий псевдоэлемент не перехватывает клик', () => {
  const покрывала = правила.filter((п) =>
    /::(?:before|after)$/.test(п.sel) && /position:\s*(?:absolute|fixed)/.test(п.body) && /\binset:/.test(п.body));
  assert.ok(покрывала.length >= 4, `покрывающих псевдоэлементов стало ${покрывала.length} — свип теряет опору`);
  const глухие = покрывала.filter((п) => !/pointer-events:\s*none/.test(п.body));
  assert.deepEqual(глухие.map((п) => `globals.css:${п.line} ${п.sel}`), [], 'декоративный слой перекрывает клики: нужен pointer-events: none');
});

// 5. Индикатор вкладок рисуется JavaScript'ом, поэтому правило, которое убирает рамку
// у выбранного таба, обязано включаться только когда измерение удалось. Иначе при
// мёртвом скрипте раздел остаётся без единого признака выбора.
test('черта вкладок не остаётся единственным признаком выбранного раздела', () => {
  const снимаетРамку = правила.filter((п) => /\.site-tabs/.test(п.sel) && /aria-selected="true"/.test(п.sel) && /border-color:\s*transparent/.test(п.body));
  assert.ok(снимаетРамку.length >= 1, 'правило «черта вместо рамки» пропало — свип стал пустым');
  for (const правило of снимаетРамку) {
    assert.match(правило.sel, /\[data-tabs-ready\]/, `globals.css:${правило.line}: рамка снимается до того, как черта измерена`);
  }
  const черта = правила.find((п) => /\.tab-underline$/.test(п.sel));
  assert.ok(черта, 'globals.css: нет правила .tab-underline');
  assert.match(черта.body, /opacity:\s*0/, '.tab-underline стартует не с нулевой прозрачности: черта мигнёт в углу панели');
  assert.ok(правила.some((п) => /\[data-tabs-ready\][^{]*\.tab-underline/.test(п.sel) && /opacity:\s*1/.test(п.body)),
    'нет правила, показывающего черту после измерения — индикатор не появится никогда');
});

// 6. Полоса прочитанного и тень шапки — тоже движение, и оно обязано ехать по переменным
// слоя, а не по hardcoded-процентам.
test('полоса прочитанного в шапке растёт от переменной слоя', () => {
  const полоса = правила.find((п) => /\.site-header::after$/.test(п.sel));
  assert.ok(полоса, 'globals.css: нет правила .site-header::after');
  assert.match(полоса.body, /transform:\s*scaleX\(var\(--scroll/, 'globals.css:' + полоса.line + ': полоса не следует за --scroll');
  assert.match(полоса.body, /transform-origin:\s*left/, 'полоса растёт из центра, а не от левого края');
  assert.ok(правила.some((п) => /\.site-header\[data-scrolled\]/.test(п.sel) && /box-shadow/.test(п.body)),
    'нет тени шапки под data-scrolled: атрибут слоя движения ничего не меняет');
});

// 6.5 Ореол основного действия — отклик, который по умолчанию видит только мышь. Если он
// не дублируется на :focus-visible, клавиатура теряет признак, а если правило утекло за
// атрибут слоя — кнопка светится и под «меньше движения».
test('ореол основного действия доступен с клавиатуры и только в работающем профиле', () => {
  // «box-shadow» встречается и внутри transition той же базовой кнопки, поэтому ищется
  // именно объявление свойства, а не упоминание имени.
  const ореол = правила.filter((п) => /(?:^|;)\s*box-shadow\s*:/.test(п.body) && /(?:\.btn-primary|\.add-btn)/.test(п.sel));
  assert.ok(ореол.length >= 2, `правил ореола найдено ${ореол.length}: нечего сверять — свечение кнопки исчезло или переехало`);
  for (const правило of ореол) {
    assert.match(правило.sel, /\[data-motion="on"\]/, `globals.css:${правило.line}: ореол рисуется вне атрибута слоя движения`);
    assert.match(правило.body, /var\(--/, `globals.css:${правило.line}: ореол задан сырым цветом, а не токеном палитры`);
  }
  assert.equal(ореол.some((п) => /:hover/.test(п.sel)), true, 'ореол пропал с наведения: основной кнопке нечего показать мышью');
  assert.equal(ореол.some((п) => /:focus-visible/.test(п.sel)), true, 'ореол остался только на мыши: с клавиатуры основной отклик не виден');
  assert.match((ореол.find((п) => /:hover/.test(п.sel)) || { sel: '' }).sel, /:hover:not\(:disabled\)/,
    'ореол включается и на отключённой кнопке: обещание действия там, где его нет');
});

// 6.6 Параллакс первого экрана. Три инварианта, и ни один не виден на скриншоте:
// множители разного знака (иначе это сдвиг блока, а не расхождение), смещение живёт на
// отдельном свойстве translate (анимация transform на дышащем кадре перебила бы его в
// каскаде), и значение слоя ограничено одним экраном (иначе узлы уехали бы за пределы).
test('параллакс первого экрана едет на токенах разного знака и на translate', () => {
  const множители = ['--parallax-copy', '--parallax-sign'].map((имя) => {
    const значение = токен(имя);
    assert.ok(значение !== undefined, `globals.css: в :root нет токена ${имя}`);
    assert.match(значение, /^-?[\d.]+$/, `${имя}: множитель обязан быть безразмерным числом, а не «${значение}»`);
    return Number(значение);
  });
  assert.equal(множители[0] * множители[1] < 0, true,
    `множители параллакса ${множители.join(' и ')} одного знака: текст и кадр поедут в одну сторону`);
  const предел = токен('--parallax-limit');
  assert.ok(предел, 'globals.css: в :root нет токена --parallax-limit');
  assert.match(предел, /^[\d.]+px$/, `предел параллакса «${предел}» обязан быть положительным пикселем`);

  for (const [класс, множитель] of [['.hero-copy', '--parallax-copy'], ['.hero-sign', '--parallax-sign']]) {
    const правило = правила.find((п) => п.sel === `[data-motion="on"] ${класс}`);
    assert.ok(правило, `globals.css: нет правила [data-motion="on"] ${класс} — параллакс исчез или выехал за атрибут слоя`);
    assert.match(правило.body, /(?:^|;)\s*translate\s*:/, `globals.css:${правило.line}: смещение задано не свойством translate`);
    assert.doesNotMatch(правило.body, /(?:^|;)\s*transform\s*:/, `globals.css:${правило.line}: параллакс сел на transform`);
    assert.match(правило.body, /var\(--hero-shift/, `globals.css:${правило.line}: смещение не следует за --hero-shift слоя`);
    assert.match(правило.body, new RegExp(`var\\(${множитель}\\)`),
      `globals.css:${правило.line}: ${класс} едет не на своём множителе — узлы поедут одинаково`);
    assert.match(правило.body, /clamp\(\s*calc\(var\(--parallax-limit\)\s*\*\s*-1\),[^;]+,\s*var\(--parallax-limit\)\s*\)/,
      `globals.css:${правило.line}: смещение не заперто пределом с обеих сторон`);
  }
  // Детектор обязан различать запертое и незапертое значение, иначе проверка выше
  // позеленела бы на clamp, из которого убрали верхнюю границу.
  assert.equal(/clamp\(\s*calc\(var\(--parallax-limit\)\s*\*\s*-1\),[^;]+,\s*var\(--parallax-limit\)\s*\)/
    .test('translate: 0 calc(var(--hero-shift) * var(--parallax-copy))'), false,
    'детектор предела считает запертым значение без clamp');

  // Дыхание кадра живёт на transform внутри .hero-sign: пока смещение на отдельном
  // свойстве, они складываются; переезд параллакса на transform молча убил бы дыхание.
  const дыхание = правила.find((п) => /\.hero-photo img$/.test(п.sel) && /animation/.test(п.body));
  assert.ok(дыхание && /nh-breathe/.test(дыхание.body), 'нет анимации nh-breathe на кадре: проверка translate потеряла смысл');
  assert.match(кадры('nh-breathe').get('50%') || '', /transform\s*:/, 'nh-breathe перестал двигать transform');

  const слой = fs.readFileSync(path.join(root, 'components/Motion.tsx'), 'utf8');
  const запись = (/setProperty\('--hero-shift'[^;]*;/.exec(слой) || [''])[0];
  assert.ok(запись, "components/Motion.tsx: слой перестал писать --hero-shift, параллаксу не от чего ехать");
  assert.match(запись, /Math\.min\(\s*window\.scrollY\s*,\s*window\.innerHeight\s*\)/,
    'смещение героя не ограничено одним экраном: узлы продолжали бы разъезжаться до конца страницы');
  assert.match(запись, /\}px`/, 'смещение героя пишется без px: calc(...) от безразмерного числа не даст длину');
});

// 6.7 Список свойств в переходе читает браузер, а не человек: «transition: background»
// остаётся словом background и в computed-стиле, поэтому проверка «у контрола есть
// переход состояния» сверяет не то, что анимируется. Плюс шпаргалка утягивает
// background-image, position и size, которых ни одно из этих состояний не меняет.
test('переходы состояний перечисляют свойства, а не шпаргалку background', () => {
  const детектор = (тело) => [...тело.matchAll(/\btransition(?:-property)?\s*:\s*([^;{}]+)/g)]
    .filter((m) => /(?:^|[\s,(])background(?![\w-])/.test(m[1]))
    .map((m) => m[1].trim());
  const шпаргалки = правила.flatMap((п) => детектор(п.body).map((значение) => `globals.css:${п.line}: transition: ${значение}`));
  assert.deepEqual(шпаргалки, [], 'переход состояния описан шпаргалкой background вместо длинного свойства');
  // Детектор обязан ловить именно шпаргалку и не ловить правильный longhand.
  assert.deepEqual(детектор('transition: background var(--dur-control) var(--ease-cut)'), ['background var(--dur-control) var(--ease-cut)'],
    'шпаргалка background не ловится: проверка ниже ничего не обещает');
  assert.deepEqual(детектор('transition: background-color var(--dur-control) var(--ease-cut), color var(--dur-control) var(--ease-cut)'), [],
    'детектор считает шпаргалкой корректный background-color');
});

// 7. Линейка выдержки и фильтр каталога считаются одними руками. Это единственная
// проверка, которая замечает, что ссылка деления отдаёт не тот список, что штрих над ней.
test('линейка выдержки обещает ровно то, что отдаёт фильтр каталога', (t) => {
  const система = createSystem();
  try {
    const { agingScale, agingMatches, AGING_BANDS } = система.load('lib/aging.ts');
    const catalog = require(path.join(root, 'lib/catalog.json'));
    const позиции = catalog.products.filter((п) => typeof п.agingMonths === 'number' && п.agingMonths > 0);
    const шкала = agingScale(catalog.products);
    assert.ok(позиции.length >= 20, `позиций с выдержкой ${позиции.length} — сверять нечего`);
    assert.equal(шкала.total, позиции.length, 'agingScale считает не все позиции каталога');
    assert.ok([1, 2].includes(шкала.step), `шаг линейки ${шкала.step}: деление пошло не по месяцам`);
    const месяцы = позиции.map((п) => п.agingMonths);
    const хвост = AGING_BANDS[AGING_BANDS.length - 1];
    assert.ok(шкала.cells[0].months === Math.min(...месяцы) || шкала.cells[0].value === хвост.value,
      'первое деление не совпадает с самой короткой выдержкой полки');
    const последняя = шкала.cells.at(-1);
    assert.equal(последняя.value, хвост.value, 'последнее деление не ведёт на фильтр «и дольше»');
    assert.equal(последняя.count, позиции.filter((п) => п.agingMonths >= хвост.min).length,
      `деление «${последняя.label}» рисует ${последняя.count}, каталог от ${хвост.min} мес. отдаёт другую сумму`);
    assert.equal(шкала.cells.reduce((сумма, ячейка) => сумма + (ячейка.value === хвост.value ? 0 : ячейка.count), 0) + последняя.count, позиции.length,
      'штрихи линейки в сумме не дают число позиций — часть полки не показана');

    for (const ячейка of шкала.cells.filter((c) => c.count > 0)) {
      // Ссылка деления живёт в /catalog?aging=<деление>, и её обязан открыть ровно тот же список.
      const поСсылке = позиции.filter((п) => agingMatches(п.agingMonths, ячейка.value)).length;
      assert.equal(поСсылке, ячейка.count, `?aging=${ячейка.value} открывает ${поСсылке} позиций против ${ячейка.count} над штрихом`);
      if (ячейка.value !== хвост.value) {
        assert.equal(ячейка.count, позиции.filter((п) => п.agingMonths === ячейка.months).length,
          `деление ${ячейка.months}: штрих рисует ${ячейка.count}, каталог отдаёт другую точную выдержку`);
      }
    }
    // Полосы фильтра — надстройка над линейкой: каждая обязана вести себя как объединение делений.
    for (const полоса of AGING_BANDS) {
      const внутри = шкала.cells.filter((c) => c.months >= полоса.min && c.months <= полоса.max).reduce((s, c) => s + c.count, 0);
      assert.equal(позиции.filter((п) => agingMatches(п.agingMonths, полоса.value)).length, внутри,
        `фильтр ${полоса.value} расходится с суммой делений линейки`);
    }
    t.diagnostic(`линейка: ${шкала.cells.length} делений с шагом ${шкала.step} мес., ${позиции.length} позиций, ${шкала.cells.filter((c) => !c.count).length} пустых`);
  } finally {
    система.cleanup();
  }
});
