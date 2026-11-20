import { createSign, randomUUID } from "node:crypto";
import { connectToMongoDB } from "@/lib/mongoose";
import { DriveFolderCacheModel } from "@/models/asset-record";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_API = "https://www.googleapis.com/drive/v3";
const GOOGLE_DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const RESUMABLE_THRESHOLD_BYTES = 4 * 1024 * 1024;

function readEnv(key: string): string {
  const raw = process.env[key];
  if (!raw) return "";
  return raw.trim().replace(/^["']|["']$/g, "");
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

type DriveCredentials =
  | {
      mode: "oauth";
      clientId: string;
      clientSecret: string;
      refreshToken: string;
      rootFolderId: string;
      sharedDriveId: string;
    }
  | {
      mode: "service_account";
      clientEmail: string;
      privateKey: string;
      rootFolderId: string;
      sharedDriveId: string;
    };

function getGoogleDriveCredentials(): DriveCredentials | null {
  const sharedDriveId = readEnv("GDRIVE_SHARED_DRIVE_ID");
  const rootFolderId = readEnv("GDRIVE_ROOT_FOLDER_ID") || sharedDriveId || "root";

  const oauthClientId = readEnv("GDRIVE_OAUTH_CLIENT_ID");
  const oauthClientSecret = readEnv("GDRIVE_OAUTH_CLIENT_SECRET");
  const oauthRefreshToken = readEnv("GDRIVE_OAUTH_REFRESH_TOKEN");
  if (oauthClientId && oauthClientSecret && oauthRefreshToken) {
    return {
      mode: "oauth",
      clientId: oauthClientId,
      clientSecret: oauthClientSecret,
      refreshToken: oauthRefreshToken,
      rootFolderId,
      sharedDriveId,
    };
  }

  const clientEmail = readEnv("GDRIVE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = readEnv("GDRIVE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n");
  if (clientEmail && privateKey) {
    return {
      mode: "service_account",
      clientEmail,
      privateKey,
      rootFolderId,
      sharedDriveId,
    };
  }

  return null;
}

export function isGoogleDriveConfigured(): boolean {
  return getGoogleDriveCredentials() !== null;
}

let cachedAccessToken: { token: string; expiresAtMs: number; key: string } | null = null;

async function getAccessToken(creds: DriveCredentials): Promise<string> {
  const cacheKey =
    creds.mode === "oauth" ? `oauth:${creds.clientId}` : `sa:${creds.clientEmail}`;
  if (cachedAccessToken && cachedAccessToken.key === cacheKey && Date.now() < cachedAccessToken.expiresAtMs) {
    return cachedAccessToken.token;
  }

  let bodyParams: URLSearchParams;
  if (creds.mode === "oauth") {
    bodyParams = new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: "refresh_token",
    });
  } else {
    const nowSec = Math.floor(Date.now() / 1000);
    const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64UrlEncode(
      JSON.stringify({
        iss: creds.clientEmail,
        scope: DRIVE_SCOPE,
        aud: GOOGLE_TOKEN_URL,
        iat: nowSec,
        exp: nowSec + 3600,
      }),
    );
    const signingInput = `${header}.${payload}`;
    const signer = createSign("RSA-SHA256");
    signer.update(signingInput);
    signer.end();
    const signature = base64UrlEncode(signer.sign(creds.privateKey));
    bodyParams = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${signingInput}.${signature}`,
    });
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: bodyParams.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Google Drive auth gagal (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error("Google Drive auth tidak mengembalikan access_token.");
  }

  const ttlMs = Math.max(60, (data.expires_in ?? 3600) - 90) * 1000;
  cachedAccessToken = {
    token: data.access_token,
    expiresAtMs: Date.now() + ttlMs,
    key: cacheKey,
  };
  return data.access_token;
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function verifyFolderExists(token: string, folderId: string): Promise<boolean> {
  if (folderId === "root") return true;
  const res = await fetch(
    `${GOOGLE_DRIVE_API}/files/${encodeURIComponent(folderId)}?fields=id,trashed,mimeType&supportsAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok) return false;
  const meta = (await res.json()) as { id?: string; trashed?: boolean; mimeType?: string };
  return (
    Boolean(meta.id) &&
    !meta.trashed &&
    meta.mimeType === "application/vnd.google-apps.folder"
  );
}

async function findOrCreateChildFolder(
  token: string,
  parentId: string,
  folderName: string,
  sharedDriveId: string,
): Promise<string> {
  const safeName = folderName.trim().slice(0, 80) || "general";
  const queryParts = [
    `name = '${escapeDriveQueryValue(safeName)}'`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `trashed = false`,
    `'${escapeDriveQueryValue(parentId)}' in parents`,
  ];

  const listUrl = new URL(`${GOOGLE_DRIVE_API}/files`);
  listUrl.searchParams.set("q", queryParts.join(" and "));
  listUrl.searchParams.set("fields", "files(id,name)");
  listUrl.searchParams.set("pageSize", "1");
  listUrl.searchParams.set("supportsAllDrives", "true");
  listUrl.searchParams.set("includeItemsFromAllDrives", "true");
  if (sharedDriveId) {
    listUrl.searchParams.set("corpora", "drive");
    listUrl.searchParams.set("driveId", sharedDriveId);
  }

  const listRes = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (listRes.ok) {
    const listData = (await listRes.json()) as { files?: Array<{ id?: string }> };
    const existingId = listData.files?.[0]?.id;
    if (existingId) return existingId;
  }

  const createRes = await fetch(`${GOOGLE_DRIVE_API}/files?supportsAllDrives=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: safeName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });
  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => "");
    throw new Error(`Gagal membuat folder Google Drive (${createRes.status}): ${errText}`);
  }
  const created = (await createRes.json()) as { id?: string };
  if (!created.id) {
    throw new Error("Google Drive tidak mengembalikan ID folder baru.");
  }
  return created.id;
}

export async function ensureDriveFolderPath(segments: string[]): Promise<string> {
  const creds = getGoogleDriveCredentials();
  if (!creds) {
    throw new Error("Kredensial Google Drive belum dikonfigurasi.");
  }

  const cleanSegments = segments
    .flatMap((seg) => seg.split("/"))
    .map((seg) => seg.trim().replace(/[\\/:*?"<>|]/g, "_"))
    .filter(Boolean);

  if (cleanSegments.length === 0) {
    return creds.rootFolderId;
  }

  const token = await getAccessToken(creds);
  await connectToMongoDB();

  let currentParentId = creds.rootFolderId;
  let runningPath = "";

  for (const segment of cleanSegments) {
    runningPath = runningPath ? `${runningPath}/${segment}` : segment;
    const cacheKey = `gdrive:${creds.sharedDriveId || creds.rootFolderId}:${runningPath}`;

    const cached = await DriveFolderCacheModel.findOne({ cacheKey })
      .select("folderId")
      .lean<{ folderId?: string } | null>();

    if (cached?.folderId && (await verifyFolderExists(token, cached.folderId))) {
      currentParentId = cached.folderId;
      continue;
    }

    const folderId = await findOrCreateChildFolder(
      token,
      currentParentId,
      segment,
      creds.sharedDriveId,
    );

    await DriveFolderCacheModel.findOneAndUpdate(
      { cacheKey },
      {
        $set: { folderId, parentId: currentParentId },
        $setOnInsert: { _id: randomUUID(), cacheKey },
      },
      { upsert: true },
    );

    currentParentId = folderId;
  }

  return currentParentId;
}

export function extractGoogleDriveFileId(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const proxyMatch = trimmed.match(/\/api\/files\/gdrive\/([A-Za-z0-9_-]{10,128})(?:[?#].*)?$/i);
  if (proxyMatch?.[1]) return proxyMatch[1];

  try {
    const parsed = new URL(trimmed);
    const idParam = parsed.searchParams.get("id");
    if (
      parsed.hostname.endsWith("drive.google.com") &&
      idParam &&
      /^[A-Za-z0-9_-]{10,128}$/.test(idParam)
    ) {
      return idParam;
    }
    const fileMatch = parsed.pathname.match(/\/file\/d\/([A-Za-z0-9_-]{10,128})/);
    if (parsed.hostname.endsWith("drive.google.com") && fileMatch?.[1]) {
      return fileMatch[1];
    }
  } catch {
    return null;
  }

  return null;
}

export function buildGoogleDriveProxyUrl(fileId: string): string {
  return `/api/files/gdrive/${fileId}`;
}

export async function uploadGoogleDriveFile(params: {
  bytes: Buffer;
  mimeType: string;
  fileName: string;
  folderSegments: string[];
}): Promise<{ fileId: string; proxyUrl: string }> {
  const creds = getGoogleDriveCredentials();
  if (!creds) {
    throw new Error("Kredensial Google Drive belum dikonfigurasi.");
  }

  const token = await getAccessToken(creds);
  const parentFolderId = await ensureDriveFolderPath(params.folderSegments);
  const safeName = params.fileName.replace(/[\\/:*?"<>|]/g, "_");
  const metadata = {
    name: safeName,
    parents: [parentFolderId],
    mimeType: params.mimeType,
  };

  if (params.bytes.byteLength <= RESUMABLE_THRESHOLD_BYTES) {
    const boundary = `skala_gdrive_${randomUUID().replace(/-/g, "")}`;
    const partHeader = Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
        metadata,
      )}\r\n--${boundary}\r\nContent-Type: ${params.mimeType}\r\n\r\n`,
      "utf8",
    );
    const partFooter = Buffer.from(`\r\n--${boundary}--`, "utf8");
    const body = Buffer.concat([partHeader, params.bytes, partFooter]);

    const res = await fetch(
      `${GOOGLE_DRIVE_UPLOAD_API}/files?uploadType=multipart&supportsAllDrives=true&fields=id`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Upload Google Drive gagal (${res.status}): ${text}`);
    }

    const created = (await res.json()) as { id?: string };
    if (!created.id) {
      throw new Error("Google Drive tidak mengembalikan file id.");
    }
    return {
      fileId: created.id,
      proxyUrl: buildGoogleDriveProxyUrl(created.id),
    };
  }

  // Resumable upload for large files (e.g., CAD/PDF blueprints > 4 MB).
  const initRes = await fetch(
    `${GOOGLE_DRIVE_UPLOAD_API}/files?uploadType=resumable&supportsAllDrives=true&fields=id`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": params.mimeType,
        "X-Upload-Content-Length": String(params.bytes.byteLength),
      },
      body: JSON.stringify(metadata),
    },
  );
  const uploadLocation = initRes.headers.get("location");
  if (!initRes.ok || !uploadLocation) {
    const text = await initRes.text().catch(() => "");
    throw new Error(`Inisiasi upload Google Drive gagal (${initRes.status}): ${text}`);
  }

  const putRes = await fetch(uploadLocation, {
    method: "PUT",
    headers: {
      "Content-Type": params.mimeType,
      "Content-Length": String(params.bytes.byteLength),
    },
    body: Uint8Array.from(params.bytes),
  });
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => "");
    throw new Error(`Upload file besar Google Drive gagal (${putRes.status}): ${text}`);
  }

  const uploaded = (await putRes.json()) as { id?: string };
  if (!uploaded.id) {
    throw new Error("Google Drive resumable upload tidak mengembalikan file id.");
  }

  return {
    fileId: uploaded.id,
    proxyUrl: buildGoogleDriveProxyUrl(uploaded.id),
  };
}

export async function readGoogleDriveFile(
  fileId: string,
): Promise<{ bytes: Buffer; contentType: string; fileName: string } | null> {
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(fileId)) return null;
  const creds = getGoogleDriveCredentials();
  if (!creds) return null;

  const token = await getAccessToken(creds);
  const metaRes = await fetch(
    `${GOOGLE_DRIVE_API}/files/${encodeURIComponent(
      fileId,
    )}?fields=id,name,mimeType,trashed&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!metaRes.ok) return null;

  const meta = (await metaRes.json()) as {
    id?: string;
    name?: string;
    mimeType?: string;
    trashed?: boolean;
  };
  if (!meta.id || meta.trashed) return null;

  const dataRes = await fetch(
    `${GOOGLE_DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!dataRes.ok) return null;

  const arrayBuffer = await dataRes.arrayBuffer();
  return {
    bytes: Buffer.from(arrayBuffer),
    contentType:
      meta.mimeType || dataRes.headers.get("content-type") || "application/octet-stream",
    fileName: meta.name || `${fileId}`,
  };
}

export async function deleteGoogleDriveFile(fileId: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(fileId)) return false;
  const creds = getGoogleDriveCredentials();
  if (!creds) return false;

  const token = await getAccessToken(creds);
  const res = await fetch(
    `${GOOGLE_DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  return res.ok || res.status === 404;
}
