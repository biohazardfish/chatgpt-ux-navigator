import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {assertRunLayout, isWriterSeniorOutPromptedFile, listFilesMatching} from '../core/files';
import {postResponses} from '../core/http';
import {buildImagePreconditionPrompt} from '../prompts/image';
import {buildStorySection} from '../prompts/story';
import type {CommandContext} from '../types';

export async function runImagePrecondition(ctx: CommandContext, runDir: string): Promise<void> {
    const paths = assertRunLayout(runDir);

    if (existsSync(paths.preconditionPath)) {
        const existing = (await Bun.file(paths.preconditionPath).text()).trim();
        if (existing) {
            console.log(`[${ctx.config.scriptName}] Run: ${paths.runDir}`);
            console.log(
                `[${ctx.config.scriptName}] Precondition already exists at ${paths.preconditionPath}`
            );
            console.log(`[${ctx.config.scriptName}] Nothing to do`);
            return;
        }
    }

    const promptedFiles = listFilesMatching(paths.processedDir, isWriterSeniorOutPromptedFile);
    if (promptedFiles.length === 0) {
        throw new Error(`No prompted chapter files found in ${paths.processedDir}`);
    }

    console.log(`[${ctx.config.scriptName}] Run: ${paths.runDir}`);
    console.log(
        `[${ctx.config.scriptName}] Generating precondition from ${promptedFiles.length} prompted chapter file(s)`
    );

    const resolvedFiles = promptedFiles.map(file => resolve(file));
    const fileContents = await Promise.all(resolvedFiles.map(file => Bun.file(file).text()));
    const story = buildStorySection(resolvedFiles, fileContents);
    const requestPrompt = buildImagePreconditionPrompt(story);
    const outputText = await postResponses(
        ctx.config.serverUrl,
        [{role: 'user', content: requestPrompt}],
        ctx.config.imageClientId,
        ctx.config.timeouts.imageGenPreconditionMs
    );

    await Bun.write(paths.preconditionPath, outputText.trimEnd() + '\n');
    console.log(`[${ctx.config.scriptName}] Wrote ${paths.preconditionPath}`);
}
