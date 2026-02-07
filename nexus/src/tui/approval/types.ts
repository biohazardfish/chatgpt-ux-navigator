/**
 * Approval types for TUI approval checkpoints.
 *
 * These types define the structure for approval requests that block TUI
 * navigation until the user makes a deliberate choice.
 */

// -----------------------------------------------------------------------------
// Core Types
// -----------------------------------------------------------------------------

export type ApprovalType =
    | 'plan-approval'
    | 'task-acceptance'
    | 'conflict-resolution'
    | 'project-completion';

export type ApprovalAction = 'accept' | 'revise' | 'defer' | 'abort';

export interface ApprovalOption {
    id: string;
    label: string;
    description?: string;
    action: ApprovalAction;
}

export interface ApprovalRequest {
    id: string;
    type: ApprovalType;
    title: string;
    context: string;
    options: ApprovalOption[];
    recommendedOptionId?: string;
}

export interface ApprovalResult {
    approvalId: string;
    selectedOptionId: string;
    action: ApprovalAction;
}

export type ApprovalCallback = (result: ApprovalResult) => void;

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

export interface ValidationSuccess {
    valid: true;
    request: ApprovalRequest;
}

export interface ValidationFailure {
    valid: false;
    error: string;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

const VALID_APPROVAL_TYPES: ApprovalType[] = [
    'plan-approval',
    'task-acceptance',
    'conflict-resolution',
    'project-completion',
];

const VALID_APPROVAL_ACTIONS: ApprovalAction[] = ['accept', 'revise', 'defer', 'abort'];

const MAX_OPTIONS = 9;

/**
 * Validates an approval request object.
 *
 * Validation rules:
 * - `id` must be a non-empty string
 * - `type` must be one of the valid approval types
 * - `title` must be a non-empty string
 * - `context` must be a string (can be empty)
 * - `options` must be a non-empty array with 1-9 items
 * - Each option must have a non-empty `id`, `label`, and valid `action`
 * - Option `id`s must be unique
 * - If `recommendedOptionId` is provided, it must match an option's `id`
 */
export function validateApprovalRequest(request: unknown): ValidationResult {
    if (request === null || request === undefined) {
        return { valid: false, error: 'Approval request is null or undefined' };
    }

    if (typeof request !== 'object') {
        return { valid: false, error: 'Approval request must be an object' };
    }

    const req = request as Record<string, unknown>;

    // Validate id
    if (typeof req.id !== 'string' || req.id.trim() === '') {
        return { valid: false, error: 'Approval request id must be a non-empty string' };
    }

    // Validate type
    if (!VALID_APPROVAL_TYPES.includes(req.type as ApprovalType)) {
        return {
            valid: false,
            error: `Approval request type must be one of: ${VALID_APPROVAL_TYPES.join(', ')}`,
        };
    }

    // Validate title
    if (typeof req.title !== 'string' || req.title.trim() === '') {
        return { valid: false, error: 'Approval request title must be a non-empty string' };
    }

    // Validate context
    if (typeof req.context !== 'string') {
        return { valid: false, error: 'Approval request context must be a string' };
    }

    // Validate options array
    if (!Array.isArray(req.options)) {
        return { valid: false, error: 'Approval request options must be an array' };
    }

    if (req.options.length === 0) {
        return { valid: false, error: 'Approval request options must not be empty' };
    }

    if (req.options.length > MAX_OPTIONS) {
        return { valid: false, error: `Approval request options must not exceed ${MAX_OPTIONS} items` };
    }

    // Validate each option and collect ids for uniqueness check
    const seenIds = new Set<string>();

    for (let i = 0; i < req.options.length; i++) {
        const option = req.options[i] as Record<string, unknown>;
        const optionPrefix = `Option ${i + 1}`;

        if (option === null || option === undefined || typeof option !== 'object') {
            return { valid: false, error: `${optionPrefix}: must be an object` };
        }

        if (typeof option.id !== 'string' || option.id.trim() === '') {
            return { valid: false, error: `${optionPrefix}: id must be a non-empty string` };
        }

        if (seenIds.has(option.id)) {
            return { valid: false, error: `${optionPrefix}: duplicate option id '${option.id}'` };
        }
        seenIds.add(option.id);

        if (typeof option.label !== 'string' || option.label.trim() === '') {
            return { valid: false, error: `${optionPrefix}: label must be a non-empty string` };
        }

        if (option.description !== undefined && typeof option.description !== 'string') {
            return { valid: false, error: `${optionPrefix}: description must be a string if provided` };
        }

        if (!VALID_APPROVAL_ACTIONS.includes(option.action as ApprovalAction)) {
            return {
                valid: false,
                error: `${optionPrefix}: action must be one of: ${VALID_APPROVAL_ACTIONS.join(', ')}`,
            };
        }
    }

    // Validate recommendedOptionId if provided
    if (req.recommendedOptionId !== undefined) {
        if (typeof req.recommendedOptionId !== 'string') {
            return { valid: false, error: 'recommendedOptionId must be a string if provided' };
        }

        if (!seenIds.has(req.recommendedOptionId)) {
            return {
                valid: false,
                error: `recommendedOptionId '${req.recommendedOptionId}' does not match any option id`,
            };
        }
    }

    return { valid: true, request: req as unknown as ApprovalRequest };
}
