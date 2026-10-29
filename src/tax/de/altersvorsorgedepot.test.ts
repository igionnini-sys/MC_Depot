import { describe, expect, it } from 'vitest';
import { runSimulation } from '../../engine/simulation';
import type { Asset } from '../../engine/types';
import { DEFAULT_PARAMS } from '../../state/store';
import { computeGermanIncomeTax, computeIncrementalGermanIncomeTax } from '../common/progressive';
import { AltersvorsorgedepotContainer, splitAnnualContribution } from './altersvorsorgedepot';
import { computeAvdSubsidyAndGuenstigerpruefung } from './guenstigerpruefung';
import { GermanyTaxSession } from './index';

describe('Germany Altersvorsorgedepot 2027 — Step 3 acceptance tests', () => {
  it('computes Zulage (base + children) and enforces the 6,840 € cap (§6)', () => {
    // 1,800 € contribution, 0 children -> 50% * 360 (180) + 25% * 1,440 (360) = 540 €
    const s1 = computeAvdSubsidyAndGuenstigerpruefung(1800, 0, 0);
    expect(s1.baseZulage).toBeCloseTo(540, 2);
    expect(s1.childZulage).toBe(0);
    expect(s1.totalZulage).toBeCloseTo(540, 2);

    // 360 € contribution, 0 children -> 50% * 360 = 180 €
    const s2 = computeAvdSubsidyAndGuenstigerpruefung(360, 0, 0);
    expect(s2.baseZulage).toBeCloseTo(180, 2);
    expect(s2.totalZulage).toBeCloseTo(180, 2);

    // 1,800 € contribution, 2 children (300 € each) -> 540 + 600 = 1,140 €
    const s3 = computeAvdSubsidyAndGuenstigerpruefung(1800, 2, 0);
    expect(s3.baseZulage).toBeCloseTo(540, 2);
    expect(s3.childZulage).toBeCloseTo(600, 2);
    expect(s3.totalZulage).toBeCloseTo(1140, 2);

    // Cap exceeded: 10,000 € requested -> 6,840 € eligible, 3,160 € excess
    const s4 = computeAvdSubsidyAndGuenstigerpruefung(10000, 0, 0);
    expect(s4.eligibleOwnContribution).toBeCloseTo(6840, 2);
    expect(s4.excessContribution).toBeCloseTo(3160, 2);
    expect(s4.baseZulage).toBeCloseTo(540, 2);
  });

  it('evaluates Günstigerprüfung at 30% vs 10% marginal tax rate (§6)', () => {
    // Marginal rate 30%, 1,800 € own + 540 € Zulage = 2,340 € deduction base:
    // 0.30 * 2,340 = 702 € > 540 € -> extraTaxRefund = 162 €, totalBenefit = 702 €
    const g30 = computeAvdSubsidyAndGuenstigerpruefung(1800, 0, 30);
    expect(g30.deductionBase).toBeCloseTo(2340, 2);
    expect(g30.deductionTaxBenefit).toBeCloseTo(702, 2);
    expect(g30.extraTaxRefund).toBeCloseTo(162, 2);
    expect(g30.totalBenefit).toBeCloseTo(702, 2);

    // Marginal rate 10%: 0.10 * 2,340 = 234 € < 540 € -> extraTaxRefund = 0 €, totalBenefit = 540 €
    const g10 = computeAvdSubsidyAndGuenstigerpruefung(1800, 0, 10);
    expect(g10.deductionTaxBenefit).toBeCloseTo(234, 2);
    expect(g10.extraTaxRefund).toBe(0);
    expect(g10.totalBenefit).toBeCloseTo(540, 2);
  });

  it('evaluates progressive German income tax (0, medium, high, splitting, church tax)', () => {
    // Income 0 or within Grundfreibetrag (12,096 €) -> tax = 0
    expect(computeGermanIncomeTax(0, 'single', 'none')).toBe(0);
    expect(computeGermanIncomeTax(12096, 'single', 'none')).toBe(0);

    // Medium income (40,000 €): positive progressive tax, couple pays less due to Ehegattensplitting
    const singleMed = computeGermanIncomeTax(40000, 'single', 'none');
    const coupleMed = computeGermanIncomeTax(40000, 'couple', 'none');
    expect(singleMed).toBeGreaterThan(5000);
    expect(coupleMed).toBeLessThan(singleMed);

    // Very high income (in the 45% Reichensteuer bracket above 277,825 €):
    // an extra 10,000 € on top of 300,000 € is taxed at the 45% top marginal rate
    const incTop = computeIncrementalGermanIncomeTax(300000, 10000, 'single', 'none');
    expect(incTop).toBeCloseTo(4500, 2);

    // With 9% Kirchensteuer on top bracket: 4,500 * 1.09 = 4,905 €
    const incTopKiSt = computeIncrementalGermanIncomeTax(300000, 10000, 'single', '9');
    expect(incTopKiSt).toBeCloseTo(4500 * 1.09, 2);
  });

  it('handles AVD tax-free accumulation, 30% lump-sum cap, and bisection gross-up in decumulation', () => {
    const avd = new AltersvorsorgedepotContainer({ filingStatus: 'single', kirchensteuer: 'none' });
    avd.addContribution(1800, 0, 30, 1); // 1,800 own + 540 Zulage = 2,340 €
    expect(avd.portfolioValue).toBeCloseTo(2340, 2);
    expect(avd.totalContributions).toBeCloseTo(1800, 2);
    expect(avd.totalZulagen).toBeCloseTo(540, 2);

    // Grow to 100,000 € tax-free (no Vorabpauschale)
    avd.applyReturn(100000 / 2340 - 1);
    expect(avd.portfolioValue).toBeCloseTo(100000, 2);

    // One-off lump sum capped at 30% even if 50% is requested
    avd.startNewTaxYear();
    const lump = avd.withdrawLumpSum(0.5, 20000, 1);
    expect(lump.grossWithdrawal).toBeCloseTo(30000, 2);
    expect(lump.taxesOwed).toBeGreaterThan(0);
    expect(avd.portfolioValue).toBeCloseTo(70000, 2);

    // Annual net withdrawal via gross-up bisection: net(withdrawNet(N)) === N
    avd.startNewTaxYear();
    const wNet = avd.withdrawNet(15000, 20000, 1);
    expect(wNet.netWithdrawal).toBeCloseTo(15000, 1);
    expect(wNet.grossWithdrawal).toBeGreaterThan(15000);
  });

  it('splits contributions (auto/manual, pre/post 2027) and coordinates AVD + ordinary brokerage in GermanyTaxSession', () => {
    // Pre-2027: 100% goes to ordinary brokerage
    expect(splitAnnualContribution(10000, 2026, 'auto')).toEqual({
      avdOwnContribution: 0,
      brokerageContribution: 10000,
    });
    // 2027+ auto: 6,840 € to AVD, 3,160 € to brokerage
    expect(splitAnnualContribution(10000, 2027, 'auto')).toEqual({
      avdOwnContribution: 6840,
      brokerageContribution: 3160,
    });
    // 2027+ manual: 1,800 € to AVD, 8,200 € to brokerage
    expect(splitAnnualContribution(10000, 2027, 'manual', 1800)).toEqual({
      avdOwnContribution: 1800,
      brokerageContribution: 8200,
    });

    // Combined session: 35 years accumulation from age 30 (reaches age 65 at retirement)
    const session = new GermanyTaxSession({
      ...DEFAULT_PARAMS,
      taxCountry: 'de',
      currentAge: 30,
      startYear: 2027,
      yearsToRetirement: 35,
      yearsRetired: 20,
      annualContribution: 10000,
      contributionSplitMode: 'auto',
      otherRetirementIncome: 18000,
    });
    session.onAccumulationYear(0.06, 10000, 0);
    // 6,840 own + 540 Zulage = 7,380 in AVD; 3,160 in brokerage
    expect(session.avd.portfolioValue).toBeCloseTo(7380, 2);
    expect(session.brokerage.portfolioValue).toBeCloseTo(3160, 2);

    // At retirement (age 65), withdraw 5,000 € net across both containers
    session.applyRetirementReturn(0.05, 0);
    const w = session.withdraw(5000, 0);
    expect(w.netWithdrawal).toBeCloseTo(5000, 1);
    expect(w.grossWithdrawal).toBeGreaterThan(5000);

    // Full runSimulation populates container breakdown for ResultsView (Step 4)
    const stocks: Asset = {
      name: 'Stocks',
      allocation: 100,
      ter: 0.2,
      return: 7,
      volatility: 14,
      min_return: -35,
      max_return: 40,
    };
    const res = runSimulation({
      params: {
        ...DEFAULT_PARAMS,
        taxCountry: 'de',
        nSimulations: 50,
        annualContribution: 10000,
        childrenCount: 1,
        accumulationMarginalTaxRate: 38,
      },
      accumulationAssets: [stocks],
      retirementAssets: [stocks],
      correlation: null,
      seed: 99,
    });
    expect(res.taxAnalysis.containers).toBeDefined();
    expect(res.taxAnalysis.containers!.stateSubsidiesMean).toBeGreaterThan(0);
    expect(res.taxAnalysis.containers!.extraTaxRefundsMean).toBeGreaterThan(0);
    expect(res.taxAnalysis.containers!.pensionFinalMean + res.taxAnalysis.containers!.brokerageFinalMean).toBeGreaterThan(0);
  });
});

