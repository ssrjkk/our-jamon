const test = require('node:test');
const assert = require('node:assert/strict');
const { createSystem } = require('./helpers.cjs');

const PASSWORD = 'test-only-bank-passphrase';
const TERMINAL = 'test-terminal';

// Значения Token зафиксированы побайтово. Пока тест пересчитывал токен той же
// формулой, что и прод, любая правка в lib/tbank.ts оставалась зелёной — тест
// подтверждал сам себя. Эти векторы ловят смену формулы, порядка и состава полей.
const NOTIFY = { TerminalKey: TERMINAL, OrderId: 'NH-GOLDEN-1', PaymentId: '123456', Amount: 90000, Success: true, Status: 'CONFIRMED' };
const NOTIFY_EXTRA = { ...NOTIFY, CardId: 'abc', RebillId: 'r1', Info: 'x', Data: { Foo: 'Bar' } };
const INIT = {
  TerminalKey: TERMINAL, Amount: 90000, OrderId: 'NH-GOLDEN-1', Description: 'Наш Хамон',
  SuccessURL: 'https://shop.example.test/order/NH-GOLDEN-1',
  NotificationURL: 'https://shop.example.test/api/tbank/notify',
  DATA: { Phone: '79991234567' }, Receipt: { Phone: '79991234567', Taxation: 'usn_income', Items: [] },
};

const GOLDEN = {
  notify: '3ef16d11fbd8f3c6fa27809e084df196c3e86512345372964c0907d56981b9b8',
  notifyExtra: 'f0b7d3fa90b25ac087faeaebb5198b56d6a8ad3fd447d0068525148cc8a2605d',
  init: 'ee7a5ceea08f253b93893a85cc4247a0e78a8ced3ff264c86b41f26f05019597',
};

function withSystem(action, options) {
  const system = createSystem(options);
  return action(system).finally(() => system.cleanup());
}

test('подпись Т-Банка совпадает с зафиксированными векторами', () => withSystem(async s => {
  const { tbankToken } = s.load('lib/tbank.ts');
  assert.equal(tbankToken(NOTIFY, PASSWORD), GOLDEN.notify);
  assert.equal(tbankToken({ ...NOTIFY, Token: 'мусор' }, PASSWORD), GOLDEN.notify, 'поле Token не должно входить в хэш');
  assert.equal(tbankToken(NOTIFY_EXTRA, PASSWORD), GOLDEN.notifyExtra, 'вложенные объекты и лишние поля меняют подпись — это и есть риск Notify');
  assert.equal(tbankToken(INIT, PASSWORD), GOLDEN.init, 'подпись Init уехала бы вместе с формой Receipt');
}));

test('значение токена = конкатенация строк по алфавиту ключей, без вложенных объектов', () => withSystem(async s => {
  const { tbankToken } = s.load('lib/tbank.ts');
  // Строка, из которой получен GOLDEN.notifyExtra: сортировка по ключам, Password влезает в общий ряд.
  const joined = [
    String(NOTIFY_EXTRA.Amount), NOTIFY_EXTRA.CardId, NOTIFY_EXTRA.Info, NOTIFY_EXTRA.OrderId,
    PASSWORD, String(NOTIFY_EXTRA.PaymentId), NOTIFY_EXTRA.RebillId, NOTIFY_EXTRA.Status,
    String(NOTIFY_EXTRA.Success), NOTIFY_EXTRA.TerminalKey,
  ].join('');
  assert.equal(joined, '90000abcxNH-GOLDEN-1test-only-bank-passphrase123456r1CONFIRMEDtruetest-terminal');
  const crypto = await import('node:crypto');
  assert.equal(crypto.createHash('sha256').update(joined).digest('hex'), tbankToken(NOTIFY_EXTRA, PASSWORD));
}));

test('токен по неполному набору полей банк не примет', () => withSystem(async s => {
  const { tbankToken } = s.load('lib/tbank.ts');
  const subset = { TerminalKey: TERMINAL, OrderId: 'NH-GOLDEN-1', PaymentId: '123456', Amount: 90000, Success: true, Status: 'CONFIRMED' };
  assert.notEqual(tbankToken({ ...subset, Info: 'лишнее поле выгрузки' }, PASSWORD), tbankToken(subset, PASSWORD),
    'форма должна быть чувствительна к каждому простому полю — иначе подмена цены проходит');
  const live = {
    SHOP_MODE: 'live', TBANK_TERMINAL_KEY: TERMINAL, TBANK_PASSWORD: PASSWORD, SHOP_URL: 'https://shop.example.test',
  };
  const sys = createSystem({ env: live });
  try {
    const { verifyTbankNotification } = sys.load('lib/tbank.ts');
    const body = { ...subset, Token: tbankToken(subset, PASSWORD) };
    assert.equal(verifyTbankNotification(body), true);
    // Уведомление с любым дополнительным полем без пересчёта токена — 403.
    assert.equal(verifyTbankNotification({ ...body, Recurrent: 'Y' }), false,
      'уведомление с новым полем без пересчёта подписи отклоняется: добавит банк такое поле в Notify — оплата зависнет');
    assert.equal(verifyTbankNotification({ ...body, Token: '0'.repeat(64) }), false);
  } finally { sys.cleanup(); }
}));
