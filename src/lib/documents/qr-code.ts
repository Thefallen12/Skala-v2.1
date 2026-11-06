import { readFile } from "node:fs/promises";
import { join } from "node:path";
import QRCode from "qrcode";
import sharp from "sharp";

export async function getDocumentHeaderLogoDataUrl(): Promise<string> {
  const source = await readFile(
    join(process.cwd(), "public", "images", "logos", "cop-surat.png"),
  );
  const logo = await sharp(source)
    .resize({ width: 1200, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return `data:image/png;base64,${logo.toString("base64")}`;
}

export async function getLogisticsSignatureDataUrl(): Promise<string> {
  const signature = await readFile(
    join(process.cwd(), "public", "signatures", "fachri-maulana-hattami.png"),
  );
  return `data:image/png;base64,${signature.toString("base64")}`;
}

export async function createBrandedQrDataUrl(
  value: string,
  width = 240,
): Promise<string> {
  const qr = await QRCode.toBuffer(value, {
    errorCorrectionLevel: "H",
    margin: 2,
    width,
  });
  const logoImage = await readFile(
    join(process.cwd(), "public", "images", "logos", "icont Logo.png"),
  );
  const logoSize = Math.round(width * 0.2);
  const logo = await sharp(logoImage)
    .resize(Math.round(logoSize * 0.68), Math.round(logoSize * 0.68))
    .png()
    .toBuffer();
  const logoPlate = await sharp({
    create: {
      width: logoSize,
      height: logoSize,
      channels: 4,
      background: "#ffffff",
    },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toBuffer();
  const brandedQr = await sharp(qr)
    .composite([{ input: logoPlate, gravity: "centre" }])
    .png()
    .toBuffer();

  return `data:image/png;base64,${brandedQr.toString("base64")}`;
}
