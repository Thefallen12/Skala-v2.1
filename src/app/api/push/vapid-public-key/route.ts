import { createECDH } from "node:crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  const headers = { "Cache-Control": "no-store, max-age=0" };

  let keysMatch = false;
  if (publicKey && privateKey) {
    try {
      const ecdh = createECDH("prime256v1");
      ecdh.setPrivateKey(Buffer.from(privateKey, "base64url"));
      keysMatch = ecdh.getPublicKey().toString("base64url") === publicKey;
    } catch {
      keysMatch = false;
    }
  }

  if (!publicKey || !privateKey || !subject || !keysMatch) {
    return Response.json(
      { message: "VAPID configuration is incomplete or invalid on the server." },
      { status: 503, headers },
    );
  }

  return Response.json({ publicKey }, { headers });
}
