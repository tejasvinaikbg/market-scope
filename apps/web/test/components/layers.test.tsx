/** The layer vocabulary: every layer has a tag, and the reasons a store is off the map are said in words. */
import { render } from '@testing-library/react';
import { LAYERS, ALL_LAYERS, layerTag, LayerSwatch, unlocatedReason } from '@/components/layers';

test('three layers and the matched chip, in the design order, each with a tag; the chip names the distance', () => {
  expect(ALL_LAYERS).toEqual(['discovered', 'portfolio_inside', 'portfolio_outside', 'matched']);
  expect(LAYERS.map((l) => layerTag(l.id))).toEqual(['Discovered', 'Portfolio · inside', 'Portfolio · outside', 'Matched']);
  expect(LAYERS[3].label).toBe('Matched ≤150 m');
});

test('the swatch is decoration only, and the matched one carries a check', () => {
  const { container } = render(<LayerSwatch layer="portfolio_outside" />);
  expect(container.firstChild).toHaveAttribute('aria-hidden');
  const { container: matched } = render(<LayerSwatch layer="matched" />);
  expect(matched.querySelector('svg')).not.toBeNull();
});

test('the reasons a store is not on the map', () => {
  expect(unlocatedReason('not_found')).toBe('address not found');
  expect(unlocatedReason('error')).toBe('address lookup failed');
  expect(unlocatedReason(null)).toBe('not located yet');
});
