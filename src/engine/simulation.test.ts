import { describe, expect, it } from 'vitest';
import { createNormal, createRng, isPositiveSemiDefinite, nearestCorrelationMatrix, psdFactor } from './random';
import { correlationSubmatrix, runSimulation } from './simulation';
import { conditionalVaR, mean, percentile, std, totalDeposited, valueAtRisk } from './stats';
import { TaxEngine } from './taxEngine';
import type { Asset, SimulationParams } from './types';

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
});
