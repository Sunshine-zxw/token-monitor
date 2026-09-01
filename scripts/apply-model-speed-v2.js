'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function replaceOnce(relativePath, before, after, label) {
  const file = path.join(root, relativePath);
  let text = fs.readFileSync(file, 'utf8');
  if (text.includes(after)) return;
  if (!text.includes(before)) throw new Error(`${relativePath}: missing patch anchor: ${label}`);
  text = text.replace(before, after);
  fs.writeFileSync(file, text);
}

// ---------------------------------------------------------------------------
// Shared usage wire shape: recent call samples are metadata, not period totals.
// ---------------------------------------------------------------------------
replaceOnce(
  'src/shared/usage.js',
  `function normalizeSessionId(value) {\n`,
  `const RECENT_MODEL_SPEED_SAMPLE_LIMIT = 10;\n\nfunction normalizeModelSpeedSample(value) {\n  if (!value || typeof value !== 'object') return null;\n  const outputTokens = Math.max(0, Math.round(asNumber(value.outputTokens ?? value.output_tokens)));\n  const durationMs = Math.max(0, Math.round(asNumber(value.durationMs ?? value.duration_ms)));\n  const completedAt = normalizeIsoTimestamp(value.completedAt ?? value.completed_at);\n  if (outputTokens <= 0 || durationMs <= 0 || !completedAt) return null;\n  const sample = { outputTokens, durationMs, completedAt };\n  const sessionId = String(value.sessionId ?? value.session_id ?? '').trim();\n  const sampleId = String(value.sampleId ?? value.sample_id ?? '').trim();\n  const source = String(value.source ?? '').trim();\n  if (sessionId) sample.sessionId = sessionId.slice(0, 256);\n  if (sampleId) sample.sampleId = sampleId.slice(0, 512);\n  if (source) sample.source = source.slice(0, 64);\n  return sample;\n}\n\nfunction modelSpeedSampleKey(sample) {\n  return sample.sampleId || [sample.sessionId || '', sample.completedAt, sample.outputTokens, sample.durationMs].join('|');\n}\n\nfunction mergeModelSpeedSampleArrays(...lists) {\n  const seen = new Set();\n  const merged = [];\n  for (const raw of lists.flatMap((value) => Array.isArray(value) ? value : [])) {\n    const sample = normalizeModelSpeedSample(raw);\n    if (!sample) continue;\n    const key = modelSpeedSampleKey(sample);\n    if (seen.has(key)) continue;\n    seen.add(key);\n    merged.push(sample);\n  }\n  return merged\n    .sort((a, b) => timestampMs(b.completedAt) - timestampMs(a.completedAt))\n    .slice(0, RECENT_MODEL_SPEED_SAMPLE_LIMIT);\n}\n\nfunction normalizeClientModelSpeedSamples(value) {\n  const result = {};\n  if (!value || typeof value !== 'object') return result;\n  for (const [client, models] of Object.entries(value)) {\n    const clientKey = normalizeClientName(client);\n    if (!clientKey || !models || typeof models !== 'object') continue;\n    for (const [model, samples] of Object.entries(models)) {\n      const modelKey = normalizeModelNameForClient(model, clientKey);\n      if (!modelKey) continue;\n      const normalized = mergeModelSpeedSampleArrays(samples);\n      if (!normalized.length) continue;\n      if (!result[clientKey]) result[clientKey] = {};\n      result[clientKey][modelKey] = normalized;\n    }\n  }\n  return result;\n}\n\nfunction mergeClientModelSpeedSamplesInto(period, value) {\n  const normalized = normalizeClientModelSpeedSamples(value);\n  for (const [client, models] of Object.entries(normalized)) {\n    if (!period.clientModelSpeedSamples) period.clientModelSpeedSamples = {};\n    if (!period.clientModelSpeedSamples[client]) period.clientModelSpeedSamples[client] = {};\n    for (const [model, samples] of Object.entries(models)) {\n      period.clientModelSpeedSamples[client][model] = mergeModelSpeedSampleArrays(\n        period.clientModelSpeedSamples[client][model],\n        samples\n      );\n    }\n  }\n}\n\nfunction normalizeSessionId(value) {\n`,
  'recent model speed helpers'
);

replaceOnce(
  'src/shared/usage.js',
  `  if (input.sessions && typeof input.sessions === 'object') {\n`,
  `  if (input.clientModelSpeedSamples && typeof input.clientModelSpeedSamples === 'object') {\n    mergeClientModelSpeedSamplesInto(period, input.clientModelSpeedSamples);\n  }\n  if (input.sessions && typeof input.sessions === 'object') {\n`,
  'normalize recent model speed samples'
);

replaceOnce(
  'src/shared/usage.js',
  `  for (const [model, duration] of Object.entries(source.clientModelTimedDurationMs?.[client] || {})) {\n    const timedDuration = Math.max(0, Math.round(asNumber(duration)));\n    if (timedDuration <= 0) continue;\n    const modelTokens = Math.max(0, Math.round(asNumber(source.clientModels?.[client]?.[model])));\n    const timedOutput = Math.min(\n      modelTokens,\n      Math.max(0, Math.round(asNumber(source.clientModelTimedOutputTokens?.[client]?.[model])))\n    );\n    if (!target.clientModelTimedDurationMs[client]) target.clientModelTimedDurationMs[client] = {};\n    if (!target.clientModelTimedOutputTokens[client]) target.clientModelTimedOutputTokens[client] = {};\n    target.clientModelTimedDurationMs[client][model] = (target.clientModelTimedDurationMs[client][model] || 0) + timedDuration;\n    target.clientModelTimedOutputTokens[client][model] = (target.clientModelTimedOutputTokens[client][model] || 0) + timedOutput;\n  }\n}\n`,
  `  for (const [model, duration] of Object.entries(source.clientModelTimedDurationMs?.[client] || {})) {\n    const timedDuration = Math.max(0, Math.round(asNumber(duration)));\n    if (timedDuration <= 0) continue;\n    const modelTokens = Math.max(0, Math.round(asNumber(source.clientModels?.[client]?.[model])));\n    const timedOutput = Math.min(\n      modelTokens,\n      Math.max(0, Math.round(asNumber(source.clientModelTimedOutputTokens?.[client]?.[model])))\n    );\n    if (!target.clientModelTimedDurationMs[client]) target.clientModelTimedDurationMs[client] = {};\n    if (!target.clientModelTimedOutputTokens[client]) target.clientModelTimedOutputTokens[client] = {};\n    target.clientModelTimedDurationMs[client][model] = (target.clientModelTimedDurationMs[client][model] || 0) + timedDuration;\n    target.clientModelTimedOutputTokens[client][model] = (target.clientModelTimedOutputTokens[client][model] || 0) + timedOutput;\n  }\n  if (source.clientModelSpeedSamples?.[client]) {\n    mergeClientModelSpeedSamplesInto(target, { [client]: source.clientModelSpeedSamples[client] });\n  }\n}\n`,
  'preserve recent model speed samples'
);

replaceOnce(
  'src/shared/usage.js',
  `  for (const [key, project] of Object.entries(source.projects || {})) addProjectInto(target.projects, key, project);\n`,
  `  if (source.clientModelSpeedSamples) mergeClientModelSpeedSamplesInto(target, source.clientModelSpeedSamples);\n  for (const [key, project] of Object.entries(source.projects || {})) addProjectInto(target.projects, key, project);\n`,
  'merge recent model speed samples'
);

replaceOnce(
  'src/shared/usage.js',
  `function deltaValue(base, fresh, anchor, key) {\n  if (key === 'tokenComponents') {\n`,
  `function deltaValue(base, fresh, anchor, key) {\n  // Recent speed samples are a replace-by-fresh snapshot, not additive usage.\n  // Recursing into their arrays would manufacture numeric deltas from sample\n  // fields and corrupt Last/Avg10 on every watch-triggered warm tick.\n  if (key === 'clientModelSpeedSamples') return fresh ?? base ?? {};\n  if (key === 'tokenComponents') {\n`,
  'delta recent model speed samples'
);

// ---------------------------------------------------------------------------
// Collector: scan raw local call records once per usage tick and attach the
// same recent-call snapshot to each period. It is intentionally period-agnostic.
// ---------------------------------------------------------------------------
replaceOnce(
  'src/shared/collector.js',
  `const opencodeSession = require('./opencodeSession');\n`,
  `const opencodeSession = require('./opencodeSession');\nconst { collectRecentModelSpeedSamples } = require('./recentModelSpeed');\n`,
  'recent speed collector import'
);

replaceOnce(
  'src/shared/collector.js',
  `  today = mergePeriods(windowsPeriods.today, wslBundle.today);\n  month = mergePeriods(windowsPeriods.month, wslBundle.month);\n  allTime = mergePeriods(windowsPeriods.allTime, wslBundle.allTime);\n  throwIfAborted(options.signal);\n`,
  `  today = mergePeriods(windowsPeriods.today, wslBundle.today);\n  month = mergePeriods(windowsPeriods.month, wslBundle.month);\n  allTime = mergePeriods(windowsPeriods.allTime, wslBundle.allTime);\n  throwIfAborted(options.signal);\n\n  // This is deliberately NOT derived from today/month/allTime aggregates. It\n  // reads the most recent individual model-call records so the UI can show a\n  // real Last-call rate and a duration-weighted Avg10 for each Agent × Model.\n  // The same snapshot rides on all three periods because changing the dashboard\n  // period must not change what "last call" means.\n  try {\n    const clientModelSpeedSamples = collectRecentModelSpeedSamples({\n      clients: normalizedClients,\n      period: today,\n      homeDir: options.homeDir || os.homedir(),\n      env: options.env || process.env\n    });\n    if (Object.keys(clientModelSpeedSamples).length > 0) {\n      today.clientModelSpeedSamples = clientModelSpeedSamples;\n      month.clientModelSpeedSamples = clientModelSpeedSamples;\n      allTime.clientModelSpeedSamples = clientModelSpeedSamples;\n    }\n  } catch (error) {\n    if (typeof options.logger === 'function') options.logger(\`recent model speed scan failed: \${error.message}\`);\n  }\n`,
  'attach recent model speed samples'
);

// ---------------------------------------------------------------------------
// Renderer data model: Last + duration-weighted Avg10 from individual calls.
// Keep the old aggregate tokenRate fields internally for backwards compatibility,
// but the UI will no longer present those as model speed.
// ---------------------------------------------------------------------------
replaceOnce(
  'src/electron/renderer/toolDetails.js',
  `  function modelRowsForTool(period, client) {\n`,
  `  function recentSpeedSummary(samples) {\n    const valid = (Array.isArray(samples) ? samples : [])\n      .map((sample) => ({\n        outputTokens: amount(sample?.outputTokens),\n        durationMs: amount(sample?.durationMs),\n        completedAt: String(sample?.completedAt || '')\n      }))\n      .filter((sample) => sample.outputTokens > 0 && sample.durationMs > 0 && !Number.isNaN(Date.parse(sample.completedAt)))\n      .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))\n      .slice(0, 10);\n    if (!valid.length) return {};\n    const latest = valid[0];\n    const output = valid.reduce((sum, sample) => sum + sample.outputTokens, 0);\n    const duration = valid.reduce((sum, sample) => sum + sample.durationMs, 0);\n    return {\n      lastTokenRate: latest.outputTokens * 1000 / latest.durationMs,\n      avg10TokenRate: duration > 0 ? output * 1000 / duration : 0,\n      speedSampleCount: valid.length,\n      lastCompletedAt: latest.completedAt\n    };\n  }\n\n  function modelRowsForTool(period, client) {\n`,
  'recent speed summary helper'
);

replaceOnce(
  'src/electron/renderer/toolDetails.js',
  `    const timedOutputs = period?.clientModelTimedOutputTokens?.[clientKey] || {};\n    const timedDurations = period?.clientModelTimedDurationMs?.[clientKey] || {};\n`,
  `    const timedOutputs = period?.clientModelTimedOutputTokens?.[clientKey] || {};\n    const timedDurations = period?.clientModelTimedDurationMs?.[clientKey] || {};\n    const recentSpeeds = period?.clientModelSpeedSamples?.[clientKey] || {};\n`,
  'read recent model speed samples'
);

replaceOnce(
  'src/electron/renderer/toolDetails.js',
  `        return {\n          key: row.key,\n          name: row.key,\n          value,\n          cost,\n          percent: total > 0 ? Math.min(100, value / total * 100) : 0,\n          ...timing,\n          unattributed: row.unattributed === true\n        };\n`,
  `        const recentSpeed = recentSpeedSummary(recentSpeeds[row.key]);\n        return {\n          key: row.key,\n          name: row.key,\n          value,\n          cost,\n          percent: total > 0 ? Math.min(100, value / total * 100) : 0,\n          ...timing,\n          ...recentSpeed,\n          unattributed: row.unattributed === true\n        };\n`,
  'attach recent speed summary to rows'
);

// ---------------------------------------------------------------------------
// UI: Model mode becomes the default detail view. Explicit labels prevent the
// E2E metric from being mistaken for pure decoder-only speed.
// ---------------------------------------------------------------------------
replaceOnce(
  'src/electron/renderer/app.js',
  `state.toolDetailMode = 'tokens';\n`,
  `state.toolDetailMode = 'models';\n`,
  'default tool detail to models'
);

replaceOnce(
  'src/electron/renderer/app.js',
  `    modelRows.map((model) => [model.key, model.value, model.cost, Math.round(model.percent)])\n`,
  `    modelRows.map((model) => [\n      model.key, model.value, model.cost, Math.round(model.percent),\n      model.lastTokenRate || 0, model.avg10TokenRate || 0, model.speedSampleCount || 0, model.lastCompletedAt || ''\n    ])\n`,
  'speed-aware accordion signature'
);

replaceOnce(
  'src/electron/renderer/app.js',
  `  if (mode === 'models' && hasModels) {\n    const timedOutput = modelRows.reduce((sum, row) => sum + (Number(row.timedOutputTokens) || 0), 0);\n    const timedDuration = modelRows.reduce((sum, row) => sum + (Number(row.timedDurationMs) || 0), 0);\n    const agentRate = timedOutput > 0 && timedDuration > 0 ? timedOutput * 1000 / timedDuration : 0;\n    appendAccordionMetricRow(\n      content,\n      'Throughput',\n      agentRate > 0 ? \`≈ \${agentRate.toFixed(1)} tok/s\` : '—',\n      null,\n      'tool-model-row'\n    );\n    for (const model of modelRows) {\n      const baseMetric = model.value > 0 ? formatNumber(model.value) : formatCost(model.cost);\n      const metric = model.tokenRate > 0 ? \`\${baseMetric} · ≈ \${model.tokenRate.toFixed(1)} tok/s\` : \`\${baseMetric} · —\`;\n      const label = model.unattributed === true ? labels.unclassified : model.name;\n      appendAccordionMetricRow(content, label, metric, model.value > 0 ? model.percent : null, 'tool-model-row');\n    }\n  }\n`,
  `  if (mode === 'models' && hasModels) {\n    const latestModel = modelRows\n      .filter((row) => row.lastTokenRate > 0 && row.lastCompletedAt)\n      .sort((a, b) => Date.parse(b.lastCompletedAt) - Date.parse(a.lastCompletedAt))[0];\n    appendAccordionMetricRow(\n      content,\n      'Latest model call (E2E)',\n      latestModel ? \`\${latestModel.name} · \${latestModel.lastTokenRate.toFixed(1)} tok/s\` : '—',\n      null,\n      'tool-model-row'\n    );\n    for (const model of modelRows) {\n      const baseMetric = model.value > 0 ? formatNumber(model.value) : formatCost(model.cost);\n      const speed = model.lastTokenRate > 0\n        ? \`Last \${model.lastTokenRate.toFixed(1)} · Avg\${model.speedSampleCount} \${model.avg10TokenRate.toFixed(1)} tok/s\`\n        : 'Last — · Avg —';\n      const metric = \`\${speed} · \${baseMetric}\`;\n      const label = model.unattributed === true ? labels.unclassified : model.name;\n      appendAccordionMetricRow(content, label, metric, model.value > 0 ? model.percent : null, 'tool-model-row');\n    }\n  }\n`,
  'replace aggregate throughput UI with Last and Avg10'
);

// ---------------------------------------------------------------------------
// Focused tests.
// ---------------------------------------------------------------------------
const recentSpeedTest = `'use strict';\n\nconst test = require('node:test');\nconst assert = require('node:assert/strict');\nconst {\n  finalizeSamples,\n  parseCodexTranscriptSamples,\n  sampleFromOpenCodePayload,\n  sampleFromZcodeRow\n} = require('../../src/shared/recentModelSpeed');\n\ntest('ZCode excludes reasoning tokens from visible completion speed', () => {\n  const sample = sampleFromZcodeRow({\n    id: 1, sessionId: 's1', modelId: 'GPT-5.6',\n    startedAt: 1000, completedAt: 3000, durationMs: 2000,\n    outputTokens: 120, reasoningTokens: 20\n  });\n  assert.equal(sample.outputTokens, 100);\n  assert.equal(sample.durationMs, 2000);\n  assert.equal(sample.outputTokens * 1000 / sample.durationMs, 50);\n});\n\ntest('OpenCode uses assistant completion output and completed-created duration', () => {\n  const sample = sampleFromOpenCodePayload({\n    role: 'assistant', modelID: 'deepseek-v4-flash',\n    tokens: { output: 180, reasoning: 90 },\n    time: { created: 1000, completed: 3000 }\n  }, { id: 'm1', sessionId: 's1', dbKey: 'opencode.db' });\n  assert.equal(sample.outputTokens, 180);\n  assert.equal(sample.durationMs, 2000);\n  assert.equal(sample.outputTokens * 1000 / sample.durationMs, 90);\n});\n\ntest('Codex excludes reasoning and re-anchors after tool output', () => {\n  const lines = [\n    { timestamp: '2026-01-01T00:00:00.100Z', type: 'turn_context', payload: { model: 'gpt-5.6' } },\n    { timestamp: '2026-01-01T00:00:02.100Z', type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { output_tokens: 110, reasoning_output_tokens: 10 } } } },\n    { timestamp: '2026-01-01T00:00:03.000Z', type: 'response_item', payload: { type: 'function_call', name: 'shell' } },\n    { timestamp: '2026-01-01T00:00:10.000Z', type: 'response_item', payload: { type: 'function_call_output' } },\n    { timestamp: '2026-01-01T00:00:12.000Z', type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { output_tokens: 200, reasoning_output_tokens: 20 } } } }\n  ];\n  const samples = parseCodexTranscriptSamples(lines.map(JSON.stringify).join('\\n'), 'session-1');\n  assert.equal(samples.length, 2);\n  assert.deepEqual(samples.map((sample) => sample.outputTokens), [100, 180]);\n  assert.deepEqual(samples.map((sample) => sample.durationMs), [2000, 2000]);\n  assert.deepEqual(samples.map((sample) => sample.outputTokens * 1000 / sample.durationMs), [50, 90]);\n});\n\ntest('recent samples isolate agents and retain newest ten per model', () => {\n  const samples = [];\n  for (let i = 0; i < 12; i += 1) {\n    samples.push({ client: 'zcode', model: 'same-model', outputTokens: 100 + i, durationMs: 1000, completedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(), sampleId: \`z-\${i}\` });\n  }\n  samples.push({ client: 'codex', model: 'same-model', outputTokens: 500, durationMs: 1000, completedAt: '2026-01-01T00:01:00.000Z', sampleId: 'c-1' });\n  const result = finalizeSamples(samples, 10);\n  assert.equal(result.zcode['same-model'].length, 10);\n  assert.equal(result.zcode['same-model'][0].outputTokens, 111);\n  assert.equal(result.codex['same-model'].length, 1);\n  assert.equal(result.codex['same-model'][0].outputTokens, 500);\n});\n`;
fs.writeFileSync(path.join(root, 'tests/shared/recentModelSpeed.test.js'), recentSpeedTest);

const rendererTest = `'use strict';\n\nconst test = require('node:test');\nconst assert = require('node:assert/strict');\nconst toolDetails = require('../../src/electron/renderer/toolDetails');\n\ntest('model rows expose Last and duration-weighted Avg10 call speed', () => {\n  const rows = toolDetails.modelRowsForTool({\n    clients: { zcode: 1000 }, clientCosts: {},\n    clientModels: { zcode: { 'gpt-5.6': 1000, untimed: 10 } },\n    clientModelCosts: { zcode: {} },\n    clientModelSpeedSamples: { zcode: {\n      'gpt-5.6': [\n        { outputTokens: 100, durationMs: 2000, completedAt: '2026-01-02T00:00:00.000Z' },\n        { outputTokens: 300, durationMs: 3000, completedAt: '2026-01-01T00:00:00.000Z' }\n      ]\n    } }\n  }, 'zcode');\n  const gpt = rows.find((row) => row.key === 'gpt-5.6');\n  const untimed = rows.find((row) => row.key === 'untimed');\n  assert.equal(gpt.lastTokenRate, 50);\n  assert.equal(gpt.avg10TokenRate, 80);\n  assert.equal(gpt.speedSampleCount, 2);\n  assert.equal(gpt.lastCompletedAt, '2026-01-02T00:00:00.000Z');\n  assert.equal(untimed.lastTokenRate, undefined);\n});\n`;
fs.writeFileSync(path.join(root, 'tests/electron/modelSpeedToolDetails.test.js'), rendererTest);

console.log('Applied model speed v2 patch.');
