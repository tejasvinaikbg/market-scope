import { Router } from 'express';
import { z } from 'zod';
import { badRequest } from '../lib/errors.ts';

const echoBody = z.object({ name: z.string().trim().min(1).max(50) });

export function echoRouter() {
    const router = Router();
    router.post('/echo', async (req, res) => {
        const body = echoBody.parse(req.body);
        if (body.name.toLocaleLowerCase() === 'error') throw badRequest('FORBIDDEN_NAME', 'The name "error" is not allowed');
        res.json({ hello: body.name });
    });
    router.get('/boom', async (req, res) => {
        throw new Error('Boom!'); // simulated crash, should be caught by errorHandler
    })
    return router;
}