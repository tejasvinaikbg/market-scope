/**
 * Bytes → validated rows, or a 400 that lists what is wrong. No database here.
 * Two file formats, one seam: .csv through csv-parse, .xlsx through exceljs, both reduced to the same
 * string[][] (index 0 = header, index i = spreadsheet row i + 1) before the shared contract checks them.
 * Order matters: file checks, then the header, then the rows. Header errors stop the process — row errors
 * against wrong columns would be noise.
 */
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { validateHeaders, parseRow, isBlankRow, PORTFOLIO_LIMITS, type FileIssue, type PortfolioRowInput } from '@market-scope/shared';
import { badRequest, isAppError } from '../lib/errors.ts';

export interface ParsedPortfolioFile { rows: PortfolioRowInput[]; warnings: FileIssue[] }

/** A spreadsheet cell as the text a user sees: numbers as written, rich text flattened, formulas by their result. */
function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((part) => part.text).join('');
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);   // a formula: what it evaluated to
    if ('text' in value) return String(value.text);                               // a hyperlink: its visible text
    return '';                                                                     // an error cell (#N/A …) is empty
  }
  return String(value);
}

/** Either format → the same shape: records[0] is the header, records[i] is spreadsheet row i + 1, blank rows kept as []. */
async function toRecords(buffer: Buffer, filename: string): Promise<string[][]> {
  if (/\.csv$/i.test(filename)) {
    // bom: Excel writes a byte-order mark; relax_column_count: a short row is a row error for us to report, not a parse error.
    return parse(buffer, { bom: true, relax_column_count: true }) as string[][];
  }
  // exceljs types this parameter as an ArrayBuffer; at runtime it reads a Node Buffer as-is (lib/xlsx/xlsx.js, load), so the cast is honest.
  const workbook = await new ExcelJS.Workbook().xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];                                             // the first sheet is the portfolio
  if (!sheet) throw badRequest('INVALID_FILE', 'Workbook has no sheets');
  const records: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, n) => {                               // includeEmpty keeps row numbers honest
    records[n - 1] = Array.from(row.values as ExcelJS.CellValue[]).slice(1).map(cellText);   // row.values is 1-based; [0] is unused
  });
  return records;
}

export async function parsePortfolioFile(buffer: Buffer, filename: string): Promise<ParsedPortfolioFile> {
  if (!/\.(csv|xlsx)$/i.test(filename)) throw badRequest('UNSUPPORTED_FILE', 'Only .csv and .xlsx files are accepted', [{ message: `got "${filename}"` }]);
  if (buffer.length === 0) throw badRequest('INVALID_FILE', 'File is empty');

  let records: string[][];
  try {
    records = await toRecords(buffer, filename);
  } catch (err) {
    if (isAppError(err)) throw err;                                                 // our own "no sheets" passes through
    throw badRequest('INVALID_FILE', 'File is not readable', [{ message: (err as Error).message }]);
  }

  const [header, ...data] = records;
  if (!header) throw badRequest('INVALID_FILE', 'File is empty');
  const headers = validateHeaders(header);
  if (!headers.ok) throw badRequest('INVALID_HEADERS', 'Header row is invalid', headers.errors);

  const rows: PortfolioRowInput[] = [];
  const issues: FileIssue[] = [];
  data.forEach((cells, i) => {
    if (isBlankRow(cells)) return;                                        // an empty line is not a store
    const result = parseRow(cells, headers.columnIndex, i + 2);           // + 2: the header is spreadsheet row 1
    if (result.row) rows.push(result.row); else issues.push(...result.issues);
  });
  if (issues.length) {
    const rowsHit = new Set(issues.map((i) => i.row)).size;
    throw badRequest('INVALID_ROWS', `${issues.length} problem(s) in ${rowsHit} row(s)`, issues.slice(0, PORTFOLIO_LIMITS.maxReportedIssues));
  }
  if (rows.length === 0) throw badRequest('INVALID_FILE', 'File has a header but no data rows');
  if (rows.length > PORTFOLIO_LIMITS.maxRows) throw badRequest('TOO_MANY_ROWS', `File has ${rows.length} rows; the limit is ${PORTFOLIO_LIMITS.maxRows}`);
  return { rows, warnings: headers.warnings };
}