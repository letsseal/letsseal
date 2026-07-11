import { ROOT_CA_PEM } from "@/lib/trust";

export function GET() {
  return new Response(ROOT_CA_PEM, {
    headers: {
      "Content-Type": "application/x-pem-file",
      "Content-Disposition": 'attachment; filename="letsseal-root-ca.crt"',
      "Cache-Control": "public, max-age=86400",
    },
  });
}
