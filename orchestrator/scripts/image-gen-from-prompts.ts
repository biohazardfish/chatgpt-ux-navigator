#!/usr/bin/env bun

import {existsSync} from 'node:fs';

const IMAGE_GEN_URL = process.env.IMAGE_GEN_URL ?? 'http://localhost:8765/images/image-gen';
const TIMEOUT_MS = Number(process.env.IMAGE_GEN_TIMEOUT_MS ?? 5 * 60 * 1000);

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

function insertImageMarkerBeforeBlock(markdown: string, block: PromptBlock, imagePath: string): string {
    let prefix = markdown.slice(0, block.start);
    const suffix = markdown.slice(block.start);

    if (prefix.length > 0 && !prefix.endsWith('\n')) {
        prefix += '\n';
    }

    const marker = `![Image ${block.index}](${imagePath})\n\n`;
    return `${prefix}${marker}${suffix}`;
}

async function postPrompt(prompt: string, label: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const res = await fetch(IMAGE_GEN_URL, {
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
    const files = process.argv.slice(2);

    if (files.length === 0) {
        console.error('Usage: bun run image-gen-from-prompts.ts file1.md file2.md ...');
        process.exit(1);
    }

    for (const file of files) {
        if (!existsSync(file)) {
            console.error(`File not found: ${file}`);
            process.exit(1);
        }

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
            const imagePath = await postPrompt(nextBlock.prompt, label);

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
