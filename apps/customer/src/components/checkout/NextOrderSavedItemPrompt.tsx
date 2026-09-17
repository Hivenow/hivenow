"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWishlistStore } from "@/store/wishlist-store";

interface NextOrderSavedItemPromptProps {
  orderId: string;
  boutiqueId?: string;
  className?: string;
}

/**
 * One-time card shown right after an order is placed, surfacing the item the shopper saved
 * from the cross-boutique bag-conflict modal while THIS order's boutique was in their bag.
 * "Remind me later" only dismisses this card for the current browser session (sessionStorage) —
 * the underlying wishlist tag is untouched, so the persistent reminder on the wishlist page
 * keeps showing it until the shopper orders it or dismisses it there.
 */
export function NextOrderSavedItemPrompt({ orderId, boutiqueId, className = "" }: NextOrderSavedItemPromptProps) {
  const items = useWishlistStore((s) => s.items);
  const [dismissed, setDismissed] = useState(true);

  const match = boutiqueId
    ? items.find((i) => i.pendingOrderBoutiqueId === boutiqueId)
    : undefined;

  useEffect(() => {
    if (!match) {
      setDismissed(true);
      return;
    }
    try {
      const key = `hive-next-order-dismissed-${orderId}-${match.slug}`;
      setDismissed(sessionStorage.getItem(key) === "1");
    } catch {
      setDismissed(false);
    }
  }, [match, orderId]);

  if (!match || dismissed) return null;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(`hive-next-order-dismissed-${orderId}-${match.slug}`, "1");
    } catch {
      // sessionStorage unavailable — the card simply won't re-suppress this session.
    }
    setDismissed(true);
  };

  return (
    <div className={`rounded-2xl border border-amber-200/70 bg-amber-50/50 p-3.5 flex items-center gap-3 ${className}`}>
      <div className="relative w-12 h-14 rounded-xl overflow-hidden bg-stone-100 border border-stone-200/70 shrink-0">
        {match.imageUrl ? (
          <img src={match.imageUrl} alt={match.name} className="w-full h-full object-cover" />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700 block mb-0.5">
          Saved For Next Order
        </span>
        <p className="text-xs font-semibold text-stone-900 truncate">{match.name}</p>
        <p className="text-[10px] text-stone-500 truncate">{match.boutiqueName}</p>
      </div>
      <div className="flex flex-col gap-1.5 shrink-0 items-stretch">
        <Link
          href={`/products/${match.slug}`}
          className="h-8 px-3 bg-stone-950 hover:bg-stone-900 text-white rounded-lg text-[10.5px] font-bold flex items-center justify-center transition-colors"
        >
          Order now
        </Link>
        <button
          type="button"
          onClick={handleDismiss}
          className="h-6 text-[10px] text-stone-400 hover:text-stone-600 font-medium"
        >
          Remind me later
        </button>
      </div>
    </div>
  );
}
