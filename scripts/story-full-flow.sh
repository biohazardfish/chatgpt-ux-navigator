#!/usr/bin/env bash

set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
DEFAULT_LANGUAGE="vi"
SERVER_URL="${WRITER_CLI_SERVER_URL:-http://localhost:8765}"

CONFIG_PATH=""
TARGET_LANGUAGE="$DEFAULT_LANGUAGE"
RUN_DIR=""

usage() {
    cat <<EOF
Usage: $SCRIPT_NAME [options]

Run full story pipeline with orchestrator + writer-cli.

Options:
  --config <path>      Orchestrator config file
  --language <code>    Translation language (currently only: vi)
  --run <run_dir>      Existing run directory. Skip orchestrator and only post-process.
  -h, --help           Show this help message

Examples:
  $SCRIPT_NAME
  $SCRIPT_NAME --config prompts/story_writer_v2.yaml
  $SCRIPT_NAME --run orchestrator/runs/2026-02-13T17-09-22Z_vn-cyber-longstory
EOF
}

fail() {
    printf '[%s] %s\n' "$SCRIPT_NAME" "$1" >&2
    exit 1
}

require_cmd() {
    command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

run_step() {
    local label="$1"
    shift
    printf '\n[%s] %s\n' "$SCRIPT_NAME" "$label"
    "$@"
}

run_writer() {
    local command_name="$1"
    shift
    run_step "writer-cli $command_name" bun run writer-cli "$command_name" --run "$RUN_DIR" "$@"
}

extract_run_dir_from_log() {
    local log_file="$1"
    local line
    local found=""

    while IFS= read -r line; do
        if [[ "$line" =~ Run\ directory:\ (.+)$ ]]; then
            found="${BASH_REMATCH[1]}"
        elif [[ "$line" =~ Artifacts\ saved\ to:\ (.+)$ ]]; then
            found="${BASH_REMATCH[1]}"
        fi
    done <"$log_file"

    printf '%s' "$found"
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --config)
            [[ $# -ge 2 ]] || fail "--config requires a value"
            CONFIG_PATH="$2"
            shift 2
            ;;
        --language)
            [[ $# -ge 2 ]] || fail "--language requires a value"
            TARGET_LANGUAGE="$2"
            shift 2
            ;;
        --run)
            [[ $# -ge 2 ]] || fail "--run requires a value"
            RUN_DIR="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            fail "Unknown option: $1"
            ;;
    esac
done

if [[ "$TARGET_LANGUAGE" != "vi" ]]; then
    fail "Unsupported language '$TARGET_LANGUAGE'. Currently only 'vi' is supported."
fi

require_cmd bun
require_cmd curl

run_step "Server preflight ($SERVER_URL/clients)" curl -fsS "$SERVER_URL/clients" >/dev/null

if [[ -n "$RUN_DIR" ]]; then
    [[ -d "$RUN_DIR" ]] || fail "Run directory not found: $RUN_DIR"
    RUN_DIR="$(cd "$RUN_DIR" && pwd)"
    printf '[%s] Using existing run: %s\n' "$SCRIPT_NAME" "$RUN_DIR"
else
    [[ -f "$CONFIG_PATH" ]] || fail "Config file not found: $CONFIG_PATH"

    log_file="$(mktemp -t story-full-flow.XXXXXX.log)"
    trap 'rm -f "$log_file"' EXIT

    run_step "orchestrator ($CONFIG_PATH)" bash -lc "bun run orchestrator \"$CONFIG_PATH\" 2>&1 | tee \"$log_file\""

    RUN_DIR="$(extract_run_dir_from_log "$log_file")"
    [[ -n "$RUN_DIR" ]] || fail "Unable to detect run directory from orchestrator output"
    [[ -d "$RUN_DIR" ]] || fail "Detected run directory does not exist: $RUN_DIR"

    printf '[%s] Detected run: %s\n' "$SCRIPT_NAME" "$RUN_DIR"
fi

run_writer clean
run_writer image-prompt-chapters
run_writer image-precondition
run_writer image-gen-chapters
run_writer story-summary
run_writer translation-context --language "$TARGET_LANGUAGE"
run_writer translate-chapters --language "$TARGET_LANGUAGE"
run_writer translate-chapters --language "$TARGET_LANGUAGE" --improve
run_writer story-summary --language "$TARGET_LANGUAGE"

printf '\n[%s] Done. Key outputs:\n' "$SCRIPT_NAME"
printf '  - %s/story-summary.txt\n' "$RUN_DIR"
printf '  - %s/story-summary_%s.txt\n' "$RUN_DIR" "$TARGET_LANGUAGE"
printf '  - %s/translation-context_%s.md\n' "$RUN_DIR" "$TARGET_LANGUAGE"
printf '  - %s/processed/*_writer_senior_out_with_image_prompt.md\n' "$RUN_DIR"
printf '  - %s/processed/*_writer_senior_out_with_image_prompt_%s.md\n' "$RUN_DIR" "$TARGET_LANGUAGE"
printf '  - %s/images/\n' "$RUN_DIR"
