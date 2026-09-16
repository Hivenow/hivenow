import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

function isAllowedUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    // Block localhost, loopback, private RFC1918 and link-local ranges
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("169.254.") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".local") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  try {
    const { userId, sessionClaims } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = (sessionClaims?.metadata as any)?.role || (sessionClaims as any)?.role;
    if (role !== "admin" && role !== "seller") {
      return NextResponse.json(
        { error: "Forbidden: Admin or seller access required." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get("url");

    if (!targetUrl) {
      return NextResponse.json({ error: "Missing 'url' query parameter." }, { status: 400 });
    }

    if (!isAllowedUrl(targetUrl)) {
      return NextResponse.json({ error: "Disallowed or invalid URL." }, { status: 400 });
    }

    const upstreamResponse = await fetch(targetUrl, {
      headers: {
        Accept: "image/*,*/*;q=0.8",
        "User-Agent": "Hive-Admin-ImageProxy/1.0",
      },
    });

    if (!upstreamResponse.ok) {
      return NextResponse.json(
        { error: `Failed to fetch upstream image: ${upstreamResponse.statusText}` },
        { status: upstreamResponse.status }
      );
    }

    const contentType = upstreamResponse.headers.get("content-type") || "image/jpeg";
    const buffer = await upstreamResponse.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error: any) {
    console.error("[proxy-image] Failed to proxy image:", error);
    return NextResponse.json(
      { error: error.message || "Failed to proxy image." },
      { status: 500 }
    );
  }
}
