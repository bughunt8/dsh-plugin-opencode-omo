// Paired statistical tests for the two-harness comparison.
// All functions consume ALIGNED arrays (same task order / same repeat index).
// Binary results: McNemar + exact binomial + permutation + paired bootstrap CI.
// Continuous results: paired t, Wilcoxon signed-rank (normal approximation for
// n>25), Hodges-Lehmann median shift, and bootstrap CI.
// Equivalence: TOST with a predeclared margin, using the paired bootstrap 90% CI.

export function pairedCounts(a, b) {
  const n = Math.min(a.length, b.length)
  let both = 0
  let neither = 0
  let aOnly = 0
  let bOnly = 0
  for (let index = 0; index < n; index += 1) {
    const passA = a[index] === true || a[index] === 1
    const passB = b[index] === true || b[index] === 1
    if (passA && passB) both += 1
    else if (!passA && !passB) neither += 1
    else if (passA) aOnly += 1
    else bOnly += 1
  }
  return { n, both, neither, aOnly, bOnly, discordant: aOnly + bOnly }
}

function binomialPmf(n, p, k) {
  let coefficient = 1
  for (let index = 1; index <= k; index += 1) coefficient *= (n - k + index) / index
  return coefficient * (p ** k) * ((1 - p) ** (n - k))
}

function binomialCdf(n, p, k) {
  let total = 0
  for (let index = 0; index <= k; index += 1) total += binomialPmf(n, p, index)
  return total
}

/** Two-sided exact binomial p for b+c discordant pairs under p=0.5. */
export function exactBinomialP(a, b) {
  const { aOnly, bOnly, discordant } = pairedCounts(a, b)
  if (discordant === 0) return 1
  const observed = Math.max(aOnly, bOnly)
  const pLess = binomialCdf(discordant, 0.5, discordant - observed)
  const pGreater = observed === 0 ? 1 : 1 - binomialCdf(discordant, 0.5, observed - 1)
  return Math.min(1, pLess + pGreater)
}

/** McNemar chi-square p (continuity corrected). */
export function mcnemarP(a, b) {
  const { aOnly, bOnly, discordant } = pairedCounts(a, b)
  if (discordant === 0) return 1
  const corrected = (Math.abs(aOnly - bOnly) - 1) ** 2 / discordant
  return chiSquareSurvival(corrected, 1)
}

/** Upper-tail survival for chi-square with df degrees of freedom (df<=10). */
export function chiSquareSurvival(x, df) {
  if (x <= 0) return 1
  const k = df / 2
  const gamma = (z) => {
    if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z))
    const g = 7
    const c = [0.9999999999998099, 676.5203681218851, -1259.1392167224028,
      771.3234287776531, -176.6150291621406, 12.5073432786869,
      -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7]
    let x = z - 1
    let a = c[0]
    const t = x + g + 0.5
    for (let i = 1; i < g + 1; i += 1) a += c[i] / (x + i)
    return Math.sqrt(2 * Math.PI) * (t ** (x + 0.5)) * Math.exp(-t) * a
  }
  const numerator = 1 - regularizedGammaP(k, x / 2)
  return numerator
  function regularizedGammaP(s, x) {
    if (x === 0) return 0
    let sum = 1 / s
    let term = 1 / s
    for (let n = 1; n < 200; n += 1) {
      term *= x / (s + n)
      sum += term
      if (Math.abs(term) < 1e-15 * Math.abs(sum)) break
    }
    return (x ** s) * Math.exp(-x) * sum / gamma(s)
  }
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function sd(values) {
  if (values.length < 2) return 0
  const m = mean(values)
  return Math.sqrt(values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1))
}

function quantile(sorted, q) {
  if (sorted.length === 0) return null
  if (sorted.length === 1) return sorted[0]
  const position = q * (sorted.length - 1)
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

/** Paired difference bootstrap (resample task indices with replacement). */
export function pairedBootstrap(diff, draws = 10000) {
  const n = diff.length
  if (n === 0) return { mean: null, ci: [null, null], ci90: [null, null] }
  const means = new Array(draws)
  for (let draw = 0; draw < draws; draw += 1) {
    let sum = 0
    for (let index = 0; index < n; index += 1) {
      sum += diff[Math.floor(Math.random() * n)]
    }
    means[draw] = sum / n
  }
  means.sort((x, y) => x - y)
  return {
    mean: mean(diff),
    ci: [quantile(means, 0.025), quantile(means, 0.975)],
    ci90: [quantile(means, 0.05), quantile(means, 0.95)],
    draws,
  }
}

function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2))
  function erf(x) {
    const sign = x < 0 ? -1 : 1
    const ax = Math.abs(x)
    const t = 1 / (1 + 0.3275911 * ax)
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax)
    return sign * y
  }
}

function tDistributionP(t, df) {
  // Two-sided p via incomplete beta approximation (Abramowitz & Stegun 26.7.1).
  const x = df / (df + t * t)
  const ib = regularizedBeta(0.5 * df, 0.5, x)
  return ib
  function logGamma(z) {
    const g = 7
    const c = [0.9999999999998099, 676.5203681218851, -1259.1392167224028,
      771.3234287776531, -176.6150291621406, 12.5073432786869,
      -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7]
    let x = z - 1
    let a = c[0]
    const t = x + g + 0.5
    for (let i = 1; i < g + 1; i += 1) a += c[i] / (x + i)
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
  }
  function regularizedBeta(a, b, x) {
    if (x <= 0) return 0
    if (x >= 1) return 1
    const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x))
    const symmetry = x < (a + 1) / (a + b + 2)
    return symmetry
      ? bt * betaCF(a, b, x) / a
      : 1 - bt * betaCF(b, a, 1 - x) / b
  }
  function betaCF(a, b, x) {
    const max = 200
    const eps = 3e-14
    const qab = a + b
    const qap = a + 1
    const qam = a - 1
    let c = 1
    let d = 1 - qab * x / qap
    if (Math.abs(d) < eps) d = eps
    d = 1 / d
    let h = d
    for (let m = 1; m <= max; m += 1) {
      const m2 = 2 * m
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2))
      d = 1 + aa * d
      if (Math.abs(d) < eps) d = eps
      c = 1 + aa / c
      if (Math.abs(c) < eps) c = eps
      d = 1 / d
      h *= d * c
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
      d = 1 + aa * d
      if (Math.abs(d) < eps) d = eps
      c = 1 + aa / c
      if (Math.abs(c) < eps) c = eps
      d = 1 / d
      const del = d * c
      h *= del
      if (Math.abs(del - 1) < eps) break
    }
    return h
  }
}

/** Paired t-test: returns t, df, two-sided p, cohen's dz. */
export function pairedT(diff) {
  const n = diff.length
  if (n < 2) return { t: null, df: 0, p: null, cohenDz: null, meanDiff: mean(diff), sdDiff: 0 }
  const m = mean(diff)
  const s = sd(diff)
  const se = s / Math.sqrt(n)
  const t = se === 0 ? 0 : m / se
  const p = se === 0 ? (m === 0 ? 1 : 0) : tDistributionP(Math.abs(t), n - 1)
  return { t, df: n - 1, p, cohenDz: s === 0 ? 0 : m / s, meanDiff: m, sdDiff: s }
}

/** Wilcoxon signed-rank (normal approximation for n>25; exact-ish enumeration skipped for large n). */
export function wilcoxonSignedRank(diff) {
  const nonzero = diff.filter(value => value !== 0)
  const n = nonzero.length
  if (n === 0) return { statistic: 0, p: 1, n: 0, hodgesLehmann: 0 }
  const signed = nonzero.map((value, index) => ({ value, sign: Math.sign(value), index }))
  signed.sort((a, b) => Math.abs(a.value) - Math.abs(b.value))
  let statistic = 0
  signed.forEach((entry, rankIndex) => {
    if (entry.sign > 0) statistic += rankIndex + 1
  })
  const expected = n * (n + 1) / 4
  const variance = n * (n + 1) * (2 * n + 1) / 24
  const z = variance === 0 ? 0 : (statistic - expected) / Math.sqrt(variance)
  const p = n <= 25
    ? wilcoxonExactP(n, statistic)
    : 2 * (1 - normalCdf(Math.abs(z)))
  return { statistic, z, p, n, hodgesLehmann: hodgesLehmann(diff) }
}

function wilcoxonExactP(n, statistic) {
  // Enumerates sign assignments only for small n.
  const total = 2 ** n
  let count = 0
  const max = n * (n + 1) / 2
  for (let mask = 0; mask < total; mask += 1) {
    let sum = 0
    for (let bit = 0; bit < n; bit += 1) if ((mask >> bit) & 1) sum += bit + 1
    if (Math.abs(sum - max / 2) >= Math.abs(statistic - max / 2)) count += 1
  }
  return count / total
}

/** Hodges-Lehmann median of all pairwise averages. */
export function hodgesLehmann(diff) {
  if (diff.length === 0) return null
  const values = []
  for (let i = 0; i < diff.length; i += 1) {
    for (let j = i; j < diff.length; j += 1) values.push((diff[i] + diff[j]) / 2)
  }
  values.sort((a, b) => a - b)
  return values.length % 2 === 1
    ? values[(values.length - 1) / 2]
    : (values[values.length / 2 - 1] + values[values.length / 2]) / 2
}

/** TOST decision using the paired bootstrap 90% CI and a declared margin. */
export function tost(diff, margin, draws = 10000) {
  const bootstrap = pairedBootstrap(diff, draws)
  const [low, high] = bootstrap.ci90
  const equivalent = low !== null && high !== null && low > -margin && high < margin
  return { margin, ci90: bootstrap.ci90, equivalent, meanDiff: bootstrap.mean }
}

/** One-line binary comparison summary. */
export function binaryComparison(a, b, { draws = 10000, equivalenceMargin = 0.05 } = {}) {
  const counts = pairedCounts(a, b)
  const diff = a.map((pass, index) => (pass ? 1 : 0) - (b[index] ? 1 : 0))
  const bootstrap = pairedBootstrap(diff, draws)
  return {
    counts,
    rates: { a: mean(a.map(x => x ? 1 : 0)), b: mean(b.map(x => x ? 1 : 0)) },
    meanDiff: bootstrap.mean,
    ci95: bootstrap.ci,
    mcnemarP: mcnemarP(a, b),
    exactBinomialP: exactBinomialP(a, b),
    tost: tost(diff, equivalenceMargin, draws),
  }
}

/** One-line continuous comparison summary. */
export function continuousComparison(a, b, { draws = 10000, equivalenceMargin } = {}) {
  const diff = a.map((value, index) => value - b[index])
  const t = pairedT(diff)
  const wilcoxon = wilcoxonSignedRank(diff)
  const bootstrap = pairedBootstrap(diff, draws)
  return {
    n: diff.length,
    meanA: mean(a),
    meanB: mean(b),
    meanDiff: bootstrap.mean,
    ci95: bootstrap.ci,
    pairedT: t,
    wilcoxon,
    ...(equivalenceMargin === undefined ? {} : { tost: tost(diff, equivalenceMargin, draws) }),
  }
}
