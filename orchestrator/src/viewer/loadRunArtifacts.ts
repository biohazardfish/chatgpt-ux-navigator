import {readdir, readFile, stat} from 'fs/promises';
import {join, resolve} from 'path';

type ParsedMessageFrontmatter = {
    turn: number;
    speaker: string;
    client_id: string;
    created_at: string;
    received_turns: number[];
};

export type ViewerMessage = {
    turn: number;
    speaker: string;
    client_id: string;
    created_at: string;
    received_turns: number[];
    markdown: string;
    html: string;
    filename: string;
};

export type ViewerJudgeRecord = {
    turn: number;
    created_at: string;
    should_stop: boolean;
    scores: Record<string, number>;
    reason: string;
    summary?: {
        round: number;
        created_at?: string;
        rolling_summary: string;
    };
};

export type ViewerLogEvent = {
    timestamp: string;
    level: string;
    category: string;
    event: string;
    data?: Record<string, unknown>;
    error?: string;
};

export type ViewerRunArtifacts = {
    run_dir: string;
    run: unknown;
    transcript: {
        markdown: string;
        html: string;
    };
    messages: ViewerMessage[];
    judge: ViewerJudgeRecord[];
    logs: ViewerLogEvent[];
};

export async function loadRunArtifacts(runDirInput: string): Promise<ViewerRunArtifacts> {
    const runDir = resolve(runDirInput);
    await validateRunDirectory(runDir);

    const runJsonPath = join(runDir, 'run.json');
    const transcriptPath = join(runDir, 'transcript.md');

    const run = JSON.parse(await readFile(runJsonPath, 'utf-8'));

    const transcriptMarkdown = await readTextFileOrEmpty(transcriptPath);
    const transcriptHtml = Bun.markdown.html(transcriptMarkdown);

    const [messages, judge, logs] = await Promise.all([
        loadMessages(runDir),
        loadJudgeRecords(runDir),
        loadLogs(runDir),
    ]);

    return {
        run_dir: runDir,
        run,
        transcript: {
            markdown: transcriptMarkdown,
            html: transcriptHtml,
        },
        messages,
        judge,
        logs,
    };
}

async function validateRunDirectory(runDir: string): Promise<void> {
    const dirStat = await stat(runDir);
    if (!dirStat.isDirectory()) {
        throw new Error(`Run path is not a directory: ${runDir}`);
    }

    const runJsonPath = join(runDir, 'run.json');
    let runStat;
    try {
        runStat = await stat(runJsonPath);
    } catch {
        throw new Error(`Missing run.json in run directory: ${runDir}`);
    }
    if (!runStat.isFile()) {
        throw new Error(`Missing run.json in run directory: ${runDir}`);
    }
}

async function loadMessages(runDir: string): Promise<ViewerMessage[]> {
    const messagesDir = join(runDir, 'messages');
    const entries = await readdir(messagesDir);

    const messageFiles = entries
        .map(name => {
            const match = name.match(/^(\d{4})_(.+)\.md$/);
            if (!match) {
                return null;
            }
            return {
                filename: name,
                turn: Number(match[1]),
            };
        })
        .filter((entry): entry is {filename: string; turn: number} => Boolean(entry))
        .sort((a, b) => a.turn - b.turn);

    const output: ViewerMessage[] = [];
    for (const file of messageFiles) {
        const path = join(messagesDir, file.filename);
        const text = await readFile(path, 'utf-8');
        const parsed = parseMessageFile(text);

        output.push({
            turn: parsed.frontmatter.turn,
            speaker: parsed.frontmatter.speaker,
            client_id: parsed.frontmatter.client_id,
            created_at: parsed.frontmatter.created_at,
            received_turns: parsed.frontmatter.received_turns,
            markdown: parsed.markdown,
            html: Bun.markdown.html(parsed.markdown),
            filename: file.filename,
        });
    }

    return output;
}

function parseMessageFile(text: string): {
    frontmatter: ParsedMessageFrontmatter;
    markdown: string;
} {
    const match = text.match(/^---\n([\s\S]*?)\n---\n/);
    if (!match) {
        throw new Error('Message file is missing frontmatter block');
    }

    const frontmatterText = match[1];
    const frontmatter = parseFrontmatter(frontmatterText);

    const bodyStart = match[0].length;
    let markdown = text.slice(bodyStart);
    if (markdown.startsWith('\n')) {
        markdown = markdown.slice(1);
    }
    markdown = markdown.replace(/\n$/, '');

    return {frontmatter, markdown};
}

function parseFrontmatter(frontmatterText: string): ParsedMessageFrontmatter {
    let turn = 0;
    let speaker = '';
    let client_id = '';
    let created_at = '';
    let received_turns: number[] = [];

    const lines = frontmatterText.split('\n');
    for (const line of lines) {
        const [key, ...rest] = line.split(':');
        if (!key || rest.length === 0) {
            continue;
        }

        const value = rest.join(':').trim();
        if (key === 'turn') {
            turn = Number(value);
        } else if (key === 'speaker') {
            speaker = value;
        } else if (key === 'client_id') {
            client_id = value;
        } else if (key === 'created_at') {
            created_at = value;
        } else if (key === 'received_turns') {
            received_turns = parseReceivedTurns(value);
        }
    }

    if (!turn || !speaker || !client_id || !created_at) {
        throw new Error('Message frontmatter is missing required fields');
    }

    return {
        turn,
        speaker,
        client_id,
        created_at,
        received_turns,
    };
}

function parseReceivedTurns(raw: string): number[] {
    try {
        const value = JSON.parse(raw);
        if (!Array.isArray(value)) {
            return [];
        }
        return value.filter(item => typeof item === 'number');
    } catch {
        return [];
    }
}

async function loadJudgeRecords(runDir: string): Promise<ViewerJudgeRecord[]> {
    const judgeDir = join(runDir, 'judge');
    const summaryByRound = await loadJudgeSummaries(judgeDir);

    let entries: string[] = [];
    try {
        entries = await readdir(judgeDir);
    } catch {
        return [];
    }

    const judgeFiles = entries
        .map(name => {
            const match = name.match(/^(\d{4})\.json$/);
            if (!match) {
                return null;
            }
            return {
                filename: name,
                turn: Number(match[1]),
            };
        })
        .filter((entry): entry is {filename: string; turn: number} => Boolean(entry))
        .sort((a, b) => a.turn - b.turn);

    const output: ViewerJudgeRecord[] = [];
    for (const file of judgeFiles) {
        const path = join(judgeDir, file.filename);
        const record = JSON.parse(await readFile(path, 'utf-8')) as ViewerJudgeRecord;

        output.push({
            turn: record.turn,
            created_at: record.created_at,
            should_stop: record.should_stop,
            scores: record.scores,
            reason: record.reason,
            summary: summaryByRound.get(record.turn),
        });
    }

    return output;
}

async function loadJudgeSummaries(
    judgeDir: string
): Promise<Map<number, {round: number; created_at?: string; rolling_summary: string}>> {
    let entries: string[] = [];
    try {
        entries = await readdir(judgeDir);
    } catch {
        return new Map();
    }

    const summaryFiles = entries
        .map(name => {
            const match = name.match(/^(\d{4})_summary\.yaml$/);
            if (!match) {
                return null;
            }
            return {
                filename: name,
                round: Number(match[1]),
            };
        })
        .filter((entry): entry is {filename: string; round: number} => Boolean(entry));

    const output = new Map<number, {round: number; created_at?: string; rolling_summary: string}>();
    for (const file of summaryFiles) {
        const path = join(judgeDir, file.filename);
        const text = await readFile(path, 'utf-8');
        output.set(file.round, parseSummaryYaml(text, file.round));
    }

    return output;
}

function parseSummaryYaml(
    text: string,
    round: number
): {
    round: number;
    created_at?: string;
    rolling_summary: string;
} {
    const lines = text.split('\n');
    const created_at = lines
        .find(line => line.startsWith('created_at: '))
        ?.replace('created_at: ', '')
        .trim();

    const summaryIndex = lines.findIndex(line => line.startsWith('rolling_summary: |'));
    if (summaryIndex === -1) {
        return {
            round,
            created_at,
            rolling_summary: '',
        };
    }

    const rollingSummary = lines
        .slice(summaryIndex + 1)
        .map(line => (line.startsWith('  ') ? line.slice(2) : line))
        .join('\n')
        .trimEnd();

    return {
        round,
        created_at,
        rolling_summary: rollingSummary,
    };
}

async function loadLogs(runDir: string): Promise<ViewerLogEvent[]> {
    const logsPath = join(runDir, 'logs.jsonl');
    const text = await readTextFileOrEmpty(logsPath);
    if (!text) {
        return [];
    }

    const output: ViewerLogEvent[] = [];
    for (const line of text.split('\n')) {
        if (!line.trim()) {
            continue;
        }

        try {
            const parsed = JSON.parse(line) as ViewerLogEvent;
            if (!parsed.timestamp || !parsed.level || !parsed.category || !parsed.event) {
                continue;
            }
            output.push(parsed);
        } catch {
            continue;
        }
    }

    return output;
}

async function readTextFileOrEmpty(filePath: string): Promise<string> {
    try {
        return await readFile(filePath, 'utf-8');
    } catch {
        return '';
    }
}
