import { describe, expect, it } from 'vitest';
import { runSimulation } from '../../engine/simulation';
import type { Asset } from '../../engine/types';
import { DEFAULT_PARAMS } from '../../state/store';
import {
  ItalianBrokerageContainer,
  ItalianPensionFundContainer,
  italianPensionPayoutTaxRate,
  ItalyTaxSession,
  splitItalianContribution,
} from './index';

describe('Italy tax engine — Step 5 acceptance tests', () => {
  it('computes pension fund payout tax rate (15% down to 9% after 35 years)', () => {
    expect(italianPensionPayoutTaxRate(10)).toBeCloseTo(0.15, 6);
    expect(italianPensionPayoutTaxRate(15)).toBeCloseTo(0.15, 6);
    expect(italianPensionPayoutTaxRate(25)).toBeCloseTo(0.12, 6);
    expect(italianPensionPayoutTaxRate(35)).toBeCloseTo(0.09, 6);
    expect(italianPensionPayoutTaxRate(45)).toBeCloseTo(0.09, 6);
  });

  it('applies 0.20% stamp duty before end-of-year contribution and 26% capital gains tax with gross-up', () => {
    const brok = new ItalianBrokerageContainer();
    brok.addContribution(100000);
    // +10% return -> 110,000 €; 0.20% stamp duty = 220 € -> 109,780 €
    const duty = brok.applyReturnAndStampDuty(0.1);
    expect(duty).toBeCloseTo(220, 2);
    expect(brok.portfolioValue).toBeCloseTo(109780, 2);

    // Net withdrawal of 10,000 € via gross-up
    const w = brok.withdrawNet(10000);
    expect(w.netWithdrawal).toBeCloseTo(10000, 2);
    expect(w.grossWithdrawal).toBeGreaterThan(10000);
  });

  it('caps pension fund deductibility at 5,164.57 € and routes excess to ordinary brokerage', () => {
    const split = splitItalianContribution(8000, 'auto');
    expect(split.pensionContribution).toBeCloseTo(5164.57, 2);
    expect(split.brokerageContribution).toBeCloseTo(8000 - 5164.57, 2);

    const pf = new ItalianPensionFundContainer();
    const excess = pf.addContributionFast(8000, 38, 1);
    expect(excess).toBeCloseTo(8000 - 5164.57, 2);
    expect(pf.portfolioValue).toBeCloseTo(5164.57, 2);
    expect(pf.totalTaxRefunds).toBeCloseTo(5164.57 * 0.38, 2);
  });

  it('runs ItalyTaxSession in full simulation and populates container breakdown', () => {
    const session = new ItalyTaxSession({
      ...DEFAULT_PARAMS,
      taxCountry: 'it',
      annualContribution: 8000,
      accumulationMarginalTaxRate: 38,
    });
    session.onAccumulationYear(0.05, 8000, 0);
    expect(session.pensionFund.portfolioValue).toBeCloseTo(5164.57, 2);
    expect(session.brokerage.portfolioValue).toBeCloseTo(8000 - 5164.57, 2);

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
      params: { ...DEFAULT_PARAMS, taxCountry: 'it', nSimulations: 50, annualContribution: 8000 },
      accumulationAssets: [stocks],
      retirementAssets: [stocks],
      correlation: null,
      seed: 77,
    });
    expect(res.taxAnalysis.containers).toBeDefined();
    expect(res.taxAnalysis.containers!.extraTaxRefundsMean).toBeGreaterThan(0);
    expect(res.taxAnalysis.containers!.pensionFinalMean + res.taxAnalysis.containers!.brokerageFinalMean).toBeGreaterThan(0);
  });
});

