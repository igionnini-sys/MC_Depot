/**
 * Gross-up utilities: given a desired net withdrawal N, find the gross withdrawal G
 * such that net(G) = N, clamped to the available portfolio value `maxGross`.
 * Pure functions with zero heap allocations for use inside the Monte Carlo hot loop.
 */

/**
 * Closed-form gross-up for proportional capital-gains taxation with a remaining tax-free allowance:
 *   tax(G) = max(0, G * effectiveGainRatio - allowanceRemaining) * taxRate
 *   net(G) = G - tax(G)
 *
 * @param targetNet Desired net amount after tax (€).
 * @param maxGross Maximum available portfolio value (€).
 * @param effectiveGainRatio Taxable gain per € withdrawn after Teilfreistellung, in [0, 1].
 * @param allowanceRemaining Remaining annual tax-free allowance (e.g. Sparer-Pauschbetrag) in €.
 * @param taxRate Combined tax rate on taxable gains, in [0, 1).
 */
export function grossUpPiecewiseLinear(
  targetNet: number,
  maxGross: number,
  effectiveGainRatio: number,
  allowanceRemaining: number,
  taxRate: number,
): number {
  if (targetNet <= 0 || maxGross <= 0) return 0;
  const k = Math.max(0, Math.min(1, effectiveGainRatio));
  const r = Math.max(0, taxRate);
  const allow = Math.max(0, allowanceRemaining);

  if (k <= 0 || r <= 0 || targetNet * k <= allow) {
    return Math.min(targetNet, maxGross);
  }

  const denom = 1 - k * r;
  if (denom <= 0) return maxGross;
  const gross = (targetNet - allow * r) / denom;
  return Math.min(Math.max(targetNet, gross), maxGross);
}

/**
 * Numerical gross-up by bisection for arbitrary monotonic `netFromGross(G)` functions
 * (FIFO lot queues or progressive income tax brackets).
 * If even withdrawing `maxGross` yields less than `targetNet`, returns `maxGross`.
 */
export function grossUpBisection(
  targetNet: number,
  maxGross: number,
  netFromGross: (gross: number) => number,
  iterations = 28,
): number {
  if (targetNet <= 0 || maxGross <= 0) return 0;
  if (netFromGross(maxGross) <= targetNet) return maxGross;
  if (netFromGross(targetNet) >= targetNet) return Math.min(targetNet, maxGross);

  let lo = targetNet;
  let hi = maxGross;
  for (let i = 0; i < iterations; i++) {
    const mid = 0.5 * (lo + hi);
    const net = netFromGross(mid);
    if (Math.abs(net - targetNet) <= 1e-4) return mid;
    if (net < targetNet) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return 0.5 * (lo + hi);
}

