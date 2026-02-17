import type {WriterCliConfig} from './types';

export const SUBCOMMANDS = new Set([
    'clean',
    'story-summary',
    'image-prompt-chapters',
    'image-precondition',
    'image-gen-chapters',
    'translation-context',
    'translate-chapters',
]);

export function getConfig(): WriterCliConfig {
    return {
        scriptName: 'writer-cli',
        serverUrl: process.env.WRITER_CLI_SERVER_URL ?? 'http://localhost:8765',
        writerClientId: 'writer-client',
        imageClientId: 'image-gen',
        timeouts: {
            storySummaryMs: Number(process.env.STORY_SUMMARY_TIMEOUT_MS ?? 5 * 60 * 1000),
            translationContextMs: Number(
                process.env.TRANSLATION_CONTEXT_TIMEOUT_MS ?? 5 * 60 * 1000
            ),
            imageGenPreconditionMs: Number(
                process.env.IMAGE_GEN_PRECONDITION_TIMEOUT_MS ?? 5 * 60 * 1000
            ),
            chapterTranslatorMs: Number(process.env.CHAPTER_TRANSLATOR_TIMEOUT_MS ?? 5 * 60 * 1000),
            imageGenMs: Number(process.env.IMAGE_GEN_TIMEOUT_MS ?? 5 * 60 * 1000),
            imagePrompterMs: 5 * 60 * 1000,
            conditioningMs: 60_000,
        },
    };
}

export function usage(): string {
    return [
        'Usage: bun run writer-cli <command> --run <run_folder_path>',
        '',
        'Commands:',
        '  clean                  Clean messages/*_writer_senior.md -> processed/*_writer_senior_out.md',
        '  story-summary          Generate story-summary.txt (5 title+summary options) from cleaned chapters',
        '  image-prompt-chapters  Generate *_with_image_prompt.md from cleaned chapters',
        '  image-precondition     Generate image-gen-precondition.md from prompted chapters',
        '  image-gen-chapters     Generate chapter images and inject markdown image markers',
        '  translation-context    Generate translation context guide from cleaned chapters',
        '  translate-chapters     Translate prompted chapters (image_prompt cleanup handled by script)',
        '',
        'Language options:',
        '  --language <code>      Required language code (vi, ko, ja)',
        '  --improve              For translate-chapters: improve translated files in-place',
        '  --context <file>       Optional context file (auto-detected when omitted for story-summary/translate-chapters)',
        '',
        'Examples:',
        '  bun run writer-cli clean --run ./runs/2026-02-13T17-09-22Z_vn-cyber-longstory',
        '  bun run writer-cli story-summary --run ./runs/2026-02-13T17-09-22Z_vn-cyber-longstory',
        '  bun run writer-cli story-summary --run ./runs/2026-02-13T17-09-22Z_vn-cyber-longstory --language vi',
        '  bun run writer-cli image-prompt-chapters --run ./runs/2026-02-13T17-09-22Z_vn-cyber-longstory',
        '  bun run writer-cli image-precondition --run ./runs/2026-02-13T17-09-22Z_vn-cyber-longstory',
        '  bun run writer-cli image-gen-chapters --run ./runs/2026-02-13T17-09-22Z_vn-cyber-longstory',
        '  bun run writer-cli translation-context --run ./runs/2026-02-13T17-09-22Z_vn-cyber-longstory --language vi',
        '  bun run writer-cli translate-chapters --run ./runs/2026-02-13T17-09-22Z_vn-cyber-longstory --language vi',
        '  bun run writer-cli translate-chapters --run ./runs/2026-02-13T17-09-22Z_vn-cyber-longstory --language vi --improve',
    ].join('\n');
}
