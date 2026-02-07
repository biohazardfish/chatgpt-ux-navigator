import type {TuiState} from '../state.ts';
import {renderTextView} from './textView.ts';

const DECISIONS_TEXT_KEY = Symbol.for('nexus.tui.view.decisions.text');

export function render(container: any, _state: TuiState): void {
    renderTextView(
        container,
        DECISIONS_TEXT_KEY,
        'decisions-view-text',
        ['Decisions', '', '(placeholder)'].join('\n')
    );
}
