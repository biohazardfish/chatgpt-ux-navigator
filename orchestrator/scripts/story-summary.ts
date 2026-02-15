#!/usr/bin/env bun

import {existsSync} from 'node:fs';
import {basename, resolve} from 'node:path';

const SCRIPT = 'story-summary';
const SERVER_URL = 'http://localhost:8765';
const CLIENT_ID = 'writer-client';
const TIMEOUT_MS = Number(process.env.STORY_SUMMARY_TIMEOUT_MS ?? 5 * 60 * 1000);
const SUPPORTED_LANGUAGES = {
    vi: 'Vietnamese',
    ko: 'Korean',
    ja: 'Japanese',
} as const;

type SupportedLanguageCode = keyof typeof SUPPORTED_LANGUAGES;

const PROMPT = `Create 5 distinct title-and-summary options for this story.

Goal:
- Hook the reader immediately.
- Highlight the central conflict, tone, and stakes.
- Keep key twists and ending hidden.

For each option:
- Title should be concise and compelling.
- Summary should be 2 to 4 sentences.
- Style should be vivid and cinematic, but concise.
- No spoilers.

Output format (markdown only):
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

Rules:
- Return only these 5 options in the markdown format above.
- Do not include extra explanation, notes, or meta commentary.

Full story:
`;

type ParsedArgs = {
    files: string[];
    language: SupportedLanguageCode | null;
    contextFile: string | null;
    summaryFile: string | null;
    showHelp: boolean;
};

type ApiMessage = {role: 'user'; content: string};
type ApiRequest = {input: ApiMessage[]};

function usage(): string {
    return [
        'Usage: bun run scripts/story-summary.ts <story1.md> <story2.md> ...',
        '       bun run scripts/story-summary.ts --language <code> <story1.md> <story2.md> ...',
        '       bun run scripts/story-summary.ts --language <code> --summary-file <file> [--context <file>]',
        '',
        'Supported language codes: vi, ko, ja',
        '',
        'Examples:',
        '  bun run scripts/story-summary.ts chapters/01.md chapters/02.md > story-summary.txt',
        '  bun run scripts/story-summary.ts --language vi chapters/01.md chapters/02.md > story-summary_vi.txt',
        '  bun run scripts/story-summary.ts --language vi --summary-file story-summary.txt --context translation-context_vi.md > story-summary_vi.txt',
    ].join('\n');
}

function parseArgs(argv: string[]): ParsedArgs {
    const files: string[] = [];
    let language: SupportedLanguageCode | null = null;
    let contextFile: string | null = null;
    let summaryFile: string | null = null;
    let showHelp = false;

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];

        if (arg === '--help' || arg === '-h') {
            showHelp = true;
            continue;
        }

        if (arg === '--language') {
            const next = argv[i + 1];
            if (!next || next.startsWith('-')) {
                throw new Error('Missing value for --language');
            }
            const value = next.trim().toLowerCase() as SupportedLanguageCode;
            if (!SUPPORTED_LANGUAGES[value]) {
                throw new Error(`Unsupported --language '${next}'. Supported ISO 639 codes: vi, ko, ja`);
            }
            language = value;
            i += 1;
            continue;
        }

        if (arg.startsWith('--language=')) {
            const value = arg.slice('--language='.length).trim().toLowerCase() as SupportedLanguageCode;
            if (!value) {
                throw new Error('Missing value for --language');
            }
            if (!SUPPORTED_LANGUAGES[value]) {
                throw new Error(`Unsupported --language '${value}'. Supported ISO 639 codes: vi, ko, ja`);
            }
            language = value;
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

        if (arg === '--summary-file') {
            const next = argv[i + 1];
            if (!next || next.startsWith('-')) {
                throw new Error('Missing value for --summary-file');
            }
            summaryFile = next;
            i += 1;
            continue;
        }

        if (arg.startsWith('--summary-file=')) {
            const value = arg.slice('--summary-file='.length).trim();
            if (!value) {
                throw new Error('Missing value for --summary-file');
            }
            summaryFile = value;
            continue;
        }

        if (arg.startsWith('--')) {
            throw new Error(`Unknown option: ${arg}`);
        }

        files.push(arg);
    }

    return {files, language, contextFile, summaryFile, showHelp};
}

function buildEndpoint(): string {
    let parsed: URL;
    try {
        parsed = new URL(SERVER_URL);
    } catch {
        throw new Error(`Invalid SERVER_URL value: ${SERVER_URL}`);
    }

    const pathPrefix = parsed.pathname.replace(/\/+$/, '');
    parsed.pathname = `${pathPrefix}/responses/${encodeURIComponent(CLIENT_ID)}`;
    parsed.search = '';
    return parsed.toString();
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

    const output = texts.join('').trim();
    if (!output) {
        throw new Error('No text found in output[].content[].text');
    }

    return output;
}

function buildStorySection(files: string[], fileContents: string[]): string {
    const sections: string[] = [];

    for (let i = 0; i < files.length; i += 1) {
        const heading = `# ${basename(files[i])}`;
        const body = fileContents[i].trim();
        sections.push(`${heading}\n\n${body}`);
    }

    return sections.join('\n\n---\n\n');
}

function buildRequestPrompt(story: string): string {
    return PROMPT + '\n\n' + story;
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

function buildTranslationPrompt(summary: string, languageName: string, contextText: string | null): string {
    return `Translate the 5 markdown options below into ${languageName}.

Goals:
- Keep the same meaning and impact.
- Keep each option concise and compelling.
- Keep the markdown structure exactly:
  - Each option starts with "## Option <N>"
  - Each title line starts with "### "
- Translate both titles and summaries.
- Keep each summary at 2 to 4 sentences.
- Return only the translated options markdown.

${buildContextSection(contextText)}

Options:
${summary}`;
}

function buildImprovePrompt(summary: string, languageName: string, contextText: string | null): string {
    return `Improve these translated 5 markdown options in ${languageName}.

Goals:
- Keep the original meaning and stakes for each option.
- Make the writing feel natural, vivid, and fluent for native readers.
- Keep the markdown structure exactly:
  - Each option starts with "## Option <N>"
  - Each title line starts with "### "
- Keep each summary at 2 to 4 sentences.
- Return only the improved options markdown.

${buildContextSection(contextText)}

Options:
${summary}`;
}

async function postToApi(url: string, message: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const body: ApiRequest = {
            input: [{role: 'user', content: message}],
        };

        const res = await fetch(url, {
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
            throw new Error(`Request timed out after ${Math.round(TIMEOUT_MS / 1000)}s`);
        }
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}

async function main() {
    const {files, language, contextFile, summaryFile, showHelp} = parseArgs(process.argv.slice(2));

    if (showHelp) {
        console.log(usage());
        process.exit(0);
    }

    if (!summaryFile && files.length === 0) {
        console.error(usage());
        process.exit(1);
    }

    if (summaryFile && !existsSync(summaryFile)) {
        console.error(`Summary file not found: ${summaryFile}`);
        process.exit(1);
    }

    for (const file of files) {
        if (!existsSync(file)) {
            console.error(`File not found: ${file}`);
            process.exit(1);
        }
    }

    if (contextFile && !existsSync(contextFile)) {
        console.error(`Context file not found: ${contextFile}`);
        process.exit(1);
    }

    let contextText: string | null = null;
    if (contextFile) {
        contextText = (await Bun.file(contextFile).text()).trim();
        if (!contextText) {
            console.error(`Context file is empty: ${contextFile}`);
            process.exit(1);
        }
    }

    const endpoint = buildEndpoint();
    let summary: string;

    if (summaryFile) {
        summary = (await Bun.file(summaryFile).text()).trim();
        if (!summary) {
            console.error(`Summary file is empty: ${summaryFile}`);
            process.exit(1);
        }
    } else {
        const resolvedFiles = files.map(file => resolve(file));
        const fileContents = await Promise.all(resolvedFiles.map(file => Bun.file(file).text()));

        const story = buildStorySection(resolvedFiles, fileContents);
        const requestPrompt = buildRequestPrompt(story);

        console.error(`[${SCRIPT}] Sending story summary request to ${endpoint}`);
        summary = await postToApi(endpoint, requestPrompt);
        console.error(`[${SCRIPT}] Request completed successfully`);
    }

    if (!language) {
        process.stdout.write(`${summary.trim()}\n`);
        return;
    }

    const languageName = SUPPORTED_LANGUAGES[language];
    const translationPrompt = buildTranslationPrompt(summary, languageName, contextText);
    console.error(`[${SCRIPT}] Translating summary to ${languageName}`);

    const translatedSummary = await postToApi(endpoint, translationPrompt);
    console.error(`[${SCRIPT}] Translation completed`);

    const improvePrompt = buildImprovePrompt(translatedSummary, languageName, contextText);
    console.error(`[${SCRIPT}] Improving translated summary in ${languageName}`);
    const improvedSummary = await postToApi(endpoint, improvePrompt);
    console.error(`[${SCRIPT}] Request completed successfully`);
    process.stdout.write(`${improvedSummary.trim()}\n`);
}

main().catch(err => {
    console.error(`[${SCRIPT}] ${err?.stack ?? String(err)}`);
    process.exit(1);
});
