"use server";

import { authForProxy } from "../../../auth";
import {
  getPushDatabase,
  type PushUserDocument,
} from "@/lib/push-mongodb";
import type { PushSubscriptionRecord } from "@/lib/push-notifications";

type PushSubscriptionActionResult = {
  success: boolean;
  message: string;
};

function isValidSubscription(
  value: unknown,
): value is PushSubscriptionRecord {
  if (typeof value !== "object" || value === null) return false;
  const subscription = value as Partial<PushSubscriptionRecord>;
  if (
    typeof subscription.endpoint !== "string" ||
    subscription.endpoint.length > 4096 ||
    typeof subscription.keys !== "object" ||
    subscription.keys === null
  ) {
    return false;
  }
  const endpoint = new URL(subscription.endpoint);
  return (
    endpoint.protocol === "https:" &&
    typeof subscription.keys.p256dh === "string" &&
    /^[A-Za-z0-9_-]{20,256}$/.test(subscription.keys.p256dh) &&
    typeof subscription.keys.auth === "string" &&
    /^[A-Za-z0-9_-]{8,128}$/.test(subscription.keys.auth)
  );
}

export async function savePushSubscription(
  value: unknown,
): Promise<PushSubscriptionActionResult> {
  const session = await authForProxy();
  const userId = session?.user?.id;
  if (typeof userId !== "string" || !userId) {
    return { success: false, message: "Silakan masuk terlebih dahulu." };
  }
  try {
    if (!isValidSubscription(value)) {
      return { success: false, message: "Data langganan notifikasi tidak valid." };
    }

    const users = (await getPushDatabase()).collection<PushUserDocument>("User");
    const updated = await users.updateOne(
      {
        _id: userId,
        isActive: true,
        "pushSubscriptions.endpoint": value.endpoint,
      },
      { $set: { "pushSubscriptions.$": value } },
    );
    if (updated.matchedCount === 0) {
      const added = await users.updateOne(
        { _id: userId, isActive: true },
        { $addToSet: { pushSubscriptions: value } },
      );
      if (added.matchedCount !== 1) {
        return { success: false, message: "Akun pengguna tidak ditemukan atau tidak aktif." };
      }
    }
    return { success: true, message: "Notifikasi browser berhasil diaktifkan." };
  } catch (error) {
    console.error("Saving browser push subscription failed:", error);
    return {
      success: false,
      message: "Langganan notifikasi gagal disimpan. Silakan coba kembali.",
    };
  }
}

export async function removePushSubscription(
  endpoint: string,
): Promise<PushSubscriptionActionResult> {
  const session = await authForProxy();
  const userId = session?.user?.id;
  if (typeof userId !== "string" || !userId) {
    return { success: false, message: "Silakan masuk terlebih dahulu." };
  }
  try {
    if (
      typeof endpoint !== "string" ||
      endpoint.length > 4096 ||
      new URL(endpoint).protocol !== "https:"
    ) {
      return { success: false, message: "Endpoint notifikasi tidak valid." };
    }
    const users = (await getPushDatabase()).collection<PushUserDocument>("User");
    await users.updateOne(
      { _id: userId },
      { $pull: { pushSubscriptions: { endpoint } } },
    );
    return { success: true, message: "Notifikasi browser dinonaktifkan." };
  } catch (error) {
    console.error("Removing browser push subscription failed:", error);
    return {
      success: false,
      message: "Langganan notifikasi gagal dihapus. Silakan coba kembali.",
    };
  }
}

function isValidFcmToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 20 &&
    value.length <= 2048 &&
    /^[A-Za-z0-9:._-]+$/.test(value)
  );
}

export async function saveFcmToken(
  token: string,
  platform: "android" | "ios" | "web" = "android",
): Promise<PushSubscriptionActionResult> {
  const session = await authForProxy();
  const userId = session?.user?.id;
  if (typeof userId !== "string" || !userId) {
    return { success: false, message: "Silakan masuk terlebih dahulu." };
  }
  try {
    if (!isValidFcmToken(token)) {
      return { success: false, message: "Token perangkat FCM tidak valid." };
    }

    const entry = {
      token,
      platform,
      updatedAt: new Date().toISOString(),
    };
    const users = (await getPushDatabase()).collection<PushUserDocument>("User");
    const updated = await users.updateOne(
      { _id: userId, isActive: true, "fcmTokens.token": token },
      { $set: { "fcmTokens.$": entry } },
    );
    if (updated.matchedCount === 0) {
      await users.updateOne(
        { _id: userId, isActive: true },
        { $push: { fcmTokens: { $each: [entry], $slice: -15 } } },
      );
    }
    return { success: true, message: "Token notifikasi perangkat tersimpan." };
  } catch (error) {
    console.error("Saving FCM token failed:", error);
    return {
      success: false,
      message: "Token perangkat gagal disimpan. Silakan coba kembali.",
    };
  }
}

export async function removeFcmToken(
  token: string,
): Promise<PushSubscriptionActionResult> {
  const session = await authForProxy();
  const userId = session?.user?.id;
  if (typeof userId !== "string" || !userId) {
    return { success: false, message: "Silakan masuk terlebih dahulu." };
  }
  try {
    if (!isValidFcmToken(token)) {
      return { success: false, message: "Token perangkat FCM tidak valid." };
    }
    const users = (await getPushDatabase()).collection<PushUserDocument>("User");
    await users.updateOne(
      { _id: userId },
      { $pull: { fcmTokens: { token } } },
    );
    return { success: true, message: "Token perangkat dihapus." };
  } catch (error) {
    console.error("Removing FCM token failed:", error);
    return {
      success: false,
      message: "Token perangkat gagal dihapus. Silakan coba kembali.",
    };
  }
}
