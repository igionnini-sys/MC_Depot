/**
 * Monte Carlo engine: port of simulation_engine.py (independent assets) and
 * correlation_engine.py (correlated assets). Semantics are kept identical to the
 * Streamlit app, including the retirement-phase conventions documented in PROGRESS.md.
 */
import { createNormal, createRng, isPositiveSemiDefinite, nearestCorrelationMatrix, psdFactor } from './random';
import { mean, max, min, percentile, std } from './stats';
import { TaxEngine } from './taxEngine';
import type { Asset, SimulationRequest, SimulationResults, SummaryStats, TaxAnalysis, TaxDetails } from './types';

interface PhaseData {
  mean: number[];
  vol: number[];
  alloc: number[];
  minR: number[];
  maxR: number[];
  ter: number[];
  /** Lower-triangular factor of the correlation matrix, or null for independent draws. */
  factor: number[][] | null;
}

function phaseData(assets: Asset[], corr: number[][] | null): PhaseData {
  return {
    mean: assets.map((a) => a.return / 100),
    vol: assets.map((a) => a.volatility / 100),
    alloc: assets.map((a) => a.allocation / 100),
    minR: assets.map((a) => a.min_return / 100),
    maxR: assets.map((a) => a.max_return / 100),
    ter: assets.map((a) => a.ter / 100),
    factor: corr ? psdFactor(corr) : null,
  };
}

/** Pairwise defaults used by correlation_engine.py when no matrix is configured. */
const DEFAULT_PAIRS: Record<string, number> = {
  'Stocks|Bond': -0.1, 'Stocks|Gold': 0.1, 'Stocks|REIT': 0.7, 'Stocks|Commodities': 0.3, 'Stocks|Cash': 0.0,
  'Bond|Gold': 0.2, 'Bond|REIT': 0.1, 'Bond|Commodities': 0.1, 'Bond|Cash': 0.3,
  'Gold|REIT': 0.2, 'Gold|Commodities': 0.4, 'Gold|Cash': 0.1,
  'REIT|Commodities': 0.3, 'REIT|Cash': 0.0, 'Commodities|Cash': 0.0,
};

export function defaultCorrelationMatrix(names: string[]): number[][] {
  return names.map((a, i) =>
    names.map((b, j) => {
      if (i === j) return 1;
      const c = DEFAULT_PAIRS[`${a}|${b}`] ?? DEFAULT_PAIRS[`${b}|${a}`];
      if (c !== undefined) return c;
      return a.includes('UserAsset') || b.includes('UserAsset') ? 0.2 : 0.1;
    }),
  );
}

/** Sub-matrix for `names` taken from a full matrix ordered as `allNames`; symmetrised and made PSD. */
export function correlationSubmatrix(allNames: string[], full: number[][], names: string[]): number[][] {
  const idx = names.map((n) => allNames.indexOf(n));
  let m = idx.some((i) => i < 0)
    ? defaultCorrelationMatrix(names)
    : idx.map((i) => idx.map((j) => full[i][j]));
  m = m.map((row, i) => row.map((x, j) => (x + m[j][i]) / 2));
  return isPositiveSemiDefinite(m) ? m : nearestCorrelationMatrix(m);
}

interface SingleResult {
  accumulationNominal: number;
  accumulationReal: number;
  final: number;
  avgNetWithdrawal: number;
  tax: TaxDetails;
}

export type ProgressFn = (done: number, total: number) => void;

export function runSimulation(req: SimulationRequest, onProgress?: ProgressFn): SimulationResults {
  const { params: p, accumulationAssets, retirementAssets, correlation } = req;
  const useCorr = !!correlation?.enabled;
  const accCorr = useCorr ? correlationSubmatrix(correlation!.assets, correlation!.matrix, accumulationAssets.map((a) => a.name)) : null;
  const retCorr = useCorr ? correlationSubmatrix(correlation!.assets, correlation!.matrix, retirementAssets.map((a) => a.name)) : null;
  const acc = phaseData(accumulationAssets, accCorr);
  const ret = phaseData(retirementAssets, retCorr);

  const normal = createNormal(createRng(req.seed));
  const n = p.nSimulations;
  const out = {
    accumulation: new Float64Array(n),
    accumulationNominal: new Float64Array(n),
    final: new Float64Array(n),
    realWithdrawal: new Float64Array(n),
  };
  const taxesPaid = new Float64Array(n);
  const effectiveRates = new Float64Array(n);
  const finalWithdrawals = new Float64Array(n);

  const step = Math.max(1, Math.floor(n / 100));
  for (let s = 0; s < n; s++) {
    if (onProgress && s % step === 0) onProgress(s, n);
    const r = simulateOne(p, acc, ret, normal, useCorr);
    out.accumulation[s] = r.accumulationReal;
    out.accumulationNominal[s] = r.accumulationNominal;
    out.final[s] = r.final;
    out.realWithdrawal[s] = r.avgNetWithdrawal;
    taxesPaid[s] = r.tax.totalTaxesPaid;
    effectiveRates[s] = r.tax.totalWithdrawals > 0 ? (r.tax.totalTaxesPaid / r.tax.totalWithdrawals) * 100 : 0;
    finalWithdrawals[s] = r.tax.finalWithdrawal;
  }
  onProgress?.(n, n);

  const taxAnalysis: TaxAnalysis = {
    totalTaxes: summary(taxesPaid),
    effectiveTaxRate: summary(effectiveRates),
    avgFinalWithdrawal: mean(finalWithdrawals),
  };
  return { ...out, taxAnalysis, correlationUsed: useCorr };
}

function summary(v: Float64Array): SummaryStats {
  return { mean: mean(v), median: percentile(v, 50), min: min(v), max: max(v), std: std(v) };
}

/** Weighted portfolio return for one year: capped asset returns minus TER. */
function yearReturn(d: PhaseData, normal: () => number, z: number[], corr: number[]): number {
  const k = d.mean.length;
  for (let i = 0; i < k; i++) z[i] = normal();
  if (d.factor) {
    for (let i = 0; i < k; i++) {
      let s = 0;
      const row = d.factor[i];
      // Full product: Cholesky factors are zero above the diagonal, eigen factors are dense.
      for (let j = 0; j < k; j++) s += row[j] * z[j];
      corr[i] = s;
    }
  } else {
    for (let i = 0; i < k; i++) corr[i] = z[i];
  }
  let total = 0;
  for (let i = 0; i < k; i++) {
    const raw = d.mean[i] + d.vol[i] * corr[i];
    const capped = Math.max(Math.min(raw, d.maxR[i]), d.minR[i]);
    total += (capped - d.ter[i]) * d.alloc[i];
  }
  return total;
}

function simulateOne(
  p: SimulationRequest['params'],
  acc: PhaseData,
  ret: PhaseData,
  normal: () => number,
  correlated: boolean,
): SingleResult {
  const inflation = p.inflation / 100;
  const yearsAcc = Math.trunc(p.yearsToRetirement);
  const yearsRet = Math.trunc(p.yearsRetired);
  const tax = new TaxEngine(p.capitalGainsTaxRate, yearsAcc + 2);
  const zA = new Array<number>(acc.mean.length), cA = new Array<number>(acc.mean.length);
  const zR = new Array<number>(ret.mean.length), cR = new Array<number>(ret.mean.length);

  if (p.initialAmount > 0) tax.addContribution(p.initialAmount);
  let contribution = p.annualContribution;

  // Accumulation: returns are applied first, then the end-of-year contribution.
  for (let y = 0; y < yearsAcc; y++) {
    tax.applyReturns(yearReturn(acc, normal, zA, cA));
    if (contribution > 0) tax.addContribution(contribution);
    if (p.adjustContributionInflation) contribution *= 1 + inflation;
  }

  const accumulationNominal = tax.portfolioValue;
  const accumulationReal = accumulationNominal / (1 + inflation) ** p.yearsToRetirement;

  let totalNet = 0;
  let withdrawals = 0;
  let taxSum = 0;
  for (let y = 0; y < yearsRet; y++) {
    const nominal = yearReturn(ret, normal, zR, cR);
    // simulation_engine.py subtracts inflation; correlation_engine.py uses the exact Fisher form.
    const real = correlated ? (1 + nominal) / (1 + inflation) - 1 : nominal - inflation;
    tax.applyReturns(real);

    const value = tax.portfolioValue;
    if (value <= 0) break;

    const amount = p.useRealWithdrawal
      ? p.withdrawal * (1 + inflation) ** (p.yearsToRetirement + y)
      : p.withdrawal;
    const w = tax.withdraw(Math.min(amount, value));
    totalNet += w.netWithdrawal;
    taxSum += w.taxesOwed;
    withdrawals++;
    if (tax.portfolioValue <= 0) break;
  }

  return {
    accumulationNominal,
    accumulationReal,
    final: tax.portfolioValue,
    avgNetWithdrawal: withdrawals > 0 ? totalNet / withdrawals : p.withdrawal,
    tax: {
      totalContributions: tax.totalContributions,
      totalWithdrawals: tax.totalWithdrawals,
      totalTaxesPaid: tax.totalTaxesPaid,
      totalCapitalGainsRealized: tax.totalCapitalGainsRealized,
      averageAnnualTax: withdrawals > 0 ? taxSum / withdrawals : 0,
      totalYearsWithWithdrawals: withdrawals,
      finalWithdrawal:
        p.useRealWithdrawal && p.yearsRetired > 0
          ? p.withdrawal * (1 + inflation) ** (p.yearsToRetirement + p.yearsRetired - 1)
          : p.withdrawal,
    },
  };
}
