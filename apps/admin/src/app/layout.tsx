import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ConvexClientProvider } from "@/providers/convex-client-provider";
import { UserSync } from "@/components/auth/UserSync";
import { Inter, Outfit } from "next/font/google";
import { Toaster } from "@hive/ui";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-satoshi",
  display: "swap",
}); // Trigger Vercel deploy for @hive/admin (Sep 14, 2026 - Bedsheet Attributes & Sizing System)


export const metadata: Metadata = {
  title: "Hive Marketplace Admin Dashboard",
  description: "HIVE Central Marketplace Source of Truth Admin Panel",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider afterSignOutUrl="http://localhost:3000/">
      <html lang="en" className={`${inter.variable} ${outfit.variable}`}>
        <head>
        </head>
        <body className="antialiased min-h-screen bg-slate-50 text-slate-900 font-sans">
          <ConvexClientProvider>
            <UserSync />
            {children}
            <Toaster />
          </ConvexClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
