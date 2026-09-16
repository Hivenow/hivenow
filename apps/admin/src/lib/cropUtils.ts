/**
 * Canvas-based image cropping utility for the admin panel.
 *
 * Ported from the boutique seller app's ProductForm.tsx cropImage helper,
 * but generalised: accepts an output mime type and quality, and returns
 * a Blob rather than a File so the caller can decide the filename.
 */

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Resolves an image URL so it is safe to load and draw onto a canvas.
 * Remote URLs (such as cdn.hivenow.in or R2) are routed through the local
 * admin /api/proxy-image endpoint to guarantee zero CORS failures.
 */
export function getProxiedImageUrl(srcUrl: string): string {
  if (!srcUrl) return "";
  // Data URLs, Blob URLs, and relative URLs don't need proxying
  if (srcUrl.startsWith("data:") || srcUrl.startsWith("blob:") || srcUrl.startsWith("/")) {
    return srcUrl;
  }
  return `/api/proxy-image?url=${encodeURIComponent(srcUrl)}`;
}

/**
 * Crop a remote or local image using a Canvas 2D context.
 *
 * @param srcUrl         — URL of the source image (R2 CDN, blob:, etc.)
 * @param croppedArea    — pixel coordinates of the crop rectangle
 * @param outputMime     — target MIME type (default: "image/webp")
 * @param quality        — compression quality 0…1 (default: 0.92)
 * @returns              — a Blob of the cropped image
 */
export function cropImageToBlob(
  srcUrl: string,
  croppedArea: CropArea,
  outputMime = "image/webp",
  quality = 0.92
): Promise<Blob> {
  const safeUrl = getProxiedImageUrl(srcUrl);

  return new Promise((resolve, reject) => {
    const img = new Image();
    // Only set crossOrigin if external (not same-origin proxy)
    if (!safeUrl.startsWith("/")) {
      img.crossOrigin = "anonymous";
    }

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not create canvas 2D context"));
        return;
      }

      canvas.width = croppedArea.width;
      canvas.height = croppedArea.height;

      // White fill for JPEGs with transparency
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.drawImage(
        img,
        croppedArea.x,
        croppedArea.y,
        croppedArea.width,
        croppedArea.height,
        0,
        0,
        croppedArea.width,
        croppedArea.height
      );

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Canvas toBlob returned null"));
          }
        },
        outputMime,
        quality
      );
    };

    img.onerror = () => {
      reject(new Error(`Failed to load image: ${srcUrl}`));
    };

    img.src = safeUrl;
  });
}
