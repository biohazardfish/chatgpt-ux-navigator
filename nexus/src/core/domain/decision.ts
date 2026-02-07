export interface Decision {
    id: number;
    title: string;
    date: string;
    context: string;
    options: string[];
    decision: string;
    rationale: string;
    consequences: string[];
}

/**
 * Input for recording a new decision.
 *
 * Represents the data needed to create an immutable decision record
 * from a governance outcome or user approval.
 */
export interface DecisionInput {
    projectId: string;
    taskId?: string;
    title: string;
    context: string;
    options: string[];
    decision: string;
    rationale: string;
    consequences: string[];
}
