// Patch docs/exps/2026-08-15-opencode-omo-equivalence-bench.md §6.4 with the
// final MBPP/SWE results produced by the detached eval chain.
//   node apply_final_report.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const report = new URL('../../docs/exps/2026-08-15-opencode-omo-equivalence-bench.md', import.meta.url)
const docsData = new URL('../../docs/exps/.data/', import.meta.url)
mkdirSync(docsData, { recursive: true })
const text = readFileSync(report, 'utf8')

const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
const aaDsh = read('/tmp/aa-mbpp-dsh.json')
const aaOc = read('/tmp/aa-mbpp-oc.json')
const mbpp = read('/tmp/mbpp-exp-results.json')
const swe = read('/tmp/swe-batch-results.json')

const fmt = (value, digits = 3) => value === null || value === undefined ? '–' : Number(value).toFixed(digits)
const pct = (value) => fmt((value ?? 0) * 100, 1) + '%'
const ci = (pair) => pair.ci95?.[0] === null || pair.ci95?.[0] === undefined ? '–' : `[${fmt(pair.ci95[0])}, ${fmt(pair.ci95[1])}]`

const mbppStats = mbpp.stats
const p = mbppStats.passRepeatLevel
const perf = mbppStats.perf
const lines = []
lines.push('### 6.4 最终（MBPP + SWE，2026-08-16）')
lines.push('')
lines.push(`MBPP A/A：dsh ${fmt(aaDsh.passRepeatLevel.counts.n)} 对，通过率 ${pct(aaDsh.passRepeatLevel.rates.a)}/${pct(aaDsh.passRepeatLevel.rates.b)}，自比差异 ${fmt(aaDsh.passRepeatLevel.meanDiff)}；opencode ${fmt(aaOc.passRepeatLevel.counts.n)} 对，通过率 ${pct(aaOc.passRepeatLevel.rates.a)}/${pct(aaOc.passRepeatLevel.rates.b)}，自比差异 ${fmt(aaOc.passRepeatLevel.meanDiff)}。`)
lines.push('')
const margin = mbppStats.config.passEquivalenceMargin ?? 0.10
lines.push(`MBPP 5 题 × 2 轮：dsh ${pct(p.rates.a)}（${p.counts.both + p.counts.aOnly}/${p.counts.n}），opencode ${pct(p.rates.b)}（${p.counts.both + p.counts.bOnly}/${p.counts.n}）；discordant=${p.counts.discordant}，McNemar p=${fmt(p.mcnemarP)}，精确二项 p=${fmt(p.exactBinomialP)}，TOST(±${margin * 100}pp)=${p.tost.equivalent}。轨迹相似度 ${fmt(mbppStats.traceSimilarity.mean)}，平均编辑距离 ${fmt(mbppStats.traceDistance.mean)}，工具数差 ${fmt(mbppStats.toolCountDiffMean)}，Jaccard ${fmt(mbppStats.jaccardMean)}。`)
lines.push('')
lines.push('| 指标 | dsh opencode-omo | opencode+omo | 差异（95% CI） |')
lines.push('|---|---|---|---|')
for (const [name, pair] of [
  ['wall time (ms)', perf.wallMs],
  ['cache read 命中率', perf.cacheReadRatio],
  ['TTFT (ms)', perf.ttftAvgMs],
  ['step 时长 (ms)', perf.stepAvgMs],
  ['bash 工具时长 (ms)', perf.bashAvgMs],
  ['write 工具时长 (ms)', perf.writeAvgMs],
]) {
  lines.push(`| ${name} | ${fmt(pair.meanA, 1)} | ${fmt(pair.meanB, 1)} | ${fmt(pair.meanDiff, 1)} ${ci(pair)} |`)
}
lines.push('')
lines.push('SWE-bench 新实例（独立 venv + FAIL_TO_PASS 复验）：')
lines.push('')
for (const result of swe.results ?? []) {
  lines.push(`- ${result.id}：dsh FAIL_TO_PASS=${result.dshVerified}，opencode=${result.opencodeVerified}，diff 一致=${result.diffEqual}；工具轨迹相似度 ${fmt(result.alignment?.similarity)}，距离 ${fmt(result.alignment?.distance)}。`)
}
lines.push('')
const block = lines.join('\n')
const start = text.indexOf('### 6.4')
const end = text.indexOf('## 7. 结论')
if (start < 0 || end < 0) throw new Error('report anchors not found')
const updated = `${text.slice(0, start)}${block}\n\n${text.slice(end)}`
writeFileSync(report, updated)
writeFileSync(new URL('expanded-summary.json', docsData), JSON.stringify({ aaDsh, aaOc, mbpp, swe }, null, 2))
console.log(block)
