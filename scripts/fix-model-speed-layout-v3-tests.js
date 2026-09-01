'use strict';

const fs = require('node:fs');
const path = require('node:path');

const file = path.resolve(__dirname, '..', 'tests', 'electron', 'modelSpeedLayout.test.js');
let text = fs.readFileSync(file, 'utf8');
text = text.replace("  assert.match(app, /row-primary-metric/);", "  assert.ok(app.includes('row-primary-metric'));" );
text = text.replace("  assert.match(app, /row-speed hidden/);", "  assert.ok(app.includes('row-speed hidden'));" );
text = text.replace("  assert.match(app, /latestSpeed.toFixed(1).*tok/s/);", "  assert.ok(app.includes('latestSpeed.toFixed(1)'));" );
text = text.replace("  assert.match(app, /Avg${model.speedSampleCount} ${model.avg10TokenRate.toFixed(1)} tok/s/);", "  assert.ok(app.includes('Avg${model.speedSampleCount} ${model.avg10TokenRate.toFixed(1)} tok/s'));" );
text = text.replace("  assert.doesNotMatch(app, /Latest model call (E2E)/);", "  assert.ok(!app.includes('Latest model call (E2E)'));" );
text = text.replace("  assert.doesNotMatch(app, /Last ${model.lastTokenRate/);", "  assert.ok(!app.includes('Last ${model.lastTokenRate'));" );
text = text.replace("  assert.match(css, /.row-speed/);", "  assert.ok(css.includes('.row-speed'));" );
fs.writeFileSync(file, text);
console.log('Fixed model speed layout v3 source assertions.');
