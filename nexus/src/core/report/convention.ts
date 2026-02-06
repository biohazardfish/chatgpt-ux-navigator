import type { Role } from '../domain/role.ts';
import type { ReportStatus } from '../domain/status.ts';

export const REPORT_HEADER_PREFIX = '# Report — ';
export const REPORT_HEADER_REGEX = /^#\s*Report\s*(?:—|-)\s*(.+)$/i;

export const BULLET_PREFIX = '- ';

export const REQUIRED_SECTIONS = [
  'STATUS',
  'SUMMARY',
  'ARTIFACTS',
  'RISKS',
  'NEXT',
] as const;

export type ReportSection = (typeof REQUIRED_SECTIONS)[number];

export const VALID_ROLES: Role[] = [
  'planner',
  'implementer',
  'reviewer',
  'researcher',
  'devils-advocate',
];

export const VALID_ROLE_SET = new Set<Role>(VALID_ROLES);

export const VALID_STATUSES: ReportStatus[] = ['success', 'partial', 'blocked'];

export const VALID_STATUS_SET = new Set<ReportStatus>(VALID_STATUSES);

export const SECTION_LINE_REGEX = /^([A-Z][A-Z-]*):\s*(.*)$/;

export const MAX_ERROR_SNIPPET_LENGTH = 200;

export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function normalizeRoleCandidate(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

export function isReportSection(candidate: string): candidate is ReportSection {
  return (REQUIRED_SECTIONS as readonly string[]).includes(candidate);
}
