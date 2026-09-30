/**
 * Parse Claude Code session transcripts (`~/.claude/projects/<dir>/<uuid>.jsonl`)
 * for the /honcho:import backfill.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { entryText, userPromptText, type TranscriptEntry } from "../prompt-filters.js";

/** Ordered, cleaned message ready to upload. */
export interface ParsedMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  /** Assistant only: last block of its turn (assistant_response vs assistant_intermediate). */
  isResponse?: boolean;
  /** Entry's env, used for session mapping. */
  cwd?: string;
  gitBranch?: string;
}

function entryType(entry: TranscriptEntry): string | undefined {
  return entry.type || entry.role;
}

function readLines(transcriptPath: string): string[] {
  if (!transcriptPath || !existsSync(transcriptPath)) return [];
  try {
    return readFileSync(transcriptPath, "utf-8").split("\n").filter((line) => line.trim());
  } catch {
    return [];
  }
}

/**
 * Full-conversation parse: user + assistant messages in order, each with its
 * timestamp and the cwd/gitBranch for session mapping. Skips isMeta / isSidechain
 * / tool-result-only / harness-injected entries.
 */
export function parseTranscriptForBackfill(transcriptPath: string): {
  messages: ParsedMessage[];
  cwd?: string;
  gitBranch?: string;
  sessionId?: string;
} {
  const messages: ParsedMessage[] = [];
  let cwd: string | undefined;
  let gitBranch: string | undefined;
  let sessionId: string | undefined;

  for (const line of readLines(transcriptPath)) {
    let entry: TranscriptEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    // Track the latest environment seen — used to name the session.
    if (entry.cwd) cwd = entry.cwd;
    if (entry.gitBranch) gitBranch = entry.gitBranch;
    if (entry.sessionId) sessionId = entry.sessionId;

    if (entry.isMeta || entry.isSidechain) continue;
    const type = entryType(entry);

    if (type === "user") {
      const content = userPromptText(entry);
      if (content !== null) {
        messages.push({ role: "user", content, timestamp: entry.timestamp, cwd: entry.cwd, gitBranch: entry.gitBranch });
      }
    } else if (type === "assistant") {
      const content = entryText(entry, "\n\n").trim();
      if (content) {
        messages.push({ role: "assistant", content, timestamp: entry.timestamp, cwd: entry.cwd, gitBranch: entry.gitBranch });
      }
    }
  }

  // Last assistant block of a turn = response, earlier ones = intermediate.
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role !== "assistant") continue;
    const next = messages[i + 1];
    messages[i].isResponse = !next || next.role === "user";
  }

  return { messages, cwd, gitBranch, sessionId };
}

const PROJECTS_DIR = join(homedir(), ".claude", "projects");

/** All transcript files under ~/.claude/projects modified within `days`. */
export function findTranscripts(days: number): Array<{ path: string; mtimeMs: number }> {
  if (!existsSync(PROJECTS_DIR)) return [];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const out: Array<{ path: string; mtimeMs: number }> = [];
  for (const dir of readdirSync(PROJECTS_DIR)) {
    const dirPath = join(PROJECTS_DIR, dir);
    let entries: string[];
    try {
      if (!statSync(dirPath).isDirectory()) continue;
      entries = readdirSync(dirPath);
    } catch {
      continue;
    }
    for (const file of entries) {
      if (!file.endsWith(".jsonl")) continue;
      const path = join(dirPath, file);
      try {
        const st = statSync(path);
        if (st.mtimeMs >= cutoff) out.push({ path, mtimeMs: st.mtimeMs });
      } catch {
        continue;
      }
    }
  }
  return out;
}
