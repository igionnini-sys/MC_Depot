import type { WithdrawalResult } from '../../engine/taxEngine';
import { computeIncrementalGermanIncomeTax, grossUpGermanIncomeTax } from '../common/progressive';
import deParams from '../params/de.json';
import type { ContributionSplitMode, FilingStatus, KirchensteuerRate } from '../types';
import { computeAvdSubsidyAndGuenstigerpruefung, type AvdSubsidyResult } from './guenstigerpruefung';

const EMPTY_WITHDRAWAL: WithdrawalResult = {
  grossWithdrawal: 0,
  netWithdrawal: 0,
  capitalGains: 0,
  taxesOwed: 0,
  costBasisSold: 0,
};

export interface ContributionSplitResult {
  avdOwnContribution: number;
  brokerageContribution: number;
}

/**
 * Splits total annual savings between the Altersvorsorgedepot (AVD) and the ordinary brokerage account.
 * - Before 2027 (`effectiveYear`), 100% goes to the ordinary brokerage account.
 * - In `auto` mode, prioritizes AVD up to the statutory cap (6,840 € * limitFactor), excess to brokerage.
 * - In `manual` mode, allocates `manualAvdContribution` (clamped to cap and total savings) to AVD, rest to brokerage.
 */
export function splitAnnualContribution(
  totalContribution: number,
  calendarYear: number,
  mode: ContributionSplitMode = 'auto',
  manualAvdContribution = 1800,
  limitFactor = 1,
): ContributionSplitResult {
  const total = Math.max(0, totalContribution);
  const effectiveYear = deParams.altersvorsorgedepot.effectiveYear.value;
  if (total <= 0 || calendarYear < effectiveYear) {
    return { avdOwnContribution: 0, brokerageContribution: total };
  }

  const maxCap = deParams.altersvorsorgedepot.maxAnnualContribution.value * limitFactor;
  const desiredAvd = mode === 'manual' ? Math.max(0, manualAvdContribution) : total;
  const avdOwnContribution = Math.min(total, desiredAvd, maxCap);
  const brokerageContribution = Math.max(0, total - avdOwnContribution);

  return { avdOwnContribution, brokerageContribution };
}

export interface AvdContainerOptions {
  filingStatus?: FilingStatus;
  kirchensteuer?: KirchensteuerRate;
}

/**
 * Stateful German Altersvorsorgedepot (2027 reform) container.
 * - Accumulation: exempt from Abgeltungsteuer and Vorabpauschale; receives own contributions + Zulagen.
 * - Decumulation (age >= 65): 100% of gross payouts are subject to progressive income tax (nachgelagerte Besteuerung).
 *   Supports an optional one-off lump sum up to 30% (`withdrawLumpSum`) and annual net-targeted payouts (`withdrawNet`).
 */
export class AltersvorsorgedepotContainer {
  readonly filingStatus: FilingStatus;
  readonly kirchensteuer: KirchensteuerRate;

  private value = 0;
  private ownContrib = 0;
  private zulagen = 0;
  private extraRefunds = 0;
  private taxableWithdrawnThisYear = 0;

  totalWithdrawals = 0;
  totalTaxesPaid = 0;
  totalCapitalGainsRealized = 0;

  constructor(opts: AvdContainerOptions = {}) {
    this.filingStatus = opts.filingStatus ?? 'single';
    this.kirchensteuer = opts.kirchensteuer ?? 'none';
  }

  get portfolioValue(): number {
    return this.value;
  }
  /** Own contributions paid by the investor (excluding state Zulagen). */
  get totalContributions(): number {
    return this.ownContrib;
  }
  get totalZulagen(): number {
    return this.zulagen;
  }
  get totalExtraTaxRefunds(): number {
    return this.extraRefunds;
  }
  get minPayoutAge(): number {
    return deParams.altersvorsorgedepot.minPayoutAge.value;
  }
  get maxLumpSumShare(): number {
    return deParams.altersvorsorgedepot.maxLumpSumShare.value;
  }

  startNewTaxYear(): void {
    this.taxableWithdrawnThisYear = 0;
  }

  /** Tax-free compounding during both accumulation and retirement (no Vorabpauschale). */
  applyReturn(annualReturn: number): number {
    this.value = Math.max(0, this.value * (1 + annualReturn));
    return this.value;
  }

  /**
   * Adds an annual contribution, computes and credits the state Zulage into the AVD contract,
   * and evaluates the Günstigerprüfung.
   */
  addContribution(
    requestedOwnContribution: number,
    childrenCount = 0,
    marginalTaxRatePercent = 0,
    limitFactor = 1,
  ): AvdSubsidyResult {
    const res = computeAvdSubsidyAndGuenstigerpruefung(
      requestedOwnContribution,
      childrenCount,
      marginalTaxRatePercent,
      limitFactor,
    );
    if (res.eligibleOwnContribution > 0) {
      this.ownContrib += res.eligibleOwnContribution;
      this.zulagen += res.totalZulage;
      this.extraRefunds += res.extraTaxRefund;
      this.value += res.eligibleOwnContribution + res.totalZulage;
    }
    return res;
  }

  /** Zero-allocation hot-loop contribution handler; returns excess contribution above the statutory cap. */
  addContributionFast(
    requestedOwnContribution: number,
    childrenCount: number,
    marginalTaxRatePercent: number,
    limitFactor: number,
  ): number {
    if (requestedOwnContribution <= 0) return 0;
    const avd = deParams.altersvorsorgedepot;
    const maxCap = avd.maxAnnualContribution.value * limitFactor;
    const eligible = requestedOwnContribution < maxCap ? requestedOwnContribution : maxCap;
    const excess = requestedOwnContribution - eligible;

    const t1Limit = avd.zulage.tier1Limit * limitFactor;
    const t2Limit = avd.zulage.tier2Limit * limitFactor;
    const slice1 = eligible < t1Limit ? eligible : t1Limit;
    const slice2 = eligible > t1Limit ? (eligible < t2Limit ? eligible : t2Limit) - t1Limit : 0;
    const baseZulage = slice1 * avd.zulage.tier1Rate + slice2 * avd.zulage.tier2Rate;
    const childZulage = childrenCount > 0 ? (childrenCount | 0) * avd.zulage.childAllowance * limitFactor : 0;
    const totalZulage = baseZulage + childZulage;

    const rawDedBase = eligible + totalZulage;
    const dedBase = rawDedBase < maxCap ? rawDedBase : maxCap;
    const dedBenefit = dedBase * (marginalTaxRatePercent * 0.01);
    const extraRefund = dedBenefit > totalZulage ? dedBenefit - totalZulage : 0;

    this.ownContrib += eligible;
    this.zulagen += totalZulage;
    this.extraRefunds += extraRefund;
    this.value += eligible + totalZulage;
    return excess;
  }

  /**
   * Withdraws a specific GROSS amount from the AVD (100% subject to progressive income tax
   * stacked on top of `otherTaxableIncome` + any prior AVD withdrawal in the same calendar year).
   */
  withdrawGross(
    requestedGross: number,
    otherTaxableIncome = 0,
    limitFactor = 1,
  ): WithdrawalResult {
    if (requestedGross <= 0 || this.value <= 0) return EMPTY_WITHDRAWAL;
    const gross = Math.min(requestedGross, this.value);
    const ratio = gross / this.value;
    const basisSold = this.ownContrib * ratio;
    const gainPortion = Math.max(0, gross - basisSold);

    const baseIncome = Math.max(0, otherTaxableIncome) + this.taxableWithdrawnThisYear;
    const taxesOwed = computeIncrementalGermanIncomeTax(
      baseIncome,
      gross,
      this.filingStatus,
      this.kirchensteuer,
      limitFactor,
    );

    this.value = Math.max(0, this.value - gross);
    this.ownContrib = Math.max(0, this.ownContrib - basisSold);
    this.taxableWithdrawnThisYear += gross;

    this.totalWithdrawals += gross;
    this.totalTaxesPaid += taxesOwed;
    this.totalCapitalGainsRealized += gainPortion;

    return {
      grossWithdrawal: gross,
      netWithdrawal: Math.max(0, gross - taxesOwed),
      capitalGains: gainPortion,
      taxesOwed,
      costBasisSold: basisSold,
    };
  }

  /**
   * Withdraws a one-off capital lump sum at retirement start, clamped to `maxLumpSumShare` (30%) of AVD value.
   */
  withdrawLumpSum(
    requestedShare: number,
    otherTaxableIncome = 0,
    limitFactor = 1,
  ): WithdrawalResult {
    if (requestedShare <= 0 || this.value <= 0) return EMPTY_WITHDRAWAL;
    const share = Math.min(Math.max(0, requestedShare), this.maxLumpSumShare);
    const gross = this.value * share;
    return this.withdrawGross(gross, otherTaxableIncome, limitFactor);
  }

  /**
   * Withdraws enough gross amount from the AVD to deliver `targetNet` after progressive income tax.
   * Uses the exact O(1) closed-form inverse `grossUpGermanIncomeTax` (zero iterations, zero allocations).
   */
  withdrawNet(
    targetNet: number,
    otherTaxableIncome = 0,
    limitFactor = 1,
  ): WithdrawalResult {
    if (targetNet <= 0 || this.value <= 0) return EMPTY_WITHDRAWAL;
    const baseIncome = (otherTaxableIncome > 0 ? otherTaxableIncome : 0) + this.taxableWithdrawnThisYear;
    const gross = grossUpGermanIncomeTax(
      targetNet,
      this.value,
      baseIncome,
      this.filingStatus,
      this.kirchensteuer,
      limitFactor,
    );
    return this.withdrawGross(gross, otherTaxableIncome, limitFactor);
  }
}
