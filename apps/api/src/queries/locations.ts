/**
 * All SQL for countries, states and cities as one dropdown tree.
 */
import { db, type Db } from '../db/knex.ts';

export interface CityRef {
  id: number;
  name: string;
}
export interface StateRef {
  id: number;
  name: string;
  cities: CityRef[];
}
export interface CountryRef {
  id: number;
  name: string;
  states: StateRef[];
}

export const locationsQueries = {
  // dropdown
  async locationTree(k: Db = db): Promise<CountryRef[]> {
    const rows = await k('countries as c')
      .join('states as s', 's.country_id', 'c.id')
      .join('cities as ci', 'ci.state_id', 's.id')
      .select('c.id as countryId', 'c.name as country', 's.id as stateId', 's.name as state', 'ci.id as cityId', 'ci.name as city')
      .orderBy(['c.name', 's.name', 'ci.name']);

    const countries = new Map<number, CountryRef>();
    const states = new Map<number, StateRef>();
    for (const row of rows) {
      let country = countries.get(row.countryId);
      if (!country) {
        country = {
          id: row.countryId,
          name: row.country,
          states: [],
        };
        countries.set(country.id, country);
      }
      let state = states.get(row.stateId);
      if (!state) {
        state = {
          id: row.stateId,
          name: row.state,
          cities: [],
        };
        states.set(state.id, state);
        country.states.push(state);
      }
      state.cities.push({ id: row.cityId, name: row.city });
    }
    return [...countries.values()];
  },
};
