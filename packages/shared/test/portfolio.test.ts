/**
 * Unit tests for the portfolio file contract: header normalisation and every header/row rule. No I/O.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateHeaders, parseRow, isBlankRow, normaliseHeader, REQUIRED_COLUMNS } from '../src/portfolio.ts';

const good = ['store_name', 'address', 'city', 'state', 'country', 'category', 'latitude', 'longitude'];

test('normaliseHeader forgives case, spaces, dashes and a BOM', () => {
  assert.equal(normaliseHeader('﻿Store Name'), 'store_name');
  assert.equal(normaliseHeader(' store-name '), 'store_name');
});

test('a good header maps every column to its index', () => {
  const h = validateHeaders(good);
  assert.equal(h.ok, true);
  assert.deepEqual(h.errors, []);
  assert.equal(h.columnIndex.longitude, 7);
});

test('all missing required columns are reported at once', () => {
  const h = validateHeaders(['store_name', 'address']);
  assert.equal(h.ok, false);
  assert.deepEqual(
    h.errors.map((e) => e.column),
    ['city', 'state', 'country', 'category'],
  );
});

test('unknown columns warn, do not fail; duplicates and a lone latitude fail', () => {
  const unknown = validateHeaders([...REQUIRED_COLUMNS, 'phone']);
  assert.equal(unknown.ok, true);
  assert.equal(unknown.warnings[0]?.column, 'phone');

  const dup = validateHeaders([...REQUIRED_COLUMNS, 'city']);
  assert.match(dup.errors[0]?.message ?? '', /duplicate column "city"/);

  const lone = validateHeaders([...REQUIRED_COLUMNS, 'latitude']);
  assert.equal(lone.errors[0]?.column, 'longitude');
});

test('parseRow: a complete row with coordinates', () => {
  const { columnIndex } = validateHeaders(good);
  const { row, issues } = parseRow(['FreshMart', '80 Feet Road', 'Bengaluru', 'Karnataka', 'India', 'Supermarket', ' 12.9352 ', '77.6245'], columnIndex, 2);
  assert.deepEqual(issues, []);
  assert.equal(row?.storeName, 'FreshMart');
  assert.equal(row?.latitude, 12.9352);
});

test('parseRow: blank coordinates mean "geocode later", not an error', () => {
  const { columnIndex } = validateHeaders(good);
  const { row } = parseRow(['A', 'B', 'C', 'D', 'E', 'F', '', ''], columnIndex, 2);
  assert.equal(row?.latitude, null);
  assert.equal(row?.longitude, null);
});

test('parseRow: short row, lone coordinate, out-of-range and non-numeric values', () => {
  const { columnIndex } = validateHeaders(good);
  const short = parseRow(['A', 'B', 'C'], columnIndex, 3); // ragged row: fewer cells than headers
  assert.deepEqual(
    short.issues.map((i) => i.column),
    ['state', 'country', 'category'],
  );

  const lone = parseRow(['A', 'B', 'C', 'D', 'E', 'F', '12.9', ''], columnIndex, 4);
  assert.equal(lone.issues[0]?.column, 'longitude');

  const range = parseRow(['A', 'B', 'C', 'D', 'E', 'F', '95', 'east'], columnIndex, 5);
  assert.deepEqual(
    range.issues.map((i) => i.column),
    ['latitude', 'longitude'],
  );
  assert.equal(range.issues[0]?.row, 5);
});

test('isBlankRow', () => {
  assert.equal(isBlankRow(['', ' ', '']), true);
  assert.equal(isBlankRow(['', 'x']), false);
});
