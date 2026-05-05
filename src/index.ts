import "dotenv/config";
import { loadBrands } from "./config.js";
import { listPending } from "./drive/client.js";
import { processArticle } from "./processArticle.js";
import type { BrandConfig } from "./types.js";

async function tickBrand(brand: BrandConfig): Promise<void> {
  let files;
  try {
    files = await listPending(brand.drive.pendingFolderId);
  } catch (err) {
    console.error(`[${brand.id}] drive list failed:`, err);
    return;
  }
  if (files.length === 0) {
    console.log(`[${brand.id}] no pending files`);
    return;
  }
  console.log(`[${brand.id}] ${files.length} pending file(s)`);
  for (const file of files) {
    try {
      await processArticle(brand, file);
    } catch (err) {
      console.error(`[${brand.id}] failed: ${file.name}`, err);
    }
  }
}

async function tickAll(brands: BrandConfig[]): Promise<void> {
  for (const brand of brands) {
    await tickBrand(brand);
  }
}

async function main(): Promise<void> {
  const brands = loadBrands();
  console.log(`loaded ${brands.length} brand(s): ${brands.map((b) => b.id).join(", ")}`);

  const once = process.argv.includes("--once");
  if (once) {
    await tickAll(brands);
    return;
  }

  const intervalMs = Number(process.env.POLL_INTERVAL_SECONDS ?? "120") * 1000;
  console.log(`polling every ${intervalMs / 1000}s`);

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await tickAll(brands);
    } finally {
      running = false;
    }
  };

  await tick();
  setInterval(tick, intervalMs);
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
