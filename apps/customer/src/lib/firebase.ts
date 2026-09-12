// apps/customer/src/lib/firebase.ts
//
// Firebase Auth must NOT be initialized at module scope. This module is imported by client
// components that Next also renders on the server, and initializeAuth runs wherever the module
// is evaluated. Handing it browser-only externs under SSR — browserPopupRedirectResolver in
// particular — throws "INTERNAL ASSERTION FAILED: Expected a class definition" and 500s the
// page. getClientAuth() defers initialization to the browser, where those externs are valid.

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeAuth,
  getAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
} from "firebase/auth";
import type { Auth } from "firebase/auth";
import { authPerfLog } from "./authPerf";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyB1Qn8xKgOA_mYOLfCNZagS9QEMO0u0Ud8",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "hive-fashion.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "hive-fashion",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "hive-fashion.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "455960950280",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:455960950280:web:f4be4436f24cd3828d83bd",
};

// The app itself touches no browser API, so it is safe to create during SSR.
const wasAlreadyInitialized = getApps().length > 0;
export const app = wasAlreadyInitialized ? getApp() : initializeApp(firebaseConfig);
authPerfLog(`Firebase app ${wasAlreadyInitialized ? "reused (already initialized)" : "initialized"}`);

export const googleProvider = new GoogleAuthProvider();

let clientAuth: Auth | null = null;

/** Client-only Auth singleton. Call from event handlers or effects, never during render on the server. */
export function getClientAuth(): Auth {
  if (typeof window === "undefined") {
    throw new Error(
      "[Firebase] getClientAuth() called on the server. Call it from a client event handler or useEffect."
    );
  }

  if (clientAuth) return clientAuth;

  try {
    // popupRedirectResolver is required, not optional: initializeAuth (unlike getAuth) does not
    // supply one, and without it signInWithRedirect and getRedirectResult throw
    // auth/argument-error. Redirect is the sign-in path installed PWAs depend on.
    clientAuth = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    // Already initialized for this app (HMR, double module evaluation) — reuse that instance.
    clientAuth = getAuth(app);
  }

  authPerfLog("Firebase Auth instance ready");
  return clientAuth;
}
