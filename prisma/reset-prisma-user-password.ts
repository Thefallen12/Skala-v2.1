import "dotenv/config";
import { createInterface } from "node:readline";
import { hash } from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.MONGODB_URI;
if (!connectionString) {
  throw new Error("MONGODB_URI is not set.");
}

if (!/^mongodb(?:\+srv)?:\/\//i.test(connectionString)) {
  throw new Error("Refusing to reset a user outside MongoDB.");
}

function askHidden(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Run this command from an interactive terminal.");
  }

  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  process.stdin.resume();

  return new Promise((resolve, reject) => {
    let value = "";

    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    };

    const onData = (input: string) => {
      for (const character of input) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Password reset cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = Array.from(value).slice(0, -1).join("");
          continue;
        }
        if (character >= " ") {
          value += character;
        }
      }
    };

    process.stdin.on("data", onData);
  });
}

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const promptInterface = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    promptInterface.question(prompt, (answer) => {
      promptInterface.close();
      resolve(answer);
    });
  });
}

async function main() {
  const email = (await ask("Account email to reset: ")).trim().toLowerCase();

  const newPassword = await askHidden("New password (minimum 12 characters): ");
  const confirmation = await askHidden("Confirm new password: ");
  if (newPassword.length < 12) {
    throw new Error("Password must contain at least 12 characters.");
  }
  if (newPassword !== confirmation) {
    throw new Error("Password confirmation does not match.");
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, isActive: true },
    });
    if (!user) {
      throw new Error("No account matched that email in MongoDB.");
    }
    if (!user.isActive) {
      throw new Error("The account is inactive; password was not changed.");
    }

    const confirmationText = await ask(
      "Type RESET to change only this account's password: ",
    );
    if (confirmationText !== "RESET") {
      throw new Error("Password reset cancelled.");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hash(newPassword, 12),
        updatedAt: new Date(),
      },
    });
    console.info("Password reset complete. Plaintext was not stored or logged.");
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Password reset failed.",
  );
  process.exitCode = 1;
});
