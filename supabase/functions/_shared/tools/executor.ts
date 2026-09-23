import type { ToolContext, ToolError, ToolExecution } from './types.ts'
import { ToolRegistry } from './registry.ts'

function validationError(message: string): ToolError {
  return { code: 'TOOL_VALIDATION_ERROR', message }
}

function validateSchemaValue(schema: Record<string, unknown>, value: unknown, path: string): ToolError | null {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type]
  const valid = types.some((type) =>
    type === 'null' && value === null
    || type === 'string' && typeof value === 'string'
    || type === 'number' && typeof value === 'number' && Number.isFinite(value)
    || type === 'boolean' && typeof value === 'boolean'
    || type === 'object' && typeof value === 'object' && value !== null && !Array.isArray(value)
    || type === 'array' && Array.isArray(value),
  )
  if (!valid) return validationError(`Invalid argument type: ${path}`)

  if (typeof value === 'string' && typeof schema.maxLength === 'number' && value.length > schema.maxLength) return validationError(`Argument is too long: ${path}`)
  if (Array.isArray(value)) {
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) return validationError(`Too many items: ${path}`)
    if (schema.items && typeof schema.items === 'object') {
      for (const [index, item] of value.entries()) {
        const error = validateSchemaValue(schema.items as Record<string, unknown>, item, `${path}[${index}]`)
        if (error) return error
      }
    }
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const objectValue = value as Record<string, unknown>
    const required = Array.isArray(schema.required) ? schema.required.filter((key): key is string => typeof key === 'string') : []
    for (const key of required) if (!(key in objectValue)) return validationError(`Missing required argument: ${path}.${key}`)
    const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties as Record<string, Record<string, unknown>> : {}
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(objectValue)) if (!(key in properties)) return validationError(`Unknown argument: ${path}.${key}`)
    }
    for (const [key, property] of Object.entries(properties)) {
      if (!(key in objectValue)) continue
      const error = validateSchemaValue(property, objectValue[key], `${path}.${key}`)
      if (error) return error
    }
  }
  return null
}

function validateArguments(schema: Record<string, unknown>, value: unknown): ToolError | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return validationError('Tool arguments must be a JSON object.')
  return validateSchemaValue(schema, value, 'arguments')
}

async function executeWithTimeout(
  tool: ToolDefinition,
  argumentsValue: unknown,
  context: ToolContext,
  timeoutMs: number,
) {
  const controller = new AbortController()
  const abortFromParent = () => controller.abort(context.signal?.reason)
  if (context.signal?.aborted) abortFromParent()
  else context.signal?.addEventListener('abort', abortFromParent, { once: true })

  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    return await tool.execute(argumentsValue, { ...context, signal: controller.signal })
  } catch (error) {
    if (timedOut) throw new Error('TOOL_TIMEOUT')
    throw error
  } finally {
    clearTimeout(timer)
    context.signal?.removeEventListener('abort', abortFromParent)
  }
}

export async function executeTool(registry: ToolRegistry, toolName: string, rawArguments: string, context: ToolContext, callId: string): Promise<ToolExecution> {
  const executionId = crypto.randomUUID()
  const execution: ToolExecution = { executionId, toolName, callId, arguments: rawArguments, context, startedAt: new Date().toISOString() }
  const tool = registry.get(toolName)
  if (!tool) {
    execution.result = { success: false, error: { code: 'UNKNOWN_TOOL', message: 'The requested tool is not available.' } }
    execution.finishedAt = new Date().toISOString()
    return execution
  }

  let argumentsValue: unknown
  try { argumentsValue = JSON.parse(rawArguments) } catch {
    execution.result = { success: false, error: validationError('Tool arguments are not valid JSON.') }
    execution.finishedAt = new Date().toISOString()
    return execution
  }
  const invalidArguments = validateArguments(tool.parameters, argumentsValue)
  if (invalidArguments) {
    execution.result = { success: false, error: invalidArguments }
    execution.finishedAt = new Date().toISOString()
    return execution
  }

  try {
    const data = await executeWithTimeout(tool, argumentsValue, { ...context, toolExecutionId: executionId }, tool.timeoutMs)
    execution.result = { success: true, data }
  } catch (error) {
    const safeCode = error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : 'TOOL_EXECUTION_FAILED'
    execution.result = { success: false, error: { code: safeCode === 'TOOL_TIMEOUT' ? 'TOOL_TIMEOUT' : safeCode, message: 'The tool could not complete.' } }
  }
  execution.finishedAt = new Date().toISOString()
  return execution
}
