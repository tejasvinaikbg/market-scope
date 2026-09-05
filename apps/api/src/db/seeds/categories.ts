import type { Knex } from "knex";

export async function seed(knex: Knex): Promise<void> {
  await knex('countries').insert({ code: "IN", name: "India" }).onConflict('code').ignore()
  const [{ id: india }] = await knex('countries').select('id').where({ code: 'IN' })

  await knex('states').insert([
    { country_id: india, name: "Karnataka" },
    { country_id: india, name: "Maharashtra" }, { country_id: india, name: "Delhi" }
  ]).onConflict(['country_id', 'name']).ignore()

  const states = Object.fromEntries((await knex('states').select('id', 'name')).map((state) => [state.name, state.id]))

  await knex('cities').insert([
    { state_id: states.Karnataka, name: "Bengaluru" },
    { state_id: states.Maharashtra, name: "Mumbai" },
    { state_id: states.Delhi, name: "New Delhi" }
  ]).onConflict(['state_id', 'name']).ignore()
};
