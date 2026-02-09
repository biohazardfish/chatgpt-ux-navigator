/**
 * Factory function to create a RunLogger instance
 * Based on Ticket 005 — Run Logging & Output Artifacts spec
 */

import {mkdir, writeFile, readFile, stat} from 'fs/promises';
import {join, resolve} from 'path';
import type {AppConfig} from '../config/types';
import type {AgentMessage, JudgeDecision} from '../runner/types';
import type {RunLogger, CreateRunLoggerParams, RunMetadata} from './RunLogger';
import {
    generateRunFolderName,
    generateMessageFilename,
    generateJudgeFilename,
    generateMessageFrontmatter,
    generateTranscriptHeading,
    formatTurnNumber,
} from './RunLogger';

/**
 * Create a RunLogger instance for a new run
 *
 * This function:
 * 1. Generates the run folder name from timestamp and run ID
 * 2. Creates directory structure (out_dir/run_folder/messages and /judge)
 * 3. Writes the exact config.yml verbatim
 * 4. Fails if run folder already exists
 * 5. Returns a RunLogger object ready for use
 *
 * @throws Error if run folder already exists or if directory creation fails
 */
export async function createRunLogger(params: CreateRunLoggerParams): Promise<RunLogger> {
    const {configPath, configText, config, started_at} = params;

    // Generate run folder name
    const runFolderName = generateRunFolderName(started_at, config.run.id);
    const runDir = resolve(join(config.run.out_dir, runFolderName));

    // Ensure out_dir exists
    await mkdir(config.run.out_dir, {recursive: true});

    // Check if run folder already exists using fs.stat
    try {
        await stat(runDir);
        // If stat succeeds, the path exists (file or directory)
        throw new Error(`Run folder already exists: ${runDir}`);
    } catch (error) {
        // Check if it's the "already exists" error we threw
        if (error instanceof Error && error.message.includes('Run folder already exists')) {
            throw error;
        }
        // Otherwise, it's ENOENT (doesn't exist), which is what we want
    }

    // Create run folder structure
    const messagesDir = join(runDir, 'messages');
    const judgeDir = join(runDir, 'judge');

    try {
        await mkdir(messagesDir, {recursive: true});
        await mkdir(judgeDir, {recursive: true});
    } catch (error) {
        // If the run folder already exists, mkdir will fail
        throw new Error(`Run folder already exists: ${runDir}`);
    }

    // Write config.yml verbatim
    const configFilePath = join(runDir, 'config.yml');
    await writeFile(configFilePath, configText, 'utf-8');

    // Create and return the RunLogger instance
    const logger: RunLogger = {
        runDir,

        async writeTurn(msg: AgentMessage, received_turns: number[]): Promise<void> {
            const speaker = config.agents[msg.speaker];
            if (!speaker) {
                throw new Error(`Unknown agent: ${msg.speaker}`);
            }

            // Write message markdown file
            const messageFilename = generateMessageFilename(msg.turn, msg.speaker);
            const messagePath = join(runDir, 'messages', messageFilename);
            const messageTmpPath = `${messagePath}.tmp`;

            const frontmatter = generateMessageFrontmatter({
                turn: msg.turn,
                speaker: msg.speaker,
                client_id: speaker.client_id,
                created_at: msg.created_at,
                received_turns,
            });

            const messageContent = `${frontmatter}\n${msg.content}\n`;

            // Atomic write: write to temp file, then rename
            // Clean up any leftover temp file first
            try {
                await readFile(messageTmpPath);
                // If it exists, remove it
                await writeFile(messageTmpPath, '', 'utf-8');
            } catch {
                // File doesn't exist, which is fine
            }

            await writeFile(messageTmpPath, messageContent, 'utf-8');
            await renameAtomic(messageTmpPath, messagePath, false);

            // Append to transcript.md
            const transcriptPath = join(runDir, 'transcript.md');
            const transcriptHeading = generateTranscriptHeading(msg.turn, msg.speaker);

            let transcriptContent = '';
            try {
                transcriptContent = await readFile(transcriptPath, 'utf-8');
            } catch {
                // File doesn't exist yet
            }

            const transcriptTmpPath = `${transcriptPath}.tmp`;
            const newEntry = `${transcriptHeading}\n${msg.content}\n\n`;
            const updatedTranscript = transcriptContent + newEntry;

            // Clean up temp file
            try {
                await readFile(transcriptTmpPath);
                await writeFile(transcriptTmpPath, '', 'utf-8');
            } catch {
                // File doesn't exist
            }

            await writeFile(transcriptTmpPath, updatedTranscript, 'utf-8');
            // Allow overwriting for transcript (append-only pattern)
            await renameAtomic(transcriptTmpPath, transcriptPath, true);
        },

        async writeJudge(turn: number, decision: JudgeDecision, created_at: string): Promise<void> {
            // Only write if judge is enabled
            if (!config.judge.enabled) {
                return;
            }

            const judgeFilename = generateJudgeFilename(turn);
            const judgePath = join(runDir, 'judge', judgeFilename);
            const judgeTmpPath = `${judgePath}.tmp`;

            // Build judge object with exact key order
            const judgeData = {
                turn,
                created_at,
                should_stop: decision.should_stop,
                scores: decision.scores,
                reason: decision.reason,
            };

            const judgeContent = JSON.stringify(judgeData, null, 2) + '\n';

            // Clean up temp file
            try {
                await readFile(judgeTmpPath);
                await writeFile(judgeTmpPath, '', 'utf-8');
            } catch {
                // File doesn't exist
            }

            await writeFile(judgeTmpPath, judgeContent, 'utf-8');
            await renameAtomic(judgeTmpPath, judgePath, false);
        },

        async finalize(result: {
            stop_reason: 'max_turns' | 'judge_stop';
            total_turns: number;
            started_at: string;
            ended_at: string;
        }): Promise<void> {
            // Build run.json with exact key order (manual construction)
            const agents = config.workflow.order.map(agentId => ({
                id: agentId,
                client_id: config.agents[agentId].client_id,
            }));

            const runMetadata: RunMetadata = {
                run_id: config.run.id,
                started_at: result.started_at,
                ended_at: result.ended_at,
                stop_reason: result.stop_reason,
                total_turns: result.total_turns,
                server: {
                    url: config.server.url,
                },
                agents,
                workflow: {
                    type: 'round_robin',
                    order: config.workflow.order,
                    start: config.workflow.start,
                },
                delivery: {
                    type: 'next_speaker',
                },
                judge: {
                    enabled: config.judge.enabled,
                    client_id: config.judge.client_id || '',
                    eval_every_turn: true,
                },
                termination: {
                    max_turns: config.termination.max_turns,
                    judge_stop: config.termination.judge_stop,
                },
            };

            const runJsonPath = join(runDir, 'run.json');
            const runJsonTmpPath = `${runJsonPath}.tmp`;

            const runJsonContent = JSON.stringify(runMetadata, null, 2) + '\n';

            // Clean up temp file
            try {
                await readFile(runJsonTmpPath);
                await writeFile(runJsonTmpPath, '', 'utf-8');
            } catch {
                // File doesn't exist
            }

            await writeFile(runJsonTmpPath, runJsonContent, 'utf-8');
            await renameAtomic(runJsonTmpPath, runJsonPath, false);
        },
    };

    return logger;
}

/**
 * Atomic rename: throw if target already exists (per spec requirement) unless allowOverwrite is true
 * Spec: "Ensure rename overwrites are not allowed; if target exists, throw."
 *
 * This prevents accidental data loss from duplicate writes to the same file.
 * For transcript.md append-only pattern, allowOverwrite is true to support multiple appends.
 * For message/judge/run files, allowOverwrite is false to enforce single-write semantics.
 */
async function renameAtomic(
    tmpPath: string,
    targetPath: string,
    allowOverwrite: boolean = false
): Promise<void> {
    // Check if target file already exists
    try {
        await stat(targetPath);
        // If stat succeeds, the target file exists
        if (!allowOverwrite) {
            throw new Error(`Target file already exists: ${targetPath}`);
        }
        // If allowOverwrite is true, we proceed with rename (which overwrites)
    } catch (error) {
        // Check if it's the "already exists" error we threw
        if (error instanceof Error && error.message.includes('Target file already exists')) {
            throw error;
        }
        // Otherwise, it's ENOENT (doesn't exist), which is what we want
    }

    const {rename} = await import('fs/promises');
    await rename(tmpPath, targetPath);
}
