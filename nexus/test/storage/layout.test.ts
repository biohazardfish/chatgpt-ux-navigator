import { describe, it, expect } from 'bun:test';
import { 
    validateProjectId, 
    getIsoTimestamp, 
    getDateString,
    PROJECTS_DIR,
    PROJECT_FILE,
    PLAN_FILE,
    NOTES_FILE,
    DECISIONS_DIR,
    TASKS_DIR,
    META_FILE,
    TASK_FILE,
    REPORTS_DIR
} from '../../src/storage/layout';

describe('Storage Layout Constants', () => {
    it('should have correct directory names', () => {
        expect(PROJECTS_DIR).toBe('projects');
        expect(DECISIONS_DIR).toBe('decisions');
        expect(TASKS_DIR).toBe('tasks');
        expect(REPORTS_DIR).toBe('reports');
    });

    it('should have correct file names', () => {
        expect(PROJECT_FILE).toBe('project.md');
        expect(PLAN_FILE).toBe('plan.md');
        expect(NOTES_FILE).toBe('notes.md');
        expect(META_FILE).toBe('meta.json');
        expect(TASK_FILE).toBe('task.md');
    });
});

describe('validateProjectId', () => {
    it('should allow valid IDs', () => {
        expect(validateProjectId('my-project')).toBe(true);
        expect(validateProjectId('project123')).toBe(true);
        expect(validateProjectId('a-b-c')).toBe(true);
        expect(validateProjectId('123')).toBe(true);
    });

    it('should reject IDs with uppercase letters', () => {
        expect(validateProjectId('My-Project')).toBe(false);
        expect(validateProjectId('PROJECT')).toBe(false);
    });

    it('should reject IDs with spaces', () => {
        expect(validateProjectId('my project')).toBe(false);
    });

    it('should reject IDs with special characters', () => {
        expect(validateProjectId('project_123')).toBe(false);
        expect(validateProjectId('project@123')).toBe(false);
        expect(validateProjectId('project!')).toBe(false);
    });

    it('should reject empty IDs', () => {
        expect(validateProjectId('')).toBe(false);
    });
});

describe('Date Utilities', () => {
    it('getIsoTimestamp should return a valid ISO string', () => {
        const ts = getIsoTimestamp();
        expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
        expect(new Date(ts).toISOString()).toBe(ts);
    });

    it('getDateString should return YYYY-MM-DD format', () => {
        const ds = getDateString();
        expect(ds).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = String(now.getUTCMonth() + 1).padStart(2, '0');
        const day = String(now.getUTCDate()).padStart(2, '0');
        expect(ds).toBe(`${year}-${month}-${day}`);
    });
});
