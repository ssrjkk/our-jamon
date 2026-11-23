export type Category = 'piece' | 'sliced' | 'leg' | 'cheese' | 'olives' | 'snacks' | 'oils' | 'spices' | 'sweets' | 'chocolate' | 'extras' | 'certificate';
export type Kind = 'piece' | 'pack';
export type PurchaseKind = 'piece' | 'average' | 'pack' | 'bulk' | 'custom';

export interface Piece {
  id1c: string;
  weightG: number;
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
  code: string;
  category: Category;
  title: string;
  agingMonths: number | null;
  description: string;
  kind: Kind;
  pricePerKg: number;
  pieces: Piece[];
  packs: Pack[];
  bulk: Bulk | null;
  imageUrl?: string;
  imageCaption?: string;
  imageW?: number;
  imageH?: number;
}

export interface CartItemInput {
  productId: string;
  kind: PurchaseKind;
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
  pricePerKg: number | null;
  requiresWeightCheck: boolean;
  weightConfirmed: boolean;
  pieceId1c: string | null;
  qty: number;
}

export type OrderStatus = 'awaiting_confirmation' | 'awaiting_payment' | 'paid' | 'cancelled';
export type Messenger = 'Telegram' | 'WhatsApp' | 'SMS';
export type PaymentMethod = 'card' | 'sbp' | 'pay_on_pickup';
export type PaymentState = 'pending' | 'confirmed' | 'cancelled' | 'rejected' | 'expired' | 'refunded';

export interface OrderDelivery {
  id: string;
  name: string;
  cost: number | null;
  baseCost: number | null;
  freeFrom: number | null;
  address?: string;
}

export interface PaymentOperation {
  id: string;
  kind: 'refund' | 'closing_receipt';
  state: 'running' | 'needs_attention' | 'succeeded';
  startedAt: string;
  finishedAt?: string;
  attempt: number;
  error?: string;
  markCodes?: Record<string, string[]>;
}

export interface Order {
  id: string;
  accessToken: string;
  createdAt: string;
  consentedAt: string | null;
  demo: boolean;
  customer: { name: string; phone: string };
  delivery: OrderDelivery;
  messenger: Messenger;
  items: CartItemResolved[];
  itemsSum: number;
  total: number | null;
  status: OrderStatus;
  paymentMethod?: PaymentMethod;
  paymentUrl?: string;
  sbpPayloadUrl?: string;
  sbpQrSvg?: string;
  closingReceiptSentAt?: string;
  paymentOperation?: PaymentOperation;
  paymentId?: string;
  paymentIds?: string[];
  paymentStates?: Record<string, PaymentState>;
  paidPaymentId?: string;
  refundPaymentIds?: string[];
  refundedPaymentIds?: string[];
  paymentError?: boolean;
  paymentInitAt?: string;
  onecSyncedAt?: string;
  onecSyncError?: string;
}

export interface DeliveryOption {
  id: string;
  name: string;
  cost: number | null;
  freeEligible: boolean;
  note: string;
}

export interface CartQuote {
  items: CartItemResolved[];
  itemsSum: number;
  delivery: OrderDelivery;
  total: number | null;
  needsConfirmation: boolean;
  demo: boolean;
}

export interface AdminAuditEntry {
  id: number;
  ts: string;
  action: string;
  orderId: string | null;
  detail: string | null;
  ip: string;
}
