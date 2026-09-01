'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  finalizeSamples,
  parseCodexTranscriptSamples,
  sampleFromOpenCodePayload,
  sampleFromZcodeRow
} = require('../../src/shared/recentModelSpeed');

test('ZCode excludes reasoning tokens from visible completion speed', () => {
  const sample = sampleFromZcodeRow({
    id: 1, sessionId: 's1', modelId: 'GPT-5.6',
    startedAt: 1000, completedAt: 3000, durationMs: 2000,
    outputTokens: 120, reasoningTokens: 20
  });
  assert.equal(sample.outputTokens, 100);
  assert.equal(sample.durationMs, 2000);
  assert.equal(sample.outputTokens * 1000 / sample.durationMs, 50);
});

test('OpenCode uses assistant completion output and completed-created duration', () => {
  const sample = sampleFromOpenCodePayload({
    role: 'assistant', modelID: 'deepseek-v4-flash',
    tokens: { output: 180, reasoning: 90 },
    time: { created: 1767225600000, completed: 1767225602000 }
  }, { id: 'm1', sessionId: 's1', dbKey: 'opencode.db' });
  assert.equal(sample.outputTokens, 180);
  assert.equal(sample.durationMs, 2000);
  assert.equal(sample.outputTokens * 1000 / sample.durationMs, 90);
});

test('Codex excludes reasoning and re-anchors after tool output', () => {
  const lines = [
    { timestamp: '2026-01-01T00:00:00.100Z', type: 'turn_context', payload: { model: 'gpt-5.6' } },
    { timestamp: '2026-01-01T00:00:02.100Z', type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { output_tokens: 110, reasoning_output_tokens: 10 } } } },
    { timestamp: '2026-01-01T00:00:03.000Z', type: 'response_item', payload: { type: 'function_call', name: 'shell' } },
    { timestamp: '2026-01-01T00:00:10.000Z', type: 'response_item', payload: { type: 'function_call_output' } },
    { timestamp: '2026-01-01T00:00:12.000Z', type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { output_tokens: 200, reasoning_output_tokens: 20 } } } }
  ];
  const samples = parseCodexTranscriptSamples(lines.map(JSON.stringify).join('\n'), 'session-1');
  assert.equal(samples.length, 2);
  assert.deepEqual(samples.map((sample) => sample.outputTokens), [100, 180]);
  assert.deepEqual(samples.map((sample) => sample.durationMs), [2000, 2000]);
  assert.deepEqual(samples.map((sample) => sample.outputTokens * 1000 / sample.durationMs), [50, 90]);
});

test('recent samples isolate agents and retain newest ten per model', () => {
  const samples = [];
  for (let i = 0; i < 12; i += 1) {
    samples.push({ client: 'zcode', model: 'same-model', outputTokens: 100 + i, durationMs: 1000, completedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(), sampleId: `z-${i}` });
  }
  samples.push({ client: 'codex', model: 'same-model', outputTokens: 500, durationMs: 1000, completedAt: '2026-01-01T00:01:00.000Z', sampleId: 'c-1' });
  const result = finalizeSamples(samples, 10);
  assert.equal(result.zcode['same-model'].length, 10);
  assert.equal(result.zcode['same-model'][0].outputTokens, 111);
  assert.equal(result.codex['same-model'].length, 1);
  assert.equal(result.codex['same-model'][0].outputTokens, 500);
});
