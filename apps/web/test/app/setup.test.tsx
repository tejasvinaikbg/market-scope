/** Setup screen: progressive disclosure, the boundary that starts legal, the reshape buttons, and creating the market. The map is stubbed. */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { bboxAreaSqKm, padBbox } from '@market-scope/shared';
import Page from '@/app/setup/page';
import { useCurrentPortfolio } from '@/app/providers';
import { renderApp, mockApi } from '../helpers';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ usePathname: () => '/setup', useRouter: () => ({ push: mockPush }) }));
jest.mock('@/components/CityMap', () => ({ __esModule: true, default: () => <div data-testid="map" /> }));   // Leaflet needs a real browser; __esModule so the dynamic import sees a default export

const locations = { countries: [{ id: 1, name: 'India', states: [{ id: 1, name: 'Karnataka', cities: [{ id: 1, name: 'Bengaluru' }] }] }] };
const categories = [{ id: 1, slug: 'supermarket', name: 'Supermarket' }, { id: 2, slug: 'pharmacy', name: 'Pharmacy' }];
const wholeCity = { cityId: 1, name: 'Bengaluru', bbox: { south: 12.8335, west: 77.4599, north: 13.1426, east: 77.7841 }, centre: { lat: 12.97, lng: 77.59 }, cached: true };
const koramangala = { south: 12.92, west: 77.60, north: 12.956, east: 77.646 };   // ~20 km² of located stores
const providers = {
  places: [{ id: 'overpass', name: 'OSM Overpass', enabled: true, reason: null }, { id: 'google', name: 'Google Places API (New)', enabled: false, reason: 'not configured' }],
  geocoding: [{ id: 'nominatim', name: 'OSM Nominatim', enabled: true, reason: null }, { id: 'google', name: 'Google Geocoding API', enabled: false, reason: 'disabled' }],
};

/** Stands in for the upload screen: this session has a portfolio. */
function WithPortfolio() {
  const { setPortfolio } = useCurrentPortfolio();
  useEffect(() => setPortfolio({ id: 1, name: 'sample', rowCount: 10, withCoords: 7, withoutCoords: 3 }), [setPortfolio]);
  return null;
}

/** Picks India → Karnataka → Bengaluru. */
async function chooseBengaluru(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('option', { name: 'India' });
  await user.selectOptions(screen.getByLabelText('Country'), '1');
  await user.selectOptions(screen.getByLabelText('State'), '1');
  await user.selectOptions(screen.getByLabelText('City'), '1');
}

test('blocks appear in order, and the CTA only once the form is complete', async () => {
  mockApi({ 'GET /api/locations': { body: locations }, 'GET /api/categories': { body: categories }, 'GET /api/providers': { body: providers }, 'GET /api/cities/1/bbox': { body: wholeCity } });
  renderApp(<Page />);
  const user = userEvent.setup();

  expect(screen.queryByText('Categories')).toBeNull();
  await chooseBengaluru(user);
  expect(await screen.findByText('Categories')).toBeInTheDocument();
  expect(screen.queryByText('Data sources')).toBeNull();
  expect(screen.queryByRole('button', { name: /Upload a portfolio first/ })).toBeNull();

  await user.click(screen.getByRole('button', { name: 'Supermarket' }));
  expect(screen.getByText('Data sources')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Upload a portfolio first/ })).toBeDisabled();
});

test('the boundary starts as a legal square; reset goes to the whole city, which is over the cap', async () => {
  mockApi({ 'GET /api/locations': { body: locations }, 'GET /api/categories': { body: categories }, 'GET /api/providers': { body: providers }, 'GET /api/cities/1/bbox': { body: wholeCity } });
  renderApp(<Page />);
  const user = userEvent.setup();
  await chooseBengaluru(user);

  expect(await screen.findByText('Boundary area')).toBeInTheDocument();
  expect(screen.getByText('24')).toBeInTheDocument();                              // DEFAULT_MARKET_AREA_SQ_KM, under the cap
  expect(screen.queryByText(/Over the 30 km² cap/)).toBeNull();
  expect(screen.queryByRole('button', { name: /Fit to portfolio stores/ })).toBeNull();   // no portfolio in this session

  await user.click(screen.getByRole('button', { name: /Reset to city boundary/ }));
  expect(screen.getByText(/Over the 30 km² cap/)).toBeInTheDocument();
  expect(screen.getByText('1,207')).toBeInTheDocument();                           // the whole city, by the sphere formula
});

test('with a portfolio in the session, "fit" wraps its located stores', async () => {
  mockApi({
    'GET /api/locations': { body: locations }, 'GET /api/categories': { body: categories }, 'GET /api/providers': { body: providers }, 'GET /api/cities/1/bbox': { body: wholeCity },
    'GET /api/portfolios/1': { body: { id: 1, name: 'sample', sourceFilename: 'sample.csv', rowCount: 10, createdAt: '', withCoords: 7, withoutCoords: 3, bounds: koramangala } },
  });
  renderApp(<><WithPortfolio /><Page /></>);
  const user = userEvent.setup();
  await chooseBengaluru(user);

  await user.click(await screen.findByRole('button', { name: /Fit to portfolio stores/ }));
  const fitted = Math.round(bboxAreaSqKm(padBbox(koramangala, 0.5)));               // the stores plus 0.5 km on every side: what the screen must show
  expect(screen.getByText(fitted.toLocaleString())).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Supermarket' }));
  expect(screen.getByRole('button', { name: /Create market/ })).toBeEnabled();   // a portfolio, a category and a legal boundary
});

const market = { id: 7, name: 'Bengaluru · sample', portfolioId: 1, portfolioName: 'sample', cityId: 1, cityName: 'Bengaluru', boundary: koramangala, areaSqKm: 19.8797, placesProvider: 'overpass', geocoderProvider: 'nominatim', categories: [categories[0]], createdAt: '' };
const summary = { id: 1, name: 'sample', sourceFilename: 'sample.csv', rowCount: 10, createdAt: '', withCoords: 7, withoutCoords: 3, bounds: koramangala };

test('"Create market" posts every decision and moves to the new market', async () => {
  const fetchSpy = mockApi({
    'GET /api/locations': { body: locations }, 'GET /api/categories': { body: categories }, 'GET /api/providers': { body: providers }, 'GET /api/cities/1/bbox': { body: wholeCity },
    'GET /api/portfolios/1': { body: summary }, 'POST /api/markets': { status: 201, body: market },
  });
  renderApp(<><WithPortfolio /><Page /></>);
  const user = userEvent.setup();
  await chooseBengaluru(user);
  await user.click(screen.getByRole('button', { name: 'Supermarket' }));

  const cta = screen.getByRole('button', { name: /Create market/ });
  expect(cta).toBeEnabled();                                                       // a portfolio, a city, a category, a legal boundary
  await user.click(cta);

  const post = fetchSpy.mock.calls.find(([, init]) => init?.method === 'POST');
  const sent = JSON.parse(String(post?.[1]?.body));
  expect(sent).toMatchObject({ portfolioId: 1, cityId: 1, categoryIds: [1], placesProvider: 'overpass', geocoderProvider: 'nominatim' });
  expect(sent.boundary.north).toBeGreaterThan(sent.boundary.south);
  expect(mockPush).toHaveBeenCalledWith('/dashboard/7');
});

test('the server\'s rejection is shown in its own words, and nothing moves', async () => {
  mockApi({
    'GET /api/locations': { body: locations }, 'GET /api/categories': { body: categories }, 'GET /api/providers': { body: providers }, 'GET /api/cities/1/bbox': { body: wholeCity },
    'GET /api/portfolios/1': { body: summary },
    'POST /api/markets': { status: 400, body: { error: { code: 'AREA_TOO_LARGE', message: 'Boundary is 30.12 km²; the cap is 30 km²', details: { areaSqKm: 30.12 } } } },
  });
  renderApp(<><WithPortfolio /><Page /></>);
  const user = userEvent.setup();
  await chooseBengaluru(user);
  await user.click(screen.getByRole('button', { name: 'Supermarket' }));
  await user.click(screen.getByRole('button', { name: /Create market/ }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Boundary is 30.12 km²; the cap is 30 km²');
  expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining('/dashboard/'));
});

test('without a portfolio the CTA names what is missing and stays disabled', async () => {
  mockApi({ 'GET /api/locations': { body: locations }, 'GET /api/categories': { body: categories }, 'GET /api/providers': { body: providers }, 'GET /api/cities/1/bbox': { body: wholeCity } });
  renderApp(<Page />);
  const user = userEvent.setup();
  await chooseBengaluru(user);
  await user.click(screen.getByRole('button', { name: 'Supermarket' }));
  expect(screen.getByRole('button', { name: /Upload a portfolio first/ })).toBeDisabled();
});

test('a Google provider that cannot be used is offered greyed out, with the reason', async () => {
  mockApi({ 'GET /api/locations': { body: locations }, 'GET /api/categories': { body: categories }, 'GET /api/providers': { body: providers }, 'GET /api/cities/1/bbox': { body: wholeCity } });
  renderApp(<Page />);
  const user = userEvent.setup();
  await chooseBengaluru(user);
  await user.click(screen.getByRole('button', { name: 'Supermarket' }));

  expect(screen.getByRole('option', { name: 'Google Places API (New) · not configured' })).toBeDisabled();
  expect(screen.getByRole('option', { name: 'Google Geocoding API · disabled' })).toBeDisabled();
  expect(screen.getByRole('option', { name: 'OSM Overpass' })).toBeEnabled();
});

test('the default is the first available source; with none available the CTA stays off and says why', async () => {
  const osmOff = {
    places: [{ id: 'overpass', name: 'OSM Overpass', enabled: false, reason: 'disabled' }, { id: 'google', name: 'Google Places API (New)', enabled: true, reason: null }],
    geocoding: [{ id: 'nominatim', name: 'OSM Nominatim', enabled: false, reason: 'disabled' }, { id: 'google', name: 'Google Geocoding API', enabled: false, reason: 'not configured' }],
  };
  mockApi({ 'GET /api/locations': { body: locations }, 'GET /api/categories': { body: categories }, 'GET /api/providers': { body: osmOff }, 'GET /api/cities/1/bbox': { body: wholeCity }, 'GET /api/portfolios/1': { body: summary } });
  renderApp(<><WithPortfolio /><Page /></>);
  const user = userEvent.setup();
  await chooseBengaluru(user);
  await user.click(screen.getByRole('button', { name: 'Supermarket' }));

  expect(screen.getByLabelText('Store discovery')).toHaveValue('google');            // Overpass is off, so Google is the default
  expect(screen.getByRole('alert')).toHaveTextContent('No data source is available');   // nothing can do address lookup
  expect(screen.getByRole('button', { name: /Create market/ })).toBeDisabled();
});

test('when the reference data cannot be fetched, the screen says so in plain words', async () => {
  jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
  renderApp(<Page />);
  expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent("Couldn't reach the service");   // a request with no answer is retried once, a second later
});
