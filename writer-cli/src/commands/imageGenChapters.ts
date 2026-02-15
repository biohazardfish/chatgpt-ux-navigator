import {existsSync} from 'node:fs';
import {URL} from 'node:url';
import {assertRunLayout, isWriterSeniorOutPromptedFile, listFilesMatching} from '../core/files';
import {
    chapterHasPendingImagePrompts,
    copyImageToImagesDir,
    extractChapterIndex,
    extractImagePromptBlocks,
    hasImageMarkerBefore,
    insertImageMarkerBeforeBlock,
} from '../core/markdown';
import {formatHttpError, postAction} from '../core/http';
import {IMAGE_GEN_PRECONDITION_SETUP_PROMPT} from '../prompts/image';
import type {CommandContext, Endpoints} from '../types';

function createImageEndpoints(serverUrl: string, clientId: string): Endpoints {
    const encodedClientId = encodeURIComponent(clientId);
    const imagePromptUrlObj = new URL(`/images/${encodedClientId}`, serverUrl);
    const activateUrlObj = new URL(`/images/${encodedClientId}/activate`, serverUrl);
    const newChatUrlObj = new URL(`/responses/${encodedClientId}/new`, serverUrl);
    newChatUrlObj.searchParams.set('temporary', 'false');

    return {
        imagePromptUrl: imagePromptUrlObj.toString(),
        activateUrl: activateUrlObj.toString(),
        newChatUrl: newChatUrlObj.toString(),
        clientId,
    };
}

async function postImagePrompt(
    imagePromptUrl: string,
    prompt: string,
    label: string,
    timeoutMs: number,
    clientId: string
): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(imagePromptUrl, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({prompt}),
            signal: controller.signal,
        });

        const text = await res.text();
        if (!res.ok) {
            throw new Error(`${label} failed: ${formatHttpError(res.status, text, clientId)}`);
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

        return imagePath;
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s`);
        }
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}

export async function runImageGenChapters(ctx: CommandContext, runDir: string): Promise<void> {
    const paths = assertRunLayout(runDir);
    const promptedFiles = listFilesMatching(paths.processedDir, isWriterSeniorOutPromptedFile);

    if (promptedFiles.length === 0) {
        throw new Error(`No prompted chapter files found in ${paths.processedDir}`);
    }

    if (!existsSync(paths.preconditionPath)) {
        throw new Error(`Missing precondition file: ${paths.preconditionPath}`);
    }

    const preconditionBody = (await Bun.file(paths.preconditionPath).text()).trim();
    if (!preconditionBody) {
        throw new Error(`Precondition file is empty: ${paths.preconditionPath}`);
    }

    const pendingStates = await Promise.all(
        promptedFiles.map(async file => ({
            file,
            hasPending: await chapterHasPendingImagePrompts(file),
        }))
    );

    const filesWithPendingPrompts = pendingStates
        .filter(item => item.hasPending)
        .map(item => item.file);

    if (filesWithPendingPrompts.length === 0) {
        console.log(`[${ctx.config.scriptName}] Run: ${paths.runDir}`);
        console.log(`[${ctx.config.scriptName}] No pending image prompts found`);
        console.log(`[${ctx.config.scriptName}] Nothing to generate`);
        return;
    }

    console.log(`[${ctx.config.scriptName}] Run: ${paths.runDir}`);
    console.log(
        `[${ctx.config.scriptName}] Generating images for ${filesWithPendingPrompts.length} chapter file(s) with pending prompts`
    );

    const endpoints = createImageEndpoints(ctx.config.serverUrl, ctx.config.imageClientId);

    console.log(
        `[${ctx.config.scriptName}] Sending precondition prompt (${paths.preconditionPath})`
    );
    await postAction(
        endpoints.newChatUrl,
        `Precondition request for '${endpoints.clientId}'`,
        ctx.config.timeouts.imageGenMs,
        ctx.config.imageClientId,
        {prompt: IMAGE_GEN_PRECONDITION_SETUP_PROMPT + preconditionBody}
    );
    console.log(`[${ctx.config.scriptName}] Precondition prompt sent`);

    console.log(
        `[${ctx.config.scriptName}] Activating image generation mode for '${endpoints.clientId}'`
    );
    await postAction(
        endpoints.activateUrl,
        `Image activation for '${endpoints.clientId}'`,
        ctx.config.timeouts.imageGenMs,
        ctx.config.imageClientId
    );
    console.log(`[${ctx.config.scriptName}] Image generation mode activated`);

    for (
        let chapterOffset = 0;
        chapterOffset < filesWithPendingPrompts.length;
        chapterOffset += 1
    ) {
        const file = filesWithPendingPrompts[chapterOffset];
        console.log(`[${ctx.config.scriptName}] Processing ${file}`);
        const initialMarkdown = await Bun.file(file).text();
        const parsedChapterIndex = extractChapterIndex(initialMarkdown);
        const chapterIndex = parsedChapterIndex ?? chapterOffset + 1;

        if (parsedChapterIndex === null) {
            console.warn(
                `[${ctx.config.scriptName}] Could not parse chapter index from '${file}' using 'CHAPTER n/total:' format; falling back to ${chapterIndex}`
            );
        }

        const initialBlocks = extractImagePromptBlocks(initialMarkdown);
        console.log(
            `[${ctx.config.scriptName}] Found ${initialBlocks.length} prompt(s) in ${file}`
        );

        let generatedCount = 0;

        while (true) {
            const markdown = await Bun.file(file).text();
            const blocks = extractImagePromptBlocks(markdown);
            const nextBlock = blocks.find(block => !hasImageMarkerBefore(markdown, block.start));

            if (!nextBlock) {
                break;
            }

            const label = `${file} [${nextBlock.index}/${blocks.length}]`;
            console.log(
                `[${ctx.config.scriptName}] Sending ${label} - prompt: ${nextBlock.prompt}`
            );
            const generatedImagePath = await postImagePrompt(
                endpoints.imagePromptUrl,
                nextBlock.prompt,
                label,
                ctx.config.timeouts.imageGenMs,
                ctx.config.imageClientId
            );

            const copied = await copyImageToImagesDir(
                generatedImagePath,
                paths.imagesDir,
                file,
                chapterIndex,
                nextBlock.index
            );

            console.log(`[${ctx.config.scriptName}] Copied image to ${copied.copiedPath}`);

            const nextMarkdown = insertImageMarkerBeforeBlock(
                markdown,
                nextBlock,
                copied.markerPath
            );
            await Bun.write(file, nextMarkdown);

            generatedCount += 1;
            console.log(`[${ctx.config.scriptName}] Inserted marker for ${label}`);
        }

        if (generatedCount > 0) {
            console.log(
                `[${ctx.config.scriptName}] Updated ${file} with ${generatedCount} image marker(s)`
            );
        } else {
            console.log(`[${ctx.config.scriptName}] No markdown updates needed for ${file}`);
        }
    }
}
