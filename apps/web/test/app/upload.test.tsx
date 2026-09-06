/** Upload screen: what the API said is what the screen shows — the issue table and the rail's marks, or the stored summary. */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Page from '@/app/page';
import { Stepper } from '@/components/Stepper';
import { renderApp, mockApi } from '../helpers';

jest.mock('next/navigation', () => ({ usePathname: () => '/' }));

const csv = () => new File(['store_name,address\nA,B\n'], 'stores.csv', { type: 'text/csv' });
const fileInput = (container: HTMLElement) => container.querySelector('input[type=file]') as HTMLInputElement;
const rail = () => screen.getByText('Header validation').closest('aside') as HTMLElement;

test('a header rejection shows the table and crosses exactly the missing columns', async () => {
  mockApi({
    'POST /api/portfolios': {
      status: 400,
      body: {
        error: {
          code: 'INVALID_HEADERS',
          message: 'Header row is invalid',
          details: [
            { column: 'city', message: 'missing required column "city"' },
            { column: 'category', message: 'missing required column "category"' },
          ],
        },
      },
    },
  });
  const { container } = renderApp(<Page />);
  await userEvent.upload(fileInput(container), csv());

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Header row is invalid — nothing was stored');
  expect(within(alert).getAllByRole('row')).toHaveLength(3); // header row + two issues
  expect(within(rail()).getByText('city').closest('span')).toHaveClass('text-bad');
  expect(within(rail()).getByText('category').closest('span')).toHaveClass('text-bad');
  expect(within(rail()).getByText('store_name').closest('span')).not.toHaveClass('text-bad');
});

test('a stored upload shows the counts, checks every rail row, and updates the stepper', async () => {
  mockApi({
    'POST /api/portfolios': {
      status: 201,
      body: {
        id: 1,
        name: 'stores',
        sourceFilename: 'stores.csv',
        rowCount: 10,
        createdAt: '2026-09-06T00:00:00Z',
        withCoords: 7,
        withoutCoords: 3,
        warnings: [],
      },
    },
  });
  const { container } = renderApp(
    <>
      <Stepper />
      <Page />
    </>,
  );
  await userEvent.upload(fileInput(container), csv());

  expect(await screen.findByText('10 stores · 7 with coordinates · 3 to locate from their address')).toBeInTheDocument();
  expect(rail().querySelectorAll('span.text-ok')).toHaveLength(8);
  expect(screen.getByText('stores · 10 stores')).toBeInTheDocument();
});

test('no answer from the service is said in plain words', async () => {
  jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
  const { container } = renderApp(<Page />);
  await userEvent.upload(fileInput(container), csv());
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the service");
});
