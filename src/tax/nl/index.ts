import { taxLimitFactor } from '../../engine/simulation';
import type { WithdrawalResult } from '../../engine/taxEngine';
import type { Asset, SimulationParams } from '../../engine/types';
import nlParams from '../params/nl.json';
import type { FilingStatus, TaxSession } from '../types';

export interface Box3YearParams {
  taxRate: number;
  allowanceSingle: number;
  allowanceCouple: number;
  deemedReturnSavings: number;
  deemedReturnInvestments: number;
}

export interface Box3TaxResult {
  wealth: number;
  allowance: number;
  taxableWealth: number;
  weightedDeemedReturnRate: number;
  taxableDeemedIncome: number;
  taxOwed: number;
}

const EMPTY_WITHDRAWAL: WithdrawalResult = {
  grossWithdrawal: 0,
  netWithdrawal: 0,
  capitalGains: 0,
  taxesOwed: 0,
  costBasisSold: 0,
};

const BASE_YEAR = 2000;
const MAX_YEAR = 2200;
const DEFAULT_NL: Box3YearParams = nlParams.box3.byYear.default;
const NL_YEAR_TABLE: Box3YearParams[] = (() => {
  const arr = new Array<Box3YearParams>(MAX_YEAR - BASE_YEAR + 1).fill(DEFAULT_NL);
  const years = nlParams.box3.byYear.years as Record<string, Box3YearParams | undefined>;
  for (const [k, v] of Object.entries(years)) {
    const y = Number(k);
    if (v && y >= BASE_YEAR && y <= MAX_YEAR) {
      arr[y - BASE_YEAR] = v;
    }
  }
  return arr;
})();

export function box3ParamsForYear(calendarYear: number): Box3YearParams {
  const idx = (calendarYear | 0) - BASE_YEAR;
  return idx >= 0 && idx < NL_YEAR_TABLE.length ? NL_YEAR_TABLE[idx] : DEFAULT_NL;
}

/** Computes the fraction of the portfolio in Box 3 bank savings (`Cash`), in [0, 1]. */
export function computeNlPortfolioCashShare(assets: Asset[]): number {
  const cashSet = new Set(nlParams.box3.cashAssets);
  let total = 0;
  let cash = 0;
  for (let i = 0; i < assets.length; i++) {
    const w = assets[i].allocation / 100;
    if (w <= 0) continue;
    total += w;
    if (cashSet.has(assets[i].name)) cash += w;
  }
  return total > 0 ? cash / total : 0;
}

/**
 * Pure calculation of the Dutch Box 3 annual wealth tax under the Overbruggingswet box 3:
 *   1. Weighted deemed return rate = cashShare * r_savings + (1 - cashShare) * r_investments
 *   2. Tax-free allowance (heffingsvrij vermogen) = allowance(single|couple) * limitFactor
 *   3. Taxable wealth = max(0, wealth - allowance)
 *   4. Taxable deemed income = taxableWealth * weightedDeemedReturnRate
 *   5. Tax owed = taxableDeemedIncome * taxRate (36%)
 */
export function computeBox3AnnualTax(
  wealth: number,
  cashShare: number,
  calendarYear: number,
  filingStatus: FilingStatus = 'single',
  limitFactor = 1,
): Box3TaxResult {
  const yp = box3ParamsForYear(calendarYear);
  const cShare = Math.max(0, Math.min(1, cashShare));
  const weightedDeemedReturnRate =
    cShare * yp.deemedReturnSavings + (1 - cShare) * yp.deemedReturnInvestments;
  const baseAllowance = filingStatus === 'couple' ? yp.allowanceCouple : yp.allowanceSingle;
  const allowance = baseAllowance * limitFactor;
  const w = Math.max(0, wealth);

  if (w <= allowance) {
    return {
      wealth: w,
      allowance,
      taxableWealth: 0,
      weightedDeemedReturnRate,
      taxableDeemedIncome: 0,
      taxOwed: 0,
    };
  }

  const taxableWealth = w - allowance;
  const taxableDeemedIncome = taxableWealth * weightedDeemedReturnRate;
  const taxOwed = taxableDeemedIncome * yp.taxRate;

  return {
    wealth: w,
    allowance,
    taxableWealth,
    weightedDeemedReturnRate,
    taxableDeemedIncome,
    taxOwed,
  };
}

export class NetherlandsBox3Container {
  private value = 0;
  private basis = 0;

  totalContributions = 0;
  totalWithdrawals = 0;
  totalTaxesPaid = 0;
  totalCapitalGainsRealized = 0;

  get portfolioValue(): number {
    return this.value;
  }

  addContribution(amount: number): void {
    if (amount <= 0) return;
    this.value += amount;
    this.basis += amount;
    this.totalContributions += amount;
  }

  /** Zero-allocation hot-loop annual return + Box 3 tax settlement (before end-of-year contribution). */
  accrueYearFast(
    annualReturn: number,
    cashShare: number,
    calendarYear: number,
    filingStatus: FilingStatus,
    limitFactor: number,
  ): number {
    if (this.value <= 0) return 0;
    const afterReturn = Math.max(0, this.value * (1 + annualReturn));
    this.value = afterReturn;

    const yp = box3ParamsForYear(calendarYear);
    const allowance = (filingStatus === 'couple' ? yp.allowanceCouple : yp.allowanceSingle) * limitFactor;
    if (afterReturn <= allowance) return 0;

    const cShare = cashShare < 0 ? 0 : cashShare > 1 ? 1 : cashShare;
    const deemedRate = cShare * yp.deemedReturnSavings + (1 - cShare) * yp.deemedReturnInvestments;
    const taxOwed = (afterReturn - allowance) * deemedRate * yp.taxRate;
    const taxPaid = taxOwed < afterReturn ? taxOwed : afterReturn;

    this.value = afterReturn - taxPaid;
    this.totalTaxesPaid += taxPaid;
    return taxPaid;
  }

  /**
   * In Box 3, capital gains are not taxed at realization (tax is paid annually on deemed returns),
   * so gross withdrawal equals desired net withdrawal (clamped to portfolio value).
   */
  withdrawNet(targetNet: number): WithdrawalResult {
    if (targetNet <= 0 || this.value <= 0) return EMPTY_WITHDRAWAL;
    const gross = Math.min(targetNet, this.value);
    const ratio = gross / this.value;
    const basisSold = this.basis * ratio;
    const gain = Math.max(0, gross - basisSold);

    this.value = Math.max(0, this.value - gross);
    this.basis = Math.max(0, this.basis - basisSold);
    this.totalWithdrawals += gross;
    this.totalCapitalGainsRealized += gain;

    return {
      grossWithdrawal: gross,
      netWithdrawal: gross,
      capitalGains: gain,
      taxesOwed: 0,
      costBasisSold: basisSold,
    };
  }
}

export class NetherlandsTaxSession implements TaxSession {
  private readonly params: SimulationParams;
  private readonly accCashShare: number;
  private readonly retCashShare: number;
  readonly box3 = new NetherlandsBox3Container();

  constructor(params: SimulationParams, accCashShare = 0, retCashShare = 0) {
    this.params = params;
    this.accCashShare = accCashShare;
    this.retCashShare = retCashShare;
  }

  get portfolioValue(): number {
    return this.box3.portfolioValue;
  }
  get totalContributions(): number {
    return this.box3.totalContributions;
  }
  get totalWithdrawals(): number {
    return this.box3.totalWithdrawals;
  }
  get totalTaxesPaid(): number {
    return this.box3.totalTaxesPaid;
  }
  get totalCapitalGainsRealized(): number {
    return this.box3.totalCapitalGainsRealized;
  }
  get brokerageFinalValue(): number {
    return this.box3.portfolioValue;
  }
  get brokerageTaxesPaid(): number {
    return this.box3.totalTaxesPaid;
  }

  addInitialAmount(amount: number): void {
    if (amount > 0) this.box3.addContribution(amount);
  }

  onAccumulationYear(annualReturn: number, contribution: number, yearIndex: number): void {
    const startYear = this.params.startYear ?? 2027;
    const limitFactor = taxLimitFactor(this.params, yearIndex);
    this.box3.accrueYearFast(
      annualReturn,
      this.accCashShare,
      startYear + yearIndex,
      this.params.filingStatus ?? 'single',
      limitFactor,
    );
    if (contribution > 0) this.box3.addContribution(contribution);
  }

  applyRetirementReturn(annualReturn: number, yearIndex: number): number {
    const startYear = this.params.startYear ?? 2027;
    const totalYearIndex = Math.trunc(this.params.yearsToRetirement) + yearIndex;
    const limitFactor = taxLimitFactor(this.params, totalYearIndex);
    this.box3.accrueYearFast(
      annualReturn,
      this.retCashShare,
      startYear + totalYearIndex,
      this.params.filingStatus ?? 'single',
      limitFactor,
    );
    return this.box3.portfolioValue;
  }

  withdraw(requestedNetAmount: number): WithdrawalResult {
    return this.box3.withdrawNet(requestedNetAmount);
  }
}
