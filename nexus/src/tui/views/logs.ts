import type { TuiState } from '../state.ts';
import { renderTextView } from './textView.ts';

const LOGS_TEXT_KEY = Symbol.for('nexus.tui.view.logs.text');

export function render(container: any, _state: TuiState): void {
    renderTextView(container, LOGS_TEXT_KEY, 'logs-view-text', ['Logs', '', '(placeholder)'].join('\n'));
}
