import fs from "node:fs";
import path from "node:path";
import type { ArticleStateEntry, BrandState } from "./types.js";

const STATE_DIR = path.resolve(process.env.STATE_DIR ?? "./state");

function fileFor(brandId: string): string {
  return path.join(STATE_DIR, `${brandId}.json`);
}

export function loadState(brandId: string): BrandState {
  const p = fileFor(brandId);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as BrandState;
  } catch {
    return {};
  }
}

export function saveState(brandId: string, state: BrandState): void {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  const p = fileFor(brandId);
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, p);
}

export function upsertEntry(
  brandId: string,
  fileId: string,
  patch: Partial<ArticleStateEntry>,
): ArticleStateEntry {
  const state = loadState(brandId);
  const now = new Date().toISOString();
  const existing = state[fileId];
  const base: ArticleStateEntry = existing ?? {
    fileId,
    fileName: "",
    status: "in_progress",
    startedAt: now,
    updatedAt: now,
  };
  const next: ArticleStateEntry = {
    ...base,
    ...patch,
    fileId,
    updatedAt: now,
  };
  state[fileId] = next;
  saveState(brandId, state);
  return next;
}

export function getEntry(
  brandId: string,
  fileId: string,
): ArticleStateEntry | undefined {
  return loadState(brandId)[fileId];
}
