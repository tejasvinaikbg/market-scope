import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "./zod.ts";

export const registry = new OpenAPIRegistry()

export const ErrorEnvelope = registry.register("ErrorEnvelope", z.object({
    error: z.object({
        code: z.string().openapi({ example: "VALIDATION_ERROR" }),
        message: z.string(),
        details: z.unknown().optional()
    }),
}));

export const errorResponses = (...statuses: Array<400 | 404 | 500>) => Object.fromEntries(statuses.map((s) => [s, {
    description: { 400: 'Invalid request', 404: 'Not found', 500: 'Internal server error' }[s],
    content: {
        "application/json": {
            schema: ErrorEnvelope
        }
    }
}]))