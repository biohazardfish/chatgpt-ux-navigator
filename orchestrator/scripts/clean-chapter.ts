#!/usr/bin/env bun
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, dirname, extname, join, resolve} from 'node:path';

const SCRIPT = 'clean-chapter';

function cleanChapter(content: string): string {
    let output = content;

    output = output.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');

    output = output.replace(/\n?###\s+Continuity\s*&\s*Next\s*Hooks[\s\S]*$/i, '');

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
