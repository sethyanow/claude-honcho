import { describe, expect, test } from "bun:test";
import { isLowSignal, stripLeadingReminders, userText } from "../src/prompt-filters";

const worktreeNotice =
  "<system-reminder>\nYou are operating in a git worktree.\nWorktree path: /tmp/wt\n</system-reminder>\n\n";
const taskNotice = "<system-reminder>\nThe user started your suggested background task.\n</system-reminder>\n";

describe("stripLeadingReminders", () => {
  test("removes a leading reminder and keeps the typed text", () => {
    expect(stripLeadingReminders(worktreeNotice + "is this resolved on main?")).toBe("is this resolved on main?");
  });

  test("removes stacked reminders", () => {
    expect(stripLeadingReminders(worktreeNotice + taskNotice + "go")).toBe("go");
  });

  test("leaves reminders that are not leading", () => {
    const p = "see this <system-reminder>x</system-reminder>";
    expect(stripLeadingReminders(p)).toBe(p);
  });
});

describe("userText", () => {
  test("typed prompt behind a reminder is user input, without the reminder", () => {
    expect(userText(worktreeNotice + "This live llm test failed")).toBe("This live llm test failed");
  });

  test("reminder with nothing after it is filtered", () => {
    expect(userText(taskNotice)).toBeNull();
  });

  test("unclosed reminder is filtered", () => {
    expect(userText("<system-reminder>\ntruncated")).toBeNull();
  });

  test("other harness tags behind a reminder are still filtered", () => {
    expect(userText(worktreeNotice + "<task-notification>done</task-notification>")).toBeNull();
  });

  test("plain prompt is user input", () => {
    expect(userText("do the thing")).toBe("do the thing");
  });

  test("typed prompt that starts with an unlisted tag is user input", () => {
    expect(userText("<div> renders twice, why?")).toBe("<div> renders twice, why?");
  });
});

describe("isLowSignal", () => {
  test("terse replies and slash commands are low signal", () => {
    expect(isLowSignal("ok")).toBe(true);
    expect(isLowSignal(" go ahead ")).toBe(true);
    expect(isLowSignal("/honcho:status")).toBe(true);
  });

  test("a real question is not low signal", () => {
    expect(isLowSignal("ok, why does the build fail?")).toBe(false);
  });
});
