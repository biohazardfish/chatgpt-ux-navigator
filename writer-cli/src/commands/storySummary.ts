import {existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {
    assertRunLayout,
    isWriterSeniorOutFile,
    listFilesMatching,
    readNonEmptyFile,
} from '../core/files';
import {resolveLanguage} from '../core/language';
import {postResponses, postResponsesNewThread} from '../core/http';
import {normalizeOutput} from '../core/markdown';
import {buildStorySummaryImprovePrompt, buildStorySummaryTranslationPrompt} from '../prompts/story';
import type {CommandContext} from '../types';
import {generateStorySummaryFromFiles} from './shared';

export async function runStorySummary(
    ctx: CommandContext,
    runDir: string,
    language: string | null,
    contextFile: string | null
): Promise<void> {
    const paths = assertRunLayout(runDir);
    const resolvedContextFromArg = contextFile ? resolve(contextFile) : null;

    if (!language) {
        if (existsSync(paths.storySummaryPath)) {
            const existing = (await Bun.file(paths.storySummaryPath).text()).trim();
            if (existing) {
                console.log(`[${ctx.config.scriptName}] Run: ${paths.runDir}`);
                console.log(
                    `[${ctx.config.scriptName}] Story summary already exists at ${paths.storySummaryPath}`
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
        console.log(
            `[${ctx.config.scriptName}] Generating story summary from ${cleanedFiles.length} cleaned chapter file(s)`
        );

        const outputText = await generateStorySummaryFromFiles(ctx, cleanedFiles);
        await Bun.write(paths.storySummaryPath, normalizeOutput(outputText));
        console.log(`[${ctx.config.scriptName}] Wrote ${paths.storySummaryPath}`);
        return;
    }

    const resolvedLanguage = resolveLanguage(language);
    const translatedSummaryPath = join(paths.runDir, `story-summary_${resolvedLanguage.code}.txt`);

    if (existsSync(translatedSummaryPath)) {
        const existingTranslated = (await Bun.file(translatedSummaryPath).text()).trim();
        if (existingTranslated) {
            console.log(`[${ctx.config.scriptName}] Run: ${paths.runDir}`);
            console.log(
                `[${ctx.config.scriptName}] Translated summary already exists at ${translatedSummaryPath}`
            );
            console.log(`[${ctx.config.scriptName}] Nothing to do`);
            return;
        }
    }

    let baseSummary: string | null = null;
    if (existsSync(paths.storySummaryPath)) {
        const existing = (await Bun.file(paths.storySummaryPath).text()).trim();
        if (existing.length > 0) {
            baseSummary = existing;
        }
    }

    if (!baseSummary) {
        const cleanedFiles = listFilesMatching(paths.processedDir, isWriterSeniorOutFile);
        if (cleanedFiles.length === 0) {
            throw new Error(`No cleaned chapter files found in ${paths.processedDir}`);
        }

        console.log(`[${ctx.config.scriptName}] Run: ${paths.runDir}`);
        console.log(
            `[${ctx.config.scriptName}] Generating base story summary from ${cleanedFiles.length} cleaned chapter file(s)`
        );

        baseSummary = await generateStorySummaryFromFiles(ctx, cleanedFiles);
        await Bun.write(paths.storySummaryPath, normalizeOutput(baseSummary));
        console.log(`[${ctx.config.scriptName}] Wrote ${paths.storySummaryPath}`);
    } else {
        console.log(`[${ctx.config.scriptName}] Run: ${paths.runDir}`);
        console.log(
            `[${ctx.config.scriptName}] Reusing base story summary at ${paths.storySummaryPath}`
        );
    }

    const autoContextPath = join(paths.runDir, `translation-context_${resolvedLanguage.code}.md`);
    let resolvedContextPath: string | null = resolvedContextFromArg;

    if (!resolvedContextPath && existsSync(autoContextPath)) {
        const autoContext = (await Bun.file(autoContextPath).text()).trim();
        if (autoContext) {
            resolvedContextPath = autoContextPath;
            console.log(
                `[${ctx.config.scriptName}] Auto-detected context file: ${resolvedContextPath}`
            );
        }
    }

    let contextText: string | null = null;
    if (resolvedContextPath) {
        contextText = await readNonEmptyFile(resolvedContextPath);
        console.log(`[${ctx.config.scriptName}] Context file: ${resolvedContextPath}`);
    }

    console.log(`[${ctx.config.scriptName}] Translating story summary to ${resolvedLanguage.code}`);
    const translatedSummary = await postResponsesNewThread(
        ctx.config.serverUrl,
        [
            {
                role: 'user',
                content: buildStorySummaryTranslationPrompt(
                    baseSummary,
                    resolvedLanguage.name,
                    contextText
                ),
            },
        ],
        ctx.config.writerClientId,
        ctx.config.timeouts.storySummaryMs
    );

    const improvedSummary = await postResponses(
        ctx.config.serverUrl,
        [
            {
                role: 'user',
                content: buildStorySummaryImprovePrompt(
                    translatedSummary,
                    resolvedLanguage.name,
                    contextText
                ),
            },
        ],
        ctx.config.writerClientId,
        ctx.config.timeouts.storySummaryMs
    );

    await Bun.write(translatedSummaryPath, normalizeOutput(improvedSummary));
    console.log(`[${ctx.config.scriptName}] Wrote ${translatedSummaryPath}`);
}
