/**
 * /api/portfolios — upload a portfolio file (multipart), list portfolios, read one portfolio's summary.
 * multer receives the multipart body into memory (the file is validated as a whole before anything is stored),
 * capped at the design's 5 MB; its own errors are translated to our 400 envelope here.
 */
import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { PORTFOLIO_LIMITS } from '@market-scope/shared';
import { z } from '../openapi/zod.ts';
import { registry, errorResponses } from '../openapi/registry.ts';
import { badRequest } from '../lib/errors.ts';
import { portfoliosQueries } from '../queries/portfolios.ts';
import { importPortfolio, getPortfolio } from '../services/portfolios.ts';

const MAX_MB = PORTFOLIO_LIMITS.maxFileBytes / 1024 / 1024;

const Portfolio = z.object({ id: z.number(), name: z.string(), sourceFilename: z.string(), rowCount: z.number(), createdAt: z.string() }).openapi('Portfolio');
const FileIssue = z.object({ row: z.number().optional(), column: z.string().optional(), message: z.string() }).openapi('FileIssue');
const Bbox = z.object({ south: z.number(), west: z.number(), north: z.number(), east: z.number() });
const PortfolioSummary = Portfolio.extend({ withCoords: z.number(), withoutCoords: z.number(), bounds: Bbox.nullable() }).openapi('PortfolioSummary');
const UploadResult = PortfolioSummary.extend({ warnings: z.array(FileIssue) }).openapi('PortfolioUploadResult');
const idParam = z.object({ id: z.coerce.number().int().positive() });

registry.registerPath({
  method: 'post',
  path: '/api/portfolios',
  tags: ['portfolios'],
  summary: 'Upload a portfolio file (.csv or .xlsx)',
  description: `Multipart form: \`file\` (.csv or .xlsx, max ${MAX_MB} MB) and an optional \`name\`. The whole file is validated first; nothing is stored unless every row passes. Rejections carry \`details: FileIssue[]\` with the spreadsheet row and column.`,
  request: {
    body: {
      content: { 'multipart/form-data': { schema: z.object({ name: z.string().optional(), file: z.string().openapi({ type: 'string', format: 'binary' }) }) } },
    },
  },
  responses: { 201: { description: 'Stored', content: { 'application/json': { schema: UploadResult } } }, ...errorResponses(400, 500) },
});
registry.registerPath({
  method: 'get',
  path: '/api/portfolios',
  tags: ['portfolios'],
  summary: 'Uploaded portfolios, newest first',
  responses: { 200: { description: 'OK', content: { 'application/json': { schema: z.array(Portfolio) } } }, ...errorResponses(500) },
});
registry.registerPath({
  method: 'get',
  path: '/api/portfolios/{id}',
  tags: ['portfolios'],
  summary: 'One portfolio with its coordinate counts',
  request: { params: idParam },
  responses: { 200: { description: 'OK', content: { 'application/json': { schema: PortfolioSummary } } }, ...errorResponses(400, 404, 500) },
});

// Memory storage: at most 5 MB, one file, in the field named "file". multer stops reading at the cap.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: PORTFOLIO_LIMITS.maxFileBytes, files: 1 } }).single('file');

/** Runs multer and turns its errors into our envelope; anything unexpected still reaches the error handler as a 500. */
const receiveFile: RequestHandler = (req, res, next) =>
  upload(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      return next(
        err.code === 'LIMIT_FILE_SIZE'
          ? badRequest('FILE_TOO_LARGE', `File exceeds ${MAX_MB} MB`)
          : badRequest('UPLOAD_ERROR', `${err.message}: send one file in the multipart field "file"`),
      );
    }
    next(err);
  });

export function portfoliosRouter() {
  const router = Router();

  router.post('/portfolios', receiveFile, async (req, res) => {
    if (!req.file) throw badRequest('NO_FILE', 'Multipart field "file" is required');
    const name = String(req.body?.name ?? '').trim() || req.file.originalname.replace(/\.[^.]+$/, ''); // default: filename without extension
    res.status(201).json(await importPortfolio({ name, filename: req.file.originalname, buffer: req.file.buffer }));
  });

  router.get('/portfolios', async (_req, res) => {
    res.json(await portfoliosQueries.list());
  });

  router.get('/portfolios/:id', async (req, res) => {
    res.json(await getPortfolio(idParam.parse(req.params).id));
  });

  return router;
}
