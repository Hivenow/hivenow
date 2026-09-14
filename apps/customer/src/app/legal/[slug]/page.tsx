import React from "react";
import { Metadata } from "next";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../../convex/_generated/api";
import { STATIC_LEGAL_DOCS } from "@/data/legal/staticDocs";
import { SITE_URL } from "@/lib/seo";
import ReactMarkdown from "react-markdown";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * The address each document should be indexed and linked under.
 *
 * staticDocs.ts answers to several slugs per document so older links keep working; these are the
 * ones the site links to and search engines should settle on.
 */
const CANONICAL_LEGAL_SLUGS: Record<string, string> = {
  privacy: "privacy-policy",
  "privacy-policy": "privacy-policy",
  terms: "terms-and-conditions",
  "terms-of-service": "terms-and-conditions",
  "terms-and-conditions": "terms-and-conditions",
  returns: "return-policy",
  refund: "return-policy",
  "return-policy": "return-policy",
  partner: "partner-agreement",
  "partner-agreement": "partner-agreement",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  // No brand suffix on these: the root layout's title template appends " | Hive", so carrying
  // "| Hive Now" produced "Privacy Policy | Hive Now | Hive".
  const titleMap: Record<string, string> = {
    privacy: "Privacy Policy",
    "privacy-policy": "Privacy Policy",
    terms: "Terms and Conditions",
    "terms-and-conditions": "Terms and Conditions",
    returns: "Return and Refund Policy",
    "return-policy": "Return and Refund Policy",
  };

  // An unrecognised slug is not a document. Naming it after the URL produced titles like
  // "NONSENSE" for anything typed after /legal/, so it gets a neutral heading instead.
  const title = titleMap[slug] || "Legal";

  // Each document answers on more than one slug — /legal/privacy and /legal/privacy-policy serve
  // the same text, and /privacy-policy redirects in as well. Without a canonical they compete
  // with each other in search results, and which one wins is arbitrary.
  const canonicalSlug = CANONICAL_LEGAL_SLUGS[slug] ?? slug;

  return {
    title,
    description: `Official ${title} for Hive Now marketplace.`,
    alternates: {
      canonical: `${SITE_URL}/legal/${canonicalSlug}`,
    },
    robots: {
      // An unknown slug is not a document worth indexing.
      index: Boolean(titleMap[slug]),
      follow: true,
    },
  };
}

export default async function LegalDocumentPage({ params }: Props) {
  const { slug } = await params;

  let legalDoc: { content: string; slug: string; updatedAt?: number } | null = null;

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
  if (convexUrl) {
    try {
      const client = new ConvexHttpClient(convexUrl);
      legalDoc = await client.query(api.legal.getLatestBySlug, { slug });
    } catch (err) {
      console.error("Failed to fetch legal document SSR:", err);
    }
  }

  const content = legalDoc?.content || STATIC_LEGAL_DOCS[slug] || STATIC_LEGAL_DOCS[slug.toLowerCase()];

  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <h1 className="text-2xl font-serif font-black text-hive-dark">Document Not Found</h1>
        <p className="text-sm text-hive-text-muted">The legal document &quot;{slug}&quot; could not be found.</p>
        <Link href="/" className="text-hive-amber font-semibold hover:underline mt-4 flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Return Home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white rounded-3xl shadow-sm border border-hive-border/30 p-8 sm:p-12">
        <Link href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-hive-text-muted hover:text-hive-dark transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Store
        </Link>
        <div className="prose prose-hive max-w-none text-slate-800 leading-relaxed font-sans">
          <ReactMarkdown
            components={{
              img: ({ node, ...props }) => (
                <span className="block my-6 text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="rounded-2xl border border-hive-border/60 shadow-md max-w-sm w-full mx-auto block"
                    {...props}
                  />
                </span>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
