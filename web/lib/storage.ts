import { promises as fs } from "fs";
import path from "path";
import { gzipSync, gunzipSync } from "zlib";
import { AwsClient } from "aws4fetch";


const GZIP_MAGIC = [0x1f, 0x8b]; 

function isGzip(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === GZIP_MAGIC[0] && buf[1] === GZIP_MAGIC[1];
}
function pack(data: Buffer): Buffer {
  const gz = gzipSync(data, { level: 6 });
  return gz.length < data.length ? gz : data;
}
function unpack(raw: Buffer): Buffer {
  return isGzip(raw) ? gunzipSync(raw) : raw;
}

interface Backend {
  save(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>; 
  exists(key: string): Promise<boolean>;
}

function assertSafeKey(key: string): void {
  if (key.startsWith("/") || key.split("/").some((seg) => seg === ".." || seg === ".")) {
    throw new Error("invalid storage key");
  }
}

const ROOT = path.join(process.cwd(), "storage");
function resolveKey(key: string): string {
  const full = path.resolve(ROOT, key);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) throw new Error("invalid storage key");
  return full;
}
const localBackend: Backend = {
  async save(key, data) {
    const full = resolveKey(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, pack(data));
  },
  async read(key) {
    return unpack(await fs.readFile(resolveKey(key)));
  },
  async exists(key) {
    try {
      await fs.access(resolveKey(key));
      return true;
    } catch {
      return false;
    }
  },
};

function makeS3Backend(): Backend {
  const endpoint = (process.env.STORAGE_S3_ENDPOINT ?? "").replace(/\/+$/, "");
  const bucket = process.env.STORAGE_S3_BUCKET!;
  const prefix = process.env.STORAGE_S3_PREFIX ?? "";
  const accessKeyId = process.env.STORAGE_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_S3_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "STORAGE_S3_BUCKET is set but STORAGE_S3_ENDPOINT / STORAGE_S3_ACCESS_KEY_ID / STORAGE_S3_SECRET_ACCESS_KEY are missing",
    );
  }
  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: process.env.STORAGE_S3_REGION || "auto", 
  });
  const urlFor = (key: string) => `${endpoint}/${bucket}/${prefix}${key}`;

  return {
    async save(key, data) {
      assertSafeKey(key);
      // Copy into a standalone Uint8Array — safe SHA-256 body signing regardless
      // of Buffer pooling.
      const payload = new Uint8Array(pack(data));
      const res = await client.fetch(urlFor(key), {
        method: "PUT",
        body: payload,
        // B2 (unlike AWS S3) rejects chunked uploads with 411 MissingContentLength.
        // Inside Next's server bundle the patched global fetch streams the body and
        // drops Content-Length, so set it explicitly; cache:"no-store" keeps Next's
        // fetch instrumentation from re-wrapping the request body.
        headers: { "content-length": String(payload.byteLength) },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`storage put failed: ${res.status} ${await res.text().catch(() => "")}`);
    },
    async read(key) {
      assertSafeKey(key);
      const res = await client.fetch(urlFor(key));
      if (res.status === 404) throw new Error(`storage key not found: ${key}`);
      if (!res.ok) throw new Error(`storage get failed: ${res.status}`);
      return unpack(Buffer.from(await res.arrayBuffer()));
    },
    async exists(key) {
      assertSafeKey(key);
      const res = await client.fetch(urlFor(key), { method: "HEAD" });
      if (res.status === 404) return false;
      if (!res.ok) throw new Error(`storage head failed: ${res.status}`);
      return true;
    },
  };
}

const backend: Backend = process.env.STORAGE_S3_BUCKET ? makeS3Backend() : localBackend;

export async function saveFile(key: string, data: Buffer): Promise<string> {
  await backend.save(key, data);
  return key;
}

export async function readFile(key: string): Promise<Buffer> {
  return backend.read(key);
}

export async function fileExists(key: string): Promise<boolean> {
  return backend.exists(key);
}
