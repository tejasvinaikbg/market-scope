/** Category icons: every seeded category has its own shape, the unknown get the storefront, and both outputs carry it. */
import { render } from '@testing-library/react';
import { Store, Coffee } from 'lucide';
import { categoryIcon, categoryIconHtml, CategoryIcon } from '@/components/categoryIcons';

test('each seeded category has its own icon; unknown and missing get the storefront', () => {
  const seeded = ['supermarket', 'hypermarket', 'pharmacy', 'grocery_store', 'convenience_store'].map(categoryIcon);
  expect(new Set(seeded).size).toBe(5);
  expect(categoryIcon('cafe')).toBe(Coffee);
  expect(categoryIcon('bookshop')).toBe(Store);
  expect(categoryIcon(null)).toBe(Store);
});

test('the map gets markup at the size asked for', () => {
  const html = categoryIconHtml('pharmacy', 14);
  expect(html).toMatch(/^<svg/);
  expect(html).toContain('width="14"');
  expect(html).not.toBe(categoryIconHtml('supermarket', 14));
});

test('the React icon is decoration, drawn at the size asked for', () => {
  const { container } = render(<CategoryIcon slug="supermarket" size={16} />);
  const svg = container.querySelector('svg')!;
  expect(svg).toHaveAttribute('aria-hidden', 'true');
  expect(svg).toHaveAttribute('width', '16');
});
