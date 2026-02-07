export {parseReport} from './parser.ts';
export type {ParseReportParams} from './types.ts';

export {ReportParseError, type ReportParseErrorType, createErrorSnippet} from './errors.ts';

export {
    REPORT_HEADER_PREFIX,
    REPORT_HEADER_REGEX,
    BULLET_PREFIX,
    REQUIRED_SECTIONS,
    type ReportSection,
    VALID_ROLES,
    VALID_ROLE_SET,
    VALID_STATUSES,
    VALID_STATUS_SET,
    SECTION_LINE_REGEX,
    MAX_ERROR_SNIPPET_LENGTH,
    normalizeLineEndings,
    normalizeRoleCandidate,
    isReportSection,
} from './convention.ts';
