import React from "react";
import { Metadata } from "next";
import Link from "next/link";
import { CatalogLayout } from "@/components/catalog/CatalogLayout";
import { OrganizationSchema } from "@/components/seo/OrganizationSchema";
import { BreadcrumbSchema } from "@/components/seo/BreadcrumbSchema";
import { SITE_URL } from "@/lib/seo";
import {
  Clock,
  ArrowRight,
  Zap,
  MapPin,
  Mail,
  Phone,
  Building2,
} from "lucide-react";

export const metadata: Metadata = {
  title: "About Hive | Fashion Shouldn't Have to Wait",
  description:
    "Hive is Kochi's first fashion platform built for 90-minute delivery. Discover fashion from brands, designers, and labels across Kochi & Ernakulam.",
  alternates: {
    canonical: `${SITE_URL}/about`,
  },
  openGraph: {
    title: "About Hive | Fashion Shouldn't Have to Wait",
    description:
      "Kochi's first fashion platform built for 90-minute delivery. Discover top brands and designers delivered to your door today.",
    url: `${SITE_URL}/about`,
    siteName: "Hive",
    type: "website",
    images: [`${SITE_URL}/icon-512x512.png`],
  },
};

export default function AboutPage() {
  return (
    <CatalogLayout>
      <OrganizationSchema />
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "/" },
          { name: "About Hive", url: "/about" },
        ]}
      />

      <div className="w-full bg-hive-cream">
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 md:py-16 text-hive-dark text-left">
          {/* ── 1. HERO / HOOK ── */}
          <header className="space-y-7 mb-16 pb-12 border-b border-hive-border">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-hive-dark/5 border border-hive-dark/15 text-hive-dark text-[11px] font-bold uppercase tracking-widest">
              <Zap className="w-3.5 h-3.5 text-hive-dark" />
              <span>About Hive</span>
            </div>

            <div className="space-y-4">
              <h1 className="text-3xl sm:text-5xl md:text-6xl font-serif font-bold tracking-tight text-hive-dark leading-[1.08]">
                Fashion shouldn&apos;t have to wait.
              </h1>

              <div className="pt-1 text-base sm:text-lg font-medium text-hive-text-muted space-y-0.5">
                <p>Your plans don&apos;t.</p>
                <p>Your mood doesn&apos;t.</p>
                <p className="text-hive-dark font-bold">So why should your outfit?</p>
              </div>
            </div>

            <div className="border-l-4 border-hive-dark pl-5 sm:pl-6 py-1 space-y-3">
              <p className="text-base sm:text-lg text-hive-dark font-bold leading-snug">
                Hive is Kochi&apos;s first fashion platform built for 90-minute delivery.
              </p>
              <p className="text-sm sm:text-base text-hive-text-muted leading-relaxed">
                Discover fashion from brands, designers and labels across Kochi and Ernakulam. Find the pieces you actually want, order them in a few taps, and have them at your door in around 90 minutes.
              </p>
              <p className="text-sm sm:text-base text-hive-dark font-bold pt-0.5">
                No waiting days for your outfit. Just find it. Love it. Hive it.
              </p>
            </div>
          </header>

          {/* ── 2. NOT JUST ANOTHER FASHION APP ── */}
          <section className="mb-16 space-y-4">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-hive-text-muted block">
                Convenience Redefined
              </span>
              <h2 className="text-2xl sm:text-3xl font-serif font-bold text-hive-dark tracking-tight">
                Not just another fashion app.
              </h2>
            </div>

            <div className="space-y-3.5">
              <p className="text-hive-text-muted text-sm sm:text-base leading-relaxed">
                There are plenty of places to shop fashion online.
              </p>
              <div className="border-l-4 border-hive-dark pl-5 sm:pl-6 py-0.5 space-y-1">
                <p className="text-hive-dark text-base sm:text-lg font-bold leading-snug">
                  But finding something great and actually getting it today?
                </p>
                <p className="text-hive-dark font-semibold text-sm sm:text-base">
                  That&apos;s where Hive comes in.
                </p>
              </div>
              <p className="text-hive-text-muted text-sm sm:text-base leading-relaxed">
                We bring together brands, designers and fashion names you won&apos;t find on the usual fashion apps, all in one place.
              </p>
              <p className="text-hive-text-muted text-sm sm:text-base leading-relaxed">
                From that kurti you&apos;ve been looking for to a last-minute outfit, a new pair of jeans, sneakers, a bag or the perfect accessories.
              </p>
              <div className="pt-3 border-t border-hive-border flex items-center gap-2 text-hive-dark font-bold text-sm sm:text-base">
                <Zap className="w-4 h-4 text-hive-dark shrink-0" />
                <span>If you want it now, Hive is for you.</span>
              </div>
            </div>
          </section>

          {/* ── 3. 90 MINUTES. THAT'S THE DIFFERENCE. ── */}
          <section className="mb-16 space-y-4">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-hive-text-muted block">
                Speed At Heart
              </span>
              <h2 className="text-2xl sm:text-3xl font-serif font-bold text-hive-dark tracking-tight">
                90 MINUTES. THAT&apos;S THE DIFFERENCE.
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {/* Step 1 */}
              <div className="bg-white border border-hive-border rounded-2xl p-5 sm:p-6 space-y-3">
                <div className="w-8 h-8 rounded-full bg-hive-dark text-hive-cream flex items-center justify-center text-xs font-mono font-bold">
                  01
                </div>
                <div>
                  <h3 className="text-base font-bold text-hive-dark">
                    Browse.
                  </h3>
                  <p className="text-xs sm:text-sm text-hive-text-muted leading-relaxed pt-0.5">
                    Find something you love.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="bg-white border border-hive-border rounded-2xl p-5 sm:p-6 space-y-3">
                <div className="w-8 h-8 rounded-full bg-hive-dark text-hive-cream flex items-center justify-center text-xs font-mono font-bold">
                  02
                </div>
                <div>
                  <h3 className="text-base font-bold text-hive-dark">
                    Order.
                  </h3>
                  <p className="text-xs sm:text-sm text-hive-text-muted leading-relaxed pt-0.5">
                    Pick your size. Check out.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="bg-hive-dark rounded-2xl p-5 sm:p-6 space-y-3">
                <div className="w-8 h-8 rounded-full bg-hive-cream text-hive-dark flex items-center justify-center text-xs font-mono font-bold">
                  03
                </div>
                <div>
                  <h3 className="text-base font-bold text-hive-cream">
                    Hive.
                  </h3>
                  <p className="text-xs sm:text-sm text-hive-cream/70 leading-relaxed pt-0.5">
                    Get it at your doorstep in around 90 minutes.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-hive-dark text-hive-cream rounded-xl py-3.5 px-5 text-center text-xs sm:text-sm font-semibold tracking-wide flex items-center justify-center gap-2">
              <Clock className="w-4 h-4 text-hive-cream/70 shrink-0" />
              <span>Fashion shopping, without the multi-day wait.</span>
            </div>
          </section>

          {/* ── 4. MADE FOR KOCHI ── */}
          <section className="mb-16 space-y-4">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-hive-text-muted block">
                Our Roots &amp; Passion
              </span>
              <h2 className="text-2xl sm:text-3xl font-serif font-bold text-hive-dark tracking-tight">
                Made for Kochi. Made for how you shop now.
              </h2>
            </div>

            <div className="border-l-4 border-hive-dark pl-5 sm:pl-6 py-1 space-y-3.5">
              <p className="text-base sm:text-lg text-hive-dark font-bold">
                Kochi has incredible fashion talent.
              </p>
              <p className="text-sm sm:text-base text-hive-text-muted leading-relaxed">
                Independent designers. New labels. Homegrown names. Brands with their own style.
              </p>
              <p className="text-sm sm:text-base text-hive-text-muted leading-relaxed">
                We wanted to bring all of that together in one fashion destination and make it as easy to shop as the big fashion platforms, but much, much faster.
              </p>
              <div className="pt-3 border-t border-hive-border space-y-1">
                <p className="text-sm sm:text-base text-hive-dark font-semibold">
                  So we built Hive.
                </p>
                <p className="text-base sm:text-lg text-hive-dark font-serif font-bold tracking-tight">
                  The first. The fastest. And made for Kochi.
                </p>
              </div>
            </div>
          </section>

          {/* ── 5. “I NEED IT TODAY” MOMENTS ── */}
          <section className="mb-16 space-y-4">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-hive-text-muted block">
                For Real-Life Timing
              </span>
              <h2 className="text-2xl sm:text-3xl font-serif font-bold text-hive-dark tracking-tight">
                Fashion for the “I need it today” moments.
              </h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
              {[
                "Last-minute plans.",
                "A dinner tonight.",
                "A birthday tomorrow.",
                "A sudden change of plans.",
              ].map((moment, i) => (
                <div
                  key={i}
                  className="bg-white border border-hive-border rounded-xl p-3.5 text-center text-xs sm:text-sm font-semibold text-hive-text flex items-center justify-center min-h-[64px]"
                >
                  {moment}
                </div>
              ))}
            </div>

            <div className="bg-hive-dark/5 border border-hive-dark/10 rounded-2xl p-6 text-center space-y-2">
              <p className="text-[11px] uppercase tracking-widest text-hive-text-muted font-bold">Or simply...</p>
              <p className="text-2xl sm:text-3xl font-serif font-bold text-hive-dark">“I want this.”</p>
              <p className="text-xs sm:text-sm text-hive-text-muted pt-0.5">
                You shouldn&apos;t have to wait three days for it.
              </p>
              <p className="text-base font-bold text-hive-dark pt-0.5">
                Hive it.
              </p>
            </div>
          </section>

          {/* ── 6. WHAT YOU'LL FIND ON HIVE ── */}
          <section className="mb-16 space-y-4">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-hive-text-muted block">
                Product Categories
              </span>
              <h2 className="text-2xl sm:text-3xl font-serif font-bold text-hive-dark tracking-tight">
                What you&apos;ll find on Hive
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {/* Women's Fashion */}
              <div className="bg-white border border-hive-border rounded-2xl p-5 sm:p-6 space-y-2">
                <h3 className="text-base font-bold text-hive-dark">
                  Women&apos;s Fashion
                </h3>
                <p className="text-xs sm:text-sm text-hive-text-muted leading-relaxed font-medium">
                  Kurtis · Dresses · Sarees · Tops · Ethnic Wear · Western Wear
                </p>
              </div>

              {/* Men's Fashion */}
              <div className="bg-white border border-hive-border rounded-2xl p-5 sm:p-6 space-y-2">
                <h3 className="text-base font-bold text-hive-dark">
                  Men&apos;s Fashion
                </h3>
                <p className="text-xs sm:text-sm text-hive-text-muted leading-relaxed font-medium">
                  Shirts · T-Shirts · Jeans · Trousers · Streetwear · Ethnic Wear
                </p>
              </div>

              {/* More to wear */}
              <div className="bg-white border border-hive-border rounded-2xl p-5 sm:p-6 space-y-2">
                <h3 className="text-base font-bold text-hive-dark">
                  More to wear
                </h3>
                <p className="text-xs sm:text-sm text-hive-text-muted leading-relaxed font-medium">
                  Footwear · Bags · Jewellery · Accessories · And more
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-hive-dark/5 border border-hive-dark/10 rounded-xl text-center">
              <p className="text-xs sm:text-sm font-semibold text-hive-dark">
                All available across Kochi &amp; Ernakulam, with delivery in around 90 minutes.
              </p>
            </div>
          </section>

          {/* ── 7. THE COMPANY BEHIND HIVE ── */}
          <section className="mb-16 pt-10 border-t border-hive-border space-y-4">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-hive-text-muted block">
                Corporate Transparency
              </span>
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-hive-dark">
                The company behind Hive
              </h2>
              <p className="text-xs sm:text-sm text-hive-text-muted">
                Hive is operated by Beelyn LLP, based in Ernakulam, Kerala.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-hive-text-muted">
              <div className="bg-white border border-hive-border rounded-xl p-4 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-hive-dark">
                  <Building2 className="w-3.5 h-3.5 text-hive-text-muted" />
                  <span>Registered Office</span>
                </div>
                <p className="leading-relaxed text-hive-text-muted">
                  55/4379, Door No. 3623, Valanjambalam Junction, Kochi M.G. Road, Ernakulam, Kerala – 682016, India
                </p>
              </div>

              <div className="bg-white border border-hive-border rounded-xl p-4 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-hive-dark">
                  <Mail className="w-3.5 h-3.5 text-hive-text-muted" />
                  <span>Contact</span>
                </div>
                <p className="leading-relaxed text-hive-text-muted">
                  <a href="mailto:support@hivenow.in" className="underline hover:text-hive-dark">
                    support@hivenow.in
                  </a>
                  <br />
                  <a href="tel:+917356019103" className="underline hover:text-hive-dark">
                    +91 73560 19103
                  </a>
                </p>
              </div>

              <div className="bg-white border border-hive-border rounded-xl p-4 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-hive-dark">
                  <MapPin className="w-3.5 h-3.5 text-hive-text-muted" />
                  <span>Service Area</span>
                </div>
                <p className="leading-relaxed text-hive-text-muted">
                  Kochi &amp; Ernakulam District, Kerala
                </p>
              </div>
            </div>
          </section>

          {/* ── 8. FINAL CTA ── */}
          <div className="bg-hive-dark text-hive-cream rounded-2xl p-7 sm:p-10 flex flex-col sm:flex-row items-center justify-between gap-6 text-left">
            <div className="space-y-1.5">
              <h3 className="text-2xl sm:text-3xl font-serif font-bold text-hive-cream tracking-tight">
                Your next outfit is closer than you think.
              </h3>
              <p className="text-sm text-hive-cream/60 font-medium">
                Shop fashion. Get it in 90 minutes.
              </p>
            </div>

            <Link
              href="/products"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-hive-cream hover:bg-white text-hive-dark font-bold text-sm transition-all shadow-md shrink-0 active:scale-[0.98] cursor-pointer"
            >
              <span>Shop Hive</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </main>
      </div>
    </CatalogLayout>
  );
}
