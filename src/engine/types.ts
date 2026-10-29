import type { TaxSettings } from '../tax/types';

/** Asset as used by the editor and the engine. All percentages are in % (7.5 = 7.5%). */
export interface Asset {
  name: string;
  allocation: number;
  ter: number;
  return: number;
  volatility: number;
  min_return: number;
  max_return: number;
}

export interface SimulationParams extends Partial<TaxSettings> {
  initialAmount: number;
  yearsToRetirement: number;
  yearsRetired: number;
  annualContribution: number;
  adjustContributionInflation: boolean;
  /** Annual inflation in % (2.5 = 2.5%). */
  inflation: number;
  useRealWithdrawal: boolean;
  /** Annual withdrawal; today's purchasing power if useRealWithdrawal. */
  withdrawal: number;
  /** Capital gains tax rate in %. */
  capitalGainsTaxRate: number;
  nSimulations: number;
}

export interface CorrelationSettings {
  enabled: boolean;
  /** Full correlation matrix ordered as `assets`; sub-matrices are extracted per phase. */
  assets: string[];
  matrix: number[][];
}

export interface SimulationRequest {
  params: SimulationParams;
  accumulationAssets: Asset[];
  retirementAssets: Asset[];
  correlation: CorrelationSettings | null;
  seed?: number;
}

export interface TaxDetails {
  totalContributions: number;
  totalWithdrawals: number;
  totalTaxesPaid: number;
  totalCapitalGainsRealized: number;
  averageAnnualTax: number;
  totalYearsWithWithdrawals: number;
  finalWithdrawal: number;
}

export interface SummaryStats {
  mean: number;
  median: number;
  min: number;
  max: number;
  std: number;
}

export interface TaxAnalysis {
  totalTaxes: SummaryStats;
  effectiveTaxRate: SummaryStats;
  avgFinalWithdrawal: number;
}

export interface SimulationResults {
  /** End-of-accumulation value in today's euros. */
  accumulation: Float64Array;
  /** End-of-accumulation value, nominal. */
  accumulationNominal: Float64Array;
  /** Portfolio value at the end of retirement, nominal. */
  final: Float64Array;
  /** Average net (after-tax) withdrawal per simulation (today's euros if useRealWithdrawal, else nominal). */
  realWithdrawal: Float64Array;
  taxAnalysis: TaxAnalysis;
  correlationUsed: boolean;
}
