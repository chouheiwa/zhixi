import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import {
  type CurrencyUnit,
  getCurrencyUnit,
  setCurrencyUnit as persistUnit,
  convertFromSalt,
  formatIncome,
  formatIncomeShort,
  formatValue,
  formatAxisValue,
  currencyPrefix,
  currencySuffix,
  currencyLabel,
  currencyPrecision,
  rpmPrefix,
  rpmSuffix,
} from '@/shared/currency';

interface CurrencyContextValue {
  unit: CurrencyUnit;
  setUnit: (u: CurrencyUnit) => void;
  /** Convert raw salt-grain value to display value */
  convert: (salt: number) => number;
  /** "¥1.23" or "123盐粒" */
  format: (salt: number) => string;
  /** Short format with 万/千 */
  formatShort: (salt: number) => string;
  /** Format an already-converted value */
  fmtValue: (v: number) => string;
  /** Format for chart axis (compact) */
  fmtAxis: (v: number) => string;
  /** "¥" or "" */
  prefix: string;
  /** "" or " 盐粒" */
  suffix: string;
  /** "元" or "盐粒" */
  label: string;
  /** 2 or 0 */
  precision: number;
  /** RPM prefix: "¥" or "" */
  rpmPfx: string;
  /** RPM suffix: "" or " 盐粒" */
  rpmSfx: string;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [unit, setUnitState] = useState<CurrencyUnit>(getCurrencyUnit);

  const setUnit = useCallback((u: CurrencyUnit) => {
    setUnitState(u);
    persistUnit(u);
  }, []);

  const value = useMemo<CurrencyContextValue>(
    () => ({
      unit,
      setUnit,
      convert: (salt: number) => convertFromSalt(salt, unit),
      format: (salt: number) => formatIncome(salt, unit),
      formatShort: (salt: number) => formatIncomeShort(salt, unit),
      fmtValue: (v: number) => formatValue(v, unit),
      fmtAxis: (v: number) => formatAxisValue(v, unit),
      prefix: currencyPrefix(unit),
      suffix: currencySuffix(unit),
      label: currencyLabel(unit),
      precision: currencyPrecision(unit),
      rpmPfx: rpmPrefix(unit),
      rpmSfx: rpmSuffix(unit),
    }),
    [unit, setUnit],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
}
