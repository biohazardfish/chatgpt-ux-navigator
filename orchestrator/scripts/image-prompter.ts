#!/usr/bin/env bun

import {basename, dirname, extname, join} from 'node:path';
import {existsSync} from 'node:fs';

const API_URL = process.env.IMAGE_PROMPTER_URL ?? 'http://localhost:8765/responses/image-prompter';

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes per chapter

const CONDITIONING_PROMPT = `I have a story that requires illustrations, and I would like to use an AI image generator to create them. Please help me draft prompts for the generator. I want the final output to be the story chapters with the image prompts embedded within code blocks like this: 

\`\`\`image_prompt
...
\`\`\`

Output only the chapters with the included image prompts and nothing else.

Confirm that you understand this task, and I will then provide the story to you chapter by chapter.
`;

type ApiMessage = {role: 'user'; content: string};
type ApiRequest = {input: ApiMessage[]};

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
            throw new Error(`API error ${res.status}: ${errorText}`);
        }

        const json = await res.json();
        return extractTextFromResponse(json);
    } finally {
        clearTimeout(timeout);
    }
}

function outputPathFor(inputPath: string): string {
    const dir = dirname(inputPath);
    const ext = extname(inputPath);
    const base = basename(inputPath, ext);
    return join(dir, `${base}_image_gen_prompted${ext}`);
}

async function main() {
    const files = process.argv.slice(2);

    if (files.length === 0) {
        console.error('Usage: bun run image-prompter.ts chapter1.txt chapter2.md ...');
        process.exit(1);
    }

    for (const f of files) {
        if (!existsSync(f)) {
            console.error(`File not found: ${f}`);
            process.exit(1);
        }
    }

    // Send conditioning prompt once
    console.log('→ Sending conditioning prompt...');
    await postToApi([{role: 'user', content: CONDITIONING_PROMPT}], 60_000);
    console.log('✓ Conditioning acknowledged.\n');

    // Process chapters
    for (const filePath of files) {
        console.log(`→ Processing: ${filePath}`);

        const chapterText = await Bun.file(filePath).text();

        // Include conditioning again in case API is stateless
        const messages: ApiMessage[] = [{role: 'user', content: chapterText}];

        const promptedChapter = await postToApi(messages, TIMEOUT_MS);

        const outPath = outputPathFor(filePath);
        await Bun.write(outPath, promptedChapter);

        console.log(`✓ Wrote: ${outPath}\n`);
    }

    console.log('Done.');
}

main().catch(err => {
    if (err?.name === 'AbortError') {
        console.error('Request timed out.');
    } else {
        console.error(err?.stack ?? String(err));
    }
    process.exit(1);
});
