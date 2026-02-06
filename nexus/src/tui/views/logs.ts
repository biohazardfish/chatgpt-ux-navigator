import type { TuiState } from '../state.ts';

export function render(container: any, _state: TuiState): void {
    container.setContent(['{bold}Logs{/bold}', '', '(placeholder)'].join('\n'));
}
