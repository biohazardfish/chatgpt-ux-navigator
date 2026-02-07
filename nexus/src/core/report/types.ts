import type {Role} from '../domain/role.ts';

export interface ParseReportParams {
    expectedRole: Role;
    rawText: string;
    runId?: string;
}
