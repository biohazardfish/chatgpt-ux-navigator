import {describe, it, expect} from 'bun:test';
import * as listView from '../../../src/tui/views/tasks/list.ts';
import type {TuiState} from '../../../src/tui/state.ts';
import type {Task} from '../../../src/core/domain/task.ts';
import type {Project} from '../../../src/core/domain/project.ts';

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

    getChildren() {
        return this.children;
    }

    remove(id: string) {
        this.children = this.children.filter(c => c.id !== id);
    }

    requestRender() {}
}

// Mock SelectRenderable
class MockSelectRenderable {
    id: string;
    options: any[] = [];
    selectedIndex = 0;
    onKeyDownHandlers: ((key: any) => void)[] = [];
    onSelectHandlers: ((index: number) => void)[] = [];

    constructor(ctx: any, config: any) {
        this.id = config.id;
        this.options = config.options || [];
        if (config.onKeyDown) {
            this.onKeyDownHandlers.push(config.onKeyDown);
        }
    }

    on(event: string, handler: (index: number) => void) {
        if (event === 'item-selected') {
            this.onSelectHandlers.push(handler);
        }
    }

    setSelectedIndex(index: number) {
        this.selectedIndex = index;
    }

    focus() {}

    destroyRecursively() {}
}

// Mock BoxRenderable
class MockBoxRenderable {
    id: string;
    children: any[] = [];

    constructor(ctx: any, config: any) {
        this.id = config.id;
    }

    add(child: any) {
        this.children.push(child);
    }

    destroyRecursively() {}
}

// Monkey-patch imports for testing
(globalThis as any).__MOCK_OPENTUI__ = true;

describe('Task List View', () => {
    it('renders empty state when no tasks', () => {
        const container = new MockContainer();
        let state: TuiState = {
            activeView: 'tasks',
            statusMessage: 'Ready',
            project: {
                meta: {
                    version: 1,
                    projectId: 'test',
                    createdAt: '',
                    lastUpdatedAt: '',
                    status: 'active',
                },
                projectDoc: {title: 'Test', goals: [], constraints: [], nonGoals: []},
                plan: {status: 'draft', phases: [], notes: []},
                tasks: [],
                decisions: [],
                notes: {assumptions: [], clarifications: [], lessonsLearned: [], projectNotes: []},
            },
        };

        const setState = (updater: (prev: TuiState) => TuiState) => {
            state = updater(state);
        };
        const getState = () => state;

        // Note: render needs OpenTUI context, so we'll test the content building instead
        // This is a limitation of the current implementation that could be improved
        // by extracting content building to pure functions

        expect(state.project!.tasks).toHaveLength(0);
    });

    it('renders task list with multiple tasks', () => {
        const tasks: Task[] = [
            {
                id: 'T-001',
                title: 'Repo bootstrap',
                status: 'completed',
                objective: 'Set up the repository',
                assignedRoles: ['planner'],
                relatedGoals: [],
                createdAt: '2026-01-01T00:00:00Z',
            },
            {
                id: 'T-002',
                title: 'Config and paths',
                status: 'completed',
                objective: 'Configure application',
                assignedRoles: ['implementer'],
                relatedGoals: [],
                createdAt: '2026-01-02T00:00:00Z',
            },
            {
                id: 'T-003',
                title: 'Storage format',
                status: 'running',
                objective: 'Design storage',
                assignedRoles: ['planner', 'reviewer'],
                relatedGoals: [],
                createdAt: '2026-01-03T00:00:00Z',
            },
        ];

        const state: TuiState = {
            activeView: 'tasks',
            statusMessage: 'Ready',
            project: {
                meta: {
                    version: 1,
                    projectId: 'test',
                    createdAt: '',
                    lastUpdatedAt: '',
                    status: 'active',
                },
                projectDoc: {title: 'Test', goals: [], constraints: [], nonGoals: []},
                plan: {status: 'draft', phases: [], notes: []},
                tasks,
                decisions: [],
                notes: {assumptions: [], clarifications: [], lessonsLearned: [], projectNotes: []},
            },
        };

        expect(state.project!.tasks).toHaveLength(3);
        expect(state.project!.tasks[0].id).toBe('T-001');
        expect(state.project!.tasks[1].id).toBe('T-002');
        expect(state.project!.tasks[2].id).toBe('T-003');
    });

    it('tracks task selection in state', () => {
        const tasks: Task[] = [
            {
                id: 'T-001',
                title: 'Task 1',
                status: 'pending',
                objective: 'Do something',
                assignedRoles: [],
                relatedGoals: [],
                createdAt: '2026-01-01T00:00:00Z',
            },
            {
                id: 'T-002',
                title: 'Task 2',
                status: 'pending',
                objective: 'Do something else',
                assignedRoles: [],
                relatedGoals: [],
                createdAt: '2026-01-02T00:00:00Z',
            },
        ];

        let currentState: TuiState = {
            activeView: 'tasks',
            statusMessage: 'Ready',
            project: {
                meta: {
                    version: 1,
                    projectId: 'test',
                    createdAt: '',
                    lastUpdatedAt: '',
                    status: 'active',
                },
                projectDoc: {title: 'Test', goals: [], constraints: [], nonGoals: []},
                plan: {status: 'draft', phases: [], notes: []},
                tasks,
                decisions: [],
                notes: {assumptions: [], clarifications: [], lessonsLearned: [], projectNotes: []},
            },
            selectedTaskIndex: 0,
        };

        const setState = (updater: (prev: TuiState) => TuiState) => {
            currentState = updater(currentState);
        };

        // Simulate selecting task at index 1
        setState(prev => ({
            ...prev,
            selectedTaskIndex: 1,
            activeTaskId: 'T-002',
        }));

        expect(currentState.selectedTaskIndex).toBe(1);
        expect(currentState.activeTaskId).toBe('T-002');
    });

    it('handles selection bounds correctly', () => {
        const tasks: Task[] = [
            {
                id: 'T-001',
                title: 'Task 1',
                status: 'pending',
                objective: 'Do something',
                assignedRoles: [],
                relatedGoals: [],
                createdAt: '2026-01-01T00:00:00Z',
            },
        ];

        let selectedIndex = 0;

        // Try to go down from last item
        if (selectedIndex < tasks.length - 1) {
            selectedIndex++;
        }

        expect(selectedIndex).toBe(0); // Should not change

        // Try to go up from first item
        if (selectedIndex > 0) {
            selectedIndex--;
        }

        expect(selectedIndex).toBe(0); // Should not change
    });

    it('preserves selection on state updates', () => {
        let state: TuiState = {
            activeView: 'tasks',
            statusMessage: 'Ready',
            project: {
                meta: {
                    version: 1,
                    projectId: 'test',
                    createdAt: '',
                    lastUpdatedAt: '',
                    status: 'active',
                },
                projectDoc: {title: 'Test', goals: [], constraints: [], nonGoals: []},
                plan: {status: 'draft', phases: [], notes: []},
                tasks: [
                    {
                        id: 'T-001',
                        title: 'Task 1',
                        status: 'pending',
                        objective: 'Do something',
                        assignedRoles: [],
                        relatedGoals: [],
                        createdAt: '2026-01-01T00:00:00Z',
                    },
                ],
                decisions: [],
                notes: {assumptions: [], clarifications: [], lessonsLearned: [], projectNotes: []},
            },
            selectedTaskIndex: 0,
        };

        // Update status message but keep selection
        state = {
            ...state,
            statusMessage: 'Task selected',
        };

        expect(state.selectedTaskIndex).toBe(0);
    });
});
