import { BoxRenderable, TextRenderable, createCliRenderer } from '@opentui/core';

import type { TuiState, TuiViewId } from './state.ts';

export type TuiLayout = {
    renderer: any;
    header: any;
    headerLeft: any;
    headerRight: any;
    main: any;
    footer: any;
    footerLeft: any;
    footerRight: any;
    helpOverlay: any;
    helpOverlayText: any;
    approvalOverlay: any;
    approvalOverlayText: any;
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

export async function createLayout(options?: { projectId?: string }): Promise<TuiLayout> {
    const renderer = await createCliRenderer({
        useMouse: false,
        exitOnCtrlC: true,
    });

    const header = new BoxRenderable(renderer, {
        id: 'layout-header',
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: 1,
    });

    const headerLeft = new TextRenderable(renderer, {
        id: 'layout-header-left',
        position: 'absolute',
        top: 0,
        left: 0,
        width: '70%',
        height: 1,
        content: '',
    });

    const headerRight = new TextRenderable(renderer, {
        id: 'layout-header-right',
        position: 'absolute',
        top: 0,
        left: '70%',
        width: '30%',
        height: 1,
        content: '',
    });

    header.add(headerLeft);
    header.add(headerRight);
    renderer.root.add(header);

    const footer = new BoxRenderable(renderer, {
        id: 'layout-footer',
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: '100%',
        height: 1,
    });

    const footerLeft = new TextRenderable(renderer, {
        id: 'layout-footer-left',
        position: 'absolute',
        top: 0,
        left: 0,
        width: '70%',
        height: 1,
        content: '',
    });

    const footerRight = new TextRenderable(renderer, {
        id: 'layout-footer-right',
        position: 'absolute',
        top: 0,
        left: '70%',
        width: '30%',
        height: 1,
        content: '',
    });

    footer.add(footerLeft);
    footer.add(footerRight);
    renderer.root.add(footer);

    const main = new BoxRenderable(renderer, {
        id: 'layout-main',
        position: 'absolute',
        top: 1,
        left: 0,
        bottom: 1,
        width: '100%',
        paddingTop: 1,
        paddingLeft: 1,
        paddingRight: 1,
    });
    renderer.root.add(main);

    const helpOverlay = new BoxRenderable(renderer, {
        id: 'layout-help-overlay',
        position: 'absolute',
        top: '20%',
        left: '10%',
        width: '80%',
        height: '60%',
        border: true,
        title: 'Help',
        paddingTop: 1,
        paddingLeft: 1,
        paddingRight: 1,
        paddingBottom: 1,
        visible: false,
    });

    const helpOverlayText = new TextRenderable(renderer, {
        id: 'layout-help-overlay-text',
        width: '100%',
        height: '100%',
        content: [
            'Global',
            '  q  Quit',
            '  ?  Help',
            '  Esc  Back / close overlay',
            '',
            'Views',
            '  1  Dashboard',
            '  2  Tasks',
            '  3  Sessions',
            '  4  Decisions',
            '  5  Logs',
            '',
            '(placeholder)'
        ].join('\n'),
    });
    helpOverlay.add(helpOverlayText);
    renderer.root.add(helpOverlay);

    // Approval overlay - modal for approval checkpoints
    const approvalOverlay = new BoxRenderable(renderer, {
        id: 'layout-approval-overlay',
        position: 'absolute',
        top: '15%',
        left: '15%',
        width: '70%',
        height: '70%',
        border: true,
        title: 'APPROVAL REQUIRED',
        paddingTop: 1,
        paddingLeft: 2,
        paddingRight: 2,
        paddingBottom: 1,
        visible: false,
    });

    const approvalOverlayText = new TextRenderable(renderer, {
        id: 'layout-approval-overlay-text',
        width: '100%',
        height: '100%',
        content: '',
    });
    approvalOverlay.add(approvalOverlayText);
    renderer.root.add(approvalOverlay);

    updateHeader(
        {
            headerLeft,
            headerRight,
        } as TuiLayout,
        options?.projectId
    );
    updateFooter(
        {
            footerLeft,
            footerRight,
        } as TuiLayout,
        { activeView: 'dashboard', statusMessage: 'Ready' } as TuiState
    );

    return {
        renderer,
        header,
        headerLeft,
        headerRight,
        main,
        footer,
        footerLeft,
        footerRight,
        helpOverlay,
        helpOverlayText,
        approvalOverlay,
        approvalOverlayText,
    };
}

export function updateHeader(layout: Pick<TuiLayout, 'headerLeft' | 'headerRight'>, projectId?: string): void {
    const projectLabel = projectId && projectId.trim().length > 0 ? projectLabelText(projectId) : undefined;
    layout.headerLeft.content = projectLabel ? `Nexus - ${projectLabel}` : 'Nexus';
    layout.headerRight.content = '[q] Quit  [?] Help';
}

export function updateFooter(layout: Pick<TuiLayout, 'footerLeft' | 'footerRight'>, state: TuiState): void {
    layout.footerLeft.content = `Status: ${state.statusMessage}`;
    const mode = state.approvalRequest ? 'Approval' : 'Normal';
    layout.footerRight.content = `View: ${viewLabel(state.activeView)}   Mode: ${mode}`;
}

function projectLabelText(projectId: string): string {
    return projectId.replace(/\s+/g, ' ').trim();
}
