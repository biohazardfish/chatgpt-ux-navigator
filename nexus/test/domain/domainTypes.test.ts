import {describe, it, expect} from 'bun:test';
import {DomainParseError} from '../../src/core/domain/index.ts';

describe('DomainParseError', () => {
    it('should expose metadata fields', () => {
        const details = {
            expected: '# Goals',
            found: '# Goal',
        };

        const error = new DomainParseError('Missing Goals section', {
            kind: 'missing_section',
            path: 'project.md',
            section: 'Goals',
            details,
        });

        expect(error.name).toBe('DomainParseError');
        expect(error.kind).toBe('missing_section');
        expect(error.path).toBe('project.md');
        expect(error.section).toBe('Goals');
        expect(error.details).toEqual(details);
    });
});
