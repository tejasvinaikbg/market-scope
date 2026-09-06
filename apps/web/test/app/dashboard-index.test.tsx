/** The bare dashboard route: the notice or this session's market, and every previous market as a link. */
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Page from '@/app/dashboard/page';
import { renderApp, mockApi } from '../helpers';

jest.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));

const market = (id: number, extra: Record<string, unknown>) => ({
  id,
  name: `Market ${id}`,
  portfolioId: 1,
  portfolioName: 'sample',
  cityId: 1,
  cityName: 'Bengaluru',
  boundary: { south: 12.92, west: 77.6, north: 12.956, east: 77.646 },
  areaSqKm: 19.8797,
  placesProvider: 'overpass',
  geocoderProvider: 'nominatim',
  categories: [{ id: 1, slug: 'supermarket', name: 'Supermarket' }],
  createdAt: '2026-09-06T10:00:00Z',
  status: 'ready',
  error: null,
  startedAt: null,
  completedAt: null,
  storeCount: 71,
  progress: null,
  geocoding: { total: 0, done: 0, failed: 0 },
  placement: { inside: 0, outside: 0, unlocated: 0 },
  matched: 0,
  busy: false,
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
  const links = screen.getAllByRole('link', { name: /^Market \d/ }); // the rows, not their edit controls
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
  expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent("Couldn't reach the service"); // a request with no answer is retried once, a second later
});

test('a finished market can be deleted from its row, asked first; a running one cannot', async () => {
  const two = [market(9, { status: 'running', busy: true }), market(7, {})];
  let listed = two;
  const spy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (init?.method === 'DELETE' && url.endsWith('/api/markets/7')) {
      listed = [two[0]];
      return { ok: true, status: 204, statusText: '204', json: async () => undefined } as Response;
    }
    return { ok: true, status: 200, statusText: '200', json: async () => listed } as Response;
  });
  renderApp(<Page />);
  await screen.findByText('Previous markets · 2');
  expect(screen.queryByRole('button', { name: 'Delete Market 9' })).not.toBeInTheDocument(); // running: no delete
  expect(screen.queryByRole('link', { name: 'Edit Market 9' })).not.toBeInTheDocument(); // nor edit
  expect(screen.getByRole('link', { name: 'Edit Market 7' })).toHaveAttribute('href', '/setup?market=7');
  await userEvent.click(screen.getByRole('button', { name: 'Delete Market 7' }));
  const dialog = screen.getByRole('alertdialog', { name: 'Delete Market 7?' });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Delete Market 7' }));
  await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(screen.getByText('Previous markets · 1')).toBeInTheDocument()); // the list was re-read without it
  expect(spy.mock.calls.some(([url, init]) => String(url).endsWith('/api/markets/7') && init?.method === 'DELETE')).toBe(true);
  expect(screen.queryByRole('link', { name: /Market 7/ })).not.toBeInTheDocument();
});
