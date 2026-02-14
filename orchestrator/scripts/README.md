# Orchestrator Scripts

This directory contains Bun scripts used to post-process story run outputs and drive chapter illustration generation through the local `@repo/server` + extension bridge.

## Prerequisites

- Run commands from `orchestrator/` unless noted otherwise.
- Ensure local server is running at `http://localhost:8765`.
- Ensure the Chrome extension is connected with a ChatGPT tab for:
  - `client_id = story-summary` (for story summary generation)
  - `client_id = image-gen` (for image prompting and image generation)
- Scripts use `bun` directly (`#!/usr/bin/env bun`).

## Typical End-to-End Flow

The intended pipeline for a run folder is:

1. `clean` -> clean chapter markdown into `processed/*_out.md`
2. `story-summary` -> create `story-summary.txt`
3. `image-prompt-chapters` -> create `processed/*_with_image_prompt.md`
4. `image-precondition` -> create `image-gen-precondition.md`
5. `image-gen-chapters` -> generate images and insert markdown image markers

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
- `image-prompt-chapters`: Runs `image-prompter.ts` on cleaned chapters and writes `*_with_image_prompt.md` beside each cleaned file.
- `image-precondition`: Runs `image-gen-precondition.ts` on prompted chapters and writes `image-gen-precondition.md`.
- `image-gen-chapters`: Runs `image-gen-by-chapter.ts` for prompted chapters that still contain unfulfilled image prompts.

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

Generates a teaser summary from one or more chapter files.

Usage:

```bash
bun scripts/story-summary.ts <story1.md> <story2.md> ...
```

What it does:

- Combines input files into a single prompt (with per-file headings).
- Sends one request to `POST /responses/story-summary`.
- Prints resulting summary text to stdout.

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
- Story summary: `<run_dir>/story-summary.txt`
- Image precondition: `<run_dir>/image-gen-precondition.md`
- Copied images (optional): `<run_dir>/output/*`

## Quick Commands

From `orchestrator/`:

```bash
bun run writer-cli clean --run <run_dir>
bun run writer-cli story-summary --run <run_dir>
bun run writer-cli image-prompt-chapters --run <run_dir>
bun run writer-cli image-precondition --run <run_dir>
bun run writer-cli image-gen-chapters --run <run_dir>
```
