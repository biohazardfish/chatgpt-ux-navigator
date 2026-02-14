#!/usr/bin/env bun

import {basename, dirname, extname, join} from 'node:path';
import {existsSync} from 'node:fs';

const SCRIPT = 'image-prompter';
const SERVER_URL = 'http://localhost:8765';
const CLIENT_ID = 'image-gen';
const API_URL = new URL(`/responses/${encodeURIComponent(CLIENT_ID)}`, SERVER_URL).toString();

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes per chapter

const CONDITIONING_PROMPT = `I have a story that requires illustrations, and I would like to use an AI image generator to create them. Please help me draft prompts for the generator. I want the final output to be the story chapters with the image prompts embedded within code blocks like this:

\`\`\`image_prompt
...
\`\`\`

Note that I have conditioned the AI to recognize specific character names. Use them in your prompts whenever appropriate.

Don't over do the number of images. Only include prompts for scenes that are visually rich or important to the story. Each prompt should be concise but descriptive, focusing on key visual elements, characters, and mood.

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

function outputPathFor(inputPath: string): string {
    const dir = dirname(inputPath);
    const ext = extname(inputPath);
    const base = basename(inputPath, ext);
    return join(dir, `${base}_with_image_prompt${ext}`);
}

async function main() {
    const files = process.argv.slice(2);

    if (files.length === 0) {
        console.error(`[${SCRIPT}] Usage: bun run image-prompter.ts chapter1.txt chapter2.md ...`);
        process.exit(1);
    }

    for (const f of files) {
        if (!existsSync(f)) {
            console.error(`[${SCRIPT}] File not found: ${f}`);
            process.exit(1);
        }
    }

    // Send conditioning prompt once
    console.log(`[${SCRIPT}] Sending conditioning prompt to ${API_URL}`);
    await postToApi([{role: 'user', content: CONDITIONING_PROMPT}], 60_000);
    console.log(`[${SCRIPT}] Conditioning acknowledged`);

    // Process chapters
    for (const filePath of files) {
        console.log(`[${SCRIPT}] Processing: ${filePath}`);

        const chapterText = await Bun.file(filePath).text();

        // Include conditioning again in case API is stateless
        const messages: ApiMessage[] = [{role: 'user', content: chapterText}];

        const promptedChapter = await postToApi(messages, TIMEOUT_MS);

        const outPath = outputPathFor(filePath);
        await Bun.write(outPath, promptedChapter);

        console.log(`[${SCRIPT}] Wrote: ${outPath}`);
    }

    console.log(`[${SCRIPT}] Done.`);
}

main().catch(err => {
    console.error(`[${SCRIPT}] ${err?.stack ?? String(err)}`);
    process.exit(1);
});
