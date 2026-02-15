import {existsSync, mkdirSync, readdirSync} from 'node:fs';
import {basename, dirname, extname, join, resolve} from 'node:path';
import type {RunPaths} from '../types';

export function listFilesMatching(dir: string, matcher: (name: string) => boolean): string[] {
    const names = readdirSync(dir, {withFileTypes: true})
        .filter(entry => entry.isFile() && matcher(entry.name))
        .map(entry => entry.name)
        .sort((a, b) => a.localeCompare(b));

    return names.map(name => join(dir, name));
}

export function assertRunLayout(runDir: string): RunPaths {
    const resolvedRunDir = resolve(runDir);
    const messagesDir = join(resolvedRunDir, 'messages');
    const processedDir = join(resolvedRunDir, 'processed');
    const imagesDir = join(resolvedRunDir, 'images');
    const storySummaryPath = join(resolvedRunDir, 'story-summary.txt');
    const preconditionPath = join(resolvedRunDir, 'image-gen-precondition.md');

    if (!existsSync(resolvedRunDir)) {
        throw new Error(`Run directory not found: ${resolvedRunDir}`);
    }

    if (!existsSync(messagesDir)) {
        throw new Error(`Missing messages directory: ${messagesDir}`);
    }

    mkdirSync(processedDir, {recursive: true});
    mkdirSync(imagesDir, {recursive: true});

    return {
        runDir: resolvedRunDir,
        messagesDir,
        processedDir,
        imagesDir,
        storySummaryPath,
        preconditionPath,
    };
}

export function writerSeniorOutPathFor(cleanInputPath: string, processedDir: string): string {
    const inputName = basename(cleanInputPath);
    const withoutExt = inputName.replace(/\.md$/i, '');
    return join(processedDir, `${withoutExt}_out.md`);
}

export function isWriterSeniorOutFile(fileName: string): boolean {
    return /_writer_senior_out\.md$/i.test(fileName);
}

export function isWriterSeniorOutPromptedFile(fileName: string): boolean {
    return /_writer_senior_out_with_image_prompt\.md$/i.test(fileName);
}

export function promptedPathFor(cleanedFilePath: string): string {
    return cleanedFilePath.replace(/\.md$/i, '_with_image_prompt.md');
}

export function translatedPathFor(promptedFilePath: string, language: string): string {
    return promptedFilePath.replace(/\.md$/i, `_${language}.md`);
}

export function isWriterSeniorOutPromptedTranslatedFile(
    fileName: string,
    language: string
): boolean {
    const escapedLanguage = language.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`_writer_senior_out_with_image_prompt_${escapedLanguage}\\.md$`, 'i').test(
        fileName
    );
}

export function outputPathFor(inputPath: string, language: string): string {
    const dir = dirname(inputPath);
    const ext = extname(inputPath);
    const base = basename(inputPath, ext);
    return join(dir, `${base}_${language}${ext}`);
}

export async function readNonEmptyFile(filePath: string): Promise<string> {
    if (!existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    const content = (await Bun.file(filePath).text()).trim();
    if (!content) {
        throw new Error(`File is empty: ${filePath}`);
    }

    return content;
}
