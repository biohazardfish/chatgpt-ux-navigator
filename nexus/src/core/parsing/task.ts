import { DomainParseError } from '../domain/index.ts';
import type { Role } from '../domain/role.ts';
import type { Task } from '../domain/task.ts';
import type { TaskStatus } from '../domain/status.ts';
import type { RawContent } from '../domain/project.ts';
import type { MarkdownSection, MarkdownSections } from './markdown.ts';
import {
  extractSections,
  parseBulletList,
  parseSingleLine,
  requireSection,
} from './markdown.ts';

export interface ParseTaskOptions {
  path?: string;
}

export interface TaskWithRaw extends Task {
  raw: RawContent;
}

const SECTION_DISPLAY_NAMES: Record<string, string> = {
  task: 'Task',
  status: 'Status',
  objective: 'Objective',
  'assigned roles': 'Assigned Roles',
  'related goals': 'Related Goals',
  'created at': 'Created At',
};

const TASK_ID_REGEX = /^T-\d{3,}$/;
const TASK_HEADING_REGEX = /^task\s+(\S+)\s+[—-]\s+(.+)$/i;

const VALID_STATUSES: TaskStatus[] = [
  'pending',
  'running',
  'blocked',
  'completed',
  'aborted',
];
const VALID_STATUS_SET = new Set<TaskStatus>(VALID_STATUSES);

const VALID_ROLES: Role[] = [
  'planner',
  'implementer',
  'reviewer',
  'researcher',
  'devils-advocate',
];
const VALID_ROLE_SET = new Set<Role>(VALID_ROLES);

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
  opts?: ParseTaskOptions,
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

function findTaskHeading(
  sections: MarkdownSection[],
  opts?: ParseTaskOptions,
): { id: string; title: string; section: MarkdownSection } {
  const taskSection = sections.find((section) =>
    section.heading.trim().toLowerCase().startsWith('task '),
  );

  if (!taskSection) {
    throw new DomainParseError('Missing section: Task', {
      kind: 'missing_section',
      section: SECTION_DISPLAY_NAMES.task,
      path: opts?.path,
    });
  }

  const heading = taskSection.heading.trim();
  const match = heading.match(TASK_HEADING_REGEX);

  if (!match) {
    throw new DomainParseError(`Invalid task heading: ${heading}`, {
      kind: 'invalid_id',
      section: SECTION_DISPLAY_NAMES.task,
      path: opts?.path,
      details: { expected: 'Task T-### — <Title>' },
    });
  }

  const id = match[1]?.trim() ?? '';
  const title = match[2]?.trim() ?? '';

  if (!TASK_ID_REGEX.test(id)) {
    throw new DomainParseError(`Invalid task id: ${id}`, {
      kind: 'invalid_id',
      section: SECTION_DISPLAY_NAMES.task,
      path: opts?.path,
      details: { expected: TASK_ID_REGEX.source },
    });
  }

  return { id, title, section: taskSection };
}

function parseStatus(text: string, opts?: ParseTaskOptions): TaskStatus {
  const candidate = parseSingleLine(text).trim().toLowerCase();

  if (!candidate) {
    throw new DomainParseError('Task status is missing', {
      kind: 'invalid_enum',
      section: SECTION_DISPLAY_NAMES.status,
      path: opts?.path,
      details: { expected: VALID_STATUSES },
    });
  }

  if (!VALID_STATUS_SET.has(candidate as TaskStatus)) {
    throw new DomainParseError(`Invalid task status: ${candidate}`, {
      kind: 'invalid_enum',
      section: SECTION_DISPLAY_NAMES.status,
      path: opts?.path,
      details: { expected: VALID_STATUSES },
    });
  }

  return candidate as TaskStatus;
}

function parseRoles(text: string, opts?: ParseTaskOptions): Role[] {
  const roles = parseBulletList(text);

  return roles.map((role) => {
    const candidate = role.trim();
    if (!VALID_ROLE_SET.has(candidate as Role)) {
      throw new DomainParseError(`Invalid role: ${candidate}`, {
        kind: 'invalid_role',
        section: SECTION_DISPLAY_NAMES['assigned roles'],
        path: opts?.path,
        details: { expected: VALID_ROLES },
      });
    }

    return candidate as Role;
  });
}

function parseCreatedAt(text: string, opts?: ParseTaskOptions): string {
  const candidate = parseSingleLine(text).trim();
  if (!candidate || Number.isNaN(Date.parse(candidate))) {
    throw new DomainParseError('Task created at timestamp is malformed', {
      kind: 'malformed',
      section: SECTION_DISPLAY_NAMES['created at'],
      path: opts?.path,
    });
  }

  return candidate;
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

export function parseTask(markdown: string, opts?: ParseTaskOptions): TaskWithRaw {
  const parsedSections = extractSections(markdown);
  const sectionMap = buildSectionMap(parsedSections.sections);
  const { id, title } = findTaskHeading(parsedSections.sections, opts);

  const statusSection = wrapRequireSection(sectionMap, 'status', opts);
  const objectiveSection = wrapRequireSection(sectionMap, 'objective', opts);
  const assignedRolesSection = wrapRequireSection(sectionMap, 'assigned roles', opts);
  const relatedGoalsSection = wrapRequireSection(sectionMap, 'related goals', opts);
  const createdAtSection = wrapRequireSection(sectionMap, 'created at', opts);

  const status = parseStatus(statusSection.body, opts);
  const objective = parseSingleLine(objectiveSection.body);
  const assignedRoles = parseRoles(assignedRolesSection.body, opts);
  const relatedGoals = parseBulletList(relatedGoalsSection.body);
  const createdAt = parseCreatedAt(createdAtSection.body, opts);

  return {
    id,
    title,
    status,
    objective,
    assignedRoles,
    relatedGoals,
    createdAt,
    raw: toRawContent(parsedSections),
  };
}
