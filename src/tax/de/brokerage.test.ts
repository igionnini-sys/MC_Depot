import { describe, expect, it } from 'vitest';
import { runSimulation } from '../../engine/simulation';
import type { Asset, SimulationParams } from '../../engine/types';
import { DEFAULT_PARAMS } from '../../state/store';
import { grossUpBisection, grossUpPiecewiseLinear } from '../grossUp';
import {
  abgeltungsteuerCombinedRate,
  computePortfolioTaxProfile,
  computeVorabpauschale,
  GermanBrokerageContainer,
  type PortfolioTaxProfile,
} from './brokerage';

const equityProfile: PortfolioTaxProfile = {
  weightedTeilfreistellung: 0.3,
  fundShare: 1,
  fundTeilfreistellung: 0.3,
};

describe('Germany ordinary brokerage — Step 2 acceptance tests', () => {
  it('computes combined Abgeltungsteuer rates with Soli and Kirchensteuer', () => {
    expect(abgeltungsteuerCombinedRate('none') * 100).toBeCloseTo(26.375, 4);
    expect(abgeltungsteuerCombinedRate('8') * 100).toBeCloseTo(27.82, 2);
    expect(abgeltungsteuerCombinedRate('9') * 100).toBeCloseTo(27.995, 2);
  });

  it('computes Vorabpauschale matching hand-calculated values (§6)', () => {
    const rate = abgeltungsteuerCombinedRate('none'); // 0.26375
    const basiszins = 0.0253; // 2.53%

    // Case 1: 100,000 € start, +5,000 € return -> Basisertrag 1,771 €, after 30% TF 1,239.70 €,
    // minus 1,000 € Sparer-Pauschbetrag -> taxable 239.70 €, tax 63.22 €.
    const r1 = computeVorabpauschale(100000, 105000, basiszins, 1, 0.3, 1000, rate);
    expect(r1.basisertrag).toBeCloseTo(1771, 2);
    expect(r1.grossVorabpauschale).toBeCloseTo(1771, 2);
    expect(r1.afterTeilfreistellung).toBeCloseTo(1239.7, 2);
    expect(r1.allowanceUsed).toBeCloseTo(1000, 2);
    expect(r1.taxableVorabpauschale).toBeCloseTo(239.7, 2);
    expect(r1.taxOwed).toBeCloseTo(63.22, 2);

    // Case 2: actual gain +800 € (< Basisertrag 1,771 €) -> Vorabpauschale capped at 800 €.
    const r2 = computeVorabpauschale(100000, 100800, basiszins, 1, 0.3, 1000, rate);
    expect(r2.grossVorabpauschale).toBeCloseTo(800, 2);
    expect(r2.afterTeilfreistellung).toBeCloseTo(560, 2);
    expect(r2.taxOwed).toBeCloseTo(0, 2); // covered by 1,000 € Pauschbetrag

    // Case 3: negative return -> Vorabpauschale = 0.
    const r3 = computeVorabpauschale(100000, 95000, basiszins, 1, 0.3, 1000, rate);
    expect(r3.grossVorabpauschale).toBe(0);
    expect(r3.taxOwed).toBe(0);

    // Case 4: Basiszins <= 0 -> Vorabpauschale = 0.
    const r4 = computeVorabpauschale(100000, 105000, -0.0045, 1, 0.3, 1000, rate);
    expect(r4.grossVorabpauschale).toBe(0);
    expect(r4.taxOwed).toBe(0);
  });

  it('deducts accumulated gross Vorabpauschale from capital gains upon sale and exempts end-of-year contributions in their first year', () => {
    const depot = new GermanBrokerageContainer({ kirchensteuer: 'none', filingStatus: 'single' });
    // Year 0: only an end-of-year contribution of 100,000 € (start value was 0 -> no Vorabpauschale in year 0)
    depot.startNewTaxYear(1);
    const v0 = depot.applyReturnAndVorabpauschale(0.05, 0.0253, equityProfile);
    expect(v0.grossVorabpauschale).toBe(0);
    depot.addContribution(100000);
    expect(depot.portfolioValue).toBeCloseTo(100000, 2);

    // Year 1: 100,000 € grows by +5% (+5,000 €); Vorabpauschale = 1,771 € gross, tax = 63.22 € deducted from portfolio
    depot.startNewTaxYear(1);
    const v1 = depot.applyReturnAndVorabpauschale(0.05, 0.0253, equityProfile);
    expect(v1.grossVorabpauschale).toBeCloseTo(1771, 2);
    expect(v1.taxOwed).toBeCloseTo(63.22, 2);
    expect(depot.accumulatedVorabpauschale).toBeCloseTo(1771, 2);
    expect(depot.portfolioValue).toBeCloseTo(105000 - 63.220875, 4);

    // Year 2: sell entire portfolio at start of year (no further return, fresh 1,000 € Sparer-Pauschbetrag)
    depot.startNewTaxYear(1);
    const totalVal = depot.portfolioValue;
    const sale = depot.withdrawGross(totalVal, equityProfile);
    // Economic gain on remaining portfolio is (totalVal - 100,000), minus gross Vorabpauschale 1,771 €
    const expectedGain = totalVal - 100000 - 1771;
    expect(sale.capitalGains).toBeCloseTo(expectedGain, 2);
    const expectedTax = (expectedGain * 0.7 - 1000) * abgeltungsteuerCombinedRate('none');
    expect(sale.taxesOwed).toBeCloseTo(expectedTax, 2);
    expect(depot.portfolioValue).toBeCloseTo(0, 6);
    expect(depot.accumulatedVorabpauschale).toBeCloseTo(0, 6);
  });

  it('computes weighted Teilfreistellung and exempts Gold/Commodities ETCs from Vorabpauschale', () => {
    const assets: Asset[] = [
      { name: 'Stocks', allocation: 60, ter: 0.2, return: 7, volatility: 15, min_return: -35, max_return: 40 },
      { name: 'Gold', allocation: 40, ter: 0.2, return: 4, volatility: 12, min_return: -25, max_return: 30 },
    ];
    const prof = computePortfolioTaxProfile(assets);
    // Portfolio TF: 60% * 30% + 40% * 0% = 18%
    expect(prof.weightedTeilfreistellung).toBeCloseTo(0.18, 6);
    // Fund share: only Stocks (60%) is an InvStG fund; Gold (40%) is an ETC
    expect(prof.fundShare).toBeCloseTo(0.6, 6);
    // On the fund share itself (100% Stocks), TF is 30%
    expect(prof.fundTeilfreistellung).toBeCloseTo(0.3, 6);
  });

  it('gross-up inverts net withdrawal accurately (proportional and FIFO) and handles portfolio exhaustion & losses', () => {
    // Closed-form vs bisection check
    const g = grossUpPiecewiseLinear(10000, 100000, 0.35, 1000, 0.26375);
    const gBis = grossUpBisection(
      10000,
      100000,
      (x) => x - Math.max(0, x * 0.35 - 1000) * 0.26375,
    );
    expect(g).toBeCloseTo(gBis, 3);

    // Proportional container gross-up: net(withdrawNet(N)) === N
    const depot = new GermanBrokerageContainer({ kirchensteuer: 'none', filingStatus: 'single' });
    depot.addContribution(100000);
    depot.applyReturnAndVorabpauschale(1.0, 0, equityProfile); // doubles to 200,000 €
    depot.startNewTaxYear(1);
    const w = depot.withdrawNet(12000, equityProfile);
    expect(w.netWithdrawal).toBeCloseTo(12000, 2);
    expect(w.grossWithdrawal).toBeGreaterThan(12000);

    // FIFO container gross-up: net(withdrawNet(N)) === N
    const fifo = new GermanBrokerageContainer({ kirchensteuer: 'none', filingStatus: 'single', useFifo: true });
    fifo.addContribution(50000);
    fifo.applyReturnAndVorabpauschale(0.5, 0, equityProfile); // lot 0: 75k (basis 50k)
    fifo.addContribution(50000); // lot 1: 50k (basis 50k)
    fifo.startNewTaxYear(1);
    const wf = fifo.withdrawNet(20000, equityProfile);
    expect(wf.netWithdrawal).toBeCloseTo(20000, 2);

    // Loss scenario: portfolio below cost basis -> 0 tax, gross === net
    const lossDepot = new GermanBrokerageContainer();
    lossDepot.addContribution(50000);
    lossDepot.applyReturnAndVorabpauschale(-0.2, 0.0253, equityProfile); // 40,000 €
    lossDepot.startNewTaxYear(1);
    const wl = lossDepot.withdrawNet(5000, equityProfile);
    expect(wl.taxesOwed).toBe(0);
    expect(wl.grossWithdrawal).toBeCloseTo(5000, 2);
    expect(wl.netWithdrawal).toBeCloseTo(5000, 2);

    // Exhaustion scenario: targetNet > portfolioValue -> withdraws all remaining value
    const we = lossDepot.withdrawNet(100000, equityProfile);
    expect(we.grossWithdrawal).toBeCloseTo(35000, 2);
    expect(lossDepot.portfolioValue).toBeCloseTo(0, 6);
  });

  it('runs 10,000 simulations with German tax regime within performance budget', () => {
    const stocks: Asset = {
      name: 'Stocks',
      allocation: 100,
      ter: 0.2,
      return: 7.5,
      volatility: 14.6,
      min_return: -37,
      max_return: 45,
    };
    const params: SimulationParams = {
      ...DEFAULT_PARAMS,
      taxCountry: 'de',
      nSimulations: 10000,
      yearsToRetirement: 30,
      yearsRetired: 25,
    };
    const t0 = performance.now();
    const res = runSimulation({
      params,
      accumulationAssets: [stocks],
      retirementAssets: [stocks],
      correlation: null,
      seed: 123,
    });
    const elapsedMs = performance.now() - t0;
    expect(res.final.length).toBe(10000);
    expect(res.taxAnalysis.totalTaxes.mean).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(500);
  });
});

