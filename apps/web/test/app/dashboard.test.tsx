/** Dashboard route for one market: what the server stored, and discovery's state in the user's words for every status. */
import { screen } from '@testing-library/react';
import Page from '@/app/dashboard/[id]/page';
import { renderApp, mockApi } from '../helpers';

jest.mock('next/navigation', () => ({ usePathname: () => '/dashboard/7', useParams: () => ({ id: '7' }) }));

const base = {
  id: 7, name: 'Bengaluru · sample', portfolioId: 1, portfolioName: 'sample', cityId: 1, cityName: 'Bengaluru',
  boundary: { south: 12.92, west: 77.6, north: 12.956, east: 77.646 }, areaSqKm: 19.8797, placesProvider: 'overpass', geocoderProvider: 'nominatim',
  categories: [{ id: 1, slug: 'supermarket', name: 'Supermarket' }, { id: 2, slug: 'pharmacy', name: 'Pharmacy' }], createdAt: '',
  status: 'pending', error: null, startedAt: null, completedAt: null, storeCount: 0, progress: null, geocoding: { total: 3, done: 0, failed: 0 },
};
const withMarket = (overrides: Record<string, unknown>) => mockApi({ 'GET /api/markets/7': { body: { ...base, ...overrides } } });

test('shows the market as the server stored it, queued', async () => {
  withMarket({});
  renderApp(<Page />);
  expect(await screen.findByRole('heading', { name: 'Bengaluru · sample' })).toBeInTheDocument();
  expect(screen.getByText('Bengaluru · 19.9 km² · portfolio sample')).toBeInTheDocument();
  expect(screen.getByText('Pharmacy')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Discovery is queued');
});

test('running shows progress and the count so far; ready shows the total', async () => {
  withMarket({ status: 'running', storeCount: 47, progress: { tiles: 4, done: 2, failed: 0 } });
  renderApp(<Page />);
  expect(await screen.findByRole('status')).toHaveTextContent('Discovering stores… 2 of 4 areas searched · 47 found so far');
});

test('while the portfolio is being located, the page says so before discovery starts', async () => {
  withMarket({ status: 'running', progress: null, geocoding: { total: 3, done: 1, failed: 1 } });
  renderApp(<Page />);
  expect(await screen.findByRole('status')).toHaveTextContent('Locating your stores from their addresses… 2 of 3');
});

test('ready, partial and failed each say what happened', async () => {
  withMarket({ status: 'ready', storeCount: 71, progress: { tiles: 4, done: 4, failed: 0 }, completedAt: '2026-09-06T10:00:00Z', geocoding: { total: 3, done: 2, failed: 1 } });
  const { unmount } = renderApp(<Page />);
  expect(await screen.findByRole('status')).toHaveTextContent('71 stores discovered across 4 areas. 2 of 3 of your stores located from their address, 1 not found.');
  unmount();

  withMarket({ status: 'partial', storeCount: 50, progress: { tiles: 4, done: 4, failed: 1 }, error: 'tile 2/4: overpass 504 from https://a/' });
  const second = renderApp(<Page />);
  expect(await screen.findByRole('status')).toHaveTextContent('50 stores discovered; 1 of 4 areas could not be searched.');
  expect(screen.getByText('tile 2/4: overpass 504 from https://a/')).toBeInTheDocument();
  second.unmount();

  withMarket({ status: 'failed', storeCount: 0, progress: { tiles: 4, done: 4, failed: 4 }, error: 'tile 1/4: down; …' });
  renderApp(<Page />);
  expect(await screen.findByRole('status')).toHaveTextContent('Discovery failed. No area could be searched.');
});

test('an unknown market says so, with a way back', async () => {
  mockApi({ 'GET /api/markets/7': { status: 404, body: { error: { code: 'NOT_FOUND', message: 'market not found' } } } });
  renderApp(<Page />);
  expect(await screen.findByRole('alert')).toHaveTextContent('This market could not be loaded');
});