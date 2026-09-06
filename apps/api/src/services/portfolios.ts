/**
 * Portfolio import: validate the whole file first, then write everything in one transaction.
 * A rejected file leaves nothing behind; a crash mid-insert rolls the portfolio row back too.
 */
import { withTransaction } from '../db/knex.ts';
import { notFound } from '../lib/errors.ts';
import { portfoliosQueries } from '../queries/portfolios.ts';
import { parsePortfolioFile } from './portfolio-file.ts';

export async function importPortfolio(input: { name: string; filename: string; buffer: Buffer }) {
  const { rows, warnings } = await parsePortfolioFile(input.buffer, input.filename);   // throws the 400s; nothing below runs
  const portfolio = await withTransaction(async (trx) => {
    const p = await portfoliosQueries.insert({ name: input.name, sourceFilename: input.filename, rowCount: rows.length }, trx);
    await portfoliosQueries.insertStores(p.id, rows, trx);
    return p;
  });
  const summary = await portfoliosQueries.summary(portfolio.id);
  return { ...summary!, warnings };
}

export async function getPortfolio(id: number) {
  const summary = await portfoliosQueries.summary(id);
  if (!summary) throw notFound('portfolio');
  return summary;
}