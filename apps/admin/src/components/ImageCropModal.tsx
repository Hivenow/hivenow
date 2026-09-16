"use client";

import React, { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import { useMutation } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { Button } from "@hive/ui";
import {
  X,
  Crop,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Loader2,
  Check,
  AlertTriangle,
} from "lucide-react";
import { cropImageToBlob, type CropArea } from "@/lib/cropUtils";

// ── Aspect ratio presets ────────────────────────────────────────────────────

interface AspectPreset {
  label: string;
  value: number | undefined; // undefined = freeform
  description: string;
}

const ASPECT_PRESETS: AspectPreset[] = [
  { label: "3:4", value: 3 / 4, description: "PDP Gallery" },
  { label: "4:5", value: 4 / 5, description: "Product Card" },
  { label: "1:1", value: 1, description: "Square" },
  { label: "Free", value: undefined, description: "Freeform" },
];

// ── Component Props ─────────────────────────────────────────────────────────

interface ImageCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  imageIndex: number;
  productId: string;
  productName: string;
  /** Called after a successful crop + replace to refresh the parent */
  onCropComplete?: (newUrl?: string, index?: number) => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function ImageCropModal({
  isOpen,
  onClose,
  imageUrl,
  imageIndex,
  productId,
  productName,
  onCropComplete,
}: ImageCropModalProps) {
  // Crop state
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(null);
  const [aspectIndex, setAspectIndex] = useState(0); // default: 3:4

  // Processing state
  const [status, setStatus] = useState<"idle" | "cropping" | "uploading" | "replacing" | "done" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // Convex mutation
  const replaceImage = useMutation(api.adminProducts.replaceProductImageAdmin);

  const currentAspect: AspectPreset = ASPECT_PRESETS[aspectIndex] ?? (ASPECT_PRESETS[0] as AspectPreset);

  const onCropChange = useCallback((c: { x: number; y: number }) => setCrop(c), []);
  const onZoomChange = useCallback((z: number) => setZoom(z), []);

  const onCropAreaComplete = useCallback(
    (_croppedArea: any, croppedAreaPx: CropArea) => {
      setCroppedAreaPixels(croppedAreaPx);
    },
    []
  );

  // ── Apply crop pipeline ─────────────────────────────────────────────────

  const handleApplyCrop = async () => {
    if (!croppedAreaPixels) return;

    try {
      // 1. Crop the image client-side
      setStatus("cropping");
      const blob = await cropImageToBlob(imageUrl, croppedAreaPixels, "image/webp", 0.92);

      // 2. Upload to R2 via admin route
      setStatus("uploading");
      const formData = new FormData();
      formData.append("file", new File([blob], `cropped-${Date.now()}.webp`, { type: "image/webp" }));
      formData.append("prefix", "products");

      const uploadRes = await fetch("/api/upload/r2", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error || "Upload failed");
      }

      const { url: publicUrl, objectKey } = await uploadRes.json();

      // 3. Replace the image in Convex
      setStatus("replacing");
      await replaceImage({
        productId: productId as Id<"products">,
        imageIndex,
        newImage: publicUrl,
      });

      setStatus("done");

      // Notify parent after a brief success animation
      setTimeout(() => {
        onCropComplete?.(publicUrl, imageIndex);
        handleClose();
      }, 800);
    } catch (err: any) {
      console.error("[ImageCropModal] Crop failed:", err);
      setErrorMessage(err.message || "An error occurred while cropping");
      setStatus("error");
    }
  };

  // ── Reset & close ───────────────────────────────────────────────────────

  const handleClose = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setCroppedAreaPixels(null);
    setAspectIndex(0);
    setStatus("idle");
    setErrorMessage("");
    onClose();
  };

  if (!isOpen) return null;

  const isProcessing = status === "cropping" || status === "uploading" || status === "replacing";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl mx-4 bg-white rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden border border-stone-200/50">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="h-14 px-6 flex items-center justify-between border-b border-stone-100 bg-[#FCFAF8] shrink-0">
          <div className="flex items-center gap-3">
            <Crop className="w-4.5 h-4.5 text-amber-700" />
            <div>
              <h3 className="text-sm font-serif font-bold text-stone-900">
                Crop Image
              </h3>
              <p className="text-[10px] text-stone-400 font-medium">
                {productName} — Image {imageIndex + 1}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isProcessing}
            className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400 hover:text-stone-700 transition-colors disabled:opacity-50"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <div className="flex-1 flex min-h-0">
          {/* Crop area */}
          <div className="flex-1 relative bg-stone-950 min-h-[400px]">
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={currentAspect?.value}
              onCropChange={onCropChange}
              onZoomChange={onZoomChange}
              onCropComplete={onCropAreaComplete}
              cropShape="rect"
              showGrid={true}
              style={{
                containerStyle: { borderRadius: 0 },
                cropAreaStyle: {
                  border: "2px solid rgba(255,255,255,0.85)",
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
                },
              }}
            />
          </div>

          {/* Control sidebar */}
          <div className="w-64 border-l border-stone-100 bg-[#FDFBF9] flex flex-col shrink-0">
            {/* Aspect ratio presets */}
            <div className="p-4 border-b border-stone-100">
              <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-2.5">
                Aspect Ratio
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {ASPECT_PRESETS.map((preset, idx) => (
                  <button
                    key={preset.label}
                    onClick={() => setAspectIndex(idx)}
                    disabled={isProcessing}
                    className={`py-2 px-2.5 rounded-xl text-center transition-all ${
                      aspectIndex === idx
                        ? "bg-stone-900 text-white shadow-sm"
                        : "bg-white border border-stone-200 text-stone-700 hover:bg-stone-50"
                    }`}
                  >
                    <span className="text-xs font-bold block">{preset.label}</span>
                    <span className="text-[9px] opacity-70">{preset.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Zoom control */}
            <div className="p-4 border-b border-stone-100">
              <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-2.5">
                Zoom
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setZoom(Math.max(1, zoom - 0.1))}
                  disabled={isProcessing}
                  className="p-1.5 rounded-lg bg-white border border-stone-200 hover:bg-stone-50 transition-colors text-stone-600 disabled:opacity-50"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  disabled={isProcessing}
                  className="flex-1 h-1.5 bg-stone-200 rounded-full appearance-none cursor-pointer accent-stone-900 disabled:opacity-50"
                />
                <button
                  onClick={() => setZoom(Math.min(3, zoom + 0.1))}
                  disabled={isProcessing}
                  className="p-1.5 rounded-lg bg-white border border-stone-200 hover:bg-stone-50 transition-colors text-stone-600 disabled:opacity-50"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[10px] text-stone-400 text-center mt-1">{zoom.toFixed(1)}×</p>
            </div>

            {/* Rotation control */}
            <div className="p-4 border-b border-stone-100">
              <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-2.5">
                Rotation
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRotation((rotation - 90 + 360) % 360)}
                  disabled={isProcessing}
                  className="p-1.5 rounded-lg bg-white border border-stone-200 hover:bg-stone-50 transition-colors text-stone-600 disabled:opacity-50"
                >
                  <RotateCw className="w-3.5 h-3.5 -scale-x-100" />
                </button>
                <input
                  type="range"
                  min={0}
                  max={360}
                  step={1}
                  value={rotation}
                  onChange={(e) => setRotation(Number(e.target.value))}
                  disabled={isProcessing}
                  className="flex-1 h-1.5 bg-stone-200 rounded-full appearance-none cursor-pointer accent-stone-900 disabled:opacity-50"
                />
                <button
                  onClick={() => setRotation((rotation + 90) % 360)}
                  disabled={isProcessing}
                  className="p-1.5 rounded-lg bg-white border border-stone-200 hover:bg-stone-50 transition-colors text-stone-600 disabled:opacity-50"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[10px] text-stone-400 text-center mt-1">{rotation}°</p>
            </div>

            {/* Status / Actions */}
            <div className="p-4 mt-auto">
              {/* Error display */}
              {status === "error" && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl mb-3">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-red-700 font-medium">{errorMessage}</p>
                </div>
              )}

              {/* Success display */}
              {status === "done" && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl mb-3">
                  <Check className="w-4 h-4 text-green-600" />
                  <p className="text-[11px] text-green-700 font-bold">Image replaced successfully!</p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-col gap-2">
                <Button
                  onClick={handleApplyCrop}
                  disabled={isProcessing || !croppedAreaPixels || status === "done"}
                  className="w-full h-10 text-xs font-bold text-white bg-[#C59A5B] hover:bg-[#C59A5B]/90 rounded-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-sm"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {status === "cropping" && "Cropping..."}
                      {status === "uploading" && "Uploading..."}
                      {status === "replacing" && "Saving..."}
                    </>
                  ) : status === "done" ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Done
                    </>
                  ) : (
                    <>
                      <Crop className="w-3.5 h-3.5" />
                      Apply Crop & Replace
                    </>
                  )}
                </Button>

                {status === "error" && (
                  <Button
                    onClick={() => { setStatus("idle"); setErrorMessage(""); }}
                    variant="outline"
                    className="w-full h-9 text-xs font-bold text-stone-600 rounded-xl cursor-pointer"
                  >
                    Try Again
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
