import type { GeneratePdfArguments, PdfSection } from './generate-pdf.ts'

type ParagraphBlock = { id: string; type: 'paragraph'; text: string }
type BulletBlock = { id: string; type: 'bullet'; text: string }
export type DocumentBlock = {
  id: string
  type: 'section'
  heading: string
  children: Array<ParagraphBlock | BulletBlock>
  table?: { headers: string[]; rows: string[][] } | null
}
export type CanonicalDocument = {
  schema: 'csfr.document.v1'
  document: {
    filename: string
    title: string
    author: string
    subtitle: string | null
    blocks: DocumentBlock[]
    footer: string | null
  }
}

type LegacyInput = GeneratePdfArguments

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function sectionToBlock(section: PdfSection) : DocumentBlock {
  return {
    id: id('section'),
    type: 'section',
    heading: section.heading,
    children: [
      ...(section.paragraphs ?? []).map((text) => ({ id: id('paragraph'), type: 'paragraph' as const, text })),
      ...(section.bullets ?? []).map((text) => ({ id: id('bullet'), type: 'bullet' as const, text })),
    ],
    table: section.table ?? null,
  }
}

export function toCanonicalDocument(input: LegacyInput): CanonicalDocument {
  return {
    schema: 'csfr.document.v1',
    document: {
      filename: input.filename,
      title: input.title,
      author: input.author,
      subtitle: input.subtitle ?? null,
      blocks: input.sections.map(sectionToBlock),
      footer: input.footer ?? null,
    },
  }
}

export function isCanonicalDocument(value: unknown): value is CanonicalDocument {
  return typeof value === 'object' && value !== null && (value as { schema?: unknown }).schema === 'csfr.document.v1' && typeof (value as { document?: unknown }).document === 'object'
}

export function canonicalFromSource(value: unknown): CanonicalDocument | null {
  if (isCanonicalDocument(value)) return structuredClone(value)
  if (typeof value !== 'object' || value === null) return null
  const source = value as Partial<LegacyInput>
  if (typeof source.filename !== 'string' || typeof source.title !== 'string' || typeof source.author !== 'string' || !Array.isArray(source.sections)) return null
  return toCanonicalDocument({ filename: source.filename, title: source.title, author: source.author, subtitle: source.subtitle ?? null, sections: source.sections, footer: source.footer ?? null })
}

export function toPdfArguments(source: CanonicalDocument): GeneratePdfArguments {
  return {
    filename: source.document.filename,
    title: source.document.title,
    author: source.document.author,
    subtitle: source.document.subtitle,
    sections: source.document.blocks.map((block) => ({
      heading: block.heading,
      paragraphs: block.children.filter((child) => child.type === 'paragraph').map((child) => child.text),
      bullets: block.children.filter((child) => child.type === 'bullet').map((child) => child.text),
      table: block.table ?? null,
    })),
    footer: source.document.footer,
  }
}

export function validateCanonicalDocument(source: CanonicalDocument) {
  const ids = new Set<string>()
  if (source.document.blocks.length === 0) throw new Error('DOCUMENT_EMPTY')
  for (const block of source.document.blocks) {
    if (!block.id || ids.has(block.id)) throw new Error('DOCUMENT_DUPLICATE_BLOCK_ID')
    ids.add(block.id)
    for (const child of block.children) {
      if (!child.id || ids.has(child.id) || !child.text.trim()) throw new Error('DOCUMENT_INVALID_CHILD')
      ids.add(child.id)
    }
    if (block.table) {
      if (!block.table.headers.length || block.table.rows.some((row) => row.length !== block.table?.headers.length)) throw new Error('DOCUMENT_INVALID_TABLE')
    }
  }
}

type PatchBlock = { type: 'section'; heading: string; paragraphs: string[]; bullets: string[]; table?: { headers: string[]; rows: string[][] } | null }
export type DocumentOperation =
  | { type: 'add_block'; after_block_id?: string | null; before_block_id?: string | null; block: PatchBlock }
  | { type: 'remove_block'; block_id: string }
  | { type: 'replace_block'; block_id: string; block: PatchBlock }
  | { type: 'append_to_block'; block_id: string; paragraphs?: string[]; bullets?: string[] }
  | { type: 'replace_text'; block_id: string; find: string; replace: string }
  | { type: 'update_metadata'; title?: string; subtitle?: string | null; filename?: string; footer?: string | null }
  | { type: 'restore_block'; block_id: string }

export type DocumentPatch = { operations: DocumentOperation[] }

function makeBlock(input: PatchBlock, stableId?: string): DocumentBlock {
  return {
    id: stableId ?? id('section'),
    type: 'section',
    heading: input.heading,
    children: [
      ...input.paragraphs.map((text) => ({ id: id('paragraph'), type: 'paragraph' as const, text })),
      ...input.bullets.map((text) => ({ id: id('bullet'), type: 'bullet' as const, text })),
    ],
    table: input.table ?? null,
  }
}

function historicalBlock(ancestors: CanonicalDocument[], blockId: string) {
  for (const ancestor of ancestors) {
    const index = ancestor.document.blocks.findIndex((candidate) => candidate.id === blockId)
    if (index >= 0) return { block: structuredClone(ancestor.document.blocks[index]), order: ancestor.document.blocks.map((candidate) => candidate.id), index }
  }
  return null
}

export function applyDocumentPatch(source: CanonicalDocument, patch: DocumentPatch, ancestors: CanonicalDocument[] = []) {
  const result = structuredClone(source)
  for (const operation of patch.operations) {
    if (operation.type === 'add_block') {
      if (operation.after_block_id && operation.before_block_id) throw new Error('PATCH_MULTIPLE_ANCHORS')
      const block = makeBlock(operation.block)
      if (result.document.blocks.some((candidate) => candidate.id === block.id)) throw new Error('PATCH_DUPLICATE_BLOCK_ID')
      const anchor = operation.after_block_id ?? operation.before_block_id
      if (anchor) {
        const index = result.document.blocks.findIndex((candidate) => candidate.id === anchor)
        if (index < 0) throw new Error('PATCH_ANCHOR_NOT_FOUND')
        result.document.blocks.splice(operation.after_block_id ? index + 1 : index, 0, block)
      } else result.document.blocks.push(block)
    } else if (operation.type === 'remove_block') {
      const index = result.document.blocks.findIndex((candidate) => candidate.id === operation.block_id)
      if (index < 0) throw new Error('PATCH_BLOCK_NOT_FOUND')
      result.document.blocks.splice(index, 1)
    } else if (operation.type === 'replace_block') {
      const index = result.document.blocks.findIndex((candidate) => candidate.id === operation.block_id)
      if (index < 0) throw new Error('PATCH_BLOCK_NOT_FOUND')
      result.document.blocks[index] = makeBlock(operation.block, operation.block_id)
    } else if (operation.type === 'append_to_block') {
      const block = result.document.blocks.find((candidate) => candidate.id === operation.block_id)
      if (!block) throw new Error('PATCH_BLOCK_NOT_FOUND')
      block.children.push(...(operation.paragraphs ?? []).map((text) => ({ id: id('paragraph'), type: 'paragraph' as const, text })), ...(operation.bullets ?? []).map((text) => ({ id: id('bullet'), type: 'bullet' as const, text })))
    } else if (operation.type === 'replace_text') {
      const block = result.document.blocks.find((candidate) => candidate.id === operation.block_id)
      if (!block) throw new Error('PATCH_BLOCK_NOT_FOUND')
      let replaced = false
      for (const child of block.children) if (child.text.includes(operation.find)) { child.text = child.text.replaceAll(operation.find, operation.replace); replaced = true }
      if (!replaced) throw new Error('PATCH_TEXT_NOT_FOUND')
    } else if (operation.type === 'update_metadata') {
      if (operation.title !== undefined) result.document.title = operation.title
      if (operation.subtitle !== undefined) result.document.subtitle = operation.subtitle
      if (operation.filename !== undefined) result.document.filename = operation.filename
      if (operation.footer !== undefined) result.document.footer = operation.footer
    } else if (operation.type === 'restore_block') {
      if (result.document.blocks.some((candidate) => candidate.id === operation.block_id)) throw new Error('PATCH_BLOCK_ALREADY_PRESENT')
      const historical = historicalBlock(ancestors, operation.block_id)
      if (!historical) throw new Error('PATCH_HISTORICAL_BLOCK_NOT_FOUND')
      const previousIds = historical.order.slice(0, historical.index).reverse()
      const nextIds = historical.order.slice(historical.index + 1)
      const previousIndex = previousIds.map((id) => result.document.blocks.findIndex((candidate) => candidate.id === id)).find((index) => index >= 0)
      const nextIndex = nextIds.map((id) => result.document.blocks.findIndex((candidate) => candidate.id === id)).find((index) => index >= 0)
      const insertionIndex = previousIndex !== undefined ? previousIndex + 1 : nextIndex ?? result.document.blocks.length
      result.document.blocks.splice(insertionIndex, 0, historical.block)
    }
  }
  validateCanonicalDocument(result)
  return result
}
