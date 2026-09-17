import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";
import { withSentryConfig } from "@sentry/nextjs";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: false, // Registration is handled by RegisterServiceWorker.tsx with proper error handling
  customWorkerSrc: "worker",
  dynamicStartUrl: false,
  cacheStartUrl: false,
  workboxOptions: {
    cacheId: "hive-v3",
    cleanupOutdatedCaches: true,
    skipWaiting: true,
    clientsClaim: true,
  },
  reloadOnOnline: true,
});

const nextConfig: NextConfig = {
  // Enable React strict mode for development quality
  reactStrictMode: true,

  // `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds` were both
  // removed here. They meant a type error or a lint error could not fail a
  // production build — and with no error monitoring in place either, such a
  // fault reached real users silently. The build now fails on both, and CI
  // checks them on every pull request (.github/workflows/ci.yml).

  devIndicators: false,

  // Transpile shared workspace packages
  transpilePackages: ["@hive/types", "@hive/ui", "@hive/utils"],

  // Images are resized by Cloudflare, not by Vercel.
  //
  // Vercel's optimizer began returning HTTP 402 (x-vercel-error:
  // OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED) once the account's transformation quota was spent.
  // Already-cached renditions kept serving, so the failure was invisible on older images and hit
  // only those needing a fresh one: every newly uploaded content-engine banner and every newly
  // added static asset rendered broken in production. It was switched off entirely as a hotfix,
  // which restored the images but gave up per-width resizing.
  //
  // Cloudflare fronts both the R2 media bucket (cdn.hivenow.in) and this site, and already
  // performs the same work through /cdn-cgi/image/ — convex/media/urls.ts has been emitting such
  // URLs all along. Pointing next/image at it via the loader below restores responsive widths
  // with one optimizer in the path instead of two.
  //
  // remotePatterns no longer gates anything: a custom loader bypasses Next's own optimizer, which
  // is what consults it. Retained so the settings above remain valid if this is ever reverted.
  images: {
    loader: "custom",
    loaderFile: "./src/lib/cloudflareImageLoader.ts",

    // Widths offered for viewport-relative slots (any `sizes` containing vw).
    //
    // Deliberately shorter than Next's default eight. Cloudflare bills per distinct
    // transformation, and its default scale-down fit never upscales, so a width above a source's
    // own resolution bills a second transformation to return identical bytes. Measured against
    // real production media, the largest source is the 1586px hero banner and product photography
    // sits at or below ~681px, so entries above 1600 could not return anything new.
    //
    //   640   phones at 100vw (360-430px at ~1.5-2x) and half-width rails at 3x
    //   828   the widest a phone can actually use: 430px at 2x, or 100vw on a small tablet
    //   1080  tablet and small-laptop full-bleed
    //   1600  covers the hero banner's native width; nothing larger exists to serve
    deviceSizes: [640, 828, 1080, 1600],

    // Widths offered for fixed-px slots — the 48/56/64/72/80/96px thumbnails in orders, cart and
    // shop headers, and the 120/139px logos. Each needs its slot at 1x, 2x and 3x, which these
    // six cover; 384 is the largest a 128px slot can ask for at 3x.
    imageSizes: [64, 96, 128, 192, 256, 384],

    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.convex.cloud",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "pub-09a817ec6f384c4997feafc5e8387286.r2.dev",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "cdn.hivenow.in",
        pathname: "/**",
      },
    ],
  },

  // Experimental: Server Actions are stable in Next.js 15
  // Enable partial pre-rendering when ready
  experimental: {
  },

  // Redirects for legacy links, typos, and retired pages
  async redirects() {
    return [
      // Legal documents live under /legal, served from data/legal/staticDocs.ts.
      //
      // /terms and /return-policy used to render their own hand-built copies of those documents,
      // and the two sets had drifted apart: the Terms page carried Version 2.0 effective June 12
      // at ~6,600 words while the /legal copy carried Version 2.0 last updated July 25 at ~11,900,
      // and the return policies disagreed on version number and date. Which text bound a customer
      // depended on whether they arrived through the footer or the menu.
      //
      // Redirected rather than removed: these URLs are published, linked and indexed, and a legal
      // document that 404s is worse than one at an old address.
      {
        source: "/terms",
        destination: "/legal/terms-and-conditions",
        permanent: true,
      },
      {
        source: "/return-policy",
        destination: "/legal/return-policy",
        permanent: true,
      },
      {
        source: "/privacy-policy",
        destination: "/legal/privacy-policy",
        permanent: true,
      },
      // /collections and /collections/:slug used to redirect here, back when "collection"
      // meant nothing more than an alias for a product category. They now name a real,
      // merchandiser-curated feature (collections/collectionProducts tables, its own
      // getAllCollections/getCollection queries) with its own index and detail pages — these
      // redirects were shadowing both, at the Next.js routing layer, before either page's code
      // ever ran. Every /collections/<slug> link in the app already passes a genuine collection
      // slug (CollectionCard, MoodBoardGrid, the homepage collection block), never a category
      // slug, so removing this does not repoint any existing link at the wrong content.
      {
        source: "/category/:slug*",
        destination: "/products/:slug*",
        permanent: true,
      },
      // Correct legacy typo URLs to canonical /products/ethnic-wear
      {
        source: "/products/ethnic-wer",
        destination: "/products/ethnic-wear",
        permanent: true,
      },
      {
        source: "/products/ethic-wear",
        destination: "/products/ethnic-wear",
        permanent: true,
      },
      {
        source: "/ethic-wear",
        destination: "/products/ethnic-wear",
        permanent: true,
      },
      {
        source: "/ethnic-wer",
        destination: "/products/ethnic-wear",
        permanent: true,
      },
      {
        source: "/collections/ethnic-wer",
        destination: "/products/ethnic-wear",
        permanent: true,
      },
    ];
  },

  // Security headers
  async headers() {
    const cspHeader = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.com https://*.clerk.accounts.dev https://*.hivenow.in https://hivenow.in https://accounts.hivenow.in https://challenges.cloudflare.com https://*.convex.cloud https://maps.googleapis.com https://*.googleapis.com https://apis.google.com https://*.cloudflareinsights.com https://static.cloudflareinsights.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://*.razorpay.com",
      "script-src-elem 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.com https://*.clerk.accounts.dev https://*.hivenow.in https://hivenow.in https://accounts.hivenow.in https://challenges.cloudflare.com https://*.convex.cloud https://maps.googleapis.com https://*.googleapis.com https://apis.google.com https://*.cloudflareinsights.com https://static.cloudflareinsights.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://*.razorpay.com",
      // Added for this phase: `*.ingest.sentry.io` so error reports can be sent,
      // and `vitals.vercel-insights.com` for Speed Insights beacons. Without
      // these the browser silently blocks both and the dashboards stay empty.
      "connect-src 'self' data: https://*.clerk.com https://*.clerk.accounts.dev https://*.hivenow.in https://hivenow.in wss://*.hivenow.in https://accounts.hivenow.in wss://accounts.hivenow.in https://challenges.cloudflare.com https://*.convex.cloud https://*.convex.site wss://*.convex.cloud https://maps.googleapis.com https://*.googleapis.com https://apis.google.com https://images.unsplash.com https://*.r2.dev https://cdn.hivenow.in https://api.fontshare.com https://cdn.fontshare.com https://*.fontshare.com https://fonts.googleapis.com https://fonts.gstatic.com https://*.cloudflareinsights.com https://www.google.com https://www.gstatic.com https://maps.gstatic.com https://*.gstatic.com https://*.razorpay.com https://*.r2.cloudflarestorage.com https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://*.ingest.us.sentry.io https://vitals.vercel-insights.com",
      "img-src 'self' data: blob: https:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com https://cdn.fontshare.com https://*.fontshare.com https://*.hivenow.in",
      "font-src 'self' https://fonts.gstatic.com https://api.fontshare.com https://cdn.fontshare.com https://*.fontshare.com data: https://*.hivenow.in",
      "frame-src 'self' https://*.clerk.com https://*.clerk.accounts.dev https://*.hivenow.in https://hivenow.in https://accounts.hivenow.in https://challenges.cloudflare.com https://*.firebaseapp.com https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/ https://www.google.com/ https://*.razorpay.com",
      "worker-src 'self' blob: https://*.clerk.com https://*.clerk.accounts.dev https://accounts.hivenow.in",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: cspHeader },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(self)" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          // Governs responses FROM this origin only — has no effect on what the app itself
          // fetches from Clerk, Convex, Razorpay, R2 or Google, so it is safe alongside them.
          {
            key: "Cross-Origin-Resource-Policy",
            value: "same-origin",
          },
          // Legacy Flash/PDF cross-domain policy file opt-out; effectively unused by any
          // current asset here, so this is a no-risk hardening no-op.
          {
            key: "X-Permitted-Cross-Domain-Policies",
            value: "none",
          },
          // Cross-Origin-Embedder-Policy is deliberately NOT set here. `require-corp` would
          // block every cross-origin embed that doesn't send its own CORP/CORS headers —
          // Clerk's auth iframe, Razorpay's checkout iframe, and Google Maps all fall into
          // that bucket, so it would break sign-in and checkout rather than just harden them.
        ],
      },
    ];
  },
  // Resolve @convex/* alias to the monorepo convex/_generated directory
  webpack(config) {
    const path = require("path");
    config.resolve.alias = {
      ...config.resolve.alias,
      "@convex": path.resolve(__dirname, "../../convex/_generated"),
    };
    return config;
  },
};

/**
 * Sentry wraps the config last so it can upload source maps at build time and
 * instrument the server runtime.
 *
 * Every option below is chosen so that a build with no Sentry environment
 * variables behaves exactly as it did before: `withSentryConfig` is a
 * pass-through when SENTRY_AUTH_TOKEN is absent, and the runtime configs
 * themselves no-op without a DSN.
 */
export default withSentryConfig(withPWA(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Quiet unless something goes wrong; the build log is already long.
  silent: !process.env.CI,

  // Upload source maps so production stack traces are readable, then delete
  // them from the deployed output so the original source is not publicly
  // downloadable.
  sourcemaps: { deleteSourcemapsAfterUpload: true },

  // Routes Sentry's own browser requests through the app's origin, so ad
  // blockers and strict network policies do not silently drop error reports.
  tunnelRoute: "/monitoring",

  // Smaller client bundle — strips Sentry's internal debug logging.
  disableLogger: true,

  // Do not fail a production deploy because source-map upload had a bad day.
  errorHandler: (err) => {
    console.warn("[sentry] source map upload failed (build continues):", err?.message ?? err);
  },
});
