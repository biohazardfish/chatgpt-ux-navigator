#!/usr/bin/env bun

import {existsSync, mkdirSync, readdirSync} from 'node:fs';
import {basename, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const SCRIPT = 'writer-cli';
const ORCHESTRATOR_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));

const SUBCOMMANDS = new Set([
    'clean',
    'story-summary',
    'image-prompt-chapters',
    'image-precondition',
    'image-gen-chapters',
]);

type ParsedArgs = {
    command: string | null;
    runDir: string | null;
    showHelp: boolean;
};

function usage(): string {
    return [
        'Usage: bun run writer-cli <command> --run <run_folder_path>',
        '',
        'Commands:',
        '  clean                  Clean messages/*_writer_senior.md -> processed/*_writer_senior_out.md',
        '  story-summary          Generate story-summary.txt from cleaned chapters',
        '  image-prompt-chapters  Generate *_with_image_prompt.md from cleaned chapters',
        '  image-precondition     Generate image-gen-precondition.md from prompted chapters',
        '  image-gen-chapters     Generate chapter images and inject markdown image markers',
        '',
        'Examples:',
        '  bun run writer-cli clean --run ./runs/2026-02-13T17-09-22Z_vn-cyber-longstory',
        '  bun run writer-cli story-summary --run ./runs/2026-02-13T17-09-22Z_vn-cyber-longstory',
        '  bun run writer-cli image-prompt-chapters --run ./runs/2026-02-13T17-09-22Z_vn-cyber-longstory',
        '  bun run writer-cli image-precondition --run ./runs/2026-02-13T17-09-22Z_vn-cyber-longstory',
        '  bun run writer-cli image-gen-chapters --run ./runs/2026-02-13T17-09-22Z_vn-cyber-longstory',
    ].join('\n');
}

function parseArgs(argv: string[]): ParsedArgs {
    let command: string | null = null;
    let runDir: string | null = null;
    let showHelp = false;

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];

        if (arg === '--help' || arg === '-h') {
            showHelp = true;
            continue;
        }

        if (arg === '--run') {
            const next = argv[i + 1];
            if (!next || next.startsWith('-')) {
                throw new Error('Missing value for --run');
            }
            runDir = next;
            i += 1;
            continue;
        }

        if (arg.startsWith('--run=')) {
            const value = arg.slice('--run='.length).trim();
            if (!value) {
                throw new Error('Missing value for --run');
            }
            runDir = value;
            continue;
        }

        if (arg.startsWith('-')) {
            throw new Error(`Unknown option: ${arg}`);
        }

        if (command) {
            throw new Error(`Unexpected argument: ${arg}`);
        }

        command = arg;
    }

    return {command, runDir, showHelp};
}

function listFilesMatching(dir: string, matcher: (name: string) => boolean): string[] {
    const names = readdirSync(dir, {withFileTypes: true})
        .filter(entry => entry.isFile() && matcher(entry.name))
        .map(entry => entry.name)
        .sort((a, b) => a.localeCompare(b));

    return names.map(name => join(dir, name));
}

function writerSeniorOutPathFor(cleanInputPath: string, processedDir: string): string {
    const inputName = basename(cleanInputPath);
    const withoutExt = inputName.replace(/\.md$/i, '');
    return join(processedDir, `${withoutExt}_out.md`);
}

function isWriterSeniorOutFile(fileName: string): boolean {
    return /_writer_senior_out\.md$/i.test(fileName);
}

function isWriterSeniorOutPromptedFile(fileName: string): boolean {
    return /_writer_senior_out_with_image_prompt\.md$/i.test(fileName);
}

function promptedPathFor(cleanedFilePath: string): string {
    return cleanedFilePath.replace(/\.md$/i, '_with_image_prompt.md');
}

type PromptBlock = {
    start: number;
};

function extractPromptBlocks(markdown: string): PromptBlock[] {
    const re = /```image_prompt[ \t]*\r?\n([\s\S]*?)\r?\n```/g;
    const blocks: PromptBlock[] = [];

    let match: RegExpExecArray | null;
    while ((match = re.exec(markdown)) !== null) {
        const prompt = (match[1] ?? '').trim();
        if (prompt.length > 0) {
            blocks.push({start: match.index});
        }
    }

    return blocks;
}

function hasImageMarkerBefore(markdown: string, start: number): boolean {
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

async function chapterHasPendingImagePrompts(filePath: string): Promise<boolean> {
    const markdown = await Bun.file(filePath).text();
    const blocks = extractPromptBlocks(markdown);
    return blocks.some(block => !hasImageMarkerBefore(markdown, block.start));
}

function assertRunLayout(runDir: string): {
    runDir: string;
    messagesDir: string;
    processedDir: string;
    imagesDir: string;
    storySummaryPath: string;
    preconditionPath: string;
} {
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

async function runBunScript(scriptName: string, args: string[]): Promise<void> {
    const proc = Bun.spawn(['bun', join('scripts', scriptName), ...args], {
        cwd: ORCHESTRATOR_DIR,
        stdout: 'inherit',
        stderr: 'inherit',
    });

    const code = await proc.exited;

    if (code !== 0) {
        throw new Error(`${scriptName} failed with exit code ${code}`);
    }
}

async function runClean(runDir: string): Promise<void> {
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

    console.log(`[${SCRIPT}] Run: ${paths.runDir}`);
    console.log(`[${SCRIPT}] Found ${inputs.length} writer senior file(s)`);

    if (existingOutputs.length > 0) {
        console.log(`[${SCRIPT}] Skipping ${existingOutputs.length} file(s) because cleaned output already exists`);
    }

    if (pendingInputs.length === 0) {
        console.log(`[${SCRIPT}] Nothing to clean`);
        return;
    }

    await runBunScript('clean-chapter.ts', ['--output-dir', paths.processedDir, ...pendingInputs]);
}

async function runImagePromptChapters(runDir: string): Promise<void> {
    const paths = assertRunLayout(runDir);
    const cleanedFiles = listFilesMatching(paths.processedDir, isWriterSeniorOutFile);

    if (cleanedFiles.length === 0) {
        throw new Error(`No cleaned chapter files found in ${paths.processedDir}`);
    }

    const existingPrompted: string[] = [];
    const pendingPrompted = cleanedFiles.filter(file => {
        const promptedPath = promptedPathFor(file);
        if (existsSync(promptedPath)) {
            existingPrompted.push(promptedPath);
            return false;
        }
        return true;
    });

    console.log(`[${SCRIPT}] Run: ${paths.runDir}`);
    console.log(`[${SCRIPT}] Found ${cleanedFiles.length} cleaned chapter file(s)`);

    if (existingPrompted.length > 0) {
        console.log(
            `[${SCRIPT}] Skipping ${existingPrompted.length} file(s) because prompted output already exists`
        );
    }

    if (pendingPrompted.length === 0) {
        console.log(`[${SCRIPT}] Nothing to prompt`);
        return;
    }

    await runBunScript('image-prompter.ts', pendingPrompted);
}

async function runStorySummary(runDir: string): Promise<void> {
    const paths = assertRunLayout(runDir);

    if (existsSync(paths.storySummaryPath)) {
        const existing = (await Bun.file(paths.storySummaryPath).text()).trim();
        if (existing) {
            console.log(`[${SCRIPT}] Run: ${paths.runDir}`);
            console.log(`[${SCRIPT}] Story summary already exists at ${paths.storySummaryPath}`);
            console.log(`[${SCRIPT}] Nothing to do`);
            return;
        }
    }

    const cleanedFiles = listFilesMatching(paths.processedDir, isWriterSeniorOutFile);

    if (cleanedFiles.length === 0) {
        throw new Error(`No cleaned chapter files found in ${paths.processedDir}`);
    }

    console.log(`[${SCRIPT}] Run: ${paths.runDir}`);
    console.log(`[${SCRIPT}] Generating story summary from ${cleanedFiles.length} cleaned chapter file(s)`);

    const proc = Bun.spawn(['bun', join('scripts', 'story-summary.ts'), ...cleanedFiles], {
        cwd: ORCHESTRATOR_DIR,
        stdout: 'pipe',
        stderr: 'inherit',
    });

    const outputText = await new Response(proc.stdout).text();
    const code = await proc.exited;

    if (code !== 0) {
        throw new Error(`story-summary.ts failed with exit code ${code}`);
    }

    await Bun.write(paths.storySummaryPath, outputText.trimEnd() + '\n');
    console.log(`[${SCRIPT}] Wrote ${paths.storySummaryPath}`);
}

async function runImagePrecondition(runDir: string): Promise<void> {
    const paths = assertRunLayout(runDir);

    if (existsSync(paths.preconditionPath)) {
        const existing = (await Bun.file(paths.preconditionPath).text()).trim();
        if (existing) {
            console.log(`[${SCRIPT}] Run: ${paths.runDir}`);
            console.log(`[${SCRIPT}] Precondition already exists at ${paths.preconditionPath}`);
            console.log(`[${SCRIPT}] Nothing to do`);
            return;
        }
    }

    const promptedFiles = listFilesMatching(paths.processedDir, isWriterSeniorOutPromptedFile);

    if (promptedFiles.length === 0) {
        throw new Error(`No prompted chapter files found in ${paths.processedDir}`);
    }

    console.log(`[${SCRIPT}] Run: ${paths.runDir}`);
    console.log(`[${SCRIPT}] Generating precondition from ${promptedFiles.length} prompted chapter file(s)`);

    const proc = Bun.spawn(['bun', join('scripts', 'image-gen-precondition.ts'), ...promptedFiles], {
        cwd: ORCHESTRATOR_DIR,
        stdout: 'pipe',
        stderr: 'inherit',
    });

    const outputText = await new Response(proc.stdout).text();
    const code = await proc.exited;

    if (code !== 0) {
        throw new Error(`image-gen-precondition.ts failed with exit code ${code}`);
    }

    await Bun.write(paths.preconditionPath, outputText.trimEnd() + '\n');
    console.log(`[${SCRIPT}] Wrote ${paths.preconditionPath}`);
}

async function runImageGenChapters(runDir: string): Promise<void> {
    const paths = assertRunLayout(runDir);
    const promptedFiles = listFilesMatching(paths.processedDir, isWriterSeniorOutPromptedFile);

    if (promptedFiles.length === 0) {
        throw new Error(`No prompted chapter files found in ${paths.processedDir}`);
    }

    if (!existsSync(paths.preconditionPath)) {
        throw new Error(`Missing precondition file: ${paths.preconditionPath}`);
    }

    const preconditionBody = (await Bun.file(paths.preconditionPath).text()).trim();
    if (!preconditionBody) {
        throw new Error(`Precondition file is empty: ${paths.preconditionPath}`);
    }

    const pendingStates = await Promise.all(
        promptedFiles.map(async file => ({
            file,
            hasPending: await chapterHasPendingImagePrompts(file),
        }))
    );
    const filesWithPendingPrompts = pendingStates.filter(item => item.hasPending).map(item => item.file);

    if (filesWithPendingPrompts.length === 0) {
        console.log(`[${SCRIPT}] Run: ${paths.runDir}`);
        console.log(`[${SCRIPT}] No pending image prompts found`);
        console.log(`[${SCRIPT}] Nothing to generate`);
        return;
    }

    console.log(`[${SCRIPT}] Run: ${paths.runDir}`);
    console.log(
        `[${SCRIPT}] Generating images for ${filesWithPendingPrompts.length} chapter file(s) with pending prompts`
    );

    await runBunScript('image-gen-by-chapter.ts', [
        '--precondition',
        paths.preconditionPath,
        '--output-dir',
        paths.imagesDir,
        ...filesWithPendingPrompts,
    ]);
}

async function main(): Promise<void> {
    const {command, runDir, showHelp} = parseArgs(process.argv.slice(2));

    if (showHelp) {
        console.log(usage());
        process.exit(0);
    }

    if (!command || !SUBCOMMANDS.has(command)) {
        console.error(`[${SCRIPT}] Missing or invalid command`);
        console.error(usage());
        process.exit(1);
    }

    if (!runDir) {
        console.error(`[${SCRIPT}] Missing --run <run_folder_path>`);
        console.error(usage());
        process.exit(1);
    }

    if (command === 'clean') {
        await runClean(runDir);
        return;
    }

    if (command === 'image-prompt-chapters') {
        await runImagePromptChapters(runDir);
        return;
    }

    if (command === 'story-summary') {
        await runStorySummary(runDir);
        return;
    }

    if (command === 'image-precondition') {
        await runImagePrecondition(runDir);
        return;
    }

    await runImageGenChapters(runDir);
}

main().catch(err => {
    console.error(`[${SCRIPT}] ${err?.stack ?? String(err)}`);
    process.exit(1);
});
