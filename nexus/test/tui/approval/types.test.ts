import { describe, it, expect } from 'bun:test';
import {
    validateApprovalRequest,
    type ApprovalRequest,
    type ApprovalOption,
    type ApprovalType,
    type ApprovalAction,
} from '../../../src/tui/approval/types';

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

function createValidOption(overrides?: Partial<ApprovalOption>): ApprovalOption {
    return {
        id: 'opt-1',
        label: 'Approve',
        action: 'accept',
        ...overrides,
    };
}

function createValidRequest(overrides?: Partial<ApprovalRequest>): ApprovalRequest {
    return {
        id: 'approval-1',
        type: 'plan-approval',
        title: 'Plan Approval',
        context: 'The initial project plan has been generated.',
        options: [createValidOption()],
        ...overrides,
    };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('validateApprovalRequest', () => {
    describe('valid requests', () => {
        it('accepts a well-formed approval request', () => {
            const request = createValidRequest();
            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(true);
            if (result.valid) {
                expect(result.request).toEqual(request);
            }
        });

        it('accepts request without recommendedOptionId', () => {
            const request = createValidRequest({ recommendedOptionId: undefined });
            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(true);
        });

        it('accepts request with option descriptions', () => {
            const request = createValidRequest({
                options: [
                    createValidOption({ description: 'Proceed with the plan as proposed' }),
                ],
            });
            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(true);
        });

        it('accepts all valid approval types', () => {
            const types: ApprovalType[] = [
                'plan-approval',
                'task-acceptance',
                'conflict-resolution',
                'project-completion',
            ];

            for (const type of types) {
                const request = createValidRequest({ type });
                const result = validateApprovalRequest(request);
                expect(result.valid).toBe(true);
            }
        });

        it('accepts all valid approval actions', () => {
            const actions: ApprovalAction[] = ['accept', 'revise', 'defer', 'abort'];

            for (const action of actions) {
                const request = createValidRequest({
                    options: [createValidOption({ action })],
                });
                const result = validateApprovalRequest(request);
                expect(result.valid).toBe(true);
            }
        });

        it('accepts request with 1 option (minimum)', () => {
            const request = createValidRequest({
                options: [createValidOption()],
            });
            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(true);
        });

        it('accepts request with 9 options (maximum)', () => {
            const options: ApprovalOption[] = [];
            for (let i = 1; i <= 9; i++) {
                options.push(createValidOption({ id: `opt-${i}`, label: `Option ${i}` }));
            }

            const request = createValidRequest({ options });
            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(true);
        });

        it('accepts request with valid recommendedOptionId', () => {
            const request = createValidRequest({
                options: [
                    createValidOption({ id: 'opt-1' }),
                    createValidOption({ id: 'opt-2', label: 'Reject' }),
                ],
                recommendedOptionId: 'opt-1',
            });
            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(true);
        });

        it('accepts request with empty context', () => {
            const request = createValidRequest({ context: '' });
            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(true);
        });
    });

    describe('invalid requests', () => {
        it('rejects null input', () => {
            const result = validateApprovalRequest(null);

            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.error).toContain('null or undefined');
            }
        });

        it('rejects undefined input', () => {
            const result = validateApprovalRequest(undefined);

            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.error).toContain('null or undefined');
            }
        });

        it('rejects non-object input', () => {
            const result = validateApprovalRequest('not an object');

            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.error).toContain('must be an object');
            }
        });

        it('rejects request with missing id', () => {
            const request = createValidRequest();
            delete (request as unknown as Record<string, unknown>).id;

            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.error).toContain('id must be a non-empty string');
            }
        });

        it('rejects request with empty id', () => {
            const request = createValidRequest({ id: '' });
            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.error).toContain('id must be a non-empty string');
            }
        });

        it('rejects request with whitespace-only id', () => {
            const request = createValidRequest({ id: '   ' });
            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.error).toContain('id must be a non-empty string');
            }
        });

        it('rejects request with invalid type', () => {
            const request = createValidRequest({ type: 'invalid-type' as ApprovalType });
            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.error).toContain('type must be one of');
            }
        });

        it('rejects request with missing title', () => {
            const request = createValidRequest();
            delete (request as unknown as Record<string, unknown>).title;

            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.error).toContain('title must be a non-empty string');
            }
        });

        it('rejects request with empty title', () => {
            const request = createValidRequest({ title: '' });
            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.error).toContain('title must be a non-empty string');
            }
        });

        it('rejects request with missing context', () => {
            const request = createValidRequest();
            delete (request as unknown as Record<string, unknown>).context;

            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.error).toContain('context must be a string');
            }
        });

        it('rejects request with non-string context', () => {
            const request = createValidRequest();
            (request as unknown as Record<string, unknown>).context = 123;

            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.error).toContain('context must be a string');
            }
        });

        it('rejects request with missing options', () => {
            const request = createValidRequest();
            delete (request as unknown as Record<string, unknown>).options;

            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.error).toContain('options must be an array');
            }
        });

        it('rejects request with empty options array', () => {
            const request = createValidRequest({ options: [] });
            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.error).toContain('options must not be empty');
            }
        });

        it('rejects request with more than 9 options', () => {
            const options: ApprovalOption[] = [];
            for (let i = 1; i <= 10; i++) {
                options.push(createValidOption({ id: `opt-${i}`, label: `Option ${i}` }));
            }

            const request = createValidRequest({ options });
            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.error).toContain('must not exceed 9 items');
            }
        });

        it('rejects request with duplicate option ids', () => {
            const request = createValidRequest({
                options: [
                    createValidOption({ id: 'duplicate-id', label: 'First' }),
                    createValidOption({ id: 'duplicate-id', label: 'Second' }),
                ],
            });
            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.error).toContain('duplicate option id');
            }
        });

        it('rejects option with missing id', () => {
            const option = createValidOption();
            delete (option as unknown as Record<string, unknown>).id;

            const request = createValidRequest({ options: [option] });
            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.error).toContain('Option 1');
                expect(result.error).toContain('id must be a non-empty string');
            }
        });

        it('rejects option with empty id', () => {
            const request = createValidRequest({
                options: [createValidOption({ id: '' })],
            });
            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.error).toContain('Option 1');
                expect(result.error).toContain('id must be a non-empty string');
            }
        });

        it('rejects option with missing label', () => {
            const option = createValidOption();
            delete (option as unknown as Record<string, unknown>).label;

            const request = createValidRequest({ options: [option] });
            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.error).toContain('Option 1');
                expect(result.error).toContain('label must be a non-empty string');
            }
        });

        it('rejects option with empty label', () => {
            const request = createValidRequest({
                options: [createValidOption({ label: '' })],
            });
            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.error).toContain('Option 1');
                expect(result.error).toContain('label must be a non-empty string');
            }
        });

        it('rejects option with invalid action', () => {
            const request = createValidRequest({
                options: [createValidOption({ action: 'invalid' as ApprovalAction })],
            });
            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.error).toContain('Option 1');
                expect(result.error).toContain('action must be one of');
            }
        });

        it('rejects option with non-string description', () => {
            const option = createValidOption();
            (option as unknown as Record<string, unknown>).description = 123;

            const request = createValidRequest({ options: [option] });
            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.error).toContain('Option 1');
                expect(result.error).toContain('description must be a string');
            }
        });

        it('rejects recommendedOptionId that does not match any option', () => {
            const request = createValidRequest({
                options: [createValidOption({ id: 'opt-1' })],
                recommendedOptionId: 'non-existent',
            });
            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.error).toContain('does not match any option id');
            }
        });

        it('rejects non-string recommendedOptionId', () => {
            const request = createValidRequest();
            (request as unknown as Record<string, unknown>).recommendedOptionId = 123;

            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.error).toContain('recommendedOptionId must be a string');
            }
        });

        it('rejects null option in options array', () => {
            const request = createValidRequest({
                options: [null as unknown as ApprovalOption],
            });
            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.error).toContain('Option 1');
                expect(result.error).toContain('must be an object');
            }
        });

        it('reports correct option index in error messages', () => {
            const request = createValidRequest({
                options: [
                    createValidOption({ id: 'opt-1' }),
                    createValidOption({ id: 'opt-2' }),
                    createValidOption({ id: 'opt-3', label: '' }), // Invalid - 3rd option
                ],
            });
            const result = validateApprovalRequest(request);

            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.error).toContain('Option 3');
            }
        });
    });
});
