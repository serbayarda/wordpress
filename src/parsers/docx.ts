import mammoth from "mammoth";

export async function docxToHtml(buf: Buffer): Promise<string> {
  const { value } = await mammoth.convertToHtml({ buffer: buf });
  return value;
}
