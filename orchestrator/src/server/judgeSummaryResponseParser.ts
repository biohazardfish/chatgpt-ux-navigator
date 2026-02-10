/**
 * Judge summary response parser and validator
 * Extracts rolling_summary from a JSON code block
 */

export type SummaryParseError =
    | {type: 'no_code_block'}
    | {type: 'json_parse_error'; details: string}
    | {type: 'validation_error'; details: string};

type SummaryResult = {rolling_summary: string};

function extractCodeBlock(text: string): string | null {
    const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (!match) {
        return null;
    }
    return match[1].trim();
}

function validateSummary(obj: unknown): SummaryParseError | null {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
        return {type: 'validation_error', details: 'response must be a JSON object'};
    }

    const summary = obj as Record<string, unknown>;
    const keys = Object.keys(summary);

    if (keys.length !== 1 || keys[0] !== 'rolling_summary') {
        return {type: 'validation_error', details: 'response must contain only rolling_summary'};
    }

    if (typeof summary.rolling_summary !== 'string' || summary.rolling_summary.trim().length === 0) {
        return {type: 'validation_error', details: 'rolling_summary must be a non-empty string'};
    }

    return null;
}

export function parseJudgeSummaryResponse(
    responseText: string
): SummaryResult | SummaryParseError {
    if (!responseText || responseText.trim().length === 0) {
        return {type: 'no_code_block'};
    }

    const codeBlockContent = extractCodeBlock(responseText);
    if (codeBlockContent === null) {
        return {type: 'no_code_block'};
    }

    if (codeBlockContent.length === 0) {
        return {type: 'json_parse_error', details: 'Code block is empty'};
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(codeBlockContent);
    } catch (err) {
        return {
            type: 'json_parse_error',
            details: err instanceof Error ? err.message : String(err),
        };
    }

    const validationError = validateSummary(parsed);
    if (validationError) {
        return validationError;
    }

    return {rolling_summary: (parsed as SummaryResult).rolling_summary};
}

export function isSummaryParseError(
    result: SummaryResult | SummaryParseError
): result is SummaryParseError {
    return typeof result === 'object' && result !== null && 'type' in result;
}
