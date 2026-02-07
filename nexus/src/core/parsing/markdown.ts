import {DomainParseError} from '../domain/index.ts';

export interface MarkdownSection {
    heading: string;
    level: number;
    body: string;
}

export interface MarkdownSections {
    preamble?: string;
    sections: MarkdownSection[];
}

function trimTrailingBlankLines(lines: string[]): string[] {
    let end = lines.length;

    while (end > 0 && lines[end - 1]?.trim() === '') {
        end -= 1;
    }

    return lines.slice(0, end);
}

export function normalizeMarkdown(text: string): string {
    return text.replace(/\r\n/g, '\n');
}

export function extractSections(text: string): MarkdownSections {
    const normalized = normalizeMarkdown(text);
    const lines = normalized.split('\n');
    const sections: MarkdownSection[] = [];
    const preambleLines: string[] = [];
    let current: {
        heading: string;
        level: number;
        lines: string[];
    } | null = null;

    const headingRegex = /^(#{1,6})\s+(.*)$/;

    const flushCurrent = () => {
        if (!current) {
            return;
        }

        const bodyLines = trimTrailingBlankLines(current.lines);
        sections.push({
            heading: current.heading,
            level: current.level,
            body: bodyLines.join('\n'),
        });
        current = null;
    };

    for (const line of lines) {
        const match = line.match(headingRegex);

        if (match) {
            flushCurrent();
            current = {
                heading: match[2]?.trim() ?? '',
                level: match[1]?.length ?? 0,
                lines: [],
            };
            continue;
        }

        if (current) {
            current.lines.push(line);
        } else {
            preambleLines.push(line);
        }
    }

    flushCurrent();

    const trimmedPreamble = trimTrailingBlankLines(preambleLines);
    const preambleText = trimmedPreamble.join('\n');
    const hasPreamble = preambleText.trim().length > 0;

    return {
        preamble: hasPreamble ? preambleText : undefined,
        sections,
    };
}

export function requireSection<T>(sections: Map<string, T> | Record<string, T>, name: string): T {
    const found = sections instanceof Map ? sections.get(name) : sections[name];

    if (!found) {
        throw new DomainParseError(`Missing section: ${name}`, {
            kind: 'missing_section',
            section: name,
        });
    }

    return found;
}

export function parseBulletList(text: string): string[] {
    const normalized = normalizeMarkdown(text);
    const lines = normalized.split('\n');
    const items: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }

        const match = trimmed.match(/^([-*]|\d+\.)\s+(.*)$/);
        items.push(match ? (match[2]?.trim() ?? '') : trimmed);
    }

    return items;
}

export function parseSingleLine(text: string): string {
    const normalized = normalizeMarkdown(text);
    const lines = normalized.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
            return trimmed;
        }
    }

    return '';
}
