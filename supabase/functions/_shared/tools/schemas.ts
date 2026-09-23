import type { JsonSchema } from './types.ts'

export const getCurrentTimeSchema: JsonSchema = {
  type: 'object',
  properties: {
    timezone: {
      type: ['string', 'null'],
      description: 'IANA timezone such as America/Santiago. Use null for the server default.',
    },
  },
  required: ['timezone'],
  additionalProperties: false,
}
