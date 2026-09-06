/** Dashboard route for one market: what the server stored, and the honest "discovery has not run yet" notice. */
import { screen } from '@testing-library/react';
import Page from '@/app/dashboard/[id]/page';
import { renderApp, mockApi } from '../helpers';

jest.mock('next/navigation', () => ({ usePathname: () => '/dashboard/7', useParams: () => ({ id: '7' }) }));

test('shows the market as the server stored it', async () => {
  mockApi({
    'GET /api/markets/7': {
      body: {
        id: 7, name: 'Bengaluru · sample', portfolioId: 1, portfolioName: 'sample', cityId: 1, cityName: 'Bengaluru',
        boundary: { south: 12.92, west: 77.6, north: 12.956, east: 77.646 }, areaSqKm: 19.8797, placesProvider: 'overpass', geocoderProvider: 'nominatim',
        categories: [{ id: 1, slug: 'supermarket', name: 'Supermarket' }, { id: 2, slug: 'pharmacy', name: 'Pharmacy' }], createdAt: '',
      }
    }
  });
  renderApp(<Page />);
  expect(await screen.findByRole('heading', { name: 'Bengaluru · sample' })).toBeInTheDocument();
  expect(screen.getByText('Bengaluru · 19.9 km² · portfolio sample')).toBeInTheDocument();
  expect(screen.getByText('Pharmacy')).toBeInTheDocument();
  expect(screen.getByText(/Store discovery has not run yet/)).toBeInTheDocument();
});

test('an unknown market says so, with a way back', async () => {
  mockApi({ 'GET /api/markets/7': { status: 404, body: { error: { code: 'NOT_FOUND', message: 'market not found' } } } });
  renderApp(<Page />);
  expect(await screen.findByRole('alert')).toHaveTextContent('This market could not be loaded');
});