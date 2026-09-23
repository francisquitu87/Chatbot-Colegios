import { persistGeneratedPdf, type GeneratedPdfResult } from './generate-pdf.ts'
import { applyDocumentPatch, canonicalFromSource, toPdfArguments, type CanonicalDocument, type DocumentPatch } from './document-model.ts'
import type { ToolContext, ToolDefinition } from './types.ts'

const patchBlockSchema = {
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
}

const operationSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['add_block', 'remove_block', 'replace_block', 'append_to_block', 'replace_text', 'update_metadata', 'restore_block'] },
    after_block_id: { type: ['string', 'null'] },
    before_block_id: { type: ['string', 'null'] },
    block_id: { type: ['string', 'null'] },
    block: { type: ['object', 'null'], properties: patchBlockSchema.properties, required: patchBlockSchema.required, additionalProperties: false },
    paragraphs: { type: 'array', items: { type: 'string' } },
    bullets: { type: 'array', items: { type: 'string' } },
    find: { type: ['string', 'null'] },
    replace: { type: ['string', 'null'] },
    title: { type: ['string', 'null'] },
    subtitle: { type: ['string', 'null'] },
    filename: { type: ['string', 'null'] },
    footer: { type: ['string', 'null'] },
  },
  required: ['type', 'after_block_id', 'before_block_id', 'block_id', 'block', 'paragraphs', 'bullets', 'find', 'replace', 'title', 'subtitle', 'filename', 'footer'],
  additionalProperties: false,
}

export const reviseGeneratedDocumentSchema = {
  type: 'object',
  properties: {
    source_generated_file_id: { type: ['string', 'null'] },
    operations: { type: 'array', items: operationSchema },
  },
  required: ['source_generated_file_id', 'operations'],
  additionalProperties: false,
}

type RevisionArguments = { source_generated_file_id: string | null; operations: DocumentPatch['operations'] }
type ArtifactRow = { id: string; source_definition: unknown; version: number; created_at: string; parent_generated_file_id: string | null }

async function resolveSource(argumentsValue: RevisionArguments, context: ToolContext) {
  let query = context.supabase.from('generated_files').select('id, source_definition, version, created_at, parent_generated_file_id').eq('user_id', context.userId).eq('conversation_id', context.conversationId).not('source_definition', 'is', null).is('superseded_at', null).order('created_at', { ascending: false }).limit(1)
  if (argumentsValue.source_generated_file_id) query = context.supabase.from('generated_files').select('id, source_definition, version, created_at, parent_generated_file_id').eq('id', argumentsValue.source_generated_file_id).eq('user_id', context.userId).eq('conversation_id', context.conversationId).not('source_definition', 'is', null).limit(1)
  const { data, error } = await query
  const row = data?.[0] as ArtifactRow | undefined
  const source = row && canonicalFromSource(row.source_definition)
  if (error || !row || !source) throw new Error('DOCUMENT_NOT_EDITABLE')
  return { row, source }
}

async function loadAncestors(row: ArtifactRow, context: ToolContext) {
  const ancestors: CanonicalDocument[] = []
  let parentId = row.parent_generated_file_id
  while (parentId) {
    const { data, error } = await context.supabase.from('generated_files').select('id, source_definition, parent_generated_file_id').eq('id', parentId).eq('user_id', context.userId).eq('conversation_id', context.conversationId).single()
    if (error || !data) break
    const document = canonicalFromSource(data.source_definition)
    if (document) ancestors.push(document)
    parentId = data.parent_generated_file_id
  }
  return ancestors
}

export const reviseGeneratedDocumentTool: ToolDefinition = {
  name: 'revise_generated_document',
  description: 'Revise the latest editable PDF in this conversation or the specified generated file. Preserve unrequested content and create a new version. Never use for external or old PDFs without source definition.',
  parameters: reviseGeneratedDocumentSchema,
  strict: true,
  timeoutMs: 10_000,
  async execute(argumentsValue, context): Promise<GeneratedPdfResult> {
    const input = argumentsValue as RevisionArguments
    const { row, source } = await resolveSource(input, context)
    const revised = applyDocumentPatch(source, { operations: input.operations }, await loadAncestors(row, context))
    return persistGeneratedPdf(toPdfArguments(revised), context, row.id, revised)
  },
}
