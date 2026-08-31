'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractUsageFromTokscale, mergePeriods, normalizePeriod } = require('../../src/shared/usage');

function row(client, model, output, durationMs, total = output) {
  return {
    client, model, output, totalTokens: total,
    performance: { timedTokens: total, totalDurationMs: durationMs }
  };
}

test('client × model timing remains isolated for the same model id across agents', () => {
  const period = extractUsageFromTokscale({ entries: [
    row('zcode', 'gpt-5.6', 7200, 100000, 9000),
    row('codex', 'gpt-5.6', 2500, 100000, 4000),
    row('opencode', 'deepseek-v4-flash', 6000, 50000, 8000)
  ] });
  assert.equal(period.clientModelTimedOutputTokens.zcode['gpt-5.6'], 7200);
  assert.equal(period.clientModelTimedDurationMs.zcode['gpt-5.6'], 100000);
  assert.equal(period.clientModelTimedOutputTokens.codex['gpt-5.6'], 2500);
  assert.equal(period.clientModelTimedDurationMs.codex['gpt-5.6'], 100000);
  assert.equal(period.clientModelTimedOutputTokens.opencode['deepseek-v4-flash'], 6000);
});

test('untimed rows do not acquire a model rate', () => {
  const period = extractUsageFromTokscale({ entries: [
    row('zcode', 'gpt-5.6', 5000, 100000, 7000),
    { client: 'copilot', model: 'gpt-5.6', output: 9000, totalTokens: 12000 }
  ] });
  assert.equal(period.clientModelTimedDurationMs.zcode['gpt-5.6'], 100000);
  assert.equal(period.clientModelTimedDurationMs.copilot, undefined);
});

test('mergePeriods duration-weights client × model timing', () => {
  const a = extractUsageFromTokscale({ entries: [row('zcode', 'gpt-5.6', 5000, 100000, 6000)] });
  const b = extractUsageFromTokscale({ entries: [row('zcode', 'gpt-5.6', 2500, 100000, 3000)] });
  const merged = mergePeriods(a, b);
  assert.equal(merged.clientModelTimedOutputTokens.zcode['gpt-5.6'], 7500);
  assert.equal(merged.clientModelTimedDurationMs.zcode['gpt-5.6'], 200000);
});

test('normalizePeriod caps timed model output and requires timing', () => {
  const period = normalizePeriod({
    totalTokens: 100, outputTokens: 50,
    clients: { zcode: 100 }, models: { m: 100 }, clientModels: { zcode: { m: 100 } },
    clientModelTimedDurationMs: { zcode: { m: 1000 } },
    clientModelTimedOutputTokens: { zcode: { m: 9999, untimed: 9999 } }
  });
  assert.equal(period.clientModelTimedOutputTokens.zcode.m, 100);
  assert.equal(period.clientModelTimedOutputTokens.zcode.untimed, undefined);
});
