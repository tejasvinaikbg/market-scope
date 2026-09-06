/** The stores path: filters become the query string the API reads, and "everything" sends nothing. */
import { storesPath } from '@/api/hooks';

test('no filters is the bare path', () => {
  expect(storesPath(7, {})).toBe('/markets/7/stores');
  expect(storesPath(7, { layers: [], categories: [], q: '   ' })).toBe('/markets/7/stores');   // empty lists and blank search count as none
});

test('each filter in its place, lists as commas, the search encoded', () => {
  expect(storesPath(7, { layers: ['discovered', 'portfolio_inside'] })).toBe('/markets/7/stores?layers=discovered,portfolio_inside');
  expect(storesPath(7, { layers: ['matched'] })).toBe('/markets/7/stores?layers=matched');
  expect(storesPath(7, { categories: ['pharmacy'], q: ' fresh mart ' })).toBe('/markets/7/stores?categories=pharmacy&q=fresh%20mart');
});
