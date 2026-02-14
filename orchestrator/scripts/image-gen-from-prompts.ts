#!/usr/bin/env bun

import {existsSync} from 'node:fs';

const CLIENT_ID = 'image-gen';
const IMAGE_GEN_URL = process.env.IMAGE_GEN_URL ?? `http://localhost:8765/images/${CLIENT_ID}`;
const TIMEOUT_MS = Number(process.env.IMAGE_GEN_TIMEOUT_MS ?? 5 * 60 * 1000);

type ParsedArgs = {
    files: string[];
    preconditionFile: string | null;
};

type Endpoints = {
    imagePromptUrl: string;
    activateUrl: string;
    newChatUrl: string;
    clientId: string;
};

type PromptBlock = {
    prompt: string;
    start: number;
    end: number;
    index: number;
};

function extractPromptBlocks(markdown: string): PromptBlock[] {
    const re = /```image_prompt[ \t]*\r?\n([\s\S]*?)\r?\n```/g;
    const blocks: PromptBlock[] = [];
    let promptIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = re.exec(markdown)) !== null) {
        const prompt = (match[1] ?? '').trim();
        if (prompt.length > 0) {
            promptIndex += 1;
            blocks.push({
                prompt,
                start: match.index,
                end: re.lastIndex,
                index: promptIndex,
            });
        }
    }

    return blocks;
}

function hasImageMarkerBefore(markdown: string, start: number): boolean {
    if (start <= 0) return false;

    let i = start - 1;
    while (i >= 0 && /\s/.test(markdown[i])) {
        i -= 1;
    }
    if (i < 0) return false;

    const lineStart = markdown.lastIndexOf('\n', i) + 1;
    const line = markdown.slice(lineStart, i + 1).trim();

    return /^!?\[Image\s+\d+\]\(.+\)$/.test(line);
}

function insertImageMarkerBeforeBlock(
    markdown: string,
    block: PromptBlock,
    imagePath: string
): string {
    let prefix = markdown.slice(0, block.start);
    const suffix = markdown.slice(block.start);

    if (prefix.length > 0 && !prefix.endsWith('\n')) {
        prefix += '\n';
    }

    const marker = `![Image ${block.index}](${imagePath})\n\n`;
    return `${prefix}${marker}${suffix}`;
}

function usage(): string {
    return [
        'Usage: bun run image-gen-from-prompts.ts [--precondition <file>] file1.md file2.md ...',
        '',
        'Examples:',
        '  bun run image-gen-from-prompts.ts chapter1.md chapter2.md',
        '  bun run image-gen-from-prompts.ts --precondition style.md chapter1.md chapter2.md',
    ].join('\n');
}

function parseArgs(argv: string[]): ParsedArgs {
    const files: string[] = [];
    let preconditionFile: string | null = null;

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];

        if (arg === '--precondition') {
            const next = argv[i + 1];
            if (!next || next.startsWith('--')) {
                throw new Error('Missing value for --precondition');
            }
            preconditionFile = next;
            i += 1;
            continue;
        }

        if (arg.startsWith('--')) {
            throw new Error(`Unknown option: ${arg}`);
        }

        files.push(arg);
    }

    return {files, preconditionFile};
}

function createEndpoints(imageGenUrl: string): Endpoints {
    let parsed: URL;
    try {
        parsed = new URL(imageGenUrl);
    } catch {
        throw new Error(`Invalid IMAGE_GEN_URL: ${imageGenUrl}`);
    }

    const path = parsed.pathname.replace(/\/+$/, '');
    const match = path.match(/^(.*)\/images\/([^/]+)$/);

    if (!match || !match[2]) {
        throw new Error(`IMAGE_GEN_URL must end with /images/<client_id>: ${imageGenUrl}`);
    }

    const prefix = match[1] ?? '';
    const clientId = decodeURIComponent(match[2]);
    const encodedClientId = encodeURIComponent(clientId);

    const imagePromptPath = `${prefix}/images/${encodedClientId}`;
    const activatePath = `${prefix}/images/${encodedClientId}/activate`;
    const newChatPath = `${prefix}/responses/${encodedClientId}/new`;

    const imagePromptUrlObj = new URL(parsed.origin);
    imagePromptUrlObj.pathname = imagePromptPath;

    const activateUrlObj = new URL(parsed.origin);
    activateUrlObj.pathname = activatePath;

    const newChatUrlObj = new URL(parsed.origin);
    newChatUrlObj.pathname = newChatPath;
    newChatUrlObj.searchParams.set('temporary', 'false');

    return {
        imagePromptUrl: imagePromptUrlObj.toString(),
        activateUrl: activateUrlObj.toString(),
        newChatUrl: newChatUrlObj.toString(),
        clientId,
    };
}

async function postAction(url: string, label: string, body?: unknown): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const init: RequestInit = {
            method: 'POST',
            signal: controller.signal,
        };

        if (body !== undefined) {
            init.headers = {'Content-Type': 'application/json'};
            init.body = JSON.stringify(body);
        }

        const res = await fetch(url, init);
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`${label} failed (${res.status}): ${text}`);
        }
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            throw new Error(`${label} timed out after ${Math.round(TIMEOUT_MS / 1000)}s`);
        }
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}

async function postPrompt(imagePromptUrl: string, prompt: string, label: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const res = await fetch(imagePromptUrl, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({prompt}),
            signal: controller.signal,
        });

        const text = await res.text();

        if (!res.ok) {
            throw new Error(`API error (${res.status}): ${text}`);
        }

        let payload: any;
        try {
            payload = JSON.parse(text);
        } catch {
            throw new Error(`API returned non-JSON response: ${text}`);
        }

        const imagePath =
            (typeof payload?.image_path === 'string' && payload.image_path.trim()) ||
            (typeof payload?.meta?.image_path === 'string' && payload.meta.image_path.trim()) ||
            null;

        if (!imagePath) {
            throw new Error(`Image path not found in response for ${label}`);
        }

        console.log(`✓ ${label} done -> ${imagePath}`);
        return imagePath;
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            throw new Error(`Timed out after ${Math.round(TIMEOUT_MS / 1000)}s`);
        }
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}

async function main() {
    const {files, preconditionFile} = parseArgs(process.argv.slice(2));

    if (files.length === 0) {
        console.error(usage());
        process.exit(1);
    }

    const endpoints = createEndpoints(IMAGE_GEN_URL);

    if (preconditionFile && !existsSync(preconditionFile)) {
        console.error(`Precondition file not found: ${preconditionFile}`);
        process.exit(1);
    }

    for (const file of files) {
        if (!existsSync(file)) {
            console.error(`File not found: ${file}`);
            process.exit(1);
        }
    }

    if (preconditionFile) {
        const preconditionPrompt = (await Bun.file(preconditionFile).text()).trim();
        if (!preconditionPrompt) {
            console.error(`Precondition file is empty: ${preconditionFile}`);
            process.exit(1);
        }

        console.log(`→ Sending precondition prompt (${preconditionFile})`);
        await postAction(endpoints.newChatUrl, `Precondition request for '${endpoints.clientId}'`, {
            prompt: preconditionPrompt,
        });
        console.log('✓ Precondition prompt sent');
    }

    console.log(`→ Activating image generation mode for '${endpoints.clientId}'`);
    await postAction(endpoints.activateUrl, `Image activation for '${endpoints.clientId}'`);
    console.log('✓ Image generation mode activated');

    for (const file of files) {
        console.log(`→ Processing ${file}`);
        const initialMarkdown = await Bun.file(file).text();
        const initialBlocks = extractPromptBlocks(initialMarkdown);

        console.log(`  Found ${initialBlocks.length} prompt(s)`);

        let generatedCount = 0;

        while (true) {
            const markdown = await Bun.file(file).text();
            const blocks = extractPromptBlocks(markdown);
            const nextBlock = blocks.find(block => !hasImageMarkerBefore(markdown, block.start));

            if (!nextBlock) {
                break;
            }

            const label = `${file} [${nextBlock.index}/${blocks.length}]`;

            console.log(`→ Sending ${label} - prompt: ${nextBlock.prompt}`);
            const imagePath = await postPrompt(endpoints.imagePromptUrl, nextBlock.prompt, label);

            const nextMarkdown = insertImageMarkerBeforeBlock(markdown, nextBlock, imagePath);
            await Bun.write(file, nextMarkdown);

            generatedCount += 1;
            console.log(`  Inserted marker for ${label}`);
        }

        if (generatedCount > 0) {
            console.log(`  Updated ${file} with ${generatedCount} image marker(s)`);
        } else {
            console.log(`  No markdown updates needed for ${file}`);
        }
    }

    console.log('Done.');
}

main().catch(err => {
    console.error(err?.stack ?? String(err));
    process.exit(1);
});
