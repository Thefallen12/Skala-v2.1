import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const standalonePath = resolve(root, ".next/standalone");
const nextStaticPath = resolve(root, ".next/static");

if (!existsSync(standalonePath)) {
  throw new Error("Next.js standalone output was not generated");
}

if (existsSync(resolve(root, "public"))) {
  cpSync(resolve(root, "public"), resolve(standalonePath, "public"), {
    recursive: true,
    force: true,
  });
}

if (existsSync(nextStaticPath)) {
  const standaloneNextPath = resolve(standalonePath, ".next");
  mkdirSync(standaloneNextPath, { recursive: true });
  cpSync(nextStaticPath, resolve(standaloneNextPath, "static"), {
    recursive: true,
    force: true,
  });
}
