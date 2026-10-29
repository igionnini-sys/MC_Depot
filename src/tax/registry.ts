import { TaxEngine, type WithdrawalResult } from '../engine/taxEngine';
import type { SimulationParams } from '../engine/types';
import { GermanyTaxSession, type PortfolioTaxProfile } from './de';
import { ItalyTaxSession } from './it';
import { NetherlandsTaxSession } from './nl';
import type { CountryCode, TaxRegimeDescriptor, TaxSession } from './types';

export const TAX_REGIMES: readonly TaxRegimeDescriptor[] = [
  { code: 'simplified', implemented: true, verified: true },
  { code: 'de', implemented: true, verified: false },
  { code: 'it', implemented: true, verified: true },
  { code: 'nl', implemented: true, verified: false },
];

/**
 * Default simplified tax session: delegates to the lot-based `TaxEngine`
 * so `simplified` produces bit-for-bit identical results to the legacy engine.
 */
class SimplifiedTaxSession implements TaxSession {
  private readonly engine: TaxEngine;

  constructor(capitalGainsTaxRate: number, expectedLots: number) {
    this.engine = new TaxEngine(capitalGainsTaxRate, expectedLots);
  }

  get portfolioValue(): number {
    return this.engine.portfolioValue;
  }
  get totalContributions(): number {
    return this.engine.totalContributions;
  }
  get totalWithdrawals(): number {
    return this.engine.totalWithdrawals;
  }
  get totalTaxesPaid(): number {
    return this.engine.totalTaxesPaid;
  }
  get totalCapitalGainsRealized(): number {
    return this.engine.totalCapitalGainsRealized;
  }

  addInitialAmount(amount: number): void {
    if (amount > 0) this.engine.addContribution(amount);
  }

  onAccumulationYear(annualReturn: number, contribution: number): void {
    this.engine.applyReturns(annualReturn);
    if (contribution > 0) this.engine.addContribution(contribution);
  }

  applyRetirementReturn(annualReturn: number): number {
    this.engine.applyReturns(annualReturn);
    return this.engine.portfolioValue;
  }

  withdraw(requestedAmount: number): WithdrawalResult {
    return this.engine.withdraw(Math.min(requestedAmount, this.engine.portfolioValue));
  }
}

export function createTaxSession(
  params: SimulationParams,
  accProfile?: PortfolioTaxProfile,
  retProfile?: PortfolioTaxProfile,
  accCashShare = 0,
  retCashShare = 0,
): TaxSession {
  const yearsAcc = Math.trunc(params.yearsToRetirement);
  const country: CountryCode = params.taxCountry ?? 'simplified';
  switch (country) {
    case 'de':
      return new GermanyTaxSession(params, accProfile, retProfile);
    case 'it':
      return new ItalyTaxSession(params);
    case 'nl':
      return new NetherlandsTaxSession(params, accCashShare, retCashShare);
    case 'simplified':
    default:
      return new SimplifiedTaxSession(params.capitalGainsTaxRate, yearsAcc + 2);
  }
}
