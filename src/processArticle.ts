import pLimit from "p-limit";
import type { BrandConfig, DriveFile, UploadedMedia } from "./types.js";
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

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const GDOC_MIME = "application/vnd.google-apps.document";

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

export async function processArticle(
  brand: BrandConfig,
  file: DriveFile,
): Promise<{ postId: number; link: string }> {
  console.log(`[${brand.id}] processing: ${file.name}`);

  const html = await loadHtml(file);
  const article = parseArticle(html);
  if (!article.title) throw new Error("article has no title");
  if (article.sections.length === 0) throw new Error("article has no h2 sections");

  const slug = slugify(article.title);
  const limit = pLimit(3);

  const heroPromptP = buildHeroPrompt(brand, article.title, article.intro);
  const sectionPromptsP = article.sections.map((s) =>
    limit(() => buildSectionPrompt(brand, s)),
  );
  const [heroPrompt, sectionPrompts] = await Promise.all([
    heroPromptP,
    Promise.all(sectionPromptsP),
  ]);

  const heroImage = await generateImage(
    brand,
    heroPrompt,
    `${slug}-hero`,
    article.title,
  );
  const heroMedia = await uploadMedia(brand, heroImage);

  const sectionMedia: (UploadedMedia | null)[] = [];
  for (let i = 0; i < article.sections.length; i++) {
    const section = article.sections[i];
    const prompt = sectionPrompts[i];
    try {
      const img = await generateImage(
        brand,
        prompt,
        `${slug}-${i + 1}-${slugify(section.heading)}`,
        section.heading,
      );
      const media = await uploadMedia(brand, img);
      sectionMedia.push(media);
    } catch (err) {
      console.warn(`[${brand.id}] section image failed (${section.heading}):`, err);
      sectionMedia.push(null);
    }
  }

  const content = renderMacplusArticle({
    article,
    hero: heroMedia,
    sectionImages: sectionMedia,
  });

  const draft = await createDraft(brand, {
    title: article.title,
    content,
    featuredMediaId: heroMedia.id,
    categoryIds: brand.wordpress.defaultCategoryId
      ? [brand.wordpress.defaultCategoryId]
      : undefined,
    authorId: brand.wordpress.defaultAuthorId,
  });

  await moveToProcessed(
    file.id,
    brand.drive.pendingFolderId,
    brand.drive.processedFolderId,
  );

  console.log(`[${brand.id}] draft created: ${draft.link}`);
  return { postId: draft.id, link: draft.link };
}
