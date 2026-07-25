import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const WEB_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const CANDIDATES = [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx", "/index.js"];

function firstExisting(basePath: string): string | null {
  if (existsSync(basePath) && !basePath.endsWith("/")) {
    if (/\.[cm]?[jt]sx?$/.test(basePath)) return basePath;
  }
  for (const ext of CANDIDATES) {
    const candidate = basePath + ext;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const found = firstExisting(resolvePath(WEB_ROOT, specifier.slice(2)));
      if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
    }

    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      const parentPath = context.parentURL?.startsWith("file:")
        ? dirname(fileURLToPath(context.parentURL))
        : WEB_ROOT;
      const found = firstExisting(resolvePath(parentPath, specifier));
      if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
});
