import type { MetadataRoute } from "next";

/**
 * PWOS is a private, single-user app — it should never be crawled or indexed.
 * The root layout already sends `noindex` meta tags; this is belt-and-braces
 * for crawlers that read /robots.txt first.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
