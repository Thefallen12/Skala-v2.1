import "@/lib/sanitize-env";
import "server-only";

export type CloudinaryCredentials = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

export function getCloudinaryCredentials(): CloudinaryCredentials | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (cloudName && apiKey && apiSecret) {
    return { cloudName, apiKey, apiSecret };
  }

  const rawUrl = process.env.CLOUDINARY_URL?.trim();
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "cloudinary:") return null;
    const parsedCloudName = url.hostname.trim();
    const parsedApiKey = decodeURIComponent(url.username);
    const parsedApiSecret = decodeURIComponent(url.password);
    if (!parsedCloudName || !parsedApiKey || !parsedApiSecret) return null;
    return {
      cloudName: cloudName || parsedCloudName,
      apiKey: apiKey || parsedApiKey,
      apiSecret: apiSecret || parsedApiSecret,
    };
  } catch {
    return null;
  }
}
