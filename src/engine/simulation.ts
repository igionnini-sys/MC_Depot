/**
 * Monte Carlo engine: port of simulation_engine.py (independent assets) and
 * correlation_engine.py (correlated assets).
 * All internal portfolio values, returns, contributions and withdrawals are computed
 * in nominal euros; deflation to today's purchasing power happens at the boundaries.
 */
import { createNormal, createRng, isPositiveSemiDefinite, nearestCorrelationMatrix, psdFactor } from './random';
import { fitCensoredNormal } from './returns';
import { CORRELATION_ASSETS, DEFAULT_CORRELATION_MATRIX } from '../config';
import { mean, max, min, percentile, std } from './stats';
import { computePortfolioTaxProfile, type PortfolioTaxProfile } from '../tax/de';
import { computeNlPortfolioCashShare } from '../tax/nl';
import { createTaxSession } from '../tax/registry';
import type { Asset, SimulationParams, SimulationRequest, SimulationResults, SummaryStats, TaxAnalysis, TaxDetails } from './types';

/**
 * Multiplier for fixed statutory tax limits (allowances, caps, brackets) at `yearFromStart` (0 = first year).
 * Returns 1 when `indexTaxLimitsToInflation` is false/omitted; otherwise compounds by `taxLimitsInflationRate ?? inflation`.
 */
export function taxLimitFactor(
  p: Pick<SimulationParams, 'inflation' | 'indexTaxLimitsToInflation' | 'taxLimitsInflationRate'>,
  yearFromStart: number,
): number {
  if (!p.indexTaxLimitsToInflation || yearFromStart <= 0) return 1;
  const rate = (p.taxLimitsInflationRate ?? p.inflation) / 100;
  return (1 + rate) ** yearFromStart;
}

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
  const fitted = assets.map((a) => fitCensoredNormal(a.return / 100, a.volatility / 100, a.min_return / 100, a.max_return / 100));
  return {
    mean: fitted.map((a) => a.mean),
    vol: fitted.map((a) => a.sd),
    alloc: assets.map((a) => a.allocation / 100),
    minR: assets.map((a) => a.min_return / 100),
    maxR: assets.map((a) => a.max_return / 100),
    ter: assets.map((a) => a.ter / 100),
    factor: corr ? psdFactor(corr) : null,
  };
}

export function defaultCorrelationMatrix(names: string[]): number[][] {
  return names.map((a, i) =>
    names.map((b, j) => {
      if (i === j) return 1;
      const ai = CORRELATION_ASSETS.indexOf(a), bi = CORRELATION_ASSETS.indexOf(b);
      return ai >= 0 && bi >= 0 ? DEFAULT_CORRELATION_MATRIX[ai][bi] : 0;
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
  const accTaxProfile = computePortfolioTaxProfile(accumulationAssets);
  const retTaxProfile = computePortfolioTaxProfile(retirementAssets);
  const accCashShare = computeNlPortfolioCashShare(accumulationAssets);
  const retCashShare = computeNlPortfolioCashShare(retirementAssets);

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
  const hasContainers = !!p.taxCountry && p.taxCountry !== 'simplified';
  const brokFinals = hasContainers ? new Float64Array(n) : null;
  const pensFinals = hasContainers ? new Float64Array(n) : null;
  let sumBrokTax = 0;
  let sumPensTax = 0;
  let sumSubsidies = 0;
  let sumExtraRefunds = 0;

  const step = Math.max(1, Math.floor(n / 100));
  for (let s = 0; s < n; s++) {
    if (onProgress && s % step === 0) onProgress(s, n);
    const r = simulateOne(p, acc, ret, normal, accTaxProfile, retTaxProfile, accCashShare, retCashShare);
    out.accumulation[s] = r.accumulationReal;
    out.accumulationNominal[s] = r.accumulationNominal;
    out.final[s] = r.final;
    out.realWithdrawal[s] = r.avgNetWithdrawal;
    taxesPaid[s] = r.tax.totalTaxesPaid;
    effectiveRates[s] = r.tax.totalWithdrawals > 0 ? (r.tax.totalTaxesPaid / r.tax.totalWithdrawals) * 100 : 0;
    finalWithdrawals[s] = r.tax.finalWithdrawal;
    if (hasContainers && brokFinals && pensFinals) {
      brokFinals[s] = r.tax.brokerageFinalValue ?? 0;
      pensFinals[s] = r.tax.pensionFinalValue ?? 0;
      sumBrokTax += r.tax.brokerageTaxesPaid ?? 0;
      sumPensTax += r.tax.pensionTaxesPaid ?? 0;
      sumSubsidies += r.tax.stateSubsidiesReceived ?? 0;
      sumExtraRefunds += r.tax.extraTaxRefundsReceived ?? 0;
    }
  }
  onProgress?.(n, n);

  const taxAnalysis: TaxAnalysis = {
    totalTaxes: summary(taxesPaid),
    effectiveTaxRate: summary(effectiveRates),
    avgFinalWithdrawal: mean(finalWithdrawals),
    containers:
      hasContainers && brokFinals && pensFinals && n > 0
        ? {
            brokerageFinalMean: mean(brokFinals),
            brokerageFinalMedian: percentile(brokFinals, 50),
            pensionFinalMean: mean(pensFinals),
            pensionFinalMedian: percentile(pensFinals, 50),
            brokerageTaxesMean: sumBrokTax / n,
            pensionTaxesMean: sumPensTax / n,
            stateSubsidiesMean: sumSubsidies / n,
            extraTaxRefundsMean: sumExtraRefunds / n,
          }
        : undefined,
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
  accTaxProfile: PortfolioTaxProfile,
  retTaxProfile: PortfolioTaxProfile,
  accCashShare = 0,
  retCashShare = 0,
): SingleResult {
  const inflation = p.inflation / 100;
  const yearsAcc = Math.trunc(p.yearsToRetirement);
  const yearsRet = Math.trunc(p.yearsRetired);
  const tax = createTaxSession(p, accTaxProfile, retTaxProfile, accCashShare, retCashShare);
  const zA = new Array<number>(acc.mean.length), cA = new Array<number>(acc.mean.length);
  const zR = new Array<number>(ret.mean.length), cR = new Array<number>(ret.mean.length);

  if (p.initialAmount > 0) tax.addInitialAmount(p.initialAmount);
  let contribution = p.annualContribution;

  // Accumulation: returns → annual taxes → end-of-year contribution.
  for (let y = 0; y < yearsAcc; y++) {
    tax.onAccumulationYear(yearReturn(acc, normal, zA, cA), contribution, y);
    if (p.adjustContributionInflation) contribution *= 1 + inflation;
  }

  const accumulationNominal = tax.portfolioValue;
  const accumulationReal = accumulationNominal / (1 + inflation) ** p.yearsToRetirement;

  let totalNet = 0;
  let withdrawals = 0;
  let taxSum = 0;
  for (let y = 0; y < yearsRet; y++) {
    const nominal = yearReturn(ret, normal, zR, cR);
    const value = tax.applyRetirementReturn(nominal, y);
    if (value <= 0) break;

    const deflator = (1 + inflation) ** (p.yearsToRetirement + y);
    const amount = p.useRealWithdrawal ? p.withdrawal * deflator : p.withdrawal;
    const w = tax.withdraw(amount, y);
    totalNet += p.useRealWithdrawal ? w.netWithdrawal / deflator : w.netWithdrawal;
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
      brokerageFinalValue: tax.brokerageFinalValue,
      pensionFinalValue: tax.pensionFinalValue,
      brokerageTaxesPaid: tax.brokerageTaxesPaid,
      pensionTaxesPaid: tax.pensionTaxesPaid,
      stateSubsidiesReceived: tax.stateSubsidiesReceived,
      extraTaxRefundsReceived: tax.extraTaxRefundsReceived,
    },
  };
}
