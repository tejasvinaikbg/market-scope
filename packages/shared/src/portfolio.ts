/**
 * The portfolio file contract — what a valid upload looks like — as pure functions, so the API validates
 * with them and the upload screen can explain them (the HEADER VALIDATION rail, the "Max 5 MB" line).
 * Nothing here touches HTTP, files or the database: give it strings, get back rows or issues.
 */

/** Column names after normalisation. "Store Name", "store-name" and " STORE_NAME " all become store_name. */
export const REQUIRED_COLUMNS = ['store_name', 'address', 'city', 'state', 'country', 'category'] as const;
export const OPTIONAL_COLUMNS = ['latitude', 'longitude'] as const;
export type KnownColumn = (typeof REQUIRED_COLUMNS)[number] | (typeof OPTIONAL_COLUMNS)[number];

/** Limits from the design ("Max 5 MB") and common sense. Quoted by the API's errors and by the UI. */
export const PORTFOLIO_LIMITS = {
  maxFileBytes: 5 * 1024 * 1024, // the design's drop zone says "Max 5 MB"
  maxRows: 50_000, // a 5 MB CSV of one-line stores is ~40k rows; beyond that it is a dump, not a portfolio
  maxReportedIssues: 50, // enough to fix the file, not enough to flood the response
} as const;

/** One thing wrong with the file. `row` is the spreadsheet row (the header is row 1), so it matches what Excel shows. */
export interface FileIssue {
  row?: number;
  column?: string;
  message: string;
}

/** A data row after validation: trimmed strings, numbers parsed, coordinates both present or both null. */
export interface PortfolioRowInput {
  rowNumber: number;
  storeName: string;
  address: string;
  city: string;
  state: string;
  country: string;
  category: string;
  latitude: number | null;
  longitude: number | null;
}

/** BOM off, trimmed, lower-cased, runs of spaces/dashes → one underscore. */
export const normaliseHeader = (raw: string): string =>
  raw
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

export interface HeaderCheck {
  ok: boolean;
  errors: FileIssue[]; // missing required, duplicate, lone latitude/longitude
  warnings: FileIssue[]; // unknown columns — accepted and ignored
  columnIndex: Partial<Record<KnownColumn, number>>; // where each known column sits in a raw row
}

/** Check the header row. Reports EVERY problem at once: the user should fix the file once, not once per column. */
export function validateHeaders(rawHeaders: string[]): HeaderCheck {
  const errors: FileIssue[] = [];
  const warnings: FileIssue[] = [];
  const columnIndex: Partial<Record<KnownColumn, number>> = {};
  const known = new Set<string>([...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]);
  const seen = new Set<string>();

  rawHeaders.forEach((raw, i) => {
    const name = normaliseHeader(raw);
    if (name === '') return; // a trailing empty header cell is not a column
    if (seen.has(name)) {
      errors.push({ column: name, message: `duplicate column "${name}"` });
      return;
    }
    seen.add(name);
    if (known.has(name)) columnIndex[name as KnownColumn] = i;
    else warnings.push({ column: raw, message: `unknown column "${raw}" will be ignored` });
  });

  for (const col of REQUIRED_COLUMNS) {
    if (columnIndex[col] === undefined) errors.push({ column: col, message: `missing required column "${col}"` });
  }
  const hasLat = columnIndex.latitude !== undefined,
    hasLng = columnIndex.longitude !== undefined;
  if (hasLat !== hasLng) errors.push({ column: hasLat ? 'longitude' : 'latitude', message: 'latitude and longitude must be provided together' });

  return { ok: errors.length === 0, errors, warnings, columnIndex };
}

/** True when every cell is blank — a stray empty line in the file, not a store. */
export const isBlankRow = (cells: string[]): boolean => cells.every((c) => (c ?? '').trim() === '');

/**
 * Validate one data row against the header map. Returns the typed row, or every issue found in it.
 * A required column must carry a value, not merely exist in the header: a short row (fewer cells than
 * headers) would otherwise import with an empty city and later produce a meaningless geocoder query.
 */
export function parseRow(cells: string[], columnIndex: HeaderCheck['columnIndex'], rowNumber: number): { row: PortfolioRowInput | null; issues: FileIssue[] } {
  const issues: FileIssue[] = [];
  const get = (col: KnownColumn): string => {
    const i = columnIndex[col];
    return i === undefined ? '' : (cells[i] ?? '').trim();
  };

  for (const col of REQUIRED_COLUMNS) {
    if (get(col) === '') issues.push({ row: rowNumber, column: col, message: `${col} is required` });
  }

  // Coordinates: both or neither. A store with only a latitude is not "half placed", it is unplaced.
  const latRaw = get('latitude'),
    lngRaw = get('longitude');
  let latitude: number | null = null,
    longitude: number | null = null;
  if (latRaw !== '' || lngRaw !== '') {
    if (latRaw === '' || lngRaw === '') {
      issues.push({ row: rowNumber, column: latRaw === '' ? 'latitude' : 'longitude', message: 'latitude and longitude must both be present or both blank' });
    } else {
      latitude = Number(latRaw);
      longitude = Number(lngRaw); // Number('12abc') is NaN → caught below
      if (!Number.isFinite(latitude) || Math.abs(latitude) > 90)
        issues.push({ row: rowNumber, column: 'latitude', message: `latitude "${latRaw}" must be a number between -90 and 90` });
      if (!Number.isFinite(longitude) || Math.abs(longitude) > 180)
        issues.push({ row: rowNumber, column: 'longitude', message: `longitude "${lngRaw}" must be a number between -180 and 180` });
    }
  }

  if (issues.length) return { row: null, issues };
  return {
    row: {
      rowNumber,
      storeName: get('store_name'),
      address: get('address'),
      city: get('city'),
      state: get('state'),
      country: get('country'),
      category: get('category'),
      latitude,
      longitude,
    },
    issues,
  };
}
