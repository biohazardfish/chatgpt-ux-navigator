export const MAX_NOTES_LINES = 10;
export const MAX_TOTAL_CONTEXT_LINES = 100;
export const TRUNCATION_MARKER = '[...] (truncated)';

/**
 * Truncate an array of lines to a maximum count.
 * If truncation occurs, the last element is replaced with the truncation marker.
 */
export function truncateLines(lines: string[], max: number): string[] {
    if (max < 0) {
        return [];
    }

    if (lines.length <= max) {
        return lines;
    }

    if (max === 0) {
        return [TRUNCATION_MARKER];
    }

    return [...lines.slice(0, max - 1), TRUNCATION_MARKER];
}
