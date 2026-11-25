const { test } = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
global.document = { createElementNS() { throw new Error('DOM is not used by the detector tests'); } };
require('../jl_zp_shapes.js');

const shapes = global.window.ZpShapes;

function flatBars(count) {
  return Array.from({ length: count }, (_, index) => ({
    o: 100,
    h: 100,
    l: 100,
    c: 100,
    x: index,
    key: String(index)
  }));
}

test('box detector uses a shorter consolidation window on daily candles', () => {
  const candles = flatBars(60);
  const minuteBox = shapes.boxR(candles, { per: 1 })[0];
  const dailyBox = shapes.boxR(candles, { per: 101 })[0];

  assert.ok(minuteBox);
  assert.ok(dailyBox);
  assert.equal(minuteBox.s, 11);
  assert.equal(dailyBox.s, 25);
});
