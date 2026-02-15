#!/usr/bin/env bun

import {existsSync} from 'node:fs';
import {basename, resolve} from 'node:path';

const SCRIPT = 'translation-context';
const SERVER_URL = 'http://localhost:8765';
const CLIENT_ID = 'writer-client';
const TIMEOUT_MS = Number(process.env.TRANSLATION_CONTEXT_TIMEOUT_MS ?? 5 * 60 * 1000);

const SUPPORTED_LANGUAGES = {
    vi: 'Vietnamese',
    ko: 'Korean',
    ja: 'Japanese',
} as const;

type SupportedLanguageCode = keyof typeof SUPPORTED_LANGUAGES;

type ParsedArgs = {
    files: string[];
    language: SupportedLanguageCode | null;
    showHelp: boolean;
};

type ApiMessage = {role: 'user'; content: string};
type ApiRequest = {input: ApiMessage[]};

function usage(): string {
    return [
        'Usage: bun run scripts/translation-context.ts --language <code> <story1.md> <story2.md> ...',
        '',
        'Supported language codes: vi, ko, ja',
        '',
        'Examples:',
        '  bun run scripts/translation-context.ts --language vi chapters/01.md chapters/02.md > translation-context_vi.md',
    ].join('\n');
}

function parseArgs(argv: string[]): ParsedArgs {
    const files: string[] = [];
    let language: SupportedLanguageCode | null = null;
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

        if (arg.startsWith('--')) {
            throw new Error(`Unknown option: ${arg}`);
        }

        files.push(arg);
    }

    return {files, language, showHelp};
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

function buildRequestPrompt(story: string, languageName: string): string {
    return `I need a translation context guide for a story that will be translated into ${languageName}.

Create concise but practical guidance that helps produce natural, rich translations while keeping key terms consistent.

Include these sections in markdown:
- Character Names and Preferred Rendering
- Place Names and World Terms
- Honorifics, Titles, and Relationship Terms
- Tone and Voice Guidance
- Style Notes (sentence flow, idioms, register)

Rules:
- Use the target language where appropriate in examples.
- Prioritize readability and natural phrasing over literal translation.
- Keep it compact and directly useful for translators.
- Return only the context guide markdown.

Full story:

${story}`;
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
    const {files, language, showHelp} = parseArgs(process.argv.slice(2));

    if (showHelp) {
        console.log(usage());
        process.exit(0);
    }

    if (!language) {
        console.error(`[${SCRIPT}] Missing --language <code>`);
        console.error(usage());
        process.exit(1);
    }

    if (files.length === 0) {
        console.error(usage());
        process.exit(1);
    }

    for (const file of files) {
        if (!existsSync(file)) {
            console.error(`File not found: ${file}`);
            process.exit(1);
        }
    }

    const resolvedFiles = files.map(file => resolve(file));
    const fileContents = await Promise.all(resolvedFiles.map(file => Bun.file(file).text()));

    const story = buildStorySection(resolvedFiles, fileContents);
    const requestPrompt = buildRequestPrompt(story, SUPPORTED_LANGUAGES[language]);
    const endpoint = buildEndpoint();

    console.error(`[${SCRIPT}] Sending translation context request to ${endpoint}`);

    const contextPrompt = await postToApi(endpoint, requestPrompt);
    console.error(`[${SCRIPT}] Request completed successfully`);
    process.stdout.write(`${contextPrompt.trim()}\n`);
}

main().catch(err => {
    console.error(`[${SCRIPT}] ${err?.stack ?? String(err)}`);
    process.exit(1);
});
