/**
 * Scaffold routes that prove validation and the 500 path work; deleted in Phase 2 when real routes exist.
 */
import { Router } from 'express';
import { z } from '../openapi/zod.ts';
import { registry, errorResponses } from '../openapi/registry.ts';
import { badRequest } from '../lib/errors.ts';

const EchoBody = z.object({ name: z.string().trim().min(1).max(50).openapi({ example: 'Dean' }) }).openapi('EchoBody')
const EchoReply = z.object({ hello: z.string() }).openapi('EchoReply')

registry.registerPath({
  method: 'post',
  path: '/api/echo',
  tags: ['scaffold'],
  summary: 'Echo a validate name',
  request: {
    body: {
      content: {
        'application/json': { schema: EchoBody },
      },
    },
  },
  responses: {
    200: {
      description: 'Echoed',
      content: {
        'application/json': { schema: EchoReply },
      },
    },
    ...errorResponses(400),
  },
});

export function echoRouter() {
  const router = Router();
  router.post('/echo', async (req, res) => {
    const body = EchoBody.parse(req.body);
    if (body.name.toLocaleLowerCase() === 'error') throw badRequest('FORBIDDEN_NAME', 'The name "error" is not allowed');
    res.json({ hello: body.name });
  });
  router.get('/boom', async (req, res) => {
    throw new Error('Boom!'); // simulated crash, should be caught by errorHandler
  })
  return router;
}