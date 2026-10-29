import { describe, expect, it } from 'vitest';
import { createNormal, createRng, isPositiveSemiDefinite, nearestCorrelationMatrix, psdFactor } from './random';
import { correlationSubmatrix, runSimulation, taxLimitFactor } from './simulation';
import { conditionalVaR, mean, percentile, std, totalDeposited, valueAtRisk } from './stats';
import { TaxEngine } from './taxEngine';
import type { Asset, SimulationParams } from './types';
import { DEFAULT_PARAMS, migrateState, STORAGE_KEY } from '../state/store';
import { createTaxSession, TAX_REGIMES } from '../tax/registry';

const stocks: Asset = { name: 'Stocks', allocation: 100, ter: 0, return: 7.5, volatility: 14.6, min_return: -37, max_return: 45 };

const base: SimulationParams = {
  initialAmount: 0, yearsToRetirement: 40, yearsRetired: 25, annualContribution: 6000,
  adjustContributionInflation: true, inflation: 2.5, useRealWithdrawal: true, withdrawal: 12000,
  capitalGainsTaxRate: 26, nSimulations: 2000,
};

describe('stats', () => {
  it('percentile matches numpy linear interpolation', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([1, 2, 3, 4, 5], 10)).toBeCloseTo(1.4);
  });
  it('VaR / CVaR', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(valueAtRisk(v)).toBeCloseTo(5.95);
    expect(conditionalVaR(v)).toBeCloseTo(3);
  });
  it('total deposited', () => {
    expect(totalDeposited(1000, 100, 3, false, 2)).toBe(1300);
    expect(totalDeposited(0, 100, 2, true, 10)).toBeCloseTo(210);
  });
});

describe('random', () => {
  it('normal sampler has mean 0 and sd 1', () => {
    const n = createNormal(createRng(1));
    const x = Array.from({ length: 50000 }, n);
    expect(Math.abs(mean(x))).toBeLessThan(0.02);
    expect(std(x)).toBeCloseTo(1, 1);
  });
  it('factors a PSD matrix', () => {
    const m = [[1, 0.5], [0.5, 1]];
    const L = psdFactor(m);
    expect(L[1][0] * L[0][0]).toBeCloseTo(0.5);
  });
  it('repairs a non-PSD matrix', () => {
    const bad = [[1, 0.9, -0.9], [0.9, 1, 0.9], [-0.9, 0.9, 1]];
    expect(isPositiveSemiDefinite(bad)).toBe(false);
    const fixed = nearestCorrelationMatrix(bad);
    expect(isPositiveSemiDefinite(fixed)).toBe(true);
    expect(fixed[0][0]).toBeCloseTo(1);
  });
});

describe('tax engine', () => {
  it('taxes only the gain portion', () => {
    const t = new TaxEngine(26);
    t.addContribution(100000);
    t.applyReturns(1); // value 200k, basis 100k
    const w = t.withdraw(10000);
    expect(w.capitalGains).toBeCloseTo(5000);
    expect(w.taxesOwed).toBeCloseTo(1300);
    expect(w.netWithdrawal).toBeCloseTo(8700);
    expect(t.portfolioValue).toBeCloseTo(190000);
  });
});

describe('simulation', () => {
  it('deterministic with zero volatility', () => {
    const flat: Asset = { ...stocks, volatility: 0, return: 5, ter: 0 };
    const r = runSimulation({
      params: { ...base, nSimulations: 3, yearsRetired: 0, annualContribution: 0, initialAmount: 1000, yearsToRetirement: 10 },
      accumulationAssets: [flat], retirementAssets: [flat], correlation: null, seed: 1,
    });
    expect(r.accumulationNominal[0]).toBeCloseTo(1000 * 1.05 ** 10);
    expect(r.final[0]).toBeCloseTo(1000 * 1.05 ** 10);
  });

  it('deterministic retirement uses nominal returns without double-counting inflation', () => {
    const flat: Asset = { ...stocks, volatility: 0, return: 10, ter: 0 };
    const params: SimulationParams = {
      ...base,
      nSimulations: 1,
      initialAmount: 10000,
      annualContribution: 0,
      yearsToRetirement: 2,
      yearsRetired: 1,
      inflation: 2,
      useRealWithdrawal: true,
      withdrawal: 1000,
      capitalGainsTaxRate: 26,
    };
    const indep = runSimulation({ params, accumulationAssets: [flat], retirementAssets: [flat], correlation: null, seed: 1 });
    const corr = runSimulation({
      params,
      accumulationAssets: [flat],
      retirementAssets: [flat],
      correlation: { enabled: true, assets: ['Stocks'], matrix: [[1]] },
      seed: 1,
    });
    // Accumulation: 10,000 * 1.10^2 = 12,100 nominal; 12,100 / 1.02^2 = 11,630.14 real.
    expect(indep.accumulationNominal[0]).toBeCloseTo(12100, 2);
    expect(indep.accumulation[0]).toBeCloseTo(12100 / 1.02 ** 2, 2);
    // Retirement year 0: 12,100 * 1.10 = 13,310 nominal; withdrawal = 1,000 * 1.02^2 = 1,040.40 -> final = 12,269.60.
    expect(indep.final[0]).toBeCloseTo(13310 - 1040.4, 2);
    // Real net withdrawal in today's purchasing power: 1,000 * (1 - 0.26 * (3,310 / 13,310)) = 935.34.
    expect(indep.realWithdrawal[0]).toBeCloseTo(1000 * (1 - 0.26 * (3310 / 13310)), 2);
    // Independent and correlated engines use identical nominal retirement math.
    expect(corr.final[0]).toBeCloseTo(indep.final[0], 6);
  });

  it('indexes tax limits to inflation only when enabled', () => {
    expect(taxLimitFactor({ inflation: 2.5 }, 10)).toBe(1);
    expect(taxLimitFactor({ inflation: 2.5, indexTaxLimitsToInflation: false }, 10)).toBe(1);
    expect(taxLimitFactor({ inflation: 2.5, indexTaxLimitsToInflation: true }, 0)).toBe(1);
    expect(taxLimitFactor({ inflation: 2.5, indexTaxLimitsToInflation: true }, 10)).toBeCloseTo(1.025 ** 10, 8);
    expect(
      taxLimitFactor({ inflation: 2.5, indexTaxLimitsToInflation: true, taxLimitsInflationRate: 1.5 }, 10),
    ).toBeCloseTo(1.015 ** 10, 8);
  });

  it('is reproducible with a seed and gives a plausible success rate', () => {
    const req = { params: base, accumulationAssets: [stocks], retirementAssets: [stocks], correlation: null, seed: 42 };
    const a = runSimulation(req);
    const b = runSimulation(req);
    expect(a.final[10]).toBe(b.final[10]);
    const success = Array.from(a.final).filter((x) => x > 0).length / a.final.length;
    expect(success).toBeGreaterThan(0.2);
    expect(success).toBeLessThan(1);
  });

  it('correlated draws honour the matrix', () => {
    const bond: Asset = { name: 'Bond', allocation: 0, ter: 0, return: 3, volatility: 5, min_return: -100, max_return: 100 };
    const m = correlationSubmatrix(['Stocks', 'Bond'], [[1, 0.8], [0.8, 1]], ['Stocks', 'Bond']);
    expect(m[0][1]).toBe(0.8);
    const r = runSimulation({
      params: { ...base, nSimulations: 500 },
      accumulationAssets: [{ ...stocks, allocation: 50 }, { ...bond, allocation: 50 }],
      retirementAssets: [{ ...stocks, allocation: 50 }, { ...bond, allocation: 50 }],
      correlation: { enabled: true, assets: ['Stocks', 'Bond'], matrix: [[1, 0.8], [0.8, 1]] },
      seed: 7,
    });
    expect(r.correlationUsed).toBe(true);
    expect(r.accumulation.length).toBe(500);
  });

  it('simplified tax regime via registry is bit-for-bit identical with fixed seed', () => {
    const legacy = runSimulation({
      params: { ...base, nSimulations: 200 },
      accumulationAssets: [stocks],
      retirementAssets: [stocks],
      correlation: null,
      seed: 42,
    });
    const simplified = runSimulation({
      params: { ...DEFAULT_PARAMS, ...base, taxCountry: 'simplified', nSimulations: 200 },
      accumulationAssets: [stocks],
      retirementAssets: [stocks],
      correlation: null,
      seed: 42,
    });
    expect(Array.from(simplified.accumulationNominal)).toEqual(Array.from(legacy.accumulationNominal));
    expect(Array.from(simplified.final)).toEqual(Array.from(legacy.final));
    expect(Array.from(simplified.realWithdrawal)).toEqual(Array.from(legacy.realWithdrawal));
    expect(simplified.taxAnalysis.totalTaxes.mean).toBe(legacy.taxAnalysis.totalTaxes.mean);
  });

  it('migrates v1 state to v2 and populates default tax settings', () => {
    expect(STORAGE_KEY).toBe('finret.state.v2');
    expect(TAX_REGIMES.find((r) => r.code === 'simplified')?.implemented).toBe(true);
    const v1 = {
      params: {
        initialAmount: 5000,
        yearsToRetirement: 30,
        yearsRetired: 20,
        annualContribution: 4000,
        adjustContributionInflation: false,
        inflation: 3.2,
        useRealWithdrawal: true,
        withdrawal: 15000,
        capitalGainsTaxRate: 26,
        nSimulations: 5000,
      },
    };
    const migrated = migrateState(v1);
    expect(migrated.params.initialAmount).toBe(5000);
    expect(migrated.params.taxCountry).toBe('simplified');
    expect(migrated.params.currentAge).toBe(30);
    expect(migrated.params.startYear).toBe(2027);
    expect(migrated.params.filingStatus).toBe('single');
    expect(migrated.params.kirchensteuer).toBe('none');
    expect(migrated.params.childrenCount).toBe(0);
    expect(migrated.params.contributionSplitMode).toBe('auto');
    expect(migrated.params.taxLimitsInflationRate).toBe(3.2);
    const session = createTaxSession(migrated.params);
    session.addInitialAmount(1000);
    expect(session.portfolioValue).toBe(1000);
  });
});
