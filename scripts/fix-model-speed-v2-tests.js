'use strict';

const fs = require('node:fs');
const path = require('node:path');

const file = path.resolve(__dirname, '..', 'tests', 'shared', 'recentModelSpeed.test.js');
let text = fs.readFileSync(file, 'utf8');
text = text.replace(
  "time: { created: 1000, completed: 3000 }",
  "time: { created: 1767225600000, completed: 1767225602000 }"
);
fs.writeFileSync(file, text);
console.log('Adjusted OpenCode test timestamps to epoch milliseconds.');
