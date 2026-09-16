import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  try {
    const { userId, sessionClaims } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = (sessionClaims?.metadata as any)?.role || (sessionClaims as any)?.role;
    if (role !== "admin" && role !== "seller") {
      return NextResponse.json(
        { error: "Forbidden: You must be an admin or verified seller to upload files." }, 
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided for upload." }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File exceeds 5MB limit." }, { status: 400 });
    }

    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedMimeTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Only JPEG, PNG, and WEBP are allowed." }, { status: 400 });
    }

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = (process.env.R2_BUCKET_NAME || "hive-media").trim();
    let publicDomain = process.env.NEXT_PUBLIC_R2_PUBLIC_DOMAIN || "https://pub-09a817ec6f384c4997feafc5e8387286.r2.dev";
    if (!publicDomain.startsWith("http://") && !publicDomain.startsWith("https://")) {
      publicDomain = `https://${publicDomain}`;
    }

    if (!accountId || !accessKeyId || !secretAccessKey) {
      return NextResponse.json(
        { 
          error: "Cloudflare R2 credentials missing on server. Set CLOUDFLARE_ACCOUNT_ID (or R2_ACCOUNT_ID), R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY in server environment variables." 
        },
        { status: 400 }
      );
    }

    const R2 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    // Optional prefix: "campaigns" (default), "products", etc.
    const prefix = (formData.get("prefix") as string | null)?.trim() || "campaigns";
    const allowedPrefixes = ["campaigns", "products", "banners", "boutiques"];
    if (!allowedPrefixes.includes(prefix)) {
      return NextResponse.json({ error: `Invalid prefix. Allowed: ${allowedPrefixes.join(", ")}` }, { status: 400 });
    }

    const fileExtension = file.name.split(".").pop() || "jpg";
    const key = `${prefix}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExtension}`;
    const arrayBuffer = await file.arrayBuffer();

    await R2.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: Buffer.from(arrayBuffer),
        ContentType: file.type,
        CacheControl: "public, max-age=31536000",
      })
    );

    const publicUrl = `${publicDomain.replace(/\/$/, "")}/${key}`;

    return NextResponse.json({ success: true, url: publicUrl, objectKey: key });
  } catch (error: any) {
    console.error("R2 Upload Route Failure:", error);
    return NextResponse.json(
      { error: error.message || "Failed to upload file to Cloudflare R2." },
      { status: 500 }
    );
  }
}
