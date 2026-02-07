/**
 * Approval modal rendering for TUI approval checkpoints.
 *
 * Renders the approval request as a modal overlay and handles content formatting
 * including word-wrapping for long text.
 */

import type { TuiLayout } from '../layout.ts';
import type { ApprovalRequest, ApprovalOption } from './types.ts';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const DEFAULT_MODAL_WIDTH = 60;
const CONTENT_PADDING = 4; // Left + right padding for content within modal

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Renders the approval modal with the given request content.
 * The modal must already exist in the layout (created by layout.ts).
 */
export function render(layout: TuiLayout, request: ApprovalRequest): void {
    const contentWidth = getContentWidth(layout);
    const content = formatApprovalContent(request, contentWidth);
    layout.approvalOverlayText.content = content;
    layout.approvalOverlay.visible = true;
    layout.approvalOverlay.zIndex = 1001; // Above help overlay (1000)
}

/**
 * Hides the approval modal.
 */
export function hide(layout: TuiLayout): void {
    layout.approvalOverlay.visible = false;
}

/**
 * Renders an error message in the approval modal.
 * Used when the approval request is malformed.
 */
export function renderError(layout: TuiLayout, errorMessage: string): void {
    const lines = [
        'Error: Invalid Approval Request',
        '',
        errorMessage,
        '',
        'Press any number key to dismiss.',
    ];
    layout.approvalOverlayText.content = lines.join('\n');
    layout.approvalOverlay.visible = true;
    layout.approvalOverlay.zIndex = 1001;
}

// -----------------------------------------------------------------------------
// Content Formatting
// -----------------------------------------------------------------------------

/**
 * Formats the approval request into display text for the modal.
 */
export function formatApprovalContent(request: ApprovalRequest, width: number): string {
    const lines: string[] = [];

    // Title
    lines.push(request.title);
    lines.push('');

    // Context section
    if (request.context && request.context.trim().length > 0) {
        lines.push('Context:');
        const wrappedContext = wrapText(request.context, width);
        for (const line of wrappedContext) {
            lines.push(line);
        }
        lines.push('');
    }

    // Options section
    lines.push('Options:');
    for (let i = 0; i < request.options.length; i++) {
        const option = request.options[i];
        const isRecommended = request.recommendedOptionId === option.id;
        const optionLine = formatOptionLine(option, i, isRecommended);
        lines.push(optionLine);

        // Add description if present (indented and wrapped)
        if (option.description && option.description.trim().length > 0) {
            const descWidth = width - 4; // Indent for description
            const wrappedDesc = wrapText(option.description, descWidth);
            for (const descLine of wrappedDesc) {
                lines.push(`    ${descLine}`);
            }
        }
    }

    // Instruction
    lines.push('');
    lines.push('Press number key to choose');

    return lines.join('\n');
}

/**
 * Formats a single option line with its index and optional recommended marker.
 * Index is 1-based for display (user presses 1 for first option).
 */
export function formatOptionLine(option: ApprovalOption, index: number, isRecommended: boolean): string {
    const num = index + 1; // 1-based for display
    const recommendedSuffix = isRecommended ? '  (recommended)' : '';
    return `[${num}] ${option.label}${recommendedSuffix}`;
}

/**
 * Word-wraps text to fit within the specified width.
 * Preserves existing line breaks.
 */
export function wrapText(text: string, width: number): string[] {
    if (width <= 0) return [text];

    const result: string[] = [];
    const paragraphs = text.split('\n');

    for (const paragraph of paragraphs) {
        if (paragraph.length === 0) {
            result.push('');
            continue;
        }

        const words = paragraph.split(/\s+/);
        let currentLine = '';

        for (const word of words) {
            if (word.length === 0) continue;

            // Handle words longer than width (force break)
            if (word.length > width) {
                // Flush current line if any
                if (currentLine.length > 0) {
                    result.push(currentLine);
                    currentLine = '';
                }
                // Break long word into chunks
                let remaining = word;
                while (remaining.length > width) {
                    result.push(remaining.slice(0, width));
                    remaining = remaining.slice(width);
                }
                if (remaining.length > 0) {
                    currentLine = remaining;
                }
                continue;
            }

            // Normal word - check if it fits on current line
            if (currentLine.length === 0) {
                currentLine = word;
            } else if (currentLine.length + 1 + word.length <= width) {
                currentLine += ' ' + word;
            } else {
                // Word doesn't fit - start new line
                result.push(currentLine);
                currentLine = word;
            }
        }

        // Flush remaining content
        if (currentLine.length > 0) {
            result.push(currentLine);
        }
    }

    return result;
}

// -----------------------------------------------------------------------------
// Internal Helpers
// -----------------------------------------------------------------------------

/**
 * Gets the effective content width from the layout.
 * Falls back to default if the overlay width is not determinable.
 */
function getContentWidth(layout: TuiLayout): number {
    // Try to get the actual width from the overlay
    // OpenTUI may provide width as a number or percentage string
    const overlayWidth = layout.approvalOverlay?.width;

    if (typeof overlayWidth === 'number' && overlayWidth > CONTENT_PADDING) {
        return overlayWidth - CONTENT_PADDING;
    }

    // Default fallback
    return DEFAULT_MODAL_WIDTH - CONTENT_PADDING;
}
