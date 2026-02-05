import type { PlanStatus } from './status.ts';

export interface Plan {
  status: PlanStatus;
  phases: string[];
  notes: string[];
}
