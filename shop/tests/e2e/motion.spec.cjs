const { test, expect } = require('@playwright/test');
const { готовККлику } = require('./helpers.cjs');

// =========================================================================
// Гейт слоя движения. Правила, которые он защищает, записаны словами в
// globals.css: скрытым вправе быть только то, что ещё не попало в кадр, и только
// под [data-motion="on"]; геометрия весовой шкалы обязана ехать за теми же
// числами, что печатает поле веса; декоративный слой не имеет права отбирать
// клик. Unit-проверка видит текст CSS, а чем именно браузер отрисовал стрелку,
// черту под вкладкой и наезд на фотографии — знает только браузер.
// =========================================================================

const EDGE = 0.92;
// Один список панелей на оба гейта: «лесенка по вкладкам» и «варианты появления» обязаны
// проходить по всем семи, иначе панель, снятая из одного списка, исчезает из проверки
// молча — её содержимое просто перестаёт измеряться.
const ПАНЕЛИ = [
  { id: 'catalog', свои: ['.product-card', '.card-media'] },
  { id: 'scenarios', свои: ['.catalog-kits-heading'], когдаЕсть: ['.scenario-card'] },
  { id: 'buyer-choices', свои: ['.section-head', '.photo-choice-group'] },
  { id: 'shop', свои: ['.shop-interior', '.shop-visit-copy', '.shop-supplier-strip figure'] },
  { id: 'aging', свои: ['.aging-card', '.aging-ruler'] },
  { id: 'weight-system', свои: ['.scale-panel'] },
  { id: 'delivery', свои: ['.shop-address'] },
];
const дваКадра = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

/**
 * Одно правило на все проверки, живущее в самой странице: как слой выбирает имя
 * показа и как выглядит приехавший узел. Гейт сверяется с правилом, а не с одним
 * именем «nh-rise», — иначе срез заголовка и шторка фотографии считались бы
 * спрятанными узлами и проверка покрыла бы только один из трёх способов появления.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Вариант появления узел берёт из разметки (data-reveal-into), подъём — дефолт.
    window.ожидаемаяОтметка = (node) => `nh-${node.dataset.revealInto || 'rise'}`;
    // Приехавший узел обязан быть вырезан только bleed-значением. Chrome сериализует
    // конечный кадр как «inset(calc(0% - 4px) -4px -4px)» (замер 2026-11-14): одинаковые
    // правая и левая стороны свёрнуты в три значения, а внутри calc остаются пробелы —
    // наивный split(/\s+/) разрезал бы само значение и принял бы приехавший узел за
    // незавершённый. Поэтому стороны разбираются с учётом вложенных скобок.
    window.стороны = (значение) => {
      const части = [];
      let текущее = '';
      let глубина = 0;
      for (const символ of `${значение}`.replace(/\s+/g, ' ').trim()) {
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
      return части;
    };
    window.выехалЦеликом = (node) => {
      const вырез = getComputedStyle(node).clipPath;
      if (вырез === 'none') return true;
      const внутренность = /^inset\((.+)\)$/.exec(вырез);
      return !!внутренность && window.стороны(внутренность[1])
        .every((сторона) => /^-[\d.]+px$/.test(сторона) || /^calc\(0% - [\d.]+px\)$/.test(сторона));
    };
    // Ступень лесенки считается на блок, а не на размеченный узел: вложенный узел едет
    // ступенью ближайшего размеченного предка и новую не тратит. Гейт повторяет правило
    // слоя, а не угадывает его по имени класса, — иначе фотография внутри карточки
    // удвоила бы ряд задержек, проверка сочла бы это нормой, и лесенка упёрлась бы в
    // предел наполовину ряда.
    window.блок = (node) => {
      const предок = node.parentElement ? node.parentElement.closest('[data-reveal]') : null;
      if (!предок) return { вложенный: false, ступень: 0, вПачке: false };
      return {
        вложенный: true,
        ступень: Number(предок.style.getPropertyValue('--reveal-i') || 0),
        вПачке: !предок.hasAttribute('data-ladder-before') && !!предок.style.getPropertyValue('--reveal-name'),
      };
    };
  });
});

/**
 * Слой движения обязан показать всё, что уже не ниже кадра: и то, что в нём, и то, что
 * осталось выше после прыжка. `выше` — не пустая ли это проверка: без узлов выше
 * вьюпорта прыжок ничего не проверяет, и гейт молча позеленел бы на пустом месте.
 *
 * Признак показа зависит от профиля, и оба — то, что реально читает движок:
 *  · в работающем — инлайновое кастомное свойство, которое ставит слой: класс для этого не
 *    годился бы, потому что показ пришлось бы вычитать из CSS-класса, а отметка слоем
 *    приходит раньше гидратации. React 19 сверяет с пропами ЛЮБОЙ чужой атрибут, поэтому
 *    узлы под показом помечены revealProps (suppressHydrationWarning) — см. тест ниже;
 *  · в «меньше движения» слой ничего не ставит и прятать не вправе, поэтому там скрытым
 *    считается узел с вычисленным opacity: 0.
 * Профиль берётся из того же атрибута, на который опирается CSS, — гейт меряет правило,
 * а не догадывается о нём.
 */
const кадр = (EDGE_RATIO) => {
  const работает = document.documentElement.dataset.motion === 'on';
  const скрыт = (node) => (работает ? node.style.getPropertyValue('--reveal-name') !== window.ожидаемаяОтметка(node) : getComputedStyle(node).opacity === '0');
  const узлы = [...document.querySelectorAll('[data-reveal]')].filter((node) => node.offsetParent);
  const прямоугольник = узлы.map((node) => ({ node, box: node.getBoundingClientRect() }));
  return {
    выше: прямоугольник.filter(({ box }) => box.bottom <= 0).length,
    застрявшие: прямоугольник
      .filter(({ node, box }) => скрыт(node) && box.top < window.innerHeight * EDGE_RATIO)
      .map(({ node, box }) => `${`${node.className || node.tagName}`.slice(0, 30)}@${Math.round(box.top)}`),
  };
};

const шкала = () => {
  const поле = document.querySelector('.scale-weight-field input');
  const цифра = (текст) => Number(`${текст}`.replace(/[^\d]/g, ''));
  const матрица = new DOMMatrix(getComputedStyle(document.querySelector('.gauge-needle')).transform);
  // Chrome не сворачивает var() внутри вычисленного значения: дуга приезжает как «calc(50px)»,
  // и parseFloat на ней даёт NaN. Число берём из px-компоненты — она уже посчитана движком.
  const число = (значение) => {
    const найдено = /(-?[\d.]+)(?:px)?/.exec(значение);
    return найдено ? +(+найдено[1]).toFixed(2) : NaN;
  };
  return {
    min: цифра(поле.min), max: цифра(поле.max), шаг: цифра(поле.step) || 1,
    угол: +(Math.atan2(матрица.b, матрица.a) * 180 / Math.PI).toFixed(2),
    дуга: число(getComputedStyle(document.querySelector('.gauge-arc')).strokeDashoffset),
    подпись: [...document.querySelectorAll('.gauge-caption span')].map((span) => цифра(span.textContent)),
    невалиден: поле.getAttribute('aria-invalid') === 'true',
    сумма: document.querySelectorAll('.readout-digits')[2].textContent.trim(),
  };
};

/**
 * Прокрутка обязана встать перед замером кадра: переход по вкладке идёт плавно, и
 * пока страница едет, в кадр успевает въехать узел, который слой ещё не отмечал.
 */
async function ждёмОстановкиПрокрутки(page) {
  let предыдущая = -1;
  await expect.poll(async () => {
    const текущая = await page.evaluate(() => Math.round(window.scrollY));
    const остановилась = текущая === предыдущая;
    предыдущая = текущая;
    return остановилась ? 'stop' : `идёт ${текущая}`;
  }, { timeout: 15000, message: 'прокрутка после перехода по вкладке так и не остановилась' }).toBe('stop');
}

const черта = () => {
  const выбранная = document.querySelector('.site-tabs button[aria-selected="true"]');
  const линия = document.querySelector('.tab-underline');
  const a = выбранная.getBoundingClientRect();
  const b = линия.getBoundingClientRect();
  return { имя: выбранная.textContent.trim(), сдвиг: +(b.left - a.left).toFixed(2), ширина: +(b.width - a.width).toFixed(2) };
};

/** Точка в центре узла: тот ли это узел, что стоит под курсором движка. */
const подУзлом = (page, селектор) => page.locator(селектор).evaluate((node) => {
  const box = node.getBoundingClientRect();
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  return { узел: hit ? hit.tagName : '—', тот_же: hit === node };
});

/** Общее для обоих профилей: геометрия и доступность клика не зависят от предпочтения движения. */
function проверкиОбаПрофиля() {
  test('стрелка шкалы едет за числом в поле веса и упирается в нарисованные границы', async ({ page }) => {
    await page.goto('/#weight-system');
    await expect(page.locator('.scale-gauge')).toBeVisible();
    const база = await page.evaluate(шкала);
    expect(база.min, 'у весового отреза нет нижнего предела').toBeGreaterThan(0);
    expect(база.max, 'у весового отреза нет верхнего предела').toBeGreaterThan(база.min);
    // Подпись под дугой — те же числа, что принимает поле: покупатель сверяет стрелку с ней.
    expect(база.подпись, 'подпись шкалы разошлась с границами поля веса').toEqual([база.min, база.max]);

    const поле = page.getByLabel('Желаемый вес, г');
    const position = (share) => ({ угол: expect.closeTo(share * 120 - 60, 1), дуга: expect.closeTo(100 - share * 100, 1) });
    for (const [граммы, доля] of [[база.min, 0], [база.min + (база.max - база.min) / 2, 0.5], [база.max, 1]]) {
      await поле.fill(String(граммы));
      await expect.poll(() => page.evaluate(шкала), { message: `${граммы} г: шкала не доехала` })
        .toEqual(expect.objectContaining(position(доля)));
    }

    // Выведенный за пределы вес поле само помечает невалидным, а стрелка встаёт в край:
    // зашкалившая стрелка честнее пустой шкалы, но за нарисованную дугу она уходить не может.
    await поле.fill(String(база.max + база.шаг));
    await expect.poll(() => page.evaluate(шкала), { message: 'стрелка не встала в верхний предел' })
      .toEqual(expect.objectContaining({ невалиден: true, ...position(1) }));
    expect((await page.evaluate(шкала)).сумма, 'невалидный вес показал сумму').toBe('—');
  });

  test('декоративный слой не отбирает клик у фотографии', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.hero-photo img')).toBeVisible();
    expect(await подУзлом(page, '.hero-photo img'), 'наезд героя лежит над фотографией и заберёт клик')
      .toEqual({ узел: 'IMG', тот_же: true });

    await page.goto('/catalog');
    // elementFromPoint работает только внутри вьюпорта, поэтому каждую точку по очереди
    // ставим в центр экрана и замеряем тем же движком, что раздаёт клики.
    // Берём первый ребёнок кадра, а не img: в демо-режиме фото прайса нет, и кадр
    // заполнен редакционной этикеткой — блик лежит над ней ровно так же.
    const свод = await page.evaluate((снять) => {
      const метка = (узел) => `${узел.tagName.toLowerCase()}.${узел.className || ''}`.slice(0, 44);
      // Клик считается честным, если точка попала в сам узел или в его потомка: у контейнера
      // всегда есть дети, и возвращать родителя — не дефект. Чужой узел сверху — дефект.
      // Прокрутка обязана быть мгновенной: на html стоит scroll-behavior: smooth, и с
      // автоповедением getBoundingClientRect читается по ещё не доехавшему кадру.
      const цель = (узел) => {
        узел.scrollIntoView({ block: 'center', behavior: 'instant' });
        const box = узел.getBoundingClientRect();
        if (box.width < 4 || box.height < 4) return null;
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        if (hit === узел || узел.contains(hit)) return null;
        return `${метка(узел)} → ${hit ? метка(hit) : 'пусто'}`;
      };
      const кадры = [...document.querySelectorAll('.card-media > :first-child')].slice(0, снять);
      const ссылки = [...document.querySelectorAll('.card-title a')].slice(0, снять);
      return {
        кадры: кадры.length, ссылки: ссылки.length,
        под_бликом: [...кадры, ...ссылки].map(цель).filter(Boolean),
      };
    }, 5);
    expect(свод.кадры, 'на витрине нет ни одного кадра — проверке нечего замерять').toBeGreaterThanOrEqual(3);
    expect(свод.ссылки, 'на витрине нет ни одной ссылки в заголовке — проверке нечего замерять').toBeGreaterThanOrEqual(3);
    expect(свод.под_бликом, 'декоративный слой лежит над контентом карточки и отбирает клик:\n' + свод.под_бликом.join('\n')).toEqual([]);
  });

  // Слой движения обязан показывать всё, что уже не ниже кадра. Опасный момент — прыжок:
  // между старым и новым кадром остаются узлы выше вьюпорта, и в кадр они больше не
  // въедут никогда. Pre-fix цикл пропускал их по `box.bottom <= 0`, и дыра жила до
  // перезагрузки. Поэтому кадр сверяется СРАЗУ после прыжка со стартовой позиции:
  // пройтись по остальным позициям раньше — значит показать узлы, когда они сами
  // въедут снизу, и гейт станет холостым (проверено: он именно так себя и вёл).
  // Пол «было ли что ловить» один на всю проверку, а не на каждую панель: короткие
  // панели на десктопе целиком влезают в кадр, и требовать дыру от каждой из них —
  // значит рисовать разрешение по дереву, а не по правилу.
  test('прыжок прокрутки не оставляет выше кадра скрытых узлов', async ({ page }) => {
    let наблюдалосьВыше = 0;
    const прыжок = async (метка) => {
      // behavior:'instant' здесь не косметика: html{scroll-behavior:smooth} превращает
      // scrollTo(0, max) в анимацию, узлы проезжают через кадр снизу вверх и показываются
      // по обычному правилу — дыры над кадром не возникает, и гейт зеленеет даже на
      // pre-fix цикле. Проверено: без instant мутация проходила.
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.evaluate(дваКадра);
      const долетел = await page.evaluate(() => {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
        return { y: window.scrollY, низ: document.documentElement.scrollHeight - window.innerHeight };
      });
      expect(долетел.y, `${метка}: прыжок не долетел до конца страницы — кадр снят не внизу`)
        .toBeGreaterThanOrEqual(долетел.низ - 1);
      await page.evaluate(дваКадра);
      const после = await page.evaluate(кадр, EDGE);
      наблюдалосьВыше += после.выше;
      expect(после.застрявшие, `${метка}: после прыжка выше кадра остались скрытые узлы`).toEqual([]);
    };

    await page.goto('/catalog');
    await page.locator('.product-card[data-reveal]').first().waitFor();
    await прыжок('сетка каталога');

    await page.goto('/');
    await готовККлику(page.locator('#tab-delivery'), 'вкладки главной');
    for (const вкладка of ['delivery', 'aging', 'weight-system', 'shop', 'scenarios', 'catalog']) {
      await page.locator(`#tab-${вкладка}`).click();
      await expect(page.locator(`#${вкладка}`)).toBeVisible();
      await прыжок(`панель #${вкладка}`);
    }
    expect(наблюдалосьВыше, 'ни одна поверхность не оставила узлов выше кадра — проверке нечего ловить')
      .toBeGreaterThan(0);
  });

  test('черта под вкладкой стоит ровно под выбранной и уезжает за кликом', async ({ page }) => {
    await page.goto('/');
    await готовККлику(page.locator('#tab-aging'), 'вкладки главной');
    await expect(page.locator('.site-tabs')).toHaveAttribute('data-tabs-ready');
    // opacity черты едет к единице с transition'ом, поэтому сверяется polling'ом, а не одним чтением.
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.tab-underline')).opacity),
      { message: 'черта под вкладками осталась невидимой', timeout: 20000 }).toBe('1');
    for (const вкладка of ['aging', 'delivery', 'weight-system', 'catalog']) {
      await page.locator(`#tab-${вкладка}`).click();
      await expect.poll(async () => {
        const замер = await page.evaluate(черта);
        return Math.max(Math.abs(замер.сдвиг), Math.abs(замер.ширина)) <= 1
          ? 'точно' : `${замер.имя}: сдвиг ${замер.сдвиг}px, ширина ${замер.ширина}px`;
      }, { message: 'черта не встала под выбранную вкладку', timeout: 20000 }).toBe('точно');
    }
  });

  // Чипы отделов меняют местами заливку и надпись. Без перехода это щёлчок, а не нажатие,
  // и отличие от чипов веса («тот же ряд контролов — то же ощущение») ловится только здесь.
  // Сверяется список свойств, а не его длина: под «меньше движения» длительность обнуляет
  // медиазапрос, и проверка «переход есть» обязана оставаться правдой в обоих профилях.
  test('у чипов отделов есть переход состояния', async ({ page }) => {
    await page.goto('/catalog');
    const переход = await page.evaluate(() => {
      const чип = document.querySelector('.dept-tabs button');
      return { свойства: getComputedStyle(чип).transitionProperty, высота: Math.round(чип.getBoundingClientRect().height) };
    });
    expect(переход.свойства, 'чип отдела меняет состояние без перехода').toContain('background-color');
    expect(переход.свойства, 'чип отдела не отзывается на нажатие даже геометрией').toContain('transform');
    expect(переход.высота, 'чип отдела стал меньше обещанных 44px').toBeGreaterThanOrEqual(44);
  });
}

test.describe('движение включено', () => {
  test.use({ reducedMotion: 'no-preference' });

  // Лесенка — это порядок задержек внутри ОДНОЙ перерисовки: paint() ведёт счёт от нуля
  // на каждый кадр, а отметка на узле остаётся навсегда. Переход по якорю «/#aging»
  // плавый (scroll-behavior на html и scrollIntoView({behavior:'smooth'}) в SiteTabs) и
  // размазывает панель по нескольким пачкам, поэтому порядок DOM сверяется на сетке
  // каталога одним мгновенным прыжком ровно до первого непомеченного узла. Выше него всё
  // размечено заранее, значит пролёт мимо кадра (box.bottom <= 0 → нулевая задержка вне
  // счёта) исключён, счёт пачки начинается с нуля, и в зачёте лежит ровно одна пачка.
  // Узлы помечаются data-ladder-before самим гейтом: индекс узла в document держать
  // нельзя, сетка пересобирается, и diff по индексам посчитал бы пачку неверно.
  const пачка = (page) => page.evaluate((EDGE_RATIO) => [...document.querySelectorAll('[data-reveal]')].flatMap((node) => {
    const box = node.getBoundingClientRect();
    if (!node.style.getPropertyValue('--reveal-name') || node.hasAttribute('data-ladder-before')) return [];
    const блок = window.блок(node);
    return [{
      задержка: Number(node.style.getPropertyValue('--reveal-i') || 0),
      карточка: node.classList.contains('product-card'),
      класс: `${node.className || node.tagName}`.slice(0, 30),
      низ: Math.round(box.bottom),
      вКадре: box.top < window.innerHeight * EDGE_RATIO,
      доступен: !!node.offsetParent,
      ...блок,
    }];
  }), EDGE);

  test('лесенка появления идёт по порядку DOM', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'лесенку сверяем на одном вьюпорте');
    await page.goto('/catalog');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.motion)).toBe('on');
    await page.locator('.product-card[data-reveal]').first().waitFor();
    await page.evaluate(дваКадра);
    const до = await page.evaluate(() => {
      const помеченные = [...document.querySelectorAll('[data-reveal]')].filter((node) => node.style.getPropertyValue('--reveal-name'));
      помеченные.forEach((node) => node.setAttribute('data-ladder-before', ''));
      return помеченные.length;
    });
    expect(до, 'до прыжка кадр не показал ничего — сравнивать лесенку не с чем').toBeGreaterThan(0);

    const прыжок = await page.evaluate(() => {
      const узел = [...document.querySelectorAll('[data-reveal]')]
        .find((node) => node.offsetParent && !node.style.getPropertyValue('--reveal-name') && node.getBoundingClientRect().top > 0);
      if (!узел) return null;
      const вверх = window.scrollY + узел.getBoundingClientRect().top;
      window.scrollTo({ top: вверх, behavior: 'instant' });
      return Math.round(вверх);
    });
    expect(прыжок, 'вся страница размечена на первом экране — новой пачке неоткуда взяться').not.toBeNull();
    await page.evaluate(дваКадра);
    // Два чтения через кадр: расхождение значит, что прилетела вторая пачка (поздняя
    // гидратация сдвинула раскладку), а порядок в union двух пачек — уже не факт.
    const первая = await пачка(page);
    await page.evaluate(дваКадра);
    // Сверяется состав пачки и её задержки, а не геометрия: высота узлов после загрузки
    // шрифтов гуляет, и по геометрии вторая пачка выглядела бы расхождением.
    const подпись = (узлы) => узлы.map((узел) => `${узел.класс}#${узел.задержка}`);
    expect(подпись(await пачка(page)), 'задержки доехали двумя пачками — порядок в их union уже не факт').toEqual(подпись(первая));

    const внешние = первая.filter((узел) => !узел.вложенный);
    // Вложенный узел засчитывается только вместе со своим блоком: если предок размечен
    // раньше (сетку пересобрали фильтром), ступень у узла своя, и это тоже норма.
    const вложенные = первая.filter((узел) => узел.вложенный && узел.вПачке);
    expect(внешние.length, 'прыжок показал меньше четырёх блоков — сравнивать порядок нечего').toBeGreaterThanOrEqual(4);
    expect(вложенные.length, 'в пачке нет ни одного вложенного узла, размеченного вместе с блоком: «ступень на блок» нечем сверить, и фотография в карточке снова удвоит лесенку').toBeGreaterThanOrEqual(1);
    expect(первая.filter((узел) => узел.карточка).length, 'в пачке нет карточек сетки — порядок DOM сверять нечем').toBeGreaterThanOrEqual(3);
    expect(первая.filter((узел) => узел.низ <= 0).map((узел) => узел.класс), 'узел пачки лежит выше кадра: он идёт нулевой задержкой и ломает порядок').toEqual([]);
    expect(await page.evaluate((EDGE_RATIO) => [...document.querySelectorAll('[data-reveal]')]
      .filter((node) => node.offsetParent && node.getBoundingClientRect().top < window.innerHeight * EDGE_RATIO)
      .filter((node) => node.style.getPropertyValue('--reveal-name') !== window.ожидаемаяОтметка(node))
      .map((node) => `${node.className}`.slice(0, 30)), EDGE), 'в кадре остались узлы, так и не начавшие появляться').toEqual([]);

    const задержки = первая.map((узел) => узел.задержка);
    expect(задержки[0], 'пачка началась не с нуля: над ней в том же кадре размечен ещё один узел').toBe(0);
    let ступень = 0;
    const ожидало = первая.map((узел) => (узел.вложенный && узел.вПачке ? узел.ступень : Math.min(ступень++, 7)));
    expect(задержки, 'задержки идут не по порядку DOM: следующий блок получает +1, а вложенный узел — ступень своего блока').toEqual(ожидало);
    expect(Math.max(...задержки), 'задержка лесенки превысила обещанный предел').toBeLessThanOrEqual(7);
  });

  // Предел MAX_STAGGER=7 на живой раскладке недостижим: замер по всем семи панелям при
  // высотах 1000/1200/1400 даёт самую плотную пачку в 6 узлов (сетка каталога — три
  // колонки, в отделе 9-10 позиций). Поэтому «лесенка не разгоняется дальше предела»
  // проверяется тем же слоем на пачке заведомо плотнее живой: двенадцать узлов
  // приходят в начало #main-content, наблюдатель изменений вызывает paint() одним
  // кадром, и весь набор попадает в кадр целиком. Первым в порядке DOM идёт он, поэтому
  // ряд обязан начаться с нуля и упереться в 7: без Math.min(step, MAX_STAGGER)
  // последние четыре узла уехали бы в 8, 9, 10, 11.
  test('пачка плотнее предела не разгоняет лесенку: задержка встаёт в 7', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'предел сверяем на одном вьюпорте');
    await page.goto('/catalog');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.motion)).toBe('on');
    await page.locator('.product-card[data-reveal]').first().waitFor();
    await page.evaluate(дваКадра);
    const узлы = await page.evaluate(() => {
      const блок = document.createElement('div');
      for (let шаг = 0; шаг < 12; шаг += 1) {
        const узел = document.createElement('div');
        узел.setAttribute('data-reveal', '');
        узел.style.height = '8px';
        блок.append(узел);
      }
      блок.id = 'ladder-probe';
      document.getElementById('main-content').prepend(блок);
      return блок.children.length;
    });
    expect(узлы, 'подставная пачка не собралась: проверять предел не на чем').toBe(12);
    const ряд = () => page.evaluate(() => [...document.querySelectorAll('#ladder-probe [data-reveal]')]
      .map((node) => `${node.style.getPropertyValue('--reveal-name') || 'нет'}:${node.style.getPropertyValue('--reveal-i') || '—'}`));
    await expect.poll(ряд, { timeout: 20000, message: 'подставная пачка так и не была размечена целиком' })
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7, 7, 7, 7, 7].map((задержка) => `nh-rise:${задержка}`));
  });

  // На панели «Выдержка» пачок считается несколько (переход по якорю плавый), поэтому
  // здесь то, что верно при любом их числе: кадр обязан показать всё, что не ниже сгиба,
  // задержка обязана остаться в пределах обещанного, а хвост панели — доехать до
  // видимости тогда же, когда до него докручивают.
  test('панель «Выдержка» после перехода по якорю показывается целиком', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'переход по якорю сверяем на одном вьюпорте');
    await page.goto('/#aging');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.motion)).toBe('on');
    await expect.poll(() => page.locator('#aging [data-reveal]').first()
      .evaluate((node) => node.style.getPropertyValue('--reveal-name') === window.ожидаемаяОтметка(node)), { timeout: 20000 }).toBe(true);
    await page.evaluate(дваКадра);
    const панель = await page.evaluate((EDGE_RATIO) => [...document.querySelectorAll('#aging [data-reveal]')].map((node) => ({
      отметка: node.style.getPropertyValue('--reveal-name'),
      ожидаемо: window.ожидаемаяОтметка(node),
      задержка: Number(node.style.getPropertyValue('--reveal-i') || 0),
      вКадре: node.getBoundingClientRect().top < window.innerHeight * EDGE_RATIO,
    })), EDGE);
    const вКадре = панель.filter((узел) => узел.вКадре);
    expect(вКадре.length, 'после перехода по якорю в кадре панели «Выдержка» нечего показывать').toBeGreaterThanOrEqual(4);
    expect(вКадре.filter((узел) => узел.отметка !== узел.ожидаемо).map((узел) => `${узел.отметка || 'нет'}/${узел.ожидаемо}`),
      'в кадре остались скрытые узлы панели').toEqual([]);
    expect(Math.max(...панель.map((узел) => узел.задержка)), 'задержка лесенки превысила обещанный предел').toBeLessThanOrEqual(7);
    await page.locator('#aging [data-reveal]').last().scrollIntoViewIfNeeded();
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('#aging [data-reveal]')]
      .filter((node) => node.offsetParent)
      .map((node) => getComputedStyle(node).opacity).filter((значение) => значение !== '1').length),
    { timeout: 20000 }).toBe(0);
  });

  // Лесенка обязана жить на каждой панели, а не на двух случайных: панель скрыта до
  // перехода по вкладке, поэтому её узлы нельзя разметить заранее — показ начинается
  // ровно в момент переключения. Замер 2026-11-14 дал ровно противоположное: четыре
  // панели из семи (#scenarios, #shop, #buyer-choices, #weight-system) не имели ни
  // одного узла под показом.
  // Проверка называет собственное содержимое каждой панели, а не ограничивается
  // «не меньше трёх размеченных»: фото подборок живут и в «К столу», и в «Выборе
  // покупателей», и снятая разметка Scenarios осталась зелёной именно на заимствованных
  // узлах (замер мутации 2026-11-14). Ниже сгиба узлы ещё не отмечены слоем, поэтому
  // покрытие своего содержимого меряется после прокрутки до конца документа — не к
  // «последнему узлу по DOM»: DOM-порядок панелей не совпадает с визуальным.
  test('каждая панель после перехода по вкладке размечена лесенкой и показана', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'переходы по вкладкам сверяем на одном вьюпорте');
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.motion)).toBe('on');
    const отчёт = [];
    for (const { id, свои, когдаЕсть = [] } of ПАНЕЛИ) {
      const вкладка = await готовККлику(page.locator(`#tab-${id}`), `вкладка «${id}»`);
      await вкладка.click();
      await expect.poll(() => page.locator(`#${id} [data-reveal]`).first()
        .evaluate((node) => node.style.getPropertyValue('--reveal-name') === window.ожидаемаяОтметка(node)),
      { timeout: 20000, message: `панель «${id}»: слой так и не отметил ни одного узла своим показом — лесенки на ней нет` }).toBe(true);
      await ждёмОстановкиПрокрутки(page);
      await page.evaluate(дваКадра);
      const замер = await page.evaluate(([селектор, EDGE_RATIO]) => {
        const узлы = [...document.querySelectorAll(`${селектор} [data-reveal]`)].filter((node) => node.offsetParent);
        const вКадре = (node) => node.getBoundingClientRect().top < window.innerHeight * EDGE_RATIO;
        return {
          всего: узлы.length,
          вКадре: узлы.filter(вКадре).length,
          скрытоВКадре: узлы.filter((node) => вКадре(node) && node.style.getPropertyValue('--reveal-name') !== window.ожидаемаяОтметка(node))
            .map((node) => `${`${node.className || node.tagName}`.slice(0, 30)}@${Math.round(node.getBoundingClientRect().top)}`),
          предел: узлы.length ? Math.max(...узлы.map((node) => Number(node.style.getPropertyValue('--reveal-i') || 0))) : 0,
          варианты: узлы.reduce((счёт, node) => {
            const отметка = node.style.getPropertyValue('--reveal-name') || 'нет';
            счёт[отметка] = (счёт[отметка] || 0) + 1;
            return счёт;
          }, {}),
        };
      }, [`#${id}`, EDGE]);
      expect(замер.всего, `панель «${id}»: под показом слоя ${замер.всего} узлов — панель не размечена лесенкой`).toBeGreaterThanOrEqual(3);
      expect(замер.скрытоВКадре, `панель «${id}»: в кадре остались скрытые узлы`).toEqual([]);
      expect(замер.предел, `панель «${id}»: задержка лесенки превысила обещанный предел`).toBeLessThanOrEqual(7);
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      await page.evaluate(дваКадра);
      // Показ считан по-настоящему: узел обязан и стать непрозрачным, и перестать быть
      // вырезанным. Без второй половины узел с несуществующим @keyframes остался бы
      // спрятанным геометрией, а проверка на opacity его бы не увидела.
      await expect.poll(() => page.evaluate((селектор) => [...document.querySelectorAll(`${селектор} [data-reveal]`)]
        .filter((node) => node.offsetParent)
        .flatMap((node) => {
          const причина = getComputedStyle(node).opacity !== '1' ? 'прозрачность'
            : !window.выехалЦеликом(node) ? `вырез ${getComputedStyle(node).clipPath}` : '';
          return причина ? [`${`${node.className || node.tagName}`.slice(0, 30)}: ${причина}`] : [];
        }), `#${id}`),
      { timeout: 20000, message: `панель «${id}»: хвост не доехал до целиком показанного` }).toEqual([]);
      const покрытие = await page.evaluate(([селектор, списки]) => {
        const отмечен = (node) => node.hasAttribute('data-reveal') && node.style.getPropertyValue('--reveal-name') === window.ожидаемаяОтметка(node);
        return списки.map((cls) => {
          const найденные = [...document.querySelectorAll(`${селектор} ${cls}`)].filter((node) => node.offsetParent);
          return { класс: cls, есть: найденные.length, размечено: найденные.filter(отмечен).length };
        });
      }, [`#${id}`, [...свои, ...когдаЕсть]]);
      const собственные = покрытие.slice(0, свои.length);
      expect(собственные.filter((узел) => узел.есть === 0).map((узел) => узел.класс),
        `панель «${id}»: собственного содержимого панели в браузере нет — селекторы разъехались`).toEqual([]);
      expect(собственные.filter((узел) => узел.размечено !== узел.есть),
        `панель «${id}»: часть собственного содержимого панели осталась без лесенки`).toEqual([]);
      expect(покрытие.slice(свои.length).filter((узел) => узел.размечено !== узел.есть),
        `панель «${id}»: карточки панелей размечены не все`).toEqual([]);
      отчёт.push(`${id} ${замер.всего}/${замер.вКадре} [${покрытие.map((узел) => `${узел.класс} ${узел.размечено}/${узел.есть}`).join(', ')}] ${JSON.stringify(замер.варианты)}`);
    }
    console.log('панели под лесенкой (размечено/в кадре, своё содержимое, отметки):', отчёт.join(' · '));
  });

  // Вариант появления живёт в трёх местах, обязанных называть одно и то же: разметка
  // (revealInto), слой (имя = «nh-» + data-reveal-into) и @keyframes в CSS. Плюс сам
  // жест: «заголовок срезают» и «ничего не происходит» на скриншоте неразличимы, поэтому
  // меряется вычисленный clip-path в трёх точках хода, а не намерение в файле.
  test('срез заголовка и шторка фотографии едут своей геометрией и приезжают целиком', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'варианты сверяем на одном вьюпорте');
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.motion)).toBe('on');
    const собранные = [];
    // Три точки хода снимаются внутри прохода по панели: на скрытой панели узел не
    // отрисован, и его анимация уже не живёт в document.getAnimations().
    const точки = [];
    for (const { id } of ПАНЕЛИ) {
      const вкладка = await готовККлику(page.locator(`#tab-${id}`), `вкладка «${id}»`);
      await вкладка.click();
      await ждёмОстановкиПрокрутки(page);
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      await page.evaluate(дваКадра);
      // Сначала дождаться приезда: ход варианта длится дольше подъёма и часть узлов
      // доезжает через полсекунды после прокрутки, а замер ниже обещает конечное состояние.
      await expect.poll(() => page.evaluate((панель) => [...document.querySelectorAll(`#${панель} [data-reveal-into]`)]
        .filter((node) => node.offsetParent)
        .filter((node) => !window.выехалЦеликом(node) || getComputedStyle(node).opacity !== '1').length, id),
      { timeout: 20000, message: `панель «${id}»: варианты появления не доехали до целиком показанных` }).toBe(0);
      собранные.push(...await page.evaluate((панель) => [...document.querySelectorAll(`#${панель} [data-reveal-into]`)]
        .filter((node) => node.offsetParent)
        .map((node) => {
          const стиль = getComputedStyle(node);
          return {
            панель,
            класс: `${node.className}`.slice(0, 30),
            вариант: node.dataset.revealInto,
            отметка: node.style.getPropertyValue('--reveal-name'),
            имя: стиль.animationName,
            длительность: стиль.animationDuration,
            выехал: window.выехалЦеликом(node),
            прозрачность: стиль.opacity,
          };
        }), id));
      // Три точки хода снимаются здесь же: на скрытой панели узел не отрисован, и его
      // анимация уже не живёт в document.getAnimations().
      точки.push(...await page.evaluate((панель) => [...document.querySelectorAll(`#${панель} [data-reveal-into]`)]
        .flatMap((node) => {
          const анимация = node.getAnimations()[0];
          if (!анимация) return [];
          const длительность = анимация.effect.getComputedTiming().duration;
          анимация.pause();
          const снимок = {};
          for (const [ключ, доля] of [['нулевой', 0], ['середина', 0.5], ['конечный', 1]]) {
            анимация.currentTime = длительность * доля;
            снимок[ключ] = getComputedStyle(node).clipPath;
          }
          // finish(), а не play(): снятый кадр обязан вернуть узел в конец хода. play() на
          // завершённой анимации запустил бы показ заново, и следующий замер поймал бы
          // середину вместо приехавшего состояния.
          анимация.finish();
          return [{ панель, вариант: node.dataset.revealInto, класс: `${node.className}`.slice(0, 30), ...снимок }];
        }), id));
    }
    // Подъём карточки — эталон длины: срез обязан идти дольше, и держится это на порядке
    // двух правил в globals.css (специфичность у них одинаковая).
    const подъём = await page.evaluate(() => getComputedStyle(document.querySelector('.product-card')).animationDuration);
    expect(собранные.filter((узел) => узел.вариант === 'mask').length,
      'срезов заголовков в браузере меньше шести — панельный заголовок уехал на подъём').toBeGreaterThanOrEqual(6);
    expect(собранные.filter((узел) => узел.вариант === 'clip').length,
      'шторок фотографии меньше двенадцати — карточки и фигуры размечены без варианта').toBeGreaterThanOrEqual(12);
    expect(собранные.filter((узел) => узел.отметка !== `nh-${узел.вариант}` || узел.имя !== узел.отметка)
      .map((узел) => `${узел.панель}/${узел.класс}: слой=${узел.отметка || 'нет'}, браузер=${узел.имя}`),
      'имя показа разошлось с вариантом из разметки: @keyframes с таким именем не найдён, и узел остался бы спрятанным').toEqual([]);
    expect(собранные.filter((узел) => !(parseFloat(узел.длительность) > parseFloat(подъём)))
      .map((узел) => `${узел.панель}/${узел.класс}: ${узел.длительность} против подъёма ${подъём}`),
      'ход варианта не длиннее подъёма: правило длительности для [data-reveal-into] перестало переопределять базовое').toEqual([]);
    expect(собранные.filter((узел) => !узел.выехал || узел.прозрачность !== '1')
      .map((узел) => `${узел.панель}/${узел.класс}: вырез остался, прозрачность ${узел.прозрачность}`),
      'вариант не приехал целиком: узел остался вырезанным или полупрозрачным').toEqual([]);

    // В нулевом кадре сторона ушла за 100% — узел скрыт целиком; посередине вырез обязан
    // отличаться от конечного, иначе анимация ничего не срезает; в конечном ничего не
    // отрезано — это сверено выше на всех узлах.
    expect(точки.filter((узел) => узел.вариант === 'mask').length, 'хода среза заголовка не видно в document.getAnimations').toBeGreaterThanOrEqual(1);
    expect(точки.filter((узел) => узел.вариант === 'clip').length, 'хода шторки фотографии не видно в document.getAnimations').toBeGreaterThanOrEqual(1);
    expect(точки.filter((узел) => !/calc\(100% \+ [\d.]+px\)/.test(узел.нулевой))
      .map((узел) => `${узел.вариант}/${узел.класс}: ${узел.нулевой}`),
      'в нулевом кадре вырез не прячет узел целиком: появления нет, есть только движение').toEqual([]);
    expect(точки.filter((узел) => узел.середина === узел.конечный)
      .map((узел) => `${узел.вариант}/${узел.класс}: ${узел.середина}`),
      'посередине хода вырез тот же, что в конце: анимация ничего не срезает по дороге').toEqual([]);
    console.log('варианты появления:', `${собранные.length} узлов`,
      `маска ${собранные.filter((узел) => узел.вариант === 'mask').length}`,
      `шторка ${собранные.filter((узел) => узел.вариант === 'clip').length}`,
      `длительность среза ${собранные[0]?.длительность} против подъёма ${подъём}`);
  });

  test('параллакс первого экрана: колонка текста и кадр расходятся и встают в предел', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'параллакс сверяем на одном вьюпорте');
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.motion)).toBe('on');
    await page.locator('.hero-copy').waitFor();
    await page.evaluate(дваКадра);

    const токены = await page.evaluate(() => {
      const корень = getComputedStyle(document.documentElement);
      return {
        текст: parseFloat(корень.getPropertyValue('--parallax-copy')),
        кадр: parseFloat(корень.getPropertyValue('--parallax-sign')),
        предел: parseFloat(корень.getPropertyValue('--parallax-limit')),
        экран: window.innerHeight,
      };
    });
    expect(токены.текст * токены.кадр,
      'множители параллакса одного знака: текст и кадр едут в одну сторону — это сдвиг блока, а не расхождение').toBeLessThan(0);
    expect(токены.предел, 'предел параллакса неположительный: clamp прижимает оба узла к нулю').toBeGreaterThan(0);

    // Смещение меряется по позиции в документе, а не по строке вычисленного значения:
    // getComputedStyle для translate отдаёт неразвёрнувшийся calc(...), и разбор текста
    // зависел бы от того, как именно Chrome сериализует вложенные функции. Позиция в
    // документе = rect.top + scrollY, её сдвиг ровно равен применённому смещению.
    const сдвиги = () => page.evaluate(() => ({
      прокрутка: window.scrollY,
      отметка: document.documentElement.style.getPropertyValue('--hero-shift'),
      текст: document.querySelector('.hero-copy').getBoundingClientRect().top + window.scrollY,
      кадр: document.querySelector('.hero-sign').getBoundingClientRect().top + window.scrollY,
      трансформация: getComputedStyle(document.querySelector('.hero-copy')).transform,
    }));
    // Прокрутка мгновенная: scroll-behavior: smooth на html размазал бы прыжок по кадрам,
    // и следующий замер поймал бы середину вместо устоявшегося положения.
    const прокрутить = async (значение) => {
      await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), значение);
      await expect.poll(async () => {
        const m = await page.evaluate(() => `${window.scrollY}|${document.documentElement.style.getPropertyValue('--hero-shift')}`);
        return m;
      }).toBe(`${значение}|${Math.min(значение, токены.экран)}px`);
      return сдвиги();
    };
    const ожидание = (смещение, множитель) => Math.max(-токены.предел, Math.min(токены.предел, смещение * множитель));
    const рядом = (факт, ждём, подпись) => {
      expect(Math.abs(факт - ждём), `${подпись}: факт ${факт.toFixed(2)} ожидалось ${ждём.toFixed(2)}`).toBeLessThan(0.75);
    };

    const наверху = await сдвиги();
    expect(наверху.отметка, 'слой не обнулил смещение первого экрана на старте').toBe('0px');

    // 300 — линейный ход для обоих множителей, 600 — кадр уже прижат пределом.
    const посередине = await прокрутить(300);
    const текст300 = посередине.текст - наверху.текст;
    const кадр300 = посередине.кадр - наверху.кадр;
    рядом(текст300, ожидание(300, токены.текст), 'колонка текста при прокрутке 300');
    рядом(кадр300, ожидание(300, токены.кадр), 'кадр при прокрутке 300');
    expect(текст300 * кадр300 < 0,
      `при прокрутке 300 текст (${текст300.toFixed(2)}) и кадр (${кадр300.toFixed(2)}) поехали в одну сторону`).toBe(true);

    const глубоко = await прокрутить(600);
    рядом(глубоко.текст - наверху.текст, ожидание(600, токены.текст), 'колонка текста при прокрутке 600');
    рядом(глубоко.кадр - наверху.кадр, ожидание(600, токены.кадр), 'кадр при прокрутке 600');
    expect(глубоко.трансформация,
      'смещение первого экрана висит на transform: дышащий кадр внутри перестал бы его слушаться').toBe('none');

    // Дальше одного экрана смещение не растёт: отметка слоя ограничена одним экраном
    // (проверено выше прокруткой за его пределы), а clamp держит узлы на пределе.
    const заЭкран = await прокрутить(токены.экран + 600);
    рядом(заЭкран.текст - наверху.текст, -токены.предел, 'колонка текста за пределом одного экрана');
    рядом(заЭкран.кадр - наверху.кадр, токены.предел, 'кадр за пределом одного экрана');
    const ещёГлубже = await прокрутить(токены.экран + 1200);
    рядом(ещёГлубже.текст, заЭкран.текст, 'колонка текста при прокрутке за вторым экраном');
    рядом(ещёГлубже.кадр, заЭкран.кадр, 'кадр при прокрутке за вторым экраном');
    console.log('параллакс:', `множители ${токены.текст}/${токены.кадр}`, `предел ${токены.предел}px`,
      `ход 300 → ${текст300.toFixed(1)} / ${кадр300.toFixed(1)}`, `за экраном → ${(-токены.предел)} / ${токены.предел}`);
  });

  test('сетка каталога: ниже сгиба дожидается прокрутки и доезжает до видимости', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'прокрутку сверяем на одном вьюпорте');
    await page.goto('/catalog');
    await page.locator('.product-card[data-reveal]').first().waitFor();
    await page.evaluate(дваКадра);
    const расклад = await page.evaluate((EDGE_RATIO) => {
      const узлы = [...document.querySelectorAll('.product-card[data-reveal]')];
      const разделение = (node) => node.getBoundingClientRect().top < window.innerHeight * EDGE_RATIO;
      const показан = (node) => node.style.getPropertyValue('--reveal-name') === window.ожидаемаяОтметка(node);
      return {
        вКадре: узлы.filter(разделение).length,
        ниже: узлы.filter((node) => !разделение(node)).length,
        скрытоНиже: узлы.filter((node) => !разделение(node) && !показан(node)).length,
        показаноВКадре: узлы.filter((node) => разделение(node) && показан(node)).length,
      };
    }, EDGE);
    expect(расклад.вКадре, 'на первом экране каталога нет ни одной карточки').toBeGreaterThan(0);
    expect(расклад.ниже, 'на первом экране влезла вся сетка — проверке нечего ждать за сгибом').toBeGreaterThan(0);
    expect(расклад.скрытоНиже, 'карточки за сгибом показались заранее').toBe(расклад.ниже);
    expect(расклад.показаноВКадре, 'карточки в кадре так и не начали появляться').toBe(расклад.вКадре);

    await page.locator('.product-card[data-reveal]').last().scrollIntoViewIfNeeded();
    await page.evaluate(дваКадра);
    expect((await page.evaluate(кадр, EDGE)).застрявшие, 'после прокрутки в кадре остались скрытые карточки').toEqual([]);
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('.product-card[data-reveal]')]
      .filter((node) => node.offsetParent)
      .map((node) => getComputedStyle(node).opacity).some((значение) => значение !== '1')),
    { timeout: 20000 }).toBe(false);
  });

  test('блик карточки и посадка цифр живут только в этом профиле', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'анимацию сверяем на одном вьюпорте');
    await page.goto('/catalog');
    const карточка = page.locator('.product-card').first();
    await карточка.waitFor();
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.card-media'), '::after').animationName),
      'блик запущен ещё до наведения').toBe('none');
    await карточка.hover();
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.card-media'), '::after').animationName),
      'наведение на карточку не дало блика').toBe('nh-sheen');

    await page.goto('/#weight-system');
    const чип = page.locator('.magnet-btn').first();
    await готовККлику(чип, 'чипы веса');
    expect(await чип.evaluate((node) => { node.click(); return node.classList.contains('is-pop'); }),
      'клик по чипу не посадил ни чип, ни сумму').toBe(true);
    await expect.poll(() => чип.evaluate((node) => node.classList.contains('is-pop')),
      { message: 'посадка цифр не снялась сама: повторный клик накопит анимацию', timeout: 20000 }).toBe(false);
  });

  // Ореол основного действия — деталь, которую проще всего потерять: у кнопки overflow
  // закрыт бликом, поэтому тень обязана лежать СНАРУЖИ рамки и жить только в работающем
  // профиле. Меряем размытием, а не равенством строки: движок пересобирает тень, и
  // сверять её с текстом из CSS означало бы повесить тест на версию Chrome.
  test('основное действие прогревается ореолом, а чип отдела садится по клику', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'анимацию сверяем на одном вьюпорте');
    await page.goto('/catalog');
    const кнопка = page.locator('.add-btn').first();
    await кнопка.waitFor();
    // Ореол живёт под [data-motion="on"], а атрибут слой вешает после гидратации: мерить
    // «поко» раньше означало бы сверять не дизайн, а скорость запуска JavaScript.
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.motion)).toBe('on');
    const размытие = () => page.evaluate(() => {
      const тень = getComputedStyle(document.querySelector('.add-btn')).boxShadow;
      const числа = (тень === 'none' ? [] : тень.match(/-?[\d.]+px/g) || []).map((значение) => Math.abs(parseFloat(значение)));
      return числа.length >= 3 ? числа[2] : -1;
    });
    expect(await размытие(), 'ореол разогрет ещё до наведения').toBe(0);
    await кнопка.hover();
    await expect.poll(размытие, { message: 'наведение на кнопку не дало ореола', timeout: 20000 }).toBeGreaterThan(0);

    const отдел = page.locator('.dept-tabs button').nth(1);
    await готовККлику(отдел, 'чипы отделов');
    expect(await отдел.evaluate((node) => { node.click(); return node.classList.contains('is-pop'); }),
      'клик по отделу не посадил чип').toBe(true);
    await expect.poll(() => отдел.evaluate((node) => node.classList.contains('is-pop')),
      { message: 'посадка чипа отдела не снялась сама: повторный клик накопит анимацию', timeout: 20000 }).toBe(false);
  });

  // 2.5 по-браузерному: слой пишет отметку показа до того, как React догидратирует
  // отложенную границу. Это законно ровно пока узел снял с себя сверку атрибутов; как
  // только такая разметка теряется, браузер начинает печатать «A tree hydrated but some
  // attributes … didn't match» — ловить это надо здесь, а не глазами в консоли.
  test('слой движения не оставляет расхождений при гидратации', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'консоль гидратации сверяется на одном вьюпорте');
    const журнал = [];
    const ключи = [];
    page.on('console', (сообщение) => {
      const текст = сообщение.text();
      if (/hydrat/i.test(текст)) журнал.push(`${сообщение.type()}: ${текст.slice(0, 160)}`);
      // Предупреждение про key приходит с сервера и доезжает в консоль браузера, поэтому
      // здесь оно видно в тот же момент, что и расхождение гидратации. Порядок атрибутов
      // держит unit-гейт, а это — доказательство, что покупателю консоль не засоряется.
      if (/unique "key" prop/.test(текст)) ключи.push(`${сообщение.type()}: ${текст.slice(0, 160)}`);
    });
    const отметки = () => page.evaluate(() => [...document.querySelectorAll('[data-reveal]')]
      .filter((node) => node.style.getPropertyValue('--reveal-name')).length);
    for (const адрес of ['/', '/catalog']) {
      await page.goto(адрес);
      await page.waitForLoadState('load');
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.motion)).toBe('on');
      // Ранняя сверка — то самое окно, ради которого и написан revealProps: слой уже
      // прошёлся по первому кадру, а отложенная границы каталога ещё не догидратирована.
      // Как только узел вернёт сверку атрибутов, браузер печатает «A tree hydrated but
      // some attributes … didn't match» ровно здесь, до любой прокрутки.
      await page.evaluate(дваКадра);
      expect(журнал, `${адрес}: слой отметил узлы до гидратации и рассорил сервер с клиентом`).toEqual([]);
      expect(ключи, `${адрес}: React считает детей размеченного узла списком без ключей`).toEqual([]);
      // Проверка не вправе позеленеть на пустоте: узел с отметкой обязан существовать.
      // На главной первый экран закрыт героем и линейкой, поэтому карточку поднимаем в
      // вид — там слой её отметит, и вторая сверка уже смотрит на перерисовку после
      // гидратации (панель, фильтры, восстановление прокрутки).
      await page.locator('.product-card[data-reveal]').first().scrollIntoViewIfNeeded();
      await expect.poll(отметки, { message: `${адрес}: слой не отметил ни одного узла — сверять нечего` }).toBeGreaterThan(0);
      await page.evaluate(дваКадра);
      expect(журнал, `${адрес}: после прокрутки браузер ругается на гидратацию`).toEqual([]);
      expect(ключи, `${адрес}: после прокрутки браузер ругается на отсутствующий key`).toEqual([]);
      журнал.length = 0;
      ключи.length = 0;
    }
  });

  проверкиОбаПрофиля();
});

test.describe('меньше движения', () => {
  test.use({ reducedMotion: 'reduce' });

  test('профиль «меньше движения» показывает всё сразу и не запускает ни одного блика', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'профиль движения сверяем на одном вьюпорте');
    await page.goto('/#aging');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.motion)).toBe('reduced');
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('#aging [data-reveal]')]
      .filter((node) => getComputedStyle(node).opacity !== '1').length),
    { timeout: 20000 }).toBe(0);
    // Под «меньше движения» слой не имеет права даже размечать показ: скрытие живёт в
    // атрибуте [data-motion="on"], а инлайновый маркер ставится только в работающем профиле.
    expect(await page.evaluate(() => [...document.querySelectorAll('#aging [data-reveal]')]
      .filter((node) => node.style.getPropertyValue('--reveal-name')).length),
      'слой движения под «меньше движения» всё равно размечает узлы').toBe(0);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('#aging [data-reveal]')).animationName),
      'под «меньше движения» осталась анимация появления').toBe('none');
    // Вырез живёт только в кадрах анимации: под «меньше движения» они не запускаются,
    // поэтому узел с вариантом обязан приехать без clip-path вовсе. Иначе заголовок
    // панели станет невидимым ровно у тех, кто попросил покое.
    const вырезы = await page.evaluate(() => [...document.querySelectorAll('#aging [data-reveal-into]')]
      .map((node) => ({ узел: `${node.className}`.slice(0, 30), вырез: getComputedStyle(node).clipPath })));
    expect(вырезы.length, 'на панели «Выдержка» нет ни одного узла с вариантом появления — сверять нечего').toBeGreaterThan(0);
    expect(вырезы.filter((замер) => замер.вырез !== 'none'),
      'под «меньше движения» узел с вариантом остался вырезанным').toEqual([]);

    await page.goto('/catalog');
    await page.locator('.product-card').first().hover();
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.card-media'), '::after').animationName),
      'в профиле «меньше движения» карточка всё равно даёт блик').toBe('none');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.add-btn')).boxShadow),
      'в профиле «меньше движения» кнопка всё равно светится ореолом').toBe('none');

    await page.goto('/#weight-system');
    const чип = page.locator('.magnet-btn').first();
    await готовККлику(чип, 'чипы веса');
    expect(await чип.evaluate((node) => { node.click(); return node.classList.contains('is-pop'); }),
      'в профиле «меньше движения» посадка цифр всё равно добавляется').toBe(false);
  });

  test('под «меньше движения» первый экран не уезжает от прокрутки', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'профиль движения сверяем на одном вьюпорте');
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.motion)).toBe('reduced');
    await page.locator('.hero-copy').waitFor();
    const позиция = () => page.evaluate(() => ({
      отметка: document.documentElement.style.getPropertyValue('--hero-shift'),
      текст: document.querySelector('.hero-copy').getBoundingClientRect().top + window.scrollY,
      кадр: document.querySelector('.hero-sign').getBoundingClientRect().top + window.scrollY,
      смещение: [document.querySelector('.hero-copy'), document.querySelector('.hero-sign')]
        .map((node) => getComputedStyle(node).translate),
    }));
    const наверху = await позиция();
    await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
    // Слой считает смещение в любом профиле (progress() не смотрит на reduce), поэтому
    // проверка осмысленна ровно пока отметка живёт: если бы её не было, молчало бы и
    // правило CSS. Удерживает узлы на месте исключительно [data-motion="on"].
    await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--hero-shift'))).toBe('600px');
    const внизу = await позиция();
    expect(внизу.смещение.filter((значение) => значение !== 'none'),
      'под «меньше движения» параллакс первого экрана всё равно применился').toEqual([]);
    expect(Math.abs(внизу.текст - наверху.текст), 'колонка текста уехала от прокрутки под «меньше движения»').toBeLessThan(0.75);
    expect(Math.abs(внизу.кадр - наверху.кадр), 'кадр уехал от прокрутки под «меньше движения»').toBeLessThan(0.75);
  });

  test('шапка: полоса прочитанного и тень идут за прокруткой', async ({ page }) => {
    await page.goto('/');
    await page.locator('main#main-content').waitFor();
    await page.evaluate(дваКадра);
    const наверху = await page.evaluate(() => ({
      доля: Number(getComputedStyle(document.documentElement).getPropertyValue('--scroll')),
      черта: new DOMMatrix(getComputedStyle(document.querySelector('.site-header'), '::after').transform).a,
      тень: document.querySelector('.site-header').hasAttribute('data-scrolled'),
    }));
    expect(наверху.доля, 'полоса прочитанного стартовала не с нуля').toBe(0);
    expect(наверху.черта, 'полоса прочитанного отрисована не по доле прокрутки').toBeCloseTo(0, 3);
    expect(наверху.тень, 'тень шапки появилась на самом верху страницы').toBe(false);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.evaluate(дваКадра);
    expect(await page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue('--scroll'))),
      'полоса прочитанного не растёт при прокрутке').toBeGreaterThan(0.05);
    expect(await page.locator('.site-header').getAttribute('data-scrolled'), 'тень шапки не появилась после прокрутки').not.toBeNull();

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.evaluate(дваКадра);
    expect(await page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue('--scroll'))),
      'полоса прочитанного не доходит до конца страницы').toBeGreaterThanOrEqual(0.99);
  });

  проверкиОбаПрофиля();
});
