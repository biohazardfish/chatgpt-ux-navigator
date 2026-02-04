import type { Role } from './role.ts';
import type { ReportStatus } from './status.ts';

export interface Report {
  runId: string;
  role: Role;
  status: ReportStatus;
  summary: string;
  artifacts: string[];
  risks: string[];
  next: string[];
  rawText: string;
}
