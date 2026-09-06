/** Stepper: the active step follows the path; the first caption says "no file yet" until this session uploads. */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Stepper } from '@/components/Stepper';
import { useCurrentPortfolio } from '@/app/providers';
import { renderApp } from '../helpers';

jest.mock('next/navigation', () => ({ usePathname: () => '/setup' }));

/** Stands in for the upload screen: sets the session's portfolio on click. */
function FakeUpload() {
  const { setPortfolio } = useCurrentPortfolio();
  return <button onClick={() => setPortfolio({ id: 1, name: 'sample', rowCount: 10, withCoords: 7, withoutCoords: 3 })}>upload</button>;
}

test('the caption names the session portfolio once there is one', async () => {
  renderApp(<><Stepper /><FakeUpload /></>);
  expect(screen.getByText('no file yet')).toBeInTheDocument();
  await userEvent.click(screen.getByText('upload'));
  expect(screen.getByText('sample · 10 stores')).toBeInTheDocument();
});

test('the current path is the active step', () => {
  renderApp(<Stepper />);
  expect(screen.getByText('Market setup').closest('a')).toHaveClass('border-b-accent');
  expect(screen.getByText('Portfolio upload').closest('a')).not.toHaveClass('border-b-accent');
});