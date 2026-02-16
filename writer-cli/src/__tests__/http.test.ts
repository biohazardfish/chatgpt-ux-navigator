import {describe, expect, it} from 'bun:test';
import {buildResponsesEndpoint, buildResponsesNewThreadEndpoint} from '../core/http';

describe('http helpers', () => {
    it('builds responses endpoint for client id', () => {
        expect(buildResponsesEndpoint('http://localhost:8765', 'writer-client')).toBe(
            'http://localhost:8765/responses/writer-client'
        );
    });

    it('builds new-thread endpoint for client id', () => {
        expect(buildResponsesNewThreadEndpoint('http://localhost:8765', 'writer-client')).toBe(
            'http://localhost:8765/responses/writer-client/new'
        );
    });

    it('preserves base path and encodes client id', () => {
        expect(
            buildResponsesNewThreadEndpoint('http://localhost:8765/api/', 'writer client/one')
        ).toBe('http://localhost:8765/api/responses/writer%20client%2Fone/new');
    });
});
