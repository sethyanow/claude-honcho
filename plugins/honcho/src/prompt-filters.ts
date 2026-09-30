// Decides what counts as the user's own input, for the UserPromptSubmit hooks
// (raw prompt) and the transcript readers (Stop hook, import backfill).

// Terse acknowledgements
const TRIVIAL_REPLY_PATTERN = /^(yes|no|ok|sure|thanks|y|n|yep|nope|yeah|nah|continue|go ahead|do it|proceed)$/i;

const SLASH_COMMAND_PATTERN = /^\//;

export function isTerseReply(text: string): boolean {
  return TRIVIAL_REPLY_PATTERN.test(text.trim());
}

/** The user typed it, but it is not worth a memory lookup. */
export function isLowSignal(text: string): boolean {
  const trimmed = text.trim();
  return TRIVIAL_REPLY_PATTERN.test(trimmed) || SLASH_COMMAND_PATTERN.test(trimmed);
}

// Harness-injected turns that Claude Code delivers in the user-message slot but
// the human never typed: background-task events, slash-command stdout, injected
// system reminders.
const HARNESS_INJECTED_PATTERNS = [
  /^<task-notification>/,
  /^<local-command-stdout>/,
  /^<command-name>/,
  /^<command-message>/,
  /^<system-reminder>/,
  /^<bash-(stdout|stderr|input)>/,
  // `<<...>>` sentinels the runtime re-submits through the user slot and
  // resolves at fire time (e.g. <<autonomous-loop-dynamic>> from /loop wakeups)
  /^<<[\w-]+>>$/,
];

// Reminder blocks the harness prepends to a typed prompt (worktree notice,
// background-task status); the user's text follows them.
const LEADING_REMINDERS = /^(?:\s*<system-reminder>[\s\S]*?<\/system-reminder>)+\s*/;

export function stripLeadingReminders(prompt: string): string {
  return prompt.replace(LEADING_REMINDERS, "");
}

// `skipPatterns` come from a hand-edited config file, so a pattern that does
// not compile is skipped rather than thrown.
function matchesSkipPattern(text: string, skipPatterns: string[]): boolean {
  return skipPatterns.some((source) => {
    try {
      return new RegExp(source).test(text);
    } catch {
      return false;
    }
  });
}

/**
 * The user's own words in `text`, without leading reminders, or null when
 * nothing typed remains or it matches a harness pattern or a configured
 * `skipPatterns` entry.
 */
export function userText(text: string, skipPatterns: string[] = []): string | null {
  const trimmed = stripLeadingReminders(text).trim();
  if (!trimmed || HARNESS_INJECTED_PATTERNS.some((p) => p.test(trimmed)) || matchesSkipPattern(trimmed, skipPatterns)) {
    return null;
  }
  return trimmed;
}

export interface TranscriptEntry {
  type?: string;
  role?: string;
  timestamp?: string;
  isMeta?: boolean;
  isSidechain?: boolean;
  promptSource?: string;
  origin?: { kind?: string };
  cwd?: string;
  gitBranch?: string;
  sessionId?: string;
  message?: {
    role?: string;
    content: string | Array<{ type: string; text?: string; name?: string; input?: unknown }>;
  };
  content?: string | Array<{ type: string; text?: string }>;
}

/** Text blocks of a transcript entry. Tool results and other block types are dropped. */
export function entryText(entry: TranscriptEntry, separator = "\n"): string {
  const mc = entry.message?.content ?? entry.content;
  if (typeof mc === "string") return mc;
  if (Array.isArray(mc)) return mc.filter((b) => b.type === "text" && b.text).map((b) => b.text!).join(separator);
  return "";
}

/** The typed prompt of a user transcript entry, or null for isMeta, tool-result and harness entries. */
export function userPromptText(entry: TranscriptEntry, skipPatterns: string[] = []): string | null {
  if (entry.isMeta) return null;
  return userText(entryText(entry), skipPatterns);
}
