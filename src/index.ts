import "dotenv/config";
import { loadBrands } from "./config.js";
import { listPending } from "./drive/client.js";
import { processArticle } from "./processArticle.js";
import type { BrandConfig, ProcessOptions } from "./types.js";
import { upsertEntry } from "./state.js";

interface CliFlags {
  once: boolean;
  dryRun: boolean;
  skipImages: boolean;
  brand: string | null;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = {
    once: argv.includes("--once"),
    dryRun: argv.includes("--dry-run"),
    skipImages: argv.includes("--skip-images"),
    brand: null,
  };
  const idx = argv.findIndex((a) => a === "--brand");
  if (idx >= 0 && argv[idx + 1]) flags.brand = argv[idx + 1];
  return flags;
}

async function tickBrand(
  brand: BrandConfig,
  opts: ProcessOptions,
): Promise<void> {
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
      await processArticle(brand, file, opts);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${brand.id}] failed: ${file.name}`, err);
      if (!opts.dryRun) {
        upsertEntry(brand.id, file.id, {
          fileName: file.name,
          status: "failed",
          error: message,
        });
      }
    }
  }
}

async function tickAll(
  brands: BrandConfig[],
  opts: ProcessOptions,
): Promise<void> {
  for (const brand of brands) {
    await tickBrand(brand, opts);
  }
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  let brands = loadBrands();
  if (flags.brand) {
    brands = brands.filter((b) => b.id === flags.brand);
    if (brands.length === 0) {
      throw new Error(`brand "${flags.brand}" not found in BRANDS_DIR`);
    }
  }
  console.log(
    `loaded ${brands.length} brand(s): ${brands.map((b) => b.id).join(", ")}` +
      (flags.dryRun ? " [DRY RUN]" : "") +
      (flags.skipImages ? " [SKIP IMAGES]" : ""),
  );

  const opts: ProcessOptions = {
    dryRun: flags.dryRun,
    skipImages: flags.skipImages,
  };

  if (flags.once || flags.dryRun) {
    await tickAll(brands, opts);
    return;
  }

  const intervalMs = Number(process.env.POLL_INTERVAL_SECONDS ?? "120") * 1000;
  console.log(`polling every ${intervalMs / 1000}s`);

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await tickAll(brands, opts);
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
