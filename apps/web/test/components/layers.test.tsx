/** The layer vocabulary: every layer has a tag, and the reasons a store is off the map are said in words. */
import { render } from '@testing-library/react';
import { LAYERS, ALL_LAYERS, layerTag, LayerSwatch, unlocatedReason } from '@/components/layers';

test('three layers, in the design order, each with a tag', () => {
  expect(ALL_LAYERS).toEqual(['discovered', 'portfolio_inside', 'portfolio_outside']);
  expect(LAYERS.map((l) => layerTag(l.id))).toEqual(['Discovered', 'Portfolio · inside', 'Portfolio · outside']);
});

test('the swatch is decoration only', () => {
  const { container } = render(<LayerSwatch layer="portfolio_outside" />);
  expect(container.firstChild).toHaveAttribute('aria-hidden');
});

test('the reasons a store is not on the map', () => {
  expect(unlocatedReason('not_found')).toBe('address not found');
  expect(unlocatedReason('error')).toBe('address lookup failed');
  expect(unlocatedReason(null)).toBe('not located yet');
});
