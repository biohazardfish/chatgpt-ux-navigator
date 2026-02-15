#!/usr/bin/env bun

import {basename, dirname, extname, join} from 'node:path';
import {existsSync} from 'node:fs';

const SCRIPT = 'chapter-translator';
const SERVER_URL = 'http://localhost:8765';
const CLIENT_ID = 'writer-client';
const API_URL = new URL(`/responses/${encodeURIComponent(CLIENT_ID)}`, SERVER_URL).toString();

const TIMEOUT_MS = Number(process.env.CHAPTER_TRANSLATOR_TIMEOUT_MS ?? 5 * 60 * 1000);

type ApiMessage = {role: 'user'; content: string};
type ApiRequest = {input: ApiMessage[]};

type ParsedArgs = {
    files: string[];
    language: string | null;
    improve: boolean;
    contextFile: string | null;
};

const SUPPORTED_LANGUAGES = {
    vi: 'Vietnamese',
    ko: 'Korean',
    ja: 'Japanese',
} as const;

type SupportedLanguageCode = keyof typeof SUPPORTED_LANGUAGES;

function usage(): string {
    return [
        'Usage: bun run chapter-translator.ts --language <code> <chapter1.md> <chapter2.md> ...',
        '       bun run chapter-translator.ts --language <code> --improve <chapter1_<code>.md> ...',
        '       bun run chapter-translator.ts --language <code> [--context <file>] <chapter1.md> ...',
        '',
        'Supported language codes: vi, ko, ja',
        '',
        'Examples:',
        '  bun run chapter-translator.ts --language vi chapter1_with_image_prompt.md chapter2_with_image_prompt.md',
        '  bun run chapter-translator.ts --language vi --improve chapter1_with_image_prompt_vi.md',
        '  bun run chapter-translator.ts --language vi --context ./glossary-vi.md chapter1_with_image_prompt.md',
    ].join('\n');
}

function parseArgs(argv: string[]): ParsedArgs {
    const files: string[] = [];
    let language: string | null = null;
    let improve = false;
    let contextFile: string | null = null;

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];

        if (arg === '--language') {
            const next = argv[i + 1];
            if (!next || next.startsWith('-')) {
                throw new Error('Missing value for --language');
            }
            language = next.trim().toLowerCase();
            i += 1;
            continue;
        }

        if (arg.startsWith('--language=')) {
            const value = arg.slice('--language='.length).trim().toLowerCase();
            if (!value) {
                throw new Error('Missing value for --language');
            }
            language = value;
            continue;
        }

        if (arg === '--improve') {
            improve = true;
            continue;
        }

        if (arg === '--context') {
            const next = argv[i + 1];
            if (!next || next.startsWith('-')) {
                throw new Error('Missing value for --context');
            }
            contextFile = next;
            i += 1;
            continue;
        }

        if (arg.startsWith('--context=')) {
            const value = arg.slice('--context='.length).trim();
            if (!value) {
                throw new Error('Missing value for --context');
            }
            contextFile = value;
            continue;
        }

        if (arg.startsWith('-')) {
            throw new Error(`Unknown option: ${arg}`);
        }

        files.push(arg);
    }

    return {files, language, improve, contextFile};
}

function resolveLanguage(language: string): {code: SupportedLanguageCode; name: string} {
    const code = language.toLowerCase() as SupportedLanguageCode;
    const name = SUPPORTED_LANGUAGES[code];

    if (!name) {
        throw new Error(
            `Unsupported --language '${language}'. Supported ISO 639 codes: ${Object.keys(SUPPORTED_LANGUAGES).join(', ')}`
        );
    }

    return {code, name};
}

function extractTextFromResponse(json: any): string {
    if (!Array.isArray(json?.output)) {
        throw new Error('Invalid API response: missing output[]');
    }

    const texts: string[] = [];

    for (const item of json.output) {
        if (!Array.isArray(item?.content)) continue;

        for (const block of item.content) {
            if (typeof block?.text === 'string') {
                texts.push(block.text);
            }
        }
    }

    if (texts.length === 0) {
        throw new Error('No text found in output[].content[].text');
    }

    return texts.join('').trim();
}

function formatHttpError(status: number, body: string): string {
    const snippet = body.trim().slice(0, 500) || '<empty response body>';
    if (status === 404) {
        return `server returned 404 (client '${CLIENT_ID}' is not connected). Open ChatGPT tab with extension and retry. Body: ${snippet}`;
    }
    if (status === 409) {
        return `server returned 409 (client '${CLIENT_ID}' has an in-flight request). Wait for completion and retry. Body: ${snippet}`;
    }
    return `server returned ${status}. Body: ${snippet}`;
}

async function postToApi(messages: ApiMessage[], timeoutMs: number): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const body: ApiRequest = {input: messages};

        const res = await fetch(API_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(formatHttpError(res.status, errorText));
        }

        const json = await res.json();
        return extractTextFromResponse(json);
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
        }
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}

function outputPathFor(inputPath: string, language: string): string {
    const dir = dirname(inputPath);
    const ext = extname(inputPath);
    const base = basename(inputPath, ext);
    return join(dir, `${base}_${language}${ext}`);
}

function buildContextSection(contextText: string | null): string {
    if (!contextText) {
        return '';
    }

    return `
Context guidance (suggestion, not strict rules):
- Use this context to improve name consistency, terminology, and style.
- Prioritize natural, rich prose in the target language.
- Adapt context choices when needed for fluency.

Context:
${contextText}
`;
}

function buildTranslationConditioningPrompt(
    languageName: string,
    contextText: string | null
): string {
    return `You are translating markdown story chapters into ${languageName}.

Rules:
1) Translate all normal prose to ${languageName}.
2) Preserve markdown structure and headings.
3) Preserve markdown image lines exactly as-is, e.g. ![Image N](...).
4) Remove every fenced image prompt block with language tag image_prompt, including the fences and all block content.
5) Output only the translated chapter markdown and nothing else.

${buildContextSection(contextText)}

Confirm you understand these rules.\n`;
}

function buildImproveConditioningPrompt(languageName: string, contextText: string | null): string {
    return `You are improving already translated markdown story chapters in ${languageName}.

Rules:
1) Keep the language as ${languageName}.
2) Improve natural flow, word choice, and writing style for native readability.
3) Preserve original meaning and chapter structure.
4) Preserve markdown image lines exactly as-is, e.g. ![Image N](...).
5) Remove every fenced image prompt block with language tag image_prompt, including the fences and all block content.
6) Output only the improved chapter markdown and nothing else.

${buildContextSection(contextText)}

Confirm you understand these rules.\n`;
}

function buildImproveChapterPrompt(
    chapterText: string,
    languageName: string,
    contextText: string | null
): string {
    return `Improve this chapter in ${languageName} so it reads naturally with polished narrative style.

Remember:
- Keep meaning and structure unchanged.
- Improve fluency, tone consistency, and writing quality.
- Keep markdown image lines ![Image N](...) unchanged.
- Remove all fenced image prompt blocks tagged image_prompt.
- Output only the improved chapter markdown.
- Use context as a suggestion for terms/names/style, while optimizing natural flow.

${buildContextSection(contextText)}

Chapter:\n\n${chapterText}`;
}

function stripImagePromptBlocks(content: string): string {
    return content.replace(/\n?```image_prompt[ \t]*\r?\n[\s\S]*?\r?\n```[ \t]*\n?/g, '\n\n');
}

function normalizeOutput(content: string): string {
    const withoutPromptBlocks = stripImagePromptBlocks(content);
    return withoutPromptBlocks.trim() + '\n';
}

async function main() {
    const {files, language, improve, contextFile} = parseArgs(process.argv.slice(2));

    if (!language) {
        console.error(`[${SCRIPT}] Missing --language <code>`);
        console.error(usage());
        process.exit(1);
    }

    const resolvedLanguage = resolveLanguage(language);

    if (files.length === 0) {
        console.error(`[${SCRIPT}] Missing chapter files`);
        console.error(usage());
        process.exit(1);
    }

    for (const f of files) {
        if (!existsSync(f)) {
            console.error(`[${SCRIPT}] File not found: ${f}`);
            process.exit(1);
        }
    }

    let contextText: string | null = null;
    if (contextFile) {
        if (!existsSync(contextFile)) {
            console.error(`[${SCRIPT}] Context file not found: ${contextFile}`);
            process.exit(1);
        }

        contextText = (await Bun.file(contextFile).text()).trim();
        if (!contextText) {
            console.error(`[${SCRIPT}] Context file is empty: ${contextFile}`);
            process.exit(1);
        }
    }

    const mode = improve ? 'improve' : 'translate';
    const conditioningPrompt = improve
        ? buildImproveConditioningPrompt(resolvedLanguage.name, contextText)
        : buildTranslationConditioningPrompt(resolvedLanguage.name, contextText);
    console.log(`[${SCRIPT}] Sending ${mode} conditioning prompt to ${API_URL}`);
    if (contextFile) {
        console.log(`[${SCRIPT}] Using context: ${contextFile}`);
    }
    await postToApi([{role: 'user', content: conditioningPrompt}], 60_000);
    console.log(`[${SCRIPT}] Conditioning acknowledged`);

    for (const filePath of files) {
        console.log(`[${SCRIPT}] Processing: ${filePath}`);

        const chapterText = await Bun.file(filePath).text();
        const chapterPrompt = improve
            ? buildImproveChapterPrompt(chapterText, resolvedLanguage.name, contextText)
            : chapterText;
        const translatedChapter = await postToApi(
            [{role: 'user', content: chapterPrompt}],
            TIMEOUT_MS
        );

        const outPath = improve ? filePath : outputPathFor(filePath, resolvedLanguage.code);
        await Bun.write(outPath, normalizeOutput(translatedChapter));

        console.log(`[${SCRIPT}] Wrote: ${outPath}`);
    }

    console.log(`[${SCRIPT}] Done.`);
}

main().catch(err => {
    console.error(`[${SCRIPT}] ${err?.stack ?? String(err)}`);
    process.exit(1);
});
