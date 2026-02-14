#!/usr/bin/env bun
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, dirname, extname, join, resolve} from 'node:path';

const SCRIPT = 'clean-chapter';

function normalizeHeadingText(value: string): string {
    return value
        .replace(/[`*_~]/g, ' ')
        .replace(/&/g, ' and ')
        .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}

function isContinuityHeading(title: string): boolean {
    const normalized = normalizeHeadingText(title);

    return /^continuity(?:\s+and)?\s+next\s+hooks?$/.test(normalized);
}

function extractHeadingTitle(lines: string[], index: number): string | null {
    const line = lines[index]?.trim() ?? '';

    if (!line) {
        return null;
    }

    const atx = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);

    if (atx) {
        return atx[1];
    }

    const boldOnly = line.match(/^\*{1,3}\s*(.+?)\s*\*{1,3}\s*:?\s*$/);

    if (boldOnly) {
        return boldOnly[1];
    }

    const nextLine = lines[index + 1]?.trim() ?? '';

    if (/^(?:=|-){3,}\s*$/.test(nextLine)) {
        return line;
    }

    if (/^[a-zA-Z0-9][a-zA-Z0-9\s&:/()'"-]{0,100}$/.test(line)) {
        return line;
    }

    return null;
}

function stripContinuitySection(content: string): string {
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const title = extractHeadingTitle(lines, i);

        if (title && isContinuityHeading(title)) {
            return lines.slice(0, i).join('\n');
        }
    }

    return content;
}

function normalizeChapterTitle(line: string): string | null {
    const trimmed = line.trim();

    if (!trimmed) {
        return null;
    }

    const atxMatch = trimmed.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    let text = atxMatch ? atxMatch[1] : trimmed;
    const lower = text.toLowerCase();

    if (lower.startsWith('thought for')) {
        const chapterIndex = lower.indexOf('chapter');
        if (chapterIndex === -1) {
            return null;
        }
        text = text.slice(chapterIndex).trim();
    }

    if (!/^chapter\b/i.test(text)) {
        return null;
    }

    const normalized = text.replace(/^chapter\b/i, 'CHAPTER').replace(/\s+/g, ' ').trim();
    return normalized || null;
}

function normalizeChapterHeadings(content: string): string {
    const lines = content.split(/\r?\n/);
    const output: string[] = [];

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const chapterTitle = normalizeChapterTitle(line);

        if (!chapterTitle) {
            output.push(line);
            continue;
        }

        output.push(`## ${chapterTitle}`);

        const nextLine = lines[i + 1]?.trim() ?? '';
        if (/^(?:=|-){3,}\s*$/.test(nextLine)) {
            i += 1;
        }
    }

    return output.join('\n');
}

function cleanChapter(content: string): string {
    let output = content;

    output = output.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
    output = stripContinuitySection(output);
    output = normalizeChapterHeadings(output);

    return output.trim() + '\n';
}

function buildOutputPath(inputPath: string, outputDir?: string): string {
    const dir = outputDir ?? dirname(inputPath);
    const ext = extname(inputPath);
    const base = basename(inputPath, ext);

    return join(dir, `${base}_out${ext}`);
}

const inputArgs = process.argv.slice(2);
const fileArgs: string[] = [];
let outputDirArg: string | undefined;

for (let i = 0; i < inputArgs.length; i++) {
    const arg = inputArgs[i];

    if (arg === '-o' || arg === '--output-dir') {
        const next = inputArgs[i + 1];

        if (!next || next.startsWith('-')) {
            console.error(`[${SCRIPT}] Missing value for --output-dir`);
            process.exit(1);
        }

        outputDirArg = next;
        i++;
        continue;
    }

    if (arg.startsWith('--output-dir=')) {
        const value = arg.slice('--output-dir='.length);

        if (!value) {
            console.error(`[${SCRIPT}] Missing value for --output-dir`);
            process.exit(1);
        }

        outputDirArg = value;
        continue;
    }

    if (arg.startsWith('-')) {
        console.error(`[${SCRIPT}] Unknown option: ${arg}`);
        process.exit(1);
    }

    fileArgs.push(arg);
}

if (fileArgs.length === 0) {
    console.error(
        `[${SCRIPT}] Usage: bun clean-chapter.ts [--output-dir <dir> | -o <dir>] <file1.md> <file2.md> ...`
    );
    process.exit(1);
}

const outputDir = outputDirArg ? resolve(outputDirArg) : undefined;

if (outputDir) {
    mkdirSync(outputDir, {recursive: true});
}

let hadError = false;

for (const arg of fileArgs) {
    const inputPath = resolve(arg);
    const outputPath = buildOutputPath(inputPath, outputDir);

    try {
        if (existsSync(outputPath)) {
            console.warn(`[${SCRIPT}] Skipping (output exists): ${outputPath}`);
            hadError = true;
            continue;
        }

        const content = readFileSync(inputPath, 'utf8');
        const cleaned = cleanChapter(content);

        writeFileSync(outputPath, cleaned, 'utf8');
        console.log(`[${SCRIPT}] Cleaned: ${inputPath} -> ${outputPath}`);
    } catch (err) {
        console.error(`[${SCRIPT}] Error processing ${inputPath}:`, err);
        hadError = true;
    }
}

if (hadError) {
    process.exit(1);
}
