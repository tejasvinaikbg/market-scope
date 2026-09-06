import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/app.ts';
import { db } from '../../src/db/knex.ts';

const server = buildApp().listen(0);
const base = `http://localhost:${(server.address() as { port: number }).port}`;
after(async () => {
  server.close();
  await db.destroy();
});

test('categories come back in seed (id) order, without OSM internals', async () => {
  const cats = await (await fetch(`${base}/api/categories`)).json();
  assert.deepEqual(
    cats.map((c: { slug: string }) => c.slug),
    ['supermarket', 'pharmacy', 'hypermarket', 'grocery_store', 'convenience_store'],
  );
  assert.equal('osmSelectors' in cats[0], false);
});
