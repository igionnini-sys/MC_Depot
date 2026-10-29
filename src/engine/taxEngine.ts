/**
 * Capital-gains tax engine (port of tax_engine.py).
 * Every contribution is a tax lot; returns grow lot values while the cost basis
 * stays fixed; withdrawals are taken proportionally from every lot and only the
 * positive gain of each lot is taxed.
 */

export interface WithdrawalResult {
  grossWithdrawal: number;
  netWithdrawal: number;
  capitalGains: number;
  taxesOwed: number;
  costBasisSold: number;
}

const EMPTY: WithdrawalResult = { grossWithdrawal: 0, netWithdrawal: 0, capitalGains: 0, taxesOwed: 0, costBasisSold: 0 };

export class TaxEngine {
  private readonly rate: number;
  private amount: Float64Array;
  private basis: Float64Array;
  private count = 0;
  totalContributions = 0;
  totalWithdrawals = 0;
  totalTaxesPaid = 0;
  totalCapitalGainsRealized = 0;

  /** @param capitalGainsTaxRate in % (26 = 26%). @param capacity expected number of lots. */
  constructor(capitalGainsTaxRate: number, capacity = 64) {
    this.rate = capitalGainsTaxRate / 100;
    this.amount = new Float64Array(capacity);
    this.basis = new Float64Array(capacity);
  }

  addContribution(amount: number): void {
    if (amount <= 0) return;
    if (this.count === this.amount.length) {
      const grow = (a: Float64Array) => { const b = new Float64Array(a.length * 2); b.set(a); return b; };
      this.amount = grow(this.amount);
      this.basis = grow(this.basis);
    }
    this.amount[this.count] = amount;
    this.basis[this.count] = amount;
    this.count++;
    this.totalContributions += amount;
  }

  applyReturns(annualReturn: number): void {
    const f = 1 + annualReturn;
    for (let i = 0; i < this.count; i++) if (this.amount[i] > 0) this.amount[i] *= f;
  }

  get portfolioValue(): number {
    let s = 0;
    for (let i = 0; i < this.count; i++) s += this.amount[i];
    return s;
  }

  withdraw(requested: number): WithdrawalResult {
    if (requested <= 0) return EMPTY;
    const total = this.portfolioValue;
    if (total <= 0) return EMPTY;
    const target = Math.min(requested, total);

    let gains = 0, basisSold = 0, withdrawn = 0;
    for (let i = 0; i < this.count; i++) {
      const rem = this.amount[i];
      if (rem <= 0) continue;
      if (withdrawn >= target) break;
      const lotW = Math.min(target * (rem / total), rem, target - withdrawn);
      if (lotW <= 0) continue;
      const ratio = Math.min(1, lotW / rem);
      const w = rem * ratio;
      const b = this.basis[i] * ratio;
      this.amount[i] -= w;
      this.basis[i] -= b;
      withdrawn += w;
      basisSold += b;
      gains += Math.max(0, w - b);
    }

    const taxes = gains * this.rate;
    this.totalWithdrawals += withdrawn;
    this.totalTaxesPaid += taxes;
    this.totalCapitalGainsRealized += gains;
    return {
      grossWithdrawal: withdrawn,
      netWithdrawal: Math.max(0, withdrawn - taxes),
      capitalGains: gains,
      taxesOwed: taxes,
      costBasisSold: basisSold,
    };
  }
}
