/**
 * The one `z` for the whole API: zod extended with .openapi() so a schema validates a request AND documents it.
 * Every schema file imports z from here, never from 'zod' directly, so the extension always runs first.
 */
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
extendZodWithOpenApi(z);
export { z };