import { DomainParseError } from '../domain/index.ts';
import type { ProjectDoc, RawContent } from '../domain/project.ts';
import type { MarkdownSection, MarkdownSections } from './markdown.ts';
import {
  extractSections,
  parseBulletList,
  parseSingleLine,
  requireSection,
} from './markdown.ts';

export interface ParseProjectDocOptions {
  path?: string;
}

export interface ProjectDocWithRaw extends ProjectDoc {
  raw: RawContent;
}

const SECTION_DISPLAY_NAMES: Record<string, string> = {
  project: 'Project',
  goals: 'Goals',
  constraints: 'Constraints',
  'non-goals': 'Non-Goals',
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
  opts?: ParseProjectDocOptions,
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

function parseProjectTitle(section: MarkdownSection, opts?: ParseProjectDocOptions): string {
  const heading = section.heading.trim();
  const explicitMatch = heading.match(/^project\s*:\s*(.+)$/i);

  if (explicitMatch) {
    const candidate = explicitMatch[1]?.trim() ?? '';
    if (candidate) {
      return candidate;
    }
  }

  const fromBody = parseSingleLine(section.body);
  if (fromBody) {
    return fromBody;
  }

  throw new DomainParseError('Project title is missing', {
    kind: 'missing_section',
    section: 'Project',
    path: opts?.path,
  });
}

function toRawContent(parsed: MarkdownSections): RawContent {
  return {
    preamble: parsed.preamble,
    sections: parsed.sections.map((section) => ({
      title: section.heading,
      body: section.body,
    })),
  };
}

export function parseProjectDoc(
  markdown: string,
  opts?: ParseProjectDocOptions,
): ProjectDocWithRaw {
  const parsedSections = extractSections(markdown);
  const map = buildSectionMap(parsedSections.sections);
  const projectSection = wrapRequireSection(map, 'project', opts);
  const goalsSection = wrapRequireSection(map, 'goals', opts);
  const constraintsSection = wrapRequireSection(map, 'constraints', opts);
  const nonGoalsSection = wrapRequireSection(map, 'non-goals', opts);

  return {
    title: parseProjectTitle(projectSection, opts),
    goals: parseBulletList(goalsSection.body),
    constraints: parseBulletList(constraintsSection.body),
    nonGoals: parseBulletList(nonGoalsSection.body),
    raw: toRawContent(parsedSections),
  };
}
