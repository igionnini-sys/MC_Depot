import { taxLimitFactor } from '../../engine/simulation';
import type { WithdrawalResult } from '../../engine/taxEngine';
import type { SimulationParams } from '../../engine/types';
import type { TaxSession } from '../types';
import {
  AltersvorsorgedepotContainer,
  splitAnnualContribution,
  type AvdContainerOptions,
  type ContributionSplitResult,
} from './altersvorsorgedepot';
import {
  abgeltungsteuerCombinedRate,
  basiszinsForYear,
  computePortfolioTaxProfile,
  computeVorabpauschale,
  GermanBrokerageContainer,
  sparerPauschbetragForYear,
  type AssetTaxRule,
  type GermanBrokerageOptions,
  type PortfolioTaxProfile,
  type VorabpauschaleResult,
} from './brokerage';
import { computeAvdSubsidyAndGuenstigerpruefung, type AvdSubsidyResult } from './guenstigerpruefung';

export {
  abgeltungsteuerCombinedRate,
  AltersvorsorgedepotContainer,
  basiszinsForYear,
  computeAvdSubsidyAndGuenstigerpruefung,
  computePortfolioTaxProfile,
  computeVorabpauschale,
  GermanBrokerageContainer,
  sparerPauschbetragForYear,
  splitAnnualContribution,
  type AssetTaxRule,
  type AvdContainerOptions,
  type AvdSubsidyResult,
  type ContributionSplitResult,
  type GermanBrokerageOptions,
  type PortfolioTaxProfile,
  type VorabpauschaleResult,
};

const DEFAULT_PROFILE: PortfolioTaxProfile = {
  weightedTeilfreistellung: 0.3,
  fundShare: 1,
  fundTeilfreistellung: 0.3,
};

/**
 * German tax session combining:
 * 1) Ordinary brokerage container (Depot: Abgeltungsteuer, Sparer-Pauschbetrag, Teilfreistellung, Vorabpauschale)
 * 2) Altersvorsorgedepot 2027 (AVD: tax-free accumulation, Zulage + Günstigerprüfung, progressive ESt in retirement)
 */
export class GermanyTaxSession implements TaxSession {
  private readonly params: SimulationParams;
  private readonly accProfile: PortfolioTaxProfile;
  private readonly retProfile: PortfolioTaxProfile;
  readonly brokerage: GermanBrokerageContainer;
  readonly avd: AltersvorsorgedepotContainer;

  constructor(
    params: SimulationParams,
    accProfile: PortfolioTaxProfile = DEFAULT_PROFILE,
    retProfile: PortfolioTaxProfile = DEFAULT_PROFILE,
  ) {
    this.params = params;
    this.accProfile = accProfile;
    this.retProfile = retProfile;
    const kirchensteuer = params.kirchensteuer ?? 'none';
    const filingStatus = params.filingStatus ?? 'single';
    this.brokerage = new GermanBrokerageContainer({ kirchensteuer, filingStatus });
    this.avd = new AltersvorsorgedepotContainer({ kirchensteuer, filingStatus });
  }

  get portfolioValue(): number {
    return this.brokerage.portfolioValue + this.avd.portfolioValue;
  }
  get totalContributions(): number {
    return this.brokerage.totalContributions + this.avd.totalContributions;
  }
  get totalWithdrawals(): number {
    return this.brokerage.totalWithdrawals + this.avd.totalWithdrawals;
  }
  get totalTaxesPaid(): number {
    return this.brokerage.totalTaxesPaid + this.avd.totalTaxesPaid;
  }
  get totalCapitalGainsRealized(): number {
    return this.brokerage.totalCapitalGainsRealized + this.avd.totalCapitalGainsRealized;
  }

  addInitialAmount(amount: number): void {
    if (amount > 0) this.brokerage.addContribution(amount);
  }

  onAccumulationYear(annualReturn: number, contribution: number, yearIndex: number): void {
    const startYear = this.params.startYear ?? 2027;
    const calendarYear = startYear + yearIndex;
    const limitFactor = taxLimitFactor(this.params, yearIndex);

    this.brokerage.startNewTaxYear(limitFactor);
    this.avd.startNewTaxYear();

    // 1) Annual returns + 2) Annual Vorabpauschale on ordinary brokerage (AVD is exempt)
    const basiszins = basiszinsForYear(calendarYear);
    this.brokerage.accrueYearFast(annualReturn, basiszins, this.accProfile);
    this.avd.applyReturn(annualReturn);

    // 3) End-of-year contribution split between AVD and ordinary brokerage (zero-allocation hot path)
    if (contribution > 0) {
      if (calendarYear < 2027) {
        this.brokerage.addContribution(contribution);
      } else {
        const maxCap = 6840 * limitFactor;
        const desiredAvd =
          this.params.contributionSplitMode === 'manual'
            ? Math.max(0, this.params.manualAvdContribution ?? 1800)
            : contribution;
        const avdOwn = Math.min(contribution, desiredAvd, maxCap);
        let brokContrib = contribution - avdOwn;
        if (avdOwn > 0) {
          brokContrib += this.avd.addContributionFast(
            avdOwn,
            this.params.childrenCount ?? 0,
            this.params.accumulationMarginalTaxRate ?? 35,
            limitFactor,
          );
        }
        if (brokContrib > 0) {
          this.brokerage.addContribution(brokContrib);
        }
      }
    }
  }

  applyRetirementReturn(annualReturn: number, yearIndex: number): number {
    const startYear = this.params.startYear ?? 2027;
    const totalYearIndex = Math.trunc(this.params.yearsToRetirement) + yearIndex;
    const limitFactor = taxLimitFactor(this.params, totalYearIndex);

    this.brokerage.startNewTaxYear(limitFactor);
    this.avd.startNewTaxYear();

    const basiszins = basiszinsForYear(startYear + totalYearIndex);
    this.brokerage.accrueYearFast(annualReturn, basiszins, this.retProfile);
    this.avd.applyReturn(annualReturn);
    return this.portfolioValue;
  }

  withdraw(requestedNetAmount: number, yearIndex = 0): WithdrawalResult {
    if (requestedNetAmount <= 0 || this.portfolioValue <= 0) {
      return { grossWithdrawal: 0, netWithdrawal: 0, capitalGains: 0, taxesOwed: 0, costBasisSold: 0 };
    }

    const totalYearIndex = Math.trunc(this.params.yearsToRetirement) + yearIndex;
    const limitFactor = taxLimitFactor(this.params, totalYearIndex);
    const age = (this.params.currentAge ?? 30) + totalYearIndex;
    const baseOtherIncome = this.params.otherRetirementIncome ?? 0;
    const otherIncome =
      baseOtherIncome > 0 && this.params.useRealWithdrawal
        ? baseOtherIncome * (1 + this.params.inflation / 100) ** totalYearIndex
        : baseOtherIncome;

    const avdEligible = age >= this.avd.minPayoutAge && this.avd.portfolioValue > 0;
    if (!avdEligible) {
      return this.brokerage.withdrawNet(requestedNetAmount, this.retProfile);
    }
    if (this.brokerage.portfolioValue <= 0) {
      return this.avd.withdrawNet(requestedNetAmount, otherIncome, limitFactor);
    }

    // Both containers have funds and investor is >= 65: draw proportionally, with automatic spillover if one exhausts
    const totVal = this.portfolioValue;
    const avdShare = this.avd.portfolioValue / totVal;
    const targetAvd = requestedNetAmount * avdShare;
    const targetBrok = requestedNetAmount - targetAvd;

    let wAvd = this.avd.withdrawNet(targetAvd, otherIncome, limitFactor);
    let wBrok = this.brokerage.withdrawNet(targetBrok, this.retProfile);

    const gotNet = wAvd.netWithdrawal + wBrok.netWithdrawal;
    const shortfall = requestedNetAmount - gotNet;
    if (shortfall > 1e-2) {
      if (this.brokerage.portfolioValue > 0) {
        const extra = this.brokerage.withdrawNet(shortfall, this.retProfile);
        wBrok = mergeWithdrawals(wBrok, extra);
      } else if (this.avd.portfolioValue > 0) {
        const extra = this.avd.withdrawNet(shortfall, otherIncome, limitFactor);
        wAvd = mergeWithdrawals(wAvd, extra);
      }
    }

    return mergeWithdrawals(wAvd, wBrok);
  }
}

function mergeWithdrawals(a: WithdrawalResult, b: WithdrawalResult): WithdrawalResult {
  return {
    grossWithdrawal: a.grossWithdrawal + b.grossWithdrawal,
    netWithdrawal: a.netWithdrawal + b.netWithdrawal,
    capitalGains: a.capitalGains + b.capitalGains,
    taxesOwed: a.taxesOwed + b.taxesOwed,
    costBasisSold: a.costBasisSold + b.costBasisSold,
  };
}
