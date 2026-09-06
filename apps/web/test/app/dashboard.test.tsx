/**
 * Dashboard route for one market: what the server stored and discovery's state in the user's words for every status; then,
 * once there are stores, the totals, the layer and category chips, the search, the list with its tags, the stores that are
 * off the map, and the footer. The map is a stand-in that prints the ids it was given, so the test can see that map and list
 * draw the same rows. Every filter is checked at the request the page sends.
 */
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Page from '@/app/dashboard/[id]/page';
import { Stepper } from '@/components/Stepper';
import { renderApp, mockApi } from '../helpers';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ usePathname: () => '/dashboard/7', useParams: () => ({ id: '7' }), useRouter: () => ({ push: mockPush }) }));
// Leaflet needs a real browser; the stand-in shows which stores reached the map. __esModule so the dynamic import sees a default export.
jest.mock('@/components/MarketMap', () => ({
  __esModule: true,
  default: (p: { stores: { id: string }[]; selectedId: string | null; onSelect: (id: string) => void }) => (
    <div data-testid="map" data-selected={p.selectedId ?? ''}>
      {p.stores.map((s) => s.id).join(' ')}
      {/* a stand-in for a click on a badge */}
      {p.stores.map((s) => <button key={s.id} type="button" onClick={() => p.onSelect(s.id)}>badge {s.id}</button>)}
    </div>
  ),
}));

const supermarket = { id: 1, slug: 'supermarket', name: 'Supermarket' };
const pharmacy = { id: 2, slug: 'pharmacy', name: 'Pharmacy' };
const base = {
  id: 7, name: 'Bengaluru · sample', portfolioId: 1, portfolioName: 'sample', cityId: 1, cityName: 'Bengaluru',
  boundary: { south: 12.92, west: 77.6, north: 12.956, east: 77.646 }, areaSqKm: 19.8797, placesProvider: 'overpass', geocoderProvider: 'nominatim',
  categories: [supermarket, pharmacy], createdAt: '',
  status: 'pending', error: null, startedAt: null, completedAt: null, storeCount: 0, progress: null, geocoding: { total: 3, done: 0, failed: 0 }, placement: { inside: 0, outside: 0, unlocated: 0 }, matched: 0,
};
const ready = {
  status: 'ready', storeCount: 2, progress: { tiles: 4, done: 4, failed: 0 }, completedAt: '2026-09-06T10:00:00Z',
  geocoding: { total: 3, done: 2, failed: 1 }, placement: { inside: 1, outside: 1, unlocated: 1 },
};
const fresh = { id: 'd:1', layer: 'discovered', name: 'FreshMart Koramangala', category: supermarket, lat: 12.93, lng: 77.62, address: '80 Feet Road', source: 'overpass', match: null };
const apollo = { id: 'd:2', layer: 'discovered', name: 'Apollo Pharmacy', category: pharmacy, lat: 12.94, lng: 77.63, address: null, source: 'overpass', match: null };
const inside = { id: 'p:1', layer: 'portfolio_inside', name: 'Our Koramangala store', category: supermarket, lat: 12.935, lng: 77.625, address: '5th Block', source: 'uploaded', match: null };
const outside = { id: 'p:2', layer: 'portfolio_outside', name: 'Our Whitefield store', category: supermarket, lat: 12.97, lng: 77.75, address: 'ITPL Main Road', source: 'geocoded', match: null };
const hsr = { id: 'p:3', name: 'Our HSR store', category: supermarket, address: '27th Main', reason: 'not_found' };
const counts = { discovered: 2, portfolioInside: 1, portfolioOutside: 1, portfolioUnlocated: 1, matched: 0 };
const all = { stores: [fresh, apollo, inside, outside], unlocated: [hsr], counts };
const none = { stores: [], unlocated: [], counts: { discovered: 0, portfolioInside: 0, portfolioOutside: 0, portfolioUnlocated: 0, matched: 0 } };

/** The market as given, and the stores endpoint answering per query string; a filter the test did not list fails loudly. */
const withMarket = (overrides: Record<string, unknown>, stores: Record<string, unknown> = {}) =>
  mockApi({ 'GET /api/markets/7': { body: { ...base, ...overrides } }, ...Object.fromEntries(Object.entries(stores).map(([qs, body]) => [`GET /api/markets/7/stores${qs}`, { body }])) });

test('shows the market as the server stored it, queued: no totals, no controls yet', async () => {
  withMarket({});
  renderApp(<Page />);
  expect(await screen.findByRole('heading', { name: 'Bengaluru · sample' })).toBeInTheDocument();
  expect(screen.getByText('Bengaluru · 19.9 km² · portfolio sample')).toBeInTheDocument();
  expect(screen.getByText('Supermarket · Pharmacy')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Discovery is queued');
  expect(screen.queryByRole('definition')).not.toBeInTheDocument();
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  expect(screen.getByTestId('map')).toBeEmptyDOMElement();
});

test('running shows progress, the totals so far, and the stores found so far', async () => {
  withMarket({ status: 'running', storeCount: 2, progress: { tiles: 4, done: 2, failed: 0 } }, { '': { stores: [fresh, apollo], unlocated: [], counts: { ...counts, portfolioInside: 0, portfolioOutside: 0, portfolioUnlocated: 0 } } });
  renderApp(<Page />);
  expect(await screen.findByRole('status')).toHaveTextContent('Discovering stores… 2 of 4 areas searched · 2 found so far');
  expect(await screen.findByText('FreshMart Koramangala')).toBeInTheDocument();
  expect(screen.getAllByRole('definition').map((d) => d.textContent)).toEqual(['2', '0', '0', '0', '0']);
});

test('while the portfolio is being located, the page says so before discovery starts', async () => {
  withMarket({ status: 'running', progress: null, geocoding: { total: 3, done: 1, failed: 1 } }, { '': none });
  renderApp(<Page />);
  expect(await screen.findByRole('status')).toHaveTextContent('Locating your stores from their addresses… 2 of 3');
});

test('ready, partial and failed each say what happened', async () => {
  withMarket({ ...ready, storeCount: 71, placement: { inside: 1, outside: 8, unlocated: 1 } }, { '': none });
  const first = renderApp(<Page />);
  expect(await screen.findByRole('status')).toHaveTextContent('71 stores discovered across 4 areas. 2 of 3 of your stores located from their address, 1 not found. 1 of your 10 stores inside the boundary, 8 outside, 1 without a location.');
  first.unmount();

  withMarket({ status: 'partial', storeCount: 50, progress: { tiles: 4, done: 4, failed: 1 }, error: 'tile 2/4: overpass 504 from https://a/' }, { '': none });
  const second = renderApp(<Page />);
  expect(await screen.findByRole('status')).toHaveTextContent('50 stores discovered; 1 of 4 areas could not be searched.');
  expect(screen.getByText('tile 2/4: overpass 504 from https://a/')).toBeInTheDocument();
  second.unmount();

  withMarket({ status: 'failed', storeCount: 0, progress: { tiles: 4, done: 4, failed: 4 }, error: 'tile 1/4: down; …' }, { '': none });
  renderApp(<Page />);
  expect(await screen.findByRole('status')).toHaveTextContent('Discovery failed. No area could be searched.');
});

test('an unknown market says so, with a way back', async () => {
  mockApi({ 'GET /api/markets/7': { status: 404, body: { error: { code: 'NOT_FOUND', message: 'market not found' } } } });
  renderApp(<Page />);
  expect(await screen.findByRole('alert')).toHaveTextContent('This market could not be loaded');
});

test('ready: totals, the list with its tags, the stores off the map with their reason, the footer, and the same rows on the map', async () => {
  withMarket(ready, { '': all });
  renderApp(<Page />);
  expect(await screen.findByText('FreshMart Koramangala')).toBeInTheDocument();
  expect(screen.getAllByRole('definition').map((d) => d.textContent)).toEqual(['2', '1', '1', '1', '0']);
  // every layer chip is on, every category chip off
  expect(screen.getByRole('button', { name: 'Discovered' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Supermarket' })).toHaveAttribute('aria-pressed', 'false');
  // rows carry their tag and their detail line
  const row = screen.getByRole('button', { name: /Our Whitefield store/ });
  expect(row).toHaveTextContent('Supermarket · ITPL Main Road');
  expect(row).toHaveTextContent('Portfolio · outside');
  expect(screen.getByRole('button', { name: /Apollo Pharmacy/ })).toHaveTextContent('Pharmacy');
  expect(screen.getByRole('button', { name: /Apollo Pharmacy/ }).querySelector('svg')).toHaveAttribute('aria-hidden', 'true');   // the category's icon, decoration beside its name
  // the store with no location is listed apart, with the reason, and never reaches the map
  expect(screen.getByText('Not on the map · 1')).toBeInTheDocument();
  expect(screen.getByText('Supermarket · 27th Main · address not found')).toBeInTheDocument();
  expect(screen.getByTestId('map')).toHaveTextContent('d:1 d:2 p:1 p:2');
  expect(screen.getByText('4 stores shown · 4 in this market')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  // two ways on: the list of every market, and a new one
  expect(screen.getByRole('link', { name: /All markets/ })).toHaveAttribute('href', '/dashboard');
  expect(screen.getByRole('link', { name: /Create another market/ })).toHaveAttribute('href', '/setup');
});

test('turning a layer off asks the API for the others; the list, the map and the footer follow, the totals do not', async () => {
  withMarket(ready, { '': all, '?layers=portfolio_inside,portfolio_outside,matched': { stores: [inside, outside], unlocated: [hsr], counts } });
  renderApp(<Page />);
  await userEvent.click(await screen.findByRole('button', { name: 'Discovered' }));
  expect(screen.getByRole('button', { name: 'Discovered' })).toHaveAttribute('aria-pressed', 'false');
  expect(await screen.findByText('2 stores shown · 4 in this market')).toBeInTheDocument();
  expect(screen.queryByText('FreshMart Koramangala')).not.toBeInTheDocument();
  expect(screen.getByTestId('map')).toHaveTextContent('p:1 p:2');
  expect(screen.getAllByRole('definition').map((d) => d.textContent)).toEqual(['2', '1', '1', '1', '0']);
});

test('the search and a category chip narrow the list through the API', async () => {
  withMarket(ready, { '': all, '?q=apollo': { stores: [apollo], unlocated: [hsr], counts }, '?categories=pharmacy&q=apollo': { stores: [apollo], unlocated: [hsr], counts } });
  renderApp(<Page />);
  await userEvent.type(await screen.findByRole('searchbox', { name: 'Search stores by name' }), 'apollo');
  expect(await screen.findByText('1 store shown · 4 in this market')).toBeInTheDocument();
  expect(screen.queryByText('FreshMart Koramangala')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Pharmacy' }));
  expect(screen.getByRole('button', { name: 'Pharmacy' })).toHaveAttribute('aria-pressed', 'true');
  expect(await screen.findByText('1 store shown · 4 in this market')).toBeInTheDocument();
});

test('nothing matching says so, and clearing the filters brings everything back', async () => {
  withMarket(ready, { '': all, '?q=zzz': { stores: [], unlocated: [hsr], counts } });
  renderApp(<Page />);
  await userEvent.type(await screen.findByRole('searchbox'), 'zzz');
  expect(await screen.findByText('No stores match these filters.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(await screen.findByText('FreshMart Koramangala')).toBeInTheDocument();
  expect(screen.getByRole('searchbox')).toHaveValue('');
});

test('with every layer off nothing is asked for, and the page says why the list is empty', async () => {
  withMarket(ready, { '': all, '?layers=portfolio_inside,portfolio_outside,matched': { stores: [inside, outside], unlocated: [hsr], counts }, '?layers=portfolio_outside,matched': { stores: [outside], unlocated: [hsr], counts }, '?layers=matched': { stores: [], unlocated: [hsr], counts } });
  renderApp(<Page />);
  const chips = within(await screen.findByText('Layers').then((el) => el.parentElement!));
  for (const name of ['Discovered', 'Portfolio inside', 'Portfolio outside', 'Matched ≤150 m']) await userEvent.click(chips.getByRole('button', { name }));
  expect(await screen.findByText('No layers selected. Turn one on to see stores.')).toBeInTheDocument();
  expect(screen.getByTestId('map')).toBeEmptyDOMElement();
});

test('a store picked in the list is marked in both views, picked again it is let go', async () => {
  withMarket(ready, { '': all });
  renderApp(<Page />);
  const row = await screen.findByRole('button', { name: /Our Whitefield store/ });
  await userEvent.click(row);
  expect(row).toHaveAttribute('aria-current', 'true');
  expect(screen.getByTestId('map')).toHaveAttribute('data-selected', 'p:2');
  expect(screen.getByRole('button', { name: /FreshMart Koramangala/ })).not.toHaveAttribute('aria-current');
  await userEvent.click(row);
  expect(row).not.toHaveAttribute('aria-current');
  expect(screen.getByTestId('map')).toHaveAttribute('data-selected', '');
});

test('a store picked on the map is marked in the list, and only one store is ever picked', async () => {
  withMarket(ready, { '': all });
  renderApp(<Page />);
  await userEvent.click(await screen.findByRole('button', { name: 'badge d:2' }));
  expect(screen.getByRole('button', { name: /Apollo Pharmacy/ })).toHaveAttribute('aria-current', 'true');
  await userEvent.click(screen.getByRole('button', { name: 'badge p:1' }));
  expect(screen.getByRole('button', { name: /Our Koramangala store/ })).toHaveAttribute('aria-current', 'true');
  expect(screen.getByRole('button', { name: /Apollo Pharmacy/ })).not.toHaveAttribute('aria-current');
  expect(screen.getByTestId('map')).toHaveAttribute('data-selected', 'p:1');
});


test('a run that found nothing says so and suggests what to change', async () => {
  withMarket({ ...ready, storeCount: 0, placement: { inside: 0, outside: 0, unlocated: 0 }, geocoding: { total: 0, done: 0, failed: 0 } }, { '': none });
  renderApp(<Page />);
  expect(await screen.findByText('Nothing was found for Supermarket, Pharmacy inside this boundary. Try a larger boundary or other categories.')).toBeInTheDocument();
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
});

test('the open market becomes the session\'s market, so the stepper names it', async () => {
  withMarket(ready, { '': all });
  renderApp(<><Stepper /><Page /></>);
  expect(await screen.findByText('Bengaluru · sample · 19.9 km²')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Market dashboard/ })).toHaveAttribute('href', '/dashboard/7');
});

test('a store that found its twin: the fifth total, the sentence, the tag with the distance, and the chip that selects the pairs', async () => {
  const paired = { ...inside, match: { id: 'd:1', name: 'FreshMart Koramangala', distanceM: 127 } };
  const withPair = { stores: [fresh, apollo, paired, outside], unlocated: [hsr], counts: { ...counts, matched: 1 } };
  withMarket({ ...ready, matched: 1 }, { '': withPair, '?layers=matched': { stores: [paired], unlocated: [hsr], counts: { ...counts, matched: 1 } } });
  renderApp(<Page />);
  expect(await screen.findByRole('status')).toHaveTextContent('1 of them is a discovered store within 150 m.');
  expect(screen.getAllByRole('definition').map((d) => d.textContent)).toEqual(['2', '1', '1', '1', '1']);
  const row = screen.getByRole('button', { name: /Our Koramangala store/ });
  expect(row).toHaveTextContent('Portfolio · inside');
  expect(row).toHaveTextContent('Matched · 127 m');
  expect(screen.getByRole('button', { name: /Our Whitefield store/ })).not.toHaveTextContent('Matched');
  // only the pairs: every other chip off
  const chips = within(screen.getByText('Layers').parentElement!);
  for (const name of ['Discovered', 'Portfolio inside', 'Portfolio outside']) await userEvent.click(chips.getByRole('button', { name }));
  expect(chips.getByRole('button', { name: 'Matched ≤150 m' })).toHaveAttribute('aria-pressed', 'true');
  expect(await screen.findByText('1 store shown · 4 in this market')).toBeInTheDocument();
  expect(screen.getByTestId('map')).toHaveTextContent('p:1');
});

test('a finished market can be run again: the button posts, and the market comes back queued', async () => {
  const spy = mockApi({ 'GET /api/markets/7': { body: { ...base, ...ready } }, 'GET /api/markets/7/stores': { body: all }, 'POST /api/markets/7/runs': { status: 202, body: { ...base, ...ready, status: 'pending', progress: null } } });
  renderApp(<Page />);
  await userEvent.click(await screen.findByRole('button', { name: /Run discovery again/ }));
  expect(await screen.findByRole('status')).toHaveTextContent('Discovery is queued');
  expect(spy.mock.calls.some(([url, init]) => String(url).endsWith('/api/markets/7/runs') && init?.method === 'POST')).toBe(true);
  expect(screen.queryByRole('button', { name: /Run discovery again/ })).not.toBeInTheDocument();   // not while it is queued
});

test('while a run is in flight there is no run-again and no delete', async () => {
  withMarket({ status: 'running', storeCount: 1, progress: { tiles: 4, done: 1, failed: 0 } }, { '': none });
  renderApp(<Page />);
  await screen.findByRole('status');
  expect(screen.queryByRole('button', { name: /Run discovery again/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Delete this market/ })).not.toBeInTheDocument();
});

test('delete asks twice, then removes the market and goes back to the list', async () => {
  const spy = mockApi({ 'GET /api/markets/7': { body: { ...base, ...ready } }, 'GET /api/markets/7/stores': { body: all }, 'DELETE /api/markets/7': { status: 204, body: undefined } });
  renderApp(<Page />);
  await userEvent.click(await screen.findByRole('button', { name: 'Delete this market' }));
  const dialog = screen.getByRole('alertdialog', { name: 'Delete this market?' });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(spy.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
  await userEvent.click(screen.getByRole('button', { name: 'Delete this market' }));
  await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
  expect(spy.mock.calls.some(([url, init]) => String(url).endsWith('/api/markets/7') && init?.method === 'DELETE')).toBe(true);
});
