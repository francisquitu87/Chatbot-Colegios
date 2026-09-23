# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## File uploads

The private `chat-files` bucket accepts PDF, XLSX, XLS, CSV, DOCX, TXT, PNG, JPG, JPEG, and WEBP files. The initial per-file limit is 6 MB, matching Supabase's recommendation for standard uploads. Files larger than 6 MB are rejected until resumable TUS uploads are introduced; Supabase recommends TUS for those files with 6 MB chunks.

Files are stored under `{user_id}/{file_id}/{sanitized_name}` and are never public. Downloads use short-lived signed URLs. Uploads validate the conversation ownership, filename, MIME type, extension, and size on both the client and the authenticated `files` Edge Function.

## Tools

Currently registered:

- `get_current_time`
- `generate_pdf`

Tool calls follow this flow:

```text
OpenAI
  ↓
function_call
  ↓
Tool Registry
  ↓
Executor
  ↓
function_call_output
  ↓
OpenAI
```

The registry exposes only registered tools. The executor validates JSON arguments against each tool's strict schema, supplies server-generated context, enforces a per-tool timeout, and returns structured errors for unknown tools, invalid arguments, execution failures, and timeouts. The chat loop supports multiple function calls per response and is capped at four tool rounds.

Future roadmap: `generate_excel`, `generate_image`, `search_files`, and `web_search`.

## PDF Generation

The first generated-file tool is `generate_pdf`:

```text
User request
  ↓
Responses API
  ↓
generate_pdf
  ↓
PDF generator
  ↓
Supabase Storage (private generated-files bucket)
  ↓
generated_files
  ↓
file_generated SSE
  ↓
React
```

PDFs are created in the Edge Function with the exact dependency `pdf-lib@1.17.1` imported as `npm:pdf-lib@1.17.1`. The runtime uses `PDFDocument.create()` and `save()` directly; no frontend dependency, HTML, JavaScript, Chromium, or remote URL is involved. Standard Helvetica fonts cover the Spanish Latin characters used by the first version; arbitrary Unicode requires an embedded font and is intentionally outside this iteration.

The input is structured as a title, author, sections, paragraphs, bullets, and simple tables. The backend supplies ownership, conversation, message, storage bucket, storage path, and generated IDs. The current limits are 12 sections, 12 paragraphs and 20 bullets per section, 8 table columns, 40 table rows, 20,000 characters per text value, and a 5 MB PDF. Tool execution retains the existing 10-second timeout and AbortSignal.

Generated files are stored privately at `{user_id}/{generated_file_id}/{filename}` and exposed to the browser only through a five-minute signed URL after an ownership-filtered metadata query. The migration is `000004_generated_files.sql`; it adds RLS for metadata and Storage policies for the private bucket.

## Document revisions

Generated PDFs persist a canonical `source_definition` with schema `csfr.document.v1`. Sections and their child blocks receive backend-generated stable IDs. `revise_generated_document` is a strict Structured Output tool whose arguments are PATCH operations, never a replacement document. The backend validates and applies `add_block`, `remove_block`, `replace_block`, `append_to_block`, `replace_text`, `update_metadata`, and `restore_block` deterministically before reusing the existing PDF renderer.

Versions form a single parent lineage through `parent_generated_file_id` and `version`. Historical blocks can be restored by ID from ancestors, retaining their original content and stable ID. Ownership is checked on every artifact lookup. A single chat turn can create at most one successful generated artifact; duplicate model retries reuse that result, preventing duplicate files from one user request. The frontend deduplicates cards by `generated_file_id` during SSE, hydration, and reload.

The assistant never supplies download Markdown links. Generated files are rendered by `GeneratedFileCard`, and downloads resolve the artifact ID to a short-lived signed URL only after the user activates the UI control. Localhost and loopback download links from assistant Markdown are blocked as a secondary defense.
