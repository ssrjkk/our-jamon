import { configuredAmount } from './config';
import { DeliveryOption, OrderDelivery } from './types';

export function freeDeliveryFrom(): number | null {
  const amount = configuredAmount('FREE_DELIVERY_FROM');
  return amount && amount > 0 ? amount : null;
}

export function getDeliveryOptions(): DeliveryOption[] {
  return [
    { id: 'pickup', name: 'Самовывоз', cost: 0, freeEligible: false, note: 'Сытнинская ул., 4П · вт–вс 10:30–20:30' },
    { id: 'cdek', name: 'СДЭК · пункт выдачи', cost: configuredAmount('DELIVERY_CDEK_RUB'), freeEligible: false, note: 'Укажите пункт выдачи. Стоимость согласуем до оплаты.' },
    { id: 'yandex', name: 'Яндекс Доставка', cost: configuredAmount('DELIVERY_YANDEX_RUB'), freeEligible: true, note: 'Курьер по Санкт-Петербургу. Стоимость согласуем до оплаты.' },
    { id: 'drivee', name: 'Drivee · курьер', cost: configuredAmount('DELIVERY_DRIVEE_RUB'), freeEligible: true, note: 'Курьер по Санкт-Петербургу. Стоимость согласуем до оплаты.' },
  ];
}

export function deliveryCostFor(delivery: Pick<OrderDelivery, 'baseCost' | 'freeFrom'>, itemsSum: number): number | null {
  return delivery.freeFrom !== null && itemsSum >= delivery.freeFrom ? 0 : delivery.baseCost;
}

export function resolveDelivery(id: string, itemsSum: number, address?: string): OrderDelivery | undefined {
  const option = getDeliveryOptions().find((candidate) => candidate.id === id);
  if (!option) return undefined;
  const delivery: OrderDelivery = {
    id: option.id,
    name: option.name,
    baseCost: option.cost,
    cost: option.cost,
    freeFrom: option.freeEligible ? freeDeliveryFrom() : null,
    ...(id !== 'pickup' && address ? { address } : {}),
  };
  delivery.cost = deliveryCostFor(delivery, itemsSum);
  return delivery;
}
