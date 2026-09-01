'use strict';

const fs = require('node:fs');
const path = require('node:path');

const file = path.resolve(__dirname, 'apply-model-speed-layout-v3.js');
let text = fs.readFileSync(file, 'utf8');
const startMarker = "const testFile = path.join(root, 'tests', 'electron', 'modelSpeedLayout.test.js');";
const endMarker = "console.log('Applied model speed layout v3 patch.');";
const start = text.indexOf(startMarker);
const end = text.indexOf(endMarker);
if (start < 0 || end < start) throw new Error('model speed layout test generator anchors not found');

const generatedTest = [
  startMarker,
  "fs.writeFileSync(testFile, `'use strict';\\n\\nconst fs = require('node:fs');\\nconst path = require('node:path');\\nconst test = require('node:test');\\nconst assert = require('node:assert/strict');\\nconst toolDetails = require('../../src/electron/renderer/toolDetails');\\n\\ntest('homepage model speed picks the newest call across agents', () => {\\n  const period = {\\n    clientModelSpeedSamples: {\\n      zcode: {\\n        'gpt-5.6': [{ outputTokens: 120, durationMs: 2000, completedAt: '2026-09-01T01:00:00.000Z' }]\\n      },\\n      codex: {\\n        'gpt-5.6': [{ outputTokens: 180, durationMs: 2000, completedAt: '2026-09-01T01:01:00.000Z' }]\\n      }\\n    }\\n  };\\n  const speed = toolDetails.latestModelSpeedForPeriod(period, 'gpt-5.6');\\n  assert.equal(speed.lastTokenRate, 90);\\n  assert.equal(speed.lastCompletedAt, '2026-09-01T01:01:00.000Z');\\n});\\n\\ntest('layout keeps current speed on homepage and only AvgN in tool detail', () => {\\n  const app = fs.readFileSync(path.resolve(__dirname, '../../src/electron/renderer/app.js'), 'utf8');\\n  const css = fs.readFileSync(path.resolve(__dirname, '../../src/electron/renderer/styles.css'), 'utf8');\\n  assert.ok(app.includes('row-primary-metric'));\\n  assert.ok(app.includes('row-speed hidden'));\\n  assert.ok(app.includes('latestSpeed.toFixed(1)'));\\n  assert.ok(app.includes('model.avg10TokenRate.toFixed(1)'));\\n  assert.ok(!app.includes('Latest model call (E2E)'));\\n  assert.ok(!app.includes('Last ' + '$' + '{model.lastTokenRate'));\\n  assert.ok(css.includes('.row-speed'));\\n});\\n`);",
  '',
  endMarker,
  ''
].join('\n');

text = text.slice(0, start) + generatedTest + text.slice(end + endMarker.length);
fs.writeFileSync(file, text);
console.log('Cleaned model speed layout v3 patcher source.');
