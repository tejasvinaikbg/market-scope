/**
 * Unit tests for the file parser: every rejection code, the header short-circuit, spreadsheet row numbers,
 * and the .xlsx path (workbooks are built in the test, so no binary fixtures). No database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { parsePortfolioFile } from '../../../src/services/portfolio-file.ts';
import { isAppError, type AppError } from '../../../src/lib/errors.ts';

const HEADER = 'store_name,address,city,state,country,category,latitude,longitude';
const csv = (...lines: string[]) => Buffer.from([HEADER, ...lines].join('\n'));

/** Builds a one-sheet workbook from rows of cell values, the way Excel would save it. */
async function xlsx(rows: ExcelJS.CellValue[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Stores');
  rows.forEach((r) => sheet.addRow(r));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Calls the parser expecting an AppError, and returns it so the test can read its code and details. */
async function reject(buffer: Buffer, filename = 'stores.csv'): Promise<AppError> {
  try { await parsePortfolioFile(buffer, filename); } catch (err) { if (isAppError(err)) return err; throw err; }
  assert.fail('expected the file to be rejected');
}

test('a good file becomes rows with parsed coordinates', async () => {
  const { rows, warnings } = await parsePortfolioFile(csv('A,Addr,Bengaluru,Karnataka,India,Supermarket,12.9,77.6', 'B,Addr,Bengaluru,Karnataka,India,Pharmacy,,'), 'stores.csv');
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0]?.latitude, rows[1]?.latitude], [12.9, null]);
  assert.deepEqual(warnings, []);
});

test('only .csv and .xlsx are accepted; empty files are rejected', async () => {
  assert.equal((await reject(csv('A,B,C,D,E,F,,'), 'stores.xls')).code, 'UNSUPPORTED_FILE');     // the old binary format
  assert.equal((await reject(Buffer.alloc(0))).code, 'INVALID_FILE');
  assert.equal((await reject(Buffer.from(HEADER + '\n'))).code, 'INVALID_FILE');                  // a header with no data rows
});

test('header errors are reported alone, before any row is looked at', async () => {
  const err = await reject(Buffer.from('store_name,address\nA,B'));
  assert.equal(err.code, 'INVALID_HEADERS');
  assert.deepEqual((err.details as Array<{ column: string }>).map((d) => d.column), ['city', 'state', 'country', 'category']);
});

test('row issues name the spreadsheet row and column; blank lines are skipped', async () => {
  const err = await reject(csv('A,Addr,Bengaluru,Karnataka,India,Supermarket,95,77.6', '', ',Addr,Bengaluru,Karnataka,India,Pharmacy,,'));
  assert.equal(err.code, 'INVALID_ROWS');
  assert.deepEqual(err.details, [
    { row: 2, column: 'latitude', message: 'latitude "95" must be a number between -90 and 90' },
    { row: 4, column: 'store_name', message: 'store_name is required' },
  ]);
});

test('a BOM and quoted commas parse; an unknown column is a warning, not an error', async () => {
  const file = Buffer.from('﻿' + HEADER + ',phone\n"Fresh, Mart","80 Feet Road, Koramangala",Bengaluru,Karnataka,India,Supermarket,,,123');
  const { rows, warnings } = await parsePortfolioFile(file, 'stores.csv');
  assert.equal(rows[0]?.storeName, 'Fresh, Mart');
  assert.equal(warnings[0]?.column, 'phone');
});

test('a broken quote is INVALID_FILE, not a crash', async () => {
  assert.equal((await reject(csv('"A,Addr,Bengaluru,Karnataka,India,Supermarket,,'))).code, 'INVALID_FILE');
});

test('an .xlsx parses like a CSV: numbers, rich text and blank rows, with spreadsheet row numbers', async () => {
  const file = await xlsx([
    HEADER.split(','),
    ['FreshMart', '80 Feet Road', 'Bengaluru', 'Karnataka', 'India', 'Supermarket', 12.9352, 77.6245],   // numbers, as Excel stores them
    [],                                                                                                  // a blank row 3
    [{ richText: [{ text: 'Rich ' }, { text: 'Mart' }] }, 'Addr', 'Bengaluru', 'Karnataka', 'India', 'Pharmacy'],   // bold name, no coordinates
  ]);
  const { rows } = await parsePortfolioFile(file, 'stores.xlsx');
  assert.deepEqual(rows.map((r) => [r.rowNumber, r.storeName, r.latitude]), [[2, 'FreshMart', 12.9352], [4, 'Rich Mart', null]]);
});

test('in an .xlsx a formula counts by its result; a file that is not a workbook is INVALID_FILE', async () => {
  const file = await xlsx([HEADER.split(','), ['A', 'Addr', 'Bengaluru', 'Karnataka', 'India', 'Supermarket', { formula: '90+5', result: 95 }, 77.6]]);
  const err = await reject(file, 'stores.xlsx');
  assert.equal(err.code, 'INVALID_ROWS');
  assert.deepEqual(err.details, [{ row: 2, column: 'latitude', message: 'latitude "95" must be a number between -90 and 90' }]);
  assert.equal((await reject(Buffer.from('not a zip'), 'stores.xlsx')).code, 'INVALID_FILE');
});