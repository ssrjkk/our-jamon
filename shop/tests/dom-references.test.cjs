// Ссылки разметки и скрипта обязаны вести в элемент, который кто-то объявил.
// Мёртвый getElementById — это контрол без эффекта, aria-describedby на несуществующий
// id — подпись, которую скринридер не прочитает, якорь href="#…" без цели — пустой
// клик, popovertarget без панели — кнопка, которая молчит. Id объявляются не только
// литералом: часть собирается склейкой («cut-note-» + id товара) или шаблоном
// (`${id}-error`), поэтому объявление режется до первого разрыва в префикс.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('./helpers.cjs');

const repo = path.join(root, '..');
const sources = [];
const walk = (dir, filter) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, filter);
    else if (filter.test(entry.name)) sources.push(path.relative(repo, full).replace(/\\/g, '/'));
  }
};
for (const dir of ['app', 'components', 'lib']) walk(path.join(root, dir), /\.(?:tsx?|html)$/);
// Страницы Pages-витрины лежат в корне репозитория; глубже в корень не идём — там
// node_modules и чужие каталоги.
for (const file of fs.readdirSync(repo).filter((f) => f.endsWith('.html'))) sources.push(file);
const corpus = sources.map((file) => fs.readFileSync(path.join(repo, file), 'utf8'));

function braceRegion(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}' && (depth -= 1) === 0) return text.slice(open + 1, i);
  }
  assert.fail('атрибут-ссылка с незакрытой фигурной скобкой');
}

// Всё, чем файлы объявляют id: литералы, префиксы склеек («cut-note-» + id) и хвосты
// шаблонов, где переменная стоит впереди (`${id}-error`). Хвост — это то, что остаётся
// после последнего ${…}: пару «htmlFor={`${id}-weight`}» ↔ «id={`${id}-weight`}» видно
// только по нему.
const declared = new Set();
const prefixes = new Set();
const tails = new Set();
// Разложение одного значения id: литерал, префикс или хвост.
function classify(value, into) {
  if (value.startsWith('${')) {
    const tail = value.slice(value.lastIndexOf('}') + 1);
    if (tail) into(tail, 'tail');
    return;
  }
  if (value.includes('${')) { into(value.split('${')[0], 'prefix'); return; }
  if (/'\s*\+/.test(value)) { into(value.split(/['"]/)[0], 'prefix'); return; }
  value.split(/\s+/).filter(Boolean).forEach((id) => into(id, 'literal'));
}
for (const text of corpus) {
  for (const m of text.matchAll(/\bid\s*=\s*(["'`])([^"'`\n]{1,120})\1/g)) classify(m[2], push);
  for (const m of text.matchAll(/\bid=\{`([^`]*)`\}/g)) classify(m[1], push);
  for (const m of text.matchAll(/\bid="([^"]*)'\s*\+/g)) prefixes.add(m[1]);
  // Локальная переменная с id-шаблоном: const inputId = `admin-weight-${uid}`.
  for (const m of text.matchAll(/const\s+\w+\s*=\s*(['"`])([^'"`]*)\1/g)) classify(m[2], push);
}
function push(value, kind) {
  if (!value) return;
  if (kind === 'tail') tails.add(value);
  else if (kind === 'prefix') prefixes.add(value.endsWith('-') ? value : `${value}-`);
  else declared.add(value);
}

const resolves = (ref) => ref.startsWith('~')
  ? tails.has(ref.slice(1))
  : ref.endsWith('-')
    ? [...prefixes].some((p) => p === ref || p.startsWith(ref) || ref.startsWith(p))
    : declared.has(ref) || [...prefixes].some((p) => p.length > 2 && ref.startsWith(p));

// Значения атрибутов-ссылок в трёх формах: «attr="a b"», «attr={'a'}» и
// «attr={cond ? `x-${id}` : undefined}», плюс склейка строки с переменной в статике.
function refsOfAttribute(text, attr) {
  const out = new Set();
  const into = (value, kind) => {
    if (!value) return;
    if (kind === 'tail') out.add(`~${value}`);
    else if (kind === 'prefix') out.add(value.endsWith('-') ? value : `${value}-`);
    else out.add(value);
  };
  for (const m of text.matchAll(new RegExp(`\\b${attr}\\s*=\\s*(["'\\x60])([^"'\\x60\\n]{1,160})\\1`, 'g'))) {
    const glued = /^([\w-]+)['"]\s*\+/.exec(m[2]);
    if (glued) into(glued[1], 'prefix');
    else m[2].split(/\s+/).filter((v) => /^[\w][\w-]*$/.test(v)).forEach((v) => into(v, 'literal'));
  }
  for (let i = text.indexOf(`${attr}={`); i >= 0; i = text.indexOf(`${attr}={`, i + 1)) {
    for (const lit of braceRegion(text, i + attr.length + 1).matchAll(/(["'`])([^"'`]*)\1/g)) {
      const value = lit[2];
      if (value.includes('${')) classify(value, into);
      else value.split(/\s+/).filter((v) => /^[\w][\w-]*$/.test(v)).forEach((v) => into(v, 'literal'));
    }
  }
  return [...out];
}

const LOOKUPS = [
  ['getElementById', (text) => [...new Set([...text.matchAll(/getElementById\(['"]([\w-]+)['"]\s*\)/g)].map((m) => m[1]))]],
  ['getElementById-склейка', (text) => [...new Set([...text.matchAll(/getElementById\(['"]([\w-]+)['"]\s*\+/g)].map((m) => m[1]))]],
  ['href-якорь', (text) => [...new Set([...text.matchAll(/href=["']#([\w-]+)["']/g)].map((m) => m[1]))]],
  ...['popovertarget', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'for', 'htmlFor'].map(
    (attr) => [attr, (text) => refsOfAttribute(text, attr)]),
];

const found = [];
for (let index = 0; index < sources.length; index += 1) {
  for (const [label, pick] of LOOKUPS) {
    for (const ref of pick(corpus[index])) found.push({ file: sources[index], label, ref });
  }
}

test('опора гейта: id объявлены, ссылки найдены', () => {
  assert.ok(declared.size >= 100, `литеральных id осталось ${declared.size} — сверять нечего`);
  assert.ok(prefixes.size >= 10, `префиксов склеек осталось ${prefixes.size} — динамические id ушли из поля зрения`);
  assert.ok(tails.size >= 4, `хвостов шаблонов осталось ${tails.size} — пары htmlFor/id не видно`);
  assert.ok(found.length >= 100, `ссылок на id найдено ${found.length} — детектор сломался`);
});

test('ни одна ссылка разметки или скрипта не ведёт в никуда', () => {
  const dangling = found.filter(({ ref }) => !resolves(ref))
    .map(({ file, label, ref }) => `${file} :: ${label} :: ${ref}`);
  assert.deepEqual(dangling, [], 'контрол ссылается на id, которого никто не объявляет');
});
