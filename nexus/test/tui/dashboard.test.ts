import {describe, it, expect} from 'bun:test';
import {render} from '../../src/tui/views/dashboard.ts';
import type {TuiState} from '../../src/tui/state.ts';
import type {Project} from '../../src/core/domain/project.ts';

// We need to mock renderTextView because checking Symbol-keyed properties on container is tricky
// and TextRenderable might need a real context.
// Alternatively, we can inspect the container if we know the key.

const DASHBOARD_TEXT_KEY = Symbol.for('nexus.tui.view.dashboard.text');

// Mock container
class MockContainer {
    [key: symbol]: any;
    children: any[] = [];
    ctx = {
        requestRender: () => {},
    };

    add(child: any) {
        this.children.push(child);
    }

    requestRender() {}
}

describe('Dashboard View', () => {
    it('renders empty state when no project loaded', () => {
        const container = new MockContainer();
        const state: TuiState = {
            activeView: 'dashboard',
            statusMessage: 'Ready',
            project: undefined,
        };

        render(container, state);

        const textRenderable = container[DASHBOARD_TEXT_KEY];

        const content = textRenderable._text.chunks[0].text;

        expect(content).toContain('No project loaded');
        expect(content).toContain('Press [n] to create a new project');
    });

    it('renders project summary', () => {
        const project: Project = {
            meta: {
                version: 1,
                projectId: 'test-p',
                createdAt: '',
                lastUpdatedAt: '',
                status: 'active',
            },
            projectDoc: {
                title: 'Test Project',
                goals: ['Goal 1', 'Goal 2'],
                constraints: [],
                nonGoals: [],
            },
            plan: {status: 'draft', phases: ['Phase 1', 'Phase 2'], notes: []},
            tasks: [], // Empty tasks
            decisions: [],
            notes: {
                assumptions: ['Assumption 1'],
                clarifications: [],
                lessonsLearned: [],
                projectNotes: [],
            },
        };

        const container = new MockContainer();
        const state: TuiState = {
            activeView: 'dashboard',
            statusMessage: 'Ready',
            project,
        };

        render(container, state);

        const textRenderable = container[DASHBOARD_TEXT_KEY];
        expect(textRenderable).toBeDefined();
        const content = textRenderable._text.chunks[0].text;

        expect(content).toContain('Project: Test Project');
        expect(content).toContain('Status: active');
        expect(content).toContain('Goals:');
        expect(content).toContain('- Goal 1');
        expect(content).toContain('- Goal 2');
        expect(content).toContain('Plan:');
        expect(content).toContain('- Status: draft');
        expect(content).toContain('1. Phase 1');
        expect(content).toContain('2. Phase 2');

        // Tasks (empty)
        expect(content).toContain('Tasks:');
        expect(content).toContain('- Pending: 0');

        // Notes
        expect(content).toContain('Notes:');
        expect(content).toContain('- Assumptions: 1');
    });
});
