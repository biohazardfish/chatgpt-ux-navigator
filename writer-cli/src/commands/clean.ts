import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {assertRunLayout, listFilesMatching, writerSeniorOutPathFor} from '../core/files';
import {cleanChapter} from '../core/markdown';
import type {CommandContext} from '../types';

export async function runClean(ctx: CommandContext, runDir: string): Promise<void> {
    const paths = assertRunLayout(runDir);
    const inputs = listFilesMatching(paths.messagesDir, file => /_writer_senior\.md$/i.test(file));

    if (inputs.length === 0) {
        throw new Error(`No writer senior chapter files found in ${paths.messagesDir}`);
    }

    const existingOutputs: string[] = [];
    const pendingInputs = inputs.filter(input => {
        const outPath = writerSeniorOutPathFor(input, paths.processedDir);
        if (existsSync(outPath)) {
            existingOutputs.push(outPath);
            return false;
        }
        return true;
    });

    console.log(`[${ctx.config.scriptName}] Run: ${paths.runDir}`);
    console.log(`[${ctx.config.scriptName}] Found ${inputs.length} writer senior file(s)`);

    if (existingOutputs.length > 0) {
        console.log(
            `[${ctx.config.scriptName}] Skipping ${existingOutputs.length} file(s) because cleaned output already exists`
        );
    }

    if (pendingInputs.length === 0) {
        console.log(`[${ctx.config.scriptName}] Nothing to clean`);
        return;
    }

    for (const inputPath of pendingInputs) {
        const outputPath = writerSeniorOutPathFor(inputPath, paths.processedDir);
        const content = readFileSync(inputPath, 'utf8');
        const cleaned = cleanChapter(content);
        writeFileSync(outputPath, cleaned, 'utf8');
        console.log(`[${ctx.config.scriptName}] Cleaned: ${inputPath} -> ${outputPath}`);
    }
}
