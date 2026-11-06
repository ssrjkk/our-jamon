// =========================================================================
// ИНТЕГРАЦИЯ СДЭК
// Пока — заглушка ПВЗ и фиксированные тарифы [заглушка тарифов].
// Боевой режим: подключить Account/Password СДЭК в env,
// калькулятор: https://api.cdek.ru/v2/calculator/tariff, список ПВЗ:
// https://api.cdek.ru/v2/deliverypoints (использовать официальный виджет ISDEKWidjet на клиенте).
// =========================================================================

export interface DeliveryPoint {
  code: string;
  city: string;
  address: string;
}

const MOCK_PVZ: DeliveryPoint[] = [
  { code: 'SPB-42', city: 'Санкт-Петербург', address: 'Каменноостровский пр., 42' },
  { code: 'SPB-114', city: 'Санкт-Петербург', address: 'Невский пр., 114' },
  { code: 'MSK-92', city: 'Москва', address: 'ул. Маросейка, 9/2' },
];

export async function getDeliveryPoints(city?: string): Promise<DeliveryPoint[]> {
  // TODO ИНТЕГРАЦИЯ СДЭК: запрос к /v2/deliverypoints с city_code
  if (city) {
    return MOCK_PVZ.filter((p) => p.city.toLowerCase().includes(city.toLowerCase()));
  }
  return MOCK_PVZ;
}

// [заглушка тарифов] — уточнить у Виталия
export function estimateCdekCost(weightG: number): number {
  return weightG <= 2000 ? 290 : 490;
}
