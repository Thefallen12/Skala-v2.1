const CLIENT_ASSET_KIND_LABELS: Record<string, string> = {
  FTO: "Foto Progres",
  TTK: "Foto Titik Kerja",
  SRV: "Foto Survey GIS",
  SJN: "Foto Surat Jalan",
  BLJ: "Lampiran Belanja",
  BBM: "Foto & Bon BBM",
  DRW: "Blueprint / Drawing",
  BKT: "Bukti Transfer",
  BON: "Bon / Nota",
  KWT: "Kwitansi",
  INV: "Invoice / Faktur",
  USR: "Foto Profil",
  TPL: "Gambar Template",
};

const CLIENT_ASSET_CODE_REGEX =
  /([A-Z0-9]{2,28})-(FTO|TTK|SRV|SJN|BLJ|BBM|DRW|BKT|BON|KWT|INV|USR|TPL)-(\d+)X/i;

export function parseClientAssetCode(value?: string | null): {
  assetCode: string;
  projectSlug: string;
  kind: string;
  kindLabel: string;
  sequenceNumber: number;
} | null {
  if (!value) return null;
  const match = value.match(CLIENT_ASSET_CODE_REGEX);
  if (!match) return null;
  const projectSlug = match[1].toUpperCase();
  const kind = match[2].toUpperCase();
  const sequenceNumber = Number.parseInt(match[3], 10);
  if (!Number.isFinite(sequenceNumber) || sequenceNumber <= 0) return null;
  return {
    assetCode: `${projectSlug}-${kind}-${sequenceNumber}X`,
    projectSlug,
    kind,
    kindLabel: CLIENT_ASSET_KIND_LABELS[kind] ?? kind,
    sequenceNumber,
  };
}

export function normalizeClientProjectSlug(value?: string | null): string {
  if (!value) return "UMUM";
  const cleaned = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(
      /^(rehab(ilitasi)?(\s+lahan)?(\s+sawah)?|poktan|kelompok\s*tani|kth|kel\.?\s*tani)\s*[-–:]\s*/i,
      "",
    )
    .trim();
  const compact = cleaned.replace(/[^a-zA-Z0-9]+/g, "").toUpperCase();
  return compact.length >= 2 ? compact.slice(0, 20) : "UMUM";
}

export function doesClientAssetMatchProject(
  asset: {
    assetCode?: string | null;
    url?: string | null;
    publicId?: string | null;
    projectId?: string | null;
  },
  target: {
    projectId?: string | null;
    projectName?: string | null;
    projectTitle?: string | null;
    poktanName?: string | null;
    projectCode?: string | null;
  },
): boolean {
  if (asset.projectId && target.projectId && asset.projectId !== target.projectId) {
    return false;
  }
  const parsed =
    parseClientAssetCode(asset.assetCode) ||
    parseClientAssetCode(asset.publicId) ||
    parseClientAssetCode(asset.url);
  if (!parsed || parsed.projectSlug === "UMUM") {
    return true;
  }
  const bases = [target.projectName, target.projectTitle, target.poktanName]
    .map((candidate) => normalizeClientProjectSlug(candidate))
    .filter((slug) => slug !== "UMUM");
  if (bases.length === 0) return true;
  const codeSuffix = (target.projectCode ?? "").replace(/[^A-Za-z0-9]+/g, "").slice(-4).toUpperCase();
  const idSuffix = (target.projectId ?? "").replace(/[^A-Za-z0-9]+/g, "").slice(-4).toUpperCase();
  return bases.some((base) => {
    if (parsed.projectSlug === base) return true;
    if (
      codeSuffix &&
      parsed.projectSlug === `${base.slice(0, Math.max(4, 20 - codeSuffix.length))}${codeSuffix}`
    ) {
      return true;
    }
    if (
      idSuffix &&
      parsed.projectSlug === `${base.slice(0, Math.max(4, 20 - idSuffix.length))}${idSuffix}`
    ) {
      return true;
    }
    return false;
  });
}

function localApiUrl(url: string): URL | null {
  try {
    const origin =
      typeof window === "undefined" ? "http://localhost" : window.location.origin;
    const parsed = new URL(url, origin);
    if (parsed.origin !== origin || !parsed.pathname.startsWith("/api/")) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isPrivateCloudinaryPdfUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "res.cloudinary.com" &&
      segments[1] === "raw" &&
      segments[2] === "authenticated" &&
      /\.pdf$/i.test(segments.at(-1) ?? "")
    );
  } catch {
    return false;
  }
}

function privatePdfRouteUrl(url: string, preview: boolean): string {
  const query = new URLSearchParams({ url });
  if (preview) query.set("preview", "1");
  return `/api/tickets/receipts/cloudinary?${query.toString()}`;
}

export function photoDownloadHref(url: string): string {
  return isPrivateCloudinaryPdfUrl(url)
    ? privatePdfRouteUrl(url, false)
    : url;
}

export function withLocalPhotoPreview(url: string): string {
  if (isPrivateCloudinaryPdfUrl(url)) {
    return privatePdfRouteUrl(url, true);
  }
  const parsed = localApiUrl(url);
  if (!parsed) return url;
  parsed.searchParams.set("preview", "1");
  return url.startsWith("/")
    ? `${parsed.pathname}${parsed.search}${parsed.hash}`
    : parsed.toString();
}

export function photoDownloadLinkProps(url: string) {
  if (isPrivateCloudinaryPdfUrl(url) || url.startsWith("/api/files/gdrive/")) {
    return { target: "_blank" as const, rel: "noreferrer" };
  }
  if (localApiUrl(url)) return { download: true as const };
  return { target: "_blank" as const, rel: "noreferrer" };
}

export function photoDownloadLabel(url: string): string {
  if (/\.pdf(?:[?#]|$)/i.test(url)) {
    return localApiUrl(url) || isPrivateCloudinaryPdfUrl(url)
      ? "Unduh PDF"
      : "Buka / simpan PDF";
  }
  if (url.startsWith("/api/files/gdrive/")) {
    return "Buka / unduh berkas";
  }
  return localApiUrl(url) ? "Unduh foto" : "Buka / simpan foto";
}
