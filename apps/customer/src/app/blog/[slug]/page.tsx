import React from "react";
import Link from "next/link";
import { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../../convex/_generated/api";
import { getBlogBySlug, getAllBlogs, getRelatedBlogs } from "../../../data/blogs";
import { SITE_URL } from "@/lib/seo";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft,
  Clock,
  Calendar,
  User,
  CheckCircle2,
  HelpCircle,
  ShoppingBag,
  ArrowRight,
  Sparkles,
} from "lucide-react";

interface Props {
  params: Promise<{ slug: string }>;
}

type FetchResult =
  | {
      type: "post";
      source: "convex";
      data: any;
    }
  | {
      type: "post";
      source: "static";
      data: any;
    }
  | {
      type: "redirect";
      newSlug: string;
    }
  | null;

/**
 * Fetch blog post or check permanent 301/308 redirect mapping
 */
async function fetchPostOrRedirect(slug: string): Promise<FetchResult> {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (convexUrl) {
    try {
      const client = new ConvexHttpClient(convexUrl);
      const dbPost = await client.query(api.blogs.getPostBySlug, { slug });
      if (dbPost) {
        return {
          type: "post",
          source: "convex",
          data: dbPost,
        };
      }

      // Check if this slug was previously published and redirected
      const redirect = await client.query(api.blogs.getSlugRedirect, { oldSlug: slug });
      if (redirect && redirect.newSlug && redirect.newSlug !== slug) {
        return {
          type: "redirect",
          newSlug: redirect.newSlug,
        };
      }
    } catch (err) {
      console.error("Failed to query Convex for blog post:", err);
    }
  }

  // Graceful fallback to static seed data
  const staticPost = getBlogBySlug(slug);
  if (staticPost) {
    return {
      type: "post",
      source: "static",
      data: staticPost,
    };
  }

  return null;
}

/**
 * 1. Dynamic SEO Metadata Generation for Googlebot & Social Crawlers
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await fetchPostOrRedirect(slug);

  if (!result) {
    return {
      title: "Article Not Found",
      description: "The requested blog article could not be found.",
    };
  }

  if (result.type === "redirect") {
    permanentRedirect(`/blog/${result.newSlug}`);
  }

  const defaultOgImage = `${SITE_URL}/icon-512x512.png`;

  if (result.source === "convex") {
    const post = result.data;
    // Return raw title so Next.js root layout template "%s | Hive" appends "| Hive" exactly once
    const rawTitle = post.seoTitle || post.title;
    const description = post.metaDescription || post.excerpt;
    const keywords = post.primaryKeyword
      ? [post.primaryKeyword, ...(post.secondaryKeywords || [])]
      : ["Kochi fashion blog", "Kerala fashion styling", "Hyperlocal marketplace Kerala"];

    const ogImage = post.coverImageUrl || defaultOgImage;
    const canonicalUrl = `${SITE_URL}/blog/${post.slug}`;

    return {
      title: rawTitle,
      description,
      keywords,
      alternates: {
        canonical: canonicalUrl,
      },
      openGraph: {
        title: rawTitle,
        description,
        url: canonicalUrl,
        siteName: "Hive Marketplace",
        type: "article",
        publishedTime: post.publishedAt ? new Date(post.publishedAt).toISOString() : undefined,
        authors: [post.authorName || "Hive Editorial Team"],
        images: [
          {
            url: ogImage,
            alt: post.title,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: rawTitle,
        description,
        images: [ogImage],
      },
    };
  }

  // Static post fallback metadata
  const blog = result.data;
  const rawTitle = blog.seoTitle ? blog.seoTitle.replace(/\s*\|\s*Hive.*$/i, "") : blog.h1Title;
  const ogImage = blog.coverImageUrl || defaultOgImage;
  const canonicalUrl = `${SITE_URL}/blog/${blog.slug}`;

  return {
    title: rawTitle,
    description: blog.metaDescription,
    keywords: [blog.primaryKeyword, ...blog.secondaryKeywords],
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: rawTitle,
      description: blog.metaDescription,
      url: canonicalUrl,
      siteName: "Hive Marketplace",
      type: "article",
      publishedTime: blog.publishedAt,
      authors: [blog.author.name],
      images: [
        {
          url: ogImage,
          alt: blog.h1Title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: rawTitle,
      description: blog.metaDescription,
      images: [ogImage],
    },
  };
}

/**
 * 2. Server-Side Rendered (SSR) Component for instant HTML delivery
 */
export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const result = await fetchPostOrRedirect(slug);

  if (!result) {
    notFound();
  }

  if (result.type === "redirect") {
    permanentRedirect(`/blog/${result.newSlug}`);
  }

  const relatedStories = getRelatedBlogs(slug, 3);

  // Rendering for Convex dynamic database posts
  if (result.source === "convex") {
    const post = result.data;

    // Structured JSON-LD Article Schema
    const articleSchema = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": `${SITE_URL}/blog/${post.slug}`,
      },
      headline: post.title,
      description: post.excerpt,
      image: post.coverImageUrl ? [post.coverImageUrl] : [`${SITE_URL}/icon-512x512.png`],
      datePublished: post.publishedAt
        ? new Date(post.publishedAt).toISOString()
        : new Date(post._creationTime).toISOString(),
      dateModified: post.updatedAt
        ? new Date(post.updatedAt).toISOString()
        : new Date(post._creationTime).toISOString(),
      author: {
        "@type": "Person",
        name: post.authorName || "Hive Editorial Team",
      },
      publisher: {
        "@type": "Organization",
        name: "Hive",
        logo: {
          "@type": "ImageObject",
          url: `${SITE_URL}/icon.png`,
        },
      },
    };

    const breadcrumbSchema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: SITE_URL,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Blog",
          item: `${SITE_URL}/blog`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: post.title,
          item: `${SITE_URL}/blog/${post.slug}`,
        },
      ],
    };

    // Conditional FAQPage Schema (Only generated when post.faqs exists and has entries)
    const faqSchema =
      post.faqs && post.faqs.length > 0
        ? {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: post.faqs.map((faq: { question: string; answer: string }) => ({
              "@type": "Question",
              name: faq.question,
              acceptedAnswer: {
                "@type": "Answer",
                text: faq.answer,
              },
            })),
          }
        : null;

    const isHtmlContent = post.content.trim().startsWith("<") || post.content.includes("</");

    const formattedDate = post.publishedAt
      ? new Date(post.publishedAt).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : new Date(post._creationTime).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });

    return (
      <div className="min-h-screen bg-slate-50/70 py-12 px-4 sm:px-6 lg:px-8">
        {/* Inject Structured Schema Markup (JSON-LD) for Google SEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        />
        {faqSchema && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
          />
        )}

        <article className="max-w-4xl mx-auto bg-white rounded-3xl shadow-sm border border-slate-200/80 overflow-hidden">
          {/* Top Navigation & Header */}
          <div className="p-8 sm:p-12 pb-8 border-b border-slate-100 bg-gradient-to-b from-slate-50/50 to-white">
            <div className="flex items-center justify-between gap-4 mb-6">
              <Link
                href="/blog"
                className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Journal Directory
              </Link>
              {post.category && (
                <span className="px-3.5 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-black uppercase tracking-wider">
                  {post.category}
                </span>
              )}
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-black text-slate-900 tracking-tight leading-tight">
              {post.title}
            </h1>

            <div className="mt-6 pt-6 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-4 text-xs font-medium text-slate-500">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-amber-600" />
                  <span className="font-bold text-slate-700">{post.authorName || "Hive Editorial Team"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <span>{formattedDate}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span>{post.readTime || "5 min read"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Featured Cover Image */}
          {post.coverImageUrl && (
            <div className="px-8 sm:px-12 pt-8">
              <img
                src={post.coverImageUrl}
                alt={post.title}
                className="w-full h-auto max-h-[500px] object-cover rounded-2xl shadow-sm border border-slate-100"
              />
            </div>
          )}

          {/* Main Article Body (HTML / Markdown) */}
          <div className="p-8 sm:p-12 prose prose-slate max-w-none prose-headings:font-serif prose-headings:font-bold prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4 prose-h3:text-xl prose-p:leading-relaxed prose-p:text-slate-700 prose-li:text-slate-700 prose-img:rounded-2xl prose-img:border prose-img:border-slate-100">
            {isHtmlContent ? (
              <div dangerouslySetInnerHTML={{ __html: post.content }} />
            ) : (
              <ReactMarkdown>{post.content}</ReactMarkdown>
            )}
          </div>

          {/* Actionable Tips Section */}
          {post.actionableTips && post.actionableTips.length > 0 && (
            <div className="mx-8 sm:mx-12 my-8 p-6 sm:p-8 rounded-3xl bg-amber-50/70 border border-amber-200/80">
              <div className="flex items-center gap-2.5 text-amber-900 font-serif font-bold text-lg mb-4">
                <CheckCircle2 className="w-6 h-6 text-amber-600" />
                Actionable Tips for Online Shoppers
              </div>
              <ul className="space-y-3.5 pl-2">
                {post.actionableTips.map((tip: string, index: number) => (
                  <li
                    key={index}
                    className="flex items-start gap-3 text-sm text-amber-950 font-medium leading-relaxed"
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-500 mt-2 shrink-0" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Interactive FAQs Accordion */}
          {post.faqs && post.faqs.length > 0 && (
            <div className="p-8 sm:p-12 border-t border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2.5 font-serif font-bold text-2xl text-slate-900 mb-6">
                <HelpCircle className="w-6 h-6 text-amber-600" />
                Frequently Asked Questions (FAQs)
              </div>
              <div className="space-y-4">
                {post.faqs.map((faq: { question: string; answer: string }, index: number) => (
                  <details
                    key={index}
                    className="group bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm transition-all duration-200 open:border-amber-400 open:shadow-md"
                  >
                    <summary className="font-bold text-slate-900 text-base cursor-pointer list-none flex items-center justify-between select-none pr-2">
                      <span>{faq.question}</span>
                      <span className="w-6 h-6 rounded-full bg-slate-100 group-open:bg-amber-100 text-slate-600 group-open:text-amber-800 flex items-center justify-center text-xs font-black transition-colors shrink-0">
                        ?
                      </span>
                    </summary>
                    <p className="mt-3.5 text-sm text-slate-600 leading-relaxed pt-3 border-t border-slate-100">
                      {faq.answer}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          )}

          {/* More Stories from The Hive Journal */}
          {relatedStories.length > 0 && (
            <div className="p-8 sm:p-12 border-t border-slate-200/80 bg-white">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-serif font-bold text-xl text-slate-900">
                  More Stories from The Hive Journal
                </h3>
                <Link
                  href="/blog"
                  className="text-xs font-bold text-amber-700 hover:text-amber-900 inline-flex items-center gap-1"
                >
                  View All <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {relatedStories.map((story) => (
                  <Link
                    key={story.slug}
                    href={`/blog/${story.slug}`}
                    className="group flex flex-col bg-slate-50 rounded-2xl p-4 border border-slate-200/70 hover:border-amber-300 hover:shadow-md transition-all"
                  >
                    <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider mb-1.5">
                      {story.category}
                    </div>
                    <h4 className="font-serif font-bold text-sm text-slate-900 group-hover:text-amber-600 transition-colors line-clamp-2 leading-snug">
                      {story.h1Title || story.metaTitle}
                    </h4>
                    <span className="mt-3 text-[11px] font-semibold text-slate-400">
                      {story.readTime}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Hyperlocal Conversion CTA Banner */}
          <div className="p-8 sm:p-12 bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-8">
            <div>
              <span className="px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 text-xs font-bold uppercase tracking-wider">
                Ready to Upgrade Your Wardrobe?
              </span>
              <h3 className="text-2xl sm:text-3xl font-serif font-black mt-3">
                Explore Kochi&apos;s Top Independent Brands &amp; Stores Today
              </h3>
              <p className="mt-2 text-sm text-slate-300 max-w-xl leading-relaxed">
                Don&apos;t wait days for your next favorite outfit. Browse live collections from local fashion brands and stores and get same-day courier delivery to your doorstep.
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-4 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm transition-all shadow-lg hover:shadow-amber-400/20 shrink-0"
            >
              <ShoppingBag className="w-4 h-4" /> Shop Live Stores
            </Link>
          </div>
        </article>
      </div>
    );
  }

  // Rendering for static fallback posts
  const blog = result.data;

  // Conditional FAQPage Schema for static articles if they contain faqs
  const staticFaqSchema =
    blog.faqs && blog.faqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: blog.faqs.map((faq: { question: string; answer: string }) => ({
            "@type": "Question",
            name: faq.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: faq.answer,
            },
          })),
        }
      : null;

  return (
    <div className="min-h-screen bg-slate-50/70 py-12 px-4 sm:px-6 lg:px-8">
      {/* Inject Structured Schema Markup (JSON-LD) for Google SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blog.schemaMarkup) }}
      />
      {staticFaqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(staticFaqSchema) }}
        />
      )}

      <article className="max-w-4xl mx-auto bg-white rounded-3xl shadow-sm border border-slate-200/80 overflow-hidden">
        {/* Top Navigation & Header */}
        <div className="p-8 sm:p-12 pb-8 border-b border-slate-100 bg-gradient-to-b from-slate-50/50 to-white">
          <div className="flex items-center justify-between gap-4 mb-6">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Journal Directory
            </Link>
            <span className="px-3.5 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-black uppercase tracking-wider">
              {blog.category}
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-black text-slate-900 tracking-tight leading-tight">
            {blog.h1Title}
          </h1>

          <div className="mt-6 pt-6 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-4 text-xs font-medium text-slate-500">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-amber-600" />
                <span className="font-bold text-slate-700">{blog.author.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span>{blog.publishedAt}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <span>{blog.readTime}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Featured Cover Image */}
        {blog.coverImageUrl && (
          <div className="px-8 sm:px-12 pt-8">
            <img
              src={blog.coverImageUrl}
              alt={blog.h1Title}
              className="w-full h-auto max-h-[500px] object-cover rounded-2xl shadow-sm border border-slate-100"
            />
          </div>
        )}

        {/* Main Markdown Article Body */}
        <div className="p-8 sm:p-12 prose prose-slate max-w-none prose-headings:font-serif prose-headings:font-bold prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4 prose-h3:text-xl prose-p:leading-relaxed prose-p:text-slate-700 prose-li:text-slate-700">
          <ReactMarkdown>{blog.content}</ReactMarkdown>
        </div>

        {/* Actionable Tips Section */}
        {blog.actionableTips && blog.actionableTips.length > 0 && (
          <div className="mx-8 sm:mx-12 my-8 p-6 sm:p-8 rounded-3xl bg-amber-50/70 border border-amber-200/80">
            <div className="flex items-center gap-2.5 text-amber-900 font-serif font-bold text-lg mb-4">
              <CheckCircle2 className="w-6 h-6 text-amber-600" />
              Actionable Tips for Online Shoppers
            </div>
            <ul className="space-y-3.5 pl-2">
              {blog.actionableTips.map((tip: string, index: number) => (
                <li key={index} className="flex items-start gap-3 text-sm text-amber-950 font-medium leading-relaxed">
                  <span className="w-2 h-2 rounded-full bg-amber-500 mt-2 shrink-0" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Interactive FAQ Section */}
        {blog.faqs && blog.faqs.length > 0 && (
          <div className="p-8 sm:p-12 border-t border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-2.5 font-serif font-bold text-2xl text-slate-900 mb-6">
              <HelpCircle className="w-6 h-6 text-amber-600" />
              Frequently Asked Questions (FAQs)
            </div>
            <div className="space-y-4">
              {blog.faqs.map((faq: { question: string; answer: string }, index: number) => (
                <details
                  key={index}
                  className="group bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm transition-all duration-200 open:border-amber-400 open:shadow-md"
                >
                  <summary className="font-bold text-slate-900 text-base cursor-pointer list-none flex items-center justify-between select-none pr-2">
                    <span>{faq.question}</span>
                    <span className="w-6 h-6 rounded-full bg-slate-100 group-open:bg-amber-100 text-slate-600 group-open:text-amber-800 flex items-center justify-center text-xs font-black transition-colors shrink-0">
                      ?
                    </span>
                  </summary>
                  <p className="mt-3.5 text-sm text-slate-600 leading-relaxed pt-3 border-t border-slate-100">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        )}

        {/* More Stories from The Hive Journal */}
        {relatedStories.length > 0 && (
          <div className="p-8 sm:p-12 border-t border-slate-200/80 bg-white">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-serif font-bold text-xl text-slate-900">
                More Stories from The Hive Journal
              </h3>
              <Link
                href="/blog"
                className="text-xs font-bold text-amber-700 hover:text-amber-900 inline-flex items-center gap-1"
              >
                View All <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {relatedStories.map((story) => (
                <Link
                  key={story.slug}
                  href={`/blog/${story.slug}`}
                  className="group flex flex-col bg-slate-50 rounded-2xl p-4 border border-slate-200/70 hover:border-amber-300 hover:shadow-md transition-all"
                >
                  <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider mb-1.5">
                    {story.category}
                  </div>
                  <h4 className="font-serif font-bold text-sm text-slate-900 group-hover:text-amber-600 transition-colors line-clamp-2 leading-snug">
                    {story.h1Title || story.metaTitle}
                  </h4>
                  <span className="mt-3 text-[11px] font-semibold text-slate-400">
                    {story.readTime}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Hyperlocal Conversion Banner (CTA) */}
        <div className="p-8 sm:p-12 bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-8">
          <div>
            <span className="px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 text-xs font-bold uppercase tracking-wider">
              Ready to Upgrade Your Wardrobe?
            </span>
            <h3 className="text-2xl sm:text-3xl font-serif font-black mt-3">
              Explore Kochi&apos;s Top Independent Brands &amp; Stores Today
            </h3>
            <p className="mt-2 text-sm text-slate-300 max-w-xl leading-relaxed">
              Don&apos;t wait days for your next favorite outfit. Browse live collections from local fashion brands and stores and get same-day courier delivery to your doorstep.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-4 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm transition-all shadow-lg hover:shadow-amber-400/20 shrink-0"
          >
            <ShoppingBag className="w-4 h-4" /> Shop Live Stores
          </Link>
        </div>
      </article>
    </div>
  );
}
