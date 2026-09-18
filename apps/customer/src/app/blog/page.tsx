import React from "react";
import Link from "next/link";
import { Metadata } from "next";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { getAllBlogs, BlogPost } from "../../data/blogs";
import { SITE_URL } from "@/lib/seo";
import {
  Sparkles,
  Clock,
  ArrowRight,
  User,
  ShoppingBag,
  MapPin,
  Tag,
  BookOpen,
} from "lucide-react";

export const metadata: Metadata = {
  title: "The Hive Journal | Kochi Fashion, Fabrics & Store Style Guides",
  description:
    "Explore curated fashion guides, Kerala climate fabric advice, handloom saree heritage, and styling tips from Kochi's independent design studios.",
  keywords: [
    "Kochi fashion blog",
    "Kerala fashion styling",
    "cotton kurtis guide",
    "saree draping tips",
    "Panampilly Nagar shopping guide",
    "hyperlocal marketplace Kerala",
  ],
  alternates: {
    canonical: `${SITE_URL}/blog`,
  },
  openGraph: {
    title: "The Hive Journal | Stories & Store Style Guides",
    description:
      "Expert advice on shopping local showrooms online, choosing breathable fabrics for Kerala weather, and finding exact fits from Kochi stores.",
    url: `${SITE_URL}/blog`,
    siteName: "Hive Marketplace",
    type: "website",
    images: [`${SITE_URL}/icon-512x512.png`],
  },
};

export default async function BlogDirectoryPage() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  let dbPosts: any[] = [];

  if (convexUrl) {
    try {
      const client = new ConvexHttpClient(convexUrl);
      const fetched = await client.query(api.blogs.getPublishedPosts, {});
      dbPosts = fetched || [];
    } catch (err) {
      console.error("Failed to fetch live published posts for blog directory:", err);
    }
  }

  const staticBlogs = getAllBlogs();

  // Combine database posts and static articles (preventing duplicate slugs)
  const existingSlugs = new Set(dbPosts.map((p) => p.slug));
  const filteredStatic = staticBlogs.filter((b) => !existingSlugs.has(b.slug));

  // Normalize all posts into a uniform display structure
  const allArticles = [
    ...dbPosts.map((p) => ({
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      category: p.category || "Style Guides",
      readTime: p.readTime || "5 min read",
      authorName: p.authorName || "Hive Editorial Team",
      publishedAt: p.publishedAt
        ? new Date(p.publishedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "Latest",
      coverImageUrl: p.coverImageUrl || "/images/trust_box.png",
      isLiveDb: true,
    })),
    ...filteredStatic.map((b) => ({
      slug: b.slug,
      title: b.metaTitle || b.h1Title,
      excerpt: b.excerpt,
      category: b.category,
      readTime: b.readTime,
      authorName: b.author.name,
      publishedAt: b.publishedAt,
      coverImageUrl: b.coverImageUrl || "/images/trust_box.png",
      isLiveDb: false,
    })),
  ];

  const featuredPost = allArticles[0];
  const gridPosts = allArticles.slice(1);

  const categories = [
    "All Collections",
    "Women's Fashion",
    "Men's Styling",
    "Sarees & Traditional",
    "Kochi Guides",
    "Platform Guides",
  ];

  return (
    <div className="min-h-screen bg-slate-50/70 py-12 px-4 sm:px-6 lg:px-8">
      {/* 1. Prestige Editorial Magazine Header */}
      <div className="max-w-6xl mx-auto mb-14 text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-100/80 border border-amber-300/60 text-amber-900 text-xs font-black uppercase tracking-widest mb-4 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-amber-600" />
          The Hive Journal • Kochi Edition
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-black text-slate-900 tracking-tight leading-tight">
          Stories, Style & Kerala Fabric Guides
        </h1>
        <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto font-medium leading-relaxed">
          Expert styling advice, climate-friendly fabric secrets, and inside looks at independent fashion stores across Kochi.
        </p>

        {/* Category Navigation Chips */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
          {categories.map((cat, i) => (
            <span
              key={cat}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer shadow-sm ${
                i === 0
                  ? "bg-slate-900 text-white shadow-slate-900/10"
                  : "bg-white text-slate-700 hover:bg-amber-50 hover:text-amber-900 border border-slate-200/80"
              }`}
            >
              {cat}
            </span>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto space-y-12">
        {/* 2. Hero Featured Magazine Spread */}
        {featuredPost && (
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
              <div className="lg:col-span-7 relative aspect-[16/10] lg:aspect-auto overflow-hidden bg-slate-100 min-h-[300px]">
                <img
                  src={featuredPost.coverImageUrl}
                  alt={featuredPost.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute top-4 left-4">
                  <span className="px-3.5 py-1 rounded-full bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wider shadow-md">
                    Featured Cover Story
                  </span>
                </div>
              </div>

              <div className="lg:col-span-5 p-8 sm:p-10 lg:p-12 flex flex-col justify-between bg-gradient-to-b from-white to-slate-50/50">
                <div>
                  <div className="flex items-center gap-3 text-xs font-bold text-slate-500 mb-3">
                    <span className="text-amber-700 font-extrabold uppercase tracking-wider">
                      {featuredPost.category}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {featuredPost.readTime}
                    </span>
                  </div>

                  <h2 className="text-2xl sm:text-3xl font-serif font-black text-slate-900 tracking-tight leading-tight hover:text-amber-700 transition-colors">
                    <Link href={`/blog/${featuredPost.slug}`}>{featuredPost.title}</Link>
                  </h2>

                  <p className="mt-4 text-sm text-slate-600 leading-relaxed line-clamp-3">
                    {featuredPost.excerpt}
                  </p>
                </div>

                <div className="pt-6 mt-6 border-t border-slate-200/80 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-amber-200 text-amber-900 flex items-center justify-center font-bold text-xs">
                      {featuredPost.authorName.charAt(0)}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-800">{featuredPost.authorName}</div>
                      <div className="text-[11px] text-slate-400">{featuredPost.publishedAt}</div>
                    </div>
                  </div>

                  <Link
                    href={`/blog/${featuredPost.slug}`}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-900 hover:bg-amber-500 hover:text-slate-950 text-white text-xs font-bold transition-all shadow-md"
                  >
                    Read Story <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. Multi-Card Luxury Editorial Grid */}
        <div>
          <div className="flex items-center justify-between mb-8 pb-3 border-b border-slate-200">
            <h3 className="text-2xl font-serif font-black text-slate-900">
              Curated Style & Fabric Guides
            </h3>
            <span className="text-xs font-bold text-slate-500">
              {allArticles.length} Stories Available
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {gridPosts.map((post) => (
              <article
                key={post.slug}
                className="group flex flex-col bg-white rounded-3xl overflow-hidden border border-slate-200/80 shadow-sm hover:shadow-xl hover:border-amber-300 transition-all duration-300"
              >
                {/* Cover Image */}
                <div className="aspect-[16/10] w-full overflow-hidden bg-gradient-to-br from-amber-50 to-slate-100 relative">
                  <img
                    src={post.coverImageUrl}
                    alt={post.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-3 left-3">
                    <span className="px-3 py-1 rounded-full bg-white/95 backdrop-blur-md text-slate-900 text-[11px] font-black uppercase tracking-wider shadow-sm border border-slate-200/50">
                      {post.category}
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-6 sm:p-7 flex flex-col justify-between flex-1">
                  <div>
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-400 mb-2.5">
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      <span>{post.readTime}</span>
                      <span>•</span>
                      <span>{post.publishedAt}</span>
                    </div>

                    <h4 className="text-lg font-serif font-bold text-slate-900 leading-snug group-hover:text-amber-600 transition-colors line-clamp-2">
                      <Link href={`/blog/${post.slug}`}>{post.title}</Link>
                    </h4>

                    <p className="mt-2.5 text-xs text-slate-600 leading-relaxed line-clamp-3">
                      {post.excerpt}
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                    <div className="text-[11px] font-bold text-slate-500">{post.authorName}</div>

                    <Link
                      href={`/blog/${post.slug}`}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:text-amber-900 transition-colors"
                    >
                      Read Guide <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* 4. Showroom Discovery & Store Concierge Hub */}
        <div className="rounded-3xl bg-slate-950 text-white p-8 sm:p-12 relative overflow-hidden shadow-2xl border border-slate-800">
          <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 text-xs font-bold uppercase tracking-wider mb-4">
                <MapPin className="w-3.5 h-3.5" />
                Hyperlocal Showroom Discovery
              </div>

              <h3 className="text-2xl sm:text-3xl lg:text-4xl font-serif font-black tracking-tight text-white leading-tight">
                Discover Kochi&apos;s Finest Independent Brands &amp; Stores
              </h3>

              <p className="mt-3 text-sm sm:text-base text-slate-300 max-w-2xl leading-relaxed">
                Connect directly with fashion brands and stores in Panampilly Nagar, Edappally, MG Road, Kakkanad, and Fort Kochi. Browse live showroom racks with transparent pricing and receive orders at your door in hours.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                {["Panampilly Nagar", "Edappally", "MG Road", "Kakkanad", "Fort Kochi", "Kaloor"].map((loc) => (
                  <span
                    key={loc}
                    className="px-3 py-1 rounded-full bg-slate-900 border border-slate-700 text-xs font-semibold text-slate-300"
                  >
                    📍 {loc}
                  </span>
                ))}
              </div>
            </div>

            <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col items-start lg:items-end justify-center gap-4">
              <Link
                href="/products"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-4 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm transition-all shadow-xl hover:shadow-amber-400/20 text-center"
              >
                <ShoppingBag className="w-4 h-4" /> Browse Live Showrooms
              </Link>
              <Link
                href="/become-seller"
                className="text-xs text-slate-400 hover:text-amber-300 transition-colors underline underline-offset-4"
              >
                Are you a Kochi store or brand owner? Partner with us
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
