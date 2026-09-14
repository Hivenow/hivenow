import type { Metadata } from "next";
import { ConvexClientProvider } from "@/providers/convex-client-provider";
import { SellerAuthProvider } from "@/context/SellerAuthContext";
import { UserSync } from "@/components/auth/UserSync";
import { Inter, Outfit } from "next/font/google";
import { Toaster } from "@hive/ui";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { PwaUpdateManager } from "@/components/pwa/PwaUpdateManager";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-satoshi",
  display: "swap",
}); // Trigger Vercel deploy for @hive/boutique (Sep 14, 2026 - Bedsheet Sizing & Attributes)

export const metadata: Metadata = {
  title: "Hive Partner Portal",
  description: "HIVE Boutique Partner Dashboard",
  icons: {
    icon: "/logo.png?v=2",
    apple: "/apple-touch-icon.png?v=2",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable}`}>
      <head>
        <meta name="theme-color" content="#F5C22B" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="antialiased min-h-screen bg-slate-50 text-slate-900 font-sans">
        <ConvexClientProvider>
          <SellerAuthProvider>
            <UserSync />
            {children}
            <Toaster />
            <InstallPrompt />
            <PwaUpdateManager />
          </SellerAuthProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
