import type { TuiState } from '../state.ts';
import { renderTextView } from './textView.ts';

const DASHBOARD_TEXT_KEY = Symbol.for('nexus.tui.view.dashboard.text');

export function render(container: any, _state: TuiState): void {
    renderTextView(container, DASHBOARD_TEXT_KEY, 'dashboard-view-text', ['Dashboard', '', '(placeholder)'].join('\n'));
}
