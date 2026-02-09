/**
 * Judge prompt builder for server-based judge calls
 * Constructs judge evaluation prompts with exact formatting per Ticket 004
 */

import type {AgentMessage} from '../runner/types';
import type {AppConfig} from '../config/types';

/**
 * System preamble for judge (exact per spec)
 */
const JUDGE_SYSTEM_PREAMBLE = `You are a judge for a multi-agent AI conversation.

You must output ONLY a JSON object inside a fenced code block (\`\`\`json ... \`\`\`).
Do not include any other text outside the code block.
The JSON must include: should_stop (boolean), scores (object with scores 0-100), reason (string).
The scores object MUST contain only the agent IDs listed in AGENTS (no extra keys).`;

/**
 * Correction prompt appended on retry (exact per spec)
 */
function buildJudgeCorrectionPrompt(errorDetails?: string): string {
    let prompt = `
YOUR PREVIOUS OUTPUT WAS INVALID.
Output ONLY a valid JSON object inside a fenced \`\`\`json code block.
Do not include any other text.
Follow the required schema exactly:
- should_stop: boolean
- scores: object with keys ONLY for the listed agent IDs (0-100 range)
- reason: string`;

    if (errorDetails && errorDetails.trim().length > 0) {
        prompt += `

Validation error: ${errorDetails.trim()}`;
    }

    prompt += `

Common mistakes to avoid:
- Missing or extra keys in scores (only agent IDs are allowed)
- Non-boolean should_stop (must be true or false)
- Scores that are not numbers or outside 0-100
- Empty reason
- Any text outside the JSON code block

Example format:
\`\`\`json
{
  "should_stop": false,
  "scores": {
    "planner": 80,
    "critic": 85
  },
  "reason": "Short explanation here."
}
\`\`\``;

    return prompt;
}

/**
 * Builds a complete judge prompt by combining:
 * 1. System preamble
 * 2. Rubric section
 * 3. Agent list
 * 4. Transcript section
 *
 * @param config - Validated app configuration
 * @param transcript - Full transcript of agent messages so far
 * @param isRetry - Whether this is a retry with correction prompt
 * @returns Complete judge prompt string
 * @throws Error if transcript is empty (per spec: should not happen in normal operation)
 */
export function buildJudgePrompt(
    config: AppConfig,
    transcript: AgentMessage[],
    isRetry: boolean = false,
    errorDetails?: string
): string {
    // Throw error on empty transcript (should not happen in normal operation)
    if (transcript.length === 0) {
        throw new Error('Judge prompt builder: empty transcript (should not happen)');
    }

    let prompt = JUDGE_SYSTEM_PREAMBLE;

    // Rubric section
    prompt += '\n\nRUBRIC:\n';
    prompt += config.judge.rubric || '';

    // Agent list section (in workflow order)
    prompt += '\n\nAGENTS:\n';
    prompt += config.workflow.order.join(', ');

    // Transcript section
    prompt += '\n\nTRANSCRIPT (most recent last):';

    // Format each transcript entry with 1-based indexing
    transcript.forEach((msg, index) => {
        const entryNumber = index + 1;
        prompt += `\n[${entryNumber}] ${msg.speaker}: ${msg.content}`;
        // Add blank line after each entry except the last
        if (index < transcript.length - 1) {
            prompt += '\n';
        }
    });

    // Explicit round boundary marker (per Ticket 006)
    prompt += `\n\n=== END OF ROUND ===`;

    // Add correction prompt if this is a retry
    if (isRetry) {
        prompt += buildJudgeCorrectionPrompt(errorDetails);
    }

    return prompt;
}
