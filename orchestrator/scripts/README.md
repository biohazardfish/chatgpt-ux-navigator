# Orchestrator Scripts

This directory contains Bun scripts used to post-process story run outputs and drive chapter illustration generation through the local `@repo/server` + extension bridge.

## Prerequisites

- Run commands from `orchestrator/` unless noted otherwise.
- Ensure local server is running at `http://localhost:8765`.
- Ensure the Chrome extension is connected with a ChatGPT tab for:
  - `client_id = writer-client` (for story summary and translation workflows)
  - `client_id = image-gen` (for image prompting and image generation)
- Scripts use `bun` directly (`#!/usr/bin/env bun`).

## Typical End-to-End Flow

The intended pipeline for a run folder is:

1. `clean` -> clean chapter markdown into `processed/*_out.md`
2. `story-summary` -> create `story-summary.txt`
3. `image-prompt-chapters` -> create `processed/*_with_image_prompt.md`
4. `image-precondition` -> create `image-gen-precondition.md`
5. `image-gen-chapters` -> generate images and insert markdown image markers
6. `translation-context` -> generate translation context for target language
7. `translate-chapters` -> translate prompted chapters and remove `image_prompt` blocks
8. `translate-chapters --improve` -> refine translated chapters in place for more natural style

You can run each step via the unified CLI:

```bash
bun run writer-cli <command> --run <run_dir>
```

Example:

```bash
bun run writer-cli clean --run ./runs/2026-02-13T17-09-22Z_vn-cyber-longstory
```

## `writer-cli.ts`

Entry point that orchestrates the writer pipeline for a run directory.

Usage:

```bash
bun run writer-cli <command> --run <run_folder_path>
```

Commands:

- `clean`: Reads `messages/*_writer_senior.md`, runs `clean-chapter.ts`, writes to `processed/*_writer_senior_out.md`.
- `story-summary`: Runs `story-summary.ts` on cleaned chapters and writes `story-summary.txt` at run root.
  - With `--language <code>`, writes translated output to `story-summary_<language>.txt`.
  - Translation is automatically followed by an improvement pass for more natural target-language prose.
  - If `story-summary.txt` already exists and is non-empty, it reuses it and only performs translation.
  - Auto-detects translation context from `<run_dir>/translation-context_<language>.md` when `--context` is not provided.
- `image-prompt-chapters`: Runs `image-prompter.ts` on cleaned chapters and writes `*_with_image_prompt.md` beside each cleaned file.
- `image-precondition`: Runs `image-gen-precondition.ts` on prompted chapters and writes `image-gen-precondition.md`.
- `image-gen-chapters`: Runs `image-gen-by-chapter.ts` for prompted chapters that still contain unfulfilled image prompts.
- `translation-context`: Runs `translation-context.ts --language <code>` on cleaned chapters and writes `translation-context_<language>.md` at run root.
- `translate-chapters`: Runs `chapter-translator.ts --language <code> [--context <file>]` on prompted chapters and writes `*_<language>.md` beside them.
- `translate-chapters --improve`: Runs `chapter-translator.ts --language <code> --improve [--context <file>]` on translated prompted chapters and overwrites those files in place.

Behavior details:

- Validates run layout (`messages/`, ensures `processed/` and `output/` exist).
- Skips work when output already exists (idempotent behavior for most steps).
- For `image-gen-chapters`, only processes chapters with ` ```image_prompt ` blocks that do not already have an image marker immediately above.

## `clean-chapter.ts`

Cleans chapter markdown files and writes `*_out.md` outputs.

Usage:

```bash
bun scripts/clean-chapter.ts [--output-dir <dir> | -o <dir>] <file1.md> <file2.md> ...
```

What it does:

- Removes frontmatter (`--- ... ---`) if present at top of file.
- Removes the section headed like `Continuity and Next Hooks` (normalization is robust to markdown formatting).
- Normalizes chapter headings to `## CHAPTER ...`.
- Trims output and ensures a trailing newline.

Notes:

- If target output file already exists, it skips that file and exits non-zero after processing all inputs.

## `story-summary.ts`

Generates 5 title-and-summary options from one or more chapter files.

Usage:

```bash
bun scripts/story-summary.ts <story1.md> <story2.md> ...
bun scripts/story-summary.ts --language <code> <story1.md> <story2.md> ...
bun scripts/story-summary.ts --language <code> --summary-file <file> [--context <file>]
```

What it does:

- Combines input files into a single prompt (with per-file headings).
- Sends one request to `POST /responses/writer-client` for base summary generation.
- Optional translation step (`--language vi|ko|ja`) translates the summary, then automatically runs an improvement pass in a second follow-up request.
- Optional `--context <file>` is used as guidance for translation quality and term consistency.
- Prints resulting options markdown to stdout.

Output format:

```markdown
## Option 1
### <title>

<summary>

## Option 2
### <title>

<summary>

...

## Option 5
### <title>

<summary>
```

Timeout:

- `STORY_SUMMARY_TIMEOUT_MS` (default: `300000`).

## `image-prompter.ts`

Adds image prompt blocks to chapter files using the image generation ChatGPT client.

Usage:

```bash
bun scripts/image-prompter.ts <chapter1.md> <chapter2.md> ...
```

What it does:

- Sends a one-time conditioning prompt to `POST /responses/image-gen`.
- Sends each chapter as a follow-up request.
- Expects the response to be the chapter text with embedded fenced blocks:

````text
```image_prompt
...
```
````

- Writes output as `<input>_with_image_prompt.md` in the same directory.

## `image-gen-precondition.ts`

Builds a compact style/character/tone preconditioning prompt for image generation.

Usage:

```bash
bun scripts/image-gen-precondition.ts <story1.md> <story2.md> ...
```

What it does:

- Combines story files into one prompt.
- Sends one request to `POST /responses/image-gen`.
- Prints the precondition text to stdout.

Timeout:

- `IMAGE_GEN_PRECONDITION_TIMEOUT_MS` (default: `300000`).

## `image-gen-by-chapter.ts`

Consumes ` ```image_prompt ` blocks, generates images, and inserts markdown image markers.

Usage:

```bash
bun scripts/image-gen-by-chapter.ts [--precondition <file>] [--output-dir <dir>] <chapter1.md> <chapter2.md> ...
```

What it does:

1. Optional precondition step:
   - Sends `POST /responses/image-gen/new?temporary=false` with a setup prompt that includes the precondition file content.
2. Activates image mode:
   - Sends `POST /images/image-gen/activate`.
3. Per chapter:
   - Finds ` ```image_prompt ` blocks in source order.
   - Skips blocks that already have an image marker immediately above.
   - Sends each prompt to `POST /images/image-gen`.
   - Reads returned `image_path`.
   - Inserts marker before the prompt block:

```markdown
![Image N](path-or-url)
```

When `--output-dir` is provided:

- Copies generated images into that directory as:
  - `chapter_<chapterIndex>_image_<imageIndex>.<ext>` (both indices zero-padded to 3 digits)
- Marker links become relative paths from the chapter file location.

Timeout:

- `IMAGE_GEN_TIMEOUT_MS` (default: `300000`).

## `chapter-translator.ts`

Translates chapter files to a target language while preserving generated image markers.

Usage:

```bash
bun scripts/chapter-translator.ts --language <code> <chapter1.md> <chapter2.md> ...
bun scripts/chapter-translator.ts --language <code> --improve <chapter1_<code>.md> <chapter2_<code>.md> ...
bun scripts/chapter-translator.ts --language <code> --context <file> <chapter1.md> <chapter2.md> ...
```

What it does:

- Sends a one-time conditioning prompt to `POST /responses/writer-client`.
- Sends each chapter for translation or style improvement, chapter-by-chapter.
- Supports language codes: `vi`, `ko`, `ja`.
- Optional `--context <file>` provides translation guidance (names, terms, and style suggestions).
- Preserves markdown image lines like `![Image N](...)`.
- Removes all fenced ` ```image_prompt ` blocks.
- Default mode writes output as `<input>_<language>.md` in the same directory.
- Improve mode (`--improve`) overwrites each provided input file in place.

Context note:

- Context is treated as guidance (suggestion), not strict rules.
- The translator can adapt context terms to keep output natural and rich in the target language.
- In `writer-cli translate-chapters`, when `--context` is omitted, it auto-detects `<run_dir>/translation-context_<language>.md` if present and non-empty.

Timeout:

- `CHAPTER_TRANSLATOR_TIMEOUT_MS` (default: `300000`).

## `translation-context.ts`

Generates translation context guidance for a target language from story chapters.

Usage:

```bash
bun scripts/translation-context.ts --language <code> <story1.md> <story2.md> ...
```

What it does:

- Supports language codes: `vi`, `ko`, `ja`.
- Combines input story files into a single request.
- Sends one request to `POST /responses/writer-client`.
- Returns concise markdown context guidance for names, terminology, tone, and style.
- Prints context text to stdout.

Timeout:

- `TRANSLATION_CONTEXT_TIMEOUT_MS` (default: `300000`).

## API Endpoints Used

- `POST /responses/:clientId`
- `POST /responses/:clientId/new`
- `POST /images/:clientId`
- `POST /images/:clientId/activate`

All scripts implement explicit handling for common server errors:

- `404`: target client is not connected
- `409`: target client has an in-flight request

## Output Conventions in Run Folder

Given `<run_dir>`:

- Inputs: `<run_dir>/messages/*_writer_senior.md`
- Cleaned: `<run_dir>/processed/*_writer_senior_out.md`
- Prompted: `<run_dir>/processed/*_writer_senior_out_with_image_prompt.md`
- Story summary (base): `<run_dir>/story-summary.txt`
- Story summary (translated): `<run_dir>/story-summary_<language>.txt`
- Translation context: `<run_dir>/translation-context_<language>.md`
- Translated: `<run_dir>/processed/*_writer_senior_out_with_image_prompt_<language>.md`
- Image precondition: `<run_dir>/image-gen-precondition.md`
- Copied images (optional): `<run_dir>/output/*`

## Quick Commands

From `orchestrator/`:

```bash
bun run writer-cli clean --run <run_dir>
bun run writer-cli story-summary --run <run_dir>
bun run writer-cli story-summary --run <run_dir> --language vi
bun run writer-cli image-prompt-chapters --run <run_dir>
bun run writer-cli image-precondition --run <run_dir>
bun run writer-cli image-gen-chapters --run <run_dir>
bun run writer-cli translation-context --run <run_dir> --language vi
bun run writer-cli translate-chapters --run <run_dir> --language vi
bun run writer-cli translate-chapters --run <run_dir> --language vi --improve
bun run writer-cli translate-chapters --run <run_dir> --language vi --context ./glossary-vi.md
```
