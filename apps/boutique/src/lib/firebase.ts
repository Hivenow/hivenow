// apps/boutique/src/lib/firebase.ts
// IMPORTANT: This file must NOT initialize Firebase Auth at module level.
// Auth initialization must be deferred to the client only (see getClientAuth()).
// Exporting `auth` directly causes SSR to create a server-side Auth instance
// (no persistence) which poisons the client-side instance via Firebase SDK's
// internal per-app cache, causing auth/argument-error on all popup/redirect ops.

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeAuth,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  GoogleAuthProvider,
} from "firebase/auth";
import type { Auth } from "firebase/auth";

// Falls back to the Firebase-hosted domain only when the env var is missing. It used to also
// reject any value that wasn't *.firebaseapp.com, which silently ignored a custom auth domain
// (auth.hivenow.in) — the configuration Firebase recommends for Safari/ITP redirect flows.
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "hive-fashion.firebaseapp.com";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyB1Qn8xKgOA_mYOLfCNZagS9QEMO0u0Ud8",
  authDomain: authDomain,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "hive-fashion",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "hive-fashion.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "455960950280",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:455960950280:web:f4be4436f24cd3828d83bd",
};

// ── App (SSR-safe singleton) ──────────────────────────────────────────────────
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// ── Google Provider (SSR-safe — no browser APIs used) ────────────────────────
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// ── Client-only Auth singleton ────────────────────────────────────────────────
// NEVER accessed during SSR. Only created when called from a browser context.
let _clientAuth: Auth | null = null;

export function getClientAuth(): Auth {
  if (typeof window === "undefined") {
    // This should never be called server-side — throw loudly so we catch it fast.
    throw new Error(
      "[Firebase] getClientAuth() called on the server. " +
      "Only call this from client-side event handlers or useEffect."
    );
  }

  if (_clientAuth) return _clientAuth;

  try {
    // initializeAuth must be called exactly once per app instance on the client.
    // IMPORTANT: browserPopupRedirectResolver MUST be provided here — without it,
    // signInWithPopup, signInWithRedirect, and getRedirectResult all throw
    // auth/argument-error. getAuth() includes this automatically; initializeAuth() does not.
    _clientAuth = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    // Already initialized (e.g. HMR in dev mode) — retrieve the existing instance.
    _clientAuth = getAuth(app);
  }

  return _clientAuth;
}

// ── Backward-compat export ────────────────────────────────────────────────────
// This is a GETTER — it resolves lazily so SSR never actually reads the value.
// WARNING: Do NOT call this at module scope in any SSR-rendered file.
export const auth = {
  get current(): Auth {
    return getClientAuth();
  },
};
