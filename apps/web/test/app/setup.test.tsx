/** Setup screen: progressive disclosure — each block appears after the decision above it, the CTA only when the form is complete. */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Page from '@/app/setup/page';
import { renderApp, mockApi } from '../helpers';

jest.mock('next/navigation', () => ({ usePathname: () => '/setup' }));
jest.mock('@/components/CityMap', () => ({ __esModule: true, default: () => <div data-testid="map" /> }));   // Leaflet needs a real browser; __esModule so the dynamic import sees a default export

const locations = { countries: [{ id: 1, name: 'India', states: [{ id: 1, name: 'Karnataka', cities: [{ id: 1, name: 'Bengaluru' }] }] }] };
const categories = [{ id: 1, slug: 'supermarket', name: 'Supermarket' }, { id: 2, slug: 'pharmacy', name: 'Pharmacy' }];
const wholeCity = { cityId: 1, name: 'Bengaluru', bbox: { south: 12.8335, west: 77.4599, north: 13.1426, east: 77.7841 }, centre: { lat: 12.97, lng: 77.59 }, cached: true };

test('blocks appear in order, and the CTA only once the form is complete', async () => {
  mockApi({ 'GET /api/locations': { body: locations }, 'GET /api/categories': { body: categories }, 'GET /api/cities/1/bbox': { body: wholeCity } });
  renderApp(<Page />);
  const user = userEvent.setup();

  expect(screen.queryByText('Categories')).toBeNull();
  await screen.findByRole('option', { name: 'India' });                              // the locations tree has loaded
  await user.selectOptions(screen.getByLabelText('Country'), '1');
  await user.selectOptions(screen.getByLabelText('State'), '1');
  expect(screen.queryByText('Categories')).toBeNull();                                // still no city
  await user.selectOptions(screen.getByLabelText('City'), '1');

  expect(await screen.findByText('Categories')).toBeInTheDocument();
  expect(screen.queryByText('Data sources')).toBeNull();
  expect(screen.queryByRole('button', { name: /Upload a portfolio first/ })).toBeNull();
  expect(await screen.findByText(/Over the 30 km² cap/)).toBeInTheDocument();       // the whole city is far over the cap

  await user.click(screen.getByRole('button', { name: 'Supermarket' }));
  expect(screen.getByText('Data sources')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Upload a portfolio first/ })).toBeDisabled();
});