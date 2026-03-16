# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev
npm test
npm test -- path/to/file.test.ts
npm run build
npm run setup        # install + prisma generate + migrate
npm run db:reset
npx prisma generate  # after schema changes
npx prisma migrate dev --name <name>
```

Tailwind uses the PostCSS plugin (`@tailwindcss/postcss`), not the CDN. The dev server requires `NODE_OPTIONS="--require ./node-compat.cjs"` (handled by the npm scripts).

## Environment

Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`. Without it, the app falls back to `MockLanguageModel` in `src/lib/provider.ts`, which generates static counter/card/form components for local testing.

## Architecture

This is an AI-powered React UI generator. Users describe components in a chat interface; the AI writes and edits files in a **virtual file system** (in-memory, per-request), which is then previewed live in an iframe.

### Core data flow

1. **Chat** (`src/components/chat/`) → user sends a message
2. **API route** (`src/app/api/chat/route.ts`) → streams a response from Claude (`claude-haiku-4-5`) using Vercel AI SDK. The AI has two tools:
   - `str_replace_editor` — create/view/edit files in the VFS (built in `src/lib/tools/str-replace.ts`)
   - `file_manager` — rename/delete files (built in `src/lib/tools/file-manager.ts`)
3. **FileSystemContext** (`src/lib/contexts/file-system-context.tsx`) — React context that wraps a `VirtualFileSystem` instance client-side. `handleToolCall` intercepts streaming tool calls and applies them to the local VFS, triggering a `refreshTrigger` state bump.
4. **Preview** (`src/components/preview/PreviewFrame.tsx`) — watches `refreshTrigger`, calls `createImportMap` + `createPreviewHTML` from `src/lib/transform/jsx-transformer.ts`, and writes the result to an `<iframe srcdoc>`. Files are transpiled with Babel Standalone; third-party imports are resolved via `esm.sh`.
5. **Persistence** — on stream finish, the server serializes `VirtualFileSystem.serialize()` and `messages` into the `Project` row (SQLite via Prisma). Both fields are JSON-stringified strings.

### VirtualFileSystem (`src/lib/file-system.ts`)

In-memory tree of `FileNode` objects, keyed by absolute path. Two serialization paths:
- `serialize()` / `deserialize()` — plain `Record<string, string>` (path → content)
- `deserializeFromNodes()` — used by the API route, accepts `Record<string, FileNode>`

The singleton `fileSystem` export is **only** used in tests; the API and client each construct their own instances.

### Preview pipeline (`src/lib/transform/jsx-transformer.ts`)

- `transformJSX` — runs Babel on a single file, returns transpiled code + detected imports
- `createImportMap` — iterates all files, transpiles each to a blob URL, builds an ES Module import map. The `@/` alias maps to `/`. Unknown third-party packages are fetched from `https://esm.sh/`. Missing local imports get auto-generated placeholder components.
- `createPreviewHTML` — produces a full HTML document with the import map, Tailwind CDN, and a `<script type="module">` that mounts the app via `ReactDOM.createRoot`.

The AI's generated code must always have a root `/App.jsx` that default-exports a React component. All non-library imports use the `@/` alias (e.g. `import Foo from '@/components/Foo'`).

### Auth (`src/lib/auth.ts`, `src/middleware.ts`)

Session-based auth using `jose` JWTs stored in cookies. Anonymous users can use the app; projects are only persisted when authenticated. The middleware reads the session cookie and exposes `user` to server components.

### Database schema

Two models in `prisma/schema.prisma` (SQLite):
- `User` — `id`, `email`, `password` (bcrypt), `projects[]`
- `Project` — `id`, `name`, `userId?`, `messages` (JSON string), `data` (JSON string of serialized VFS)

Prisma client is generated into `src/generated/prisma/`.

### Testing

Tests use Vitest + jsdom + Testing Library. Test files live alongside source in `__tests__/` directories. The test environment is configured in `vite.config` (check for a `vitest.config` or `vite.config` at the root if adding new test setup).
