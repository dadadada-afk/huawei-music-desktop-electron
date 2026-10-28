import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, formatDuration, safeFileName, toCsv } from '../src/main/csv.mjs';

test('csvCell quotes only when a reader would otherwise split the field', () => {
  assert.equal(csvCell('花海'), '花海');
  assert.equal(csvCell('周杰伦, 费玉清'), '"周杰伦, 费玉清"');
  assert.equal(csvCell('他说"嗨"'), '"他说""嗨"""');
  assert.equal(csvCell('two\nlines'), '"two\nlines"');
  assert.equal(csvCell(undefined), '');
  assert.equal(csvCell(0), '0');
});

test('formatDuration keeps unknown lengths blank instead of claiming 0:00', () => {
  assert.equal(formatDuration(243), '4:03');
  assert.equal(formatDuration(5), '0:05');
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(undefined), '');
  assert.equal(formatDuration(-1), '');
});

test('toCsv writes a BOM and CRLF so Excel reads the Chinese columns', () => {
  const csv = toCsv(['曲名', '艺人'], [['花海', '周杰伦'], ['麻雀, 完整版', undefined]]);
  assert.equal(csv, '\uFEFF曲名,艺人\r\n花海,周杰伦\r\n"麻雀, 完整版",\r\n');
});

test('safeFileName drops Windows-illegal characters and never returns an empty stem', () => {
  assert.equal(safeFileName('我的收藏 2026/10/28'), '我的收藏 2026 10 28');
  assert.equal(safeFileName('a<b>c:d'), 'a b c d');
  assert.equal(safeFileName('   '), 'export');
  assert.equal(safeFileName('trailing.'), 'trailing');
});
