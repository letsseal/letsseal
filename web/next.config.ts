import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  cacheHandler: require.resolve("./cache-handler.js"),
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/sign/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/api/file/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
};

export default nextConfig;
