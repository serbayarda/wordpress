import type { BrandConfig } from "../types.js";
import { wpClient } from "./client.js";

interface CreateDraftInput {
  title: string;
  content: string;
  featuredMediaId?: number;
  categoryIds?: number[];
  authorId?: number | null;
}

export async function createDraft(
  brand: BrandConfig,
  input: CreateDraftInput,
): Promise<{ id: number; link: string }> {
  const wp = wpClient(brand);
  const body: Record<string, unknown> = {
    title: input.title,
    content: input.content,
    status: "draft",
  };
  if (input.featuredMediaId) body.featured_media = input.featuredMediaId;
  if (input.categoryIds?.length) body.categories = input.categoryIds;
  if (input.authorId) body.author = input.authorId;

  const res = await wp.post("/posts", body);
  return { id: res.data.id, link: res.data.link };
}

export async function fetchRelatedPostIds(
  brand: BrandConfig,
  excludeId: number,
  categoryId: number | null,
): Promise<number[]> {
  const wp = wpClient(brand);
  const params: Record<string, unknown> = {
    per_page: brand.featuredPosts.count + 1,
    exclude: excludeId,
    status: "publish",
    orderby: "date",
    order: "desc",
  };
  if (categoryId && brand.featuredPosts.sameCategoryOnly) {
    params.categories = categoryId;
  }
  const res = await wp.get("/posts", { params });
  const ids = (res.data as Array<{ id: number }>).map((p) => p.id);
  return ids.slice(0, brand.featuredPosts.count);
}
