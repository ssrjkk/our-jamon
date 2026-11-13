const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Слой конфигурации. `.env.example` — единственная инструкция для заказчика: он откроет её, когда
// будет отдавать данные по оплате и ИП, и выставит ровно то, что там написано. Если код читает
// ключ, которого в списке нет, настройка молча не сработает; если в списке есть ключ, который код
// не читает, заказчик потратит время на пустую переменную и решит, что тариф не применился.
// Оба конца сверяются по исходникам, а не по памяти: ключ может читаться по имени, через помощника
// вроде configuredAmount('DELIVERY_CDEK_RUB'), — записи `process.env.X` в файле тогда нет.
const root = path.resolve(__dirname, '..');
const файлы = [];
for (const dir of ['app', 'lib', 'components']) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) файлы.push(path.join(entry.parentPath, entry.name));
  }
}
файлы.push(path.join(root, 'next.config.ts'));
const источники = new Map(файлы.filter(fs.existsSync).map((f) => [path.relative(root, f), fs.readFileSync(f, 'utf8')]));

// Ключи, которые выставляет рантайм или Dockerfile, а не заказчик.
const рантайм = new Set(['NODE_ENV', 'NEXT_TELEMETRY_DISABLED', 'HOSTNAME', 'PORT', 'VERCEL', 'VERCEL_URL']);

const прямые = (текст) => [
  ...[...текст.matchAll(/process\.env\.([A-Z0-9_]{3,})/g)].map((m) => m[1]),
  ...[...текст.matchAll(/process\.env\[\s*['"]([A-Z0-9_]{3,})['"]\s*\]/g)].map((m) => m[1]),
];

// Помощники, достающие переменную по имени: одноимённый параметр использован как индекс.
const помощники = [];
for (const текст of источники.values()) {
  for (const m of текст.matchAll(/function\s+(\w+)\s*\(\s*(\w+)\s*,?[^)]*\)\s*(?::[^{]*)?\{[\s\S]{0,600}?process\.env\[\s*\2\s*\]/g)) {
    if (!помощники.includes(m[1])) помощники.push(m[1]);
  }
}
assert.ok(помощники.length >= 1, 'ни одного помощника чтения env по имени не найдено — свёртка по имени вышла из поля зрения');

const читают = new Map();
const добавь = (ключ, файл) => { if (!читают.has(ключ)) читают.set(ключ, []); if (!читают.get(ключ).includes(файл)) читают.get(ключ).push(файл); };
for (const [файл, текст] of источники) {
  for (const ключ of прямые(текст)) добавь(ключ, файл);
  for (const имя of помощники) {
    for (const m of текст.matchAll(new RegExp(имя + '\\(\\s*[\'"]([A-Z0-9_]{3,})[\'"]', 'g'))) добавь(m[1], файл);
  }
}

const настраиваемые = [...читают.keys()].filter((ключ) => !рантайм.has(ключ)).sort();
assert.ok(настраиваемые.length >= 12, `прод-код читает лишь ${настраиваемые.length} настраиваемых ключей — корпус сверки распался`);

const пример = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
const обещают = [...пример.matchAll(/^[ \t]*([A-Z][A-Z0-9_]{2,})[ \t]*=/gm)].map((m) => m[1]);
assert.ok(обещают.length >= 12, `в .env.example осталось ${обещают.length} ключей — сверять нечего`);

test('каждый настраиваемый ключ прод-кода есть в .env.example', () => {
  const нет = настраиваемые.filter((ключ) => !обещают.includes(ключ));
  assert.deepEqual(нет, [], 'код читает переменную, о которой заказчик не знает: ' + нет.join(', '));
});

test('каждый ключ .env.example действительно читает прод-код', () => {
  const пусто = обещают.filter((ключ) => !читают.has(ключ));
  assert.deepEqual(пусто, [], 'список обещает переменную, которую никто не читает: ' + пусто.join(', '));
});

test('ключ в .env.example объявлен один раз', () => {
  const дубли = обещают.filter((ключ, индекс) => обещают.indexOf(ключ) !== индекс);
  assert.deepEqual(дубли, [], '.env.example объявляет один ключ дважды — последний победит молча');
});

test('Dockerfile не выставляет незнакомых переменных', () => {
  const docker = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  const выставлены = [...docker.matchAll(/^ENV\s+([A-Z0-9_]{3,})\s*=/gm)].map((m) => m[1]);
  assert.ok(выставлены.length >= 4, `Dockerfile выставляет ${выставлены.length} переменных — сверять нечего`);
  const чужие = выставлены.filter((ключ) => !рантайм.has(ключ) && !обещают.includes(ключ));
  assert.deepEqual(чужие, [], 'Dockerfile задаёт ключ, которого нет ни в рантайме, ни в списке настройки: ' + чужие.join(', '));
});
