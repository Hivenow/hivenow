"use client";

import React, { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { Modal } from "@hive/ui";
import { Star, Loader2, Check } from "lucide-react";
import { toast } from "@hive/utils";
import { useSessionStore } from "@/context/SessionContext";
import { getCustomerErrorMessage } from "@/lib/customerErrors";

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: Id<"orders">;
  orderItemId: Id<"orderItems">;
  productName: string;
  productImage?: string;
  onSuccess?: () => void;
}

const SENTIMENT_LABELS: Record<number, string> = {
  5: "Excellent",
  4: "Good",
  3: "Okay",
  2: "Not great",
  1: "Poor",
};

const FIT_OPTIONS = [
  { id: "too_small", label: "Runs small" },
  { id: "perfect_fit", label: "True to size" },
  { id: "too_large", label: "Runs large" },
] as const;

export function ReviewModal({
  isOpen,
  onClose,
  orderId,
  orderItemId,
  productName,
  productImage,
  onSuccess,
}: ReviewModalProps) {
  const submitReview = useMutation(api.reviews.submitOrderReview);
  const { token } = useSessionStore();

  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [platformRating, setPlatformRating] = useState<number | null>(null);
  const [hoverPlatformRating, setHoverPlatformRating] = useState<number | null>(null);
  const [reviewText, setReviewText] = useState<string>("");
  const [fitResponse, setFitResponse] = useState<"too_small" | "perfect_fit" | "too_large">("perfect_fit");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await submitReview({
        orderId,
        orderItemId,
        rating,
        platformRating: platformRating ?? undefined,
        reviewText: reviewText.trim() || undefined,
        fitResponse,
        token: token || undefined,
      });

      toast.success("Thanks for the feedback. Your review helps the next shopper choose better.");
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      // Preserve customer-sanitized error handling exactly
      console.error("Failed to submit review:", err);
      toast.error(getCustomerErrorMessage(err, "We couldn't submit your review. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const currentDisplayRating = hoverRating ?? rating;
  const currentDisplayPlatformRating = hoverPlatformRating ?? platformRating;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Rate & Review"
      className="max-w-md w-full bg-white font-sans rounded-3xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Compact Item Header */}
        <div className="flex items-center gap-3 p-2.5 bg-stone-50 rounded-2xl border border-stone-200/70">
          {productImage ? (
            <img
              src={productImage}
              alt={productName}
              className="w-12 h-12 object-cover rounded-xl border border-stone-200 flex-shrink-0"
            />
          ) : (
            <div className="w-12 h-12 bg-stone-200 rounded-xl flex items-center justify-center text-stone-500 font-bold text-xs flex-shrink-0">
              Item
            </div>
          )}
          <div className="flex flex-col min-w-0 leading-tight">
            <h4 className="text-xs sm:text-sm font-bold text-stone-900 truncate">{productName}</h4>
            <div className="flex items-center gap-1 mt-1 text-[11px] font-medium text-stone-500">
              <Check className="w-3 h-3 text-stone-600 stroke-[2.5]" />
              <span>Delivered · Verified purchase</span>
            </div>
          </div>
        </div>

        {/* 1. Product Quality (Required) */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-stone-800">
            Product quality <span className="text-amber-600">*</span>
          </label>
          <div className="flex items-center gap-1">
            <div className="flex items-center -ml-1.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(null)}
                  className="w-10 h-10 flex items-center justify-center focus:outline-none cursor-pointer rounded-lg hover:bg-stone-50 active:scale-95 transition-transform"
                  aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
                >
                  <Star
                    className={`w-6 h-6 transition-colors ${
                      star <= currentDisplayRating
                        ? "fill-hive-amber text-hive-amber"
                        : "fill-stone-100 text-stone-300"
                    }`}
                  />
                </button>
              ))}
            </div>
            <span className="ml-2 text-xs font-semibold text-stone-700">
              {SENTIMENT_LABELS[currentDisplayRating] ?? "Good"}
            </span>
          </div>
        </div>

        {/* 2. Delivery & Packaging (Optional) */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-stone-800">
              Delivery & packaging
            </label>
            <span className="text-[11px] text-stone-600 font-normal">Optional</span>
          </div>
          <div className="flex items-center -ml-1.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setPlatformRating(star)}
                onMouseEnter={() => setHoverPlatformRating(star)}
                onMouseLeave={() => setHoverPlatformRating(null)}
                className="w-10 h-10 flex items-center justify-center focus:outline-none cursor-pointer rounded-lg hover:bg-stone-50 active:scale-95 transition-transform"
                aria-label={`Rate delivery ${star} star${star > 1 ? "s" : ""}`}
              >
                <Star
                  className={`w-5 h-5 transition-colors ${
                    currentDisplayPlatformRating !== null && star <= currentDisplayPlatformRating
                      ? "fill-hive-amber text-hive-amber"
                      : "fill-stone-100 text-stone-300"
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        {/* 3. Sizing & Fit */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-stone-800">
            How was the fit?
          </label>
          <div className="grid grid-cols-3 gap-2">
            {FIT_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFitResponse(option.id)}
                className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  fitResponse === option.id
                    ? "bg-stone-950 border-stone-950 text-white shadow-2xs"
                    : "bg-stone-50 border-stone-200/90 text-stone-700 hover:bg-stone-100"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* 4. Written Review (Optional) */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="review-text" className="text-xs font-semibold text-stone-800">
              Anything you&apos;d like to share?
            </label>
            <span className="text-[11px] text-stone-600 font-normal">Optional</span>
          </div>
          <textarea
            id="review-text"
            rows={3}
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="Tell other shoppers about the fabric, fit or overall experience..."
            className="w-full p-3 border border-stone-200 rounded-xl text-xs text-stone-900 placeholder:text-stone-600 focus:outline-none focus:border-stone-400 focus:ring-1 focus:ring-stone-200 bg-stone-50/50 resize-none leading-relaxed"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-xs font-semibold text-stone-500 hover:text-stone-900 active:scale-[0.98] transition-all rounded-xl cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2.5 bg-stone-950 hover:bg-stone-900 active:scale-[0.98] text-white font-semibold rounded-xl text-xs shadow-2xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                <span>Submitting...</span>
              </>
            ) : (
              <span>Submit review</span>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

