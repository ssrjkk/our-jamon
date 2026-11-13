// Мёртвый код на релизной витрине: экспорт, до которого никто не может дотянуться,
// всё равно живёт в бандле и его правят вместе с рабочим. Гейт собирает именованные
// экспорты компонентов и lib и требует вызова в другом файле либо второго использования
// в своём. Второе условие нужно для честности: onec.ts и tbank.ts экспортируют функции,
// которые нужны только их собственному модулю, и это не мусор.
// Тот же разбор применён к полям lib/types.ts: поле описывает факт заказа или товара,
// и если его никто не читает и не пишет, это выдумка о данных, а не запас на будущее.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('./helpers.cjs');

const SKIP = new Set(['node_modules', '.next', 'test-results', 'data']);

function sources(dirs) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { if (!SKIP.has(entry.name)) walk(path.join(dir, entry.name)); }
      else if (/\.[cm]?[jt]sx?$/.test(entry.name)) files.push(path.join(dir, entry.name));
    }
  };
  for (const dir of dirs) walk(path.join(root, dir));
  return files;
}

/**
 * Комментарии вырезаны: упоминание функции в шапке файла — не пользователь.
 * Двойная косая черта после двоеточия ('https://…') продолжает строковый литерал, а не
 * начинает комментарий: без проверки на двоеточие из URL вырезался бы хвост и имя в нём.
 */
const codeOf = (file) => stripComments(fs.readFileSync(file, 'utf8'));
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function declaredIn(source) {
  return [
    ...[...source.matchAll(/^export (?:async )?(?:function|const|class) (\w+)/gm)].map((match) => match[1]),
    ...[...source.matchAll(/^export default function (\w+)/gm)].map((match) => match[1]),
  ];
}

const count = (text, name) => (text.match(new RegExp(`\\b${name}\\b`, 'g')) || []).length;

/**
 * entries — исходники всех файлов гейта, targets — те из них, чьи экспорты проверяются.
 * Комментарии вырезаются здесь, поэтому вызывающий передаёт исходник как есть
 * и не может случайно засчитать упоминание в шапке файла за использование.
 */
function deadExportsIn(entries, targets) {
  const code = new Map([...entries.keys()].map((key) => [key, stripComments(entries.get(key))]));
  const dead = [];
  for (const target of targets) {
    for (const name of declaredIn(code.get(target))) {
      const usedElsewhere = [...code.keys()].some((file) => file !== target && count(code.get(file), name) > 0);
      if (usedElsewhere || count(code.get(target), name) > 1) continue;
      dead.push(`${target} :: ${name}`);
    }
  }
  return dead;
}

function storefrontEntries() {
  const entries = new Map();
  for (const file of sources(['app', 'components', 'lib', 'tests'])) entries.set(path.relative(root, file).split(path.sep).join('/'), fs.readFileSync(file, 'utf8'));
  return entries;
}

/** Поля всех экспортируемых интерфейсов как «Имя.поле» — ровно то, что читает витрина. */
function declaredFields(source) {
  const fields = [];
  for (const block of source.matchAll(/^export interface (\w+) \{([\s\S]*?)\r?\n\}/gm)) {
    for (const prop of block[2].matchAll(/^\s{2}(\w+)\??:/gm)) fields.push(`${block[1]}.${prop[1]}`);
  }
  return fields;
}

/**
 * types — исходник lib/types.ts как есть, users — те, кто поле читает или пишет:
 * витрина, сервер и скрипт синхронизации с 1С. Комментарии режутся здесь, поэтому
 * упоминание поля в шапке модуля не может считаться его использованием.
 */
function deadFieldsIn(types, users) {
  const texts = users.map(stripComments);
  return declaredFields(stripComments(types)).filter((field) => !texts.some((text) => count(text, field.split('.')[1]) > 0));
}

test('в компонентах и lib не осталось экспортов без пользователя', () => {
  const entries = storefrontEntries();
  const targets = [...entries.keys()].filter((key) => key.startsWith('components/') || key.startsWith('lib/'));
  assert.ok(targets.length >= 25, `гейт потерял охват: файлов с экспортами ${targets.length}`);
  assert.deepEqual(deadExportsIn(entries, targets), [], 'есть экспорт, который никто не вызывает — его надо удалить, а не оставлять в бандле');
});

test('детектор считает мёртвым только то, до чего нельзя дотянуться', () => {
  const entries = new Map([
    ['lib/module.ts', [
      '// ссылка в шапке не является вызовом:',
      '//   bounceOlives(stage)',
      'export function bounceOlives(stage: HTMLElement | null) { void stage; }',
      'export function selfUsed() { return selfUsed(); }',
      'export function importedElsewhere() { return 1; }',
    ].join('\n')],
    ['components/Consumer.tsx', [
      'import { importedElsewhere } from \'@/lib/module\';',
      'export const value = importedElsewhere();',
      '/* bounceOlives(stage) в блочном комментарии — тоже не вызов */',
    ].join('\n')],
  ]);
  assert.deepEqual(deadExportsIn(entries, ['lib/module.ts']), ['lib/module.ts :: bounceOlives'],
    'детектор не видит мёртвый экспорт: гейт не сможет поймать следующий такой же');
});

test('в lib/types.ts не осталось полей без читателя', () => {
  const types = fs.readFileSync(path.join(root, 'lib', 'types.ts'), 'utf8');
  const users = sources(['app', 'components', 'lib', 'scripts'])
    .filter((file) => path.relative(root, file).split(path.sep).join('/') !== 'lib/types.ts')
    .map((file) => fs.readFileSync(file, 'utf8'));
  assert.ok(declaredFields(stripComments(types)).length >= 60,
    `гейт потерял охват: полей в типах ${declaredFields(stripComments(types)).length}`);
  assert.deepEqual(deadFieldsIn(types, users), [],
    'поле описывает заказ или товар, которого никто не читает и не пишет — его надо удалить из типа');
});

test('детектор полей не путает мёртвое поле с живым', () => {
  const types = [
    'export interface Order {',
    '  id: string;',
    '  status: OrderStatus;',
    '  phantom?: string;',
    '}',
  ].join('\n');
  const users = [
    'export const x = order.id + order.status;',
    '/* phantom?: строка из старой формы, заказчику её не отдаём */',
  ];
  assert.deepEqual(deadFieldsIn(types, users), ['Order.phantom'],
    'детектор не видит мёртвое поле: следующий Order.comment пройдёт гейт незаметно');
});

test('полёт оливкок остался только там, где он действительно вызывается', () => {
  const offenders = sources(['app', 'components', 'lib'])
    .filter((file) => /bounceOlives/.test(codeOf(file)))
    .map((file) => path.relative(root, file).split(path.sep).join('/'));
  assert.deepEqual(offenders, [], 'в Next-витрине объявлена анимация без вызова: работает только версия из index.html');
  const staticSource = stripComments(fs.readFileSync(path.join(root, '..', 'index.html'), 'utf8'));
  const calls = (staticSource.match(/bounceOlivesInCard\(/g) || []).length;
  assert.ok(calls >= 4, `статическая витрина потеряла анимацию оливок: вызовов ${calls}`);
});
