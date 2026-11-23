const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createSystem, captureServerLog, root } = require('./helpers.cjs');

const ADMIN_PASSWORD = 'test-only-admin-passphrase';
const BANK_PASSWORD = 'test-only-bank-passphrase';
const LIVE_ENV = {
  SHOP_MODE: 'live',
  SHOP_URL: 'https://shop.example.test',
  TBANK_TERMINAL_KEY: 'test-terminal',
  TBANK_PASSWORD: BANK_PASSWORD,
  TBANK_TAXATION: 'usn_income',
  TBANK_VAT: 'vat22',
};

function withSystem(action, options) {
  const system = createSystem(options);
  return action(system).finally(() => system.cleanup());
}

async function login(s, address = '203.0.113.10') {
  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  const response = await s.load('app/api/admin/login/route.ts').POST(s.request({ password: ADMIN_PASSWORD }, undefined, { 'x-forwarded-for': address }));
  assert.equal(response.status, 200);
  s.applyCookies(response);
}

function orderFields(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: 'NH-PAYMENT-1',
    accessToken: crypto.randomBytes(16).toString('hex'),
    createdAt: now,
    consentedAt: now,
    demo: false,
    customer: { name: 'Test customer', phone: '+79991234567' },
    delivery: { id: 'pickup', name: 'Самовывоз', cost: 0, baseCost: 0, freeFrom: null },
    messenger: 'SMS',
    items: [{ uid: 'item-1', productId: 'nf-00000229', title: 'Test product', label: '300 г', price: 450, weightG: 300, pricePerKg: null, requiresWeightCheck: false, weightConfirmed: true, pieceId1c: null, qty: 1 }],
    itemsSum: 450,
    total: 450,
    status: 'paid',
    paymentMethod: 'card',
    paymentId: 'PAY-1',
    paidPaymentId: 'PAY-1',
    paymentIds: ['PAY-1'],
    paymentUrl: 'https://payment.example.test/session',
    ...overrides,
  };
}

async function paidOrder(s, overrides) {
  const order = orderFields(overrides);
  await s.load('lib/orders.ts').saveOrder(order);
  return order;
}

function patch(s, id, body) {
  return s.load('app/api/orders/[id]/route.ts').PATCH(s.request(body, `${process.env.SHOP_URL}/api/orders/${id}`), s.context(id));
}

function notify(s, order, status, paymentId, success = true) {
  const tbank = s.load('lib/tbank.ts');
  const body = { TerminalKey: 'test-terminal', OrderId: order.id, PaymentId: paymentId, Amount: order.total * 100, Success: success, Status: status };
  body.Token = tbank.tbankToken(body, BANK_PASSWORD);
  return s.load('app/api/tbank/notify/route.ts').POST(s.request(body));
}

function receiptItem(uid, productId, title, price, qty = 1) {
  return { uid, productId, title, label: `${qty} шт.`, price, weightG: 100, pricePerKg: null, requiresWeightCheck: false, weightConfirmed: true, pieceId1c: null, qty };
}

test('админка: ADMIN_ALLOW_IPS нормализует ::ffff: и блокирует чужие IP', () => withSystem(async (s) => {
  process.env.ADMIN_ALLOW_IPS = '203.0.113.10, 198.51.100.5';
  const { adminIpAllowed } = s.load('lib/admin.ts');
  assert.equal(adminIpAllowed('203.0.113.10'), true);
  assert.equal(adminIpAllowed('::ffff:203.0.113.10'), true);
  assert.equal(adminIpAllowed('198.51.100.99'), false);
  assert.equal(adminIpAllowed(null), false);
}));

test('админка: RFC 6238 TOTP проверяет эталонный вектор и блокирует повтор кода', () => withSystem(async (s) => {
  process.env.ADMIN_TOTP_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const { adminTotpRequired, verifyAdminTotp } = s.load('lib/admin.ts');
  const { claimAdminTotpStep } = s.load('lib/orders.ts');
  assert.equal(adminTotpRequired(), true);
  assert.equal(verifyAdminTotp('287082', claimAdminTotpStep, 59_000), true);
  assert.equal(verifyAdminTotp('287082', claimAdminTotpStep, 59_000), false, 'повторно тот же TOTP-код не должен приниматься');
  assert.equal(verifyAdminTotp('000000', claimAdminTotpStep, 59_000), false);
}));

test('админка: неверный настроенный TOTP-секрет не отключает 2FA', () => withSystem(async (s) => {
  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  const auth = s.load('lib/admin.ts');
  const loginRoute = s.load('app/api/admin/login/route.ts');
  s.jar.set(auth.ADMIN_COOKIE, auth.adminToken());
  assert.equal(await auth.isAdmin(), true);
  for (const secret of ['not-base64!!!', 'GEZDGNBV', 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ=']) {
    process.env.ADMIN_TOTP_SECRET = secret;
    assert.throws(() => auth.adminTotpRequired(), /ADMIN_TOTP_SECRET/);
    assert.throws(() => auth.verifyAdminTotp('123456', () => true), /ADMIN_TOTP_SECRET/);
    const response = await loginRoute.POST(s.request({ password: ADMIN_PASSWORD, totp: '123456' }));
    assert.equal(response.status, 503, `секрет ${secret} позволил войти`);
    assert.equal(response.cookieChanges.size, 0);
    assert.equal(await auth.isAdmin(), false, `секрет ${secret} оставил действующую сессию`);
  }
}));

test('админка: allowlist применяется к сессии при чтении заказа, но не к токену покупателя', () => withSystem(async (s) => {
  process.env.ADMIN_ALLOW_IPS = '203.0.113.10';
  const order = await paidOrder(s);
  await login(s, '203.0.113.10');
  const route = s.load('app/api/orders/[id]/route.ts');
  const blocked = s.request(null, `http://localhost:3302/api/orders/${order.id}`, { 'x-forwarded-for': '198.51.100.77' });
  assert.equal((await route.GET(blocked, s.context(order.id))).status, 404);
  assert.equal(await s.load('lib/order-access.ts').getAuthorizedOrder(order.id, undefined, '198.51.100.77'), undefined);
  const buyer = s.request(null, `http://localhost:3302/api/orders/${order.id}?token=${order.accessToken}`, { 'x-forwarded-for': '198.51.100.77' });
  assert.equal((await route.GET(buyer, s.context(order.id))).status, 200);
}));

test('админка: заблокированные IP ограничены квотой до записи в журнал', () => withSystem(async (s) => {
  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  process.env.ADMIN_ALLOW_IPS = '203.0.113.10';
  const loginRoute = s.load('app/api/admin/login/route.ts');
  const statuses = [];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    statuses.push((await loginRoute.POST(s.request({ password: ADMIN_PASSWORD }, undefined, { 'x-forwarded-for': '198.51.100.77' }))).status);
  }
  assert.deepEqual(statuses.slice(0, 10), Array(10).fill(403));
  assert.deepEqual(statuses.slice(10), Array(2).fill(429));
  assert.equal(s.load('lib/orders.ts').readAdminAudit(100).length, 10);
}));

test('журнал действий и согласий пишется в SQLite без фейковых заказов', () => withSystem(async (s) => {
  const { readOrders, recordAdminAudit, readAdminAudit, recordOrderConsent } = s.load('lib/orders.ts');
  assert.deepEqual(await readOrders(), [], 'новая база не должна содержать выдуманных заказов');
  recordAdminAudit('confirm_order', '203.0.113.10', 'NH-TEST1', 'total=1500');
  recordOrderConsent('NH-TEST1', '203.0.113.10');
  const rows = readAdminAudit(10);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, 'confirm_order');
  assert.equal(rows[0].orderId, 'NH-TEST1');
}));

test('юридические страницы существуют, без Instagram и безусловного запрета возврата', () => {
  for (const route of ['offer', 'privacy', 'consent']) {
    const file = path.join(root, 'app', route, 'page.tsx');
    assert.ok(fs.existsSync(file), `нет страницы /${route}`);
    const src = fs.readFileSync(file, 'utf8');
    assert.match(src, /id="main-content"/);
    assert.match(src, new RegExp(`canonical:\\s*'/${route}'`));
  }
  const offer = fs.readFileSync(path.join(root, 'app/offer/page.tsx'), 'utf8');
  assert.doesNotMatch(offer, /Продовольственные товары надлежащего качества после передачи покупателю обмену и возврату не подлежат/);
  assert.match(offer, /№&nbsp;2461/);
  const footer = fs.readFileSync(path.join(root, 'components/SiteFooter.tsx'), 'utf8');
  const staticHtml = fs.readFileSync(path.join(root, '..', 'index.html'), 'utf8');
  assert.doesNotMatch(footer, /instagram\.com/i);
  assert.doesNotMatch(staticHtml, /instagram\.com/i);
});

test('оплата при получении не создаёт платёж и допускает отметку только после согласования', () => withSystem(async (s) => {
  const order = orderFields({
    status: 'awaiting_confirmation',
    paymentMethod: 'pay_on_pickup',
    paymentId: undefined,
    paidPaymentId: undefined,
    paymentIds: undefined,
    paymentUrl: undefined,
    items: [{ uid: 'item-1', productId: 'nf-00000213', title: 'Test cut', label: 'кусок ~300 г', price: 450, weightG: 300, pricePerKg: 1500, requiresWeightCheck: true, weightConfirmed: false, pieceId1c: null, qty: 1 }],
  });
  await s.load('lib/orders.ts').saveOrder(order);
  await login(s);
  let bankCalls = 0;
  global.fetch = async () => { bankCalls += 1; throw new Error('unexpected external call'); };
  const confirmed = await patch(s, order.id, { action: 'confirm-order', weights: { 'item-1': 400 } });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.order.status, 'awaiting_payment');
  assert.equal(confirmed.body.order.paymentMethod, 'pay_on_pickup');
  assert.equal(confirmed.body.order.paymentId, undefined);
  assert.equal(confirmed.body.order.paymentUrl, undefined);
  assert.equal(confirmed.body.order.paymentError, undefined);
  assert.equal(confirmed.body.order.total, 600);
  assert.equal(bankCalls, 0);
  assert.equal((await patch(s, order.id, { action: 'mark-pickup-paid' })).status, 200);
  assert.equal((await s.load('lib/orders.ts').getOrder(order.id)).status, 'paid');
  assert.equal((await patch(s, order.id, { action: 'closing-receipt' })).status, 409);
  assert.equal((await patch(s, order.id, { action: 'refund-payment' })).status, 409);
  assert.equal(bankCalls, 0);
}));

test('Т-Банк: демо поддерживает СБП QR, возврат и закрывающий чек без сети', () => withSystem(async (s) => {
  const tbank = s.load('lib/tbank.ts');
  const qr = await tbank.fetchTbankSbpQr('DEMO-QR-1');
  assert.equal(qr.ok, true);
  assert.match(qr.sbpQrSvg, /^<svg/);
  const cancel = await tbank.cancelTbankPayment({ paymentId: 'DEMO-QR-1' });
  assert.equal(cancel.ok, true);
  const closing = await tbank.sendTbankClosingReceipt({ paymentId: 'DEMO-QR-1', customerPhone: '+79991234567', items: [], amountRub: 1000 });
  assert.equal(closing.ok, true);
}));

test('Т-Банк: GetQr принимает только https-payload и безопасный SVG', () => withSystem(async (s) => {
  const tbank = s.load('lib/tbank.ts');
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    const dataType = JSON.parse(options.body).DataType;
    return { ok: true, json: async () => ({ Success: true, Data: dataType === 'PAYLOAD' ? 'https://qr.example.test/pay?id=1' : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>' }) };
  };
  const valid = await tbank.fetchTbankSbpQr('PAY-QR');
  assert.equal(valid.ok, true);
  assert.equal(valid.sbpPayloadUrl, 'https://qr.example.test/pay?id=1');
  assert.match(valid.sbpQrSvg, /^<svg/);
  assert.deepEqual(calls.map((call) => call.url), ['https://securepay.tinkoff.ru/v2/GetQr', 'https://securepay.tinkoff.ru/v2/GetQr']);
  for (const call of calls) assert.equal(call.body.TerminalKey, 'test-terminal');
  global.fetch = async (_url, options) => {
    const dataType = JSON.parse(options.body).DataType;
    return { ok: true, json: async () => ({ Success: true, Data: dataType === 'PAYLOAD' ? 'http://qr.example.test/pay' : '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>' }) };
  };
  const invalid = await tbank.fetchTbankSbpQr('PAY-QR');
  assert.equal(invalid.ok, false);
  assert.equal(invalid.sbpPayloadUrl, undefined);
  assert.equal(invalid.sbpQrSvg, undefined);
}, { env: LIVE_ENV }));

test('Т-Банк: Cancel подписан и не считает отсутствие статуса возвратом', () => withSystem(async (s) => {
  const tbank = s.load('lib/tbank.ts');
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ Success: true }) };
  };
  const missingStatus = await tbank.cancelTbankPayment({ paymentId: 'PAY-1' });
  assert.equal(missingStatus.ok, true);
  assert.equal(missingStatus.status, undefined);
  assert.equal(calls[0].url, 'https://securepay.tinkoff.ru/v2/Cancel');
  assert.equal(calls[0].body.Amount, undefined);
  assert.equal(calls[0].body.Token, tbank.tbankToken({ TerminalKey: 'test-terminal', PaymentId: 'PAY-1' }, BANK_PASSWORD));
}, { env: LIVE_ENV }));

test('Т-Банк: закрывающий чек идёт без /v2 и сохраняет НДС, маркировку и итог', () => withSystem(async (s) => {
  const { PRODUCTS } = s.load('lib/products.ts');
  const cheese = PRODUCTS.find((product) => product.category === 'cheese');
  const other = PRODUCTS.find((product) => product.category !== 'cheese');
  assert.ok(cheese && other);
  const items = [receiptItem('cheese-1', cheese.id, 'Сыр', 400), receiptItem('marked-1', other.id, 'Маркированный товар', 300, 2)];
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ Success: true }) };
  };
  const result = await s.load('lib/tbank.ts').sendTbankClosingReceipt({
    paymentId: 'PAY-1', customerPhone: '+79991234567', items, amountRub: 1500,
    markCodes: { 'marked-1': ['01:GS1:CODE-A', '01:GS1:CODE-B'] },
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://securepay.tinkoff.ru/cashbox/SendClosingReceipt');
  const receipt = calls[0].body.Receipt;
  assert.equal(receipt.FfdVersion, '1.2');
  assert.equal(receipt.Phone, '+79991234567');
  assert.equal(receipt.Items.find((item) => item.Name === 'Сыр').Tax, 'vat10');
  const marked = receipt.Items.filter((item) => item.Name === 'Маркированный товар');
  assert.equal(marked.length, 2);
  assert.ok(marked.every((item) => item.PaymentObject === 'goods_with_marking_code' && item.Quantity === 1 && item.Tax === 'vat22'));
  assert.equal(receipt.Items.find((item) => item.Name === 'Доставка').Tax, 'vat22');
  assert.equal(receipt.Items.reduce((sum, item) => sum + item.Amount, 0), 150000);
}, { env: LIVE_ENV }));

test('завершение возврата не скрывает новый платёж, появившийся перед записью', () => withSystem(async (s) => {
  const order = await paidOrder(s);
  await login(s);
  const operations = s.load('lib/payment-operations.ts');
  const orders = s.load('lib/orders.ts');
  const complete = operations.completePaymentRefund;
  operations.completePaymentRefund = async (id, operationId) => {
    await orders.mutateOrder(id, (current) => { current.refundPaymentIds = ['PAY-LATE']; });
    return complete(id, operationId);
  };
  global.fetch = async () => ({ ok: true, json: async () => ({ Success: true, Status: 'REFUNDED' }) });
  const response = await patch(s, order.id, { action: 'refund-payment' });
  assert.equal(response.status, 409);
  const saved = await orders.getOrder(order.id);
  assert.equal(saved.status, 'paid');
  assert.deepEqual(saved.refundedPaymentIds, ['PAY-1']);
  assert.deepEqual(saved.refundPaymentIds, ['PAY-LATE']);
  assert.equal(saved.paymentOperation.state, 'needs_attention');
}, { env: LIVE_ENV }));

test('завершение чека не скрывает потерю актуального статуса заказа', () => withSystem(async (s) => {
  const order = await paidOrder(s);
  await login(s);
  const operations = s.load('lib/payment-operations.ts');
  const orders = s.load('lib/orders.ts');
  const complete = operations.completeClosingReceipt;
  operations.completeClosingReceipt = async (id, operationId) => {
    await orders.mutateOrder(id, (current) => { current.status = 'cancelled'; });
    return complete(id, operationId);
  };
  global.fetch = async () => ({ ok: true, json: async () => ({ Success: true }) });
  const response = await patch(s, order.id, { action: 'closing-receipt' });
  assert.equal(response.status, 409);
  const saved = await orders.getOrder(order.id);
  assert.equal(saved.status, 'cancelled');
  assert.equal(saved.closingReceiptSentAt, undefined);
  assert.equal(saved.paymentOperation.state, 'needs_attention');
}, { env: LIVE_ENV }));

test('поздний ответ Init не воскрешает ссылку завершённого платежа', () => withSystem(async (s) => {
  process.env.SHOP_MODE = 'live';
  const orders = s.load('lib/orders.ts');
  const order = orderFields({
    status: 'awaiting_payment',
    paidPaymentId: undefined,
    paymentId: undefined,
    paymentIds: undefined,
    paymentUrl: undefined,
  });
  await orders.saveOrder(order);
  const tbank = s.load('lib/tbank.ts');
  tbank.createTbankPayment = async () => {
    await orders.mutateOrder(order.id, (current) => { current.paymentStates = { 'PAY-LATE': 'cancelled' }; });
    return { ok: true, paymentId: 'PAY-LATE', paymentUrl: 'https://payment.example.test/late' };
  };
  const updated = await s.load('lib/checkout.ts').initializeOrderPayment(order.id, process.env.SHOP_URL);
  assert.deepEqual(updated.paymentIds, ['PAY-LATE']);
  assert.equal(updated.paymentStates['PAY-LATE'], 'cancelled');
  assert.equal(updated.paymentId, undefined);
  assert.equal(updated.paymentUrl, undefined);
  assert.equal(updated.paymentError, true);
}));

test('поздний GetQr не подменяет QR нового платежа', () => withSystem(async (s) => {
  const orders = s.load('lib/orders.ts');
  const order = orderFields({
    status: 'awaiting_payment',
    paidPaymentId: undefined,
    paymentMethod: 'sbp',
    paymentId: 'PAY-A',
    paymentIds: ['PAY-A'],
    paymentStates: { 'PAY-A': 'pending' },
    sbpPayloadUrl: undefined,
    sbpQrSvg: undefined,
  });
  await orders.saveOrder(order);
  const tbank = s.load('lib/tbank.ts');
  tbank.fetchTbankSbpQr = async (paymentId) => {
    assert.equal(paymentId, 'PAY-A');
    await orders.mutateOrder(order.id, (current) => {
      current.paymentId = 'PAY-B';
      current.paymentIds = ['PAY-A', 'PAY-B'];
      current.paymentStates = { 'PAY-A': 'cancelled', 'PAY-B': 'pending' };
      current.sbpPayloadUrl = 'https://qr.example.test/B';
      current.sbpQrSvg = '<svg>B</svg>';
    });
    return { ok: true, sbpPayloadUrl: 'https://qr.example.test/A', sbpQrSvg: '<svg>A</svg>' };
  };
  const updated = await s.load('lib/checkout.ts').ensureOrderSbpQr(order.id, process.env.SHOP_URL);
  assert.equal(updated.paymentId, 'PAY-B');
  assert.equal(updated.sbpPayloadUrl, 'https://qr.example.test/B');
  assert.equal(updated.sbpQrSvg, '<svg>B</svg>');
}));

test('GetQr не записывает QR платежа, ставшего терминальным во время запроса', () => withSystem(async (s) => {
  const orders = s.load('lib/orders.ts');
  const order = orderFields({
    status: 'awaiting_payment',
    paidPaymentId: undefined,
    paymentMethod: 'sbp',
    paymentId: 'PAY-A',
    paymentIds: ['PAY-A'],
    paymentStates: { 'PAY-A': 'pending' },
    sbpPayloadUrl: undefined,
    sbpQrSvg: undefined,
  });
  await orders.saveOrder(order);
  const tbank = s.load('lib/tbank.ts');
  tbank.fetchTbankSbpQr = async () => {
    await orders.mutateOrder(order.id, (current) => { current.paymentStates['PAY-A'] = 'cancelled'; });
    return { ok: true, sbpPayloadUrl: 'https://qr.example.test/A', sbpQrSvg: '<svg>A</svg>' };
  };
  const updated = await s.load('lib/checkout.ts').ensureOrderSbpQr(order.id, process.env.SHOP_URL);
  assert.equal(updated.sbpPayloadUrl, undefined);
  assert.equal(updated.sbpQrSvg, undefined);
}));

test('неуспешный GetQr возвращает актуальный заказ, а не старый снимок', () => withSystem(async (s) => {
  const orders = s.load('lib/orders.ts');
  const order = orderFields({
    status: 'awaiting_payment',
    paidPaymentId: undefined,
    paymentMethod: 'sbp',
    paymentId: 'PAY-A',
    paymentIds: ['PAY-A'],
    paymentStates: { 'PAY-A': 'pending' },
    sbpPayloadUrl: 'https://qr.example.test/A',
    sbpQrSvg: undefined,
  });
  await orders.saveOrder(order);
  const tbank = s.load('lib/tbank.ts');
  tbank.fetchTbankSbpQr = async () => {
    await orders.mutateOrder(order.id, (current) => {
      current.paymentId = 'PAY-B';
      current.paymentStates['PAY-A'] = 'cancelled';
      current.paymentStates['PAY-B'] = 'pending';
      current.sbpPayloadUrl = undefined;
    });
    return { ok: false, error: 'qr_unavailable' };
  };
  const updated = await s.load('lib/checkout.ts').ensureOrderSbpQr(order.id, process.env.SHOP_URL);
  assert.equal(updated.paymentId, 'PAY-B');
  assert.equal(updated.sbpPayloadUrl, undefined);
  assert.equal(updated.sbpQrSvg, undefined);
}));

test('CANCELED старого платежа не отменяет заказ с другой активной ссылкой', () => withSystem(async (s) => {
  const order = orderFields({
    status: 'awaiting_payment',
    paidPaymentId: undefined,
    paymentId: 'PAY-NEW',
    paymentIds: ['PAY-OLD', 'PAY-NEW'],
    paymentStates: { 'PAY-OLD': 'pending', 'PAY-NEW': 'pending' },
    paymentUrl: 'https://payment.example.test/new',
  });
  await s.load('lib/orders.ts').saveOrder(order);
  assert.equal((await notify(s, order, 'CANCELED', 'PAY-OLD')).status, 200);
  let saved = await s.load('lib/orders.ts').getOrder(order.id);
  assert.equal(saved.status, 'awaiting_payment');
  assert.equal(saved.paymentId, 'PAY-NEW');
  assert.equal(saved.paymentUrl, order.paymentUrl);
  assert.equal(saved.paymentStates['PAY-OLD'], 'cancelled');
  assert.equal(saved.paymentStates['PAY-NEW'], 'pending');
  assert.equal((await notify(s, order, 'CONFIRMED', 'PAY-NEW')).status, 200);
  saved = await s.load('lib/orders.ts').getOrder(order.id);
  assert.equal(saved.status, 'paid');
  assert.equal(saved.paidPaymentId, 'PAY-NEW');
}, { env: LIVE_ENV }));

test('завершённая ссылка не считается действующей и получает новую выдачу', () => withSystem(async (s) => {
  process.env.SHOP_MODE = 'live';
  const orders = s.load('lib/orders.ts');
  const order = orderFields({
    status: 'awaiting_payment',
    paidPaymentId: undefined,
    paymentId: 'PAY-A',
    paymentIds: ['PAY-A'],
    paymentStates: { 'PAY-A': 'cancelled' },
    paymentUrl: 'https://payment.example.test/A',
  });
  await orders.saveOrder(order);
  const tbank = s.load('lib/tbank.ts');
  tbank.createTbankPayment = async () => ({ ok: true, paymentId: 'PAY-B', paymentUrl: 'https://payment.example.test/B' });
  const updated = await s.load('lib/checkout.ts').initializeOrderPayment(order.id, process.env.SHOP_URL);
  assert.deepEqual(updated.paymentIds, ['PAY-A', 'PAY-B']);
  assert.equal(updated.paymentId, 'PAY-B');
  assert.equal(updated.paymentUrl, 'https://payment.example.test/B');
  assert.equal(updated.paymentError, false);
}));

test('завершённый платёж освобождает локальную отмену, но остаётся в реестре', () => withSystem(async (s) => {
  const orders = s.load('lib/orders.ts');
  await login(s);
  for (const [index, status] of ['CANCELED', 'REJECTED', 'DEADLINE_EXPIRED'].entries()) {
    const paymentId = `PAY-TERMINAL-${index + 1}`;
    const order = orderFields({
      id: `NH-TERMINAL-${index + 1}`,
      status: 'awaiting_payment',
      paidPaymentId: undefined,
      paymentId,
      paymentIds: [paymentId],
      paymentStates: { [paymentId]: 'pending' },
    });
    await orders.saveOrder(order);
    assert.equal((await notify(s, order, status, paymentId, status !== 'REJECTED')).status, 200);
    const saved = await orders.getOrder(order.id);
    assert.equal(saved.status, 'awaiting_payment', `${status} отменил весь заказ`);
    assert.equal(saved.paymentId, undefined);
    assert.equal(saved.paymentUrl, undefined);
    assert.deepEqual(saved.paymentIds, [paymentId]);
    assert.equal(s.load('lib/payment-registry.ts').activePaymentIdsOf(saved).length, 0);
    assert.equal((await patch(s, order.id, { action: 'cancel' })).status, 200);
  }
}, { env: LIVE_ENV }));

test('возврат обрабатывает все не возвращённые платежи и идемпотентен', () => withSystem(async (s) => {
  const order = await paidOrder(s, { paymentIds: ['PAY-1', 'PAY-2'], refundPaymentIds: ['PAY-2', 'PAY-3'], refundedPaymentIds: ['PAY-2'] });
  await login(s);
  const cancelled = [];
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://securepay.tinkoff.ru/v2/Cancel');
    const body = JSON.parse(options.body);
    cancelled.push(body.PaymentId);
    return { ok: true, json: async () => ({ Success: true, Status: 'REFUNDED' }) };
  };
  const response = await patch(s, order.id, { action: 'refund-payment' });
  assert.equal(response.status, 200);
  assert.deepEqual(cancelled, ['PAY-1', 'PAY-3']);
  const saved = await s.load('lib/orders.ts').getOrder(order.id);
  assert.equal(saved.status, 'cancelled');
  assert.deepEqual(saved.refundedPaymentIds.sort(), ['PAY-1', 'PAY-2', 'PAY-3']);
  assert.equal(saved.paymentOperation.state, 'succeeded');
  assert.equal((await patch(s, order.id, { action: 'refund-payment' })).status, 200);
  assert.equal(cancelled.length, 2, 'повторный возврат снова обратился к банку');
}, { env: LIVE_ENV }));

test('частичный возврат переживает обрыв связи и сверяется через GetState', () => withSystem(async (s) => {
  const order = await paidOrder(s, { paymentIds: ['PAY-1', 'PAY-2'], refundPaymentIds: ['PAY-2'] });
  await login(s);
  const cancelled = [];
  const states = [];
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    if (url === 'https://securepay.tinkoff.ru/v2/Cancel') {
      cancelled.push(body.PaymentId);
      if (body.PaymentId === 'PAY-2') throw new Error('test connection lost');
      return { ok: true, json: async () => ({ Success: true, Status: 'REFUNDED' }) };
    }
    throw new Error('Unexpected endpoint: ' + url);
  };
  const logs = await captureServerLog(() => patch(s, order.id, { action: 'refund-payment' }));
  assert.ok(logs.some((line) => line.includes('[tbank-cancel]')));
  assert.ok(logs.some((line) => line.includes('[order-update]')));
  let saved = await s.load('lib/orders.ts').getOrder(order.id);
  assert.equal(saved.status, 'paid');
  assert.deepEqual(saved.refundedPaymentIds, ['PAY-1']);
  assert.equal(saved.paymentOperation.state, 'needs_attention');
  assert.equal((await patch(s, order.id, { action: 'refund-payment' })).status, 409);
  assert.equal(cancelled.length, 2);
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://securepay.tinkoff.ru/v2/GetState');
    states.push(JSON.parse(options.body).PaymentId);
    return { ok: true, json: async () => ({ Success: true, Status: 'REFUNDED' }) };
  };
  const recovered = await patch(s, order.id, { action: 'refund-payment', retryConfirmed: true });
  assert.equal(recovered.status, 200);
  assert.deepEqual(states, ['PAY-2']);
  assert.deepEqual(cancelled, ['PAY-1', 'PAY-2'], 'возврат с неизвестным исходом не должен повторяться вслепую');
  saved = await s.load('lib/orders.ts').getOrder(order.id);
  assert.equal(saved.status, 'cancelled');
  assert.deepEqual(saved.refundedPaymentIds.sort(), ['PAY-1', 'PAY-2']);
}, { env: LIVE_ENV }));

test('одновременный возврат блокируется до второго вызова банка', () => withSystem(async (s) => {
  const order = await paidOrder(s);
  await login(s);
  let release;
  let startedResolve;
  const started = new Promise((resolve) => { startedResolve = resolve; });
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    startedResolve();
    await new Promise((resolve) => { release = resolve; });
    return { ok: true, json: async () => ({ Success: true, Status: 'REFUNDED' }) };
  };
  const first = patch(s, order.id, { action: 'refund-payment' });
  await started;
  let second;
  try {
    second = await patch(s, order.id, { action: 'refund-payment' });
    assert.equal(second.status, 409);
    assert.match(second.body.error, /уже выполняется/);
  } finally {
    release();
  }
  assert.equal((await first).status, 200);
  assert.equal(calls, 1);
}, { env: LIVE_ENV }));

test('закрывающий чек после обрыва требует проверки и не дублируется при успехе', () => withSystem(async (s) => {
  const order = await paidOrder(s);
  await login(s);
  let calls = 0;
  global.fetch = async () => { calls += 1; throw new Error('test connection lost'); };
  const logs = await captureServerLog(() => patch(s, order.id, { action: 'closing-receipt' }));
  assert.ok(logs.some((line) => line.includes('[tbank-closing-receipt]')));
  assert.ok(logs.some((line) => line.includes('[order-update]')));
  let saved = await s.load('lib/orders.ts').getOrder(order.id);
  assert.equal(saved.closingReceiptSentAt, undefined);
  assert.equal(saved.paymentOperation.state, 'needs_attention');
  assert.equal((await patch(s, order.id, { action: 'closing-receipt' })).status, 409);
  assert.equal(calls, 1);
  global.fetch = async (url) => {
    calls += 1;
    assert.equal(url, 'https://securepay.tinkoff.ru/cashbox/SendClosingReceipt');
    return { ok: true, json: async () => ({ Success: true }) };
  };
  assert.equal((await patch(s, order.id, { action: 'closing-receipt', retryConfirmed: true })).status, 200);
  saved = await s.load('lib/orders.ts').getOrder(order.id);
  assert.ok(Date.parse(saved.closingReceiptSentAt) > 0);
  assert.equal(saved.paymentOperation.state, 'succeeded');
  assert.equal((await patch(s, order.id, { action: 'closing-receipt' })).status, 200);
  assert.equal(calls, 2);
}, { env: LIVE_ENV }));

test('подписанное уведомление не ставит уже возвращённый платёж в очередь повторно', () => withSystem(async (s) => {
  const order = await paidOrder(s, { status: 'cancelled', refundedPaymentIds: ['PAY-2'] });
  const tbank = s.load('lib/tbank.ts');
  const body = { TerminalKey: 'test-terminal', OrderId: order.id, PaymentId: 'PAY-2', Amount: order.total * 100, Success: true, Status: 'CONFIRMED' };
  body.Token = tbank.tbankToken(body, BANK_PASSWORD);
  const response = await s.load('app/api/tbank/notify/route.ts').POST(s.request(body));
  assert.equal(response.status, 200);
  const saved = await s.load('lib/orders.ts').getOrder(order.id);
  assert.equal(saved.refundPaymentIds?.includes('PAY-2') || false, false);
  assert.deepEqual(saved.refundedPaymentIds, ['PAY-2']);
}, { env: LIVE_ENV }));
