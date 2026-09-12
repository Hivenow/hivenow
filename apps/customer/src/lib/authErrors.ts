// Maps Firebase Auth error codes to customer-safe messages. Never show err.message from
// Firebase directly to a customer — it's written for developers, not shoppers, and can change
// wording between SDK versions without notice.
const MESSAGES: Record<string, string> = {
  "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
  "auth/invalid-verification-code": "The OTP is incorrect. Please check and try again.",
  "auth/code-expired": "This OTP has expired. Request a new one.",
  "auth/missing-verification-code": "Please enter the OTP sent to your phone.",
  "auth/invalid-phone-number": "Please enter a valid 10-digit mobile number.",
  "auth/missing-phone-number": "Please enter your mobile number.",
  "auth/network-request-failed": "Check your internet connection and try again.",
  "auth/quota-exceeded": "We couldn't send the OTP right now. Please try again in a few minutes.",
  "auth/captcha-check-failed": "Verification failed. Please refresh the page and try again.",
  "auth/invalid-app-credential": "We couldn't send the OTP right now. Please try again in a moment.",
  "auth/app-not-authorized": "We couldn't send the OTP right now. Please try again in a moment.",
  "auth/user-disabled": "This account has been disabled. Please contact support.",
  "auth/popup-closed-by-user": "Sign-in was cancelled.",
  "auth/cancelled-popup-request": "Sign-in was cancelled.",
  "auth/popup-blocked": "Your browser blocked the sign-in popup. Please allow popups and try again.",
  "auth/operation-not-supported-in-this-environment": "Sign-in isn't supported here. Please try again in your browser.",
  "auth/unauthorized-domain": "Sign-in isn't available from this address right now. Please contact support.",
  "auth/account-exists-with-different-credential": "This email is already registered with a different sign-in method. Try signing in with your mobile number.",
};

const DEFAULT_MESSAGE = "Something went wrong. Please try again.";

export function getAuthErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  if (code && MESSAGES[code]) return MESSAGES[code];
  return DEFAULT_MESSAGE;
}
