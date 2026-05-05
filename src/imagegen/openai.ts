import OpenAI from "openai";
import type { BrandConfig, GeneratedImage } from "../types.js";

let cached: OpenAI | null = null;
function client(): OpenAI {
  if (!cached) cached = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return cached;
}

export async function generateOpenAIImage(
  brand: BrandConfig,
  prompt: string,
  filename: string,
  alt: string,
): Promise<GeneratedImage> {
  const res = await client().images.generate({
    model: "gpt-image-1",
    prompt,
    size: brand.image.size as "1024x1024" | "1792x1024" | "1024x1792",
    n: 1,
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image");
  return {
    bytes: Buffer.from(b64, "base64"),
    mime: "image/png",
    filename: filename.endsWith(".png") ? filename : `${filename}.png`,
    alt,
  };
}
