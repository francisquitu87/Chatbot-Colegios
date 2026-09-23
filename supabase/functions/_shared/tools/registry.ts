import type { ToolDefinition } from './types.ts'

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>()

  register(tool: ToolDefinition) {
    if (this.tools.has(tool.name)) throw new Error(`Tool already registered: ${tool.name}`)
    this.tools.set(tool.name, tool)
    return this
  }

  get(name: string) {
    return this.tools.get(name)
  }

  has(name: string) {
    return this.tools.has(name)
  }

  list() {
    return [...this.tools.values()]
  }

  definitions() {
    return this.list().map(({ execute: _execute, timeoutMs: _timeoutMs, ...definition }) => ({ type: 'function', ...definition }))
  }
}
