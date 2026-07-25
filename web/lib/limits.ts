export const MAX_UPLOAD_BYTES = 25_000_000; 

const MULTIPART_SLACK = 1_000_000;

export function overContentLength(req: Request, max?: number): boolean {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (!Number.isFinite(len)) return false;
  return max === undefined ? len > MAX_UPLOAD_BYTES + MULTIPART_SLACK : len > max;
}

export function tooLarge(file: File, max: number = MAX_UPLOAD_BYTES): boolean {
  return file.size > max;
}
