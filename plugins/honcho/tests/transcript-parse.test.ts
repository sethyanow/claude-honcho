import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { parseTranscriptForBackfill } from "../src/skills/transcript-parse";

function transcript(lines: object[]): string {
  const path = join(mkdtempSync(join(tmpdir(), "backfill-test-")), "t.jsonl");
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n"));
  return path;
}

describe("parseTranscriptForBackfill", () => {
  test("keeps a prompt behind a leading system-reminder, without the reminder", () => {
    const path = transcript([
      { type: "user", message: { content: "<system-reminder>\nYou are operating in a git worktree.\n</system-reminder>\n\ndo the thing" } },
      { type: "assistant", message: { content: [{ type: "text", text: "done" }] } },
    ]);
    const users = parseTranscriptForBackfill(path).messages.filter((m) => m.role === "user");
    expect(users.map((m) => m.content)).toEqual(["do the thing"]);
  });

  test("keeps a typed prompt that starts with an unlisted tag, drops harness tags", () => {
    const path = transcript([
      { type: "user", message: { content: "<command-name>/clear</command-name>" } },
      { type: "user", message: { content: "<div> renders twice, why?" } },
      { type: "user", message: { content: [{ type: "text", text: "<bash-stdout>ok</bash-stdout>" }] } },
    ]);
    const users = parseTranscriptForBackfill(path).messages.filter((m) => m.role === "user");
    expect(users.map((m) => m.content)).toEqual(["<div> renders twice, why?"]);
  });

  test("drops user entries that match configured skipPatterns", () => {
    const path = transcript([
      { type: "user", message: { content: "You have 1 orchestration message. Run `orca orchestration check`" } },
      { type: "user", message: { content: "do the thing" } },
    ]);
    const users = parseTranscriptForBackfill(path, ["^You have \\d+ orchestration message"]).messages.filter((m) => m.role === "user");
    expect(users.map((m) => m.content)).toEqual(["do the thing"]);
  });
});
