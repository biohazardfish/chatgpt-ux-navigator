import { describe, it, expect } from 'bun:test';
import {
  createInitialState,
  setActiveView,
  setStatusMessage,
  type TuiState,
  type TuiViewId,
} from '../../src/tui/state';

describe('TuiState helpers', () => {
  describe('createInitialState', () => {
    it('creates default state with dashboard view and Ready status', () => {
      const state = createInitialState();

      expect(state).toEqual({
        lastProjectId: undefined,
        lastTaskId: undefined,
        activeView: 'dashboard',
        statusMessage: 'Ready',
      });
    });

    it('overrides activeView when provided', () => {
      const state = createInitialState({ activeView: 'tasks' });

      expect(state.activeView).toBe('tasks');
      expect(state.statusMessage).toBe('Ready');
      expect(state.lastProjectId).toBeUndefined();
    });

    it('overrides statusMessage when provided', () => {
      const state = createInitialState({ statusMessage: 'Loading...' });

      expect(state.statusMessage).toBe('Loading...');
      expect(state.activeView).toBe('dashboard');
    });

    it('overrides lastProjectId when provided', () => {
      const state = createInitialState({ lastProjectId: 'proj-123' });

      expect(state.lastProjectId).toBe('proj-123');
      expect(state.activeView).toBe('dashboard');
    });

    it('overrides lastTaskId when provided', () => {
      const state = createInitialState({ lastTaskId: 'task-456' });

      expect(state.lastTaskId).toBe('task-456');
      expect(state.activeView).toBe('dashboard');
    });

    it('overrides multiple fields simultaneously', () => {
      const state = createInitialState({
        lastProjectId: 'proj-123',
        lastTaskId: 'task-456',
        activeView: 'sessions',
        statusMessage: 'Processing...',
      });

      expect(state).toEqual({
        lastProjectId: 'proj-123',
        lastTaskId: 'task-456',
        activeView: 'sessions',
        statusMessage: 'Processing...',
      });
    });

    it('respects all valid view IDs', () => {
      const viewIds: TuiViewId[] = ['dashboard', 'tasks', 'sessions', 'decisions', 'logs'];

      for (const viewId of viewIds) {
        const state = createInitialState({ activeView: viewId });
        expect(state.activeView).toBe(viewId);
      }
    });
  });

  describe('setActiveView', () => {
    it('returns the same reference when view is unchanged', () => {
      const state = createInitialState({ activeView: 'dashboard' });
      const next = setActiveView(state, 'dashboard');

      expect(next).toBe(state);
    });

    it('returns a new state object when view changes', () => {
      const state = createInitialState({ activeView: 'dashboard' });
      const next = setActiveView(state, 'tasks');

      expect(next).not.toBe(state);
      expect(next.activeView).toBe('tasks');
    });

    it('preserves other state properties when changing view', () => {
      const state = createInitialState({
        lastProjectId: 'proj-123',
        lastTaskId: 'task-456',
        statusMessage: 'Custom Status',
      });
      const next = setActiveView(state, 'sessions');

      expect(next.lastProjectId).toBe('proj-123');
      expect(next.lastTaskId).toBe('task-456');
      expect(next.statusMessage).toBe('Custom Status');
      expect(next.activeView).toBe('sessions');
    });

    it('is idempotent for same view transitions', () => {
      const state = createInitialState({ activeView: 'logs' });
      const next1 = setActiveView(state, 'logs');
      const next2 = setActiveView(next1, 'logs');

      expect(next1).toBe(state);
      expect(next2).toBe(next1);
      expect(next2).toBe(state);
    });

    it('handles transitions between all view types', () => {
      const viewIds: TuiViewId[] = ['dashboard', 'tasks', 'sessions', 'decisions', 'logs'];

      for (let i = 0; i < viewIds.length; i++) {
        const currentView = viewIds[i];
        const nextView = viewIds[(i + 1) % viewIds.length];

        const state = createInitialState({ activeView: currentView });
        const next = setActiveView(state, nextView);

        expect(next.activeView).toBe(nextView);
        expect(next).not.toBe(state);
      }
    });

    it('ensures immutability of original state', () => {
      const state = createInitialState({ activeView: 'dashboard' });
      const originalView = state.activeView;

      setActiveView(state, 'tasks');

      expect(state.activeView).toBe(originalView);
      expect(state.activeView).toBe('dashboard');
    });
  });

  describe('setStatusMessage', () => {
    it('returns the same reference when status message is unchanged', () => {
      const state = createInitialState({ statusMessage: 'Ready' });
      const next = setStatusMessage(state, 'Ready');

      expect(next).toBe(state);
    });

    it('returns a new state object when status message changes', () => {
      const state = createInitialState({ statusMessage: 'Ready' });
      const next = setStatusMessage(state, 'Processing...');

      expect(next).not.toBe(state);
      expect(next.statusMessage).toBe('Processing...');
    });

    it('preserves other state properties when changing message', () => {
      const state = createInitialState({
        lastProjectId: 'proj-123',
        lastTaskId: 'task-456',
        activeView: 'sessions',
      });
      const next = setStatusMessage(state, 'Error: Connection failed');

      expect(next.lastProjectId).toBe('proj-123');
      expect(next.lastTaskId).toBe('task-456');
      expect(next.activeView).toBe('sessions');
      expect(next.statusMessage).toBe('Error: Connection failed');
    });

    it('is idempotent for same message transitions', () => {
      const state = createInitialState({ statusMessage: 'Custom' });
      const next1 = setStatusMessage(state, 'Custom');
      const next2 = setStatusMessage(next1, 'Custom');

      expect(next1).toBe(state);
      expect(next2).toBe(next1);
      expect(next2).toBe(state);
    });

    it('handles rapid successive message changes', () => {
      let state = createInitialState({ statusMessage: 'Start' });

      state = setStatusMessage(state, 'Loading...');
      expect(state.statusMessage).toBe('Loading...');

      state = setStatusMessage(state, 'Processing...');
      expect(state.statusMessage).toBe('Processing...');

      state = setStatusMessage(state, 'Complete');
      expect(state.statusMessage).toBe('Complete');
    });

    it('ensures immutability of original state', () => {
      const state = createInitialState({ statusMessage: 'Ready' });
      const originalMessage = state.statusMessage;

      setStatusMessage(state, 'New Message');

      expect(state.statusMessage).toBe(originalMessage);
      expect(state.statusMessage).toBe('Ready');
    });

    it('handles empty and whitespace-only messages', () => {
      const state = createInitialState({ statusMessage: 'Ready' });

      const emptyNext = setStatusMessage(state, '');
      expect(emptyNext.statusMessage).toBe('');
      expect(emptyNext).not.toBe(state);

      const whitespaceNext = setStatusMessage(state, '   ');
      expect(whitespaceNext.statusMessage).toBe('   ');
      expect(whitespaceNext).not.toBe(state);
    });
  });

  describe('combined state transitions', () => {
    it('chains multiple transitions while respecting immutability', () => {
      let state = createInitialState({
        lastProjectId: 'proj-123',
        activeView: 'dashboard',
        statusMessage: 'Ready',
      });

      const state1 = state;
      state = setActiveView(state, 'tasks');
      const state2 = state;

      expect(state2).not.toBe(state1);
      expect(state1.activeView).toBe('dashboard');
      expect(state2.activeView).toBe('tasks');

      state = setStatusMessage(state, 'Loading tasks...');
      const state3 = state;

      expect(state3).not.toBe(state2);
      expect(state2.statusMessage).toBe('Ready');
      expect(state3.statusMessage).toBe('Loading tasks...');
    });

    it('handles mixed no-op and real transitions', () => {
      let state = createInitialState({ activeView: 'dashboard', statusMessage: 'Ready' });
      const initial = state;

      state = setActiveView(state, 'dashboard'); // No-op
      expect(state).toBe(initial);

      state = setStatusMessage(state, 'Ready'); // No-op
      expect(state).toBe(initial);

      state = setActiveView(state, 'tasks'); // Real change
      expect(state).not.toBe(initial);
      expect(state.activeView).toBe('tasks');

      state = setStatusMessage(state, 'Ready'); // Real change
      expect(state).not.toBe(initial);
      expect(state.statusMessage).toBe('Ready');
    });
  });
});
