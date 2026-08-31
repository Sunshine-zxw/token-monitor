'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function replaceIn(relativePath, before, after) {
  const file = path.join(root, relativePath);
  let text = fs.readFileSync(file, 'utf8');
  if (!text.includes(before)) throw new Error(`${relativePath}: missing fix anchor`);
  text = text.replace(before, after);
  fs.writeFileSync(file, text);
}

// extractUsageFromTokscale follows tokscale's current JSON contract: rows live in `entries`.
replaceIn(
  'tests/shared/modelThroughput.test.js',
  'extractUsageFromTokscale({ data:',
  'extractUsageFromTokscale({ entries:'
);
let testText = fs.readFileSync(path.join(root, 'tests/shared/modelThroughput.test.js'), 'utf8');
testText = testText.replaceAll('extractUsageFromTokscale({ data:', 'extractUsageFromTokscale({ entries:');
fs.writeFileSync(path.join(root, 'tests/shared/modelThroughput.test.js'), testText);

// Untimed model rows intentionally keep the historical row shape. That preserves every
// existing consumer/deep-equality contract while timed rows gain the additive fields.
replaceIn(
  'tests/electron/modelThroughputToolDetails.test.js',
  'assert.equal(deepseek.tokenRate, 0);',
  'assert.equal(deepseek.tokenRate, undefined);'
);

// Do not change the app version independently of package-lock.json. The custom Release tag
// identifies this fork build without creating package/lock drift.
const packagePath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const canonicalVersion = lock?.packages?.['']?.version || lock?.version;
if (!canonicalVersion) throw new Error('Unable to resolve canonical package version from package-lock.json');
pkg.version = canonicalVersion;
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

console.log('Aligned throughput patch with tokscale input and package-lock version.');
