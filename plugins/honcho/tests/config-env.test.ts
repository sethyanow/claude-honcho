import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { runInSandbox } from "./sandbox";

describe("skipPatterns in a hand-edited config file", () => {
  // A non-string entry would compile as a regex for its printed form, so
  // [null] would skip every prompt that contains "null".
  test("non-string entries are dropped and string patterns kept", () => {
    const home = mkdtempSync(join(tmpdir(), "honcho-home-"));
    try {
      mkdirSync(join(home, ".honcho"), { recursive: true });
      writeFileSync(join(home, ".honcho", "config.json"), JSON.stringify({
        apiKey: "k", peerName: "t", skipPatterns: [null, 7, { re: "x" }, "^FIRSTMATE SUPERVISION WAKE:"],
      }));
      const out = runInSandbox(
        home,
        `import { loadConfig } from "./src/config.ts";
         console.log(JSON.stringify(loadConfig("claude_code")?.skipPatterns));`,
      );
      expect(JSON.parse(out)).toEqual(["^FIRSTMATE SUPERVISION WAKE:"]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
