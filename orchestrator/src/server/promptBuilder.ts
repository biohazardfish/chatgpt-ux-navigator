/**
 * Prompt builder for server-based agent calls
 * Combines system prompt, developer preamble, and inbox messages into a single string
 * Per Ticket 003 specification
 */

import type {InboxItem} from '../runner/types';

/**
 * Developer preamble that all agent prompts must include
 * Exactly as specified in Ticket 003
 */
const DEVELOPER_PREAMBLE = `You are an AI agent participating in a multi-agent conversation run.
Follow these rules:
- Do not mention any judge, scoring, or termination logic.
- Only use the messages you received to decide your response.
- Be concise but complete.`;

/**
 * Builds a complete prompt for an agent call by combining:
 * 1. System prompt (trimmed)
 * 2. Separator: \n\n---\n\n
 * 3. Developer preamble + inbox bundle
 *
 * @param systemPrompt - The agent's persona/system prompt
 * @param inbox - Array of pending messages for the agent
 * @returns Complete prompt string ready to send to ChatGPT
 */
export function buildPrompt(systemPrompt: string, inbox: InboxItem[]): string {
    const trimmedSystem = systemPrompt.trim();

    // Start with system prompt and separator
    let prompt = `${trimmedSystem}\n\n---\n\n`;

    // Add developer preamble
    prompt += DEVELOPER_PREAMBLE;

    // Add inbox bundle
    if (inbox.length > 0) {
        prompt +=
            '\n\nYou are about to speak. Here are the messages you received since you last spoke (oldest to newest):\n';

        // Format each inbox item
        inbox.forEach((item, index) => {
            const itemNumber = index + 1;
            prompt += `\n\n[${itemNumber}] From: ${item.from} (turn ${item.turn})\n\n`;
            prompt += item.content;
        });

        prompt += '\n\n---\n\n Now write your response.';
    } else {
        // Empty inbox case
        prompt +=
            '\n\nYou are about to speak. You have received no messages.\nWrite a response that is appropriate as the next turn in this conversation.';
    }

    return prompt;
}
