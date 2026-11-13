import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { CartItemInput, CartItemResolved, Order, OrderStatus, Product } from './types';
import { PRODUCTS, averageWeightOf, piecePriceOf } from './products';
import { MAX_CART_LINES, MAX_QTY_PER_LINE, MIN_QTY_PER_LINE } from './cart';
import { weightPriceOf, CUT_WEIGHT_MIN_G, CUT_WEIGHT_MAX_G, CUT_RANGE } from './price';

export class OrderConflict extends Error {}

let database: DatabaseSync | undefined;

function persist(db: DatabaseSync, order: Order): void {
  db.prepare('INSERT INTO orders (id, created_at, payload) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload')
    .run(order.id, order.createdAt, JSON.stringify(order));
  db.prepare('DELETE FROM reservations WHERE order_id = ?').run(order.id);
  if (order.status !== 'cancelled') {
    const reserve = db.prepare('INSERT INTO reservations (piece_id, order_id) VALUES (?, ?)');
    for (const item of order.items) {
      if (item.pieceId1c) reserve.run(item.pieceId1c, order.id);
    }
  }
}

function transaction<T>(db: DatabaseSync, action: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    if (error instanceof Error && error.message.includes('reservations.piece_id')) {
      throw new OrderConflict('Этот кусок уже зарезервирован. Выберите другой.');
    }
    throw error;
  }
}

function migrateLegacy(db: DatabaseSync, filename: string): void {
  if (!fs.existsSync(/* turbopackIgnore: true */ filename)) return;
  const legacy: unknown = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ filename, 'utf8'));
  if (!Array.isArray(legacy)) throw new Error('Legacy order storage is not an array');
  for (const value of legacy) {
    if (!value || typeof value !== 'object' || typeof value.id !== 'string' || typeof value.createdAt !== 'string'
      || !value.customer || typeof value.customer.name !== 'string' || typeof value.customer.phone !== 'string'
      || !value.delivery || !Array.isArray(value.items) || !value.items.length) {
      throw new Error('Legacy order storage contains an invalid order');
    }
    const status = value.status === 'awaiting_weight' ? 'awaiting_confirmation' : value.status;
    if (!['awaiting_confirmation', 'awaiting_payment', 'paid', 'cancelled'].includes(status)) {
      throw new Error('Legacy order storage contains an invalid status');
    }
    const order: Order = {
      ...value,
      status,
      accessToken: typeof value.accessToken === 'string' && /^[a-f0-9]{32}$/.test(value.accessToken) ? value.accessToken : newAccessToken(),
      consentedAt: value.consentedAt ?? null,
      demo: value.demo ?? /^(MOCK|DEMO|TEST)-/.test(value.paymentId || ''),
      delivery: { ...value.delivery, baseCost: value.delivery.baseCost ?? value.delivery.cost, freeFrom: value.delivery.freeFrom ?? null },
      items: value.items.map((item: CartItemResolved) => {
        const product = PRODUCTS.find((candidate) => candidate.id === item.productId);
        const fixed = product?.pieces[0]?.price !== undefined;
        const rate = !item.requiresWeightCheck || fixed ? null
          : item.label.startsWith('На развес') ? product?.bulk?.pricePerKg : product?.pricePerKg;
        if (item.requiresWeightCheck && !fixed && typeof item.pricePerKg !== 'number' && typeof rate !== 'number') {
          throw new Error('Legacy weight price cannot be restored');
        }
        return { ...item, pricePerKg: item.pricePerKg === undefined ? rate ?? null : item.pricePerKg, weightConfirmed: item.weightConfirmed ?? (!item.requiresWeightCheck || status === 'awaiting_payment' || status === 'paid') };
      }),
    };
    persist(db, order);
  }
}

function getDatabase(): DatabaseSync {
  if (database) return database;
  // Persistent order data must never be traced into the server bundle.
  const filename = path.resolve(/* turbopackIgnore: true */ process.env.ORDERS_DB_PATH || path.join(process.cwd(), 'data/orders.sqlite'));
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  try {
    db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    db.exec('CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload))); CREATE TABLE IF NOT EXISTS reservations (piece_id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE); CREATE INDEX IF NOT EXISTS orders_created_at ON orders(created_at DESC);');
    const version = db.prepare('PRAGMA user_version').get() as { user_version: number };
    if (version.user_version === 0) {
      // The JSON source stays untouched; the schema version prevents a second import.
      transaction(db, () => {
        const current = db.prepare('PRAGMA user_version').get() as { user_version: number };
        if (current.user_version === 0) {
          migrateLegacy(db, process.env.ORDERS_LEGACY_PATH || path.join(path.dirname(filename), 'orders.json'));
          db.exec('PRAGMA user_version = 1');
        }
      });
    }
    database = db;
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export async function readOrders(): Promise<Order[]> {
  return getDatabase().prepare('SELECT payload FROM orders ORDER BY created_at DESC, id DESC').all()
    .map((row) => JSON.parse(String(row.payload)) as Order);
}

export async function getOrder(id: string): Promise<Order | undefined> {
  const row = getDatabase().prepare('SELECT payload FROM orders WHERE id = ?').get(id);
  return row ? JSON.parse(String(row.payload)) as Order : undefined;
}

export async function saveOrder(order: Order): Promise<Order> {
  const db = getDatabase();
  return transaction(db, () => {
    while (db.prepare('SELECT id FROM orders WHERE id = ?').get(order.id)) order.id = generateOrderId();
    persist(db, order);
    return order;
  });
}

export async function mutateOrder(id: string, action: (order: Order) => void): Promise<Order | undefined> {
  const db = getDatabase();
  return transaction(db, () => {
    const row = db.prepare('SELECT payload FROM orders WHERE id = ?').get(id);
    if (!row) return undefined;
    const order = JSON.parse(String(row.payload)) as Order;
    action(order);
    persist(db, order);
    return order;
  });
}

export async function updateOrder(id: string, patch: Partial<Order>): Promise<Order | undefined> {
  return mutateOrder(id, (order) => Object.assign(order, patch));
}

export async function reservedPieceIds(): Promise<Set<string>> {
  return new Set(getDatabase().prepare('SELECT piece_id FROM reservations').all().map((row) => String(row.piece_id)));
}

export function generateOrderId(): string {
  return 'NH-' + crypto.randomBytes(6).toString('hex').toUpperCase();
}

export function newAccessToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

// =========================================================================
// Серверный пересчёт корзины: цены берутся ТОЛЬКО из переданного каталога
// (того же, что показала витрина — getProducts()), клиентским суммам не
// доверяем. Кусок резервируется и не может быть добавлен дважды.
// =========================================================================
export interface ResolveResult {
  ok: boolean;
  error?: string;
  items?: CartItemResolved[];
  itemsSum?: number;
  hasWeightCheck?: boolean;
}

export function resolveCart(inputs: unknown, reserved: Set<string>, catalog: Product[]): ResolveResult {
  const invalid = (error: string): ResolveResult => ({ ok: false, error });
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > MAX_CART_LINES) return invalid('Добавьте товары в корзину.');
  const items: CartItemResolved[] = [];
  const selectedPieces = new Set<string>();
  for (const value of inputs) {
    if (!value || typeof value !== 'object' || typeof value.productId !== 'string') return invalid('Некорректная позиция корзины.');
    const input = value as CartItemInput;
    const product = catalog.find((candidate) => candidate.id === input.productId);
    if (!product) return invalid('Один из товаров больше недоступен. Удалите его из корзины.');
    const qty = input.qty ?? MIN_QTY_PER_LINE;
    if (!Number.isSafeInteger(qty) || qty < MIN_QTY_PER_LINE || qty > MAX_QTY_PER_LINE) return invalid(`Количество упаковок должно быть целым числом от ${MIN_QTY_PER_LINE} до ${MAX_QTY_PER_LINE}.`);
    let weightG: number;
    let price: number;
    let rate: number | null;
    let label: string;
    let pieceId1c: string | null = null;
    if (input.kind === 'pack') {
      const index = input.packIdx ?? 0;
      if (product.kind !== 'pack' || !Number.isSafeInteger(index) || index < 0 || !product.packs[index]) return invalid('Выберите доступную фасовку.');
      const pack = product.packs[index];
      weightG = pack.weightG;
      price = pack.price;
      rate = null;
      label = pack.label;
    } else {
      if (qty !== 1) return invalid('Каждую весовую порцию добавьте отдельной позицией.');
      if (input.kind === 'bulk') {
        const bulk = product.bulk;
        const weight = input.weightG;
        if (!bulk || !Number.isSafeInteger(weight) || weight! < bulk.minG || weight! > bulk.maxG || (weight! - bulk.minG) % bulk.stepG !== 0) return invalid('Выберите вес порции в пределах ползунка.');
        weightG = weight!;
        rate = bulk.pricePerKg;
        price = weightPriceOf(weightG, rate);
        label = `На развес ${formatWeight(weightG)}`;
      } else if (product.kind === 'piece' && input.kind === 'piece') {
        const piece = product.pieces.find((candidate) => candidate.id1c === input.pieceId1c);
        if (!piece || reserved.has(piece.id1c) || selectedPieces.has(piece.id1c)) return invalid('Этот кусок уже зарезервирован. Выберите другой.');
        selectedPieces.add(piece.id1c);
        pieceId1c = piece.id1c;
        weightG = piece.weightG;
        rate = piece.price === undefined ? product.pricePerKg : null;
        price = piecePriceOf(product, weightG, piece.price);
        label = `${product.category === 'leg' ? 'Целая нога' : 'Кусок'} ${formatWeight(weightG)}`;
      } else if (product.kind === 'piece' && input.kind === 'average') {
        weightG = averageWeightOf(product);
        if (!weightG) return invalid('Средний вес этого товара пока не известен. Свяжитесь с лавкой.');
        const fixed = product.category === 'leg' ? product.pieces[0]?.price : undefined;
        rate = fixed === undefined ? product.pricePerKg : null;
        price = piecePriceOf(product, weightG, fixed);
        label = `${product.category === 'leg' ? 'Целая нога' : 'Кусок'} ~${formatWeight(weightG)}`;
      } else if (product.kind === 'piece' && product.category === 'piece' && input.kind === 'custom') {
        if (!Number.isSafeInteger(input.weightG) || input.weightG! < CUT_WEIGHT_MIN_G || input.weightG! > CUT_WEIGHT_MAX_G) return invalid(`Для отреза укажите вес ${CUT_RANGE}.`);
        weightG = input.weightG!;
        rate = product.pricePerKg;
        price = weightPriceOf(weightG, rate);
        label = `Отрез под заказ ~${formatWeight(weightG)}`;
      } else {
        return invalid('Этот вариант покупки недоступен для выбранного товара.');
      }
    }
    if (!Number.isSafeInteger(price) || price <= 0) return invalid('Цена товара пока не подтверждена. Свяжитесь с лавкой.');
    const requiresWeightCheck = input.kind !== 'pack';
    items.push({ uid: crypto.randomUUID(), productId: product.id, title: product.title, label, price, weightG, pricePerKg: rate, requiresWeightCheck, weightConfirmed: !requiresWeightCheck, pieceId1c, qty });
  }
  const itemsSum = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  if (!Number.isSafeInteger(itemsSum)) return invalid('Не удалось рассчитать заказ.');
  return { ok: true, items, itemsSum, hasWeightCheck: items.some((item) => item.requiresWeightCheck) };
}

export function formatWeight(weightG: number): string {
  if (weightG >= 1000) {
    return (weightG / 1000).toFixed(1).replace('.', ',') + '\u00A0кг';
  }
  return String(weightG) + '\u00A0г';
}

export function orderStatusRu(status: OrderStatus): string {
  return { awaiting_confirmation: 'Согласуем заказ', awaiting_payment: 'Ожидает оплаты', paid: 'Оплачен', cancelled: 'Отменён' }[status];
}
