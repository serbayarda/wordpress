import { google, drive_v3 } from "googleapis";
import { getServiceAccount } from "../config.js";
import type { DriveFile } from "../types.js";

const SCOPES = ["https://www.googleapis.com/auth/drive"];

let cached: drive_v3.Drive | null = null;

function client(): drive_v3.Drive {
  if (cached) return cached;
  const auth = new google.auth.GoogleAuth({
    credentials: getServiceAccount() as never,
    scopes: SCOPES,
  });
  cached = google.drive({ version: "v3", auth });
  return cached;
}

export async function listPending(folderId: string): Promise<DriveFile[]> {
  const drive = client();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id, name, mimeType)",
    pageSize: 50,
  });
  return (res.data.files ?? []).map((f) => ({
    id: f.id!,
    name: f.name!,
    mimeType: f.mimeType!,
  }));
}

export async function downloadDocx(fileId: string): Promise<Buffer> {
  const drive = client();
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" },
  );
  return Buffer.from(res.data as ArrayBuffer);
}

export async function exportGoogleDocAsHtml(fileId: string): Promise<string> {
  const drive = client();
  const res = await drive.files.export(
    { fileId, mimeType: "text/html" },
    { responseType: "text" },
  );
  return res.data as string;
}

export async function moveToProcessed(
  fileId: string,
  fromFolderId: string,
  toFolderId: string,
): Promise<void> {
  const drive = client();
  await drive.files.update({
    fileId,
    addParents: toFolderId,
    removeParents: fromFolderId,
    fields: "id, parents",
  });
}
