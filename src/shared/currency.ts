/** Currency unit toggle: salt grains (盐粒) vs yuan (元) */

export type CurrencyUnit = 'salt' | 'yuan';

const SALT_TO_YUAN = 100;
const STORAGE_KEY = 'zhixi-currency-unit';

// ─── Persistence ─────────────────────────────────────────────────────────────

export function getCurrencyUnit(): CurrencyUnit {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'salt' ? 'salt' : 'yuan';
  } catch {
    return 'yuan';
  }
}

export function setCurrencyUnit(unit: CurrencyUnit): void {
  try {
    localStorage.setItem(STORAGE_KEY, unit);
  } catch {
    // ignore storage errors
  }
}

// ─── Conversion ──────────────────────────────────────────────────────────────

/** Convert a raw salt-grain value to the target unit's numeric value */
export function convertFromSalt(salt: number, unit: CurrencyUnit): number {
  return unit === 'salt' ? salt : salt / SALT_TO_YUAN;
}

// ─── Formatting ──────────────────────────────────────────────────────────────

/** Full formatted income string: "¥1.23" or "123盐粒" */
export function formatIncome(salt: number, unit: CurrencyUnit): string {
  if (unit === 'salt') {
    return `${Math.round(salt)}盐粒`;
  }
  return `¥${(salt / SALT_TO_YUAN).toFixed(2)}`;
}

/** Short formatted income: "¥1.2万" / "1.2万盐粒" */
export function formatIncomeShort(salt: number, unit: CurrencyUnit): string {
  const value = convertFromSalt(salt, unit);
  const absValue = Math.abs(value);

  if (unit === 'salt') {
    if (absValue >= 10000) return `${(value / 10000).toFixed(1)}万盐粒`;
    if (absValue >= 1000) return `${(value / 1000).toFixed(1)}千盐粒`;
    return `${Math.round(value)}盐粒`;
  }
  if (absValue >= 10000) return `¥${(value / 10000).toFixed(1)}万`;
  if (absValue >= 1000) return `¥${(value / 1000).toFixed(1)}千`;
  return `¥${value.toFixed(2)}`;
}

/** Prefix for Ant Design Statistic: "¥" or "" */
export function currencyPrefix(unit: CurrencyUnit): string {
  return unit === 'yuan' ? '¥' : '';
}

/** Suffix for Ant Design Statistic: "" or " 盐粒" */
export function currencySuffix(unit: CurrencyUnit): string {
  return unit === 'salt' ? ' 盐粒' : '';
}

/** Label for headers/columns: "元" or "盐粒" */
export function currencyLabel(unit: CurrencyUnit): string {
  return unit === 'salt' ? '盐粒' : '元';
}

/** Precision for Ant Design Statistic */
export function currencyPrecision(unit: CurrencyUnit): number {
  return unit === 'salt' ? 0 : 2;
}

/** Format an axis / tooltip value that is already converted */
export function formatValue(value: number, unit: CurrencyUnit): string {
  if (unit === 'salt') return `${Math.round(value)}盐粒`;
  return `¥${value.toFixed(2)}`;
}

/** Format an axis / tooltip value (short, no decimals for axis) */
export function formatAxisValue(value: number, unit: CurrencyUnit): string {
  if (unit === 'salt') return `${Math.round(value)}`;
  return `¥${value.toFixed(0)}`;
}

/** RPM display prefix */
export function rpmPrefix(unit: CurrencyUnit): string {
  return unit === 'yuan' ? '¥' : '';
}

/** RPM display suffix */
export function rpmSuffix(unit: CurrencyUnit): string {
  return unit === 'salt' ? ' 盐粒' : '';
}
