// Типы магазина «Наш Хамон». Формат данных совпадает с выгрузкой 1С:УНФ 3.0.

export type Country = 'ru' | 'es' | 'it' | 'gr' | 'fr' | 'ch';
export type Category = 'piece' | 'sliced' | 'leg' | 'olives' | 'cheese' | 'extras';
export type Kind = 'piece' | 'pack';

export interface Piece {
  id1c: string;
  weightG: number;
  /** Фиксированная цена за штуку (целые ноги) — если не задана, считается по pricePerKg */
  price?: number;
}

export interface Pack {
  label: string;
  weightG: number;
  price: number;
}

export interface Bulk {
  minG: number;
  maxG: number;
  stepG: number;
  pricePerKg: number;
}

export interface Product {
  id: string;
  country: Country;
  category: Category;
  title: string;
  agingMonths: number | null;
  description: string;
  kind: Kind;
  pricePerKg: number;
  pieces: Piece[];
  packs: Pack[];
  bulk: Bulk | null;
}

export interface CartItemInput {
  productId: string;
  /** 'piece' — конкретный кусок (pieceId1c обязателен), 'pack' — фасовка (packIdx), 'bulk' — развес (weightG), 'custom' — отрез под заказ */
  kind: 'piece' | 'pack' | 'bulk' | 'custom';
  pieceId1c?: string;
  packIdx?: number;
  weightG?: number;
  qty?: number;
}

export interface CartItemResolved {
  uid: string;
  productId: string;
  title: string;
  label: string;
  price: number;
  weightG: number;
  requiresWeightCheck: boolean;
  pieceId1c: string | null;
  qty: number;
}

export type OrderStatus =
  | 'awaiting_weight'      // есть весовые позиции: менеджер подтверждает вес
  | 'awaiting_payment'     // ссылка Т-Банка сформирована
  | 'paid'
  | 'cancelled';

export interface Order {
  id: string;
  createdAt: string;
  customer: { name: string; phone: string };
  delivery: { id: string; name: string; cost: number; address?: string };
  messenger: 'Telegram' | 'WhatsApp' | 'SMS';
  items: CartItemResolved[];
  itemsSum: number;
  total: number;
  status: OrderStatus;
  paymentUrl?: string;
  paymentId?: string;
  comment?: string;
}

export interface DeliveryOption {
  id: string;
  name: string;
  cost: number;
  note: string;
}
