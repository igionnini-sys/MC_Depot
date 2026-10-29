import deParams from '../params/de.json';
import type { FilingStatus, KirchensteuerRate } from '../types';

export interface TaxBracket {
  /** Upper bound of the bracket in € (use Infinity or null for the top open bracket). */
  upTo: number | null;
  /** Marginal tax rate in this bracket as decimal (e.g. 0.42 = 42%). */
  rate: number;
}

/** Evaluates a standard piece-wise flat-rate bracket table, optionally scaling thresholds by `limitFactor`. */
export function computeBracketTax(income: number, brackets: readonly TaxBracket[], limitFactor = 1): number {
  if (income <= 0) return 0;
  let tax = 0;
  let prev = 0;
  for (let i = 0; i < brackets.length; i++) {
    const b = brackets[i];
    const upper = b.upTo === null ? Infinity : b.upTo * limitFactor;
    if (income > prev) {
      const slice = Math.min(income, upper) - prev;
      if (slice > 0) tax += slice * b.rate;
    }
    prev = upper;
    if (income <= upper) break;
  }
  return tax;
}

/**
 * Evaluates the German progressive income tax schedule (§ 32a EStG) for a single taxpayer,
 * scaling zone thresholds by `limitFactor` (1 when nominal thresholds are fixed).
 */
function singleGermanTariff(zvE: number, limitFactor = 1): number {
  if (zvE <= 0) return 0;
  const z = deParams.incomeTaxTariff.zones;
  const u1 = z.grundfreibetrag * limitFactor;
  if (zvE <= u1) return 0;

  const u2 = z.zone2Upper * limitFactor;
  const u3 = z.zone3Upper * limitFactor;
  const u4 = z.zone4Upper * limitFactor;

  // Zone 2: linear progression from zone2StartRate (14%) to zone2EndRate (23.97%)
  const width2 = u2 - u1;
  const x2 = Math.min(zvE, u2) - u1;
  const avgRate2 = z.zone2StartRate + 0.5 * ((z.zone2EndRate - z.zone2StartRate) * (x2 / width2));
  let tax = x2 * avgRate2;
  if (zvE <= u2) return tax;

  // Zone 3: linear progression from zone3StartRate (23.97%) to zone3EndRate (42%)
  const width3 = u3 - u2;
  const x3 = Math.min(zvE, u3) - u2;
  const avgRate3 = z.zone3StartRate + 0.5 * ((z.zone3EndRate - z.zone3StartRate) * (x3 / width3));
  tax += x3 * avgRate3;
  if (zvE <= u3) return tax;

  // Zone 4: flat 42%
  const x4 = Math.min(zvE, u4) - u3;
  tax += x4 * z.zone4Rate;
  if (zvE <= u4) return tax;

  // Zone 5: flat 45% (Reichensteuer)
  const x5 = zvE - u4;
  tax += x5 * z.zone5Rate;
  return tax;
}

/**
 * Computes total German progressive income tax (ESt + optional Kirchensteuer),
 * applying Ehegattensplitting (2 * tariff(income / 2)) when `filingStatus === 'couple'`.
 */
export function computeGermanIncomeTax(
  taxableIncome: number,
  filingStatus: FilingStatus = 'single',
  kirchensteuer: KirchensteuerRate = 'none',
  limitFactor = 1,
): number {
  if (taxableIncome <= 0) return 0;
  const est =
    filingStatus === 'couple'
      ? 2 * singleGermanTariff(0.5 * taxableIncome, limitFactor)
      : singleGermanTariff(taxableIncome, limitFactor);

  const kMap = deParams.brokerage.kirchensteuerRates;
  const k = kirchensteuer === '8' ? kMap['8'] : kirchensteuer === '9' ? kMap['9'] : kMap.none;
  return est * (1 + k);
}

/**
 * Computes the incremental German progressive income tax caused by `additionalIncome`
 * stacked on top of `baseIncome` (e.g. `otherRetirementIncome`).
 */
export function computeIncrementalGermanIncomeTax(
  baseIncome: number,
  additionalIncome: number,
  filingStatus: FilingStatus = 'single',
  kirchensteuer: KirchensteuerRate = 'none',
  limitFactor = 1,
): number {
  if (additionalIncome <= 0) return 0;
  const base = Math.max(0, baseIncome);
  const taxWith = computeGermanIncomeTax(base + additionalIncome, filingStatus, kirchensteuer, limitFactor);
  const taxWithout = base > 0 ? computeGermanIncomeTax(base, filingStatus, kirchensteuer, limitFactor) : 0;
  return Math.max(0, taxWith - taxWithout);
}

const Z = deParams.incomeTaxTariff.zones;
const W2_BASE = Z.zone2Upper - Z.grundfreibetrag;
const A2_BASE = (0.5 * (Z.zone2EndRate - Z.zone2StartRate)) / W2_BASE;
const T2_BASE = W2_BASE * 0.5 * (Z.zone2StartRate + Z.zone2EndRate);

const W3_BASE = Z.zone3Upper - Z.zone2Upper;
const A3_BASE = (0.5 * (Z.zone3EndRate - Z.zone3StartRate)) / W3_BASE;
const T3_BASE = T2_BASE + W3_BASE * 0.5 * (Z.zone3StartRate + Z.zone3EndRate);

const W4_BASE = Z.zone4Upper - Z.zone3Upper;
const T4_BASE = T3_BASE + W4_BASE * Z.zone4Rate;

/**
 * Closed-form O(1) gross-up for the German § 32a EStG progressive tariff:
 * Given `targetNet`, `maxGross`, and `baseIncome`, finds `gross <= maxGross`
 * such that `gross - (T(baseIncome + gross) - T(baseIncome)) = targetNet`.
 */
export function grossUpGermanIncomeTax(
  targetNet: number,
  maxGross: number,
  baseIncome: number,
  filingStatus: FilingStatus = 'single',
  kirchensteuer: KirchensteuerRate = 'none',
  limitFactor = 1,
): number {
  if (targetNet <= 0 || maxGross <= 0) return 0;
  const base = baseIncome > 0 ? baseIncome : 0;
  const baseTax = base > 0 ? computeGermanIncomeTax(base, filingStatus, kirchensteuer, limitFactor) : 0;

  const split = filingStatus === 'couple' ? 2 : 1;
  const kMap = deParams.brokerage.kirchensteuerRates;
  const k = kirchensteuer === '8' ? kMap['8'] : kirchensteuer === '9' ? kMap['9'] : kMap.none;
  const mk = 1 + k;

  // Target per-spouse net income after tax
  const yNetTarget = (base - baseTax + targetNet) / split;

  const u1 = Z.grundfreibetrag * limitFactor;
  let yGross: number;

  if (yNetTarget <= u1) {
    yGross = yNetTarget;
  } else {
    const u2 = Z.zone2Upper * limitFactor;
    const net2 = u2 - mk * T2_BASE * limitFactor;
    if (yNetTarget <= net2) {
      const b = 1 - mk * Z.zone2StartRate;
      const a = (mk * A2_BASE) / limitFactor;
      const c = yNetTarget - u1;
      yGross = u1 + (2 * c) / (b + Math.sqrt(Math.max(0, b * b - 4 * a * c)));
    } else {
      const u3 = Z.zone3Upper * limitFactor;
      const net3 = u3 - mk * T3_BASE * limitFactor;
      if (yNetTarget <= net3) {
        const b = 1 - mk * Z.zone3StartRate;
        const a = (mk * A3_BASE) / limitFactor;
        const c = yNetTarget - net2;
        yGross = u2 + (2 * c) / (b + Math.sqrt(Math.max(0, b * b - 4 * a * c)));
      } else {
        const u4 = Z.zone4Upper * limitFactor;
        const net4 = u4 - mk * T4_BASE * limitFactor;
        if (yNetTarget <= net4) {
          yGross = u3 + (yNetTarget - net3) / (1 - mk * Z.zone4Rate);
        } else {
          yGross = u4 + (yNetTarget - net4) / (1 - mk * Z.zone5Rate);
        }
      }
    }
  }

  const totalGross = yGross * split - base;
  return totalGross <= targetNet ? Math.min(targetNet, maxGross) : totalGross >= maxGross ? maxGross : totalGross;
}
