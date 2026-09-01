'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const toolDetails = require('../../src/electron/renderer/toolDetails');

test('homepage model speed picks the newest call across agents', () => {
  const period = {
    clientModelSpeedSamples: {
      zcode: {
        'gpt-5.6': [{ outputTokens: 120, durationMs: 2000, completedAt: '2026-09-01T01:00:00.000Z' }]
      },
      codex: {
        'gpt-5.6': [{ outputTokens: 180, durationMs: 2000, completedAt: '2026-09-01T01:01:00.000Z' }]
      }
    }
  };
  const speed = toolDetails.latestModelSpeedForPeriod(period, 'gpt-5.6');
  assert.equal(speed.lastTokenRate, 90);
  assert.equal(speed.lastCompletedAt, '2026-09-01T01:01:00.000Z');
});

test('layout keeps current speed on homepage and only AvgN in tool detail', () => {
  const app = fs.readFileSync(path.resolve(__dirname, '../../src/electron/renderer/app.js'), 'utf8');
  const css = fs.readFileSync(path.resolve(__dirname, '../../src/electron/renderer/styles.css'), 'utf8');
  assert.ok(app.includes('row-primary-metric'));
  assert.ok(app.includes('row-speed hidden'));
  assert.ok(app.includes('latestSpeed.toFixed(1)'));
  assert.ok(app.includes('Avg${model.speedSampleCount} ${model.avg10TokenRate.toFixed(1)} tok/s'));
  assert.ok(!app.includes('Latest model call (E2E)'));
  assert.ok(!app.includes('Last ${model.lastTokenRate'));
  assert.ok(css.includes('.row-speed'));
});
