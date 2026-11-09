const { createSystem } = require('./helpers.cjs');
const [dbPath, prefix] = process.argv.slice(2);
const system = createSystem({ dbPath });
(async () => {
  const orders = system.load('lib/orders.ts');
  const products = system.load('lib/products.ts').PRODUCTS;
  for (let i = 0; i < 20; i++) {
    const resolved = orders.resolveCart([{ productId: 'nf-00000229', kind: 'pack' }], new Set(), products);
    const now = new Date().toISOString();
    await orders.saveOrder({ id: `NH-${prefix}-${i}`, accessToken: orders.newAccessToken(), createdAt: now, consentedAt: now, demo: true, customer: { name: 'Test-only customer', phone: '+79991234567' }, delivery: { id: 'pickup', name: 'Pickup', cost: 0, baseCost: 0, freeFrom: null }, messenger: 'SMS', items: resolved.items, itemsSum: resolved.itemsSum, total: resolved.itemsSum, status: 'awaiting_payment' });
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => system.cleanup());
