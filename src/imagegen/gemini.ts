import { GoogleGenerativeAI } from "@google/generative-ai";
import type { BrandConfig, GeneratedImage } from "../types.js";

let cached: GoogleGenerativeAI | null = null;
function client(): GoogleGenerativeAI {
  if (!cached) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is not set");
    cached = new GoogleGenerativeAI(key);
  }
  return cached;
}

export async function generateGeminiImage(
  _brand: BrandConfig,
  prompt: string,
  filename: string,
  alt: string,
): Promise<GeneratedImage> {
  const model = client().getGenerativeModel({
    model: "gemini-2.5-flash-image",
  });
  const res = await model.generateContent([prompt]);
  const parts = res.response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const data = (part as { inlineData?: { data: string; mimeType: string } })
      .inlineData;
    if (data?.data) {
      const mime = data.mimeType || "image/png";
      const ext = mime.split("/")[1] ?? "png";
      return {
        bytes: Buffer.from(data.data, "base64"),
        mime,
        filename: filename.endsWith(`.${ext}`) ? filename : `${filename}.${ext}`,
        alt,
      };
    }
  }
  throw new Error("Gemini returned no image data");
}
