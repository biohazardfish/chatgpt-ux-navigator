/**
 * Load run state from an existing run directory for resume
 */

import {readdir, readFile, stat} from 'fs/promises';
import {join} from 'path';
import type {AppConfig} from '../config/types';
import type {AgentMessage, InboxItem, JudgeRecord, ResumeState, RunState} from '../runner/types';

type ParsedSummary = {
    round: number;
    summary: string;
};

export async function loadRunState(
    runDir: string,
    config: AppConfig
): Promise<{
    resume: ResumeState;
    lastCompletedRound: number;
    latestSummary: ParsedSummary | null;
}> {
    await ensureDirectory(runDir);

    const transcript = await loadTranscript(runDir);
    const judgeRecords = await loadJudgeRecords(runDir);

    const {state, round, turnsInRound, roundStartIndex} = rebuildState(
        config,
        transcript,
        judgeRecords
    );

    const agentsPerRound = config.workflow.order.length;
    const lastCompletedRound = Math.floor(transcript.length / agentsPerRound);
    const latestSummary = await loadLatestSummary(runDir);

    return {
        resume: {
            state,
            round,
            turns_in_round: turnsInRound,
            round_start_index: roundStartIndex,
            full_context_inbox: buildFullContextInbox(config, transcript),
        },
        lastCompletedRound,
        latestSummary,
    };
}

async function ensureDirectory(path: string): Promise<void> {
    const info = await stat(path);
    if (!info.isDirectory()) {
        throw new Error(`Run directory is not a folder: ${path}`);
    }
}

async function loadTranscript(runDir: string): Promise<AgentMessage[]> {
    const messagesDir = join(runDir, 'messages');
    const entries = await readdir(messagesDir);
    const messageFiles = entries
        .map(name => {
            const match = name.match(/^(\d{4})_(.+)\.md$/);
            if (!match) return null;
            return {name, turn: Number(match[1]), speaker: match[2]};
        })
        .filter((item): item is {name: string; turn: number; speaker: string} => Boolean(item))
        .sort((a, b) => a.turn - b.turn);

    const transcript: AgentMessage[] = [];

    for (const file of messageFiles) {
        const filePath = join(messagesDir, file.name);
        const text = await readFile(filePath, 'utf-8');
        const parsed = parseMessageFile(text);

        if (parsed.turn !== file.turn) {
            throw new Error(
                `Turn mismatch in ${file.name}: filename ${file.turn}, frontmatter ${parsed.turn}`
            );
        }
        if (parsed.speaker !== file.speaker) {
            throw new Error(
                `Speaker mismatch in ${file.name}: filename ${file.speaker}, frontmatter ${parsed.speaker}`
            );
        }

        transcript.push({
            turn: parsed.turn,
            speaker: parsed.speaker,
            content: parsed.content,
            created_at: parsed.created_at,
        });
    }

    for (let i = 0; i < transcript.length; i++) {
        const expectedTurn = i + 1;
        if (transcript[i].turn !== expectedTurn) {
            throw new Error(`Missing turn ${expectedTurn} in messages directory`);
        }
    }

    return transcript;
}

function parseMessageFile(text: string): {
    turn: number;
    speaker: string;
    created_at: string;
    content: string;
} {
    const match = text.match(/^---\n([\s\S]*?)\n---\n/);
    if (!match) {
        throw new Error('Missing frontmatter in message file');
    }

    const frontmatter = match[1];
    const bodyStart = match[0].length;
    let content = text.slice(bodyStart);
    if (content.startsWith('\n')) {
        content = content.slice(1);
    }
    content = content.replace(/\n$/, '');

    const lines = frontmatter.split('\n');
    let turn: number | null = null;
    let speaker: string | null = null;
    let created_at: string | null = null;

    for (const line of lines) {
        const [key, ...rest] = line.split(':');
        if (!key || rest.length === 0) continue;
        const value = rest.join(':').trim();
        if (key === 'turn') {
            turn = Number(value);
        } else if (key === 'speaker') {
            speaker = value;
        } else if (key === 'created_at') {
            created_at = value;
        }
    }

    if (!turn || !speaker || !created_at) {
        throw new Error('Missing required frontmatter fields');
    }

    return {turn, speaker, created_at, content};
}

async function loadJudgeRecords(runDir: string): Promise<JudgeRecord[]> {
    const judgeDir = join(runDir, 'judge');
    let entries: string[] = [];
    try {
        entries = await readdir(judgeDir);
    } catch {
        return [];
    }

    const files = entries
        .map(name => {
            const match = name.match(/^(\d{4})\.json$/);
            if (!match) return null;
            return {name, turn: Number(match[1])};
        })
        .filter((item): item is {name: string; turn: number} => Boolean(item))
        .sort((a, b) => a.turn - b.turn);

    const records: JudgeRecord[] = [];
    for (const file of files) {
        const filePath = join(judgeDir, file.name);
        const text = await readFile(filePath, 'utf-8');
        const data = JSON.parse(text) as {
            turn: number;
            created_at: string;
            should_stop: boolean;
            scores: Record<string, number>;
            reason: string;
        };

        records.push({
            turn: data.turn,
            created_at: data.created_at,
            decision: {
                should_stop: data.should_stop,
                scores: data.scores,
                reason: data.reason,
            },
        });
    }

    return records;
}

function rebuildState(
    config: AppConfig,
    transcript: AgentMessage[],
    judgeRecords: JudgeRecord[]
): {
    state: RunState;
    round: number;
    turnsInRound: number;
    roundStartIndex: number;
} {
    const pending: Record<string, InboxItem[]> = {};
    for (const agent of config.workflow.order) {
        pending[agent] = [];
    }

    for (const agent of config.workflow.order) {
        pending[agent].push({
            turn: 0,
            from: 'user',
            content: config.seed.content,
        });
    }

    for (const message of transcript) {
        pending[message.speaker] = [];
        for (const agentId of config.workflow.order) {
            if (agentId === message.speaker) continue;
            pending[agentId].push({
                turn: message.turn,
                from: message.speaker,
                content: message.content,
            });
        }
    }

    let turn = 1;
    let speaker_idx = config.workflow.order.indexOf(config.workflow.start);

    if (transcript.length > 0) {
        const last = transcript[transcript.length - 1];
        const lastIdx = config.workflow.order.indexOf(last.speaker);
        if (lastIdx === -1) {
            throw new Error(`Unknown speaker in transcript: ${last.speaker}`);
        }
        speaker_idx = (lastIdx + 1) % config.workflow.order.length;
        turn = transcript.length + 1;
    }

    const agentsPerRound = config.workflow.order.length;
    const completedRounds = Math.floor(transcript.length / agentsPerRound);
    const round = completedRounds + 1;
    const turnsInRound = transcript.length - completedRounds * agentsPerRound;
    const roundStartIndex = completedRounds * agentsPerRound;

    return {
        state: {
            turn,
            speaker_idx,
            pending,
            transcript: [...transcript],
            judge_records: [...judgeRecords],
        },
        round,
        turnsInRound,
        roundStartIndex,
    };
}

function buildFullContextInbox(config: AppConfig, transcript: AgentMessage[]): InboxItem[] {
    const inbox: InboxItem[] = [
        {
            turn: 0,
            from: 'user',
            content: config.seed.content,
        },
    ];

    for (const message of transcript) {
        inbox.push({
            turn: message.turn,
            from: message.speaker,
            content: message.content,
        });
    }

    return inbox;
}

async function loadLatestSummary(runDir: string): Promise<ParsedSummary | null> {
    const judgeDir = join(runDir, 'judge');
    let entries: string[] = [];
    try {
        entries = await readdir(judgeDir);
    } catch {
        return null;
    }

    const summaries = entries
        .map(name => {
            const match = name.match(/^(\d{4})_summary\.yaml$/);
            if (!match) return null;
            return {name, round: Number(match[1])};
        })
        .filter((item): item is {name: string; round: number} => Boolean(item))
        .sort((a, b) => a.round - b.round);

    if (summaries.length === 0) {
        return null;
    }

    const latest = summaries[summaries.length - 1];
    const filePath = join(judgeDir, latest.name);
    const text = await readFile(filePath, 'utf-8');

    return {
        round: latest.round,
        summary: parseSummaryYaml(text),
    };
}

function parseSummaryYaml(text: string): string {
    const lines = text.split('\n');
    const summaryIndex = lines.findIndex(line => line.startsWith('rolling_summary: |'));
    if (summaryIndex === -1) {
        return '';
    }

    const summaryLines = lines.slice(summaryIndex + 1).map(line => {
        if (line.startsWith('  ')) {
            return line.slice(2);
        }
        return line;
    });

    return summaryLines.join('\n').trimEnd();
}
