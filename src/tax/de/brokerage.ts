import type { WithdrawalResult } from '../../engine/taxEngine';
import type { Asset } from '../../engine/types';
import { grossUpBisection, grossUpPiecewiseLinear } from '../grossUp';
import deParams from '../params/de.json';
import type { FilingStatus, KirchensteuerRate } from '../types';

export interface PortfolioTaxProfile {
  /** Weighted Teilfreistellung across the entire portfolio in [0, 1]. */
  weightedTeilfreistellung: number;
  /** Share of the portfolio invested in investment funds subject to Vorabpauschale in [0, 1]. */
  fundShare: number;
  /** Weighted Teilfreistellung specifically across the fund share in [0, 1]. */
  fundTeilfreistellung: number;
}

export interface AssetTaxRule {
  rate: number;
  isFund: boolean;
}

export interface VorabpauschaleResult {
  basisertrag: number;
  actualGain: number;
  grossVorabpauschale: number;
  afterTeilfreistellung: number;
  allowanceUsed: number;
  taxableVorabpauschale: number;
  taxOwed: number;
}

const EMPTY_WITHDRAWAL: WithdrawalResult = {
  grossWithdrawal: 0,
  netWithdrawal: 0,
  capitalGains: 0,
  taxesOwed: 0,
  costBasisSold: 0,
};

/**
 * Combined German Abgeltungsteuer + Solidaritätszuschlag + optional Kirchensteuer (§ 32d Abs. 1 EStG).
 * Without church tax: 25% * 1.055 = 26.375%.
 * With church tax k: e = 0.25 / (1 + 0.25 * k), total = e * (1 + 0.055 + k).
 */
export function abgeltungsteuerCombinedRate(kirchensteuer: KirchensteuerRate = 'none'): number {
  const s = deParams.brokerage.abgeltungsteuerRate.value;
  const soli = deParams.brokerage.solidaritaetszuschlagRate.value;
  const kMap = deParams.brokerage.kirchensteuerRates;
  const k = kirchensteuer === '8' ? kMap['8'] : kirchensteuer === '9' ? kMap['9'] : kMap.none;
  const e = s / (1 + s * k);
  return e * (1 + soli + k);
}

/** Annual Sparer-Pauschbetrag (€) for single or couple, optionally scaled by `limitFactor`. */
export function sparerPauschbetragForYear(filingStatus: FilingStatus = 'single', limitFactor = 1): number {
  const base =
    filingStatus === 'couple'
      ? deParams.brokerage.sparerPauschbetrag.couple
      : deParams.brokerage.sparerPauschbetrag.single;
  return base * limitFactor;
}

const BASE_YEAR = 2000;
const MAX_YEAR = 2200;
const DEFAULT_BASISZINS = deParams.brokerage.basiszinsByYear.default.value;
const BASISZINS_TABLE: Float64Array = (() => {
  const arr = new Float64Array(MAX_YEAR - BASE_YEAR + 1);
  arr.fill(DEFAULT_BASISZINS);
  const years = deParams.brokerage.basiszinsByYear.years as Record<string, { value: number } | undefined>;
  for (const [k, v] of Object.entries(years)) {
    const y = Number(k);
    if (v && y >= BASE_YEAR && y <= MAX_YEAR) {
      arr[y - BASE_YEAR] = v.value;
    }
  }
  return arr;
})();

/** Looks up the statutory BMF Basiszins (as decimal, e.g. 0.0253) for `calendarYear` without allocations. */
export function basiszinsForYear(calendarYear: number, overrideBasiszins?: number): number {
  if (overrideBasiszins !== undefined) return overrideBasiszins;
  const idx = (calendarYear | 0) - BASE_YEAR;
  return idx >= 0 && idx < BASISZINS_TABLE.length ? BASISZINS_TABLE[idx] : DEFAULT_BASISZINS;
}

/** Computes weighted Teilfreistellung and InvStG fund share from an asset allocation. */
export function computePortfolioTaxProfile(
  assets: Asset[],
  overrides?: Record<string, Partial<AssetTaxRule>>,
): PortfolioTaxProfile {
  const defaults = deParams.brokerage.teilfreistellungByAsset as Record<
    string,
    { rate: number; isFund: boolean } | undefined
  >;
  let totalWeight = 0;
  let weightedTF = 0;
  let fundShare = 0;
  let fundWeightedTF = 0;

  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    const w = a.allocation / 100;
    if (w <= 0) continue;
    const def = defaults[a.name];
    const ov = overrides?.[a.name];
    const rate = ov?.rate ?? def?.rate ?? 0;
    const isFund = ov?.isFund ?? def?.isFund ?? true;

    totalWeight += w;
    weightedTF += w * rate;
    if (isFund) {
      fundShare += w;
      fundWeightedTF += w * rate;
    }
  }

  if (totalWeight <= 0) {
    return { weightedTeilfreistellung: 0, fundShare: 0, fundTeilfreistellung: 0 };
  }

  return {
    weightedTeilfreistellung: weightedTF / totalWeight,
    fundShare: fundShare / totalWeight,
    fundTeilfreistellung: fundShare > 0 ? fundWeightedTF / fundShare : 0,
  };
}

/**
 * Pure calculation of the annual InvStG Vorabpauschale and resulting tax at year-end.
 * Order of operations (§ 18, § 20 InvStG):
 *   1. Basisertrag = startOfYearFundValue * Basiszins * 0.7
 *   2. grossVorabpauschale = max(0, min(Basisertrag, actualFundGain))
 *   3. Apply Teilfreistellung first: afterTF = grossVorabpauschale * (1 - fundTeilfreistellung)
 *   4. Subtract remaining Sparer-Pauschbetrag
 *   5. Multiply remaining taxable amount by combined Abgeltungsteuer rate
 */
export function computeVorabpauschale(
  startOfYearValue: number,
  endOfYearValueBeforeContribution: number,
  basiszins: number,
  fundShare: number,
  fundTeilfreistellung: number,
  allowanceRemaining: number,
  combinedTaxRate: number,
): VorabpauschaleResult {
  const factor = deParams.brokerage.basisertragFactor.value;
  const fShare = Math.max(0, Math.min(1, fundShare));
  const startFund = Math.max(0, startOfYearValue) * fShare;
  const actualGain = (endOfYearValueBeforeContribution - startOfYearValue) * fShare;

  if (startFund <= 0 || basiszins <= 0 || actualGain <= 0) {
    return {
      basisertrag: 0,
      actualGain,
      grossVorabpauschale: 0,
      afterTeilfreistellung: 0,
      allowanceUsed: 0,
      taxableVorabpauschale: 0,
      taxOwed: 0,
    };
  }

  const basisertrag = startFund * basiszins * factor;
  const grossVorabpauschale = Math.max(0, Math.min(basisertrag, actualGain));
  const afterTeilfreistellung = grossVorabpauschale * (1 - Math.max(0, Math.min(1, fundTeilfreistellung)));
  const allowanceUsed = Math.min(Math.max(0, allowanceRemaining), afterTeilfreistellung);
  const taxableVorabpauschale = afterTeilfreistellung - allowanceUsed;
  const taxOwed = taxableVorabpauschale * Math.max(0, combinedTaxRate);

  return {
    basisertrag,
    actualGain,
    grossVorabpauschale,
    afterTeilfreistellung,
    allowanceUsed,
    taxableVorabpauschale,
    taxOwed,
  };
}

export interface GermanBrokerageOptions {
  kirchensteuer?: KirchensteuerRate;
  filingStatus?: FilingStatus;
  useFifo?: boolean;
  capacity?: number;
}

/**
 * Stateful German ordinary brokerage container (Depot).
 * Uses flat scalar state by default (proportional method with full loss compensation within the depot),
 * or pre-allocated TypedArrays when `useFifo` is enabled.
 */
export class GermanBrokerageContainer {
  readonly combinedTaxRate: number;
  readonly filingStatus: FilingStatus;
  readonly useFifo: boolean;

  private value = 0;
  private basis = 0;
  private vorab = 0;
  private allowanceRem = 0;

  // Optional FIFO lot buffers (only allocated when useFifo === true)
  private lotVal: Float64Array | null = null;
  private lotBas: Float64Array | null = null;
  private lotVor: Float64Array | null = null;
  private lotCount = 0;
  private lotHead = 0;

  totalContributions = 0;
  totalWithdrawals = 0;
  totalTaxesPaid = 0;
  totalCapitalGainsRealized = 0;

  constructor(opts: GermanBrokerageOptions = {}) {
    this.combinedTaxRate = abgeltungsteuerCombinedRate(opts.kirchensteuer ?? 'none');
    this.filingStatus = opts.filingStatus ?? 'single';
    this.useFifo = !!opts.useFifo;
    this.allowanceRem = sparerPauschbetragForYear(this.filingStatus, 1);

    if (this.useFifo) {
      const cap = opts.capacity ?? 64;
      this.lotVal = new Float64Array(cap);
      this.lotBas = new Float64Array(cap);
      this.lotVor = new Float64Array(cap);
    }
  }

  get portfolioValue(): number {
    return this.value;
  }
  get costBasis(): number {
    return this.basis;
  }
  get accumulatedVorabpauschale(): number {
    return this.vorab;
  }
  get allowanceRemaining(): number {
    return this.allowanceRem;
  }

  /** Resets the annual Sparer-Pauschbetrag at the start of a new tax year. */
  startNewTaxYear(limitFactor = 1): void {
    this.allowanceRem = sparerPauschbetragForYear(this.filingStatus, limitFactor);
  }

  /** Consumes up to `amount` from the remaining annual Sparer-Pauschbetrag and returns the amount used. */
  consumeAllowance(amount: number): number {
    if (amount <= 0 || this.allowanceRem <= 0) return 0;
    const used = Math.min(this.allowanceRem, amount);
    this.allowanceRem -= used;
    return used;
  }

  addContribution(amount: number): void {
    if (amount <= 0) return;
    this.value += amount;
    this.basis += amount;
    this.totalContributions += amount;

    if (this.useFifo && this.lotVal && this.lotBas && this.lotVor) {
      if (this.lotCount === this.lotVal.length) {
        const grow = (a: Float64Array) => {
          const b = new Float64Array(a.length * 2);
          b.set(a);
          return b;
        };
        this.lotVal = grow(this.lotVal);
        this.lotBas = grow(this.lotBas);
        this.lotVor = grow(this.lotVor);
      }
      this.lotVal[this.lotCount] = amount;
      this.lotBas[this.lotCount] = amount;
      this.lotVor[this.lotCount] = 0;
      this.lotCount++;
    }
  }

  /**
   * Applies annual portfolio return and settles the year-end Vorabpauschale tax.
   * Must be called BEFORE adding the end-of-year contribution so new contributions
   * do not pay Vorabpauschale in the year they are made.
   */
  applyReturnAndVorabpauschale(
    annualReturn: number,
    basiszins: number,
    profile: PortfolioTaxProfile,
  ): VorabpauschaleResult {
    const startValue = this.value;
    const factor = 1 + annualReturn;
    this.value = Math.max(0, this.value * factor);

    if (this.useFifo && this.lotVal) {
      for (let i = this.lotHead; i < this.lotCount; i++) {
        if (this.lotVal[i] > 0) this.lotVal[i] *= factor;
      }
    }

    const res = computeVorabpauschale(
      startValue,
      this.value,
      basiszins,
      profile.fundShare,
      profile.fundTeilfreistellung,
      this.allowanceRem,
      this.combinedTaxRate,
    );

    this.allowanceRem -= res.allowanceUsed;
    this.vorab += res.grossVorabpauschale;

    if (res.taxOwed > 0 && this.value > 0) {
      const taxPaid = Math.min(this.value, res.taxOwed);
      const scale = (this.value - taxPaid) / this.value;
      this.value -= taxPaid;
      this.totalTaxesPaid += taxPaid;

      if (this.useFifo && this.lotVal) {
        for (let i = this.lotHead; i < this.lotCount; i++) {
          this.lotVal[i] *= scale;
        }
      }
    }

    if (this.useFifo && res.grossVorabpauschale > 0 && this.lotVal && this.lotVor && this.value > 0) {
      for (let i = this.lotHead; i < this.lotCount; i++) {
        const w = this.lotVal[i] / this.value;
        this.lotVor[i] += res.grossVorabpauschale * w;
      }
    }

    return res;
  }

  /** Zero-allocation hot-loop version of `applyReturnAndVorabpauschale` for proportional mode. */
  accrueYearFast(annualReturn: number, basiszins: number, profile: PortfolioTaxProfile): void {
    if (this.useFifo) {
      this.applyReturnAndVorabpauschale(annualReturn, basiszins, profile);
      return;
    }
    const startValue = this.value;
    if (startValue <= 0) return;
    const endValue = Math.max(0, startValue * (1 + annualReturn));
    this.value = endValue;

    const fShare = profile.fundShare;
    if (fShare <= 0 || basiszins <= 0 || endValue <= startValue) return;

    const startFund = startValue * fShare;
    const actualGain = (endValue - startValue) * fShare;
    const basisertrag = startFund * basiszins * 0.7;
    const grossVorab = basisertrag < actualGain ? basisertrag : actualGain;
    if (grossVorab <= 0) return;

    const afterTF = grossVorab * (1 - profile.fundTeilfreistellung);
    const allowUsed = this.allowanceRem > 0 ? (this.allowanceRem < afterTF ? this.allowanceRem : afterTF) : 0;
    this.allowanceRem -= allowUsed;
    this.vorab += grossVorab;

    const taxable = afterTF - allowUsed;
    if (taxable > 0) {
      const taxOwed = taxable * this.combinedTaxRate;
      const taxPaid = endValue < taxOwed ? endValue : taxOwed;
      this.value = endValue - taxPaid;
      this.totalTaxesPaid += taxPaid;
    }
  }

  /**
   * Withdraws a specific GROSS amount from the brokerage container.
   * Deducts accumulated gross Vorabpauschale from capital gains, applies Teilfreistellung,
   * uses any remaining Sparer-Pauschbetrag, and compensates losses within the depot.
   */
  withdrawGross(requestedGross: number, profile: PortfolioTaxProfile): WithdrawalResult {
    if (requestedGross <= 0 || this.value <= 0) return EMPTY_WITHDRAWAL;
    const gross = Math.min(requestedGross, this.value);

    let basisSold = 0;
    let vorabUsed = 0;

    if (this.useFifo && this.lotVal && this.lotBas && this.lotVor) {
      let remToSell = gross;
      for (let i = this.lotHead; i < this.lotCount && remToSell > 0; i++) {
        const lv = this.lotVal[i];
        if (lv <= 0) {
          if (i === this.lotHead) this.lotHead++;
          continue;
        }
        const take = Math.min(lv, remToSell);
        const ratio = take / lv;
        const b = this.lotBas[i] * ratio;
        const v = this.lotVor[i] * ratio;
        this.lotVal[i] -= take;
        this.lotBas[i] -= b;
        this.lotVor[i] -= v;
        basisSold += b;
        vorabUsed += v;
        remToSell -= take;
        if (this.lotVal[i] <= 1e-9 && i === this.lotHead) this.lotHead++;
      }
      this.value = Math.max(0, this.value - gross);
      this.basis = Math.max(0, this.basis - basisSold);
      this.vorab = Math.max(0, this.vorab - vorabUsed);
    } else {
      const ratio = Math.min(1, gross / this.value);
      basisSold = this.basis * ratio;
      vorabUsed = this.vorab * ratio;
      this.value = Math.max(0, this.value - gross);
      this.basis = Math.max(0, this.basis - basisSold);
      this.vorab = Math.max(0, this.vorab - vorabUsed);
    }

    // Economic gain minus already-taxed gross Vorabpauschale (with loss compensation across the depot)
    const rawGain = gross - basisSold - vorabUsed;
    const positiveGain = Math.max(0, rawGain);
    const afterTF = positiveGain * (1 - Math.max(0, Math.min(1, profile.weightedTeilfreistellung)));
    const allowUsed = this.consumeAllowance(afterTF);
    const taxableGain = afterTF - allowUsed;
    const taxesOwed = taxableGain * this.combinedTaxRate;

    this.totalWithdrawals += gross;
    this.totalTaxesPaid += taxesOwed;
    this.totalCapitalGainsRealized += positiveGain;

    return {
      grossWithdrawal: gross,
      netWithdrawal: Math.max(0, gross - taxesOwed),
      capitalGains: positiveGain,
      taxesOwed,
      costBasisSold: basisSold,
    };
  }

  /**
   * Withdraws enough gross amount to deliver `targetNet` after German capital gains taxes.
   * If the portfolio cannot cover `targetNet`, withdraws the entire remaining portfolio.
   */
  withdrawNet(targetNet: number, profile: PortfolioTaxProfile): WithdrawalResult {
    if (targetNet <= 0 || this.value <= 0) return EMPTY_WITHDRAWAL;

    if (!this.useFifo) {
      const netDepotGain = Math.max(0, this.value - this.basis - this.vorab);
      const gainRatio = this.value > 0 ? netDepotGain / this.value : 0;
      const effectiveGainRatio = gainRatio * (1 - Math.max(0, Math.min(1, profile.weightedTeilfreistellung)));
      const gross = grossUpPiecewiseLinear(
        targetNet,
        this.value,
        effectiveGainRatio,
        this.allowanceRem,
        this.combinedTaxRate,
      );
      return this.withdrawGross(gross, profile);
    }

    // FIFO mode: compute netFromGross without mutating state, then bisect
    const netFromGross = (g: number): number => {
      if (g <= 0 || !this.lotVal || !this.lotBas || !this.lotVor) return 0;
      const clamped = Math.min(g, this.value);
      let rem = clamped;
      let bSold = 0;
      let vUsed = 0;
      for (let i = this.lotHead; i < this.lotCount && rem > 0; i++) {
        const lv = this.lotVal[i];
        if (lv <= 0) continue;
        const take = Math.min(lv, rem);
        const r = take / lv;
        bSold += this.lotBas[i] * r;
        vUsed += this.lotVor[i] * r;
        rem -= take;
      }
      const rawGain = Math.max(0, clamped - bSold - vUsed);
      const afterTF = rawGain * (1 - Math.max(0, Math.min(1, profile.weightedTeilfreistellung)));
      const allow = Math.min(this.allowanceRem, afterTF);
      const tax = (afterTF - allow) * this.combinedTaxRate;
      return clamped - tax;
    };

    const gross = grossUpBisection(targetNet, this.value, netFromGross);
    return this.withdrawGross(gross, profile);
  }
}

