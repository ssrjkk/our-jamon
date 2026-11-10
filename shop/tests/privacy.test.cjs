// Гигиена репозитория: закупочные цены, контакты и дневник сессии не должны попадать в git.
// Из индекса убираем, локальные копии остаются — удаление из репозитория не отменяет работу.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const repo = path.join(__dirname, '..', '..');
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: repo })
  .toString('utf8')
  .split('\0')
  .filter(Boolean);
const ignored = fs
  .readFileSync(path.join(repo, '.gitignore'), 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const privateFiles = ['Сессия_Наш_Хамон.md', 'брендбук_дом_хамона.pdf', 'shop/data', 'shop/.env'];

test('приватного нет в индексе git', () => {
  for (const name of privateFiles) {
    const leaks = tracked.filter((file) => file === name || file.startsWith(`${name}/`));
    assert.deepEqual(leaks, [], `${name}: в индексе ${leaks.length} записей — файл отдаётся по public-URL`);
  }
});

test('приватные пути перечислены в .gitignore', () => {
  for (const name of ['Сессия_Наш_Хамон.md', 'брендбук_дом_хамона.pdf']) {
    assert.ok(ignored.includes(name), `${name}: нет в .gitignore — вернётся в первый же коммит`);
  }
});

test('локальные копии приватных файлов на месте', () => {
  for (const name of ['Сессия_Наш_Хамон.md', 'брендбук_дом_хамона.pdf', 'shop/data/orders.sqlite']) {
    assert.ok(fs.existsSync(path.join(repo, name)), `${name}: нет на диске — свип удалит рабочий материал`);
  }
});
