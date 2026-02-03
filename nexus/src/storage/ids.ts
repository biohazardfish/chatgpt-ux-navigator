import { readdir } from "node:fs/promises";

/**
 * Scans a directory for sequential IDs and returns the next one.
 * Patterns:
 * - With prefix: {prefix}-{XXX}... (e.g., T-001)
 * - Without prefix: {XXX}... (e.g., 001-decision)
 * 
 * @param dir Directory to scan
 * @param prefix ID prefix (e.g., "T" or "")
 * @returns Next formatted ID (e.g., "T-002" or "002")
 */
export async function getNextSequenceId(dir: string, prefix: string): Promise<string> {
  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      const nextNum = "001";
      return prefix ? `${prefix}-${nextNum}` : nextNum;
    }
    throw error;
  }

  const separator = prefix ? "-" : "";
  const regex = new RegExp(`^${prefix}${separator}(\\d+)`);
  
  let maxId = 0;
  for (const file of files) {
    const match = file.match(regex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxId) {
        maxId = num;
      }
    }
  }

  const nextNum = (maxId + 1).toString().padStart(3, "0");
  return prefix ? `${prefix}-${nextNum}` : nextNum;
}
