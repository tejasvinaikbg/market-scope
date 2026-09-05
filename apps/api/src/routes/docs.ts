import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { buildOpenApiDocument } from '../openapi/documents.ts';

export function docsRouter() {
  const router = Router();
  const document = buildOpenApiDocument();
  router.get('/openapi.json', (req, res) => {
    res.json(document);
  });
  router.use('/docs', swaggerUi.serve, swaggerUi.setup(document));
  return router;
}