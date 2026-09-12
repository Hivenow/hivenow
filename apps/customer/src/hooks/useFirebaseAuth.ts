// apps/customer/src/hooks/useFirebaseAuth.ts
import { useState, useEffect, useCallback, useRef } from "react";
import { onIdTokenChanged, User } from "firebase/auth";
import { getClientAuth } from "../lib/firebase";
import { authPerfLog } from "../lib/authPerf";

export function useFirebaseAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Tracks whether we've logged the *first* onIdTokenChanged callback (app boot) separately
  // from later ones (sign-in/sign-out transitions during the session), since they answer
  // different questions: boot latency vs. "how long after OTP confirm did auth state update".
  const hasLoggedInitialState = useRef(false);
  const wasSignedIn = useRef(false);

  useEffect(() => {
    const auth = getClientAuth();
    authPerfLog("Auth listener (onIdTokenChanged) registered");
    const unsubscribe = onIdTokenChanged(auth, (currentUser) => {
      if (!hasLoggedInitialState.current) {
        hasLoggedInitialState.current = true;
        authPerfLog(`First auth state received (${currentUser ? "signed in" : "signed out"})`);
      } else if (!!currentUser !== wasSignedIn.current) {
        authPerfLog(`Auth state changed to ${currentUser ? "signed in" : "signed out"}`);
      }
      wasSignedIn.current = !!currentUser;
      setUser(currentUser);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Reads auth.currentUser rather than the `user` state, and keeps empty deps, because
  // ConvexProviderWithAuth re-runs its auth handshake whenever this function's identity
  // changes — and treats the client as unauthenticated for the duration. Depending on
  // `user` also opened a stale window: between onIdTokenChanged firing on the hourly token
  // refresh and React committing setUser, this returned null and Convex dropped auth.
  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }): Promise<string | null> => {
      const currentUser = getClientAuth().currentUser;
      if (!currentUser) {
        return null;
      }
      try {
        return await currentUser.getIdToken(forceRefreshToken);
      } catch (error) {
        console.error("Failed to get Firebase ID token:", error);
        return null;
      }
    },
    []
  );

  return {
    isLoading,
    isAuthenticated: !!user,
    fetchAccessToken,
    user,
  };
}
