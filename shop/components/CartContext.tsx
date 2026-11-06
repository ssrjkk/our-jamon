'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// =========================================================================
// Корзина клиента: localStorage + try/catch (приватный режим).
// Цены при оформлении пересчитывает сервер (см. lib/orders.ts resolveCart).
// =========================================================================

export interface CartLine {
  uid: string;
  productId: string;
  title: string;
  label: string;
  price: number;
  weightG: number;
  requiresWeightCheck: boolean;
  pieceId1c: string | null;
  kind: 'piece' | 'pack' | 'bulk' | 'custom';
  packIdx?: number;
  qty: number;
}

interface CartContextValue {
  lines: CartLine[];
  count: number;
  sum: number;
  hasWeightCheck: boolean;
  reservedPieceIds: string[];
  addLine: (line: Omit<CartLine, 'uid'>) => void;
  removeLine: (uid: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = 'nh_cart_v2';

function loadLines(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLines(loadLines());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* ошибки квоты игнорируем */
    }
  }, [lines, hydrated]);

  const addLine = useCallback((line: Omit<CartLine, 'uid'>) => {
    setLines((prev) => {
      // Кусок уникален: второй раз в корзину не положить
      if (line.pieceId1c && prev.some((l) => l.pieceId1c === line.pieceId1c)) return prev;
      const next = [...prev];
      // Фасовки складываются по количеству
      const same = next.findIndex((l) => l.productId === line.productId && l.kind === line.kind && l.label === line.label && !l.pieceId1c);
      if (same !== -1 && line.kind === 'pack') {
        next[same] = { ...next[same], qty: next[same].qty + (line.qty || 1) };
        return next;
      }
      next.push({ ...line, uid: 'item-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) });
      return next;
    });
  }, []);

  const removeLine = useCallback((uid: string) => {
    setLines((prev) => prev.filter((l) => l.uid !== uid));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartContextValue>(() => {
    const reservedPieceIds = lines.filter((l) => l.pieceId1c).map((l) => l.pieceId1c as string);
    return {
      lines,
      count: lines.length,
      sum: lines.reduce((acc, l) => acc + l.price * (l.qty || 1), 0),
      hasWeightCheck: lines.some((l) => l.requiresWeightCheck),
      reservedPieceIds,
      addLine,
      removeLine,
      clear,
    };
  }, [lines, addLine, removeLine, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}

export function formatRub(num: number): string {
  return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0') + '\u00A0₽';
}

export function formatWeightLabel(weightG: number): string {
  if (weightG >= 1000) {
    return (weightG / 1000).toFixed(1).replace('.', ',') + '\u00A0кг';
  }
  return String(weightG) + '\u00A0г';
}
