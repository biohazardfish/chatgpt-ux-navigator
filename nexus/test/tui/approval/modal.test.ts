import {describe, it, expect} from 'bun:test';
import {formatApprovalContent, formatOptionLine, wrapText} from '../../../src/tui/approval/modal';
import type {ApprovalRequest, ApprovalOption} from '../../../src/tui/approval/types';

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

function createMockOption(overrides?: Partial<ApprovalOption>): ApprovalOption {
    return {
        id: 'opt-1',
        label: 'Approve',
        action: 'accept',
        ...overrides,
    };
}

function createMockRequest(overrides?: Partial<ApprovalRequest>): ApprovalRequest {
    return {
        id: 'approval-1',
        type: 'plan-approval',
        title: 'Plan Approval',
        context: 'The initial project plan has been generated.',
        options: [createMockOption()],
        ...overrides,
    };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('Approval modal formatting', () => {
    describe('formatApprovalContent', () => {
        it('includes title at the top', () => {
            const request = createMockRequest({title: 'My Custom Title'});
            const content = formatApprovalContent(request, 60);

            const lines = content.split('\n');
            expect(lines[0]).toBe('My Custom Title');
        });

        it('includes context section with label', () => {
            const request = createMockRequest({context: 'Some context text.'});
            const content = formatApprovalContent(request, 60);

            expect(content).toContain('Context:');
            expect(content).toContain('Some context text.');
        });

        it('word-wraps long context text', () => {
            const longContext =
                'This is a very long context string that should be wrapped across multiple lines when the width is limited.';
            const request = createMockRequest({context: longContext});
            const content = formatApprovalContent(request, 40);

            const lines = content.split('\n');
            const contextStartIndex = lines.findIndex(l => l === 'Context:');
            expect(contextStartIndex).toBeGreaterThan(-1);

            // Check that at least one wrapped line exists after Context:
            const contextLines = lines.slice(contextStartIndex + 1);
            const wrappedLines = contextLines.filter(l => l.length > 0 && l.length <= 40);
            expect(wrappedLines.length).toBeGreaterThan(1);
        });

        it('formats options with number prefixes [1], [2], etc.', () => {
            const request = createMockRequest({
                options: [
                    createMockOption({id: 'opt-1', label: 'First Option'}),
                    createMockOption({id: 'opt-2', label: 'Second Option'}),
                    createMockOption({id: 'opt-3', label: 'Third Option'}),
                ],
            });
            const content = formatApprovalContent(request, 60);

            expect(content).toContain('[1] First Option');
            expect(content).toContain('[2] Second Option');
            expect(content).toContain('[3] Third Option');
        });

        it('marks recommended option with "(recommended)"', () => {
            const request = createMockRequest({
                options: [
                    createMockOption({id: 'opt-1', label: 'First'}),
                    createMockOption({id: 'opt-2', label: 'Second'}),
                ],
                recommendedOptionId: 'opt-1',
            });
            const content = formatApprovalContent(request, 60);

            expect(content).toContain('[1] First  (recommended)');
            expect(content).not.toContain('[2] Second  (recommended)');
        });

        it('includes option descriptions when present', () => {
            const request = createMockRequest({
                options: [
                    createMockOption({
                        id: 'opt-1',
                        label: 'Approve',
                        description: 'Proceed with the plan as proposed.',
                    }),
                ],
            });
            const content = formatApprovalContent(request, 60);

            expect(content).toContain('Proceed with the plan as proposed.');
        });

        it('indents option descriptions', () => {
            const request = createMockRequest({
                options: [
                    createMockOption({
                        id: 'opt-1',
                        label: 'Approve',
                        description: 'Description text here.',
                    }),
                ],
            });
            const content = formatApprovalContent(request, 60);

            const lines = content.split('\n');
            const descLine = lines.find(l => l.includes('Description text here.'));
            expect(descLine).toBeDefined();
            expect(descLine!.startsWith('    ')).toBe(true); // 4-space indent
        });

        it('word-wraps long option descriptions', () => {
            const longDesc =
                'This is a very long description that should be wrapped when displayed in the modal window.';
            const request = createMockRequest({
                options: [
                    createMockOption({
                        id: 'opt-1',
                        label: 'Approve',
                        description: longDesc,
                    }),
                ],
            });
            const content = formatApprovalContent(request, 40);

            // Description should be split across multiple lines
            const lines = content.split('\n');
            const indentedLines = lines.filter(l => l.startsWith('    ') && l.trim().length > 0);
            expect(indentedLines.length).toBeGreaterThan(1);
        });

        it('includes instruction text at the bottom', () => {
            const request = createMockRequest();
            const content = formatApprovalContent(request, 60);

            const lines = content.split('\n');
            const lastNonEmptyLine = lines.filter(l => l.trim().length > 0).pop();
            expect(lastNonEmptyLine).toBe('Press number key to choose');
        });

        it('handles empty context gracefully', () => {
            const request = createMockRequest({context: ''});
            const content = formatApprovalContent(request, 60);

            expect(content).not.toContain('Context:');
            expect(content).toContain('Options:');
        });

        it('handles whitespace-only context as empty', () => {
            const request = createMockRequest({context: '   '});
            const content = formatApprovalContent(request, 60);

            expect(content).not.toContain('Context:');
        });

        it('handles options without descriptions', () => {
            const request = createMockRequest({
                options: [
                    createMockOption({id: 'opt-1', label: 'Simple Option', description: undefined}),
                ],
            });
            const content = formatApprovalContent(request, 60);

            expect(content).toContain('[1] Simple Option');
            // Should not have extra indented lines for description
            const lines = content.split('\n');
            const optionIndex = lines.findIndex(l => l.includes('[1] Simple Option'));
            const nextLine = lines[optionIndex + 1] || '';
            // Next line should not be indented description
            expect(nextLine.startsWith('    ')).toBe(false);
        });

        it('generates correct structure for all approval types', () => {
            const types: ApprovalRequest['type'][] = [
                'plan-approval',
                'task-acceptance',
                'conflict-resolution',
                'project-completion',
            ];

            for (const type of types) {
                const request = createMockRequest({type});
                const content = formatApprovalContent(request, 60);

                // All should have the same structure regardless of type
                expect(content).toContain('Plan Approval'); // title
                expect(content).toContain('Context:');
                expect(content).toContain('Options:');
                expect(content).toContain('Press number key to choose');
            }
        });
    });

    describe('wrapText', () => {
        it('returns single line for short text', () => {
            const result = wrapText('Hello world', 50);

            expect(result).toEqual(['Hello world']);
        });

        it('wraps text at word boundaries', () => {
            const result = wrapText('Hello world how are you today', 15);

            expect(result.length).toBeGreaterThan(1);
            for (const line of result) {
                expect(line.length).toBeLessThanOrEqual(15);
            }
        });

        it('handles text without spaces (force break)', () => {
            const result = wrapText('abcdefghijklmnopqrstuvwxyz', 10);

            expect(result).toEqual(['abcdefghij', 'klmnopqrst', 'uvwxyz']);
        });

        it('preserves existing line breaks', () => {
            const result = wrapText('Line one\nLine two\nLine three', 50);

            expect(result).toEqual(['Line one', 'Line two', 'Line three']);
        });

        it('preserves empty lines', () => {
            const result = wrapText('First\n\nThird', 50);

            expect(result).toEqual(['First', '', 'Third']);
        });

        it('handles various widths', () => {
            const text = 'The quick brown fox jumps over the lazy dog';

            // Width of 10
            const result10 = wrapText(text, 10);
            for (const line of result10) {
                expect(line.length).toBeLessThanOrEqual(10);
            }

            // Width of 20
            const result20 = wrapText(text, 20);
            for (const line of result20) {
                expect(line.length).toBeLessThanOrEqual(20);
            }

            // Width of 100 (should be single line)
            const result100 = wrapText(text, 100);
            expect(result100).toEqual([text]);
        });

        it('handles zero width gracefully', () => {
            const result = wrapText('Hello', 0);

            expect(result).toEqual(['Hello']);
        });

        it('handles negative width gracefully', () => {
            const result = wrapText('Hello', -5);

            expect(result).toEqual(['Hello']);
        });

        it('handles empty string', () => {
            const result = wrapText('', 50);

            expect(result).toEqual(['']);
        });

        it('handles whitespace-only string', () => {
            const result = wrapText('   ', 50);

            // Should result in empty array or single empty string depending on implementation
            expect(result.length).toBeLessThanOrEqual(1);
        });

        it('handles multiple spaces between words', () => {
            const result = wrapText('Word1   Word2', 50);

            // Multiple spaces are collapsed when splitting by /\s+/
            expect(result.join(' ')).toContain('Word1');
            expect(result.join(' ')).toContain('Word2');
        });

        it('handles long word followed by short words', () => {
            const result = wrapText('supercalifragilisticexpialidocious is a word', 15);

            // Long word should be broken, then normal wrapping continues
            expect(result.length).toBeGreaterThan(1);
            const lastLine = result[result.length - 1];
            expect(lastLine).toContain('word');
        });
    });

    describe('formatOptionLine', () => {
        it('formats option with 1-based index', () => {
            const option = createMockOption({label: 'My Option'});
            const result = formatOptionLine(option, 0, false); // index 0 = display as [1]

            expect(result).toBe('[1] My Option');
        });

        it('adds "(recommended)" suffix when flagged', () => {
            const option = createMockOption({label: 'My Option'});
            const result = formatOptionLine(option, 0, true);

            expect(result).toBe('[1] My Option  (recommended)');
        });

        it('handles various indices', () => {
            const option = createMockOption({label: 'Option'});

            expect(formatOptionLine(option, 0, false)).toBe('[1] Option');
            expect(formatOptionLine(option, 1, false)).toBe('[2] Option');
            expect(formatOptionLine(option, 8, false)).toBe('[9] Option');
        });

        it('handles long labels', () => {
            const option = createMockOption({
                label: 'This is a very long option label that describes the action in detail',
            });
            const result = formatOptionLine(option, 0, false);

            expect(result).toContain('[1]');
            expect(result).toContain('This is a very long option label');
        });

        it('does not add recommended suffix when not recommended', () => {
            const option = createMockOption({label: 'My Option'});
            const result = formatOptionLine(option, 0, false);

            expect(result).not.toContain('recommended');
        });
    });
});
