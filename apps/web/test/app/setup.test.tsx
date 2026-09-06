/** Setup screen: progressive disclosure, the boundary that starts legal, and the two reshape buttons. The map itself is stubbed. */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { bboxAreaSqKm, padBbox } from '@market-scope/shared';
import Page from '@/app/setup/page';
import { useCurrentPortfolio } from '@/app/providers';
import { renderApp, mockApi } from '../helpers';

jest.mock('next/navigation', () => ({ usePathname: () => '/setup' }));
jest.mock('@/components/CityMap', () => ({ __esModule: true, default: () => <div data-testid="map" /> }));   // Leaflet needs a real browser; __esModule so the dynamic import sees a default export

const locations = { countries: [{ id: 1, name: 'India', states: [{ id: 1, name: 'Karnataka', cities: [{ id: 1, name: 'Bengaluru' }] }] }] };
const categories = [{ id: 1, slug: 'supermarket', name: 'Supermarket' }, { id: 2, slug: 'pharmacy', name: 'Pharmacy' }];
const wholeCity = { cityId: 1, name: 'Bengaluru', bbox: { south: 12.8335, west: 77.4599, north: 13.1426, east: 77.7841 }, centre: { lat: 12.97, lng: 77.59 }, cached: true };
const koramangala = { south: 12.92, west: 77.60, north: 12.956, east: 77.646 };   // ~20 km² of located stores

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
  mockApi({ 'GET /api/locations': { body: locations }, 'GET /api/categories': { body: categories }, 'GET /api/cities/1/bbox': { body: wholeCity } });
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
  mockApi({ 'GET /api/locations': { body: locations }, 'GET /api/categories': { body: categories }, 'GET /api/cities/1/bbox': { body: wholeCity } });
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
    'GET /api/locations': { body: locations }, 'GET /api/categories': { body: categories }, 'GET /api/cities/1/bbox': { body: wholeCity },
    'GET /api/portfolios/1': { body: { id: 1, name: 'sample', sourceFilename: 'sample.csv', rowCount: 10, createdAt: '', withCoords: 7, withoutCoords: 3, bounds: koramangala } },
  });
  renderApp(<><WithPortfolio /><Page /></>);
  const user = userEvent.setup();
  await chooseBengaluru(user);

  await user.click(await screen.findByRole('button', { name: /Fit to portfolio stores/ }));
  const fitted = Math.round(bboxAreaSqKm(padBbox(koramangala, 0.5)));               // the stores plus 0.5 km on every side: what the screen must show
  expect(screen.getByText(fitted.toLocaleString())).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Supermarket' }));
  expect(screen.getByRole('button', { name: /Create market/ })).toBeDisabled();  // present, not yet wired
});