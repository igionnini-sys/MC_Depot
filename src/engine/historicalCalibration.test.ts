import { describe, expect, it } from 'vitest';
import data from '../config/historical_returns.json';
import raw from '../config/enhanced_config.json';
import legacy from '../config/legacy_asset_characteristics.json';
import legacy2024 from '../config/legacy_asset_characteristics_2005_2024.json';
import assumptions from '../config/planning_assumptions.json';
import { CORRELATION_ASSETS, DEFAULT_CORRELATION_MATRIX, getProfileData, migrateAssetDefaults, scenarioMatrix } from '../config';
import { initialState, migrateState, DEFAULT_PARAMS } from '../state/store';
import { runSimulation, defaultCorrelationMatrix } from './simulation';
import { createNormal, createRng, isPositiveSemiDefinite } from './random';
import { fitCensoredNormal } from './returns';
import { corrcoef, mean, percentile, std } from './stats';
import type { Asset } from './types';

type HistoricalAsset = keyof typeof data.benchmarks;
const names = Object.keys(data.benchmarks) as HistoricalAsset[];
const defaults = getProfileData('Diversified');
const series = (name: HistoricalAsset) => data.annual.map((row) => row.returns[name]);
const sampleSd = (x: number[]) => std(x) * Math.sqrt(x.length / (x.length - 1));

function simulate(assets: Asset[], years: number, seed: number) {
  return runSimulation({
    params: { ...DEFAULT_PARAMS, nSimulations: 1000, initialAmount: 100, annualContribution: 0,
      yearsToRetirement: years, yearsRetired: 0, inflation: 0, taxCountry: 'simplified', capitalGainsTaxRate: 0 },
    accumulationAssets: assets, retirementAssets: assets,
    correlation: { enabled: true, assets: CORRELATION_ASSETS, matrix: DEFAULT_CORRELATION_MATRIX }, seed,
  });
}

describe('European planning assumptions and historical annual EUR correlations', () => {
  it('has a common, complete window and converts unhedged USD returns using year-end FX', () => {
    expect(data.annual.map((r) => r.year)).toEqual(Array.from({ length: 17 }, (_, i) => 2008 + i));
    for (let i = 0; i < data.annual.length; i++) {
      const row = data.annual[i];
      const previousFx = i ? data.annual[i - 1].usd_per_eur_end : data.fx_start;
      for (const name of ['Gold', 'Commodities'] as const) {
        expect(row.returns[name]).toBeCloseTo(((1 + row.usd_returns[name] / 100) * previousFx / row.usd_per_eur_end - 1) * 100, 5);
      }
      if ('Stocks' in row.usd_returns && row.usd_returns.Stocks !== undefined) {
        expect(row.returns.Stocks).toBeCloseTo(((1 + row.usd_returns.Stocks / 100) * previousFx / row.usd_per_eur_end - 1) * 100, 5);
      }
    }
  });

  it('uses the documented conservative assumptions and bounds that cover the common historical window', () => {
    for (const name of names) {
      const x = series(name), a = raw.asset_characteristics[name];
      expect(a).toEqual(assumptions[name]);
      expect(a.min_return).toBeLessThanOrEqual(Math.min(...x));
      expect(a.max_return).toBeGreaterThanOrEqual(Math.max(...x));
    }
    expect(raw.asset_characteristics.Stocks.return).toBeLessThan(mean(series('Stocks')));
    expect(raw.asset_characteristics.Gold.return).toBeLessThan(mean(series('Gold')));
    expect(raw.asset_characteristics.REIT.return).toBe(4.5);
    expect(raw.asset_characteristics.REIT.return).toBeLessThan(raw.asset_characteristics.Gold.return);
    expect(raw.asset_characteristics.Bond.volatility).toBeLessThan(8);
  });

  it('uses the same valid historical correlation matrix throughout the engine', () => {
    expect(initialState().correlation.enabled).toBe(true);
    expect(scenarioMatrix('normal_times')).toEqual(DEFAULT_CORRELATION_MATRIX);
    expect(defaultCorrelationMatrix(CORRELATION_ASSETS)).toEqual(DEFAULT_CORRELATION_MATRIX);
    expect(isPositiveSemiDefinite(DEFAULT_CORRELATION_MATRIX)).toBe(true);
    for (const a of names) for (const b of names) {
      expect(DEFAULT_CORRELATION_MATRIX[CORRELATION_ASSETS.indexOf(a)][CORRELATION_ASSETS.indexOf(b)])
        .toBeCloseTo(corrcoef(series(a), series(b)), 5);
    }
  });

  for (const [index, name] of names.entries()) {
    it(`${name}: 1,000 annual draws reproduce the requested moments and respect the observed range`, () => {
      const asset = { ...defaults.find((a) => a.name === name)!, allocation: 100, ter: 0 };
      const annual = Array.from(simulate([asset], 1, 42 + index).accumulationNominal, (v) => v - 100);
      // Sampling error: four standard errors for the mean; 12% relative SD tolerance at n=1,000.
      expect(Math.abs(mean(annual) - asset.return)).toBeLessThan(4 * asset.volatility / Math.sqrt(1000));
      expect(Math.abs(std(annual) / asset.volatility - 1)).toBeLessThan(0.12);
      expect(Math.min(...annual)).toBeGreaterThanOrEqual(asset.min_return - 1e-10);
      expect(Math.max(...annual)).toBeLessThanOrEqual(asset.max_return + 1e-10);
    });

    it(`${name}: 1,000 twenty-year paths have a typical CAGR consistent with the conservative assumption`, () => {
      const asset = { ...defaults.find((a) => a.name === name)!, allocation: 100, ter: 0 };
      const cagrs = Array.from(simulate([asset], 20, 72 + index).accumulationNominal, (v) => ((v / 100) ** (1 / 20) - 1) * 100);
      const approximateCagr = asset.return - asset.volatility ** 2 / (200 * (1 + asset.return / 100));
      expect(Math.abs(percentile(cagrs, 50) - approximateCagr)).toBeLessThan(1.5);
      expect(approximateCagr).toBeGreaterThan(percentile(cagrs, 5));
      expect(approximateCagr).toBeLessThan(percentile(cagrs, 95));
    });
  }

  it('reproduces diversified portfolio annual risk instead of assuming independence', () => {
    const assets = defaults.filter((a) => names.includes(a.name as HistoricalAsset)).map((a) => ({ ...a, ter: 0 }));
    const historical = data.annual.map((row) => assets.reduce((s, a) => s + row.returns[a.name as HistoricalAsset] * a.allocation / 100, 0));
    const annual = Array.from(simulate(assets, 1, 128).accumulationNominal, (v) => v - 100);
    const expectedMean = assets.reduce((s, a) => s + a.return * a.allocation / 100, 0);
    expect(Math.abs(mean(annual) - expectedMean)).toBeLessThan(4 * sampleSd(historical) / Math.sqrt(1000));
    expect(Math.abs(std(annual) / sampleSd(historical) - 1)).toBeLessThan(0.12);
  });

  it('subtracts TER once, after drawing gross annual returns', () => {
    const a = { ...defaults[0], allocation: 100, ter: 0 };
    const gross = simulate([a], 1, 31).accumulationNominal;
    const net = simulate([{ ...a, ter: 0.2 }], 1, 31).accumulationNominal;
    for (let i = 0; i < gross.length; i++) expect(gross[i] - net[i]).toBeCloseTo(0.2, 10);
  });

  it('upgrades untouched defaults in both saved phases while preserving TER, allocation and custom assets', () => {
    const old = { ...defaults[0], ...legacy.Stocks, ter: 0.321, allocation: 73 };
    const custom = { ...old, return: 8.123 };
    const base = initialState();
    const saved = migrateState({ ...base, assets: { accumulation: [old, custom], retirement: [old] }, correlation: { enabled: false, scenario: 'independent' } });
    for (const phase of ['accumulation', 'retirement'] as const) {
      expect(saved.assets[phase][0]).toEqual({ ...old, ...raw.asset_characteristics.Stocks });
      expect(saved.assets[phase][0].ter).toBe(0.321);
      expect(saved.assets[phase][0].allocation).toBe(73);
    }
    expect(saved.assets.accumulation[1]).toEqual(custom);
    expect(saved.correlation.enabled).toBe(false);
    expect(migrateAssetDefaults(defaults)).toEqual(defaults);
    const prior = { ...old, ...legacy2024.Stocks };
    expect(migrateAssetDefaults([prior])[0]).toEqual({ ...prior, ...raw.asset_characteristics.Stocks });
    const priorReit = { ...defaults.find((a) => a.name === 'REIT')!, return: 6, ter: 0.42, allocation: 12 };
    expect(migrateAssetDefaults([priorReit])[0]).toEqual({ ...priorReit, return: 4.5 });
    const customReit = { ...priorReit, volatility: 22 };
    expect(migrateAssetDefaults([customReit])[0]).toEqual(customReit);
  });
});

describe('bounded annual return moments', () => {
  it('corrects the severe variance loss from asymmetric cash bounds', () => {
    const a = raw.asset_characteristics.Cash;
    const fitted = fitCensoredNormal(a.return, a.volatility, a.min_return, a.max_return);
    const normal = createNormal(createRng(256));
    const values = Array.from({ length: 100000 }, () => Math.max(a.min_return, Math.min(a.max_return, fitted.mean + fitted.sd * normal())));
    expect(mean(values)).toBeCloseTo(a.return, 1);
    expect(std(values)).toBeCloseTo(a.volatility, 1);
  });

  it('preserves deterministic inputs and handles infeasible user combinations without NaN', () => {
    expect(fitCensoredNormal(5, 0, -10, 10)).toEqual({ mean: 5, sd: 0 });
    expect(fitCensoredNormal(0, 0, 0, 0)).toEqual({ mean: 0, sd: 0 });
    expect(fitCensoredNormal(20, 3, -10, 10)).toEqual({ mean: 20, sd: 3 });
    expect(fitCensoredNormal(0, 30, -10, 10)).toEqual({ mean: 0, sd: 30 });
  });
});
