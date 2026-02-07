import type {Role} from './role.ts';
import type {TaskStatus} from './status.ts';

export interface Task {
    id: string;
    title: string;
    status: TaskStatus;
    objective: string;
    assignedRoles: Role[];
    relatedGoals: string[];
    createdAt: string;
}
