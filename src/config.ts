import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import type { BrandConfig } from "./types.js";

function envKey(brandId: string, suffix: string): string {
  const id = brandId.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return `${id}_${suffix}`;
}

function resolveSecrets(brand: BrandConfig): BrandConfig {
  const passEnv = process.env[envKey(brand.id, "WP_APP_PASSWORD")];
  const userEnv = process.env[envKey(brand.id, "WP_USERNAME")];
  const applicationPassword = passEnv ?? brand.wordpress.applicationPassword;
  const username = userEnv ?? brand.wordpress.username;
  if (!applicationPassword) {
    throw new Error(
      `Missing WP password for brand "${brand.id}". Set ${envKey(brand.id, "WP_APP_PASSWORD")} in env.`,
    );
  }
  if (!username) {
    throw new Error(
      `Missing WP username for brand "${brand.id}". Set ${envKey(brand.id, "WP_USERNAME")} in env or in brand JSON.`,
    );
  }
  return {
    ...brand,
    wordpress: { ...brand.wordpress, applicationPassword, username },
  };
}

export function loadBrands(): BrandConfig[] {
  const dir = process.env.BRANDS_DIR ?? "./brands";
  const abs = path.resolve(dir);
  const files = fs.readdirSync(abs).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    const raw = fs.readFileSync(path.join(abs, f), "utf8");
    return resolveSecrets(JSON.parse(raw) as BrandConfig);
  });
}

export function getServiceAccount(): Record<string, unknown> {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  if (!b64) throw new Error("GOOGLE_SERVICE_ACCOUNT_B64 is not set");
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}
