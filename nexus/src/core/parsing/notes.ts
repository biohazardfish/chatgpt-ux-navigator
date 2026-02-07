import {DomainParseError} from '../domain/index.ts';
import type {Notes} from '../domain/notes.ts';
import type {RawContent} from '../domain/project.ts';
import type {MarkdownSection, MarkdownSections} from './markdown.ts';
import {extractSections, parseBulletList, requireSection} from './markdown.ts';

export interface ParseNotesOptions {
    path?: string;
}

export interface NotesWithRaw extends Notes {
    projectNotes: string[];
    raw: RawContent;
}

const SECTION_DISPLAY_NAMES: Record<string, string> = {
    'project notes': 'Project Notes',
    assumptions: 'Assumptions',
    clarifications: 'Clarifications',
    'lessons learned': 'Lessons Learned',
};

function buildSectionMap(sections: MarkdownSection[]): Map<string, MarkdownSection> {
    const map = new Map<string, MarkdownSection>();

    for (const section of sections) {
        const trimmed = section.heading.trim();
        if (!trimmed) {
            continue;
        }

        const normalized = trimmed.toLowerCase();
        if (!map.has(normalized)) {
            map.set(normalized, section);
        }

        const colonIndex = trimmed.indexOf(':');
        if (colonIndex > -1) {
            const base = trimmed.slice(0, colonIndex).trim().toLowerCase();
            if (base && !map.has(base)) {
                map.set(base, section);
            }
        }
    }

    return map;
}

function wrapRequireSection(
    map: Map<string, MarkdownSection>,
    key: string,
    opts?: ParseNotesOptions
): MarkdownSection {
    try {
        return requireSection(map, key);
    } catch (error) {
        if (error instanceof DomainParseError) {
            throw new DomainParseError(error.message, {
                kind: error.kind,
                section: SECTION_DISPLAY_NAMES[key] ?? error.section ?? key,
                path: opts?.path,
            });
        }
        throw error;
    }
}

function toRawContent(parsed: MarkdownSections): RawContent {
    return {
        preamble: parsed.preamble,
        sections: parsed.sections.map(section => ({
            title: section.heading,
            body: section.body,
        })),
    };
}

export function parseNotes(markdown: string, opts?: ParseNotesOptions): NotesWithRaw {
    const parsedSections = extractSections(markdown);
    const sectionMap = buildSectionMap(parsedSections.sections);

    const projectNotesSection = wrapRequireSection(sectionMap, 'project notes', opts);
    const assumptionsSection = wrapRequireSection(sectionMap, 'assumptions', opts);
    const clarificationsSection = wrapRequireSection(sectionMap, 'clarifications', opts);
    const lessonsSection = wrapRequireSection(sectionMap, 'lessons learned', opts);

    return {
        projectNotes: parseBulletList(projectNotesSection.body),
        assumptions: parseBulletList(assumptionsSection.body),
        clarifications: parseBulletList(clarificationsSection.body),
        lessonsLearned: parseBulletList(lessonsSection.body),
        raw: toRawContent(parsedSections),
    };
}
