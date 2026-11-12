/**
 * Единственная формула цены по весу для сервера, обеих витрин и админки.
 * Умножение раньше деления: `(w / 1000) * rate` округляется иначе, чем `w * rate / 1000`,
 * и карточка показывала сумму на 1 ₽ меньше заказа на 174 из 19 510 достижимых весов.
 */
export function weightPriceOf(weightG: number, pricePerKg: number): number {
  return Math.round(weightG * pricePerKg / 1000);
}
