"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth";
import { getClientAuth, googleProvider } from "@/lib/firebase";
import { signInWithPopup, signInWithRedirect, getRedirectResult, signOut, browserPopupRedirectResolver } from "firebase/auth";
import { authPerfLog, logAuthFlowTotalOnce } from "@/lib/authPerf";
import { safeGetItem, safeSetItem, safeRemoveItem } from "@/lib/safeStorage";

export interface SessionUser {
  /**
   * Typed as the users-table id rather than a bare string: this comes straight
   * from `api.auth.getMe`, and callers passing it back into Convex (push
   * subscriptions, account queries) need the branded type or they have to cast.
   */
  _id: Id<"users">;
  email?: string;
  name?: string;
  phone?: string;
  role: "customer" | "seller_pending" | "seller_rejected" | "boutique" | "boutique_owner" | "admin";
  isActive: boolean;
  isPhoneVerified: boolean;
  createdAt: number;
}

export interface SessionState {
  user: SessionUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isGuest: boolean;
  token: string | null;
}

export interface SessionContextType extends SessionState {
  loginWithPassword: (email: string, password: string) => Promise<{ token: string; userId: string; role: string }>;
  signUpWithPassword: (email: string, password: string, name?: string) => Promise<{ token: string; userId: string; role: string }>;
  loginWithGoogle: (credential?: string) => Promise<any>;
  logout: () => Promise<void>;
  setGuestMode: (enabled: boolean) => void;
}

/** True when the app is running as an installed PWA rather than a normal browser tab. */
function isStandalonePWA(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * Popup failures worth retrying as a redirect. Deliberately excludes
 * auth/popup-closed-by-user and auth/cancelled-popup-request: those mean the shopper
 * chose to back out, and navigating them away to Google anyway would override that.
 */
const REDIRECT_FALLBACK_CODES = new Set([
  "auth/popup-blocked",
  "auth/operation-not-supported-in-this-environment",
]);

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user: firebaseUser, isAuthenticated: isFirebaseAuthenticated, isLoading: firebaseLoading } = useFirebaseAuth();
  const [isGuest, setIsGuest] = useState<boolean>(false);
  const syncUser = useMutation(api.users.syncUser);
  // Firebase confirms auth before the Convex user row is guaranteed to exist. Without this,
  // a first-time signup's `getMe` can resolve to null (row doesn't exist yet) while
  // `syncUser` is still creating it — and the code below would read that as "not
  // authenticated" instead of "still finishing sign-in", flashing a signed-out UI right after
  // OTP verification. This tracks whether the sync mutation has completed at least once since
  // the current Firebase sign-in, so that window is reported as loading, not logged-out.
  const [hasSyncedOnce, setHasSyncedOnce] = useState(false);

  // Fetch user profile from Convex using the authenticated context
  const user = useQuery(api.auth.getMe, isFirebaseAuthenticated ? {} : "skip");

  // Load initial guest status from localStorage
  useEffect(() => {
    const savedGuest = safeGetItem("hive_guest") === "true";
    setIsGuest(savedGuest);
  }, []);

  // Completes a Google sign-in that went through signInWithRedirect. Lives here rather than on
  // the sign-in page because the shopper returns to whichever page started the flow.
  useEffect(() => {
    getRedirectResult(getClientAuth())
      .then((result) => {
        if (!result?.user) return;
        authPerfLog("Google redirect sign-in completed");
        setIsGuest(false);
        safeRemoveItem("hive_guest");
      })
      .catch((err) => {
        // Expected on any cold load where no redirect was in flight — not a failure.
        const code = (err as { code?: string } | null)?.code;
        if (code && ["auth/no-current-user", "auth/null-user", "auth/argument-error"].includes(code)) {
          return;
        }
        console.error("Google redirect sign-in failed:", err);
      });
  }, []);

  // Sync Firebase user with Convex users table immediately upon login
  useEffect(() => {
    if (!isFirebaseAuthenticated || !firebaseUser) {
      // Reset for the next sign-in so this doesn't skip the loading window a second time.
      setHasSyncedOnce(false);
      return;
    }

    let cancelled = false;
    const performSync = async () => {
      authPerfLog("Hive user sync (syncUser mutation) starting");
      try {
        console.log("[SessionContext] Syncing Firebase user to Convex database...");
        const email = firebaseUser.email || undefined;
        const name = firebaseUser.displayName || undefined;
        const phone = firebaseUser.phoneNumber || undefined;
        await syncUser({ email, name, phone });
        console.log("[SessionContext] User sync completed successfully.");
        authPerfLog("Hive user sync (syncUser mutation) completed");
      } catch (err) {
        console.error("[SessionContext] User sync failed:", err);
      } finally {
        // Convex guarantees read-your-own-writes on this client, so by the time this mutation
        // resolves the getMe query above is already consistent with it — flipping this now
        // (success or failure) is what lets isAuthenticated/isLoading below tell the truth.
        if (!cancelled) setHasSyncedOnce(true);
      }
    };

    performSync();
    return () => {
      cancelled = true;
    };
  }, [isFirebaseAuthenticated, firebaseUser, syncUser]);

  // Update authentication status.
  // While Firebase is authenticated but we haven't yet confirmed the Convex user sync has run at
  // least once, treat it as loading rather than unauthenticated — see hasSyncedOnce above.
  const isAuthenticated = !!isFirebaseAuthenticated && !!user;
  const isLoading =
    firebaseLoading ||
    (isFirebaseAuthenticated && (user === undefined || (!user && !hasSyncedOnce)));

  // Marks the moment the customer UI can actually treat the customer as authenticated — this is
  // what "Firebase confirmed the OTP" gets turned into after the getMe query resolves. Comparing
  // this timestamp against "Hive user sync completed" above is what tells us whether the
  // Firebase->Convex sync is genuinely on the critical path or not.
  const wasAuthenticated = useRef(false);
  useEffect(() => {
    if (isAuthenticated && !wasAuthenticated.current) {
      authPerfLog("Customer UI authenticated (isAuthenticated became true)");
      logAuthFlowTotalOnce("Total authentication flow (Send OTP press -> authenticated UI)");
    }
    wasAuthenticated.current = isAuthenticated;
  }, [isAuthenticated]);

  const loginWithPassword = async (email: string, password: string) => {
    console.warn("loginWithPassword is not supported under passwordless Firebase Auth.");
    throw new Error("Password login is not supported. Use Google or Phone OTP.");
  };

  const signUpWithPassword = async (email: string, password: string, name?: string) => {
    console.warn("signUpWithPassword is not supported under passwordless Firebase Auth.");
    throw new Error("Password sign up is not supported. Use Google or Phone OTP.");
  };

  const loginWithGoogle = async (credential?: string): Promise<any> => {
    const auth = getClientAuth();

    // Guest mode is cleared before any redirect, because signInWithRedirect navigates away
    // and nothing after it in this function gets to run.
    const clearGuest = () => {
      setIsGuest(false);
      safeRemoveItem("hive_guest");
    };

    // An installed PWA gets its own window, and on Android the sign-in popup opens in a Custom
    // Tab with a separate storage partition — the session lands somewhere this context cannot
    // read, so the shopper appears never to have signed in. Redirect keeps the whole flow in
    // the PWA's own storage.
    if (isStandalonePWA()) {
      clearGuest();
      await signInWithRedirect(auth, googleProvider);
      return { redirecting: true };
    }

    try {
      const res = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
      clearGuest();
      return { token: "firebase", userId: res.user.uid, role: "customer" };
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code && REDIRECT_FALLBACK_CODES.has(code)) {
        clearGuest();
        await signInWithRedirect(auth, googleProvider);
        return { redirecting: true };
      }
      console.error("Firebase Google SignIn error:", err);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await signOut(getClientAuth());
      setIsGuest(false);
      safeRemoveItem("hive_guest");
    } catch (err) {
      console.error("Firebase signOut error:", err);
    }
  };

  const setGuestMode = (enabled: boolean) => {
    setIsGuest(enabled);
    if (enabled) {
      safeSetItem("hive_guest", "true");
    } else {
      safeRemoveItem("hive_guest");
    }
  };

  return (
    <SessionContext.Provider 
      value={{ 
        user: user || null, 
        isAuthenticated, 
        isLoading, 
        isGuest, 
        token: null,
        loginWithPassword, 
        signUpWithPassword, 
        loginWithGoogle, 
        logout,
        setGuestMode
      }}
    >
      {children}
    </SessionContext.Provider>
  );
};

export const useSessionStore = () => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSessionStore must be used within a SessionProvider");
  }
  return context;
};
