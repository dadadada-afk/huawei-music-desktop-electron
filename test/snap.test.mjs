import assert from 'node:assert/strict';
import { test } from 'node:test';
import { snapPosition } from '../src/main/snap.mjs';

// 1920x1080 display, 40 px taskbar: the work area is what the overlay must dock to, not the display.
const area = { x: 0, y: 0, width: 1920, height: 1040 };
const size = { width: 760, height: 168 };

test('a free-floating window is left alone', () => {
  assert.deepEqual(snapPosition({ x: 500, y: 400 }, size, area), { x: 500, y: 400 });
});

test('the left and top edges pull within the catch zone', () => {
  assert.deepEqual(snapPosition({ x: 12, y: 9 }, size, area), { x: 0, y: 0 });
});

test('the right and bottom edges pull within the catch zone', () => {
  const right = area.x + area.width - size.width;
  const bottom = area.y + area.height - size.height;
  assert.deepEqual(snapPosition({ x: right - 10, y: bottom - 6 }, size, area), { x: right, y: bottom });
});

test('bottom centre wins over the plain bottom edge when both are in range', () => {
  const bottom = area.y + area.height - size.height;
  const centre = Math.round(area.x + (area.width - size.width) / 2);
  assert.deepEqual(snapPosition({ x: centre + 9, y: bottom - 5 }, size, area), { x: centre, y: bottom });
});

test('a window far from the bottom never takes the centre dock', () => {
  const centre = Math.round(area.x + (area.width - size.width) / 2);
  assert.deepEqual(snapPosition({ x: centre, y: 300 }, size, area), { x: centre, y: 300 });
});

test('a second monitor docks to its own work area', () => {
  const second = { x: 1920, y: 0, width: 1280, height: 1024 };
  const right = second.x + second.width - size.width;
  assert.deepEqual(snapPosition({ x: right - 12, y: 20 }, size, second), { x: right, y: 0 });
});
