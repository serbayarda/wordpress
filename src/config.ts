import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import type { BrandConfig } from "./types.js";

export function loadBrands(): BrandConfig[] {
  const dir = process.env.BRANDS_DIR ?? "./brands";
  const abs = path.resolve(dir);
  const files = fs.readdirSync(abs).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    const raw = fs.readFileSync(path.join(abs, f), "utf8");
    return JSON.parse(raw) as BrandConfig;
  });
}

export function getServiceAccount(): Record<string, unknown> {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  if (!b64) throw new Error("GOOGLE_SERVICE_ACCOUNT_B64 is not set");
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}
