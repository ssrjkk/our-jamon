/**
 * Количество упаковок одного товара в корзине. Правило одно на витрину, хранилище
 * корзины и сервер: 20 — это то, сколько лавка режет и пакует за один заказ.
 * Числа живут здесь, иначе подпись у поля, ограничение контрола, кламп при
 * восстановлении из localStorage и текст ошибки на сервере разъезжаются молча.
 */
export const MIN_QTY_PER_LINE = 1;
export const MAX_QTY_PER_LINE = 20;
// Разные упаковки и куски складываются в отдельные строки: 100 строк — это предел
// одного заказа, который сервер обязан принять так же, как его показывает витрина.
export const MAX_CART_LINES = 100;

/**
 * Значение поля количества доводится до диапазона, а не отбрасывается: контрол
 * показывает ровно то, что лежит в корзине. Пустое поле и «e» в number-инпуте —
 * это NaN, нижняя граница; «1e999» — бесконечность, верхняя. Дробное усечено.
 */
export function clampQuantity(qty: number): number {
  if (Number.isNaN(qty)) return MIN_QTY_PER_LINE;
  return Math.min(MAX_QTY_PER_LINE, Math.max(MIN_QTY_PER_LINE, Math.trunc(qty)));
}

export const QTY_LIMIT_NOTE = `До ${MAX_QTY_PER_LINE} одинаковых упаковок`;
export const QTY_MAX_NOTICE = `Можно заказать не более ${MAX_QTY_PER_LINE} одинаковых упаковок. Количество скорректировано.`;
export const QTY_ADD_NOTICE = `Можно добавить не более ${MAX_QTY_PER_LINE} одинаковых упаковок.`;
export const QTY_MIN_NOTICE = `В корзине должна остаться хотя бы ${MIN_QTY_PER_LINE} упаковка.`;
