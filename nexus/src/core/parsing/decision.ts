import { DomainParseError } from '../domain/index.ts';
import type { Decision } from '../domain/decision.ts';
import type { RawContent } from '../domain/project.ts';
import type { MarkdownSection, MarkdownSections } from './markdown.ts';
import {
  extractSections,
  parseBulletList,
  parseSingleLine,
  requireSection,
} from './markdown.ts';

export interface ParseDecisionOptions {
  path?: string;
}

export interface DecisionWithRaw extends Decision {
  raw: RawContent;
}

const SECTION_DISPLAY_NAMES: Record<string, string> = {
  decision: 'Decision',
  date: 'Date',
  context: 'Context',
  'options considered': 'Options Considered',
  rationale: 'Rationale',
  consequences: 'Consequences',
};

const DECISION_HEADING_REGEX = /^decision\s+(\d+)\s+[—-]\s+(.+)$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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
  opts?: ParseDecisionOptions,
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

function findDecisionHeading(
  sections: MarkdownSection[],
  opts?: ParseDecisionOptions,
): { id: number; title: string } {
  const decisionSection = sections.find((section) =>
    section.heading.trim().toLowerCase().startsWith('decision '),
  );

  if (!decisionSection) {
    throw new DomainParseError('Missing section: Decision', {
      kind: 'missing_section',
      section: SECTION_DISPLAY_NAMES.decision,
      path: opts?.path,
    });
  }

  const heading = decisionSection.heading.trim();
  const match = heading.match(DECISION_HEADING_REGEX);

  if (!match) {
    throw new DomainParseError(`Invalid decision heading: ${heading}`, {
      kind: 'invalid_id',
      section: SECTION_DISPLAY_NAMES.decision,
      path: opts?.path,
      details: { expected: 'Decision <ID> — <Title>' },
    });
  }

  const idValue = Number.parseInt(match[1] ?? '', 10);
  if (!Number.isFinite(idValue) || idValue <= 0) {
    throw new DomainParseError(`Invalid decision id: ${match[1] ?? ''}`, {
      kind: 'invalid_id',
      section: SECTION_DISPLAY_NAMES.decision,
      path: opts?.path,
      details: { expected: 'positive integer' },
    });
  }

  const title = match[2]?.trim() ?? '';

  return { id: idValue, title };
}

function parseDecisionDate(text: string, opts?: ParseDecisionOptions): string {
  const candidate = parseSingleLine(text).trim();
  if (!DATE_REGEX.test(candidate)) {
    throw new DomainParseError('Decision date is malformed', {
      kind: 'malformed',
      section: SECTION_DISPLAY_NAMES.date,
      path: opts?.path,
      details: { expected: 'YYYY-MM-DD' },
    });
  }

  return candidate;
}

function parseBodyText(text: string): string {
  return text.trim();
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

export function parseDecision(
  markdown: string,
  opts?: ParseDecisionOptions,
): DecisionWithRaw {
  const parsedSections = extractSections(markdown);
  const sectionMap = buildSectionMap(parsedSections.sections);
  const { id, title } = findDecisionHeading(parsedSections.sections, opts);

  const dateSection = wrapRequireSection(sectionMap, 'date', opts);
  const contextSection = wrapRequireSection(sectionMap, 'context', opts);
  const optionsSection = wrapRequireSection(sectionMap, 'options considered', opts);
  const decisionSection = wrapRequireSection(sectionMap, 'decision', opts);
  const rationaleSection = wrapRequireSection(sectionMap, 'rationale', opts);
  const consequencesSection = wrapRequireSection(sectionMap, 'consequences', opts);

  return {
    id,
    title,
    date: parseDecisionDate(dateSection.body, opts),
    context: parseBodyText(contextSection.body),
    options: parseBulletList(optionsSection.body),
    decision: parseBodyText(decisionSection.body),
    rationale: parseBodyText(rationaleSection.body),
    consequences: parseBulletList(consequencesSection.body),
    raw: toRawContent(parsedSections),
  };
}
