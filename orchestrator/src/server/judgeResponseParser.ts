/**
 * Judge response parser and validator
 * Extracts JSON from code blocks and validates judge output per Ticket 004
 */

import type {JudgeDecision} from '../runner/types';
import type {AppConfig} from '../config/types';

/**
 * Represents a parsing or validation error
 */
export type ParseError =
	| {type: 'no_code_block'}
	| {type: 'json_parse_error'; details: string}
	| {type: 'validation_error'; details: string};

/**
 * Extracts the first fenced code block from text
 * Handles both ```json and ``` fences
 *
 * @param text - The text containing a code block
 * @returns The extracted text inside the code block (trimmed), or null if not found
 */
function extractCodeBlock(text: string): string | null {
	// Match either ```json or ``` followed by content and closing ```
	// The content can be empty or contain anything including newlines
	const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
	if (!match) {
		return null;
	}
	// Return trimmed content (can be empty string for empty code blocks)
	return match[1].trim();
}

/**
 * Validates that scores object matches required schema
 *
 * @param scores - The scores object to validate
 * @param agentIds - Expected agent IDs from config.workflow.order
 * @returns ParseError if invalid, null if valid
 */
function validateScores(
	scores: unknown,
	agentIds: string[]
): ParseError | null {
	if (typeof scores !== 'object' || scores === null || Array.isArray(scores)) {
		return {type: 'validation_error', details: 'scores must be an object'};
	}

	const scoresObj = scores as Record<string, unknown>;
	const scoreKeys = Object.keys(scoresObj);

	// Check that all required agent IDs are present
	for (const agentId of agentIds) {
		if (!(agentId in scoresObj)) {
			return {
				type: 'validation_error',
				details: `scores missing required agent key: ${agentId}`,
			};
		}
	}

	// Check that there are no extra keys
	for (const key of scoreKeys) {
		if (!agentIds.includes(key)) {
			return {
				type: 'validation_error',
				details: `scores contains extra key not in workflow: ${key}`,
			};
		}
	}

	// Validate each score is in range [0, 10]
	for (const agentId of agentIds) {
		const score = scoresObj[agentId];
		if (typeof score !== 'number' || !Number.isFinite(score)) {
			return {
				type: 'validation_error',
				details: `score for ${agentId} must be a finite number`,
			};
		}
		if (score < 0 || score > 10) {
			return {
				type: 'validation_error',
				details: `score for ${agentId} out of range [0, 10]: ${score}`,
			};
		}
	}

	return null;
}

/**
 * Validates that a parsed JSON object matches the JudgeDecision schema
 *
 * @param obj - The parsed JSON object
 * @param agentIds - Expected agent IDs from config.workflow.order
 * @returns ParseError if invalid, null if valid
 */
function validateSchema(
	obj: unknown,
	agentIds: string[]
): ParseError | null {
	if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
		return {type: 'validation_error', details: 'response must be a JSON object'};
	}

	const decision = obj as Record<string, unknown>;

	// Check should_stop is boolean
	if (typeof decision.should_stop !== 'boolean') {
		return {
			type: 'validation_error',
			details: 'should_stop must be a boolean',
		};
	}

	// Check reason is non-empty string
	if (typeof decision.reason !== 'string' || decision.reason.trim().length === 0) {
		return {
			type: 'validation_error',
			details: 'reason must be a non-empty string',
		};
	}

	// Validate scores
	const scoresError = validateScores(decision.scores, agentIds);
	if (scoresError) {
		return scoresError;
	}

	return null;
}

/**
 * Parses and validates a judge response string
 * Extracts JSON from code block and validates against schema
 *
 * @param responseText - The raw response text from judge
 * @param config - App config for agent ID validation
 * @returns The validated JudgeDecision, or ParseError
 */
export function parseJudgeResponse(
	responseText: string,
	config: AppConfig
): JudgeDecision | ParseError {
	if (!responseText || responseText.trim().length === 0) {
		return {type: 'no_code_block'};
	}

	// Extract code block
	const codeBlockContent = extractCodeBlock(responseText);
	if (codeBlockContent === null) {
		// No code block found at all
		return {type: 'no_code_block'};
	}

	// If code block is empty, it's a JSON parse error
	if (codeBlockContent.length === 0) {
		return {
			type: 'json_parse_error',
			details: 'Code block is empty',
		};
	}

	// Parse JSON
	let parsed: unknown;
	try {
		parsed = JSON.parse(codeBlockContent);
	} catch (err) {
		return {
			type: 'json_parse_error',
			details: err instanceof Error ? err.message : String(err),
		};
	}

	// Validate schema
	const validationError = validateSchema(parsed, config.workflow.order);
	if (validationError) {
		return validationError;
	}

	// Return as JudgeDecision
	const decision = parsed as Record<string, unknown>;
	return {
		should_stop: decision.should_stop as boolean,
		scores: decision.scores as Record<string, number>,
		reason: decision.reason as string,
	};
}

/**
 * Type guard to check if result is a ParseError
 */
export function isParseError(result: JudgeDecision | ParseError): result is ParseError {
	return typeof result === 'object' && 'type' in result && 'type' in result;
}
