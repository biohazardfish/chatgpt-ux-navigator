# Writer CLI

Writer CLI is a Bun-based command-line tool for post-processing story run outputs and driving chapter illustration generation through the local `@repo/server` + extension bridge.

## Prerequisites

- Run commands from repo root or `writer-cli/`.
- Ensure local server is running at `http://localhost:8765`.
- Ensure the Chrome extension is connected with a ChatGPT tab for:
    - `client_id = writer-client` (story summary and translation workflows)
    - `client_id = image-gen` (image prompting and image generation)

## Usage

From repository root:

```bash
bun run writer-cli <command> --run <run_dir>
```

From `writer-cli/`:

```bash
bun run start <command> --run <run_dir>
```

Commands:

- `clean`
- `story-summary`
- `image-prompt-chapters`
- `image-precondition`
- `image-gen-chapters`
- `translation-context`
- `translate-chapters`

Options:

- `--run <run_dir>`: required run directory
- `--language <code>`: language code (`vi`, `ko`, `ja`) for translation commands
- `--improve`: for `translate-chapters`, improve translated files in place
- `--context <file>`: optional translation context file

## Typical Pipeline

1. `clean`
2. `story-summary`
3. `image-prompt-chapters`
4. `image-precondition`
5. `image-gen-chapters`
6. `translation-context --language <code>`
7. `translate-chapters --language <code>`
8. `translate-chapters --language <code> --improve`

## Chat Context Behavior

- `story-summary` starts each summary job with `POST /responses/:client_id/new` (temporary chat by default) to avoid carrying prior context.
- `translate-chapters --improve` starts improve conditioning with `POST /responses/:client_id/new` (temporary chat by default) for the same reason.
- `image-gen-chapters` continues to use `POST /responses/:client_id/new?temporary=false` because image generation depends on non-temporary chat behavior.

## Output Normalization

- `translate-chapters`, `story-summary`, and `translation-context` apply script-side normalization before writing files.
- Fenced ```image_prompt``` blocks are removed during normalization so downstream artifacts stay clean even if model output includes them.

## Output Conventions

Given `<run_dir>`:

- Inputs: `<run_dir>/messages/*_writer_senior.md`
- Cleaned: `<run_dir>/processed/*_writer_senior_out.md`
- Prompted: `<run_dir>/processed/*_writer_senior_out_with_image_prompt.md`
- Story summary (base): `<run_dir>/story-summary.txt`
- Story summary (translated): `<run_dir>/story-summary_<language>.txt`
- Translation context: `<run_dir>/translation-context_<language>.md`
- Translated: `<run_dir>/processed/*_writer_senior_out_with_image_prompt_<language>.md`
- Image precondition: `<run_dir>/image-gen-precondition.md`
- Copied images: `<run_dir>/images/*`
