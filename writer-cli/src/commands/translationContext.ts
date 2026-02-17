import {existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {assertRunLayout, isWriterSeniorOutFile, listFilesMatching} from '../core/files';
import {resolveLanguage} from '../core/language';
import {postResponses} from '../core/http';
import {normalizeOutput} from '../core/markdown';
import {buildStorySection} from '../prompts/story';
import {buildTranslationContextPrompt} from '../prompts/translation';
import type {CommandContext} from '../types';

export async function runTranslationContext(
    ctx: CommandContext,
    runDir: string,
    language: string
): Promise<void> {
    const paths = assertRunLayout(runDir);
    const resolvedLanguage = resolveLanguage(language);
    const translationContextPath = join(
        paths.runDir,
        `translation-context_${resolvedLanguage.code}.md`
    );

    if (existsSync(translationContextPath)) {
        const existing = (await Bun.file(translationContextPath).text()).trim();
        if (existing) {
            console.log(`[${ctx.config.scriptName}] Run: ${paths.runDir}`);
            console.log(
                `[${ctx.config.scriptName}] Translation context already exists at ${translationContextPath}`
            );
            console.log(`[${ctx.config.scriptName}] Nothing to do`);
            return;
        }
    }

    const cleanedFiles = listFilesMatching(paths.processedDir, isWriterSeniorOutFile);
    if (cleanedFiles.length === 0) {
        throw new Error(`No cleaned chapter files found in ${paths.processedDir}`);
    }

    console.log(`[${ctx.config.scriptName}] Run: ${paths.runDir}`);
    console.log(`[${ctx.config.scriptName}] Target language: ${resolvedLanguage.code}`);
    console.log(
        `[${ctx.config.scriptName}] Generating translation context from ${cleanedFiles.length} cleaned chapter file(s)`
    );

    const resolvedFiles = cleanedFiles.map(file => resolve(file));
    const fileContents = await Promise.all(resolvedFiles.map(file => Bun.file(file).text()));
    const story = buildStorySection(resolvedFiles, fileContents);
    const requestPrompt = buildTranslationContextPrompt(story, resolvedLanguage.name);
    const outputText = await postResponses(
        ctx.config.serverUrl,
        [{role: 'user', content: requestPrompt}],
        ctx.config.writerClientId,
        ctx.config.timeouts.translationContextMs
    );

    await Bun.write(translationContextPath, normalizeOutput(outputText));
    console.log(`[${ctx.config.scriptName}] Wrote ${translationContextPath}`);
}
