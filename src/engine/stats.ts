/** Statistics helpers matching numpy semantics (percentile = linear interpolation). */

type Num = ArrayLike<number>;

export function sorted(values: Num): Float64Array {
  return Float64Array.from(values as ArrayLike<number>).sort();
}

/** numpy.percentile(values, p) with the default 'linear' method; `s` must be sorted. */
export function percentileSorted(s: Num, p: number): number {
  const n = s.length;
  if (n === 0) return 0;
  const rank = (p / 100) * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.min(lo + 1, n - 1);
  return s[lo] + (s[hi] - s[lo]) * (rank - lo);
}

export function percentile(values: Num, p: number): number {
  return percentileSorted(sorted(values), p);
}

export function mean(values: Num): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < values.length; i++) s += values[i];
  return s / values.length;
}

/** Population standard deviation (numpy default ddof=0). */
export function std(values: Num): number {
  const m = mean(values);
  let s = 0;
  for (let i = 0; i < values.length; i++) s += (values[i] - m) ** 2;
  return values.length ? Math.sqrt(s / values.length) : 0;
}

export function min(values: Num): number {
  let m = Infinity;
  for (let i = 0; i < values.length; i++) if (values[i] < m) m = values[i];
  return m;
}

export function max(values: Num): number {
  let m = -Infinity;
  for (let i = 0; i < values.length; i++) if (values[i] > m) m = values[i];
  return m;
}

/** Pearson correlation (numpy.corrcoef(x, y)[0, 1]). */
export function corrcoef(x: Num, y: Num): number {
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}

export interface PercentileStats {
  mean: number;
  median: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
}

export function percentileStats(values: Num): PercentileStats {
  const s = sorted(values);
  return {
    mean: mean(s),
    median: percentileSorted(s, 50),
    p10: percentileSorted(s, 10),
    p25: percentileSorted(s, 25),
    p75: percentileSorted(s, 75),
    p90: percentileSorted(s, 90),
  };
}

/** Value at Risk: the (1 - confidence) percentile of the outcome distribution. */
export function valueAtRisk(values: Num, confidence = 0.95): number {
  if (values.length === 0) return 0;
  return percentile(values, (1 - confidence) * 100);
}

/** Conditional VaR: mean of outcomes at or below VaR. */
export function conditionalVaR(values: Num, confidence = 0.95): number {
  if (values.length === 0) return 0;
  const v = valueAtRisk(values, confidence);
  let s = 0, n = 0;
  for (let i = 0; i < values.length; i++) if (values[i] <= v) { s += values[i]; n++; }
  return n > 0 ? s / n : v;
}

export function cagr(finalValue: number, initialValue: number, years: number): number {
  if (initialValue <= 0 || finalValue <= 0 || years <= 0) return 0;
  return ((finalValue / initialValue) ** (1 / years) - 1) * 100;
}

/** Share of values strictly below a threshold, in %. */
export function probabilityBelow(values: Num, threshold: number): number {
  if (values.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < values.length; i++) if (values[i] < threshold) n++;
  return (n / values.length) * 100;
}

/**
 * Total amount deposited during accumulation.
 * `inflation` is in % (2.5). Note: the Streamlit version divided by 100 twice;
 * fixed here, see PROGRESS.md "Differenze rispetto all'originale".
 */
export function totalDeposited(
  initialAmount: number,
  annualContribution: number,
  yearsToRetirement: number,
  adjustForInflation: boolean,
  inflation: number,
): number {
  if (!adjustForInflation) return initialAmount + annualContribution * yearsToRetirement;
  let total = initialAmount;
  let contribution = annualContribution;
  for (let y = 0; y < Math.trunc(yearsToRetirement); y++) {
    total += contribution;
    contribution *= 1 + inflation / 100;
  }
  return total;
}

export interface HistogramBin { x0: number; x1: number; count: number }

/** Equal-width bins over [lo, hi]; pass a shared range to overlay histograms. */
export function histogram(values: Num, bins: number, lo = min(values), hi = max(values)): HistogramBin[] {
  if (!(hi > lo)) hi = lo + 1;
  const w = (hi - lo) / bins;
  const out: HistogramBin[] = Array.from({ length: bins }, (_, i) => ({ x0: lo + i * w, x1: lo + (i + 1) * w, count: 0 }));
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v < lo || v > hi) continue;
    out[Math.min(bins - 1, Math.floor((v - lo) / w))].count++;
  }
  return out;
}

/** 2-D histogram counts [xi][yi] for density heatmaps. */
export function histogram2d(x: Num, y: Num, bins: number) {
  const x0 = min(x), x1 = max(x), y0 = min(y), y1 = max(y);
  const wx = (x1 > x0 ? x1 - x0 : 1) / bins;
  const wy = (y1 > y0 ? y1 - y0 : 1) / bins;
  const cells: [number, number, number][] = [];
  const grid = Array.from({ length: bins }, () => new Array<number>(bins).fill(0));
  for (let i = 0; i < x.length; i++) {
    const xi = Math.min(bins - 1, Math.floor((x[i] - x0) / wx));
    const yi = Math.min(bins - 1, Math.floor((y[i] - y0) / wy));
    grid[xi][yi]++;
  }
  for (let i = 0; i < bins; i++) for (let j = 0; j < bins; j++) if (grid[i][j]) cells.push([i, j, grid[i][j]]);
  return { cells, x0, wx, y0, wy };
}

/** Box-plot five numbers + outliers (1.5 IQR whiskers, as Plotly). */
export function boxStats(values: Num) {
  const s = sorted(values);
  const q1 = percentileSorted(s, 25), q2 = percentileSorted(s, 50), q3 = percentileSorted(s, 75);
  const iqr = q3 - q1;
  const loF = q1 - 1.5 * iqr, hiF = q3 + 1.5 * iqr;
  let lo = q1, hi = q3;
  const outliers: number[] = [];
  for (const v of s) {
    if (v < loF || v > hiF) outliers.push(v);
    else { if (v < lo) lo = v; if (v > hi) hi = v; }
  }
  return { box: [lo, q1, q2, q3, hi] as [number, number, number, number, number], outliers };
}
