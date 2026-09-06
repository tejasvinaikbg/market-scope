/**
 * Which icon stands for a category, the way a map app marks a cafe with a cup: one table, read by the list and the chips
 * through React and by the map through Leaflet. The shapes are the lucide set, the same set as every other icon in the app;
 * a category the table does not know gets the plain storefront. Colour is never decided here — that is the layer's.
 */
import { ShoppingBag, ShoppingCart, Pill, Carrot, Store, Coffee, createElement, type IconNode } from 'lucide';
import { Icon, type LucideProps, type IconNode as ReactIconNode } from 'lucide-react';

const ICONS: Record<string, IconNode> = {
  supermarket: ShoppingBag,
  hypermarket: ShoppingCart,
  pharmacy: Pill,
  grocery_store: Carrot,
  convenience_store: Store,
  cafe: Coffee,
};

/** The icon for a category slug; the storefront for one the table does not know, or none at all. */
export const categoryIcon = (slug: string | null | undefined): IconNode => (slug && ICONS[slug]) || Store;

/** The same icon as SVG markup, for the map's markers: Leaflet takes HTML, not React. */
export const categoryIconHtml = (slug: string | null | undefined, size = 14) =>
  createElement(categoryIcon(slug), { width: size, height: size, 'stroke-width': 2.25 }).outerHTML;

// React wants a key on each shape of an icon; the vanilla nodes carry none, so they are added once per icon and kept.
// Both packages ship the same shapes from the same release; only their TypeScript declarations differ in strictness.
const keyed = new Map<IconNode, ReactIconNode>();
const forReact = (node: IconNode): ReactIconNode => {
  let k = keyed.get(node);
  if (!k) {
    k = node.map(([tag, attrs], i) => [tag, { ...attrs, key: String(i) }]) as unknown as ReactIconNode;
    keyed.set(node, k);
  }
  return k;
};

/** The same icon in React, for rows and chips. Decoration only: the category's name is always written beside it. */
export function CategoryIcon({ slug, ...props }: { slug: string | null | undefined } & Omit<LucideProps, 'ref'>) {
  return <Icon aria-hidden iconNode={forReact(categoryIcon(slug))} {...props} />;
}
