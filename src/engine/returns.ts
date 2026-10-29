/** Fit a censored normal so the *emitted* annual return has the requested moments.
 * Simply clipping N(mean, sd) biases both moments, especially for cash and REITs.
 * Units are arbitrary, provided all four inputs use the same units.
 */
function cdf(x: number): number {
  // Abramowitz–Stegun 7.1.26; absolute error below 1.5e-7.
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const density = Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  const tail = density * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - tail : tail;
}

/** Moments after clipping N(mu, sigma) to [0, 1]. */
function moments(mu: number, sigma: number): { mean: number; variance: number } {
  const a = -mu / sigma, b = (1 - mu) / sigma;
  const pa = Math.exp(-a * a / 2) / Math.sqrt(2 * Math.PI);
  const pb = Math.exp(-b * b / 2) / Math.sqrt(2 * Math.PI);
  const mass = cdf(b) - cdf(a), upper = 1 - cdf(b);
  const mean = mu * mass + sigma * (pa - pb) + upper;
  const second = (mu * mu + sigma * sigma) * mass
    + 2 * mu * sigma * (pa - pb) + sigma * sigma * (a * pa - b * pb) + upper;
  return { mean, variance: Math.max(0, second - mean * mean) };
}

export function fitCensoredNormal(mean: number, sd: number, lower: number, upper: number): { mean: number; sd: number } {
  const unchanged = { mean, sd };
  const width = upper - lower;
  if (![mean, sd, lower, upper].every(Number.isFinite) || width <= 0 || sd <= 0) return unchanged;
  const target = (mean - lower) / width, variance = (sd / width) ** 2;
  // Infeasible user combinations retain the legacy clipped-normal behaviour.
  // For any bounded variable, variance <= (mean-lower)*(upper-mean).
  if (target <= 0 || target >= 1 || variance >= target * (1 - target)) return unchanged;
  // Far-away bounds have no material effect; preserve the usual normal exactly.
  if (mean - 8 * sd >= lower && mean + 8 * sd <= upper) return unchanged;
  const meanForSigma = (sigma: number): number => {
    let lo = -10 * sigma, hi = 1 + 10 * sigma;
    for (let i = 0; i < 48; i++) {
      const mid = (lo + hi) / 2;
      if (moments(mid, sigma).mean < target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  let lo = sd / width, hi = lo;
  while (moments(meanForSigma(hi), hi).variance < variance && hi < 64) hi *= 2;
  if (hi >= 64) return unchanged;
  for (let i = 0; i < 44; i++) {
    const sigma = (lo + hi) / 2;
    if (moments(meanForSigma(sigma), sigma).variance < variance) lo = sigma; else hi = sigma;
  }
  const sigma = (lo + hi) / 2;
  return { mean: lower + width * meanForSigma(sigma), sd: width * sigma };
}
