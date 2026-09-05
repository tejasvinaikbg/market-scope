/**
 * The one Knex instance for the process (built from the knexfile) and the transaction helper the queries use.
 */
import knexFactory, { type Knex } from 'knex';
import pg from 'pg'
import knexConfig from './knexfile.ts'

pg.types.setTypeParser(1700, (v) => Number(v));

export const db: Knex = knexFactory(knexConfig)
export type Db = Knex
export const withTransaction = <T>(fn: (trx: Knex.Transaction) => Promise<T>): Promise<T> => db.transaction(fn)