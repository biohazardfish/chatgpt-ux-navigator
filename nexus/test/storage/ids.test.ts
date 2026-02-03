import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { getNextSequenceId } from "../../src/storage/ids";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { realpathSync } from "node:fs";

describe("getNextSequenceId", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = realpathSync(mkdtempSync(join(tmpdir(), "nexus-ids-test-")));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("should start at 001 for empty directory", async () => {
    const id = await getNextSequenceId(tempDir, "T");
    expect(id).toBe("T-001");
  });

  test("should start at 001 for empty directory (no prefix)", async () => {
    const id = await getNextSequenceId(tempDir, "");
    expect(id).toBe("001");
  });

  test("should increment from max ID with prefix", async () => {
    writeFileSync(join(tempDir, "T-001"), "");
    writeFileSync(join(tempDir, "T-009"), "");
    writeFileSync(join(tempDir, "unrelated.txt"), "");

    const id = await getNextSequenceId(tempDir, "T");
    expect(id).toBe("T-010");
  });

  test("should increment from max ID without prefix", async () => {
    writeFileSync(join(tempDir, "001-slug"), "");
    writeFileSync(join(tempDir, "005-other"), "");
    writeFileSync(join(tempDir, "T-010"), "");
    
    const id = await getNextSequenceId(tempDir, "");
    expect(id).toBe("006");
  });

  test("should handle non-existent directory", async () => {
    const nonExistent = join(tempDir, "missing");
    const id = await getNextSequenceId(nonExistent, "T");
    expect(id).toBe("T-001");
  });
});
