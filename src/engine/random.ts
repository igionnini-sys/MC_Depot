/**
 * Seedable PRNG (xoshiro128**) + standard normal sampler and the small amount of
 * linear algebra needed to draw correlated normals (replaces numpy.random).
 */

export type Rng = () => number;

function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let z = a;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

/** Uniform in [0, 1). */
export function createRng(seed: number = (Math.random() * 2 ** 32) >>> 0): Rng {
  const sm = splitmix32(seed);
  let s0 = sm(), s1 = sm(), s2 = sm(), s3 = sm();
  return () => {
    const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (s1 << 9) >>> 0;
    s2 ^= s0; s3 ^= s1; s1 ^= s2; s0 ^= s3;
    s2 ^= t;
    s3 = rotl(s3, 11);
    return result / 4294967296;
  };
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** Standard normal sampler (Box-Muller, caches the second value). */
export function createNormal(rng: Rng): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u = 0;
    while (u === 0) u = rng();
    const v = rng();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
}

/** Symmetric eigen-decomposition (cyclic Jacobi). Fine for the <= 8x8 matrices used here. */
export function symmetricEigen(A: number[][]): { values: number[]; vectors: number[][] } {
  const n = A.length;
  const a = A.map((r) => r.slice());
  const v: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
    if (off < 1e-20) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p], vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: a.map((r, i) => r[i]), vectors: v };
}

export function isPositiveSemiDefinite(A: number[][]): boolean {
  return symmetricEigen(A).values.every((x) => x >= -1e-8);
}

/** Clip negative eigenvalues and renormalise the diagonal to 1 (as the Python version). */
export function nearestCorrelationMatrix(A: number[][]): number[][] {
  const n = A.length;
  const { values, vectors } = symmetricEigen(A);
  const clipped = values.map((x) => Math.max(x, 1e-8));
  const r = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      let s = 0;
      for (let k = 0; k < n; k++) s += vectors[i][k] * clipped[k] * vectors[j][k];
      return s;
    }),
  );
  const d = r.map((row, i) => Math.sqrt(row[i]));
  return r.map((row, i) => row.map((x, j) => x / (d[i] * d[j])));
}

/**
 * Factor M (PSD) as L * L^T. Uses Cholesky when possible, otherwise the
 * eigen square root, so semi-definite matrices (e.g. zero-volatility assets) work
 * like numpy's SVD-based multivariate_normal.
 */
export function psdFactor(M: number[][]): number[][] {
  const n = M.length;
  const L = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  let ok = true;
  for (let i = 0; i < n && ok; i++) {
    for (let j = 0; j <= i; j++) {
      let s = M[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (s <= 1e-14) { ok = false; break; }
        L[i][i] = Math.sqrt(s);
      } else {
        L[i][j] = s / L[j][j];
      }
    }
  }
  if (ok) return L;
  const { values, vectors } = symmetricEigen(M);
  return vectors.map((row) => row.map((x, k) => x * Math.sqrt(Math.max(values[k], 0))));
}
