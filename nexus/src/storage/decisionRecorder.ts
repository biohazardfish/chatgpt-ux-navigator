import {join} from 'node:path';
import {rename} from 'node:fs/promises';
import {Config} from '../config/config.ts';
import {DECISIONS_DIR, META_FILE, getDateString, getIsoTimestamp} from './layout.ts';
import {getNextSequenceId} from './ids.ts';
import {ensureDir} from '../fs/ensureDirs.ts';
import {isPathInsideRoot} from '../fs/paths.ts';
import type {Decision, DecisionInput} from '../core/domain/decision.ts';
import type {ProjectMeta} from './project.ts';

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

export class DecisionRecordingError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DecisionRecordingError';
    }
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

function validateDecisionInput(input: DecisionInput): void {
    if (!input.projectId || typeof input.projectId !== 'string') {
        throw new DecisionRecordingError('projectId is required and must be a non-empty string');
    }

    if (!input.title || typeof input.title !== 'string') {
        throw new DecisionRecordingError('title is required and must be a non-empty string');
    }

    if (!input.context || typeof input.context !== 'string') {
        throw new DecisionRecordingError('context is required and must be a non-empty string');
    }

    if (!Array.isArray(input.options) || input.options.length === 0) {
        throw new DecisionRecordingError('options must be a non-empty array');
    }

    for (let i = 0; i < input.options.length; i++) {
        if (typeof input.options[i] !== 'string' || input.options[i].trim() === '') {
            throw new DecisionRecordingError(`options[${i}] must be a non-empty string`);
        }
    }

    if (!input.decision || typeof input.decision !== 'string') {
        throw new DecisionRecordingError('decision is required and must be a non-empty string');
    }

    if (!input.rationale || typeof input.rationale !== 'string') {
        throw new DecisionRecordingError('rationale is required and must be a non-empty string');
    }

    if (!Array.isArray(input.consequences) || input.consequences.length === 0) {
        throw new DecisionRecordingError('consequences must be a non-empty array');
    }

    for (let i = 0; i < input.consequences.length; i++) {
        if (typeof input.consequences[i] !== 'string' || input.consequences[i].trim() === '') {
            throw new DecisionRecordingError(`consequences[${i}] must be a non-empty string`);
        }
    }
}

// -----------------------------------------------------------------------------
// Slug generation
// -----------------------------------------------------------------------------

function buildSlug(input: DecisionInput): string {
    const base = input.taskId ? `task-${input.taskId}` : input.title;
    return base
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

// -----------------------------------------------------------------------------
// Markdown rendering
// -----------------------------------------------------------------------------

function renderDecisionMarkdown(id: number, input: DecisionInput, date: string): string {
    const optionsList = input.options.map((o) => `- ${o}`).join('\n');
    const consequencesList = input.consequences.map((c) => `- ${c}`).join('\n');

    return `# Decision ${String(id).padStart(3, '0')} — ${input.title}

## Date

${date}

## Context

${input.context}

## Options Considered

${optionsList}

## Decision

${input.decision}

## Rationale

${input.rationale}

## Consequences

${consequencesList}
`;
}

// -----------------------------------------------------------------------------
// Metadata update
// -----------------------------------------------------------------------------

async function updateProjectMetaTimestamp(
    projectDir: string,
    projectsDir: string
): Promise<void> {
    const metaFilePath = join(projectDir, META_FILE);

    if (!isPathInsideRoot(metaFilePath, projectsDir)) {
        throw new DecisionRecordingError(
            `Meta file path is outside projects root: ${metaFilePath}`
        );
    }

    const metaFile = Bun.file(metaFilePath);
    if (!(await metaFile.exists())) {
        throw new DecisionRecordingError(
            `Project meta.json does not exist: ${metaFilePath}`
        );
    }

    const metaText = await metaFile.text();
    const meta: ProjectMeta = JSON.parse(metaText);
    meta.lastUpdatedAt = getIsoTimestamp();

    await Bun.write(metaFilePath, JSON.stringify(meta, null, 2));
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Record a decision as an immutable markdown file.
 *
 * - Assigns the next sequential ID
 * - Writes the decision file atomically (temp file + rename)
 * - Updates project meta.json lastUpdatedAt
 * - Returns the parsed Decision
 *
 * @throws {DecisionRecordingError} on validation failure, collision, or write error
 */
export async function recordDecision(config: Config, input: DecisionInput): Promise<Decision> {
    validateDecisionInput(input);

    const projectDir = join(config.projectsDir, input.projectId);

    if (!isPathInsideRoot(projectDir, config.projectsDir)) {
        throw new DecisionRecordingError(
            `Project directory is outside projects root: ${projectDir}`
        );
    }

    const decisionsDir = join(projectDir, DECISIONS_DIR);
    await ensureDir(decisionsDir);

    // Determine next sequential ID
    const seqId = await getNextSequenceId(decisionsDir, '');
    const numericId = parseInt(seqId, 10);

    // Build filename
    const slug = buildSlug(input);
    const filename = `${seqId}-${slug}.md`;
    const filePath = join(decisionsDir, filename);

    // Collision detection — never overwrite
    const existingFile = Bun.file(filePath);
    if (await existingFile.exists()) {
        throw new DecisionRecordingError(
            `Decision file already exists at computed path: ${filePath}`
        );
    }

    // Render markdown
    const date = getDateString();
    const markdown = renderDecisionMarkdown(numericId, input, date);

    // Atomic write: temp file then rename
    const tempPath = join(decisionsDir, `.tmp-${seqId}-${Date.now()}.md`);
    await Bun.write(tempPath, markdown);

    try {
        await rename(tempPath, filePath);
    } catch (renameError) {
        // Clean up temp file on failure
        try {
            const tempFile = Bun.file(tempPath);
            if (await tempFile.exists()) {
                await Bun.write(tempPath, '');
                const {unlink} = await import('node:fs/promises');
                await unlink(tempPath);
            }
        } catch {
            // Best effort cleanup
        }
        throw new DecisionRecordingError(
            `Failed to atomically write decision file: ${renameError instanceof Error ? renameError.message : String(renameError)}`
        );
    }

    // Update project metadata
    await updateProjectMetaTimestamp(projectDir, config.projectsDir);

    // Return parsed decision
    const decision: Decision = {
        id: numericId,
        title: input.title,
        date,
        context: input.context,
        options: input.options,
        decision: input.decision,
        rationale: input.rationale,
        consequences: input.consequences,
    };

    return decision;
}
