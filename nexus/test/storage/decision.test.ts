import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { appendDecision } from "../../src/storage/decision";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { realpathSync } from "node:fs";
import { Config } from "../../src/config/config";
import { DECISIONS_DIR, getDateString } from "../../src/storage/layout";

describe("appendDecision", () => {
  let tempDir: string;
  let config: Config;

  beforeEach(() => {
    tempDir = realpathSync(mkdtempSync(join(tmpdir(), "nexus-decision-test-")));
    config = {
      serverBaseUrl: "http://localhost:8765",
      stateDir: tempDir,
      projectsDir: join(tempDir, "projects"),
      runsDir: join(tempDir, "runs"),
      logsDir: join(tempDir, "logs"),
      logLevel: "info",
    };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("should create a decision file with correct name and content", async () => {
    const projectId = "test-project";
    const title = "Use Bun for Server";
    const content = "Bun is faster and has a built-in test runner.";

    const filePath = await appendDecision(config, projectId, title, content);

    const expectedFilename = "001-use-bun-for-server.md";
    expect(filePath).toContain(join(config.projectsDir, projectId, DECISIONS_DIR, expectedFilename));

    const file = Bun.file(filePath);
    expect(await file.exists()).toBe(true);

    const text = await file.text();
    const date = getDateString();

    expect(text).toContain("Date: " + date);
    expect(text).toContain("Status: accepted");
    expect(text).toContain("# Use Bun for Server");
    expect(text).toContain(content);
  });

  test("should increment sequence ID for multiple decisions", async () => {
    const projectId = "test-project";
    
    const path1 = await appendDecision(config, projectId, "First", "Content 1");
    const path2 = await appendDecision(config, projectId, "Second", "Content 2");

    expect(path1).toContain("001-first.md");
    expect(path2).toContain("002-second.md");
  });

  test("should slugify complex titles", async () => {
    const projectId = "test-project";
    const title = "Decision: Use @path for Includes!";
    
    const filePath = await appendDecision(config, projectId, title, "Content");
    
    expect(filePath).toContain("001-decision-use-path-for-includes.md");
  });
});
