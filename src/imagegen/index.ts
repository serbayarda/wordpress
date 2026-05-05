import type { BrandConfig, GeneratedImage } from "../types.js";
import { generateOpenAIImage } from "./openai.js";
import { generateGeminiImage } from "./gemini.js";

export async function generateImage(
  brand: BrandConfig,
  prompt: string,
  filename: string,
  alt: string,
): Promise<GeneratedImage> {
  if (brand.image.provider === "openai") {
    return generateOpenAIImage(brand, prompt, filename, alt);
  }
  return generateGeminiImage(brand, prompt, filename, alt);
}

export { buildHeroPrompt, buildSectionPrompt } from "./promptBuilder.js";
