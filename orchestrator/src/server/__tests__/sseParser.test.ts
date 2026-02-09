/**
 * Unit tests for sseParser
 * Tests SSE stream parsing and JSON fallback per Ticket 003 specification
 */

import {describe, it, expect} from 'bun:test';
import {parseSSEStream, parseJSONResponse} from '../sseParser';

describe('parseSSEStream', () => {
    it('test 1: complete stream with response.completed event', () => {
        const sseBody = `event: response.created
data: {"response":{"id":"resp_123"}}

event: response.in_progress
data: {}

event: response.output_text.delta
data: {"delta":"Hello "}

event: response.output_text.delta
data: {"delta":"world"}

event: response.completed
data: {"response":{"output_text":"Hello world final"}}

`;

        const result = parseSSEStream(sseBody, 'agent_a', 1);

        // Should use the completed event's output_text (highest priority)
        expect(result).toBe('Hello world final');
    });

    it('test 2: stream with output_text.done but no completed', () => {
        const sseBody = `event: response.created
data: {"response":{"id":"resp_123"}}

event: response.output_text.delta
data: {"delta":"Accumulated "}

event: response.output_text.delta
data: {"delta":"text"}

event: response.output_text.done
data: {"text":"Done text"}

`;

        const result = parseSSEStream(sseBody, 'agent_a', 1);

        // Should use output_text.done (preferred over deltas)
        expect(result).toBe('Done text');
    });

    it('test 3: stream with only deltas accumulates correctly', () => {
        const sseBody = `event: response.output_text.delta
data: {"delta":"Hello "}

event: response.output_text.delta
data: {"delta":"world "}

event: response.output_text.delta
data: {"delta":"from "}

event: response.output_text.delta
data: {"delta":"deltas"}

`;

        const result = parseSSEStream(sseBody, 'agent_a', 1);

        expect(result).toBe('Hello world from deltas');
    });

    it('test 4: stream with response.error throws with error details', () => {
        const sseBody = `event: response.error
data: {"message":"Invalid request","error":"bad_request"}

`;

        expect(() => {
            parseSSEStream(sseBody, 'agent_a', 1);
        }).toThrow('Server agent error for agent_a turn 1: Invalid request');
    });

    it('test 5: [DONE] sentinel terminates parsing', () => {
        const sseBody = `event: response.output_text.delta
data: {"delta":"Before done"}

event: [DONE]
data: [DONE]

event: response.output_text.delta
data: {"delta":"After done - should be ignored"}

`;

        const result = parseSSEStream(sseBody, 'agent_a', 1);

        expect(result).toBe('Before done');
        expect(result).not.toContain('After done');
    });

    it('test 6: response.completed has priority over output_text.done', () => {
        const sseBody = `event: response.output_text.done
data: {"text":"From done event"}

event: response.completed
data: {"response":{"output_text":"From completed event"}}

`;

        const result = parseSSEStream(sseBody, 'agent_a', 1);

        // Should prefer completed over done
        expect(result).toBe('From completed event');
    });

    it('test 7: text with trailing whitespace is trimmed', () => {
        const sseBody = `event: response.output_text.delta
data: {"delta":"Text with spaces  "}

event: response.output_text.delta
data: {"delta":"  and tabs\\t\\t"}

`;

        const result = parseSSEStream(sseBody, 'agent_a', 1);

        // trimEnd removes trailing whitespace (tabs and spaces) from the end
        // Accumulated: "Text with spaces  " + "  and tabs\t\t" → after trimEnd: "Text with spaces    and tabs"
        expect(result).toBe('Text with spaces    and tabs');
    });

    it('test 8: empty response throws error', () => {
        const sseBody = `event: response.completed
data: {"response":{"output_text":""}}

`;

        expect(() => {
            parseSSEStream(sseBody, 'agent_b', 5);
        }).toThrow('Server agent returned empty content: agent_b turn 5');
    });

    it('test 9: whitespace-only response throws error', () => {
        const sseBody = `event: response.output_text.delta
data: {"delta":"   "}

event: response.output_text.delta
data: {"delta":"\t\n  "}

`;

        expect(() => {
            parseSSEStream(sseBody, 'agent_c', 10);
        }).toThrow('Server agent returned empty content: agent_c turn 10');
    });

    it('test 10: ignores informational events', () => {
        const sseBody = `event: response.created
data: {"response":{"id":"resp_123"}}

event: response.in_progress
data: {}

event: response.output_item.added
data: {"item":{"type":"text"}}

event: response.content_part.added
data: {"content_part":{"type":"text"}}

event: response.output_text.delta
data: {"delta":"Real content"}

event: response.content_part.done
data: {"content_part":{"type":"text"}}

event: response.output_item.done
data: {"item":{"type":"text"}}

`;

        const result = parseSSEStream(sseBody, 'agent_a', 1);

        expect(result).toBe('Real content');
    });

    it('test 11: handles malformed JSON in data gracefully', () => {
        const sseBody = `event: response.output_text.delta
data: {"delta":"Before bad json"}

event: response.unknown_event
data: {bad json here}

event: response.output_text.delta
data: {"delta":" After bad json"}

`;

        const result = parseSSEStream(sseBody, 'agent_a', 1);

        // Should skip the malformed data and continue
        expect(result).toBe('Before bad json After bad json');
    });

    it('test 12: handles event without data', () => {
        const sseBody = `event: response.output_text.delta
data: {"delta":"Has data"}

event: response.in_progress

event: response.output_text.delta
data: {"delta":" More data"}

`;

        const result = parseSSEStream(sseBody, 'agent_a', 1);

        expect(result).toBe('Has data More data');
    });
});

describe('parseJSONResponse', () => {
    it('test 1: JSON mode response extracts text correctly', () => {
        const jsonBody = JSON.stringify({
            id: 'resp_123',
            status: 'completed',
            output_text: 'JSON mode response text',
        });

        const result = parseJSONResponse(jsonBody, 'agent_a', 1);

        expect(result).toBe('JSON mode response text');
    });

    it('test 2: JSON mode with trimming', () => {
        const jsonBody = JSON.stringify({
            id: 'resp_456',
            status: 'completed',
            output_text: 'Text with spaces  \n\t  ',
        });

        const result = parseJSONResponse(jsonBody, 'agent_a', 1);

        expect(result).toBe('Text with spaces');
    });

    it('test 3: JSON mode with missing output_text throws error', () => {
        const jsonBody = JSON.stringify({
            id: 'resp_789',
            status: 'completed',
        });

        expect(() => {
            parseJSONResponse(jsonBody, 'agent_b', 2);
        }).toThrow('Server agent returned empty content: agent_b turn 2');
    });

    it('test 4: JSON mode with null output_text throws error', () => {
        const jsonBody = JSON.stringify({
            id: 'resp_abc',
            status: 'completed',
            output_text: null,
        });

        expect(() => {
            parseJSONResponse(jsonBody, 'agent_c', 3);
        }).toThrow('Server agent returned empty content: agent_c turn 3');
    });

    it('test 5: invalid JSON throws parse error', () => {
        const jsonBody = '{bad json}';

        expect(() => {
            parseJSONResponse(jsonBody, 'agent_a', 1);
        }).toThrow('Failed to parse JSON response for agent_a turn 1:');
    });

    it('test 6: JSON with missing response object defaults to empty', () => {
        const jsonBody = JSON.stringify({});

        expect(() => {
            parseJSONResponse(jsonBody, 'agent_a', 1);
        }).toThrow('Server agent returned empty content: agent_a turn 1');
    });
});

describe('integration: mocked fetch scenarios', () => {
    // Note: Full integration tests with mocked fetch will be in createServerAgentCaller tests
    // These are tested implicitly through the caller factory tests

    it('test 1: SSE parser handles real-world OpenAI-like format', () => {
        const realWorldSSE = `event: response.created
data: {"response":{"id":"resp-abc123","object":"response","status":"in_progress"}}

event: response.in_progress
data: {}

event: response.output_item.added
data: {"output_item":{"id":"item-123","type":"text"}}

event: response.content_part.added
data: {"content_part":{"id":"cp-123","type":"text"}}

event: response.output_text.delta
data: {"delta":"The quick "}

event: response.output_text.delta
data: {"delta":"brown fox "}

event: response.output_text.delta
data: {"delta":"jumps over "}

event: response.output_text.delta
data: {"delta":"the lazy "}

event: response.output_text.delta
data: {"delta":"dog."}

event: response.output_text.done
data: {"text":"The quick brown fox jumps over the lazy dog.","index":0,"type":"text"}

event: response.content_part.done
data: {"content_part":{"id":"cp-123","type":"text"}}

event: response.output_item.done
data: {"output_item":{"id":"item-123","type":"text"}}

event: response.completed
data: {"response":{"id":"resp-abc123","object":"response","status":"completed","output":[{"id":"item-123","type":"text","text":{"value":"The quick brown fox jumps over the lazy dog."}}],"output_text":"The quick brown fox jumps over the lazy dog."}}

`;

        const result = parseSSEStream(realWorldSSE, 'agent_a', 1);

        // Should use the completed event's output_text
        expect(result).toBe('The quick brown fox jumps over the lazy dog.');
    });
});
