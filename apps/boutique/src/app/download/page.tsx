import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Download Hive Partners App | Hyper-Local Fashion Marketplace",
  description:
    "Download the Hive Partners Android app. Manage orders, inventory, and instant hyperlocal delivery for your fashion boutique, designer label, clothing brand, footwear, or accessories store.",
};

export default function DownloadPage() {
  const apkUrl =
    "https://github.com/Hivenow/hivenow/releases/latest/download/hive-partners.apk";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-amber-50/60 via-white to-amber-50/40 p-6 font-sans">
      <div className="max-w-md w-full text-center space-y-7">

        {/* Logo */}
        <div className="mx-auto w-28 h-28 rounded-[28px] bg-[#F5B800] flex items-center justify-center shadow-xl shadow-amber-300/50 overflow-hidden border border-amber-300/60">
          <img
            src="/logo-icon.png"
            alt="Hive Partners"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Title & Fashion Subtext */}
        <div className="space-y-2.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100/90 border border-amber-300/70 rounded-full text-amber-950 text-xs font-semibold tracking-wide">
            <span>Official Seller & Brand Partner App</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-serif font-black text-slate-900 tracking-tight">
            Hive Partners
          </h1>
          <p className="text-slate-600 text-sm leading-relaxed">
            Manage live orders, catalog, and fast local dispatch — all from one place. Built for fashion boutiques, designer studios, apparel labels, footwear, accessories, and homegrown brands.
          </p>
        </div>

        {/* Categories Pill Strip */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] font-medium text-slate-500">
          <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-full shadow-xs">Boutiques & Studios</span>
          <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-full shadow-xs">Designer Wear</span>
          <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-full shadow-xs">Ethnic & Western</span>
          <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-full shadow-xs">Footwear & Bags</span>
          <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-full shadow-xs">Jewelry & Accessories</span>
        </div>

        {/* Download Button */}
        <a
          href={apkUrl}
          className="inline-flex items-center justify-center gap-3 w-full py-4 px-6 bg-[#F5B800] hover:bg-[#e0a900] text-slate-950 rounded-2xl font-bold text-base shadow-lg shadow-amber-400/30 active:scale-[0.98] transition-all"
        >
          {/* Android icon */}
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M17.523 15.341a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm-9.546 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zM6.35 5.648l-1.386-2.4a.375.375 0 0 1 .651-.375l1.404 2.432A8.955 8.955 0 0 1 12 4.5c1.19 0 2.324.23 3.364.648l1.404-2.432a.375.375 0 1 1 .651.375l-1.386 2.4A9 9 0 0 1 21 13.5H3a9 9 0 0 1 3.35-7.852z"/>
          </svg>
          Download for Android
        </a>

        {/* Install Instructions */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-left space-y-3 shadow-xs">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Quick Installation Guide
          </p>
          <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside">
            <li>Tap &quot;Download for Android&quot; above</li>
            <li>Open the downloaded <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-800">.apk</code> file</li>
            <li>
              If prompted, tap &quot;Settings&quot; → enable &quot;Install from
              this source&quot;
            </li>
            <li>Tap &quot;Install&quot; and log in to manage your fashion store</li>
          </ol>
        </div>

        {/* Version info */}
        <p className="text-xs text-slate-400">
          Android only &middot; Latest Production Build
        </p>
      </div>
    </div>
  );
}
