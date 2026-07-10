export const MAX_UPLOAD_BYTES = 25_000_000; 

export function overContentLength(req: Request): boolean {
  const len = Number(req.headers.get("content-length") ?? "0");
  return Number.isFinite(len) && len > MAX_UPLOAD_BYTES + 1_000_000; 
}

export function tooLarge(file: File): boolean {
  return file.size > MAX_UPLOAD_BYTES;
}
