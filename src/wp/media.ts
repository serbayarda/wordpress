import type { BrandConfig, GeneratedImage, UploadedMedia } from "../types.js";
import { wpClient } from "./client.js";

export async function uploadMedia(
  brand: BrandConfig,
  image: GeneratedImage,
): Promise<UploadedMedia> {
  const wp = wpClient(brand);
  const res = await wp.post("/media", image.bytes, {
    headers: {
      "Content-Type": image.mime,
      "Content-Disposition": `attachment; filename="${image.filename}"`,
    },
    maxBodyLength: Infinity,
  });
  const id = res.data.id as number;
  const sourceUrl = res.data.source_url as string;

  if (image.alt) {
    await wp.post(`/media/${id}`, { alt_text: image.alt, title: image.alt });
  }

  return { id, sourceUrl, alt: image.alt };
}
