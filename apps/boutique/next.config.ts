// Trigger Vercel rebuild for hive-seller / @hive/boutique (v0.0.2 - Sep 14, 2026 - Bedsheet Sizing)
import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  dynamicStartUrl: false,
  cacheStartUrl: false,
  customWorkerSrc: "worker",
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
  },
  reloadOnOnline: true,
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  devIndicators: false,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" 
      ? { exclude: ["error", "warn"] }
      : false,
  },
  transpilePackages: ["@hive/types", "@hive/ui", "@hive/utils"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        // Canonical public image domain (R2 custom domain + Cloudflare transforms).
        protocol: "https",
        hostname: "cdn.hivenow.in",
        pathname: "/**",
      },
      {
        // Legacy development endpoint. Retained so image URLs already stored in
        // the database keep rendering; new URLs are never generated for it.
        protocol: "https",
        hostname: "*.r2.dev",
        pathname: "/**",
      },
    ],
  },
  async headers() {
    const cspHeader = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.com https://*.clerk.accounts.dev https://*.hivenow.in https://hivenow.in https://accounts.hivenow.in https://challenges.cloudflare.com https://*.convex.cloud https://maps.googleapis.com https://*.googleapis.com https://apis.google.com https://*.cloudflareinsights.com https://static.cloudflareinsights.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://*.razorpay.com https://www.gstatic.com",
      "script-src-elem 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.com https://*.clerk.accounts.dev https://*.hivenow.in https://hivenow.in https://accounts.hivenow.in https://challenges.cloudflare.com https://*.convex.cloud https://maps.googleapis.com https://*.googleapis.com https://apis.google.com https://*.cloudflareinsights.com https://static.cloudflareinsights.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://*.razorpay.com https://www.gstatic.com",
      "connect-src 'self' data: https://*.clerk.com https://*.clerk.accounts.dev https://*.hivenow.in https://hivenow.in wss://*.hivenow.in https://accounts.hivenow.in wss://accounts.hivenow.in https://challenges.cloudflare.com https://*.convex.cloud https://*.convex.site wss://*.convex.cloud https://maps.googleapis.com https://*.googleapis.com https://apis.google.com https://images.unsplash.com https://*.r2.dev https://api.fontshare.com https://cdn.fontshare.com https://*.fontshare.com https://fonts.googleapis.com https://fonts.gstatic.com https://*.cloudflareinsights.com https://www.google.com https://www.gstatic.com https://maps.gstatic.com https://*.gstatic.com https://*.razorpay.com https://*.r2.cloudflarestorage.com https://*.firebaseio.com https://*.firebaseapp.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
      "img-src 'self' data: blob: https:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com https://cdn.fontshare.com https://*.fontshare.com https://*.hivenow.in",
      "font-src 'self' https://fonts.gstatic.com https://api.fontshare.com https://cdn.fontshare.com https://*.fontshare.com data: https://*.hivenow.in",
      "frame-src 'self' https://*.clerk.com https://*.clerk.accounts.dev https://*.hivenow.in https://hivenow.in https://accounts.hivenow.in https://challenges.cloudflare.com https://*.firebaseapp.com https://accounts.google.com https://www.google.com/ https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/ https://*.razorpay.com",
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
        ],
      },
    ];
  },
  webpack(config) {
    const path = require("path");
    config.resolve.alias = {
      ...config.resolve.alias,
      "@convex": path.resolve(__dirname, "../../convex/_generated"),
    };
    return config;
  },
};

export default withPWA(nextConfig);
