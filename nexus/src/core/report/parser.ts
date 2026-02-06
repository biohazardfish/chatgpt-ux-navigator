import type { Report } from '../domain/report.ts';
import type { Role } from '../domain/role.ts';
import type { ReportStatus } from '../domain/status.ts';
import {
  BULLET_PREFIX,
  REPORT_HEADER_REGEX,
  REQUIRED_SECTIONS,
  SECTION_LINE_REGEX,
  VALID_ROLE_SET,
  VALID_STATUS_SET,
  normalizeLineEndings,
  normalizeRoleCandidate,
  isReportSection,
} from './convention.ts';
import { ReportParseError, createErrorSnippet } from './errors.ts';
import type { ParseReportParams } from './types.ts';

type BodySection = Exclude<(typeof REQUIRED_SECTIONS)[number], 'STATUS'>;

interface SectionBuffer {
  lines: string[];
  lineNumbers: number[];
}

interface SectionContent {
  SUMMARY: SectionBuffer;
  ARTIFACTS: SectionBuffer;
  RISKS: SectionBuffer;
  NEXT: SectionBuffer;
}

interface ParsedSections {
  statusLine: StatusLine;
  content: SectionContent;
}

interface StatusLine {
  value: string;
  rawLine: string;
  line: number;
}

const SECTION_DISPLAY_NAMES: Record<(typeof REQUIRED_SECTIONS)[number], string> = {
  STATUS: 'Status',
  SUMMARY: 'Summary',
  ARTIFACTS: 'Artifacts',
  RISKS: 'Risks',
  NEXT: 'Next',
};

export function parseReport(params: ParseReportParams): Report {
  const { rawText, runId = '', expectedRole } = params;

  const normalized = normalizeLineEndings(rawText);
  const lines = normalized.split('\n');
  const { role, nextIndex, headerLine, headerLineNumber } = extractHeader(lines);

  if (role !== expectedRole) {
    throw new ReportParseError(
      'invalid-role',
      `Report role "${role}" does not match expected role "${expectedRole}"`,
      {
        snippet: createErrorSnippet(headerLine),
        section: 'Report',
        line: headerLineNumber,
        details: {
          expected: expectedRole,
          actual: role,
        },
      },
    );
  }

  const { statusLine, content } = collectSections(lines, nextIndex);

  const status = parseStatus(statusLine);
  const summary = formatSummary(content.SUMMARY.lines);
  const artifacts = parseBullets('ARTIFACTS', content.ARTIFACTS);
  const risks = parseBullets('RISKS', content.RISKS);
  const next = parseBullets('NEXT', content.NEXT);

  return {
    runId,
    role,
    status,
    summary,
    artifacts,
    risks,
    next,
    rawText,
  };
}

function extractHeader(lines: string[]): {
  role: Role;
  nextIndex: number;
  headerLine: string;
  headerLineNumber: number;
} {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.trim() === '') {
      continue;
    }

    const match = line.match(REPORT_HEADER_REGEX);
    if (!match) {
      throw new ReportParseError('missing-header', 'Report header is required', {
        snippet: createErrorSnippet(line),
        section: 'Report',
        line: index + 1,
      });
    }

    const roleText = match[1]?.trim() ?? '';
    const normalizedRole = normalizeRoleCandidate(roleText);
    if (!VALID_ROLE_SET.has(normalizedRole as Role)) {
      throw new ReportParseError(
        'invalid-role',
        `Unknown role "${roleText}" in report header`,
        {
          snippet: createErrorSnippet(line),
          section: 'Report',
          line: index + 1,
        },
      );
    }

    return {
      role: normalizedRole as Role,
      nextIndex: index + 1,
      headerLine: line,
      headerLineNumber: index + 1,
    };
  }

  throw new ReportParseError('missing-header', 'Report header is required', {
    section: 'Report',
  });
}

function collectSections(lines: string[], startIndex: number): ParsedSections {
  const content: SectionContent = {
    SUMMARY: { lines: [], lineNumbers: [] },
    ARTIFACTS: { lines: [], lineNumbers: [] },
    RISKS: { lines: [], lineNumbers: [] },
    NEXT: { lines: [], lineNumbers: [] },
  };

  let statusLine: StatusLine | null = null;
  let currentSection: BodySection | null = null;
  let currentBuffer: SectionBuffer | null = null;
  let expectedSectionIndex = 0;

  const enforceSectionOrder = (
    section: (typeof REQUIRED_SECTIONS)[number],
    rawLine: string,
    lineNumber: number,
  ) => {
    const labelIndex = REQUIRED_SECTIONS.indexOf(section);
    if (labelIndex === -1) {
      return;
    }

    if (labelIndex !== expectedSectionIndex) {
      const expectedSection = REQUIRED_SECTIONS[expectedSectionIndex];
      throw new ReportParseError(
        'section-order',
        `Section "${SECTION_DISPLAY_NAMES[section]}" is out of order; expected "${SECTION_DISPLAY_NAMES[expectedSection]}" next`,
        {
          snippet: createErrorSnippet(rawLine),
          section: SECTION_DISPLAY_NAMES[section],
          line: lineNumber,
          details: {
            expected: expectedSection,
            actual: section,
          },
        },
      );
    }

    expectedSectionIndex += 1;
  };

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const match = line.match(SECTION_LINE_REGEX);
    const lineNumber = index + 1;

    if (match) {
      const label = match[1];
      const inline = match[2] ?? '';

      if (label === 'STATUS') {
        enforceSectionOrder('STATUS', line, lineNumber);
        statusLine = { value: inline, rawLine: line, line: lineNumber };
        currentSection = null;
        currentBuffer = null;
        continue;
      }

      if (isReportSection(label) && label !== 'STATUS') {
        const sectionName = label as BodySection;
        enforceSectionOrder(label as (typeof REQUIRED_SECTIONS)[number], line, lineNumber);
        currentSection = sectionName;
        currentBuffer = content[sectionName];
        if (inline) {
          currentBuffer.lines.push(inline);
          currentBuffer.lineNumbers.push(lineNumber);
        }
        continue;
      }
    }

    if (currentBuffer) {
      currentBuffer.lines.push(line);
      currentBuffer.lineNumbers.push(lineNumber);
    }
  }

  if (expectedSectionIndex < REQUIRED_SECTIONS.length) {
    const missingSection = REQUIRED_SECTIONS[expectedSectionIndex];
    throw new ReportParseError(
      'missing-section',
      `Section "${SECTION_DISPLAY_NAMES[missingSection]}" is missing`,
      {
        section: SECTION_DISPLAY_NAMES[missingSection],
      },
    );
  }

  if (!statusLine) {
    throw new ReportParseError('missing-section', 'Status section is missing', {
      section: SECTION_DISPLAY_NAMES.STATUS,
    });
  }

  return {
    statusLine: statusLine!,
    content,
  };
}

function parseStatus(status: StatusLine): ReportStatus {
  const candidate = status.value.trim().toLowerCase();
  if (!candidate) {
    throw new ReportParseError('invalid-status', 'Report status must specify a value', {
      snippet: createErrorSnippet(status.rawLine),
      section: SECTION_DISPLAY_NAMES.STATUS,
      line: status.line,
    });
  }

  if (!VALID_STATUS_SET.has(candidate as ReportStatus)) {
    throw new ReportParseError(
      'invalid-status',
      `Unsupported status "${status.value.trim()}"`,
      {
        snippet: createErrorSnippet(status.rawLine),
        section: SECTION_DISPLAY_NAMES.STATUS,
        line: status.line,
      },
    );
  }

  return candidate as ReportStatus;
}

function formatSummary(lines: string[]): string {
  const trimmed = trimBoundaryLines(lines);
  if (trimmed.length === 0) {
    return '';
  }

  return trimmed.join('\n');
}

function parseBullets(section: BodySection, buffer: SectionBuffer): string[] {
  const trimmed = trimBoundaryBuffer(buffer);
  const items: string[] = [];

  for (let index = 0; index < trimmed.lines.length; index += 1) {
    const rawLine = trimmed.lines[index] ?? '';
    const lineNumber = trimmed.lineNumbers[index] ?? 0;
    const normalized = rawLine.trim();
    if (!normalized) {
      continue;
    }

    const bulletCandidate = rawLine.trimStart();
    if (!bulletCandidate.startsWith(BULLET_PREFIX)) {
      throw new ReportParseError(
        'malformed-bullets',
        `${SECTION_DISPLAY_NAMES[section]} entries must start with "${BULLET_PREFIX}"`,
        {
          snippet: createErrorSnippet(rawLine),
          section: SECTION_DISPLAY_NAMES[section],
          line: lineNumber,
        },
      );
    }

    const value = bulletCandidate.slice(BULLET_PREFIX.length).trim();
    if (!value) {
      throw new ReportParseError(
        'malformed-bullets',
        `${SECTION_DISPLAY_NAMES[section]} entries must include text after the bullet prefix`,
        {
          snippet: createErrorSnippet(rawLine),
          section: SECTION_DISPLAY_NAMES[section],
          line: lineNumber,
        },
      );
    }

    items.push(value);
  }

  return items;
}

function trimBoundaryLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start]?.trim() === '') {
    start += 1;
  }

  while (end > start && lines[end - 1]?.trim() === '') {
    end -= 1;
  }

  return lines.slice(start, end);
}

function trimBoundaryBuffer(buffer: SectionBuffer): SectionBuffer {
  let start = 0;
  let end = buffer.lines.length;

  while (start < end && buffer.lines[start]?.trim() === '') {
    start += 1;
  }

  while (end > start && buffer.lines[end - 1]?.trim() === '') {
    end -= 1;
  }

  return {
    lines: buffer.lines.slice(start, end),
    lineNumbers: buffer.lineNumbers.slice(start, end),
  };
}
