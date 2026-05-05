import type { ParsedArticle, UploadedMedia } from "../types.js";

interface RenderInput {
  article: ParsedArticle;
  hero: UploadedMedia;
  sectionImages: (UploadedMedia | null)[];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderParagraphs(html: string): string {
  const blocks: string[] = [];
  const paraRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  const ulRegex = /<ul[^>]*>([\s\S]*?)<\/ul>/gi;

  const segments: { type: "p" | "ul"; html: string; index: number }[] = [];
  for (const m of html.matchAll(paraRegex)) {
    segments.push({ type: "p", html: m[1], index: m.index ?? 0 });
  }
  for (const m of html.matchAll(ulRegex)) {
    segments.push({ type: "ul", html: m[1], index: m.index ?? 0 });
  }
  segments.sort((a, b) => a.index - b.index);

  for (const seg of segments) {
    const inner = seg.html.trim();
    if (!inner) continue;
    if (seg.type === "p") {
      blocks.push(`<!-- wp:paragraph -->\n<p>${inner}</p>\n<!-- /wp:paragraph -->`);
    } else {
      const items: string[] = [];
      for (const li of inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
        const t = li[1].trim();
        if (!t) continue;
        items.push(
          `<!-- wp:list-item -->\n<li>${t}</li>\n<!-- /wp:list-item -->`,
        );
      }
      if (items.length) {
        blocks.push(
          `<!-- wp:list -->\n<ul class="wp-block-list">${items.join("\n\n")}</ul>\n<!-- /wp:list -->`,
        );
      }
    }
  }

  return blocks.join("\n\n");
}

function renderImage(media: UploadedMedia): string {
  const attrs = JSON.stringify({
    id: media.id,
    sizeSlug: "full",
    linkDestination: "none",
  });
  return `<!-- wp:image ${attrs} -->
<figure class="wp-block-image size-full"><img src="${media.sourceUrl}" alt="${escapeHtml(media.alt)}" class="wp-image-${media.id}"/></figure>
<!-- /wp:image -->`;
}

function renderSection(
  heading: string,
  bodyHtml: string,
  image: UploadedMedia | null,
): string {
  const inner = [
    `<!-- wp:heading -->\n<h2 class="wp-block-heading">${escapeHtml(heading)}</h2>\n<!-- /wp:heading -->`,
    renderParagraphs(bodyHtml),
    image ? renderImage(image) : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return `<!-- wp:macplus/blog-content-section -->
<div class="wp-block-macplus-blog-content-section">${inner}</div>
<!-- /wp:macplus/blog-content-section -->`;
}

function renderSpotImage(media: UploadedMedia): string {
  const imageMeta = {
    id: media.id,
    url: media.sourceUrl,
    alt: media.alt,
    mime: "image/png",
  };
  return `<!-- wp:macplus/blog-spot-image ${JSON.stringify({ image: imageMeta })} /-->`;
}

export function renderMacplusArticle(input: RenderInput): string {
  const sectionsHtml = input.article.sections
    .map((s, i) => renderSection(s.heading, s.bodyHtml, input.sectionImages[i] ?? null))
    .join("\n\n");

  return [
    `<!-- wp:macplus/blog-title /-->`,
    renderSpotImage(input.hero),
    `<!-- wp:macplus/blog-content -->\n<div class="wp-block-macplus-blog-content">${sectionsHtml}</div>\n<!-- /wp:macplus/blog-content -->`,
    `<!-- wp:macplus/blog-featured-post {"title":"ÖNE ÇIKANLAR","className":"pb-desktop-128 pt-desktop-128 pt-mobile-48 pb-mobile-48 customize rectangle-mobile"} /-->`,
  ].join("\n\n");
}
