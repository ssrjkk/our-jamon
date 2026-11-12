// Мёртвый код на релизной витрине: экспорт, до которого никто не может дотянуться,
// всё равно живёт в бандле и его правят вместе с рабочим. Гейт собирает именованные
// экспорты компонентов и lib и требует вызова в другом файле либо второго использования
// в своём. Второе условие нужно для честности: onec.ts и tbank.ts экспортируют функции,
// которые нужны только их собственному модулю, и это не мусор.
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

/** Комментарии вырезаны: упоминание функции в шапке файла — не пользователь. */
const codeOf = (file) => stripComments(fs.readFileSync(file, 'utf8'));
const stripComments = (source) => source.replace(/\/\/[^\n]*/g, '');

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
    ['components/Consumer.tsx', 'import { importedElsewhere } from \'@/lib/module\';\nexport const value = importedElsewhere();\n'],
  ]);
  assert.deepEqual(deadExportsIn(entries, ['lib/module.ts']), ['lib/module.ts :: bounceOlives'],
    'детектор не видит мёртвый экспорт: гейт не сможет поймать следующий такой же');
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
