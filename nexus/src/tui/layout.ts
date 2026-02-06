// @ts-ignore - blessed has no bundled TS types in this repo
import blessed from 'blessed';

import type { TuiState, TuiViewId } from './state.ts';

export type TuiLayout = {
    screen: any;
    header: any;
    headerLeft: any;
    headerRight: any;
    main: any;
    footer: any;
    footerLeft: any;
    footerRight: any;
    helpOverlay: any;
};

function viewLabel(view: TuiViewId): string {
    switch (view) {
        case 'dashboard':
            return 'Dashboard';
        case 'tasks':
            return 'Tasks';
        case 'sessions':
            return 'Sessions';
        case 'decisions':
            return 'Decisions';
        case 'logs':
            return 'Logs';
    }
}

export function createLayout(options?: { projectId?: string }): TuiLayout {
    const screen = blessed.screen({
        smartCSR: true,
        title: 'Nexus',
        mouse: false
    });

    const header = blessed.box({
        parent: screen,
        top: 0,
        left: 0,
        height: 1,
        width: '100%'
    });

    const headerLeft = blessed.box({
        parent: header,
        top: 0,
        left: 0,
        height: 1,
        width: '70%',
        tags: true
    });

    const headerRight = blessed.box({
        parent: header,
        top: 0,
        right: 0,
        height: 1,
        width: '30%',
        align: 'right',
        tags: true
    });

    const footer = blessed.box({
        parent: screen,
        bottom: 0,
        left: 0,
        height: 1,
        width: '100%'
    });

    const footerLeft = blessed.box({
        parent: footer,
        top: 0,
        left: 0,
        height: 1,
        width: '70%',
        tags: true
    });

    const footerRight = blessed.box({
        parent: footer,
        top: 0,
        right: 0,
        height: 1,
        width: '30%',
        align: 'right',
        tags: true
    });

    const main = blessed.box({
        parent: screen,
        top: 1,
        left: 0,
        bottom: 1,
        width: '100%',
        tags: true,
        padding: { left: 1, right: 1, top: 1, bottom: 0 }
    });

    const helpOverlay = blessed.box({
        parent: screen,
        top: 'center',
        left: 'center',
        width: '80%',
        height: '60%',
        border: { type: 'line' },
        hidden: true,
        tags: true,
        label: ' Help ',
        padding: { left: 1, right: 1, top: 1, bottom: 1 },
        content: [
            '{bold}Global{/bold}',
            '  q  Quit',
            '  ?  Help',
            '  Esc  Back / close overlay',
            '',
            '{bold}Views{/bold}',
            '  1  Dashboard',
            '  2  Tasks',
            '  3  Sessions',
            '  4  Decisions',
            '  5  Logs',
            '',
            '(placeholder)'
        ].join('\n')
    });

    updateHeader({ headerLeft, headerRight } as any, options?.projectId);
    updateFooter({ footerLeft, footerRight } as any, { activeView: 'dashboard', statusMessage: 'Ready' });

    return {
        screen,
        header,
        headerLeft,
        headerRight,
        main,
        footer,
        footerLeft,
        footerRight,
        helpOverlay
    };
}

export function updateHeader(layout: Pick<TuiLayout, 'headerLeft' | 'headerRight'>, projectId?: string): void {
    const projectLabel = projectId && projectId.trim().length > 0 ? projectId : undefined;
    layout.headerLeft.setContent(projectLabel ? `{bold}Nexus{/bold} — ${projectLabel}` : `{bold}Nexus{/bold}`);
    layout.headerRight.setContent('[q] Quit  [?] Help');
}

export function updateFooter(layout: Pick<TuiLayout, 'footerLeft' | 'footerRight'>, state: TuiState): void {
    layout.footerLeft.setContent(`Status: ${state.statusMessage}`);
    layout.footerRight.setContent(`View: ${viewLabel(state.activeView)}   Mode: Normal`);
}
