// Единая шкала выдержки: фильтр каталога и линейка на панели «Выдержка» обязаны
// считать месяцы одними руками. Дважды написанная граница разойдётся молча, и
// покупатель получит раздел, где часть полки не открывается ни одной ссылкой.

/** Границы полос фильтра: значение живёт в адресе ?aging=, подпись видна покупателю. */
export const AGING_BANDS = [
  { value: '8-12', label: '8–12\u00A0мес.', min: 8, max: 12 },
  { value: '14-18', label: '14–18\u00A0мес.', min: 14, max: 18 },
  { value: '20-22', label: '20–22\u00A0мес.', min: 20, max: 22 },
  { value: '24', label: '24+\u00A0мес.', min: 24, max: Infinity },
];

/** Одно значение фильтра против одной позиции: «24» значит «и дольше», «8-12» значит промежуток. */
export function agingMatches(months: number | null, value: string) {
  if (!value || value === 'all') return true;
  if (!months) return false;
  if (value === '24' || value === '24+') return months >= 24;
  if (/^\d+-\d+$/.test(value)) {
    const [min, max] = value.split('-').map(Number);
    return months >= min && months <= max;
  }
  return months === Number(value);
}

/**
 * Линейка по месяцам: шаг два, если все значения каталога одной чётности, иначе один.
 * Иначе деление «12» печатало бы позицию с 13 месяцами, а пустые ячейки — это честная
 * правда о полке, которую линейка и обязана показывать.
 *
 * Хвост «и дольше» — одно деление, а не шесть с пустотами: в адресе `?aging=24` живёт
 * именно смысл «24 и больше», и ссылка над штрихом обязана открывать ровно тот список,
 * число которого напечатано над этим штрихом. Иначе деление «24» с четвёркой обещала бы
 * четыре позиции, а фильтр отдавал пять — по одной ноге с 36-месячной выдержкой.
 */
export function agingScale(entries: { agingMonths: number | null }[]) {
  const values = entries.map((entry) => entry.agingMonths).filter((months): months is number => typeof months === 'number' && months > 0);
  if (!values.length) return { cells: [], step: 0, total: 0 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = values.every((months) => (months - min) % 2 === 0) ? 2 : 1;
  const counts = new Map<number, number>();
  for (const months of values) counts.set(months, (counts.get(months) ?? 0) + 1);
  const tail = AGING_BANDS[AGING_BANDS.length - 1];
  const cells: { months: number; count: number; value: string; label: string }[] = [];
  for (let months = min; months <= max; months += step) {
    if (months >= tail.min) {
      cells.push({ months: tail.min, count: values.filter((entry) => entry >= tail.min).length, value: tail.value, label: `${tail.min}+` });
      break;
    }
    cells.push({ months, count: counts.get(months) ?? 0, value: String(months), label: String(months) });
  }
  return { cells, step, total: values.length };
}
