/**
 * Judge summary prompt builder
 * Renders user-provided summary prompt templates with round data
 */

import type {AgentMessage} from '../runner/types';
import type {AppConfig} from '../config/types';

const TEMPLATE_TOKENS = [
    'ROLLING_SUMMARY',
    'THIS_ROUND_TRANSCRIPT',
    'ROUND_INDEX',
    'AGENTS',
    'SEED',
    'RUBRIC',
];

function formatTranscriptEntries(transcript: AgentMessage[]): string {
    if (transcript.length === 0) {
        return '<<EMPTY>>';
    }

    let formatted = '';
    transcript.forEach((msg, index) => {
        const entryNumber = index + 1;
        formatted += `[${entryNumber}] ${msg.speaker}: ${msg.content}`;
        if (index < transcript.length - 1) {
            formatted += '\n\n';
        }
    });

    return formatted;
}

function replaceToken(template: string, token: string, value: string): string {
    const placeholder = `{{${token}}}`;
    return template.split(placeholder).join(value);
}

export function buildJudgeSummaryPrompt(params: {
    config: AppConfig;
    roundIndex: number;
    rollingSummary: string;
    roundTranscript: AgentMessage[];
}): string {
    const {config, roundIndex, rollingSummary, roundTranscript} = params;

    if (!config.judge.summary?.prompt) {
        throw new Error('Judge summary prompt is required when summary is enabled');
    }

    const values: Record<string, string> = {
        ROLLING_SUMMARY:
            rollingSummary && rollingSummary.trim().length > 0 ? rollingSummary : '<<NONE>>',
        THIS_ROUND_TRANSCRIPT: formatTranscriptEntries(roundTranscript),
        ROUND_INDEX: String(roundIndex),
        AGENTS: config.workflow.order.join(', '),
        SEED: config.seed.content,
        RUBRIC: config.judge.rubric || '',
    };

    let rendered = config.judge.summary.prompt;
    for (const token of TEMPLATE_TOKENS) {
        rendered = replaceToken(rendered, token, values[token]);
    }

    return rendered;
}
