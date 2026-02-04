import { DomainParseError } from '../domain/index.ts';
import type { Plan } from '../domain/plan.ts';
import type { PlanStatus } from '../domain/status.ts';
import type { RawContent } from '../domain/project.ts';
import type { MarkdownSection, MarkdownSections } from './markdown.ts';
import {
  extractSections,
  parseBulletList,
  parseSingleLine,
  requireSection,
} from './markdown.ts';

export interface ParsePlanOptions {
  path?: string;
}

export interface PlanWithRaw extends Plan {
  raw: RawContent;
}

const SECTION_DISPLAY_NAMES: Record<string, string> = {
  'current plan': 'Current Plan',
  status: 'Status',
  phases: 'Phases',
  notes: 'Notes',
};

const VALID_STATUSES: PlanStatus[] = ['draft', 'approved', 'superseded'];
const VALID_STATUS_SET = new Set<PlanStatus>(VALID_STATUSES);

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
  opts?: ParsePlanOptions,
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
    sections: parsed.sections.map((section) => ({
      title: section.heading,
      body: section.body,
    })),
  };
}

function parseStatus(text: string, opts?: ParsePlanOptions): PlanStatus {
  const candidate = parseSingleLine(text).trim().toLowerCase();

  if (!candidate) {
    throw new DomainParseError('Plan status is missing', {
      kind: 'invalid_enum',
      section: SECTION_DISPLAY_NAMES.status,
      path: opts?.path,
      details: { expected: VALID_STATUSES },
    });
  }

  if (!VALID_STATUS_SET.has(candidate as PlanStatus)) {
    throw new DomainParseError(`Invalid plan status: ${candidate}`, {
      kind: 'invalid_enum',
      section: SECTION_DISPLAY_NAMES.status,
      path: opts?.path,
      details: { expected: VALID_STATUSES },
    });
  }

  return candidate as PlanStatus;
}

export function parsePlan(markdown: string, opts?: ParsePlanOptions): PlanWithRaw {
  const parsedSections = extractSections(markdown);
  const sectionsMap = buildSectionMap(parsedSections.sections);

  wrapRequireSection(sectionsMap, 'current plan', opts);
  const statusSection = wrapRequireSection(sectionsMap, 'status', opts);
  const phasesSection = wrapRequireSection(sectionsMap, 'phases', opts);
  const notesSection = wrapRequireSection(sectionsMap, 'notes', opts);

  const status = parseStatus(statusSection.body, opts);
  const phases = parseBulletList(phasesSection.body);
  const notes = parseBulletList(notesSection.body);

  return {
    status,
    phases,
    notes,
    raw: toRawContent(parsedSections),
  };
}
