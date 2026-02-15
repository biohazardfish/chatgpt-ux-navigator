import {existsSync, mkdirSync} from 'node:fs';
import {dirname, extname, isAbsolute, join, relative, resolve} from 'node:path';
import type {ImagePromptBlock, SimplePromptBlock} from '../types';

export function extractPromptBlocks(markdown: string): SimplePromptBlock[] {
    const re = /```image_prompt[ \t]*\r?\n([\s\S]*?)\r?\n```/g;
    const blocks: SimplePromptBlock[] = [];
    let match: RegExpExecArray | null;

    while ((match = re.exec(markdown)) !== null) {
        const prompt = (match[1] ?? '').trim();
        if (prompt.length > 0) {
            blocks.push({start: match.index});
        }
    }

    return blocks;
}

export function extractImagePromptBlocks(markdown: string): ImagePromptBlock[] {
    const re = /```image_prompt[ \t]*\r?\n([\s\S]*?)\r?\n```/g;
    const blocks: ImagePromptBlock[] = [];
    let promptIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = re.exec(markdown)) !== null) {
        const prompt = (match[1] ?? '').trim();
        if (prompt.length > 0) {
            promptIndex += 1;
            blocks.push({
                prompt,
                start: match.index,
                end: re.lastIndex,
                index: promptIndex,
            });
        }
    }

    return blocks;
}

export function hasImageMarkerBefore(markdown: string, start: number): boolean {
    if (start <= 0) {
        return false;
    }

    let i = start - 1;
    while (i >= 0 && /\s/.test(markdown[i])) {
        i -= 1;
    }
    if (i < 0) {
        return false;
    }

    const lineStart = markdown.lastIndexOf('\n', i) + 1;
    const line = markdown.slice(lineStart, i + 1).trim();

    return /^!?\[Image\s+\d+\]\(.+\)$/.test(line);
}

export async function chapterHasPendingImagePrompts(filePath: string): Promise<boolean> {
    const markdown = await Bun.file(filePath).text();
    const blocks = extractPromptBlocks(markdown);
    return blocks.some(block => !hasImageMarkerBefore(markdown, block.start));
}

export function insertImageMarkerBeforeBlock(
    markdown: string,
    block: ImagePromptBlock,
    imagePath: string
): string {
    let prefix = markdown.slice(0, block.start);
    const suffix = markdown.slice(block.start);

    if (prefix.length > 0 && !prefix.endsWith('\n')) {
        prefix += '\n';
    }

    const marker = `![Image ${block.index}](${imagePath})\n\n`;
    return `${prefix}${marker}${suffix}`;
}

export function normalizeMarkdownPath(filePath: string): string {
    return filePath.replace(/\\/g, '/');
}

export function padIndex(index: number): string {
    return String(index).padStart(3, '0');
}

export function extractChapterIndex(markdown: string): number | null {
    const chapterMatch = markdown.match(/\bCHAPTER\s+(\d+)\s*\/\s*\d+\s*:/i);
    if (!chapterMatch) {
        return null;
    }

    const chapterIndex = Number.parseInt(chapterMatch[1] ?? '', 10);
    return Number.isFinite(chapterIndex) && chapterIndex > 0 ? chapterIndex : null;
}

export async function copyImageToImagesDir(
    imagePath: string,
    imagesDir: string,
    markdownFile: string,
    chapterIndex: number,
    imageIndex: number
): Promise<{copiedPath: string; markerPath: string}> {
    if (/^https?:\/\//i.test(imagePath)) {
        throw new Error(`Cannot copy remote URL image path: ${imagePath}`);
    }

    const sourcePath = isAbsolute(imagePath) ? imagePath : resolve(process.cwd(), imagePath);
    if (!existsSync(sourcePath)) {
        throw new Error(`Generated image file not found: ${sourcePath}`);
    }

    mkdirSync(imagesDir, {recursive: true});

    const extension = extname(sourcePath);
    const targetFileName = `chapter_${padIndex(chapterIndex)}_image_${padIndex(imageIndex)}${extension}`;
    const targetPath = join(imagesDir, targetFileName);
    await Bun.write(targetPath, Bun.file(sourcePath));

    const markdownDir = dirname(resolve(process.cwd(), markdownFile));
    const relativePath = relative(markdownDir, targetPath);
    const markerPath = normalizeMarkdownPath(relativePath);

    return {copiedPath: targetPath, markerPath};
}

export function normalizeHeadingText(value: string): string {
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

export function isContinuityHeading(title: string): boolean {
    const normalized = normalizeHeadingText(title);
    return /^continuity(?:\s+and)?\s+next\s+hooks?$/.test(normalized);
}

export function extractHeadingTitle(lines: string[], index: number): string | null {
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

export function stripContinuitySection(content: string): string {
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i += 1) {
        const title = extractHeadingTitle(lines, i);
        if (title && isContinuityHeading(title)) {
            return lines.slice(0, i).join('\n');
        }
    }

    return content;
}

export function normalizeChapterTitle(line: string): string | null {
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

    const normalized = text
        .replace(/^chapter\b/i, 'CHAPTER')
        .replace(/\s+/g, ' ')
        .trim();
    return normalized || null;
}

export function normalizeChapterHeadings(content: string): string {
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

export function cleanChapter(content: string): string {
    let output = content;
    output = output.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
    output = stripContinuitySection(output);
    output = normalizeChapterHeadings(output);
    return output.trim() + '\n';
}

export function stripImagePromptBlocks(content: string): string {
    return content.replace(/\n?```image_prompt[ \t]*\r?\n[\s\S]*?\r?\n```[ \t]*\n?/g, '\n\n');
}

export function normalizeOutput(content: string): string {
    const withoutPromptBlocks = stripImagePromptBlocks(content);
    return withoutPromptBlocks.trim() + '\n';
}
