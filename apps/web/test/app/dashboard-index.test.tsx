/** The bare dashboard route: the notice or this session's market, and every previous market as a link. */
import { screen } from '@testing-library/react';
import Page from '@/app/dashboard/page';
import { renderApp, mockApi } from '../helpers';

jest.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));

const market = (id: number, extra: Record<string, unknown>) => ({
  id, name: `Market ${id}`, portfolioId: 1, portfolioName: 'sample', cityId: 1, cityName: 'Bengaluru',
  boundary: { south: 12.92, west: 77.6, north: 12.956, east: 77.646 }, areaSqKm: 19.8797, placesProvider: 'overpass', geocoderProvider: 'nominatim',
  categories: [{ id: 1, slug: 'supermarket', name: 'Supermarket' }], createdAt: '2026-09-06T10:00:00Z',
  status: 'ready', error: null, startedAt: null, completedAt: null, storeCount: 71, progress: null, geocoding: { total: 0, done: 0, failed: 0 }, placement: { inside: 0, outside: 0, unlocated: 0 },
  ...extra,
});

test('with no markets at all: the notice and the way to setup, nothing else', async () => {
  mockApi({ 'GET /api/markets': { body: [] } });
  renderApp(<Page />);
  expect(await screen.findByText('No market created yet.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Back to market setup/ })).toHaveAttribute('href', '/setup');
  expect(screen.queryByText(/Previous markets/)).not.toBeInTheDocument();
});

test('previous markets are listed newest first, each a link to its dashboard with its status in a word', async () => {
  mockApi({ 'GET /api/markets': { body: [market(9, { status: 'partial', storeCount: 12 }), market(7, {}), market(3, { status: 'failed', storeCount: 0 })] } });
  renderApp(<Page />);
  expect(await screen.findByText('Previous markets · 3')).toBeInTheDocument();
  const links = screen.getAllByRole('link', { name: /Market \d/ });
  expect(links.map((l) => l.getAttribute('href'))).toEqual(['/dashboard/9', '/dashboard/7', '/dashboard/3']);
  expect(links[0]).toHaveTextContent('done with gaps');
  expect(links[0]).toHaveTextContent('12 stores');
  expect(links[1]).toHaveTextContent('Bengaluru · 19.9 km² · Supermarket');
  expect(links[1]).toHaveTextContent('done');
  expect(links[2]).toHaveTextContent('failed');
});

test('when the service cannot be reached, the page says so', async () => {
  jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
  renderApp(<Page />);
  expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent("Couldn't reach the service");   // a request with no answer is retried once, a second later
});
