import "server-only";

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

function configureVapid() {
  if (vapidConfigured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT are required.",
    );
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
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

  configureVapid();
  const users = (await getPushDatabase()).collection<PushUserDocument>("User");
  const user = await users.findOne(
    { _id: userId, isActive: true },
    { projection: { pushSubscriptions: 1 } },
  );
  const subscriptions = user?.pushSubscriptions ?? [];
  if (subscriptions.length === 0) return;

  const failures: Error[] = [];
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          subscription,
          JSON.stringify(payload),
        );
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

  if (failures.length > 0) {
    throw new AggregateError(failures, "One or more push notifications failed.");
  }
}
