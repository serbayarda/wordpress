import OpenAI from "openai";
import type { BrandConfig, Section } from "../types.js";

let openai: OpenAI | null = null;
function client(): OpenAI {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

const SYSTEM = `You write concise English image prompts for blog illustrations.
Return ONLY the prompt, no preamble. Avoid text/words in the image.
Aim for editorial photography style unless the topic suggests otherwise.`;

function userMessage(brand: BrandConfig, heading: string, body: string): string {
  const trimmed = body.slice(0, 1200);
  return `Brand: ${brand.name}
Article section heading (Turkish): "${heading}"
Section content (Turkish, may be truncated):
${trimmed}

Write one image prompt (40-80 words) that visually represents this section. Style hint: ${brand.image.style}. Constraints: ${brand.image.negative}.`;
}

export async function buildSectionPrompt(
  brand: BrandConfig,
  section: Section,
): Promise<string> {
  const res = await client().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userMessage(brand, section.heading, section.bodyText) },
    ],
    temperature: 0.7,
  });
  return res.choices[0]?.message?.content?.trim() ?? section.heading;
}

export async function buildHeroPrompt(
  brand: BrandConfig,
  title: string,
  intro: string,
): Promise<string> {
  return buildSectionPrompt(brand, {
    heading: title,
    bodyHtml: intro,
    bodyText: intro.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  });
}
