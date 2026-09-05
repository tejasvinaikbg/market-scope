import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { registry } from './registry.ts';
import { config } from '../config.ts';

export function buildOpenApiDocument() {
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: {
      title: config.APP_NAME,
      version: config.APP_VERSION,
      description: config.APP_DESCRIPTION,
    },
    servers: [
      {
        url: '/',
      }
    ]
  })
}