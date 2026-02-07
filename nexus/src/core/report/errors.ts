import {MAX_ERROR_SNIPPET_LENGTH} from './convention.ts';

export type ReportParseErrorType =
    | 'missing-header'
    | 'invalid-role'
    | 'missing-section'
    | 'invalid-status'
    | 'section-order'
    | 'malformed-bullets';

export interface ReportParseErrorDetails {
    snippet?: string;
    section?: string;
    line?: number;
    details?: Record<string, unknown>;
}

export class ReportParseError extends Error {
    readonly type: ReportParseErrorType;
    readonly snippet?: string;
    readonly section?: string;
    readonly line?: number;
    readonly details?: Record<string, unknown>;

    constructor(
        type: ReportParseErrorType,
        message: string,
        details: ReportParseErrorDetails = {}
    ) {
        super(message);
        this.name = 'ReportParseError';
        this.type = type;
        this.snippet = details.snippet;
        this.section = details.section;
        this.line = details.line;
        this.details = details.details;
    }
}

export function createErrorSnippet(text: string): string {
    if (text.length <= MAX_ERROR_SNIPPET_LENGTH) {
        return text;
    }

    return `${text.slice(0, MAX_ERROR_SNIPPET_LENGTH)}…`;
}
