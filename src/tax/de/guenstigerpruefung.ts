import deParams from '../params/de.json';

export interface AvdSubsidyResult {
  /** Eligible own contribution capped at the statutory AVD limit (€). */
  eligibleOwnContribution: number;
  /** Excess contribution above the statutory AVD cap (€) to be routed to ordinary brokerage. */
  excessContribution: number;
  /** Base state allowance (Grundzulage: 50% up to 360 € + 25% from 360 € to 1,800 €). */
  baseZulage: number;
  /** Child allowance (Kinderzulage: 300 € per child when own contribution > 0). */
  childZulage: number;
  /** Total direct Zulage credited into the AVD contract (baseZulage + childZulage). */
  totalZulage: number;
  /** Tax base used for the Sonderausgabenabzug in the Günstigerprüfung (€). */
  deductionBase: number;
  /** Hypothetical tax reduction from Sonderausgabenabzug at the marginal tax rate (€). */
  deductionTaxBenefit: number;
  /** Additional income-tax refund beyond the Zulage: max(0, deductionTaxBenefit - totalZulage). */
  extraTaxRefund: number;
  /** Total state benefit: max(totalZulage, deductionTaxBenefit) = totalZulage + extraTaxRefund. */
  totalBenefit: number;
}

/**
 * Computes the German Altersvorsorgedepot 2027 state allowances (Zulage)
 * and the Günstigerprüfung (comparison with Sonderausgabenabzug at `marginalTaxRatePercent`).
 *
 * Acceptance examples (piano-fiscalita-multipaese.md §6):
 * - Own contribution 1,800 €, 0 children -> baseZulage = 50% * 360 + 25% * 1,440 = 540 €.
 * - Own contribution 360 €, 0 children -> baseZulage = 180 €.
 * - 2 children -> childZulage = +600 €.
 * - Günstigerprüfung (deductionBase = own + Zulage = 2,340 €):
 *   - marginal rate 30% -> benefit 702 € > 540 € -> extraTaxRefund = 162 €.
 *   - marginal rate 10% -> benefit 234 € < 540 € -> extraTaxRefund = 0 €.
 */
export function computeAvdSubsidyAndGuenstigerpruefung(
  requestedOwnContribution: number,
  childrenCount = 0,
  marginalTaxRatePercent = 0,
  limitFactor = 1,
  includeZulageInDeductionBase = deParams.altersvorsorgedepot.guenstigerpruefung.deductionBaseIncludesZulage,
): AvdSubsidyResult {
  const avd = deParams.altersvorsorgedepot;
  const maxCap = avd.maxAnnualContribution.value * limitFactor;
  const own = Math.max(0, requestedOwnContribution);
  const eligibleOwnContribution = Math.min(own, maxCap);
  const excessContribution = Math.max(0, own - eligibleOwnContribution);

  if (eligibleOwnContribution <= 0) {
    return {
      eligibleOwnContribution: 0,
      excessContribution,
      baseZulage: 0,
      childZulage: 0,
      totalZulage: 0,
      deductionBase: 0,
      deductionTaxBenefit: 0,
      extraTaxRefund: 0,
      totalBenefit: 0,
    };
  }

  const t1Limit = avd.zulage.tier1Limit * limitFactor;
  const t2Limit = avd.zulage.tier2Limit * limitFactor;

  const slice1 = Math.min(eligibleOwnContribution, t1Limit);
  const slice2 = Math.max(0, Math.min(eligibleOwnContribution, t2Limit) - t1Limit);

  const baseZulage = slice1 * avd.zulage.tier1Rate + slice2 * avd.zulage.tier2Rate;
  const kids = Math.max(0, Math.trunc(childrenCount));
  const childZulage = kids * avd.zulage.childAllowance * limitFactor;
  const totalZulage = baseZulage + childZulage;

  const rawDeductionBase = includeZulageInDeductionBase
    ? eligibleOwnContribution + totalZulage
    : eligibleOwnContribution;
  const deductionBase = Math.min(maxCap, rawDeductionBase);

  const marginalRate = Math.max(0, Math.min(1, marginalTaxRatePercent / 100));
  const deductionTaxBenefit = deductionBase * marginalRate;
  const extraTaxRefund = Math.max(0, deductionTaxBenefit - totalZulage);
  const totalBenefit = totalZulage + extraTaxRefund;

  return {
    eligibleOwnContribution,
    excessContribution,
    baseZulage,
    childZulage,
    totalZulage,
    deductionBase,
    deductionTaxBenefit,
    extraTaxRefund,
    totalBenefit,
  };
}

