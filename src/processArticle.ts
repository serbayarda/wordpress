import fs from "node:fs";
import path from "node:path";
import pLimit from "p-limit";
import type {
  ArticleStateEntry,
  BrandConfig,
  DriveFile,
  GeneratedImage,
  ProcessOptions,
  Section,
  UploadedMedia,
} from "./types.js";
import {
  downloadDocx,
  exportGoogleDocAsHtml,
  moveToProcessed,
} from "./drive/client.js";
import { docxToHtml } from "./parsers/docx.js";
import { parseArticle } from "./parsers/sections.js";
import {
  buildHeroPrompt,
  buildSectionPrompt,
  generateImage,
} from "./imagegen/index.js";
import { uploadMedia } from "./wp/media.js";
import { createDraft } from "./wp/posts.js";
import { renderMacplusArticle } from "./templates/macplus.js";
import { slugify } from "./slugify.js";
import { getEntry, upsertEntry } from "./state.js";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const GDOC_MIME = "application/vnd.google-apps.document";

const TMP_DIR = path.resolve(process.env.TMP_DIR ?? "./tmp");

async function loadHtml(file: DriveFile): Promise<string> {
  if (file.mimeType === GDOC_MIME) {
    return exportGoogleDocAsHtml(file.id);
  }
  if (file.mimeType === DOCX_MIME || file.name.toLowerCase().endsWith(".docx")) {
    const buf = await downloadDocx(file.id);
    return docxToHtml(buf);
  }
  throw new Error(`Unsupported mime type: ${file.mimeType}`);
}

function writeBytes(dir: string, filename: string, bytes: Buffer): string {
  fs.mkdirSync(dir, { recursive: true });
  const full = path.join(dir, filename);
  fs.writeFileSync(full, bytes);
  return full;
}

function placeholderMedia(
  index: number,
  alt: string,
  width: number,
  height: number,
): UploadedMedia {
  return {
    id: -(index + 1),
    sourceUrl: `https://placehold.co/${width}x${height}?text=${encodeURIComponent(alt.slice(0, 40))}`,
    alt,
  };
}

function localFileMedia(
  index: number,
  filePath: string,
  alt: string,
): UploadedMedia {
  return {
    id: -(index + 1),
    sourceUrl: `file://${filePath}`,
    alt,
  };
}

function persist(
  brand: BrandConfig,
  fileId: string,
  patch: Partial<ArticleStateEntry>,
  opts: ProcessOptions,
): void {
  if (opts.dryRun) return;
  upsertEntry(brand.id, fileId, patch);
}

export async function processArticle(
  brand: BrandConfig,
  file: DriveFile,
  opts: ProcessOptions,
): Promise<{ postId: number | null; link: string | null }> {
  const tag = `[${brand.id}${opts.dryRun ? " DRY" : ""}]`;
  console.log(`${tag} processing: ${file.name}`);

  const prior = opts.dryRun ? undefined : getEntry(brand.id, file.id);
  if (prior?.status === "done" && prior.postId) {
    console.log(`${tag} already done (post ${prior.postId}); ensuring Drive moved`);
    try {
      await moveToProcessed(
        file.id,
        brand.drive.pendingFolderId,
        brand.drive.processedFolderId,
      );
    } catch (err) {
      console.warn(`${tag} drive move retry failed:`, err);
    }
    return { postId: prior.postId, link: prior.postLink ?? null };
  }

  persist(brand, file.id, { fileName: file.name, status: "in_progress" }, opts);

  const html = await loadHtml(file);
  const article = parseArticle(html);
  if (!article.title) throw new Error("article has no title");
  if (article.sections.length === 0) {
    throw new Error("article has no h2 sections");
  }

  const slug = slugify(article.title);
  const dryDir = path.join(TMP_DIR, brand.id, slug);

  persist(
    brand,
    file.id,
    { title: article.title, slug },
    opts,
  );

  // Step 1: prompts. Skip if cached.
  const limit = pLimit(3);
  const cachedHeroPrompt = prior?.heroPrompt;
  const cachedSectionPrompts = prior?.sectionPrompts;

  const heroPromptP = cachedHeroPrompt
    ? Promise.resolve(cachedHeroPrompt)
    : buildHeroPrompt(brand, article.title, article.intro);

  const sectionPromptsP: Promise<string>[] = article.sections.map((s, i) => {
    const cached = cachedSectionPrompts?.[i];
    if (cached) return Promise.resolve(cached);
    return limit(() => buildSectionPrompt(brand, s));
  });

  const [heroPrompt, sectionPrompts] = await Promise.all([
    heroPromptP,
    Promise.all(sectionPromptsP),
  ]);

  persist(
    brand,
    file.id,
    { heroPrompt, sectionPrompts },
    opts,
  );

  // Step 2: hero image.
  let heroMedia: UploadedMedia;
  if (prior?.heroMedia) {
    heroMedia = prior.heroMedia;
    console.log(`${tag} reusing hero media ${heroMedia.id}`);
  } else if (opts.skipImages) {
    heroMedia = placeholderMedia(0, article.title, 1792, 1024);
  } else {
    const heroImg = await generateImage(
      brand,
      heroPrompt,
      `${slug}-hero`,
      article.title,
    );
    if (opts.dryRun) {
      const p = writeBytes(dryDir, heroImg.filename, heroImg.bytes);
      heroMedia = localFileMedia(0, p, article.title);
    } else {
      heroMedia = await uploadMedia(brand, heroImg);
      persist(brand, file.id, { heroMedia }, opts);
    }
  }

  // Step 3: per-section images.
  const sectionMedia: (UploadedMedia | null)[] = prior?.sectionMedia
    ? [...prior.sectionMedia]
    : new Array(article.sections.length).fill(null);

  for (let i = 0; i < article.sections.length; i++) {
    if (sectionMedia[i]) {
      console.log(`${tag} section ${i + 1} reusing media`);
      continue;
    }
    const section = article.sections[i];
    const prompt = sectionPrompts[i];
    const filenameBase = `${slug}-${i + 1}-${slugify(section.heading)}`;
    try {
      let media: UploadedMedia;
      if (opts.skipImages) {
        media = placeholderMedia(i + 1, section.heading, 1792, 1024);
      } else {
        const img: GeneratedImage = await generateImage(
          brand,
          prompt,
          filenameBase,
          section.heading,
        );
        if (opts.dryRun) {
          const p = writeBytes(dryDir, img.filename, img.bytes);
          media = localFileMedia(i + 1, p, section.heading);
        } else {
          media = await uploadMedia(brand, img);
        }
      }
      sectionMedia[i] = media;
      persist(brand, file.id, { sectionMedia }, opts);
    } catch (err) {
      console.warn(`${tag} section ${i + 1} (${section.heading}) failed:`, err);
      sectionMedia[i] = null;
      persist(brand, file.id, { sectionMedia }, opts);
    }
  }

  // Step 4: render block HTML.
  const content = renderMacplusArticle({
    article,
    hero: heroMedia,
    sectionImages: sectionMedia,
  });

  if (opts.dryRun) {
    fs.mkdirSync(dryDir, { recursive: true });
    fs.writeFileSync(path.join(dryDir, "post.html"), content);
    fs.writeFileSync(
      path.join(dryDir, "article.json"),
      JSON.stringify({ article, heroPrompt, sectionPrompts }, null, 2),
    );
    console.log(`${tag} dry-run output: ${dryDir}`);
    return { postId: null, link: null };
  }

  // Step 5: create draft (skipping if already created on a previous attempt).
  let postId = prior?.postId ?? 0;
  let postLink = prior?.postLink ?? "";
  if (!postId) {
    const draft = await createDraft(brand, {
      title: article.title,
      content,
      featuredMediaId: heroMedia.id > 0 ? heroMedia.id : undefined,
      categoryIds: brand.wordpress.defaultCategoryId
        ? [brand.wordpress.defaultCategoryId]
        : undefined,
      authorId: brand.wordpress.defaultAuthorId,
    });
    postId = draft.id;
    postLink = draft.link;
    persist(brand, file.id, { postId, postLink }, opts);
  }

  // Step 6: move source file. Idempotent retry-safe.
  try {
    await moveToProcessed(
      file.id,
      brand.drive.pendingFolderId,
      brand.drive.processedFolderId,
    );
  } catch (err) {
    console.warn(`${tag} drive move failed (will retry next tick):`, err);
  }

  persist(brand, file.id, { status: "done" }, opts);
  console.log(`${tag} draft created: ${postLink}`);
  return { postId, link: postLink };
}
