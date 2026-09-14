// Trigger Vercel deployment for @hive/customer (Sep 14, 2026 - Bedsheet Sizing & Filter Update)
import type { Metadata } from "next";

import { Inter, Outfit, Cormorant_Garamond } from "next/font/google";
import { ConvexClientProvider } from "@/providers/convex-client-provider";
import { CustomerLayout } from "@/components/layout/CustomerLayout";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-satoshi", // Reusing the variable or just letting tailwind use sans
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://www.hivenow.in"),
  title: {
    template: "%s | Hive",
    default: "Shop Fashion in Kochi & Ernakulam | Delivered in 90 Minutes | Hive",
  },
  description: "Discover fashion from brands, designers and fashion stores across Kochi & Ernakulam. Shop kurtis, dresses, shirts, jeans, footwear, accessories and more, delivered in 90 minutes.",
  publisher: "Beelyn LLP",
  icons: {
    icon: "/icon-512x512.png?v=3",
    apple: "/apple-touch-icon.png?v=3",
  },
};

import { Toaster } from "@hive/ui";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { PwaUpdateManager } from "@/components/pwa/PwaUpdateManager";
import { RegisterServiceWorker } from "@/components/pwa/RegisterServiceWorker";
import { SpeedInsights } from "@vercel/speed-insights/next";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable} ${cormorant.variable}`} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#d4af37" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="antialiased min-h-screen bg-white dark:bg-black text-slate-900 dark:text-slate-100 font-sans">
        <ConvexClientProvider>
          <Toaster />
          <CustomerLayout>
            {children}
          </CustomerLayout>
          <div id="modal-root" />
          <InstallPrompt />
          <RegisterServiceWorker />
          <PwaUpdateManager />
        </ConvexClientProvider>
        {/* Real-user Core Web Vitals. Mounted once, at the root, so every route
            reports. Inert outside Vercel, so local dev is unaffected. */}
        <SpeedInsights />
      </body>
    </html>
  );
}


