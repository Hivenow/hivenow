// apps/boutique/src/context/SellerAuthContext.tsx
"use client";

import React, { createContext, useContext, useCallback } from "react";
import {
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  User,
} from "firebase/auth";
import { getClientAuth, googleProvider } from "@/lib/firebase";
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth";

const GOOGLE_WEB_CLIENT_ID = "455960950280-4j2vtj68vnbn87pk1tcnm5ese67ct869.apps.googleusercontent.com";

/** Detect if running as installed PWA (standalone/fullscreen) */
function isPWA(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

/**
 * Popup failures worth retrying as a redirect. Deliberately excludes
 * auth/popup-closed-by-user and auth/cancelled-popup-request: those mean the partner chose to
 * back out, and navigating them away to Google anyway would override that.
 */
const POPUP_REDIRECT_FALLBACK_CODES = new Set([
  "auth/popup-blocked",
  "auth/operation-not-supported-in-this-environment",
]);

/** Detect if running inside a Capacitor native app (Android/iOS WebView) */
function isCapacitor(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as any).Capacitor?.isNativePlatform?.() || 
         /wv\)/.test(navigator.userAgent) && /Android/.test(navigator.userAgent);
}

interface SellerAuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: (options?: { redirectUrl?: string }) => Promise<void>;
}

const SellerAuthContext = createContext<SellerAuthContextType | null>(null);

export function SellerAuthProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated } = useFirebaseAuth();

  const signInWithGoogle = useCallback(async () => {
    const auth = getClientAuth();

    // 1. Native Capacitor GoogleAuth bridge (Android 1-Tap Account Chooser)
    const cap = typeof window !== "undefined" ? (window as any).Capacitor : null;
    if (cap?.Plugins?.GoogleAuth) {
      try {
        console.log("[SellerAuthContext] Triggering native GoogleAuth plugin");
        const res = await cap.Plugins.GoogleAuth.signIn({
          serverClientId: GOOGLE_WEB_CLIENT_ID,
        });

        if (res?.idToken) {
          console.log("[SellerAuthContext] Native GoogleAuth idToken received, signing in to Firebase");
          const credential = GoogleAuthProvider.credential(res.idToken);
          await signInWithCredential(auth, credential);
          return;
        }
        throw new Error("No ID token returned from Google Sign-In");
      } catch (err: any) {
        console.error("[SellerAuthContext] Native GoogleAuth error:", err);
        if (
          err?.code === "auth/popup-closed-by-user" ||
          err?.message?.includes("cancelled") ||
          err?.message?.includes("12501")
        ) {
          const cancelErr: any = new Error("Sign-in was cancelled.");
          cancelErr.code = "auth/popup-closed-by-user";
          throw cancelErr;
        }
        throw err;
      }
    }

    // 2. Installed PWA -> redirect. A popup opened from an installed app lands in a context
    // whose storage this app cannot read — its own cookie container on iOS, a Custom Tab on
    // Android — so the session arrives somewhere invisible and the partner appears never to
    // have signed in. Redirect keeps the whole flow in the app's own storage; the return leg
    // is completed by getRedirectResult on the sign-in page.
    if (isPWA()) {
      await signInWithRedirect(auth, googleProvider);
      return;
    }

    // 3. Normal browser tab -> popup, with redirect as the fallback when the browser refuses it.
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      if (err?.code && POPUP_REDIRECT_FALLBACK_CODES.has(err.code)) {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      throw err;
    }
  }, []);

  const signOut = useCallback(async (options?: { redirectUrl?: string }) => {
    const cap = typeof window !== "undefined" ? (window as any).Capacitor : null;
    if (cap?.Plugins?.GoogleAuth) {
      try {
        await cap.Plugins.GoogleAuth.signOut();
      } catch (e) {
        console.warn("[SellerAuthContext] Native GoogleAuth signOut failed:", e);
      }
    }

    await firebaseSignOut(getClientAuth());
    const redirect = options?.redirectUrl ?? "/sign-in";
    window.location.href = redirect;
  }, []);

  return (
    <SellerAuthContext.Provider
      value={{ user, isLoading, isAuthenticated, signInWithGoogle, signOut }}
    >
      {children}
    </SellerAuthContext.Provider>
  );
}

export function useSellerAuth(): SellerAuthContextType {
  const ctx = useContext(SellerAuthContext);
  if (!ctx) throw new Error("useSellerAuth must be used inside SellerAuthProvider");
  return ctx;
}

