import {existsSync} from 'node:fs';
import {
    assertRunLayout,
    isWriterSeniorOutFile,
    listFilesMatching,
    promptedPathFor,
} from '../core/files';
import {buildResponsesEndpoint, postResponses} from '../core/http';
import {IMAGE_PROMPTER_CONDITIONING_PROMPT} from '../prompts/image';
import type {CommandContext} from '../types';

export async function runImagePromptChapters(ctx: CommandContext, runDir: string): Promise<void> {
    const paths = assertRunLayout(runDir);
    const cleanedFiles = listFilesMatching(paths.processedDir, isWriterSeniorOutFile);

    if (cleanedFiles.length === 0) {
        throw new Error(`No cleaned chapter files found in ${paths.processedDir}`);
    }

    const existingPrompted: string[] = [];
    const pendingPrompted = cleanedFiles.filter(file => {
        const promptedPath = promptedPathFor(file);
        if (existsSync(promptedPath)) {
            existingPrompted.push(promptedPath);
            return false;
        }
        return true;
    });

    console.log(`[${ctx.config.scriptName}] Run: ${paths.runDir}`);
    console.log(`[${ctx.config.scriptName}] Found ${cleanedFiles.length} cleaned chapter file(s)`);

    if (existingPrompted.length > 0) {
        console.log(
            `[${ctx.config.scriptName}] Skipping ${existingPrompted.length} file(s) because prompted output already exists`
        );
    }

    if (pendingPrompted.length === 0) {
        console.log(`[${ctx.config.scriptName}] Nothing to prompt`);
        return;
    }

    console.log(
        `[${ctx.config.scriptName}] Sending conditioning prompt to ${buildResponsesEndpoint(ctx.config.serverUrl, ctx.config.imageClientId)}`
    );
    await postResponses(
        ctx.config.serverUrl,
        [{role: 'user', content: IMAGE_PROMPTER_CONDITIONING_PROMPT}],
        ctx.config.imageClientId,
        ctx.config.timeouts.conditioningMs
    );
    console.log(`[${ctx.config.scriptName}] Conditioning acknowledged`);

    for (const filePath of pendingPrompted) {
        console.log(`[${ctx.config.scriptName}] Processing: ${filePath}`);
        const chapterText = await Bun.file(filePath).text();
        const promptedChapter = await postResponses(
            ctx.config.serverUrl,
            [{role: 'user', content: chapterText}],
            ctx.config.imageClientId,
            ctx.config.timeouts.imagePrompterMs
        );
        const outPath = promptedPathFor(filePath);
        await Bun.write(outPath, promptedChapter);
        console.log(`[${ctx.config.scriptName}] Wrote: ${outPath}`);
    }
}
