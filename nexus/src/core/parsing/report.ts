import { DomainParseError } from '../domain/index.ts';
import type { Role } from '../domain/role.ts';
import type { Report } from '../domain/report.ts';
import type { ReportStatus } from '../domain/status.ts';
import type { RawContent, RawSection } from '../domain/project.ts';
import type { MarkdownSection } from './markdown.ts';
import {
  extractSections,
  normalizeMarkdown,
  parseBulletList,
  parseSingleLine,
  requireSection,
} from './markdown.ts';

export interface ParseReportOptions {
  path?: string;
  defaultRole?: Role;
}

export interface ReportWithRaw extends Report {
  raw: RawContent;
}

const SECTION_DISPLAY_NAMES: Record<string, string> = {
  report: 'Report',
  status: 'Status',
  summary: 'Summary',
  artifacts: 'Artifacts',
  risks: 'Risks',
  next: 'Next',
};

const VALID_STATUSES: ReportStatus[] = ['success', 'partial', 'blocked'];
const VALID_STATUS_SET = new Set<ReportStatus>(VALID_STATUSES);

const VALID_ROLES: Role[] = [
  'planner',
  'implementer',
  'reviewer',
  'researcher',
  'devils-advocate',
];
const VALID_ROLE_SET = new Set<Role>(VALID_ROLES);

const REPORT_HEADING_REGEX = /^report\s*(?:[—-]\s*(.+))?$/i;
const SECTION_LABEL_REGEX = /^([A-Za-z][A-Za-z\s-]*):\s*(.*)$/;

function trimTrailingBlankLines(lines: string[]): string[] {
  let end = lines.length;

  while (end > 0 && lines[end - 1]?.trim() === '') {
    end -= 1;
  }

  return lines.slice(0, end);
}

function normalizeRoleCandidate(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

function wrapRequireSection(
  sections: Map<string, string>,
  key: string,
  opts?: ParseReportOptions,
): string {
  try {
    return requireSection(sections, key);
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

function findReportHeading(
  sections: MarkdownSection[],
  opts?: ParseReportOptions,
): { role: Role; section: MarkdownSection } {
  const reportSection = sections.find((section) =>
    section.heading.trim().toLowerCase().startsWith('report'),
  );

  if (!reportSection) {
    throw new DomainParseError('Missing section: Report', {
      kind: 'missing_section',
      section: SECTION_DISPLAY_NAMES.report,
      path: opts?.path,
    });
  }

  const heading = reportSection.heading.trim();
  const match = heading.match(REPORT_HEADING_REGEX);
  const roleText = match?.[1]?.trim() ?? '';

  if (!roleText) {
    if (opts?.defaultRole) {
      return { role: opts.defaultRole, section: reportSection };
    }

    throw new DomainParseError(`Invalid role: ${heading}`, {
      kind: 'invalid_role',
      section: SECTION_DISPLAY_NAMES.report,
      path: opts?.path,
      details: { expected: VALID_ROLES },
    });
  }

  const candidate = normalizeRoleCandidate(roleText);
  if (!VALID_ROLE_SET.has(candidate as Role)) {
    throw new DomainParseError(`Invalid role: ${roleText}`, {
      kind: 'invalid_role',
      section: SECTION_DISPLAY_NAMES.report,
      path: opts?.path,
      details: { expected: VALID_ROLES },
    });
  }

  return { role: candidate as Role, section: reportSection };
}

function parseLabelSections(text: string): {
  preamble?: string;
  sections: RawSection[];
  map: Map<string, string>;
} {
  const normalized = normalizeMarkdown(text);
  const lines = normalized.split('\n');
  const preambleLines: string[] = [];
  const sections: RawSection[] = [];
  const map = new Map<string, string>();
  let current: { title: string; normalized: string; lines: string[] } | null = null;

  const flushCurrent = () => {
    if (!current) {
      return;
    }

    const bodyLines = trimTrailingBlankLines(current.lines);
    const body = bodyLines.join('\n');
    sections.push({ title: current.title, body });
    if (!map.has(current.normalized)) {
      map.set(current.normalized, body);
    }
    current = null;
  };

  for (const line of lines) {
    const match = line.match(SECTION_LABEL_REGEX);
    if (match) {
      flushCurrent();
      const title = match[1]?.trim() ?? '';
      const normalizedTitle = title.toLowerCase();
      current = { title, normalized: normalizedTitle, lines: [] };
      const inline = match[2]?.trim();
      if (inline) {
        current.lines.push(inline);
      }
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
    map,
  };
}

function parseStatus(text: string, opts?: ParseReportOptions): ReportStatus {
  const candidate = parseSingleLine(text).trim().toLowerCase();

  if (!candidate) {
    throw new DomainParseError('Report status is missing', {
      kind: 'invalid_enum',
      section: SECTION_DISPLAY_NAMES.status,
      path: opts?.path,
      details: { expected: VALID_STATUSES },
    });
  }

  if (!VALID_STATUS_SET.has(candidate as ReportStatus)) {
    throw new DomainParseError(`Invalid report status: ${candidate}`, {
      kind: 'invalid_enum',
      section: SECTION_DISPLAY_NAMES.status,
      path: opts?.path,
      details: { expected: VALID_STATUSES },
    });
  }

  return candidate as ReportStatus;
}

export function parseReport(
  markdown: string,
  opts?: ParseReportOptions,
): ReportWithRaw {
  const parsedSections = extractSections(markdown);
  const { role, section } = findReportHeading(parsedSections.sections, opts);
  const labelSections = parseLabelSections(section.body);
  const labelsMap = labelSections.map;

  const statusSection = wrapRequireSection(labelsMap, 'status', opts);
  const summarySection = wrapRequireSection(labelsMap, 'summary', opts);
  const artifactsSection = wrapRequireSection(labelsMap, 'artifacts', opts);
  const risksSection = wrapRequireSection(labelsMap, 'risks', opts);
  const nextSection = wrapRequireSection(labelsMap, 'next', opts);

  const status = parseStatus(statusSection, opts);
  const summary = summarySection;
  const artifacts = parseBulletList(artifactsSection);
  const risks = parseBulletList(risksSection);
  const next = parseBulletList(nextSection);

  return {
    runId: '',
    role,
    status,
    summary,
    artifacts,
    risks,
    next,
    rawText: markdown,
    raw: {
      preamble: labelSections.preamble,
      sections: labelSections.sections,
    },
  };
}
