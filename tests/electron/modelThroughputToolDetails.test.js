'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const toolDetails = require('../../src/electron/renderer/toolDetails');

test('tool model rows expose timing-derived output throughput', () => {
  const rows = toolDetails.modelRowsForTool({
    clients: { zcode: 100 }, clientCosts: {},
    clientModels: { zcode: { 'gpt-5.6': 60, 'deepseek-v4-flash': 40 } },
    clientModelCosts: { zcode: {} },
    clientModelTimedOutputTokens: { zcode: { 'gpt-5.6': 7200 } },
    clientModelTimedDurationMs: { zcode: { 'gpt-5.6': 100000 } }
  }, 'zcode');
  const gpt = rows.find((row) => row.key === 'gpt-5.6');
  const deepseek = rows.find((row) => row.key === 'deepseek-v4-flash');
  assert.equal(gpt.tokenRate, 72);
  assert.equal(gpt.timedOutputTokens, 7200);
  assert.equal(gpt.timedDurationMs, 100000);
  assert.equal(deepseek.tokenRate, undefined);
});
