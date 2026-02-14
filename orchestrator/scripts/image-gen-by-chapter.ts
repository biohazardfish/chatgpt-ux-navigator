#!/usr/bin/env bun

import {existsSync, mkdirSync} from 'node:fs';
import {dirname, extname, isAbsolute, join, relative, resolve} from 'node:path';

const SCRIPT = 'image-gen-by-chapter';
const SERVER_URL = 'http://localhost:8765';
const CLIENT_ID = 'image-gen';
const TIMEOUT_MS = Number(process.env.IMAGE_GEN_TIMEOUT_MS ?? 5 * 60 * 1000);

const PRECCONDITION_PROMPT = `I want to create image generation for this story. I will provide you the image generation prompts one by one. Only generate one image per prompt.

First understand the preconditon below and confirm that you are ready to receive the prompts.

`;

type ParsedArgs = {
    files: string[];
    preconditionFile: string | null;
    imagesDir: string | null;
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

// Extract fenced ```image_prompt blocks in source order.
// Index is 1-based per file and reused for image marker numbering.
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

// Detect whether the prompt block already has an image marker right above it.
// This keeps reruns idempotent and prevents duplicate markers.
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

// Insert a markdown image marker immediately before a prompt block.
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
        'Usage: bun run image-gen-by-chapter.ts [--precondition <file>] [--output-dir <dir>] file1.md file2.md ...',
        '',
        'Examples:',
        '  bun run image-gen-by-chapter.ts --output-dir ./images chapter1.md chapter2.md',
        '  bun run image-gen-by-chapter.ts --precondition style.md --output-dir ./images chapter1.md chapter2.md',
    ].join('\n');
}

function parseArgs(argv: string[]): ParsedArgs {
    const files: string[] = [];
    let preconditionFile: string | null = null;
    let imagesDir: string | null = null;

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

        if (arg === '--output-dir') {
            const next = argv[i + 1];
            if (!next || next.startsWith('--')) {
                throw new Error('Missing value for --output-dir');
            }
            imagesDir = next;
            i += 1;
            continue;
        }

        if (arg.startsWith('--')) {
            throw new Error(`Unknown option: ${arg}`);
        }

        files.push(arg);
    }

    return {files, preconditionFile, imagesDir};
}

// Normalize Windows-style separators for markdown links.
function normalizeMarkdownPath(filePath: string): string {
    return filePath.replace(/\\/g, '/');
}

function padIndex(index: number): string {
    return String(index).padStart(3, '0');
}

function extractChapterIndex(markdown: string): number | null {
    const chapterMatch = markdown.match(/\bCHAPTER\s+(\d+)\s*\/\s*\d+\s*:/i);
    if (!chapterMatch) return null;

    const chapterIndex = Number.parseInt(chapterMatch[1] ?? '', 10);
    return Number.isFinite(chapterIndex) && chapterIndex > 0 ? chapterIndex : null;
}

// Copy a generated image into imagesDir using chapter/image numbering.
// Returns both filesystem path and markdown-friendly relative path.
async function copyImageToImagesDir(
    imagePath: string,
    imagesDir: string,
    markdownFile: string,
    chapterIndex: number,
    imageIndex: number
): Promise<{copiedPath: string; markerPath: string}> {
    if (/^https?:\/\//i.test(imagePath)) {
        throw new Error(`Cannot copy remote URL image path: ${imagePath}`);
    }

    const sourcePath = isAbsolute(imagePath) ? imagePath : resolve(process.cwd(), imagePath);
    if (!existsSync(sourcePath)) {
        throw new Error(`Generated image file not found: ${sourcePath}`);
    }

    mkdirSync(imagesDir, {recursive: true});

    const extension = extname(sourcePath);
    const targetFileName = `chapter_${padIndex(chapterIndex)}_image_${padIndex(imageIndex)}${extension}`;
    const targetPath = join(imagesDir, targetFileName);

    await Bun.write(targetPath, Bun.file(sourcePath));

    const markdownDir = dirname(resolve(process.cwd(), markdownFile));
    const relativePath = relative(markdownDir, targetPath);
    const markerPath = normalizeMarkdownPath(relativePath);

    return {copiedPath: targetPath, markerPath};
}

function createEndpoints(): Endpoints {
    const encodedClientId = encodeURIComponent(CLIENT_ID);
    const imagePromptUrlObj = new URL(`/images/${encodedClientId}`, SERVER_URL);
    const activateUrlObj = new URL(`/images/${encodedClientId}/activate`, SERVER_URL);
    const newChatUrlObj = new URL(`/responses/${encodedClientId}/new`, SERVER_URL);
    newChatUrlObj.searchParams.set('temporary', 'false');

    return {
        imagePromptUrl: imagePromptUrlObj.toString(),
        activateUrl: activateUrlObj.toString(),
        newChatUrl: newChatUrlObj.toString(),
        clientId: CLIENT_ID,
    };
}

function formatHttpError(status: number, body: string, clientId: string): string {
    const snippet = body.trim().slice(0, 500) || '<empty response body>';
    if (status === 404) {
        return `server returned 404 (client '${clientId}' is not connected). Open ChatGPT tab with extension and retry. Body: ${snippet}`;
    }
    if (status === 409) {
        return `server returned 409 (client '${clientId}' has an in-flight request). Wait for completion and retry. Body: ${snippet}`;
    }
    return `server returned ${status}. Body: ${snippet}`;
}

// Generic POST helper used for activation and precondition calls.
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
            throw new Error(`${label} failed: ${formatHttpError(res.status, text, CLIENT_ID)}`);
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

// Send one prompt and read generated image path from API response.
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
            throw new Error(`${label} failed: ${formatHttpError(res.status, text, CLIENT_ID)}`);
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

        console.log(`[${SCRIPT}] ${label} done -> ${imagePath}`);
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
    const {files, preconditionFile, imagesDir} = parseArgs(process.argv.slice(2));

    if (files.length === 0) {
        console.error(usage());
        process.exit(1);
    }

    const endpoints = createEndpoints();

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

    const resolvedImagesDir = imagesDir ? resolve(process.cwd(), imagesDir) : null;
    if (resolvedImagesDir) {
        mkdirSync(resolvedImagesDir, {recursive: true});
    }

    if (preconditionFile) {
        const preconditionPrompt = (await Bun.file(preconditionFile).text()).trim();
        if (!preconditionPrompt) {
            console.error(`Precondition file is empty: ${preconditionFile}`);
            process.exit(1);
        }

        console.log(`[${SCRIPT}] Sending precondition prompt (${preconditionFile})`);
        await postAction(endpoints.newChatUrl, `Precondition request for '${endpoints.clientId}'`, {
            prompt: PRECCONDITION_PROMPT + preconditionPrompt,
        });
        console.log(`[${SCRIPT}] Precondition prompt sent`);
    }

    console.log(`[${SCRIPT}] Activating image generation mode for '${endpoints.clientId}'`);
    await postAction(endpoints.activateUrl, `Image activation for '${endpoints.clientId}'`);
    console.log(`[${SCRIPT}] Image generation mode activated`);

    // Chapter index is read from markdown header (ex: CHAPTER 7/12: ...).
    // Fallback to CLI order if header is missing.
    for (let chapterOffset = 0; chapterOffset < files.length; chapterOffset += 1) {
        const file = files[chapterOffset];
        console.log(`[${SCRIPT}] Processing ${file}`);
        const initialMarkdown = await Bun.file(file).text();
        const parsedChapterIndex = extractChapterIndex(initialMarkdown);
        const chapterIndex = parsedChapterIndex ?? chapterOffset + 1;
        if (parsedChapterIndex === null) {
            console.warn(
                `[${SCRIPT}] Could not parse chapter index from '${file}' using 'CHAPTER n/total:' format; falling back to ${chapterIndex}`
            );
        }
        const initialBlocks = extractPromptBlocks(initialMarkdown);

        console.log(`[${SCRIPT}] Found ${initialBlocks.length} prompt(s) in ${file}`);

        let generatedCount = 0;

        // Re-read file each loop because we write new markers after each prompt.
        while (true) {
            const markdown = await Bun.file(file).text();
            const blocks = extractPromptBlocks(markdown);
            const nextBlock = blocks.find(block => !hasImageMarkerBefore(markdown, block.start));

            if (!nextBlock) {
                break;
            }

            const label = `${file} [${nextBlock.index}/${blocks.length}]`;

            console.log(`[${SCRIPT}] Sending ${label} - prompt: ${nextBlock.prompt}`);
            const generatedImagePath = await postPrompt(
                endpoints.imagePromptUrl,
                nextBlock.prompt,
                label
            );

            let markerImagePath = generatedImagePath;
            if (resolvedImagesDir) {
                const copied = await copyImageToImagesDir(
                    generatedImagePath,
                    resolvedImagesDir,
                    file,
                    chapterIndex,
                    nextBlock.index
                );
                markerImagePath = copied.markerPath;
                console.log(`[${SCRIPT}] Copied image to ${copied.copiedPath}`);
            }

            const nextMarkdown = insertImageMarkerBeforeBlock(markdown, nextBlock, markerImagePath);
            await Bun.write(file, nextMarkdown);

            generatedCount += 1;
            console.log(`[${SCRIPT}] Inserted marker for ${label}`);
        }

        if (generatedCount > 0) {
            console.log(`[${SCRIPT}] Updated ${file} with ${generatedCount} image marker(s)`);
        } else {
            console.log(`[${SCRIPT}] No markdown updates needed for ${file}`);
        }
    }

    console.log(`[${SCRIPT}] Done.`);
}

main().catch(err => {
    console.error(`[${SCRIPT}] ${err?.stack ?? String(err)}`);
    process.exit(1);
});
