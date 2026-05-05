export type ImageProvider = "openai" | "gemini";

export interface BrandConfig {
  id: string;
  name: string;
  language: string;
  drive: {
    pendingFolderId: string;
    processedFolderId: string;
  };
  wordpress: {
    baseUrl: string;
    username: string;
    applicationPassword: string;
    defaultCategoryId: number | null;
    defaultAuthorId: number | null;
  };
  image: {
    provider: ImageProvider;
    size: string;
    style: string;
    negative: string;
  };
  template: string;
  featuredPosts: {
    count: number;
    sameCategoryOnly: boolean;
  };
}

export interface Section {
  heading: string;
  bodyHtml: string;
  bodyText: string;
}

export interface ParsedArticle {
  title: string;
  intro: string;
  sections: Section[];
}

export interface GeneratedImage {
  bytes: Buffer;
  mime: string;
  filename: string;
  alt: string;
}

export interface UploadedMedia {
  id: number;
  sourceUrl: string;
  alt: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}
