// Assemble the expanded-experiment markdown/JSON summary from evaluated run
// dirs. Run eval_exp.mjs / eval_probes.mjs / eval_aa.mjs first, then:
//   node report_expansion.mjs
// Writes docs/exps/.data/expanded-summary.json and prints the Markdown block.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const root = new URL('../..', import.meta.url)
const runs = new URL('.runs/', import.meta.url)
const docsData = new URL('../../docs/exps/.data/', import.meta.url)
mkdirSync(docsData, { recursive: true })

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const readOptional = (path) => {
  try { return readJson(path) } catch { return undefined }
}
const probes = readJson(new URL('probes-r3-s100/results.json', runs))
const aaDsh = readJson(new URL('aa-dsh-human-eval-n10-r2-s200/results.json', runs))
const aaOc = readJson(new URL('aa-opencode-human-eval-n10-r2-s201/results.json', runs))
const aaMbppDsh = readOptional(new URL('aa-dsh-mbpp-n10-r2-s202/results.json', runs))
const aaMbppOc = readOptional(new URL('aa-opencode-mbpp-n10-r2-s203/results.json', runs))
const he = readJson(new URL('exp-human-eval-n30-r3-s300/results.json', runs))
const mbpp = readJson(new URL('exp-mbpp-n5-r2-s302/results.json', runs))
const swe = readOptional(new URL('../../docs/exps/.data/swe-expansion.json', import.meta.url))

const fmt = (value, digits = 3) => value === null || value === undefined ? '–' : Number(value).toFixed(digits)
const pct = (value) => fmt((value ?? 0) * 100, 1) + '%'
const ci = (pair) => pair.ci95[0] === null ? '–' : `[${fmt(pair.ci95[0])}, ${fmt(pair.ci95[1])}]`
const passBlock = (stats) => {
  const p = stats.passRepeatLevel
  const task = stats.passTaskLevel
  return {
    tasks: stats.config.tasks,
    repeatsPerTask: stats.config.repeatsPerTask,
    rateDsh: p.rates.a,
    rateOpencode: p.rates.b,
    discordant: p.counts.discordant,
    mcnemarP: p.mcnemarP,
    exactBinomialP: p.exactBinomialP,
    meanDiff: p.meanDiff,
    ci95: p.ci95,
    tostEquivalent: p.tost.equivalent,
    taskLevelDiff: task.meanDiff,
    taskLevelCi: task.ci95,
  }
}
const perfRows = (stats) => [
  ['wall time (ms)', stats.perf.wallMs],
  ['cache read ratio', stats.perf.cacheReadRatio],
  ['TTFT (ms)', stats.perf.ttftAvgMs],
  ['step 时长 (ms)', stats.perf.stepAvgMs],
  ['bash 工具时长 (ms)', stats.perf.bashAvgMs],
  ['write 工具时长 (ms)', stats.perf.writeAvgMs],
]

const markdown = []
markdown.push('## 扩展实验（科学方法学，2026-08-16）')
markdown.push('')
markdown.push('### L1 探针（12 probe × 3 轮）')
markdown.push('')
const probeFails = probes.perProbe.filter(probe => probe.dshRate < 1 || probe.ocRate < 1)
markdown.push(`- 两系统 **${probes.perProbe.length} 个 probe 全部通过**（${probes.perProbe.length * 3} 个 repeat 配对）` + (probeFails.length === 0 ? '。' : `，失败项：${probeFails.map(p => p.id).join(', ')}。`))
markdown.push(`- 配对检验：McNemar p=${fmt(probes.repeatLevel.mcnemarP)}，精确二项 p=${fmt(probes.repeatLevel.exactBinomialP)}，TOST(±5pp) 等价=${probes.repeatLevel.tost.equivalent}。`)
markdown.push('')
markdown.push('### A/A 噪声地板（同系统自比 × 2 轮）')
markdown.push('')
for (const [name, aa] of [['HumanEval · dsh', aaDsh], ['HumanEval · opencode', aaOc], ['MBPP · dsh', aaMbppDsh], ['MBPP · opencode', aaMbppOc]].filter(([, value]) => value !== undefined)) {
  const p = aa.passRepeatLevel
  markdown.push(`- ${name}：${p.counts.n} 对自比，双方通过率 ${pct(p.rates.a)} / ${pct(p.rates.b)}，自比差异 ${fmt(p.meanDiff)}，CI=${ci(p)}，TOST(±5pp)=${p.tost.equivalent}。`)
}
markdown.push('')
markdown.push('### L3 编码任务（配对重复：HumanEval 30×3，MBPP 5×2；交替顺序 + 独立 workdir）')
markdown.push('')
for (const [label, stats] of [['HumanEval', he], ['MBPP', mbpp]]) {
  const p = passBlock(stats)
  markdown.push(`#### ${label} (n=${p.tasks}, r=${p.repeatsPerTask})`)
  markdown.push('')
  markdown.push(`| 指标 | dsh | opencode | 差异 | 95% CI | 检验 |`)
  markdown.push(`|---|---|---|---|---|---|`)
  markdown.push(`| pass@1（repeat 级） | ${pct(p.rateDsh)} | ${pct(p.rateOpencode)} | ${fmt(p.meanDiff)} | ${ci(p)} | McNemar p=${fmt(p.mcnemarP)}；TOST(±5pp)=${p.tostEquivalent} |`)
  markdown.push(`| 工具轨迹相似度 | ${fmt(stats.traceSimilarity.mean)} | – | – | – | 平均编辑距离 ${fmt(stats.traceDistance.mean)} |`)
  markdown.push(`| 平均工具调用数差 | ${fmt(stats.toolCountDiffMean)} | – | – | – | 最终文本 Jaccard ${fmt(stats.jaccardMean)} |`)
  markdown.push('')
  for (const [name, pair] of perfRows(stats)) {
    markdown.push(`| ${name} | ${fmt(pair.meanA, 1)} | ${fmt(pair.meanB, 1)} | ${fmt(pair.meanDiff, 1)} | ${ci(pair)} | paired p=${fmt(pair.pairedT.p)} |`)
  }
  markdown.push('')
}

const summary = {
  probes: probes.repeatLevel,
  aaDsh: aaDsh.passRepeatLevel,
  aaOc: aaOc.passRepeatLevel,
  aaMbppDsh: aaMbppDsh?.passRepeatLevel,
  aaMbppOc: aaMbppOc?.passRepeatLevel,
  humanEval: passBlock(he),
  mbpp: passBlock(mbpp),
  humanEvalPerf: Object.fromEntries(perfRows(he)),
  mbppPerf: Object.fromEntries(perfRows(mbpp)),
  humanEvalTrace: {
    similarity: he.stats.traceSimilarity.mean,
    distance: he.stats.traceDistance.mean,
    toolCountDiff: he.stats.toolCountDiffMean,
    jaccard: he.stats.jaccardMean,
  },
  mbppTrace: {
    similarity: mbpp.stats.traceSimilarity.mean,
    distance: mbpp.stats.traceDistance.mean,
    toolCountDiff: mbpp.stats.toolCountDiffMean,
    jaccard: mbpp.stats.jaccardMean,
  },
}
writeFileSync(new URL('expanded-summary.json', docsData), JSON.stringify(summary, null, 2))
console.log(markdown.join('\n'))
