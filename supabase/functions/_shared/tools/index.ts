import { ToolRegistry } from './registry.ts'
import { getCurrentTimeTool } from './get-current-time.ts'
import { generatePdfTool } from './generate-pdf.ts'
import { reviseGeneratedDocumentTool } from './revise-generated-document.ts'

export const toolRegistry = new ToolRegistry().register(getCurrentTimeTool).register(generatePdfTool).register(reviseGeneratedDocumentTool)
export const MAX_TOOL_ROUNDS = 4
