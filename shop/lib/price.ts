/**
 * Единственная формула цены по весу для сервера, обеих витрин и админки.
 * Умножение раньше деления: `(w / 1000) * rate` округляется иначе, чем `w * rate / 1000`,
 * и карточка показывала сумму на 1 ₽ меньше заказа на 174 из 19 510 достижимых весов.
 */
export function weightPriceOf(weightG: number, pricePerKg: number): number {
  return Math.round(weightG * pricePerKg / 1000);
}

/**
 * Отрез под заказ: пределы заданы здесь и больше нигде. Сервер, карточка и весы
 * сверяют один и тот же диапазон, иначе витрина предлагает вес, который заказ отклоняет.
 */
export const CUT_WEIGHT_MIN_G = 50;
export const CUT_WEIGHT_MAX_G = 2000;

// Для прозы граммы остаются граммами: «от 50 до 2 000 г» — зафиксированная формулировка,
// formatWeightLabel перевернул бы её в «2 кг». Разделитель тот же, что у цен.
export function formatGrams(weightG: number): string {
  return `${new Intl.NumberFormat('ru-RU').format(weightG)}\u00A0г`;
}

export const CUT_RANGE = `от ${CUT_WEIGHT_MIN_G} до ${formatGrams(CUT_WEIGHT_MAX_G)}`;
