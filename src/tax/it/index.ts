import { taxLimitFactor } from '../../engine/simulation';
import type { WithdrawalResult } from '../../engine/taxEngine';
import type { SimulationParams } from '../../engine/types';
import { grossUpPiecewiseLinear } from '../grossUp';
import itParams from '../params/it.json';
import type { ContributionSplitMode, TaxSession } from '../types';

const EMPTY_WITHDRAWAL: WithdrawalResult = {
  grossWithdrawal: 0,
  netWithdrawal: 0,
  capitalGains: 0,
  taxesOwed: 0,
  costBasisSold: 0,
};

/**
 * Computes the Italian supplementary pension fund payout tax rate (Art. 11, c. 6, D.Lgs. 252/2005):
 * 15% up to 15 years of participation, reduced by 0.30% per year beyond 15, down to a minimum of 9% (at 35+ years).
 */
export function italianPensionPayoutTaxRate(participationYears: number): number {
  const p = itParams.pensionFund.payoutTax;
  const extraYears = Math.max(0, Math.trunc(participationYears) - p.thresholdYears);
  const rate = p.baseRate - extraYears * p.reductionPerYearAfter15;
  return Math.max(p.minRate, Math.min(p.baseRate, rate));
}

/** Splits annual savings between the Italian Pension Fund (up to 5,164.57 € cap) and Ordinary Brokerage. */
export function splitItalianContribution(
  totalContribution: number,
  mode: ContributionSplitMode = 'auto',
  manualPensionContribution = 5164.57,
  limitFactor = 1,
): { pensionContribution: number; brokerageContribution: number } {
  const total = Math.max(0, totalContribution);
  if (total <= 0) return { pensionContribution: 0, brokerageContribution: 0 };
  const cap = itParams.pensionFund.deductibilityCap.value * limitFactor;
  const desired = mode === 'manual' ? Math.max(0, manualPensionContribution) : total;
  const pensionContribution = Math.min(total, desired, cap);
  const brokerageContribution = Math.max(0, total - pensionContribution);
  return { pensionContribution, brokerageContribution };
}

/**
 * Stateful Italian Ordinary Brokerage container (Conto Titoli in regime amministrato):
 * - 0.20% annual stamp duty (imposta di bollo) on year-end portfolio value, after return and before end-of-year contribution.
 * - 26% capital gains tax upon realization (proportional cost basis with loss compensation within the account).
 */
export class ItalianBrokerageContainer {
  readonly capitalGainsRate = itParams.brokerage.capitalGainsTaxRate.value;
  readonly stampDutyRate = itParams.brokerage.stampDutyRate.value;

  private value = 0;
  private basis = 0;

  totalContributions = 0;
  totalWithdrawals = 0;
  totalTaxesPaid = 0;
  totalCapitalGainsRealized = 0;

  get portfolioValue(): number {
    return this.value;
  }
  get costBasis(): number {
    return this.basis;
  }

  addContribution(amount: number): void {
    if (amount <= 0) return;
    this.value += amount;
    this.basis += amount;
    this.totalContributions += amount;
  }

  /**
   * Applies annual return and deducts the 0.20% annual stamp duty (imposta di bollo)
   * on the year-end portfolio value before new end-of-year contributions are added.
   */
  applyReturnAndStampDuty(annualReturn: number): number {
    if (this.value <= 0) return 0;
    const afterReturn = Math.max(0, this.value * (1 + annualReturn));
    const stampDuty = afterReturn * this.stampDutyRate;
    this.value = Math.max(0, afterReturn - stampDuty);
    this.totalTaxesPaid += stampDuty;
    return stampDuty;
  }

  withdrawGross(requestedGross: number): WithdrawalResult {
    if (requestedGross <= 0 || this.value <= 0) return EMPTY_WITHDRAWAL;
    const gross = Math.min(requestedGross, this.value);
    const ratio = gross / this.value;
    const basisSold = this.basis * ratio;
    this.value = Math.max(0, this.value - gross);
    this.basis = Math.max(0, this.basis - basisSold);

    const gain = Math.max(0, gross - basisSold);
    const taxes = gain * this.capitalGainsRate;

    this.totalWithdrawals += gross;
    this.totalTaxesPaid += taxes;
    this.totalCapitalGainsRealized += gain;

    return {
      grossWithdrawal: gross,
      netWithdrawal: Math.max(0, gross - taxes),
      capitalGains: gain,
      taxesOwed: taxes,
      costBasisSold: basisSold,
    };
  }

  withdrawNet(targetNet: number): WithdrawalResult {
    if (targetNet <= 0 || this.value <= 0) return EMPTY_WITHDRAWAL;
    const gainRatio = this.value > this.basis ? (this.value - this.basis) / this.value : 0;
    const gross = grossUpPiecewiseLinear(targetNet, this.value, gainRatio, 0, this.capitalGainsRate);
    return this.withdrawGross(gross);
  }
}

/**
 * Stateful Italian Supplementary Pension Fund container (Fondo Pensione Complementare, D.Lgs. 252/2005):
 * - Contributions deductible up to 5,164.57 €/year (generating an IRPEF tax refund at the marginal tax rate).
 * - Payouts taxed at the preferential substitute rate of 15% reduced by 0.30%/year after 15 years down to 9%.
 */
export class ItalianPensionFundContainer {
  private value = 0;
  private ownContrib = 0;
  private taxRefunds = 0;
  private yearsParticipated = 0;

  totalWithdrawals = 0;
  totalTaxesPaid = 0;
  totalCapitalGainsRealized = 0;

  get portfolioValue(): number {
    return this.value;
  }
  get totalContributions(): number {
    return this.ownContrib;
  }
  get totalTaxRefunds(): number {
    return this.taxRefunds;
  }
  get participationYears(): number {
    return this.yearsParticipated;
  }

  applyReturn(annualReturn: number): number {
    this.value = Math.max(0, this.value * (1 + annualReturn));
    this.yearsParticipated++;
    return this.value;
  }

  /** Adds a deductible contribution (clamped to 5,164.57 € * limitFactor) and returns any excess. */
  addContributionFast(
    requestedAmount: number,
    marginalTaxRatePercent: number,
    limitFactor = 1,
  ): number {
    if (requestedAmount <= 0) return 0;
    const cap = itParams.pensionFund.deductibilityCap.value * limitFactor;
    const eligible = requestedAmount < cap ? requestedAmount : cap;
    const excess = requestedAmount - eligible;

    const marginalRate = Math.max(0, Math.min(1, marginalTaxRatePercent * 0.01));
    const irpefSaving = eligible * marginalRate;

    this.value += eligible;
    this.ownContrib += eligible;
    this.taxRefunds += irpefSaving;
    return excess;
  }

  withdrawGross(requestedGross: number): WithdrawalResult {
    if (requestedGross <= 0 || this.value <= 0) return EMPTY_WITHDRAWAL;
    const gross = Math.min(requestedGross, this.value);
    const ratio = gross / this.value;
    const basisSold = this.ownContrib * ratio;
    const gainPortion = Math.max(0, gross - basisSold);

    const rate = italianPensionPayoutTaxRate(this.yearsParticipated);
    const taxes = gross * rate;

    this.value = Math.max(0, this.value - gross);
    this.ownContrib = Math.max(0, this.ownContrib - basisSold);

    this.totalWithdrawals += gross;
    this.totalTaxesPaid += taxes;
    this.totalCapitalGainsRealized += gainPortion;

    return {
      grossWithdrawal: gross,
      netWithdrawal: Math.max(0, gross - taxes),
      capitalGains: gainPortion,
      taxesOwed: taxes,
      costBasisSold: basisSold,
    };
  }

  withdrawNet(targetNet: number): WithdrawalResult {
    if (targetNet <= 0 || this.value <= 0) return EMPTY_WITHDRAWAL;
    const rate = italianPensionPayoutTaxRate(this.yearsParticipated);
    const gross = Math.min(this.value, targetNet / (1 - rate));
    return this.withdrawGross(gross);
  }
}

export class ItalyTaxSession implements TaxSession {
  private readonly params: SimulationParams;
  readonly brokerage = new ItalianBrokerageContainer();
  readonly pensionFund = new ItalianPensionFundContainer();

  constructor(params: SimulationParams) {
    this.params = params;
  }

  get portfolioValue(): number {
    return this.brokerage.portfolioValue + this.pensionFund.portfolioValue;
  }
  get totalContributions(): number {
    return this.brokerage.totalContributions + this.pensionFund.totalContributions;
  }
  get totalWithdrawals(): number {
    return this.brokerage.totalWithdrawals + this.pensionFund.totalWithdrawals;
  }
  get totalTaxesPaid(): number {
    return this.brokerage.totalTaxesPaid + this.pensionFund.totalTaxesPaid;
  }
  get totalCapitalGainsRealized(): number {
    return this.brokerage.totalCapitalGainsRealized + this.pensionFund.totalCapitalGainsRealized;
  }
  get brokerageFinalValue(): number {
    return this.brokerage.portfolioValue;
  }
  get pensionFinalValue(): number {
    return this.pensionFund.portfolioValue;
  }
  get brokerageTaxesPaid(): number {
    return this.brokerage.totalTaxesPaid;
  }
  get pensionTaxesPaid(): number {
    return this.pensionFund.totalTaxesPaid;
  }
  get stateSubsidiesReceived(): number {
    return 0;
  }
  get extraTaxRefundsReceived(): number {
    return this.pensionFund.totalTaxRefunds;
  }

  addInitialAmount(amount: number): void {
    if (amount > 0) this.brokerage.addContribution(amount);
  }

  onAccumulationYear(annualReturn: number, contribution: number, yearIndex: number): void {
    const limitFactor = taxLimitFactor(this.params, yearIndex);

    // 1) Annual returns + 2) 0.20% stamp duty on brokerage (before end-of-year contribution)
    this.brokerage.applyReturnAndStampDuty(annualReturn);
    this.pensionFund.applyReturn(annualReturn);

    // 3) End-of-year contribution split between Pension Fund (up to 5,164.57 €) and Ordinary Brokerage
    if (contribution > 0) {
      const cap = itParams.pensionFund.deductibilityCap.value * limitFactor;
      const desiredPension =
        this.params.contributionSplitMode === 'manual'
          ? Math.max(0, this.params.manualAvdContribution ?? cap)
          : contribution;
      const pensionOwn = Math.min(contribution, desiredPension, cap);
      let brokContrib = contribution - pensionOwn;
      if (pensionOwn > 0) {
        brokContrib += this.pensionFund.addContributionFast(
          pensionOwn,
          this.params.accumulationMarginalTaxRate ?? 35,
          limitFactor,
        );
      }
      if (brokContrib > 0) {
        this.brokerage.addContribution(brokContrib);
      }
    }
  }

  applyRetirementReturn(annualReturn: number): number {
    this.brokerage.applyReturnAndStampDuty(annualReturn);
    this.pensionFund.applyReturn(annualReturn);
    return this.portfolioValue;
  }

  withdraw(requestedNetAmount: number): WithdrawalResult {
    if (requestedNetAmount <= 0 || this.portfolioValue <= 0) return EMPTY_WITHDRAWAL;
    if (this.pensionFund.portfolioValue <= 0) {
      return this.brokerage.withdrawNet(requestedNetAmount);
    }
    if (this.brokerage.portfolioValue <= 0) {
      return this.pensionFund.withdrawNet(requestedNetAmount);
    }

    const tot = this.portfolioValue;
    const pShare = this.pensionFund.portfolioValue / tot;
    const targetP = requestedNetAmount * pShare;
    const targetB = requestedNetAmount - targetP;

    let wP = this.pensionFund.withdrawNet(targetP);
    let wB = this.brokerage.withdrawNet(targetB);

    const shortfall = requestedNetAmount - (wP.netWithdrawal + wB.netWithdrawal);
    if (shortfall > 1e-2) {
      if (this.brokerage.portfolioValue > 0) {
        const extra = this.brokerage.withdrawNet(shortfall);
        wB = merge(wB, extra);
      } else if (this.pensionFund.portfolioValue > 0) {
        const extra = this.pensionFund.withdrawNet(shortfall);
        wP = merge(wP, extra);
      }
    }
    return merge(wP, wB);
  }
}

function merge(a: WithdrawalResult, b: WithdrawalResult): WithdrawalResult {
  return {
    grossWithdrawal: a.grossWithdrawal + b.grossWithdrawal,
    netWithdrawal: a.netWithdrawal + b.netWithdrawal,
    capitalGains: a.capitalGains + b.capitalGains,
    taxesOwed: a.taxesOwed + b.taxesOwed,
    costBasisSold: a.costBasisSold + b.costBasisSold,
  };
}
