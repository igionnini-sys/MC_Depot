// Offline, reproducible calibration. The source snapshot includes provenance and FX.
// Run: node scripts/calibrate-assets.mjs [--check]
import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync(new URL('../src/config/historical_returns.json', import.meta.url)));
const assumptions = JSON.parse(fs.readFileSync(new URL('../src/config/planning_assumptions.json', import.meta.url)));
const configUrl = new URL('../src/config/enhanced_config.json', import.meta.url);
const config = JSON.parse(fs.readFileSync(configUrl));
const original = JSON.stringify(config);
const names = Object.keys(data.benchmarks);
const series = Object.fromEntries(names.map((name) => [name, data.annual.map((row) => row.returns[name])]));
const mean = (x) => x.reduce((s, v) => s + v, 0) / x.length;
const round = (x) => Math.round(x * 1e6) / 1e6;
const covariance = (x, y) => {
  const mx = mean(x), my = mean(y);
  return x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0) / (x.length - 1);
};
const sd = (x) => Math.sqrt(covariance(x, x));
const summary = [];
for (const name of names) {
  const x = series[name];
  if (x.length !== data.period.observations || x.some((v) => !Number.isFinite(v))) throw new Error(`Invalid series: ${name}`);
  if (!assumptions[name]) throw new Error(`Missing planning assumptions: ${name}`);
  config.asset_characteristics[name] = assumptions[name];
  summary.push({ asset: name, ...assumptions[name], historicalMean: round(mean(x)), historicalVolatility: round(sd(x)) });
}
const matrix = config.correlation_matrix.assets.map((a) => config.correlation_matrix.assets.map((b) =>
  a === b ? 1 : a in series && b in series ? round(covariance(series[a], series[b]) / (sd(series[a]) * sd(series[b]))) : 0,
));
config.correlation_matrix.description = 'Pearson correlations of annual nominal EUR returns, 2008–2024. REIT series joins gross and net index returns. Custom assets use zero placeholders.';
config.correlation_matrix.matrix = matrix;
config.correlation_scenarios.normal_times.description = config.correlation_matrix.description;
config.correlation_scenarios.normal_times.matrix = matrix;
config.correlation_metadata = {
  data_sources: data.sources.map((s) => s.url),
  last_updated: '2026-10-29',
  update_frequency: 'manual_snapshot',
  methodology: 'Annual EUR Pearson correlation, 2008–2024, with mixed gross/net European property index series; estimates are uncertain. Other regimes are hypothetical; clipping changes realised correlations.',
  validation_checks: ['positive_semi_definite', 'symmetric_matrix', 'unit_diagonal', 'correlation_bounds'],
  scenarios_explanation: {
    normal_times: '2008–2024 annual EUR correlations, including crisis years; REIT gross/net series joined.',
    crisis_times: 'Hypothetical stress scenario; not a statistical estimate of a specified crisis sample.',
    independent: 'Theoretical zero-correlation scenario.',
    defensive: 'Hypothetical defensive scenario.',
    high_inflation: 'Hypothetical inflation scenario.',
  },
};
if (process.argv.includes('--check')) {
  if (JSON.stringify(config) !== original) throw new Error('Calibration is stale: run node scripts/calibrate-assets.mjs');
} else {
  const formatted = JSON.stringify(config, null, 2)
    .replace(/\[\n\s+-?[\d.]+(?:,\n\s+-?[\d.]+)*\n\s*\]/g, (s) => `[${JSON.parse(s).join(', ')}]`)
    .replace(/\{\n\s+"name": "[^"]+",\n\s+"allocation": [\d.]+,\n\s+"ter": [\d.]+\n\s*\}/g,
      (s) => `{ ${Object.entries(JSON.parse(s)).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')} }`);
  fs.writeFileSync(configUrl, formatted + '\n');
}
console.table(summary);
