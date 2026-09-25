import * as XLSX from 'npm:xlsx@0.18.5'
import { persistGeneratedBinary, sanitizeGeneratedFilename } from './generated-file-storage.ts'
import type { ToolContext, ToolDefinition } from './types.ts'

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const MAX_SHEETS = 10
const MAX_COLUMNS = 50
const MAX_ROWS = 5_000
const MAX_CELL_LENGTH = 20_000

type ExcelValue = string | number | boolean | null
type ExcelColumn = { header: string; key: string; width?: number | null }
type ExcelCell = { key: string; value: ExcelValue }
type ExcelRow = { cells: ExcelCell[] }
type ExcelSheet = { name: string; columns: ExcelColumn[]; rows: ExcelRow[] }
type GenerateExcelArguments = { filename: string; title: string; sheets: ExcelSheet[] }
export type GeneratedExcelResult = { generated_file_id: string; filename: string; version: 1; mime_type: typeof MIME_XLSX; format: 'xlsx'; size_bytes: number }

function text(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_CELL_LENGTH) throw new Error(`INVALID_EXCEL_${field.toUpperCase()}`)
  return value.trim()
}

function validateValue(value: unknown, field: string): ExcelValue {
  if (value === null) return null
  if (typeof value === 'string') { if (value.length > MAX_CELL_LENGTH) throw new Error(`INVALID_EXCEL_${field.toUpperCase()}`); return value }
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'boolean') return value
  throw new Error(`INVALID_EXCEL_${field.toUpperCase()}`)
}

function validateInput(input: GenerateExcelArguments) {
  text(input.filename, 'filename')
  text(input.title, 'title')
  if (!Array.isArray(input.sheets) || input.sheets.length === 0) throw new Error('EXCEL_NO_SHEETS')
  if (input.sheets.length > MAX_SHEETS) throw new Error('EXCEL_TOO_MANY_SHEETS')
  for (const sheet of input.sheets) {
    text(sheet.name, 'sheet_name')
    if (sheet.name.length > 31 || /[\\/*?:[\]]/.test(sheet.name)) throw new Error('EXCEL_INVALID_SHEET_NAME')
    if (!Array.isArray(sheet.columns) || sheet.columns.length === 0 || sheet.columns.length > MAX_COLUMNS) throw new Error('EXCEL_INVALID_COLUMNS')
    if (!Array.isArray(sheet.rows) || sheet.rows.length > MAX_ROWS) throw new Error('EXCEL_TOO_MANY_ROWS')
    const keys = new Set<string>()
    for (const column of sheet.columns) {
      text(column.header, 'column_header')
      text(column.key, 'column_key')
      if (keys.has(column.key)) throw new Error('EXCEL_DUPLICATE_COLUMN_KEY')
      keys.add(column.key)
      if (column.width !== undefined && column.width !== null && (!Number.isFinite(column.width) || column.width < 4 || column.width > 80)) throw new Error('EXCEL_INVALID_COLUMN_WIDTH')
    }
    for (const row of sheet.rows) {
      if (!Array.isArray(row.cells)) throw new Error('EXCEL_INVALID_ROW')
      const rowKeys = new Set<string>()
      for (const cell of row.cells) {
        text(cell.key, 'cell_key')
        if (!keys.has(cell.key) || rowKeys.has(cell.key)) throw new Error('EXCEL_INVALID_CELL_KEY')
        rowKeys.add(cell.key)
        validateValue(cell.value, 'cell_value')
      }
    }
  }
}

function createWorkbook(input: GenerateExcelArguments) {
  const workbook = XLSX.utils.book_new()
  for (const sheet of input.sheets) {
    const values = [
      sheet.columns.map((column) => column.header),
      ...sheet.rows.map((row) => {
        const cells = new Map(row.cells.map((cell) => [cell.key, validateValue(cell.value, 'cell_value')]))
        return sheet.columns.map((column) => cells.get(column.key) ?? null)
      }),
    ]
    const worksheet = XLSX.utils.aoa_to_sheet(values)
    worksheet['!cols'] = sheet.columns.map((column) => ({ wch: column.width ?? Math.max(10, Math.min(24, column.header.length + 2)) }))
    worksheet['!freeze'] = { xSplit: 0, ySplit: 1 }
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name)
  }
  return workbook
}

export const generateExcelSchema = {
  type: 'object',
  properties: {
    filename: { type: 'string', description: 'Suggested .xlsx filename.' },
    title: { type: 'string', description: 'Workbook title stored in metadata.' },
    sheets: {
      type: 'array',
      description: 'Workbook sheets. Rows use explicit cells because dynamic object keys are incompatible with strict Structured Outputs.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          columns: {
            type: 'array',
            items: {
              type: 'object',
              properties: { header: { type: 'string' }, key: { type: 'string' }, width: { type: ['number', 'null'] } },
              required: ['header', 'key', 'width'],
              additionalProperties: false,
            },
          },
          rows: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                cells: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { key: { type: 'string' }, value: { type: ['string', 'number', 'boolean', 'null'] } },
                    required: ['key', 'value'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['cells'],
              additionalProperties: false,
            },
          },
        },
        required: ['name', 'columns', 'rows'],
        additionalProperties: false,
      },
    },
  },
  required: ['filename', 'title', 'sheets'],
  additionalProperties: false,
}

export const generateExcelTool: ToolDefinition = {
  name: 'generate_excel',
  description: 'Generate a real XLSX workbook when the user explicitly asks for an Excel spreadsheet. Use only data provided by the user or conversation, do not invent factual data, do not generate download links, and let the UI artifact card handle downloading.',
  parameters: generateExcelSchema,
  strict: true,
  timeoutMs: 10_000,
  async execute(argumentsValue, context: ToolContext): Promise<GeneratedExcelResult> {
    const input = argumentsValue as GenerateExcelArguments
    validateInput(input)
    const workbook = createWorkbook(input)
    const bytes = new Uint8Array(XLSX.write(workbook, { bookType: 'xlsx', type: 'array', compression: true }) as ArrayBuffer)
    const filename = sanitizeGeneratedFilename(input.filename, '.xlsx')
    const persisted = await persistGeneratedBinary(bytes, filename, MIME_XLSX, { format: 'xlsx', title: input.title, sheet_count: input.sheets.length }, context)
    return { ...persisted, version: 1, format: 'xlsx' }
  },
}
