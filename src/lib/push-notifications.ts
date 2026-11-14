import "server-only";

import { createSign } from "node:crypto";
import webpush from "web-push";
import { getPushDatabase, type PushUserDocument } from "@/lib/push-mongodb";

export type PushSubscriptionRecord = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type PushNotificationPayload = {
  title: string;
  body: string;
  url: string;
};

let vapidConfigured = false;
let cachedFcmAccessToken: { token: string; expiresAtMs: number } | null = null;

export function isWebPushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim() &&
      process.env.VAPID_SUBJECT?.trim(),
  );
}

export function isFcmConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID?.trim() &&
      process.env.FIREBASE_CLIENT_EMAIL?.trim() &&
      process.env.FIREBASE_PRIVATE_KEY?.trim(),
  );
}

export function isAnyPushChannelConfigured(): boolean {
  return isWebPushConfigured() || isFcmConfigured();
}

function configureVapid(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) {
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function getFcmAccessToken(): Promise<string | null> {
  if (
    cachedFcmAccessToken &&
    cachedFcmAccessToken.expiresAtMs > Date.now() + 60_000
  ) {
    return cachedFcmAccessToken.token;
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (!clientEmail || !rawPrivateKey) return null;

  const privateKey = rawPrivateKey.replace(/\\n/g, "\n");
  const nowSec = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claimSet = base64UrlEncode(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  );

  const signingInput = `${header}.${claimSet}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = base64UrlEncode(signer.sign(privateKey));
  const assertion = `${signingInput}.${signature}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text().catch(() => "");
    throw new Error(
      `Failed to mint FCM OAuth token (${tokenResponse.status}): ${errorText}`,
    );
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!tokenData.access_token) {
    throw new Error("FCM OAuth response missing access_token.");
  }

  const ttlMs = Math.max(300, Number(tokenData.expires_in ?? 3600)) * 1000;
  cachedFcmAccessToken = {
    token: tokenData.access_token,
    expiresAtMs: Date.now() + ttlMs,
  };
  return cachedFcmAccessToken.token;
}

async function sendFcmNotifications(
  userId: string,
  tokens: string[],
  payload: PushNotificationPayload,
  failures: Error[],
): Promise<void> {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  if (!projectId || tokens.length === 0) return;

  const accessToken = await getFcmAccessToken();
  if (!accessToken) return;

  const users = (await getPushDatabase()).collection<PushUserDocument>("User");
  const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;

  await Promise.all(
    tokens.map(async (deviceToken) => {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: deviceToken,
              notification: {
                title: payload.title,
                body: payload.body,
              },
              data: {
                actionUrl: payload.url,
              },
              android: {
                priority: "HIGH",
                notification: {
                  channel_id: "skala_incoming_messages_v2",
                },
              },
            },
          }),
        });

        if (res.ok) return;

        const bodyText = await res.text().catch(() => "");
        if (
          res.status === 404 ||
          bodyText.includes("UNREGISTERED") ||
          bodyText.includes("INVALID_ARGUMENT")
        ) {
          await users.updateOne(
            { _id: userId },
            { $pull: { fcmTokens: { token: deviceToken } } },
          );
          return;
        }
        failures.push(new Error(`FCM delivery failed (${res.status}): ${bodyText}`));
      } catch (error) {
        failures.push(
          error instanceof Error ? error : new Error("FCM delivery failed."),
        );
      }
    }),
  );
}

export async function sendPushNotification(
  userId: string,
  payload: PushNotificationPayload,
): Promise<void> {
  if (!userId.trim()) throw new Error("A push notification recipient is required.");
  if (
    !payload.title.trim() ||
    payload.title.length > 180 ||
    !payload.body.trim() ||
    payload.body.length > 2000 ||
    !payload.url.startsWith("/") ||
    payload.url.startsWith("//")
  ) {
    throw new Error("Push notification payload is invalid.");
  }

  const webPushReady = configureVapid();
  const fcmReady = isFcmConfigured();
  if (!webPushReady && !fcmReady) {
    return;
  }

  const users = (await getPushDatabase()).collection<PushUserDocument>("User");
  const user = await users.findOne(
    { _id: userId, isActive: true },
    { projection: { pushSubscriptions: 1, fcmTokens: 1 } },
  );
  const subscriptions = webPushReady ? (user?.pushSubscriptions ?? []) : [];
  const fcmTokens = fcmReady
    ? (user?.fcmTokens ?? []).map((entry) => entry.token).filter(Boolean)
    : [];

  if (subscriptions.length === 0 && fcmTokens.length === 0) return;

  const failures: Error[] = [];
  if (subscriptions.length > 0) {
    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(subscription, JSON.stringify(payload));
        } catch (error) {
          const statusCode =
            typeof error === "object" &&
            error !== null &&
            "statusCode" in error &&
            typeof error.statusCode === "number"
              ? error.statusCode
              : null;
          if (statusCode === 404 || statusCode === 410) {
            await users.updateOne(
              { _id: userId },
              { $pull: { pushSubscriptions: { endpoint: subscription.endpoint } } },
            );
            return;
          }
          failures.push(
            error instanceof Error
              ? error
              : new Error("Web Push delivery failed."),
          );
        }
      }),
    );
  }

  if (fcmTokens.length > 0) {
    await sendFcmNotifications(userId, fcmTokens, payload, failures);
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, "One or more push notifications failed.");
  }
}
