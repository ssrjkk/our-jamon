import { promises as fs } from 'fs';
import path from 'path';
import { Order, OrderStatus } from './types';
import { findProduct, piecePriceOf } from './products';
import { CartItemInput, CartItemResolved } from './types';

// =========================================================================
// Хранилище заказов: JSON-файл (просто и надёжно на VPS).
// Для облака без файловой системы заменить на Postgres/Supabase — интерфейс тот же.
// Резерв кусков: кусок считается занятым, если числится в заказе со статусом
// awaiting_weight / awaiting_payment / paid.
// =========================================================================

const DATA_DIR = path.join(process.cwd(), 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readOrders(): Promise<Order[]> {
  await ensureDir();
  try {
    const raw = await fs.readFile(ORDERS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeOrders(orders: Order[]): Promise<void> {
  await ensureDir();
  await fs.writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf-8');
}

export async function saveOrder(order: Order): Promise<void> {
  const orders = await readOrders();
  orders.unshift(order);
  await writeOrders(orders);
}

export async function getOrder(id: string): Promise<Order | undefined> {
  const orders = await readOrders();
  return orders.find((o) => o.id === id);
}

export async function updateOrder(id: string, patch: Partial<Order>): Promise<Order | undefined> {
  const orders = await readOrders();
  const idx = orders.findIndex((o) => o.id === id);
  if (idx === -1) return undefined;
  orders[idx] = { ...orders[idx], ...patch };
  await writeOrders(orders);
  return orders[idx];
}

export async function reservedPieceIds(): Promise<Set<string>> {
  const orders = await readOrders();
  const reserved = new Set<string>();
  for (const o of orders) {
    if (o.status === 'cancelled') continue;
    for (const item of o.items) {
      if (item.pieceId1c) reserved.add(item.pieceId1c);
    }
  }
  return reserved;
}

export function generateOrderId(): string {
  return 'NH-' + String(Math.floor(1000 + Math.random() * 9000));
}

// =========================================================================
// Серверный пересчёт корзины: цены берутся ТОЛЬКО из каталога, клиентские
// суммы не доверяем. Кусок резервируется и не может быть добавлен дважды.
// =========================================================================
export interface ResolveResult {
  ok: boolean;
  error?: string;
  items?: CartItemResolved[];
  itemsSum?: number;
  hasWeightCheck?: boolean;
}

export function resolveCart(inputs: CartItemInput[], reserved: Set<string>): ResolveResult {
  const items: CartItemResolved[] = [];
  let uidCounter = 0;
  const nextUid = () => 'it-' + (++uidCounter) + '-' + Math.random().toString(36).slice(2, 6);
  for (const input of inputs) {
    const product = findProduct(input.productId);
    if (!product) return { ok: false, error: `Товар ${input.productId} не найден` };
    const qty = Math.max(1, Math.min(20, input.qty ?? 1));

    if (input.kind === 'piece') {
      const piece = product.pieces.find((p) => p.id1c === input.pieceId1c);
      if (!piece) return { ok: false, error: `Кусок ${input.pieceId1c} больше не в наличии` };
      if (reserved.has(piece.id1c)) {
        return { ok: false, error: `Кусок ${piece.id1c} уже забронирован - выберите другой` };
      }
      items.push({
        uid: nextUid(),
        productId: product.id,
        title: product.title,
        label: `Кусок ${formatWeight(piece.weightG)}`,
        price: piecePriceOf(product, piece.weightG, piece.price),
        weightG: piece.weightG,
        requiresWeightCheck: true,
        pieceId1c: piece.id1c,
        qty: 1,
      });
    } else if (input.kind === 'pack') {
      const pack = product.packs[input.packIdx ?? 0];
      if (!pack) return { ok: false, error: `Фасовка не найдена для ${product.id}` };
      items.push({
        uid: nextUid(),
        productId: product.id,
        title: product.title,
        label: pack.label,
        price: pack.price,
        weightG: pack.weightG,
        requiresWeightCheck: false,
        pieceId1c: null,
        qty,
      });
    } else if (input.kind === 'bulk') {
      const bulk = product.bulk;
      if (!bulk) return { ok: false, error: `Развес недоступен для ${product.id}` };
      const w = Math.min(bulk.maxG, Math.max(bulk.minG, input.weightG ?? 350));
      items.push({
        uid: nextUid(),
        productId: product.id,
        title: product.title,
        label: `На развес ${formatWeight(w)}`,
        price: Math.round((w / 1000) * bulk.pricePerKg),
        weightG: w,
        requiresWeightCheck: true,
        pieceId1c: null,
        qty: 1,
      });
    } else if (input.kind === 'custom') {
      // Решение Виталия: куски не выкладываем поштучно - считаем по среднему весу,
      // точный вес менеджер подтвердит при связи с клиентом
      const weights = product.pieces.map((pc) => pc.weightG);
      const avgW = weights.length ? Math.round(weights.reduce((a, b) => a + b, 0) / weights.length) : 250;
      items.push({
        uid: nextUid(),
        productId: product.id,
        title: product.title,
        label: 'Индивидуальный отрез под заказ',
        price: Math.round((avgW / 1000) * product.pricePerKg),
        weightG: avgW,
        requiresWeightCheck: true,
        pieceId1c: null,
        qty: 1,
      });
    }
  }
  if (!items.length) return { ok: false, error: 'Корзина пуста' };
  const itemsSum = items.reduce((acc, i) => acc + i.price * (i.qty || 1), 0);
  const hasWeightCheck = items.some((i) => i.requiresWeightCheck);
  return { ok: true, items, itemsSum, hasWeightCheck };
}

export function formatWeight(weightG: number): string {
  if (weightG >= 1000) {
    return (weightG / 1000).toFixed(1).replace('.', ',') + '\u00A0кг';
  }
  return String(weightG) + '\u00A0г';
}

export function orderStatusRu(status: OrderStatus): string {
  switch (status) {
    case 'awaiting_weight': return 'На проверке веса';
    case 'awaiting_payment': return 'Ждёт оплаты';
    case 'paid': return 'Оплачен';
    case 'cancelled': return 'Отменён';
  }
}
