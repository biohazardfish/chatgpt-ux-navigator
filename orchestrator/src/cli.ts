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
import {preflightCheckClients} from './server/preflight';

const USAGE = `
Nexus - Multi-Agent Conversation Orchestrator

Usage:
  bun run src/cli.ts <config.yml> [options]

Example:
  bun run src/cli.ts examples/debate.yml
  bun run src/cli.ts examples/debate.yml --debug

Options:
  <config.yml>    Path to YAML configuration file (required)
  --debug         Enable debug logging (prints to console and logs.jsonl)
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

    // Parse options
    const debugMode = args.includes('--debug');

    // Get config path (first non-flag argument)
    const configPath = args.find(arg => !arg.startsWith('--'));

    if (!configPath) {
        console.error('Error: config.yml path is required');
        console.log(USAGE);
        process.exit(1);
    }

    console.log('🚀 Nexus Multi-Agent Orchestrator\n');
    console.log(`📄 Loading config: ${configPath}`);
    if (debugMode) {
        console.log('🐛 Debug mode enabled\n');
    }

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

    // Fail fast if any configured clients are not connected
    console.log('🔎 Checking connected clients...');
    try {
        const {connected, required} = await preflightCheckClients(config, {timeoutMs: 3000});
        console.log(
            `✅ Clients OK (${required.length} required, ${connected.length} connected on server)\n`
        );
    } catch (error) {
        console.error('❌ Client preflight failed:');
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }

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
            debugMode,
        });
        console.log(`📁 Run directory: ${logger.runDir}\n`);
    } catch (error) {
        console.error('❌ Failed to create run logger:');
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }

    // Create dependencies
    const agentCaller = createServerAgentCaller(config, logger.jsonLogger);
    const judgeCaller = config.judge.enabled ? createServerJudgeCaller(config, logger.jsonLogger) : undefined;

    const deps: RunnerDeps = {
        callAgent: agentCaller.callAgent,
        callJudge: judgeCaller?.callJudge,
        nowISO: () => new Date().toISOString(),
        jsonLogger: logger.jsonLogger,
        writeTurn: logger.writeTurn.bind(logger),
        writeJudge: logger.writeJudge.bind(logger),
    };

    // Run conversation with live logging
    console.log('🎬 Starting conversation...\n');

    try {
        const result = await runConversation(config, deps);

        // Messages and judge records are already written incrementally during the run
        // Just finalize run metadata
        console.log('\n💾 Finalizing run metadata...');

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
