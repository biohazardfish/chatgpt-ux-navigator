import * as fs from 'fs/promises';
import * as path from 'path';

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const documents: string[] = [
    // '001-repo-bootstrap.md',
    // '002-config-and-paths.md',
    // '003-state-storage-format.md',
    // '004-domain-model-project-plan-task.md',
    // '005-server-client-post-prompts.md',
    // '006-response-streaming-and-capture.md',
    // '007-report-convention-and-parser.md',
    // '008-tui-shell-and-navigation.md',
    // '009-tui-project-dashboard.md',
    // '010-tui-task-list-and-details.md',
    // '011-tui-approval-checkpoints.md',
    // '012-task-definition-and-assignment.md',
    // '013-session-runner-basic.md',
    // '014-context-injection-minimal.md',
    // '015-governance-evaluate-reports.md',
    // '016-decision-recording.md',
    // '017-mvp-e2e-flow-smoke-test.md',
    // '018-parallel-session-execution.md',
    // '019-retry-and-backoff-policy.md',
    // '020-conflict-detection-heuristics.md',
    // '021-add-devils-advocate-role.md',
    // '022-tui-notifications-and-alerts.md',
    // '023-tui-search-and-filter.md',
    // '024-better-project-summaries.md',
    // '025-state-migrations.md',
    // '026-audit-log-and-run-history.md',
    // '027-test-suite-expansion.md',
    // '028-fixture-projects-and-demo-scenarios.md',
];

const queryPrefixes = [
    'Next, I need document',
    'I want document',
    'Next, give me document',
    'I require document',
    'Can you provide document',
];

function getRandomElement<T>(arr: T[]): T {
    const randomIndex = Math.floor(Math.random() * arr.length);
	// @ts-ignore
    return arr[randomIndex];
}

const chatClientUrl = 'http://localhost:8765/responses/chat-client';
const outputDir = 'docs/tickets';

async function fetchAndSaveDocument(docName: string): Promise<boolean> {
    const inputQuery = `${getRandomElement(queryPrefixes)} ${docName.replace('.md', '')}`;
    console.log(`Requesting: "${inputQuery}"`);

    try {
        const response = await fetch(chatClientUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({input: inputQuery}),
        });

        if (!response.ok) {
            console.error(`Error fetching ${docName}: ${response.status} - ${response.statusText}`);
            return false;
        }

        const data: {output_text?: string} = (await response.json()) as unknown as any;
        const outputText = data.output_text;

        if (outputText) {
            const filePath = path.join(outputDir, docName);
            await fs.writeFile(filePath, outputText);
            console.log(`Successfully wrote ${filePath}`);
            await sleep(3000);
            return true;
        } else {
            console.log(data);
            console.warn(`No 'output_text' found in response for ${docName}`);
            return false;
        }
    } catch (error) {
        console.error(`Failed to process ${docName}:`, error);
        return false;
    }
}

async function main() {
    // Ensure the output directory exists
    try {
        await fs.mkdir(outputDir, {recursive: true});
        console.log(`Ensured directory '${outputDir}' exists.`);
    } catch (error) {
        console.error(`Failed to create directory '${outputDir}':`, error);
        process.exit(1);
    }

    for (const doc of documents) {
        const success = await fetchAndSaveDocument(doc);
        if (!success) {
            console.error(`Stopping document processing due to error with ${doc}`);
            break;
        }
    }

    console.log('\nAll document requests processed.');
}

main();
