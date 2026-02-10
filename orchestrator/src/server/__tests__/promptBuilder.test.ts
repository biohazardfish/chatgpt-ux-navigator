/**
 * Unit tests for promptBuilder
 * Tests exact prompt formatting per Ticket 003 specification
 */

import {describe, it, expect} from 'bun:test';
import {buildPrompt} from '../promptBuilder';
import type {InboxItem} from '../../runner/types';

describe('buildPrompt', () => {
    it('test 1: inbox with 2 messages produces exact formatting', () => {
        const systemPrompt = '  You are a helpful assistant.  ';
        const inbox: InboxItem[] = [
            {
                turn: 0,
                from: 'user',
                content: 'Hello, can you help me?',
            },
            {
                turn: 1,
                from: 'agent_a',
                content: 'Of course! What do you need help with?',
            },
        ];

        const result = buildPrompt(systemPrompt, inbox);

        // Verify system prompt is trimmed
        expect(result).toContain('You are a helpful assistant.');
        expect(result).not.toContain('  You are a helpful assistant.  ');

        // Verify separator
        expect(result).toContain('\n\n---\n\n');

        // Verify developer preamble is present
        expect(result).toContain(
            'You are an AI agent participating in a multi-agent conversation run.'
        );
        expect(result).toContain('- Do not mention any judge, scoring, or termination logic.');
        expect(result).toContain('- Only use the messages you received to decide your response.');
        expect(result).toContain('- Be concise but complete.');

        // Verify inbox section
        expect(result).toContain(
            'You are about to speak. Here are the messages you received since you last spoke (oldest to newest):'
        );

        // Verify numbered items
        expect(result).toContain('[1] From: user (turn 0)');
        expect(result).toContain('Hello, can you help me?');
        expect(result).toContain('[2] From: agent_a (turn 1)');
        expect(result).toContain('Of course! What do you need help with?');

        // Verify final line
        expect(result).toContain('Now write your response.');
        expect(result.endsWith('Now write your response.')).toBe(true);
    });

    it('test 2: empty inbox produces exact empty-inbox message', () => {
        const systemPrompt = 'You are a helpful assistant.';
        const inbox: InboxItem[] = [];

        const result = buildPrompt(systemPrompt, inbox);

        // Verify system prompt and separator
        expect(result).toContain('You are a helpful assistant.');
        expect(result).toContain('\n\n---\n\n');

        // Verify developer preamble
        expect(result).toContain(
            'You are an AI agent participating in a multi-agent conversation run.'
        );

        // Verify empty inbox message
        expect(result).toContain('You are about to speak. You have received no messages.');
        expect(result).toContain(
            'Write a response that is appropriate as the next turn in this conversation.'
        );

        // Should NOT contain numbering or "oldest to newest"
        expect(result).not.toContain('[1]');
        expect(result).not.toContain('oldest to newest');
        expect(result).not.toContain('Now write your response.');
    });

    it('test 3: system prompt is trimmed in output', () => {
        const systemPrompt = '\n\n  Trimmed prompt  \n\n';
        const inbox: InboxItem[] = [];

        const result = buildPrompt(systemPrompt, inbox);

        // Should contain trimmed version
        expect(result).toContain('Trimmed prompt');
        // Should not contain extra whitespace
        expect(result.split('\n')[0]).toBe('Trimmed prompt');
    });

    it('test 4: content with internal whitespace is preserved exactly', () => {
        const systemPrompt = 'System prompt';
        const inbox: InboxItem[] = [
            {
                turn: 1,
                from: 'agent_x',
                content: 'Line 1\n\nParagraph with  multiple   spaces\n\nLine 3',
            },
        ];

        const result = buildPrompt(systemPrompt, inbox);

        // Verify internal whitespace is preserved
        expect(result).toContain('Line 1\n\nParagraph with  multiple   spaces\n\nLine 3');
    });

    it('test 5: single message in inbox is numbered [1]', () => {
        const systemPrompt = 'System prompt';
        const inbox: InboxItem[] = [
            {
                turn: 5,
                from: 'user',
                content: 'Single message',
            },
        ];

        const result = buildPrompt(systemPrompt, inbox);

        expect(result).toContain('[1] From: user (turn 5)');
        expect(result).toContain('Single message');
        expect(result).toContain('Now write your response.');
    });

    it('test 6: messages preserve turn numbers exactly as provided', () => {
        const systemPrompt = 'System prompt';
        const inbox: InboxItem[] = [
            {
                turn: 0,
                from: 'user',
                content: 'First',
            },
            {
                turn: 5,
                from: 'agent_a',
                content: 'Second',
            },
            {
                turn: 10,
                from: 'agent_b',
                content: 'Third',
            },
        ];

        const result = buildPrompt(systemPrompt, inbox);

        expect(result).toContain('[1] From: user (turn 0)');
        expect(result).toContain('[2] From: agent_a (turn 5)');
        expect(result).toContain('[3] From: agent_b (turn 10)');
    });

    it('test 7: exact structure with separator', () => {
        const systemPrompt = 'System';
        const inbox: InboxItem[] = [
            {
                turn: 1,
                from: 'agent_a',
                content: 'Message',
            },
        ];

        const result = buildPrompt(systemPrompt, inbox);

        // Verify the prompt starts with: system + separator + developer preamble
        expect(result.startsWith('System\n\n---\n\n')).toBe(true);
        expect(result).toContain('You are an AI agent');
    });
});
