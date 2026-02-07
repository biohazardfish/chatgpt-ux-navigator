import type {PromptContext} from './types.ts';
import {MAX_TOTAL_CONTEXT_LINES, TRUNCATION_MARKER} from './limits.ts';

/**
 * Render a PromptContext into a stable, diff-friendly text block.
 *
 * Format:
 *   PROJECT CONTEXT
 *
 *   TASK OBJECTIVE:
 *   <objective>
 *
 *   GOALS:
 *   - ...
 *
 *   PLAN (<Status>):
 *   - ...
 *
 *   CONSTRAINTS:     (omitted if empty)
 *   - ...
 *
 *   NOTES:           (omitted if empty)
 *   - ...
 *
 * Enforces MAX_TOTAL_CONTEXT_LINES. If the rendered output exceeds the
 * limit, it is truncated and a marker is appended.
 */
export function renderPromptContext(context: PromptContext): string {
    const sections: string[] = [];

    sections.push('PROJECT CONTEXT');

    sections.push('');
    sections.push('TASK OBJECTIVE:');
    sections.push(context.taskObjective);

    sections.push('');
    sections.push('GOALS:');
    for (const goal of context.goals) {
        sections.push(`- ${goal}`);
    }

    // Extract status from the first planExcerpt entry ("Status: <value>")
    const statusLine = context.planExcerpt[0] ?? '';
    const planStatus = statusLine.startsWith('Status: ')
        ? statusLine.slice('Status: '.length)
        : 'unknown';
    const phases = context.planExcerpt.slice(1);

    sections.push('');
    sections.push(`PLAN (${planStatus}):`);
    for (const phase of phases) {
        sections.push(`- ${phase}`);
    }

    if (context.constraints.length > 0) {
        sections.push('');
        sections.push('CONSTRAINTS:');
        for (const constraint of context.constraints) {
            sections.push(`- ${constraint}`);
        }
    }

    if (context.notes.length > 0) {
        sections.push('');
        sections.push('NOTES:');
        for (const note of context.notes) {
            if (note === TRUNCATION_MARKER) {
                sections.push(note);
            } else {
                sections.push(`- ${note}`);
            }
        }
    }

    const lines = sections;

    if (lines.length > MAX_TOTAL_CONTEXT_LINES) {
        const truncated = lines.slice(0, MAX_TOTAL_CONTEXT_LINES - 1);
        truncated.push(TRUNCATION_MARKER);
        return truncated.join('\n');
    }

    return lines.join('\n');
}
