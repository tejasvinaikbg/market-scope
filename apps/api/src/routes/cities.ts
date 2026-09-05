import { Router } from 'express'
import { z } from '../openapi/zod.ts'
import { registry, errorResponses } from '../openapi/registry.ts'
import { getCityBounds } from '../services/cities.ts'

const Bbox = z.object({ south: z.number(), west: z.number(), north: z.number(), east: z.number() }).openapi("Bbox")
const CityBounds = z.object({ cityId: z.number(), name: z.string(), bbox: Bbox, centre: z.object({ lat: z.number(), lng: z.number() }), cached: z.boolean() }).openapi('CityBounds')
const IdParam = z.object({ id: z.coerce.number().int().positive() })

registry.registerPath({
  method: 'get',
  path: "/api/cities/{id}/bbox",
  tags: ['cities'],
  summary: 'Bounding box',
  request: {
    params: IdParam
  },
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: CityBounds
        }
      }
    },
    ...errorResponses(400, 404, 500)
  }
})

export function citiesRouter() {
  const router = Router()
  router.get('/cities/:id/bbox', async (req, res) => {
    res.json(await getCityBounds(IdParam.parse(req.params).id))
  })
  return router
}