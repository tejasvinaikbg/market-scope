/**
 * Unit tests for the boundary maths: area, validation, tiling with no gaps, the default square.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bboxAreaSqKm,
  validateBbox,
  splitBbox,
  squareAround,
  pointInBbox,
  translateBbox,
  bboxFromCorners,
  padBbox,
  bboxDimensionsKm,
} from '../src/geo.ts';

// Koramangala–HSR, roughly 5 km × 4 km.
const blr = { south: 12.92, west: 77.60, north: 12.956, east: 77.646 };

test('bboxAreaSqKm gives ~20 km² for a known Bengaluru rectangle', () => {
  const area = bboxAreaSqKm(blr);                       // 0.036° lat ≈ 4.0 km; 0.046° lon × cos(12.94°) ≈ 4.99 km
  assert.ok(area > 19.5 && area < 20.5, `area ${area}`);
});

test('bboxAreaSqKm is zero for a degenerate box', () => {
  assert.equal(bboxAreaSqKm({ south: 12.9, west: 77.6, north: 12.9, east: 77.7 }), 0);
});

test('validateBbox names the rule that failed', () => {
  assert.equal(validateBbox(blr), null);
  assert.match(validateBbox({ ...blr, south: 13 })!, /south must be less than north/);
  assert.match(validateBbox({ ...blr, west: 78 })!, /west must be less than east/);
  assert.match(validateBbox({ ...blr, north: 91 })!, /latitude/);
  assert.match(validateBbox({ ...blr, east: NaN })!, /finite/);
});

test('splitBbox covers the box exactly: no gaps, no overshoot, areas add up', () => {
  const tiles = splitBbox(blr, 3);
  assert.equal(tiles.length, 4);                        // 5 km / 3 → 2 cols, 4 km / 3 → 2 rows
  const union = {
    south: Math.min(...tiles.map((t) => t.south)), north: Math.max(...tiles.map((t) => t.north)),
    west: Math.min(...tiles.map((t) => t.west)), east: Math.max(...tiles.map((t) => t.east)),
  };
  assert.deepEqual(union, blr);
  const summed = tiles.reduce((s, t) => s + bboxAreaSqKm(t), 0);
  assert.ok(Math.abs(summed - bboxAreaSqKm(blr)) < 1e-6);
  for (const t of tiles) assert.equal(validateBbox(t), null);
});

test('splitBbox returns one tile for a box smaller than the tile, and rejects a non-positive tile', () => {
  assert.equal(splitBbox(blr, 50).length, 1);
  assert.throws(() => splitBbox(blr, 0));
});

test('squareAround yields the requested area, centred on the point', () => {
  const box = squareAround({ lat: 12.97, lng: 77.59 }, 30);
  assert.ok(Math.abs(bboxAreaSqKm(box) - 30) < 0.3);
  assert.ok(pointInBbox({ lat: 12.97, lng: 77.59 }, box));
});


test('translateBbox keeps the size, bboxFromCorners normalises any order, padBbox grows every side', () => {
  const moved = translateBbox(blr, 0.01, -0.02);
  assert.ok(Math.abs(bboxAreaSqKm(moved) - bboxAreaSqKm(blr)) < 0.01);
  assert.equal(moved.north - moved.south, blr.north - blr.south);

  const flipped = bboxFromCorners({ lat: 12.956, lng: 77.646 }, { lat: 12.92, lng: 77.60 });   // NE given first
  assert.deepEqual(flipped, blr);
  assert.equal(validateBbox(bboxFromCorners({ lat: 12.93, lng: 77.61 }, { lat: 12.95, lng: 77.64 })), null);

  const padded = padBbox(blr, 1);
  assert.ok(padded.south < blr.south && padded.north > blr.north && padded.west < blr.west && padded.east > blr.east);
  assert.ok(Math.abs(bboxDimensionsKm(padded).heightKm - (bboxDimensionsKm(blr).heightKm + 2)) < 0.01);
});