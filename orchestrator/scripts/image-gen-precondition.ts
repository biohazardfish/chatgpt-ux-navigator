#!/usr/bin/env bun

import {existsSync} from 'node:fs';
import {basename, resolve} from 'node:path';

const SCRIPT = 'image-gen-precondition';
const SERVER_URL = 'http://localhost:8765';
const CLIENT_ID = 'image-gen';
const TIMEOUT_MS = Number(process.env.IMAGE_GEN_PRECONDITION_TIMEOUT_MS ?? 5 * 60 * 1000);
const PROMPT = `I want to create image generation for this story. I need a preconditioning prompt to send to the AI image generator to setup the tone, characters, and style of the images.

It should include sections with the following information:

- Setting (describe significan locations, items, and visual motifs that should be consistent across images)
- Tone (mood, color palette, lighting, etc.)
- Characters (facial features, typical clothing, accessories, etc.)

Preconditioning prompt should be concise but descriptive.

Return only the preconditioning prompt text. Do not include extra explanation.

Full story:
`;

type ParsedArgs = {
    files: string[];
    showHelp: boolean;
};

type ApiMessage = {role: 'user'; content: string};
type ApiRequest = {input: ApiMessage[]};

function usage(): string {
    return [
        'Usage: bun run scripts/image-gen-precondition.ts <story1.md> <story2.md> ...',
        '',
        'Examples:',
        '  bun run scripts/image-gen-precondition.ts chapters/01.md chapters/02.md > precondition.txt',
    ].join('\n');
}

function parseArgs(argv: string[]): ParsedArgs {
    const files: string[] = [];
    let showHelp = false;

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];

        if (arg === '--help' || arg === '-h') {
            showHelp = true;
            continue;
        }

        if (arg.startsWith('--')) {
            throw new Error(`Unknown option: ${arg}`);
        }

        files.push(arg);
    }

    return {files, showHelp};
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
    const {files, showHelp} = parseArgs(process.argv.slice(2));

    if (showHelp) {
        console.log(usage());
        process.exit(0);
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
    const requestPrompt = buildRequestPrompt(story);
    const endpoint = buildEndpoint();

    console.error(`[${SCRIPT}] Sending precondition request to ${endpoint}`);

    const preconditionPrompt = await postToApi(endpoint, requestPrompt);
    console.error(`[${SCRIPT}] Request completed successfully`);
    process.stdout.write(`${preconditionPrompt.trim()}\n`);
}

main().catch(err => {
    console.error(`[${SCRIPT}] ${err?.stack ?? String(err)}`);
    process.exit(1);
});
