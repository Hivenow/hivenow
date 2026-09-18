import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MapPin, Truck, Clock, ArrowRight, ChevronRight, Zap, ShieldCheck, ShoppingBag, Store } from "lucide-react";
import { KOCHI_LOCATIONS } from "@/lib/locations";
import { SITE_URL } from "@/lib/seo";
import { BreadcrumbSchema } from "@/components/seo/BreadcrumbSchema";

interface Props {
  params: Promise<{ area: string }>;
}

export async function generateStaticParams() {
  return Object.keys(KOCHI_LOCATIONS).map((area) => ({
    area,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { area } = await params;
  const location = KOCHI_LOCATIONS[area];

  if (!location) {
    return {
      title: "Location Not Found",
    };
  }

  const url = `${SITE_URL}/locations/${location.slug}`;

  return {
    title: {
      absolute: location.metaTitle,
    },
    description: location.metaDescription,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: location.metaTitle,
      description: location.metaDescription,
      url,
      siteName: "Hive",
      type: "website",
      images: [
        {
          url: `${SITE_URL}/icon-512x512.png`,
          width: 1200,
          height: 630,
          alt: location.metaTitle,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: location.metaTitle,
      description: location.metaDescription,
      images: [`${SITE_URL}/icon-512x512.png`],
    },
  };
}

export default async function LocationPage({ params }: Props) {
  const { area } = await params;
  const location = KOCHI_LOCATIONS[area];

  if (!location) {
    notFound();
  }

  // Schema.org Structured Data
  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": `Hive — ${location.name}`,
    "image": `${SITE_URL}/logo.png`,
    "@id": `${SITE_URL}/locations/${location.slug}`,
    "url": `${SITE_URL}/locations/${location.slug}`,
    "telephone": "+917356019103",
    "priceRange": "$$",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "55/4379, Door No. 3623, Valanjambalam Junction, Kochi M.G. Road",
      "addressLocality": location.name,
      "addressRegion": "Kerala",
      "postalCode": "682016",
      "addressCountry": "IN"
    },
    "geo": location.geo ? {
      "@type": "GeoCoordinates",
      "latitude": location.geo.latitude,
      "longitude": location.geo.longitude,
    } : undefined,
    "description": location.metaDescription
  };

  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    "serviceType": "Hyperlocal Fashion Delivery",
    "provider": {
      "@type": "LocalBusiness",
      "name": "Hive",
      "url": SITE_URL
    },
    "areaServed": {
      "@type": "AdministrativeArea",
      "name": location.name
    },
    "description": `Fast same-day delivery of premium fashion from local brands and stores directly to your doorstep in ${location.name}.`
  };

  return (
    <>
      {/* Structured Data Scripts */}
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "/" },
          { name: "Locations", url: "/locations" },
          { name: location.name, url: `/locations/${location.slug}` },
        ]}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }}
      />

      <div className="min-h-screen bg-hive-cream/30 dark:bg-neutral-950 text-slate-900 dark:text-slate-100 font-sans pb-20 select-none">
        
        {/* Header/Breadcrumbs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <nav className="flex items-center gap-2 text-xs font-semibold text-hive-text-muted dark:text-neutral-400">
            <Link href="/" className="hover:text-hive-dark dark:hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="text-slate-400 dark:text-neutral-500">Locations</span>
            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="text-hive-dark dark:text-white font-extrabold">{location.name}</span>
          </nav>
        </div>

        {/* Hero Section */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
          <div className="relative rounded-3xl overflow-hidden bg-hive-dark text-hive-cream p-8 md:p-12 shadow-xl border border-hive-border/20 flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
            <div className="absolute inset-0 bg-gradient-to-br from-black/40 via-transparent to-black/20 pointer-events-none" />
            
            <div className="relative z-10 max-w-2xl space-y-4 text-left">
              {/* Region Pill */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-hive-comb/10 border border-hive-gold/30 text-[10px] uppercase tracking-wider text-hive-gold font-extrabold">
                <MapPin className="w-3 h-3 text-hive-gold" />
                <span>Serving {location.name}, {location.district}</span>
              </div>

              {/* Title & Tagline */}
              <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight leading-tight text-white">
                {location.heroHeader}
              </h1>
              <p className="text-sm md:text-base text-hive-cream/80 max-w-xl font-medium leading-relaxed">
                {location.tagline}
              </p>

              {/* Delivery Badges */}
              <div className="flex flex-wrap gap-3 pt-2">
                <div className="flex items-center gap-1.5 bg-hive-comb/10 border border-hive-border/20 px-3 py-1.5 rounded-xl text-xs font-bold text-hive-gold">
                  <Clock className="w-4 h-4 text-hive-gold" />
                  <span>Delivery {location.avgDeliveryTime}</span>
                </div>
                <div className="flex items-center gap-1.5 bg-hive-comb/10 border border-hive-border/20 px-3 py-1.5 rounded-xl text-xs font-bold text-hive-gold">
                  <Truck className="w-4 h-4 text-hive-gold" />
                  <span>Real-time Tracking</span>
                </div>
              </div>
            </div>

            {/* Badge Icon Graphic */}
            <div className="relative z-10 hidden lg:block bg-hive-comb/5 border border-hive-border/10 rounded-2xl p-6 shadow-2xl backdrop-blur-sm">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-16 h-16 rounded-full bg-hive-gold/15 flex items-center justify-center border border-hive-gold/30">
                  <Zap className="w-8 h-8 text-hive-gold" />
                </div>
                <div>
                  <h3 className="text-sm font-serif font-bold text-white">Hyperlocal Speed</h3>
                  <p className="text-[10px] text-hive-cream/60 max-w-[150px] mt-1">Direct deliveries from local fashion brands and stores to your door.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Information Grid */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Card 1: Landmarks We Serve */}
          <div className="bg-white dark:bg-neutral-900 border border-hive-border/40 dark:border-neutral-800/80 rounded-3xl p-6 shadow-sm text-left space-y-4">
            <div className="flex items-center gap-2 border-b border-hive-border/30 dark:border-neutral-800/60 pb-3">
              <MapPin className="w-5 h-5 text-hive-gold" />
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-hive-dark dark:text-white">Areas We Serve</h2>
            </div>
            <p className="text-xs text-hive-text-muted dark:text-neutral-400 leading-relaxed font-medium">
              We offer instant delivery within hours to all primary residential complexes, commercial zones, and major landmarks in {location.name}:
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              {location.landmarks.map((landmark) => (
                <span
                  key={landmark}
                  className="text-[11px] font-bold text-hive-dark dark:text-neutral-200 bg-hive-cream dark:bg-neutral-800 border border-hive-border/40 dark:border-neutral-750 px-3 py-1.5 rounded-xl shadow-xs"
                >
                  {landmark}
                </span>
              ))}
            </div>
          </div>

          {/* Card 2: Why Choose Hive Delivery */}
          <div className="bg-white dark:bg-neutral-900 border border-hive-border/40 dark:border-neutral-800/80 rounded-3xl p-6 shadow-sm text-left space-y-4">
            <div className="flex items-center gap-2 border-b border-hive-border/30 dark:border-neutral-800/60 pb-3">
              <ShieldCheck className="w-5 h-5 text-hive-gold" />
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-hive-dark dark:text-white">Why Shop on Hive?</h2>
            </div>
            <ul className="space-y-3.5 pt-1">
              <li className="flex items-start gap-2.5">
                <Store className="w-4 h-4 text-hive-gold flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-hive-dark dark:text-white">Local Brands & Stores</h4>
                  <p className="text-[10px] text-hive-text-muted dark:text-neutral-400 mt-0.5 leading-relaxed">Shop authentic pieces from top-rated local brands and stores.</p>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <Truck className="w-4 h-4 text-hive-gold flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-hive-dark dark:text-white">Instant Fulfillment</h4>
                  <p className="text-[10px] text-hive-text-muted dark:text-neutral-400 mt-0.5 leading-relaxed">Orders are dispatched directly from the store with zero transit delays.</p>
                </div>
              </li>
            </ul>
          </div>

          {/* Card 3: Interactive CTA / Browse Collections */}
          <div className="bg-white dark:bg-neutral-900 border border-hive-border/40 dark:border-neutral-800/80 rounded-3xl p-6 shadow-sm text-left flex flex-col justify-between space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2 border-b border-hive-border/30 dark:border-neutral-800/60 pb-3">
                <ShoppingBag className="w-5 h-5 text-hive-gold" />
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-hive-dark dark:text-white">Browse Fashion</h2>
              </div>
              <p className="text-xs text-hive-text-muted dark:text-neutral-400 leading-relaxed font-medium">
                Explore designer kurtis, modern co-ords, traditional sarees, and premium menswear from Kochi&apos;s finest stores, delivered in hours.
              </p>
            </div>
            
            <Link
              href="/products"
              className="w-full h-12 bg-hive-gold hover:bg-hive-amber text-hive-dark font-extrabold uppercase tracking-widest text-[11px] rounded-2xl flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all duration-200 select-none cursor-pointer"
            >
              <span>Explore Products</span>
              <ArrowRight className="w-4 h-4 text-hive-dark" />
            </Link>
          </div>

        </div>

      </div>
    </>
  );
}
