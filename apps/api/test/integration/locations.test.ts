import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/app.ts';
import { db } from '../../src/db/knex.ts';

const server = buildApp().listen(0);
const base = `http://localhost:${(server.address() as { port: number }).port}`;
after(async () => { server.close(); await db.destroy(); });

test('locations tree contains the three seeded cities under their states', async () => {
  const { countries } = await (await fetch(`${base}/api/locations`)).json();
  assert.equal(countries.length, 1);
  const cities = countries[0].states.flatMap((s: { name: string; cities: { name: string }[] }) => s.cities.map((c) => `${s.name}/${c.name}`));
  assert.deepEqual(cities.sort(), ['Delhi/New Delhi', 'Karnataka/Bengaluru', 'Maharashtra/Mumbai']);
});