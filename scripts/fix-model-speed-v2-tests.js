'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const testFile = path.join(root, 'tests', 'shared', 'recentModelSpeed.test.js');
let testText = fs.readFileSync(testFile, 'utf8');
testText = testText.replace(
  "time: { created: 1000, completed: 3000 }",
  "time: { created: 1767225600000, completed: 1767225602000 }"
);
fs.writeFileSync(testFile, testText);

const sourceFile = path.join(root, 'src', 'shared', 'recentModelSpeed.js');
let sourceText = fs.readFileSync(sourceFile, 'utf8');
sourceText = sourceText.replace('    let mtime = 0;\n', '    let mtime;\n');
fs.writeFileSync(sourceFile, sourceText);

console.log('Adjusted model speed v2 test fixture and lint-safe source.');
