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

function replaceRegex(relativePath, pattern, replacement, label) {
  const file = path.join(root, relativePath);
  let text = fs.readFileSync(file, 'utf8');
  if (!pattern.test(text)) throw new Error(`${relativePath}: missing regex patch anchor: ${label}`);
  text = text.replace(pattern, replacement);
  fs.writeFileSync(file, text);
}

replaceOnce(
  'src/electron/renderer/app.js',
  "    unclassifiedTokens: attributionComponent(period, 'modelUnclassifiedTokens', model)\n  }));",
  "    unclassifiedTokens: attributionComponent(period, 'modelUnclassifiedTokens', model),\n    lastTokenRate: toolDetailsApi.latestModelSpeedForPeriod(period, model).lastTokenRate || 0\n  }));",
  'homepage model row latest speed'
);

replaceOnce(
  'src/electron/renderer/app.js',
  "  row.innerHTML = '<div class=\"row-head\"><div class=\"row-name\"><span class=\"row-mark\"></span><div class=\"row-label\"><span class=\"row-title\"></span><span class=\"row-subtitle\"></span><span class=\"row-detail\"></span></div></div><div class=\"row-metrics\"><div class=\"row-value\"></div><div class=\"row-cost\"></div></div></div><div class=\"row-body\"><div class=\"bar\"><div class=\"bar-fill\"></div></div><div class=\"row-accordion\"><div class=\"row-accordion-inner\"></div></div></div>';",
  "  row.innerHTML = '<div class=\"row-head\"><div class=\"row-name\"><span class=\"row-mark\"></span><div class=\"row-label\"><span class=\"row-title\"></span><span class=\"row-subtitle\"></span><span class=\"row-detail\"></span></div></div><div class=\"row-metrics\"><div class=\"row-primary-metric\"><span class=\"row-speed hidden\"></span><div class=\"row-value\"></div></div><div class=\"row-cost\"></div></div></div><div class=\"row-body\"><div class=\"bar\"><div class=\"bar-fill\"></div></div><div class=\"row-accordion\"><div class=\"row-accordion-inner\"></div></div></div>';",
  'homepage model speed slot'
);

replaceOnce(
  'src/electron/renderer/app.js',
  "function updateRow(row, { name, subtitle, detail, value, cost, max, color, barBackground, accordionRows, deviceDetail, stale, platform, local, client, kind, cacheReadTokens, outputTokens, unclassifiedTokens, modelRows, tokenDataUnavailable, sessionDetailAvailable }) {",
  "function updateRow(row, { name, subtitle, detail, value, cost, max, color, barBackground, accordionRows, deviceDetail, stale, platform, local, client, kind, cacheReadTokens, outputTokens, unclassifiedTokens, modelRows, tokenDataUnavailable, sessionDetailAvailable, lastTokenRate }) {",
  'update row accepts latest speed'
);

replaceOnce(
  'src/electron/renderer/app.js',
  "  row.querySelector('.row-cost').textContent = tokenDataUnavailable === true ? '' : formatCost(cost || 0);\n",
  "  row.querySelector('.row-cost').textContent = tokenDataUnavailable === true ? '' : formatCost(cost || 0);\n  const speedEl = row.querySelector('.row-speed');\n  const latestSpeed = Number(lastTokenRate) || 0;\n  const showSpeed = state.breakdown === 'model' && latestSpeed > 0;\n  if (speedEl) {\n    speedEl.textContent = showSpeed ? `${latestSpeed.toFixed(1)} tok/s` : '';\n    speedEl.classList.toggle('hidden', !showSpeed);\n  }\n",
  'render homepage model speed before tokens'
);

replaceRegex(
  'src/electron/renderer/app.js',
  /\n\s*const latestModel = modelRows[\s\S]*?'tool-model-row'\n\s*\);\n(?=\s*for \(const model of modelRows\) \{)/,
  '\n',
  'remove duplicate latest-call summary from tool detail'
);

replaceRegex(
  'src/electron/renderer/app.js',
  /\s*const baseMetric = model\.value > 0 \? formatNumber\(model\.value\) : formatCost\(model\.cost\);\n\s*const speed = model\.lastTokenRate > 0\n\s*\? `Last \$\{model\.lastTokenRate\.toFixed\(1\)\} · Avg\$\{model\.speedSampleCount\} \$\{model\.avg10TokenRate\.toFixed\(1\)\} tok\/s`\n\s*: 'Last — · Avg —';\n\s*const metric = `\$\{speed\} · \$\{baseMetric\}`;/,
  "\n      const metric = model.avg10TokenRate > 0\n        ? `Avg${model.speedSampleCount} ${model.avg10TokenRate.toFixed(1)} tok/s`\n        : 'Avg —';",
  'tool detail shows average speed only'
);

replaceOnce(
  'src/electron/renderer/styles.css',
  ".row-metrics { display: grid; flex: 0 0 auto; gap: 2px; min-width: max-content; text-align: right; }\n.row-value { color: var(--text); white-space: nowrap; }\n.row-cost { color: var(--muted); font-size: 10px; white-space: nowrap; }",
  ".row-metrics { display: grid; flex: 0 0 auto; gap: 2px; min-width: max-content; text-align: right; }\n.row-primary-metric { display: flex; align-items: baseline; justify-content: flex-end; gap: 6px; min-width: 0; white-space: nowrap; }\n.row-speed { color: var(--muted); font-size: 10px; font-variant-numeric: tabular-nums; white-space: nowrap; }\n.row-speed.hidden { display: none; }\n.row-value { color: var(--text); white-space: nowrap; }\n.row-cost { color: var(--muted); font-size: 10px; white-space: nowrap; }",
  'homepage speed slot styles'
);

const testFile = path.join(root, 'tests', 'electron', 'modelSpeedLayout.test.js');
fs.writeFileSync(testFile, `'use strict';\n\nconst fs = require('node:fs');\nconst path = require('node:path');\nconst test = require('node:test');\nconst assert = require('node:assert/strict');\nconst toolDetails = require('../../src/electron/renderer/toolDetails');\n\ntest('homepage model speed picks the newest call across agents', () => {\n  const period = {\n    clientModelSpeedSamples: {\n      zcode: {\n        'gpt-5.6': [{ outputTokens: 120, durationMs: 2000, completedAt: '2026-09-01T01:00:00.000Z' }]\n      },\n      codex: {\n        'gpt-5.6': [{ outputTokens: 180, durationMs: 2000, completedAt: '2026-09-01T01:01:00.000Z' }]\n      }\n    }\n  };\n  const speed = toolDetails.latestModelSpeedForPeriod(period, 'gpt-5.6');\n  assert.equal(speed.lastTokenRate, 90);\n  assert.equal(speed.lastCompletedAt, '2026-09-01T01:01:00.000Z');\n});\n\ntest('layout keeps current speed on homepage and only AvgN in tool detail', () => {\n  const app = fs.readFileSync(path.resolve(__dirname, '../../src/electron/renderer/app.js'), 'utf8');\n  const css = fs.readFileSync(path.resolve(__dirname, '../../src/electron/renderer/styles.css'), 'utf8');\n  assert.match(app, /row-primary-metric/);\n  assert.match(app, /row-speed hidden/);\n  assert.match(app, /latestSpeed\.toFixed\(1\).*tok\/s/);\n  assert.match(app, /Avg\$\{model\.speedSampleCount\} \$\{model\.avg10TokenRate\.toFixed\(1\)\} tok\/s/);\n  assert.doesNotMatch(app, /Latest model call \(E2E\)/);\n  assert.doesNotMatch(app, /Last \$\{model\.lastTokenRate/);\n  assert.match(css, /\.row-speed/);\n});\n`);

console.log('Applied model speed layout v3 patch.');
