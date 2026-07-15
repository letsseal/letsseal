import type { MetadataRoute } from "next";
import { BUILT_SECTORS } from "./site/use-cases/_data";

const BASE = "https://letsseal.org";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: [string, number, "weekly" | "monthly"][] = [
    ["/", 1.0, "weekly"],
    ["/site/standard", 0.9, "monthly"],
    ["/site/how-it-works", 0.8, "monthly"],
    ["/site/mission", 0.7, "monthly"],
    ["/site/open", 0.7, "monthly"],
    ["/site/trust", 0.8, "monthly"],
    ["/site/developers", 0.8, "monthly"],
    ["/site/docs", 0.7, "monthly"],
    ["/site/getting-started", 0.7, "monthly"],
    ["/site/use-cases", 0.9, "weekly"],
    ["/site/badge", 0.6, "monthly"],
    ["/verify", 0.9, "monthly"],
    ["/SPEC.md", 0.8, "monthly"],
    ["/llms.txt", 0.6, "monthly"],
  ];
  return [
    ...staticPages.map(([path, priority, changeFrequency]) => ({
      url: `${BASE}${path}`,
      priority,
      changeFrequency,
    })),
    ...BUILT_SECTORS.map((s) => ({
      url: `${BASE}/site/use-cases/${s.slug}`,
      priority: 0.8,
      changeFrequency: "monthly" as const,
    })),
  ];
}
