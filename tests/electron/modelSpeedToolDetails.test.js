'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const toolDetails = require('../../src/electron/renderer/toolDetails');

test('model rows expose Last and duration-weighted Avg10 call speed', () => {
  const rows = toolDetails.modelRowsForTool({
    clients: { zcode: 1000 }, clientCosts: {},
    clientModels: { zcode: { 'gpt-5.6': 1000, untimed: 10 } },
    clientModelCosts: { zcode: {} },
    clientModelSpeedSamples: { zcode: {
      'gpt-5.6': [
        { outputTokens: 100, durationMs: 2000, completedAt: '2026-01-02T00:00:00.000Z' },
        { outputTokens: 300, durationMs: 3000, completedAt: '2026-01-01T00:00:00.000Z' }
      ]
    } }
  }, 'zcode');
  const gpt = rows.find((row) => row.key === 'gpt-5.6');
  const untimed = rows.find((row) => row.key === 'untimed');
  assert.equal(gpt.lastTokenRate, 50);
  assert.equal(gpt.avg10TokenRate, 80);
  assert.equal(gpt.speedSampleCount, 2);
  assert.equal(gpt.lastCompletedAt, '2026-01-02T00:00:00.000Z');
  assert.equal(untimed.lastTokenRate, undefined);
});
