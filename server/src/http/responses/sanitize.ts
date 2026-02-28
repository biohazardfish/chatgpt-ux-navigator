const FINISHED_MARKER = 'finished_successfully';
const VERSION_PREFIX = /^v\d+\s*/i;
const THOUGHT_PREAMBLE_PREFIX =
    /^thought for\s+(?:(?:a\s+)?couple of|a|an|one|\d+)\s+second(?:s)?\b[\s.,:;\-]*/i;

export function sanitizeAssistantText(fullText: string): string {
    if (typeof fullText !== 'string') {
        return '';
    }

    let cleaned = fullText.trim();
    if (!cleaned) {
        return '';
    }

    cleaned = cleaned.split(FINISHED_MARKER).join('');
    cleaned = cleaned.replace(VERSION_PREFIX, '').trim();
    cleaned = cleaned.replace(THOUGHT_PREAMBLE_PREFIX, '').trim();

    return cleaned;
}
