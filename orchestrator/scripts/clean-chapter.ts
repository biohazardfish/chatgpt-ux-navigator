#!/usr/bin/env bun
import {readFileSync, writeFileSync, existsSync} from 'fs';
import {resolve, dirname, basename, extname, join} from 'path';

/**
 * Removes:
 * 1. YAML frontmatter block (--- ... --- at top of file)
 * 2. "### Continuity & Next Hooks" section through EOF
 */
function cleanChapter(content: string): string {
    let output = content;

    // 1. Remove YAML frontmatter (only if at top)
    output = output.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');

    // 2. Remove "Continuity & Next Hooks" section to EOF
    output = output.replace(/\n?###\s+Continuity\s*&\s*Next\s*Hooks[\s\S]*$/i, '');

    return output.trim() + '\n';
}

/**
 * Generates output path with `_out` suffix.
 * Example:
 *   chapter.md -> chapter_out.md
 */
function buildOutputPath(inputPath: string): string {
    const dir = dirname(inputPath);
    const ext = extname(inputPath);
    const base = basename(inputPath, ext);

    return join(dir, `${base}_out${ext}`);
}

// --------------------------------------------------
// CLI
// --------------------------------------------------

const inputArgs = process.argv.slice(2);

if (inputArgs.length === 0) {
    console.error('Usage: bun clean-chapter.ts <file1.md> <file2.md> ...');
    process.exit(1);
}

let hadError = false;

for (const arg of inputArgs) {
    const inputPath = resolve(arg);
    const outputPath = buildOutputPath(inputPath);

    try {
        if (existsSync(outputPath)) {
            console.error(`⚠ Skipping (output exists): ${outputPath}`);
            hadError = true;
            continue;
        }

        const content = readFileSync(inputPath, 'utf8');
        const cleaned = cleanChapter(content);

        writeFileSync(outputPath, cleaned, 'utf8');
        console.log(`✔ Cleaned: ${inputPath} -> ${outputPath}`);
    } catch (err) {
        console.error(`✖ Error processing ${inputPath}:`, err);
        hadError = true;
    }
}

if (hadError) {
    process.exit(1);
}
