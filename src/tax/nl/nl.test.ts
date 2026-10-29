import { describe, expect, it } from 'vitest';
import { runSimulation } from '../../engine/simulation';
import type { Asset, SimulationParams } from '../../engine/types';
import {
  box3ParamsForYear,
  computeBox3AnnualTax,
  computeNlPortfolioCashShare,
  NetherlandsBox3Container,
  NetherlandsTaxSession,
} from './index';

function baseParams(overrides: Partial<SimulationParams> = {}): SimulationParams {
  return {
    initialAmount: 100_000,
    annualContribution: 5_000,
    yearsToRetirement: 10,
    yearsRetired: 10,
    inflation: 2,
    adjustContributionInflation: false,
    useRealWithdrawal: false,
    withdrawal: 10_000,
    capitalGainsTaxRate: 26,
    nSimulations: 50,
    taxCountry: 'nl',
    filingStatus: 'single',
    kirchensteuer: 'none',
    childrenCount: 0,
    currentAge: 35,
    startYear: 2027,
    accumulationMarginalTaxRate: 37,
    otherRetirementIncome: 0,
    contributionSplitMode: 'auto',
    manualAvdContribution: 0,
    indexTaxLimitsToInflation: false,
    taxLimitsInflationRate: 2,
    ...overrides,
  };
}

describe('Netherlands Box 3 tax engine', () => {
  it('computes zero Box 3 tax when wealth is below the heffingsvrij vermogen (single and couple)', () => {
    const yp = box3ParamsForYear(2025);
    expect(yp.allowanceSingle).toBe(57_684);
    expect(yp.allowanceCouple).toBe(115_368);

    const singleBelow = computeBox3AnnualTax(50_000, 0, 2025, 'single', 1);
    expect(singleBelow.taxableWealth).toBe(0);
    expect(singleBelow.taxOwed).toBe(0);

    const coupleBelow = computeBox3AnnualTax(110_000, 0, 2025, 'couple', 1);
    expect(coupleBelow.taxableWealth).toBe(0);
    expect(coupleBelow.taxOwed).toBe(0);
  });

  it('computes Box 3 tax above allowance and differentiates cash savings from investments', () => {
    // 2025: allowanceSingle = 57,684; r_savings = 1.44%; r_investments = 5.88%; taxRate = 36%
    // Wealth = 157,684 => taxableWealth = 100,000
    const allInvest = computeBox3AnnualTax(157_684, 0, 2025, 'single', 1);
    expect(allInvest.taxableWealth).toBeCloseTo(100_000, 6);
    expect(allInvest.weightedDeemedReturnRate).toBeCloseTo(0.0588, 6);
    expect(allInvest.taxableDeemedIncome).toBeCloseTo(5_880, 6);
    expect(allInvest.taxOwed).toBeCloseTo(5_880 * 0.36, 6);

    const allCash = computeBox3AnnualTax(157_684, 1, 2025, 'single', 1);
    expect(allCash.weightedDeemedReturnRate).toBeCloseTo(0.0144, 6);
    expect(allCash.taxableDeemedIncome).toBeCloseTo(1_440, 6);
    expect(allCash.taxOwed).toBeCloseTo(1_440 * 0.36, 6);

    // 50% cash / 50% investments
    const mixed = computeBox3AnnualTax(157_684, 0.5, 2025, 'single', 1);
    expect(mixed.weightedDeemedReturnRate).toBeCloseTo((0.0144 + 0.0588) / 2, 6);
    expect(mixed.taxOwed).toBeLessThan(allInvest.taxOwed);
    expect(mixed.taxOwed).toBeGreaterThan(allCash.taxOwed);
  });

  it('computes portfolio cash share from asset allocations', () => {
    const assets: Asset[] = [
      { name: 'Stocks', allocation: 70, return: 8, volatility: 15, min_return: -40, max_return: 50, ter: 0.2 },
      { name: 'Cash', allocation: 30, return: 2, volatility: 1, min_return: 0, max_return: 5, ter: 0 },
    ];
    expect(computeNlPortfolioCashShare(assets)).toBeCloseTo(0.3, 6);
  });

  it('charges no realization tax upon withdrawal in Box 3', () => {
    const box3 = new NetherlandsBox3Container();
    box3.addContribution(100_000);
    // 10% return on 100,000 => 110,000; tax paid on excess above 57,684
    const taxPaid = box3.accrueYearFast(0.1, 0, 2025, 'single', 1);
    expect(taxPaid).toBeCloseTo((110_000 - 57_684) * 0.0588 * 0.36, 6);
    expect(box3.portfolioValue).toBeCloseTo(110_000 - taxPaid, 6);

    // Withdrawal in retirement has 0 realization tax (gross == net)
    const w = box3.withdrawNet(15_000);
    expect(w.grossWithdrawal).toBeCloseTo(15_000, 6);
    expect(w.netWithdrawal).toBeCloseTo(15_000, 6);
    expect(w.taxesOwed).toBe(0);
  });

  it('integrates NetherlandsTaxSession end-to-end with runSimulation', () => {
    const p = baseParams();
    const session = new NetherlandsTaxSession(p, 0.2, 0.4);
    session.addInitialAmount(100_000);
    session.onAccumulationYear(0.06, 5_000, 0);
    expect(session.totalTaxesPaid).toBeGreaterThan(0);

    const assets: Asset[] = [
      { name: 'Stocks', allocation: 80, return: 7, volatility: 12, min_return: -30, max_return: 40, ter: 0.2 },
      { name: 'Cash', allocation: 20, return: 2, volatility: 1, min_return: 0, max_return: 5, ter: 0 },
    ];
    const res = runSimulation({
      params: p,
      accumulationAssets: assets,
      retirementAssets: assets,
      correlation: null,
      seed: 123,
    });
    expect(res.final.length).toBe(50);
    expect(res.taxAnalysis.totalTaxes.mean).toBeGreaterThan(0);
    expect(res.taxAnalysis.containers).toBeDefined();
    expect(res.taxAnalysis.containers!.brokerageTaxesMean).toBeGreaterThan(0);
  });
});
