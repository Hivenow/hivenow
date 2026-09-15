import { action, internalAction, mutation, internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getAuthenticatedUser } from "../lib/auth";
import { getR2Client } from "./client";
import { checkRateLimit } from "../lib/rateLimit";
import { mediaLogger } from "./logger";
import { internal } from "../_generated/api";
import { ImageAsset } from "../schema";




// Public image URL construction lives in ./urls, which has no dependencies, so
// modules that only need to build a URL don't pull in the S3 client below.
// Re-exported here because ~20 call sites already import it from this module.
export { getPublicUrl } from "./urls";
export type { ImageVariant } from "./urls";

/**
 * Generate a secure presigned upload URL for Cloudflare R2.
 */
export const generateUploadUrl = action({
  args: {
    token: v.optional(v.string()),
    mimeType: v.string(),
    fileSize: v.number(),
    ownerType: v.string(),
    ownerId: v.string(),
    context: v.string(), // e.g., "boutique_logo"
  },
  handler: async (ctx, args) => {
    const user = await ctx.runMutation(internal.media.api.checkAuthAndRateLimit, {
      token: args.token,
      actionName: "media_upload",
    });

    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/avif", "application/pdf"];
    if (!allowedMimeTypes.includes(args.mimeType)) {
      throw new Error("Unsupported file type. Allowed types: jpeg, png, webp, avif, pdf.");
    }
    
    if (args.mimeType.includes("svg") || args.mimeType.includes("html")) {
      throw new Error("SVGs and HTML files are strictly prohibited for security reasons.");
    }

    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (args.fileSize > MAX_SIZE) {
      throw new Error("File exceeds the 10MB maximum limit.");
    }

    const bucket = (process.env.R2_BUCKET_NAME || "hive-media").trim();
    const uuid = crypto.randomUUID();
    const version = "v1";
    const extension = args.mimeType.split("/")[1] || "bin";
    const objectKey = `${args.context}s/${uuid}/${version}/original.${extension}`;

    const client = getR2Client();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: args.mimeType,
      ContentLength: args.fileSize,
    });

    const presignedUrl = await getSignedUrl(client, command, { expiresIn: 300 });

    // Track the session in the database
    await ctx.runMutation(internal.media.api.createUploadSession, {
      sessionId: uuid,
      userId: user._id,
      ownerType: args.ownerType,
      ownerId: args.ownerId,
      assetType: args.context,
      objectKey,
      provider: "cloudflare-r2",
      bucket,
      mime: args.mimeType,
      size: args.fileSize,
      expiresAt: Date.now() + 300 * 1000,
    });

    mediaLogger.info("Upload Started", { userId: user._id, objectKey, mime: args.mimeType });

    return {
      presignedUrl,
      sessionId: uuid,
      assetData: {
        assetId: uuid,
        ownerType: args.ownerType,
        ownerId: args.ownerId,
        storageProvider: "cloudflare-r2",
        bucket,
        objectKey,
        mime: args.mimeType,
        size: args.fileSize,
      }
    };
  },
});



export const createUploadSession = internalMutation({
  args: {
    sessionId: v.string(),
    userId: v.id("users"),
    ownerType: v.string(),
    ownerId: v.string(),
    assetType: v.string(),
    objectKey: v.string(),
    provider: v.string(),
    bucket: v.string(),
    mime: v.string(),
    size: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("uploadSessions", {
      ...args,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

/**
 * Commits an upload session, verifying the object exists in R2 with the exact constraints.
 */
export const commitUpload = action({
  args: {
    sessionId: v.string(),
    token: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const user = await ctx.runMutation(internal.media.api.checkAuthAndRateLimit, {
      token: args.token,
      actionName: "media_commit",
    });

    // Fetch the session
    const session = await ctx.runQuery(internal.media.api.getUploadSession, { sessionId: args.sessionId });
    if (!session) throw new Error("Upload session not found.");
    if (session.userId !== user._id) throw new Error("Unauthorized: Session belongs to another user.");

    if (session.status === "committed") {
      // Idempotency: Return early if already committed
      mediaLogger.info("Upload already committed, returning idempotently", { sessionId: args.sessionId });
      return buildImageAsset(session);
    }
    if (session.status === "failed") {
      throw new Error("Upload session failed and cannot be committed.");
    }

    const client = getR2Client();
    try {
      let contentHash: string | undefined;
      // Skip actual R2 API checks in local dev without credentials
      if (!process.env.R2_ACCESS_KEY_ID) {
        mediaLogger.info("Skipping R2 HeadObject check for local dev mock client");
      } else {
        const headCmd = new HeadObjectCommand({ Bucket: session.bucket, Key: session.objectKey });
        const headResult = await client.send(headCmd);

        if (headResult.ContentLength !== session.size || headResult.ContentType !== session.mime) {
          throw new Error("File metadata mismatch. Possible bypass detected.");
        }

        // Defense in depth: Magic Byte Sniffing
        const getCmd = new GetObjectCommand({
          Bucket: session.bucket,
          Key: session.objectKey,
          Range: "bytes=0-11" // Fetch first 12 bytes
        });
        const getResult = await client.send(getCmd);
        const bytes = await getResult.Body?.transformToByteArray();
        if (!bytes || !verifyMagicBytes(bytes, session.mime)) {
          throw new Error("Invalid file signature. Potential polyglot detected.");
        }

        contentHash = headResult.ETag ? headResult.ETag.replace(/"/g, "") : undefined;
      }

      await ctx.runMutation(internal.media.api.markSessionCommitted, {
        id: session._id,
        contentHash,
      });

      mediaLogger.info("Upload Committed", { sessionId: args.sessionId, objectKey: session.objectKey });
      
      const updatedSession = { ...session, contentHash };
      return buildImageAsset(updatedSession as any);
    } catch (err: any) {
      mediaLogger.error("Commit Failed or Verification Failed", err, { sessionId: args.sessionId });
      
      await ctx.runMutation(internal.media.api.markSessionFailed, { id: session._id });
      
      // Cleanup fraudulent or broken object
      try {
        await client.send(new DeleteObjectCommand({ Bucket: session.bucket, Key: session.objectKey }));
        mediaLogger.info("Cleaned up fraudulent object during commit", { objectKey: session.objectKey });
      } catch (e) {
        // Ignore delete errors here, cron will catch it later if it exists
      }
      
      throw new Error("Failed to verify upload on edge server.");
    }
  },
});

function buildImageAsset(session: any) {
  return {
    assetId: session.sessionId,
    ownerType: session.ownerType,
    ownerId: session.ownerId,
    storageProvider: session.provider,
    bucket: session.bucket,
    objectKey: session.objectKey,
    mime: session.mime,
    size: session.size,
    contentHash: session.contentHash,
    status: "ready" as const,
    displayOrder: 0,
    width: 0,
    height: 0,
    uploadedAt: session.committedAt || Date.now(),
  };
}



export const getUploadSession = internalQuery({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("uploadSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();
  },
});

export const checkAuthAndRateLimit = internalMutation({
  args: { token: v.optional(v.string()), actionName: v.string() },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);
    // Bumped to 60/hour to support multi-image product listing flows and admin uploads
    await checkRateLimit(ctx, `${args.actionName}:${user._id}`, 60, 3600000);
    return user;
  }
});

export const markSessionCommitted = internalMutation({
  args: { id: v.id("uploadSessions"), contentHash: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "committed",
      committedAt: Date.now(),
      contentHash: args.contentHash,
    });
  },
});

export const markSessionFailed = internalMutation({
  args: { id: v.id("uploadSessions") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "failed",
    });
  },
});

/**
 * Validates the file signature (magic bytes) against the declared MIME type.
 */
function verifyMagicBytes(bytes: Uint8Array, mime: string): boolean {
  if (bytes.length < 4) return false;
  
  if (mime === "image/jpeg" || mime === "image/jpg") {
    return bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
  }
  if (mime === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
  }
  if (mime === "image/webp") {
    // RIFF....WEBP
    return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
           bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  }
  if (mime === "image/avif") {
    // ....ftypavif
    return bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70 &&
           bytes[8] === 0x61 && bytes[9] === 0x76 && bytes[10] === 0x69 && bytes[11] === 0x66;
  }
  if (mime === "application/pdf") {
    // %PDF
    return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  }
  
  return false;
}

// ─── R2 Object Deletion ─────────────────────────────────────────────────────

/**
 * Extracts R2 objectKeys from a mixed array of strings and ImageAsset objects.
 * Skips plain URLs (http/https) and legacy Convex storage IDs.
 */
export function extractR2ObjectKeys(images: any[]): string[] {
  const keys: string[] = [];
  for (const img of images) {
    if (img && typeof img === "object" && img.objectKey) {
      keys.push(img.objectKey);
    }
  }
  return keys;
}

/**
 * Delete one or more objects from Cloudflare R2.
 *
 * Internal only. It takes arbitrary object keys and does no ownership check, and keys are
 * readable from public cdn.hivenow.in URLs — as a public action any signed-in account could
 * wipe the bucket. Callers must authorize first and derive the keys server-side from records
 * they are allowed to delete, then schedule this (see adminProducts.deleteProductAdmin).
 * Silently skips objects that don't exist (R2 returns 204 for missing keys).
 */
export const deleteR2Objects = internalAction({
  args: {
    objectKeys: v.array(v.string()),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.objectKeys.length === 0) return { deleted: 0 };

    const client = getR2Client();
    const bucket = (process.env.R2_BUCKET_NAME || "hive-media").trim();
    let deleted = 0;

    for (const key of args.objectKeys) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        deleted++;
        mediaLogger.info("Deleted R2 object", { objectKey: key, userId: args.actorId });
      } catch (err: any) {
        mediaLogger.error("Failed to delete R2 object", err, { objectKey: key });
      }
    }

    return { deleted };
  },
});
