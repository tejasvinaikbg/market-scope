/**
 * Route tests for /api/portfolios against the real database: the sample file, every error code through HTTP
 * (including multer's size limit), and cleanup of everything the tests created.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { buildApp } from '../../src/app.ts';
import { db } from '../../src/db/knex.ts';

const server = buildApp().listen(0);
const base = `http://localhost:${(server.address() as { port: number }).port}`;
const created: number[] = [];
after(async () => {
  if (created.length) await db('portfolios').whereIn('id', created).del();   // stores go with them (ON DELETE CASCADE)
  server.close();
  await db.destroy();
});

const HEADER = 'store_name,address,city,state,country,category,latitude,longitude';

/** POST a file the way a browser form does (the API decides by extension, not mime type). Remembers created ids for cleanup. */
async function upload(content: string | Uint8Array<ArrayBuffer>, filename = 'stores.csv', name?: string) {   // Blob wants a plain ArrayBuffer-backed view
  const form = new FormData();
  if (name) form.append('name', name);
  form.append('file', new Blob([content], { type: 'text/csv' }), filename);
  const res = await fetch(`${base}/api/portfolios`, { method: 'POST', body: form });
  const body = await res.json();
  if (res.status === 201) created.push(body.id);
  return { status: res.status, body };
}

test('the sample file: 10 stores, 7 with coordinates, 3 to geocode, every category resolved', async () => {
  const file = await readFile(new URL('../../fixtures/sample_portfolio_bengaluru.csv', import.meta.url), 'utf8');
  const { status, body } = await upload(file, 'sample_portfolio_bengaluru.csv', 'test-sample');
  assert.equal(status, 201, JSON.stringify(body));
  assert.equal(body.name, 'test-sample');
  assert.deepEqual([body.rowCount, body.withCoords, body.withoutCoords], [10, 7, 3]);
  assert.deepEqual(body.warnings, []);

  const unresolved = await db('portfolio_stores').where({ portfolio_id: body.id }).whereNull('category_id').count('* as n').first();
  assert.equal(Number(unresolved?.n), 0);

  const one = await (await fetch(`${base}/api/portfolios/${body.id}`)).json();
  assert.equal(one.withCoords, 7);
  assert.ok(Math.abs(one.bounds.south - 12.9121) < 1e-6 && Math.abs(one.bounds.east - 77.7011) < 1e-6);   // HSR to Marathahalli
  const [{ id: emptyId }] = await db('portfolios').insert({ name: 'test-empty', source_filename: 'x.csv', row_count: 0 }).returning('id');
  created.push(emptyId);
  assert.equal((await (await fetch(`${base}/api/portfolios/${emptyId}`)).json()).bounds, null);
  const list = await (await fetch(`${base}/api/portfolios`)).json();
  assert.ok(list.some((p: { id: number }) => p.id === body.id));
});

test('an .xlsx uploads the same way', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Stores');
  sheet.addRow(HEADER.split(','));
  sheet.addRow(['A', 'Addr', 'Bengaluru', 'Karnataka', 'India', 'Supermarket', 12.9, 77.6]);
  const { status, body } = await upload(new Uint8Array(await workbook.xlsx.writeBuffer()), 'stores.xlsx');
  assert.equal(status, 201, JSON.stringify(body));
  assert.deepEqual([body.rowCount, body.withCoords], [1, 1]);
});

test('the name defaults to the filename without its extension', async () => {
  const { body } = await upload(`${HEADER}\nA,Addr,Bengaluru,Karnataka,India,Supermarket,,`, 'my stores.csv');
  assert.equal(body.name, 'my stores');
});

test('bad headers and bad rows are 400s with details, and nothing is stored', async () => {
  const mine = () => db('portfolios').where({ name: 'stores' }).count('* as n').first().then((r) => Number(r?.n));   // this suite's own rows: other suites delete theirs in parallel
  const before = await mine();
  const headers = await upload('store_name,address\nA,B');
  assert.equal(headers.status, 400);
  assert.equal(headers.body.error.code, 'INVALID_HEADERS');
  const rows = await upload(`${HEADER}\nA,Addr,Bengaluru,Karnataka,India,Supermarket,95,77.6`);
  assert.equal(rows.body.error.code, 'INVALID_ROWS');
  assert.equal(rows.body.error.details[0].row, 2);
  assert.equal(await mine(), before);
});

test('no file, wrong extension, and a file over 5 MB', async () => {
  const form = new FormData();
  form.append('name', 'nothing attached');
  const noFile = await fetch(`${base}/api/portfolios`, { method: 'POST', body: form });
  assert.equal((await noFile.json()).error.code, 'NO_FILE');

  assert.equal((await upload('x', 'stores.xls')).body.error.code, 'UNSUPPORTED_FILE');

  const big = await upload('a'.repeat(5 * 1024 * 1024 + 1));
  assert.equal(big.status, 400);
  assert.equal(big.body.error.code, 'FILE_TOO_LARGE');
});

test('an unknown portfolio is 404, a malformed id is 400', async () => {
  assert.equal((await fetch(`${base}/api/portfolios/999999`)).status, 404);
  assert.equal((await fetch(`${base}/api/portfolios/abc`)).status, 400);
});