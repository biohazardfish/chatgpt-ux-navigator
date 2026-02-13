#!/usr/bin/env bun

import {existsSync} from 'node:fs';

const IMAGE_GEN_URL = process.env.IMAGE_GEN_URL ?? 'http://localhost:8765/images/image-gen';
const TIMEOUT_MS = Number(process.env.IMAGE_GEN_TIMEOUT_MS ?? 5 * 60 * 1000);

function extractPrompts(markdown: string): string[] {
    const re = /```image_prompt[ \t]*\r?\n([\s\S]*?)\r?\n```/g;
    const prompts: string[] = [];

    let match: RegExpExecArray | null;
    while ((match = re.exec(markdown)) !== null) {
        const prompt = (match[1] ?? '').trim();
        if (prompt.length > 0) {
            prompts.push(prompt);
        }
    }

    return prompts;
}

async function postPrompt(prompt: string, label: string): Promise<void> {
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

        console.log(`✓ ${label} done`);
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
        const markdown = await Bun.file(file).text();
        const prompts = extractPrompts(markdown);

        console.log(`  Found ${prompts.length} prompt(s)`);

        for (let i = 0; i < prompts.length; i++) {
            const label = `${file} [${i + 1}/${prompts.length}]`;
            console.log(`→ Sending ${label} - prompt: ${prompts[i]}`);
            await postPrompt(prompts[i], label);
        }
    }

    console.log('Done.');
}

main().catch(err => {
    console.error(err?.stack ?? String(err));
    process.exit(1);
});
