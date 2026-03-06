import {existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {
    assertRunLayout,
    isWriterSeniorOutFile,
    isWriterSeniorOutPromptedFile,
    isWriterSeniorOutTranslatedFile,
    listFilesMatching,
    outputPathFor,
    readNonEmptyFile,
    translatedPathFor,
} from '../core/files';
import {resolveLanguage} from '../core/language';
import {normalizeOutput} from '../core/markdown';
import {postResponses, postResponsesNewThread} from '../core/http';
import {
    buildImproveChapterPrompt,
    buildImproveConditioningPrompt,
    buildTranslationConditioningPrompt,
} from '../prompts/translation';
import type {CommandContext} from '../types';

export async function runTranslateChapters(
    ctx: CommandContext,
    runDir: string,
    language: string,
    improve: boolean,
    contextFile: string | null
): Promise<void> {
    const paths = assertRunLayout(runDir);
    const resolvedLanguage = resolveLanguage(language);
    const autoContextPath = join(paths.runDir, `translation-context_${resolvedLanguage.code}.md`);

    let sourceFiles: string[] = [];

    if (improve) {
        sourceFiles = listFilesMatching(paths.processedDir, file =>
            isWriterSeniorOutTranslatedFile(file, resolvedLanguage.code)
        );
    } else {
        // Try prompted files first, then fallback to standard cleaned files
        sourceFiles = listFilesMatching(paths.processedDir, isWriterSeniorOutPromptedFile);
        if (sourceFiles.length === 0) {
            sourceFiles = listFilesMatching(paths.processedDir, isWriterSeniorOutFile);
        }
    }

    if (sourceFiles.length === 0) {
        if (improve) {
            throw new Error(
                `No translated chapter files found in ${paths.processedDir} for language '${resolvedLanguage.code}'`
            );
        }
        throw new Error(`No chapter files to translate found in ${paths.processedDir}`);
    }

    console.log(`[${ctx.config.scriptName}] Run: ${paths.runDir}`);
    console.log(`[${ctx.config.scriptName}] Target language: ${resolvedLanguage.code}`);
    console.log(`[${ctx.config.scriptName}] Mode: ${improve ? 'improve (in-place)' : 'translate'}`);
    console.log(`[${ctx.config.scriptName}] Found ${sourceFiles.length} source chapter file(s)`);

    let resolvedContextFile = contextFile ? resolve(contextFile) : null;

    if (!resolvedContextFile && existsSync(autoContextPath)) {
        const autoContextBody = (await Bun.file(autoContextPath).text()).trim();
        if (autoContextBody) {
            resolvedContextFile = autoContextPath;
            console.log(
                `[${ctx.config.scriptName}] Auto-detected context file: ${resolvedContextFile}`
            );
        } else {
            console.log(
                `[${ctx.config.scriptName}] Ignoring empty auto-detected context file: ${autoContextPath}`
            );
        }
    }

    let contextText: string | null = null;
    if (resolvedContextFile) {
        contextText = await readNonEmptyFile(resolvedContextFile);
        console.log(`[${ctx.config.scriptName}] Context file: ${resolvedContextFile}`);
    }

    if (!improve) {
        const existingTranslated: string[] = [];
        const pendingFiles = sourceFiles.filter(file => {
            const translatedPath = translatedPathFor(file, resolvedLanguage.code);
            if (existsSync(translatedPath)) {
                existingTranslated.push(translatedPath);
                return false;
            }
            return true;
        });

        if (existingTranslated.length > 0) {
            console.log(
                `[${ctx.config.scriptName}] Skipping ${existingTranslated.length} file(s) because translated output already exists`
            );
        }

        if (pendingFiles.length === 0) {
            console.log(`[${ctx.config.scriptName}] Nothing to translate`);
            return;
        }

        console.log(`[${ctx.config.scriptName}] Sending translate conditioning prompt`);
        await postResponses(
            ctx.config.serverUrl,
            [
                {
                    role: 'user',
                    content: buildTranslationConditioningPrompt(resolvedLanguage.name, contextText),
                },
            ],
            ctx.config.writerClientId,
            ctx.config.timeouts.conditioningMs
        );
        console.log(`[${ctx.config.scriptName}] Conditioning acknowledged`);

        for (const filePath of pendingFiles) {
            console.log(`[${ctx.config.scriptName}] Processing: ${filePath}`);
            const chapterText = await Bun.file(filePath).text();
            const translatedChapter = await postResponses(
                ctx.config.serverUrl,
                [{role: 'user', content: chapterText}],
                ctx.config.writerClientId,
                ctx.config.timeouts.chapterTranslatorMs
            );

            const outPath = outputPathFor(filePath, resolvedLanguage.code);
            await Bun.write(outPath, normalizeOutput(translatedChapter));
            console.log(`[${ctx.config.scriptName}] Wrote: ${outPath}`);
        }

        return;
    }

    console.log(`[${ctx.config.scriptName}] Sending improve conditioning prompt`);
    await postResponsesNewThread(
        ctx.config.serverUrl,
        [
            {
                role: 'user',
                content: buildImproveConditioningPrompt(resolvedLanguage.name, contextText),
            },
        ],
        ctx.config.writerClientId,
        ctx.config.timeouts.conditioningMs
    );
    console.log(`[${ctx.config.scriptName}] Conditioning acknowledged`);

    for (const filePath of sourceFiles) {
        console.log(`[${ctx.config.scriptName}] Processing: ${filePath}`);
        const chapterText = await Bun.file(filePath).text();
        const improvePrompt = buildImproveChapterPrompt(chapterText, resolvedLanguage.name);
        const improvedChapter = await postResponses(
            ctx.config.serverUrl,
            [{role: 'user', content: improvePrompt}],
            ctx.config.writerClientId,
            ctx.config.timeouts.chapterTranslatorMs
        );

        await Bun.write(filePath, normalizeOutput(improvedChapter));
        console.log(`[${ctx.config.scriptName}] Wrote: ${filePath}`);
    }
}
