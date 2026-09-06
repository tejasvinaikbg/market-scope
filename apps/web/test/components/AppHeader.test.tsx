/** The header's connection notice: silent when the service answers, "Connecting…" first, and one red notice for both kinds of failure. */
import { screen } from '@testing-library/react';
import { AppHeader } from '@/components/AppHeader';
import { renderApp } from '../helpers';

const health = (status: number, body: unknown) =>
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: status < 400, status, statusText: '', json: async () => body } as Response);

test('while the first health check is in flight the header says "Connecting…"', () => {
  jest.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));   // never answers
  renderApp(<AppHeader />);
  expect(screen.getByRole('status')).toHaveTextContent('Connecting…');
});

test('a healthy service shows no notice at all', async () => {
  health(200, { healthy: true, db: true, version: '0.1.0' });
  renderApp(<AppHeader />);
  await screen.findByText('MarketScope');
  await new Promise((r) => setTimeout(r, 20));                                   // let the query settle
  expect(screen.queryByRole('status')).toBeNull();
});

test('a database outage (503) and an unreachable API both show the same notice, with the detail in the tooltip', async () => {
  health(503, { healthy: false, db: false, version: '0.1.0' });
  const first = renderApp(<AppHeader />);
  expect(await screen.findByText("Can't reach the service · retrying")).toHaveAttribute('title', 'The API answers but its database does not');
  first.unmount();

  jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
  renderApp(<AppHeader />);
  expect(await screen.findByText("Can't reach the service · retrying")).toHaveAttribute('title', 'The API is not answering');
});
