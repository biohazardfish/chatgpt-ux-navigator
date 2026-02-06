import type { TuiState } from '../state.ts';

export function render(container: any, _state: TuiState): void {
    container.setContent(['{bold}Decisions{/bold}', '', '(placeholder)'].join('\n'));
}
