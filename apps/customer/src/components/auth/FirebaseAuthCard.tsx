"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSessionStore } from "@/context/SessionContext";
import { getClientAuth, isAppleSignInEnabled } from "@/lib/firebase";
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from "firebase/auth";
import { HiveLogo } from "@/components/shared/HiveLogo";
import { ArrowRight, Phone, ShieldCheck, CheckCircle2, AlertCircle } from "lucide-react";
import { authPerfLog, markAuthFlowStart } from "@/lib/authPerf";
import { getAuthErrorMessage } from "@/lib/authErrors";
import { toast } from "@hive/utils";

const RESEND_COOLDOWN_SECONDS = 30;

interface FirebaseAuthCardProps {
  title?: string;
  subtitle?: string;
  onSuccess?: () => void;
  showLogo?: boolean;
}

export function FirebaseAuthCard({ 
  title = "Welcome to Hive Now", 
  subtitle = "Sign in or get started in seconds with Google or mobile OTP",
  onSuccess,
  showLogo = true
}: FirebaseAuthCardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect_url") || "/";
  
  const { loginWithGoogle, loginWithApple, isAuthenticated } = useSessionStore();

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 0 = resend is allowed right now. Counts down from RESEND_COOLDOWN_SECONDS after every send
  // (initial or resend) so a customer can't fire off a stack of billed SMS by mashing the button.
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (step !== "otp" || resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
    // Depends on resendCooldown > 0 (not resendCooldown itself) so the interval is created once
    // per cooldown period instead of being torn down and recreated every second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, resendCooldown > 0]);

  useEffect(() => {
    if (isAuthenticated) {
      if (onSuccess) {
        onSuccess();
      } else {
        router.push(redirectUrl);
      }
    }
  }, [isAuthenticated, router, redirectUrl, onSuccess]);

  useEffect(() => {
    if (step === "otp") {
      authPerfLog("OTP screen displayed");
    }
  }, [step]);

  useEffect(() => {
    return () => {
      if ((window as any).recaptchaVerifier) {
        try {
          (window as any).recaptchaVerifier.clear();
        } catch (err) {}
        (window as any).recaptchaVerifier = null;
      }
    };
  }, []);

  const setupRecaptcha = () => {
    if ((window as any).recaptchaVerifier) {
      return (window as any).recaptchaVerifier;
    }
    const container = document.getElementById("recaptcha-container");
    if (container) {
      container.innerHTML = "";
    }
    try {
      (window as any).recaptchaVerifier = new RecaptchaVerifier(getClientAuth(), "recaptcha-container", {
        size: "invisible",
        callback: () => {
          console.log("Recaptcha verified");
        },
      });
    } catch (err) {
      console.error("Recaptcha init error:", err);
    }
    return (window as any).recaptchaVerifier;
  };

  // Google and Apple differ only in which context method they call, so they share this.
  const handleFederatedSignIn = async (
    providerLabel: "Google" | "Apple",
    signIn: () => Promise<any>
  ) => {
    markAuthFlowStart();
    authPerfLog(`${providerLabel} sign-in pressed`);
    setLoading(true);
    setError(null);
    try {
      const result = await signIn();
      // On the redirect path the browser is already navigating away; routing here would race
      // that navigation, and the return leg is completed by getRedirectResult in SessionContext.
      if (result?.redirecting) return;
      authPerfLog(`Firebase ${providerLabel} sign-in popup completed`);
      if (onSuccess) {
        onSuccess();
      } else {
        router.push(redirectUrl);
      }
    } catch (err: any) {
      console.error(`${providerLabel} login error:`, err);
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = () => handleFederatedSignIn("Google", loginWithGoogle);
  const handleAppleSignIn = () => handleFederatedSignIn("Apple", loginWithApple);

  // Shared by the initial "Send OTP" and "Resend OTP" — Firebase's call is identical either way;
  // only what triggered it (and how the result is announced) differs.
  const sendOtpRequest = async (isResend: boolean) => {
    setLoading(true);
    setError(null);
    try {
      authPerfLog(isResend ? "reCAPTCHA verifier setup starting (resend)" : "reCAPTCHA verifier setup starting");
      const verifier = setupRecaptcha();
      // Note: constructing an invisible RecaptchaVerifier does not itself solve the challenge —
      // for size:"invisible" the SDK runs the actual challenge lazily, inside the
      // signInWithPhoneNumber call below. So "verifier ready" here measures construction only;
      // the real reCAPTCHA execution time is bundled into the next marker, not separable from it
      // with the public API this component uses.
      authPerfLog("reCAPTCHA verifier constructed (challenge itself runs inside the next call)");
      const formattedPhone = `+91${phone}`;
      authPerfLog(isResend ? "Firebase signInWithPhoneNumber starting (resend)" : "Firebase signInWithPhoneNumber starting (includes reCAPTCHA challenge + SMS request)");
      const confirmation = await signInWithPhoneNumber(getClientAuth(), formattedPhone, verifier);
      authPerfLog("Firebase signInWithPhoneNumber returned");
      setConfirmationResult(confirmation);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      if (isResend) {
        toast.success("OTP resent");
      } else {
        setStep("otp");
      }
    } catch (err: any) {
      console.error("Send OTP error:", err);
      setError(getAuthErrorMessage(err));
      if ((window as any).recaptchaVerifier) {
        try {
          (window as any).recaptchaVerifier.clear();
        } catch (clearErr) {}
        (window as any).recaptchaVerifier = null;
      }
      const container = document.getElementById("recaptcha-container");
      if (container) {
        container.innerHTML = "";
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    markAuthFlowStart();
    authPerfLog("Send OTP pressed");
    if (!phone || phone.length !== 10 || !/^\d+$/.test(phone)) {
      setError("Please enter a valid 10-digit Indian mobile number.");
      return;
    }
    authPerfLog("Phone validation passed");
    await sendOtpRequest(false);
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || loading) return;
    authPerfLog("Resend OTP pressed");
    setOtp("");
    await sendOtpRequest(true);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    authPerfLog("OTP submitted");
    if (!otp || otp.length !== 6 || !/^\d+$/.test(otp)) {
      setError("Please enter the 6-digit OTP received via SMS.");
      return;
    }

    if (!confirmationResult) {
      setError("Session expired. Please request OTP again.");
      setStep("phone");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      authPerfLog("confirmationResult.confirm() starting");
      await confirmationResult.confirm(otp);
      authPerfLog("Firebase OTP verification completed (confirm() returned)");
      if (onSuccess) {
        onSuccess();
      } else {
        router.push(redirectUrl);
      }
    } catch (err: any) {
      console.error("Verify OTP error:", err);
      setError(err.code ? getAuthErrorMessage(err) : "Invalid or expired OTP. Please check and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md shadow-2xl border border-hive-border/30 dark:border-neutral-800/40 rounded-[2.5rem] p-8 sm:p-10 flex flex-col gap-6">
      <div id="recaptcha-container" className="hidden"></div>
      
      {/* Header */}
      <div className="flex flex-col gap-2 items-center text-center mb-2">
        {showLogo && (
          <div className="w-20 h-auto mb-2">
            <HiveLogo />
          </div>
        )}
        <h1 className="font-serif text-2xl sm:text-3xl font-medium text-slate-900 dark:text-white tracking-tight">
          {title}
        </h1>
        <p className="text-xs sm:text-sm text-hive-text-muted font-sans font-normal tracking-wide">
          {subtitle}
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-xl flex items-center gap-2.5 text-xs text-red-700 dark:text-red-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Step 1: Phone & Google Sign In */}
      {step === "phone" ? (
        <>
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full h-12 border border-slate-300 dark:border-neutral-700/80 bg-white dark:bg-neutral-800 rounded-xl hover:bg-slate-50 dark:hover:bg-neutral-700/60 transition-all flex items-center justify-center gap-3 font-sans text-xs font-semibold tracking-wider uppercase text-slate-800 dark:text-neutral-200 shadow-sm active:scale-[0.98] disabled:opacity-60 cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>Continue with Google</span>
          </button>

          {/* Apple: the one federated option that stays smooth inside an installed iOS PWA,
              since it uses the system Apple ID rather than a cookie session the PWA's own
              storage container doesn't have. Hidden until the Firebase console side is set up —
              see isAppleSignInEnabled. */}
          {isAppleSignInEnabled && (
            <button
              onClick={handleAppleSignIn}
              disabled={loading}
              className="w-full h-12 border border-slate-300 dark:border-neutral-700/80 bg-white dark:bg-neutral-800 rounded-xl hover:bg-slate-50 dark:hover:bg-neutral-700/60 transition-all flex items-center justify-center gap-3 font-sans text-xs font-semibold tracking-wider uppercase text-slate-800 dark:text-neutral-200 shadow-sm active:scale-[0.98] disabled:opacity-60 cursor-pointer"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.05 12.54c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.75-.78-2.87-.76-1.48.02-2.84.86-3.6 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.25 2.74 2.2 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.08 2.65-2.14.84-1.23 1.18-2.42 1.2-2.48-.03-.01-2.3-.88-2.32-3.5zM14.88 5.9c.6-.74 1.01-1.75.9-2.76-.87.04-1.93.58-2.56 1.31-.56.65-1.05 1.69-.92 2.68.97.08 1.96-.49 2.58-1.23z" />
              </svg>
              <span>Continue with Apple</span>
            </button>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3 my-1">
            <div className="h-px bg-slate-200 dark:bg-neutral-800 flex-1"></div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500">
              Or mobile OTP
            </span>
            <div className="h-px bg-slate-200 dark:bg-neutral-800 flex-1"></div>
          </div>

          <form onSubmit={handleSendOtp} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-neutral-400">
                Mobile Number
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-3.5 flex items-center gap-1.5 text-base font-bold text-slate-500 dark:text-neutral-400 border-r border-slate-200 dark:border-neutral-800 pr-2.5">
                  <span>+91</span>
                </div>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="98765 43210"
                  // tel-national (not tel): the +91 is already rendered as a prefix, so autofilling
                  // the full international number would double it. inputMode keeps iOS on the
                  // numeric keypad instead of the alphabetic keyboard.
                  autoComplete="tel-national"
                  inputMode="numeric"
                  className="w-full h-11 pl-16 pr-4 rounded-xl border border-slate-300 dark:border-neutral-800 focus:ring-2 focus:ring-hive-gold/45 focus:border-hive-gold text-base font-medium bg-white dark:bg-neutral-900 transition-all outline-none"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || phone.length !== 10}
              className="bg-[#F5C22B] hover:bg-[#E0B120] text-stone-950 shadow-[0_4px_16px_rgba(245,194,43,0.25)] border-none h-12 rounded-xl text-xs font-extrabold uppercase tracking-widest transition-all hover:shadow-xl active:scale-[0.98] disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2 cursor-pointer mt-1"
            >
              {loading ? <span>Sending OTP...</span> : <span>Send OTP</span>}
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </form>
        </>
      ) : (
        /* Step 2: Clean OTP Verification Screen */
        <form onSubmit={handleVerifyOtp} className="flex flex-col gap-5 py-2">
          <div className="flex flex-col gap-2.5">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400">
                Enter 6-Digit Code
              </label>
              <button
                type="button"
                onClick={() => { setStep("phone"); setOtp(""); setError(null); }}
                className="text-xs font-bold text-amber-600 dark:text-hive-gold hover:underline transition-all cursor-pointer"
              >
                Change (+91 {phone})
              </button>
            </div>
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="• • • • • •"
              maxLength={6}
              // one-time-code is what makes iOS offer the code from Messages above the keyboard,
              // and Android surface the SMS autofill prompt. Without it the shopper has to leave
              // the app, read the SMS, and type six digits back in by hand.
              autoComplete="one-time-code"
              inputMode="numeric"
              className="w-full h-14 text-center tracking-[0.6em] text-lg sm:text-xl font-extrabold rounded-2xl border-2 border-slate-300 dark:border-neutral-700 focus:ring-4 focus:ring-hive-gold/20 focus:border-hive-gold bg-slate-50 dark:bg-neutral-900 text-slate-900 dark:text-white transition-all outline-none shadow-inner"
              required
              autoFocus
            />
            <p className="text-xs text-center text-slate-500 dark:text-neutral-400 font-sans mt-1">
              We sent a verification code to <span className="font-semibold text-slate-800 dark:text-neutral-200">+91 {phone}</span>
            </p>
            <div className="text-center">
              {resendCooldown > 0 ? (
                <span className="text-xs text-slate-400 dark:text-neutral-500 font-sans">
                  Resend OTP in {resendCooldown}s
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={loading}
                  className="text-xs font-bold text-amber-600 dark:text-hive-gold hover:underline transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
                >
                  Resend OTP
                </button>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || otp.length !== 6}
            className="bg-[#F5C22B] hover:bg-[#E0B120] text-stone-950 shadow-[0_4px_16px_rgba(245,194,43,0.25)] border-none h-12 rounded-xl text-xs font-extrabold uppercase tracking-widest transition-all hover:shadow-xl active:scale-[0.98] disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            {loading ? <span>Verifying...</span> : <span>Verify & Continue</span>}
            <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
          </button>
        </form>
      )}


    </div>
  );
}
