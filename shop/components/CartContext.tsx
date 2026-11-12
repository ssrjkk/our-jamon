'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PurchaseKind } from '@/lib/types';

export interface CartLine {
  uid: string;
  productId: string;
  title: string;
  label: string;
  price: number;
  weightG: number;
  requiresWeightCheck: boolean;
  pieceId1c: string | null;
  kind: PurchaseKind;
  packIdx?: number;
  qty: number;
}

interface CartContextValue {
  lines: CartLine[];
  count: number;
  sum: number;
  ready: boolean;
  notice: string;
  hasWeightCheck: boolean;
  reservedPieceIds: string[];
  addLine: (line: Omit<CartLine, 'uid'>) => boolean;
  addLines: (lines: Omit<CartLine, 'uid'>[]) => boolean;
  setQuantity: (uid: string, qty: number) => void;
  removeLine: (uid: string) => void;
  canUndoRemove: boolean;
  undoRemove: () => void;
  consumeLines: (ordered: CartLine[]) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = 'nh_cart_v2';

/**
 * crypto.randomUUID() существует только в защищённом контексте, а магазин из README
 * стартует и на http://IP:3000: там «В корзину» падал с TypeError на каждой кнопке.
 */
export function newLineUid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadLines(): { lines: CartLine[]; notice: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { lines: [], notice: '' };
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { lines: [], notice: 'Не удалось восстановить корзину. Добавьте товары заново.' };
    const valid = parsed.filter((line): line is CartLine => line && typeof line === 'object'
      && typeof line.uid === 'string' && typeof line.productId === 'string' && typeof line.title === 'string' && typeof line.label === 'string'
      && Number.isSafeInteger(line.price) && line.price > 0 && Number.isSafeInteger(line.weightG) && line.weightG >= 0
      && typeof line.requiresWeightCheck === 'boolean' && (line.pieceId1c === null || typeof line.pieceId1c === 'string')
      && ['piece', 'average', 'pack', 'bulk', 'custom'].includes(line.kind) && Number.isSafeInteger(line.qty) && line.qty > 0
      && (line.packIdx === undefined || Number.isSafeInteger(line.packIdx) && line.packIdx >= 0));
    const limited = valid.some((line) => line.qty > 20);
    const lines = valid.map((line) => ({ ...line, qty: Math.min(line.qty, 20) }));
    return { lines, notice: limited ? 'Можно заказать не более 20 одинаковых упаковок. Количество скорректировано.' : valid.length !== parsed.length ? 'Часть корзины не удалось восстановить. Проверьте её состав.' : '' };
  } catch {
    return { lines: [], notice: 'Корзина работает в этой вкладке, но браузер не разрешает сохранять её.' };
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [removed, setRemoved] = useState<{ line: CartLine; index: number } | null>(null);
  const current = useRef<CartLine[]>([]);
  const commit = useCallback((next: CartLine[]) => {
    current.current = next;
    setLines(next);
    setRemoved(null);
  }, []);

  useEffect(() => {
    const saved = loadLines();
    commit(saved.lines);
    setNotice(saved.notice);
    setReady(true);
  }, [commit]);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(lines)); }
    catch { setNotice('Браузер не разрешает сохранять корзину. Не закрывайте вкладку до оформления.'); }
  }, [lines, ready]);

  // Соседняя вкладка пишет в то же хранилище, и без этого слушателя последняя
  // сохранённая версия молча побеждала: корзина из другой вкладки пропадала.
  // event.key === null — это очистка всего хранилища, корзина обнуляется.
  useEffect(() => {
    if (!ready) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== STORAGE_KEY) return;
      const saved = loadLines();
      commit(saved.lines);
      if (saved.notice) setNotice(saved.notice);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [ready, commit]);

  const addLines = useCallback((incoming: Omit<CartLine, 'uid'>[]): boolean => {
    const next = [...current.current];
    for (const line of incoming) {
      if (line.pieceId1c && next.some((item) => item.pieceId1c === line.pieceId1c)) { setNotice('Этот кусок уже есть в корзине.'); return false; }
      const index = line.kind === 'pack' ? next.findIndex((item) => item.kind === 'pack' && item.productId === line.productId && (item.packIdx ?? 0) === (line.packIdx ?? 0)) : -1;
      if (line.qty < 1 || line.qty > 20 || index !== -1 && next[index].qty + line.qty > 20) { setNotice('Можно добавить не более 20 одинаковых упаковок.'); return false; }
      if (index !== -1) next[index] = { ...next[index], qty: next[index].qty + line.qty };
      else next.push({ ...line, uid: newLineUid() });
    }
    if (next.length > 100) { setNotice('В одном заказе может быть не более 100 позиций.'); return false; }
    setNotice('');
    commit(next);
    return true;
  }, [commit]);
  const addLine = useCallback((line: Omit<CartLine, 'uid'>) => addLines([line]), [addLines]);
  const removeLine = useCallback((uid: string) => {
    const index = current.current.findIndex((line) => line.uid === uid);
    if (index === -1) return;
    const line = current.current[index];
    commit(current.current.filter((item) => item.uid !== uid));
    setRemoved({ line, index });
  }, [commit]);
  const undoRemove = useCallback(() => {
    if (!removed) return;
    const next = [...current.current];
    next.splice(Math.min(removed.index, next.length), 0, removed.line);
    commit(next);
  }, [removed, commit]);
  const setQuantity = useCallback((uid: string, qty: number) => {
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > 20) return;
    commit(current.current.map((line) => line.uid === uid && line.kind === 'pack' ? { ...line, qty } : line));
  }, [commit]);
  const consumeLines = useCallback((ordered: CartLine[]) => {
    const quantities = new Map(ordered.map((line) => [line.uid, line.qty]));
    commit(current.current.flatMap((line) => {
      const qty = line.qty - (quantities.get(line.uid) || 0);
      return qty > 0 ? [{ ...line, qty }] : [];
    }));
  }, [commit]);
  const clear = useCallback(() => commit([]), [commit]);
  const value = useMemo<CartContextValue>(() => ({
    lines, ready, notice, count: lines.reduce((sum, line) => sum + line.qty, 0), sum: lines.reduce((sum, line) => sum + line.price * line.qty, 0),
    hasWeightCheck: lines.some((line) => line.requiresWeightCheck), reservedPieceIds: lines.flatMap((line) => line.pieceId1c ? [line.pieceId1c] : []),
    addLine, addLines, setQuantity, removeLine, canUndoRemove: removed !== null, undoRemove, consumeLines, clear,
  }), [lines, ready, notice, removed, addLine, addLines, setQuantity, removeLine, undoRemove, consumeLines, clear]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within CartProvider');
  return context;
}

export function formatRub(value: number): string {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value);
}

export function formatWeightLabel(weightG: number): string {
  return weightG >= 1000 ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(weightG / 1000)}\u00a0кг` : `${weightG}\u00a0г`;
}

/**
 * Строка веса и количества под позицией корзины. Фасовки без граммов (оливки и масло
 * в прайсе заданы объёмом, weightG = 0) не должны печатать «0 г за шт.» — для них
 * остаётся только количество, а объём уже виден в подписи фасовки.
 */
export function formatUnitSummary(item: { weightG: number; qty: number }): string {
  const parts = [];
  if (item.weightG > 0) parts.push(`${formatWeightLabel(item.weightG)} за шт.`);
  if (item.qty > 1) parts.push(`${item.qty} шт.`);
  return parts.join(' · ');
}
