import { PDFDocument, StandardFonts, type PDFFont, type PDFPage, rgb } from 'npm:pdf-lib@1.17.1'
import type { ToolDefinition } from './types.ts'
import { toCanonicalDocument, type CanonicalDocument } from './document-model.ts'

const GENERATED_BUCKET = 'generated-files'
const MAX_SECTIONS = 12
const MAX_PARAGRAPHS_PER_SECTION = 12
const MAX_BULLETS_PER_SECTION = 20
const MAX_TABLE_COLUMNS = 8
const MAX_TABLE_ROWS = 40
const MAX_TEXT_LENGTH = 20_000
const MAX_PDF_BYTES = 5 * 1024 * 1024
const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 48
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const BODY_SIZE = 10
const BODY_LINE_HEIGHT = 14
const HEADING_SIZE = 15
const TITLE_SIZE = 24

export type PdfTable = { headers: string[]; rows: string[][] }
export type PdfSection = { heading: string; paragraphs?: string[]; bullets?: string[]; table?: PdfTable | null }
export type GeneratePdfArguments = { filename: string; title: string; author: string; subtitle?: string | null; sections: PdfSection[]; footer?: string | null }
export type GeneratedPdfResult = { generated_file_id: string; filename: string; version: number; parent_generated_file_id?: string; mime_type: 'application/pdf'; format: 'pdf'; size_bytes: number }

type Layout = {
  doc: PDFDocument
  page: PDFPage
  regular: PDFFont
  bold: PDFFont
  y: number
  signal?: AbortSignal
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('TOOL_CANCELLED')
}

function asText(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid PDF ${field}`)
  if (value.length > MAX_TEXT_LENGTH) throw new Error('PDF_CONTENT_TOO_LARGE')
  return value.trim()
}

export function sanitizeFilename(value: string) {
  const filename = value.normalize('NFKC').replace(/[\\/]/g, '-').replace(/\.\.+/g, '.').replace(/[^a-zA-Z0-9._ -]/g, '-').replace(/\s+/g, ' ').trim()
  const safeName = filename || 'generated-document'
  return safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = []
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) { lines.push(''); continue }
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate
        continue
      }
      if (line) lines.push(line)
      line = ''
      for (const character of word) {
        const candidateCharacter = `${line}${character}`
        if (font.widthOfTextAtSize(candidateCharacter, size) > maxWidth && line) {
          lines.push(line)
          line = character
        } else line = candidateCharacter
      }
    }
    if (line) lines.push(line)
  }
  return lines
}

function newPage(layout: Layout) {
  layout.page = layout.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  layout.y = PAGE_HEIGHT - MARGIN
  assertNotAborted(layout.signal)
}

function ensureSpace(layout: Layout, height: number) {
  if (layout.y - height < MARGIN) newPage(layout)
}

function drawLines(layout: Layout, lines: string[], font: PDFFont, size: number, color = rgb(0.1, 0.14, 0.13)) {
  for (const line of lines) {
    ensureSpace(layout, size + 4)
    layout.page.drawText(line, { x: MARGIN, y: layout.y, size, font, color })
    layout.y -= size + 4
    assertNotAborted(layout.signal)
  }
}

function drawParagraph(layout: Layout, text: string, indent = 0) {
  const lines = wrapText(text, layout.regular, BODY_SIZE, CONTENT_WIDTH - indent)
  for (const line of lines) {
    ensureSpace(layout, BODY_LINE_HEIGHT)
    layout.page.drawText(line, { x: MARGIN + indent, y: layout.y, size: BODY_SIZE, font: layout.regular, color: rgb(0.1, 0.14, 0.13) })
    layout.y -= BODY_LINE_HEIGHT
  }
  layout.y -= 5
}

function drawTable(layout: Layout, table: PdfTable) {
  const columnWidth = CONTENT_WIDTH / table.headers.length
  const rows = [table.headers, ...table.rows]
  rows.forEach((row, rowIndex) => {
    const cellLines = row.map((cell) => wrapText(cell, rowIndex === 0 ? layout.bold : layout.regular, 8.5, columnWidth - 10))
    const rowHeight = Math.max(22, Math.max(...cellLines.map((lines) => lines.length)) * 11 + 10)
    if (layout.y - rowHeight < MARGIN) {
      newPage(layout)
      if (rowIndex > 0) layout.y -= 4
    }
    const top = layout.y
    row.forEach((_cell, columnIndex) => {
      const x = MARGIN + columnIndex * columnWidth
      layout.page.drawRectangle({ x, y: top - rowHeight, width: columnWidth, height: rowHeight, borderColor: rgb(0.75, 0.8, 0.77), borderWidth: 0.5, color: rowIndex === 0 ? rgb(0.9, 0.94, 0.91) : rgb(1, 1, 1) })
      cellLines[columnIndex].forEach((line, lineIndex) => {
        layout.page.drawText(line, { x: x + 5, y: top - 13 - lineIndex * 11, size: 8.5, font: rowIndex === 0 ? layout.bold : layout.regular, color: rgb(0.1, 0.14, 0.13) })
      })
    })
    layout.y -= rowHeight
    assertNotAborted(layout.signal)
  })
  layout.y -= 10
}

function validateDocument(input: GeneratePdfArguments) {
  if (!Array.isArray(input.sections) || input.sections.length === 0) throw new Error('PDF_NO_SECTIONS')
  if (input.sections.length > MAX_SECTIONS) throw new Error('PDF_TOO_MANY_SECTIONS')
  for (const section of input.sections) {
    asText(section.heading, 'section heading')
    if ((section.paragraphs?.length ?? 0) > MAX_PARAGRAPHS_PER_SECTION) throw new Error('PDF_TOO_MANY_PARAGRAPHS')
    if ((section.bullets?.length ?? 0) > MAX_BULLETS_PER_SECTION) throw new Error('PDF_TOO_MANY_BULLETS')
    section.paragraphs?.forEach((paragraph) => asText(paragraph, 'paragraph'))
    section.bullets?.forEach((bullet) => asText(bullet, 'bullet'))
    if (section.table) {
      if (section.table.headers.length === 0) throw new Error('PDF_EMPTY_TABLE')
      if (section.table.headers.length > MAX_TABLE_COLUMNS) throw new Error('PDF_TOO_MANY_COLUMNS')
      if (section.table.rows.length > MAX_TABLE_ROWS) throw new Error('PDF_TOO_MANY_ROWS')
      section.table.headers.forEach((header) => asText(header, 'table header'))
      section.table.rows.forEach((row) => {
        if (row.length !== section.table?.headers.length) throw new Error('Invalid PDF table row')
        row.forEach((cell) => asText(cell, 'table cell'))
      })
    }
  }
}

export async function createPdf(input: GeneratePdfArguments, signal?: AbortSignal) {
  validateDocument(input)
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  doc.setTitle(input.title)
  doc.setAuthor(input.author)
  doc.setCreator('CSFR Assistant')
  const layout: Layout = { doc, page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]), regular, bold, y: PAGE_HEIGHT - MARGIN, signal }

  drawLines(layout, wrapText(input.title, bold, TITLE_SIZE, CONTENT_WIDTH), bold, TITLE_SIZE, rgb(0.09, 0.3, 0.24))
  layout.y -= 4
  if (input.subtitle) drawLines(layout, wrapText(asText(input.subtitle, 'subtitle'), regular, 12, CONTENT_WIDTH), regular, 12, rgb(0.35, 0.4, 0.37))
  layout.y -= 12

  for (const section of input.sections) {
    ensureSpace(layout, HEADING_SIZE + 16)
    drawLines(layout, wrapText(section.heading, bold, HEADING_SIZE, CONTENT_WIDTH), bold, HEADING_SIZE, rgb(0.09, 0.3, 0.24))
    layout.y -= 2
    section.paragraphs?.forEach((paragraph) => drawParagraph(layout, paragraph))
    section.bullets?.forEach((bullet) => drawParagraph(layout, `- ${bullet}`, 10))
    if (section.table) drawTable(layout, section.table)
    layout.y -= 5
  }
  if (input.footer) {
    const footer = asText(input.footer, 'footer')
    ensureSpace(layout, 20)
    drawLines(layout, wrapText(footer, regular, 8, CONTENT_WIDTH), regular, 8, rgb(0.4, 0.44, 0.42))
  }

  const bytes = await doc.save()
  if (bytes.length === 0) throw new Error('PDF_EMPTY')
  if (bytes.length > MAX_PDF_BYTES) throw new Error('PDF_BYTES_TOO_LARGE')
  return bytes
}

export const generatePdfSchema = {
  type: 'object',
  properties: {
    filename: { type: 'string', description: 'Suggested PDF filename.' },
    title: { type: 'string', description: 'Document title.' },
    author: { type: 'string', description: 'Document author.' },
    subtitle: { type: ['string', 'null'], description: 'Optional subtitle.' },
    sections: {
      type: 'array',
      description: 'Structured document sections. Do not use HTML or code.',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          paragraphs: { type: 'array', items: { type: 'string' } },
          bullets: { type: 'array', items: { type: 'string' } },
          table: {
            type: ['object', 'null'],
            properties: { headers: { type: 'array', items: { type: 'string' } }, rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } } },
            required: ['headers', 'rows'],
            additionalProperties: false,
          },
        },
        required: ['heading', 'paragraphs', 'bullets', 'table'],
        additionalProperties: false,
      },
    },
    footer: { type: ['string', 'null'], description: 'Optional footer text.' },
  },
  required: ['filename', 'title', 'author', 'subtitle', 'sections', 'footer'],
  additionalProperties: false,
}

export async function persistGeneratedPdf(input: GeneratePdfArguments, context: Parameters<ToolDefinition['execute']>[1], parentGeneratedFileId?: string, canonicalSource?: CanonicalDocument): Promise<GeneratedPdfResult> {
  const filename = sanitizeFilename(asText(input.filename, 'filename'))
  const title = asText(input.title, 'title')
  const author = asText(input.author, 'author')
  let version = 1
  let parent: { id: string; version: number; source_definition: unknown } | null = null
  if (parentGeneratedFileId) {
    const { data, error } = await context.supabase.from('generated_files').select('id, version, source_definition').eq('id', parentGeneratedFileId).eq('user_id', context.userId).eq('conversation_id', context.conversationId).single()
    if (error || !data || !data.source_definition) throw new Error('DOCUMENT_NOT_EDITABLE')
    parent = data
    version = data.version + 1
  }
  const definition = canonicalSource ?? toCanonicalDocument({ ...input, filename, title, author })
  const fileId = crypto.randomUUID()
  const storagePath = `${context.userId}/${fileId}/${filename}`
  assertNotAborted(context.signal)
  const pdfBytes = await createPdf(input, context.signal)
  assertNotAborted(context.signal)

  const { error: uploadError } = await context.supabase.storage.from(GENERATED_BUCKET).upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: false })
  if (uploadError) throw new Error('GENERATED_FILE_UPLOAD_FAILED')

  const { error: rowError } = await context.supabase.from('generated_files').insert({
    id: fileId,
    user_id: context.userId,
    conversation_id: context.conversationId,
    message_id: context.messageId ?? null,
    tool_execution_id: context.toolExecutionId ?? null,
    storage_bucket: GENERATED_BUCKET,
    storage_path: storagePath,
    filename,
    mime_type: 'application/pdf',
    size_bytes: pdfBytes.length,
    source_definition: definition,
    parent_generated_file_id: parent?.id ?? null,
    version,
    metadata: { title, author, section_count: input.sections.length },
  })
  if (rowError) {
    await context.supabase.storage.from(GENERATED_BUCKET).remove([storagePath])
    throw new Error('GENERATED_FILE_METADATA_FAILED')
  }
  if (parent) {
    await context.supabase.from('generated_files').update({ superseded_at: new Date().toISOString() }).eq('id', parent.id).eq('user_id', context.userId)
  }
  return { generated_file_id: fileId, filename, version, ...(parent ? { parent_generated_file_id: parent.id } : {}), mime_type: 'application/pdf', format: 'pdf', size_bytes: pdfBytes.length }
}

export const generatePdfTool: ToolDefinition = {
  name: 'generate_pdf',
  description: 'Generate a structured PDF report and save it to the user conversation. Use only when the user explicitly requests a PDF.',
  parameters: generatePdfSchema,
  strict: true,
  timeoutMs: 10_000,
  async execute(argumentsValue, context): Promise<GeneratedPdfResult> {
    const input = argumentsValue as GeneratePdfArguments
    return persistGeneratedPdf(input, context, undefined, toCanonicalDocument(input))
  },
}
