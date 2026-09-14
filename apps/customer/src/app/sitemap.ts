import { MetadataRoute } from "next";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { KOCHI_LOCATIONS } from "@/lib/locations";
import { getAllBlogs } from "../data/blogs";
import { SITE_URL } from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = SITE_URL;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  
  // 1. Core commercial and discovery landing pages
  const corePages: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${baseUrl}/products`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/blog`, lastModified: new Date(), changeFrequency: "daily", priority: 0.85 },
  ];

  // 2. Utility & legal pages (Lower priority to optimize Googlebot crawl budget)
  const utilityPages: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
    { url: `${baseUrl}/become-seller`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.4 },
    { url: `${baseUrl}/contact`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
    { url: `${baseUrl}/legal/terms-and-conditions`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.2 },
    { url: `${baseUrl}/legal/return-policy`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.2 },
    { url: `${baseUrl}/legal/privacy-policy`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.2 },
  ];

  // 3. Dynamic Hyperlocal Location Pages
  const locationPages: MetadataRoute.Sitemap = Object.keys(KOCHI_LOCATIONS).map((slug) => ({
    url: `${baseUrl}/locations/${slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.75,
  }));

  // 4. Static Editorial Blog Articles Fallback
  const staticBlogs = getAllBlogs();
  const staticBlogPages: MetadataRoute.Sitemap = staticBlogs.map((b) => ({
    url: `${baseUrl}/blog/${b.slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  if (!convexUrl) {
    console.warn("NEXT_PUBLIC_CONVEX_URL is not set. Sitemap generation will fallback to static pages.");
    return [...corePages, ...locationPages, ...staticBlogPages, ...utilityPages];
  }

  const client = new ConvexHttpClient(convexUrl);

  let products: any[] = [];
  let categories: any[] = [];
  let boutiques: any[] = [];
  let blogPosts: any[] = [];

  try {
    const [fetchedProducts, fetchedCategories, fetchedBoutiques, fetchedBlogs] = await Promise.all([
      client.query(api.products.getActiveProducts, {}),
      client.query(api.categories.getCategories, { onlyActive: true }),
      client.query(api.boutiques.getApprovedBoutiques, {}),
      client.query(api.blogs.getPublishedPosts, {}),
    ]);
    products = fetchedProducts || [];
    categories = fetchedCategories || [];
    boutiques = fetchedBoutiques || [];
    blogPosts = fetchedBlogs || [];
  } catch (error) {
    console.error("Failed to query Convex for dynamic sitemap generation:", error);
  }

  // 5. Brand & Boutique Storefront Pages (Fixes Brand SEO audit score)
  const boutiquePages: MetadataRoute.Sitemap = boutiques
    .filter((b) => Boolean(b.slug || b.boutiqueName))
    .map((b) => {
      const slug = b.slug || b.boutiqueName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      return {
        url: `${baseUrl}/shop/${slug}`,
        lastModified: new Date(b.updatedAt || b._creationTime || Date.now()),
        changeFrequency: "daily",
        priority: 0.9,
      };
    });

  // 6. Category Depth Pages (Both /products/:slug and /products?category=:slug for deep indexation)
  const categoryPages: MetadataRoute.Sitemap = [];
  categories.forEach((cat) => {
    if (!cat.slug) return;
    const lastMod = new Date(cat.updatedAt || cat._creationTime || Date.now());
    categoryPages.push({
      url: `${baseUrl}/products/${cat.slug}`,
      lastModified: lastMod,
      changeFrequency: "daily",
      priority: 0.85,
    });
    categoryPages.push({
      url: `${baseUrl}/products?category=${cat.slug}`,
      lastModified: lastMod,
      changeFrequency: "daily",
      priority: 0.85,
    });
  });

  // 7. Dynamic Product Detail Pages
  const productPages: MetadataRoute.Sitemap = products
    .filter((p) => Boolean(p.slug))
    .map((prod) => ({
      url: `${baseUrl}/products/${prod.slug}`,
      lastModified: new Date(prod.updatedAt || prod._creationTime || Date.now()),
      changeFrequency: "weekly",
      priority: 0.8,
    }));

  // 8. Dynamic Convex Blog Detail Pages
  const existingBlogSlugs = new Set(blogPosts.map((p) => p.slug));
  const dynamicBlogPages: MetadataRoute.Sitemap = blogPosts
    .filter((p) => Boolean(p.slug))
    .map((post) => ({
      url: `${baseUrl}/blog/${post.slug}`,
      lastModified: new Date(post.updatedAt || post.publishedAt || post._creationTime || Date.now()),
      changeFrequency: "weekly",
      priority: 0.8,
    }));

  const uniqueStaticBlogPages = staticBlogPages.filter(
    (sb) => !existingBlogSlugs.has(sb.url.replace(`${baseUrl}/blog/`, ""))
  );

  return [
    ...corePages,
    ...boutiquePages,
    ...categoryPages,
    ...productPages,
    ...locationPages,
    ...dynamicBlogPages,
    ...uniqueStaticBlogPages,
    ...utilityPages,
  ];
}
