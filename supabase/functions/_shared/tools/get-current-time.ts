import { getCurrentTimeSchema } from './schemas.ts'
import type { ToolDefinition } from './types.ts'

export const getCurrentTimeTool: ToolDefinition = {
  name: 'get_current_time',
  description: 'Get the current date and time. Use this when the user asks what time or date it is.',
  parameters: getCurrentTimeSchema,
  strict: true,
  timeoutMs: 1_000,
  async execute(argumentsValue) {
    const timezoneValue = (argumentsValue as { timezone: string | null }).timezone
    const timezone = timezoneValue || 'America/Santiago'
    const now = new Date()
    let formatted: string
    try {
      formatted = new Intl.DateTimeFormat('es-CL', { dateStyle: 'full', timeStyle: 'long', timeZone: timezone }).format(now)
    } catch {
      throw new Error('INVALID_TIMEZONE')
    }
    return { iso: now.toISOString(), timezone, formatted }
  },
}
