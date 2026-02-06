import type { TuiState } from '../state.ts';

export function render(container: any, _state: TuiState): void {
    container.setContent(['{bold}Dashboard{/bold}', '', '(placeholder)'].join('\n'));
}
