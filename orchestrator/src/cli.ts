#!/usr/bin/env bun
/**
 * Nexus CLI Entry Point
 * Runs multi-agent conversations from YAML config files
 */

import {loadConfig} from './config';
import {runConversation} from './runner/runConversation';
import {createServerAgentCaller} from './server/createServerAgentCaller';
import {createServerJudgeCaller} from './server/createServerJudgeCaller';
import {createRunLogger} from './logging/createRunLogger';
import type {RunnerDeps} from './runner/types';

const USAGE = `
Nexus - Multi-Agent Conversation Orchestrator

Usage:
  bun run src/cli.ts <config.yml>

Example:
  bun run src/cli.ts examples/debate.yml

Options:
  <config.yml>    Path to YAML configuration file (required)
  --help, -h      Show this help message

Description:
  Runs a multi-agent AI conversation using a fixed round-robin workflow.
  Each agent takes turns speaking, while a judge evaluates progress.
  
  Before running:
    1. Start the local server: cd .. && bun dev
    2. Connect ChatGPT browser tabs via the extension
    3. Note the client IDs from the server output

  Output:
    Creates a timestamped folder in the configured out_dir with:
    - config.yml      (exact config used)
    - run.json        (metadata + stop reason)
    - transcript.md   (full conversation)
    - messages/       (individual turn files)
    - judge/          (evaluation records)
`;

async function main() {
    const args = process.argv.slice(2);

    // Show help
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(USAGE);
        process.exit(args.length === 0 ? 1 : 0);
    }

    // Get config path
    const configPath = args[0];

    console.log('🚀 Nexus Multi-Agent Orchestrator\n');
    console.log(`📄 Loading config: ${configPath}`);

    // Load and validate config
    let config;
    try {
        config = await loadConfig(configPath);
        console.log('✅ Config validated successfully\n');
    } catch (error) {
        console.error('❌ Config validation failed:');
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }

    // Display run summary
    console.log('📋 Run Configuration:');
    console.log(`   ID: ${config.run.id}`);
    console.log(`   Output: ${config.run.out_dir}`);
    console.log(`   Server: ${config.server.url}`);
    console.log(`   Max turns: ${config.termination.max_turns}`);
    console.log(`   Judge enabled: ${config.judge.enabled}`);
    console.log('\n👥 Agents:');
    for (const agentId of config.workflow.order) {
        const agent = config.agents[agentId];
        console.log(`   ${agentId} (${agent.client_id})`);
    }
    if (config.judge.enabled && config.judge.client_id) {
        console.log(`\n⚖️  Judge: ${config.judge.client_id}`);
    }
    console.log('\n' + '─'.repeat(60) + '\n');

    // Read config file text for logging
    let configText: string;
    try {
        const resolvedPath = new URL(configPath, `file://${process.cwd()}/`).pathname;
        configText = await Bun.file(resolvedPath).text();
    } catch (error) {
        console.error('❌ Failed to read config file for logging');
        process.exit(1);
    }

    // Create logger
    const started_at = new Date().toISOString();
    let logger;
    try {
        logger = await createRunLogger({
            configPath,
            configText,
            config,
            started_at,
        });
        console.log(`📁 Run directory: ${logger.runDir}\n`);
    } catch (error) {
        console.error('❌ Failed to create run logger:');
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }

    // Create dependencies
    const agentCaller = createServerAgentCaller(config);
    const judgeCaller = config.judge.enabled ? createServerJudgeCaller(config) : undefined;

    const deps: RunnerDeps = {
        callAgent: agentCaller.callAgent,
        callJudge: judgeCaller?.callJudge,
        nowISO: () => new Date().toISOString(),
    };

    // Run conversation with live logging
    console.log('🎬 Starting conversation...\n');

    try {
        const result = await runConversation(config, deps);

        // Write run artifacts
        console.log('\n💾 Writing artifacts...');

        // Write each turn
        for (const msg of result.transcript) {
            // Calculate which turns this agent received
            const received_turns: number[] = [];
            for (let i = 0; i < result.transcript.length; i++) {
                if (result.transcript[i].turn < msg.turn) {
                    received_turns.push(result.transcript[i].turn);
                }
            }
            await logger.writeTurn(msg, received_turns);
            console.log(`   Turn ${msg.turn} (${msg.speaker})`);
        }

        // Write judge records
        if (result.judge) {
            for (const record of result.judge) {
                await logger.writeJudge(record.turn, record.decision, record.created_at);
            }
            console.log(`   ${result.judge.length} judge evaluation(s)`);
        }

        // Finalize run metadata
        const ended_at = new Date().toISOString();
        await logger.finalize({
            stop_reason: result.stop_reason,
            total_turns: result.total_turns,
            started_at,
            ended_at,
        });

        console.log('\n✅ Run completed successfully!\n');
        console.log('📊 Summary:');
        console.log(`   Total turns: ${result.total_turns}`);
        console.log(`   Stop reason: ${result.stop_reason}`);
        console.log(
            `   Duration: ${((new Date(ended_at).getTime() - new Date(started_at).getTime()) / 1000).toFixed(1)}s`
        );
        console.log(`\n📁 Artifacts saved to: ${logger.runDir}`);
    } catch (error) {
        console.error('\n❌ Run failed:');
        console.error(error instanceof Error ? error.message : String(error));

        // Try to write partial results if logger was created
        try {
            const ended_at = new Date().toISOString();
            await logger.finalize({
                stop_reason: 'max_turns', // Default stop reason for error case
                total_turns: 0,
                started_at,
                ended_at,
            });
            console.log(`\n📁 Partial artifacts saved to: ${logger.runDir}`);
        } catch {
            // Ignore finalization errors
        }

        process.exit(1);
    }
}

// Run CLI
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
