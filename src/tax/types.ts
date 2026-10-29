import type { WithdrawalResult } from '../engine/taxEngine';

export type CountryCode = 'simplified' | 'de' | 'it' | 'nl';
export type FilingStatus = 'single' | 'couple';
export type KirchensteuerRate = 'none' | '8' | '9';
export type ContributionSplitMode = 'auto' | 'manual';

/** Multi-country and personal tax settings (Step 1). */
export interface TaxSettings {
  /** Selected tax regime / country of fiscal residence. */
  taxCountry: CountryCode;
  /** Current age of the investor at the start of the simulation. */
  currentAge: number;
  /** Calendar year in which the simulation starts (e.g. 2027). */
  startYear: number;
  /** Filing status (affects Sparer-Pauschbetrag and progressive tax splitting). */
  filingStatus: FilingStatus;
  /** German church tax rate ('none' | '8' | '9'). */
  kirchensteuer: KirchensteuerRate;
  /** Number of children eligible for allowances/bonuses (e.g. AVD Kinderzulage). */
  childrenCount: number;
  /** Marginal income tax rate during accumulation in % (used for Günstigerprüfung). */
  accumulationMarginalTaxRate: number;
  /** Other annual taxable income during retirement in € (base for progressive tax brackets). */
  otherRetirementIncome: number;
  /** How annual savings are split between pension container (AVD) and ordinary brokerage. */
  contributionSplitMode: ContributionSplitMode;
  /** Annual contribution allocated to AVD in € when contributionSplitMode === 'manual'. */
  manualAvdContribution: number;
  /** If true, fixed statutory tax thresholds, allowances and brackets grow with inflation. */
  indexTaxLimitsToInflation: boolean;
  /** Annual inflation rate in % used to index tax limits. */
  taxLimitsInflationRate: number;
}

/**
 * Per-simulation stateful tax session.
 * Designed to avoid per-year / per-lot heap allocations inside the Monte Carlo hot loop.
 */
export interface TaxSession {
  readonly portfolioValue: number;
  readonly totalContributions: number;
  readonly totalWithdrawals: number;
  readonly totalTaxesPaid: number;
  readonly totalCapitalGainsRealized: number;

  addInitialAmount(amount: number): void;
  /**
   * Executes one accumulation year in canonical order:
   * 1) portfolio return, 2) annual taxes (e.g. Vorabpauschale / stamp duty), 3) end-of-year contribution.
   */
  onAccumulationYear(annualReturn: number, contribution: number, yearIndex: number): void;
  /** Applies the annual return at the start of a retirement year and returns the updated portfolio value. */
  applyRetirementReturn(annualReturn: number, yearIndex: number): number;
  /** Executes a retirement withdrawal (target is net in country regimes, gross in simplified regime). */
  withdraw(requestedAmount: number, yearIndex: number): WithdrawalResult;
}

export interface TaxRegimeDescriptor {
  code: CountryCode;
  implemented: boolean;
  verified: boolean;
}

