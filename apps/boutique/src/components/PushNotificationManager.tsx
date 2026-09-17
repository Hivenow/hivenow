"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useRouter } from "next/navigation";
import { BellRing, ShoppingBag, ArrowRight } from "lucide-react";
import { Id } from "../../../../convex/_generated/dataModel";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

interface PushNotificationManagerProps {
  boutiqueId?: Id<"boutiques">;
  userId?: Id<"users">;
}

interface AlarmPayload {
  title?: string;
  body?: string;
  orderNumber?: string;
  url?: string;
  netPayout?: number;
}

type AlertMode = "store" | "mobile";

/**
 * Utility to convert base64 VAPID key to Uint8Array for PushManager
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PushNotificationManager({
  boutiqueId,
  userId,
}: PushNotificationManagerProps) {
  const router = useRouter();

  // Alert state & mode ("store" terminal vs "mobile" owner)
  const [isRinging, setIsRinging] = useState(false);
  const [alertMode, setAlertMode] = useState<AlertMode>("mobile");
  const [activeAlert, setActiveAlert] = useState<AlarmPayload | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sirenIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const saveSubscription = useMutation(api.pushNotifications.savePushSubscription);

  // Sync mode with localStorage & listen for header changes
  const syncAlertMode = useCallback(() => {
    if (typeof window !== "undefined") {
      const savedMode = (localStorage.getItem("hive_alert_mode") as AlertMode) || "mobile";
      setAlertMode(savedMode === "store" ? "store" : "mobile");
    }
  }, []);

  useEffect(() => {
    syncAlertMode();
    window.addEventListener("hive_alert_mode_change", syncAlertMode);
    return () => {
      window.removeEventListener("hive_alert_mode_change", syncAlertMode);
    };
  }, [syncAlertMode]);

  // Web Audio Synthesizer Fallback (Alternating 880Hz / 1046Hz Siren for Store Mode)
  const startSynthesizedSiren = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      let highFreq = false;
      if (sirenIntervalRef.current) clearInterval(sirenIntervalRef.current);

      sirenIntervalRef.current = setInterval(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(highFreq ? 1046.5 : 880, ctx.currentTime);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.25);
        highFreq = !highFreq;
      }, 300);
    } catch (e) {
      console.error("Web Audio API synthesis failed:", e);
    }
  }, []);

  const stopOrderAlarm = useCallback(() => {
    setIsRinging(false);
    setActiveAlert(null);

    // Stop HTML5 Audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    // Stop Synthesizer
    if (sirenIntervalRef.current) {
      clearInterval(sirenIntervalRef.current);
      sirenIntervalRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.suspend();
    }
  }, []);

  const startOrderAlarm = useCallback(
    (payload?: AlarmPayload) => {
      setIsRinging(true);
      if (payload) setActiveAlert(payload);

      if (!audioRef.current) {
        audioRef.current = new Audio("/sounds/order-chime.mp3");
      }

      audioRef.current.currentTime = 0;

      if (alertMode === "store") {
        // Endless loop for in-shop terminal
        audioRef.current.loop = true;
        audioRef.current.play().catch(() => startSynthesizedSiren());
      } else {
        // Single chime for owner mobile phone (no looping)
        audioRef.current.loop = false;
        audioRef.current.play().catch(() => startSynthesizedSiren());
      }
    },
    [alertMode, startSynthesizedSiren]
  );

  const handleAcceptViewOrder = () => {
    stopOrderAlarm();
    router.push("/boutique/orders");
  };

  // Real-time Convex order count listener
  const orders = useQuery(api.orders.getBoutiqueOrders);
  const prevOrderCountRef = React.useRef<number | null>(null);

  useEffect(() => {
    if (orders !== undefined && Array.isArray(orders)) {
      if (prevOrderCountRef.current !== null && orders.length > prevOrderCountRef.current) {
        const latest = orders[0];
        let netPayout: number | undefined = undefined;
        if (latest) {
          const payoutPaise = latest.totalPayout ?? 0;
          netPayout = payoutPaise / 100;
        }

        console.log("[PushNotificationManager] New order detected via real-time query! Triggering alarm...", { netPayout });
        startOrderAlarm({
          title: "🚨 NEW ORDER RECEIVED!",
          body: `Order ${latest?.orderNumber || ""} placed for ${latest?.items?.length || 1} item(s).`,
          netPayout,
        });
      }
      prevOrderCountRef.current = orders.length;
    }
  }, [orders, startOrderAlarm]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check for Custom Capacitor FcmToken Plugin (runs when loaded via Android WebView)
    const cap = (window as any).Capacitor;
    if (cap?.Plugins?.FcmToken && boutiqueId && userId) {
      cap.Plugins.FcmToken.getToken()
        .then((res: { token?: string }) => {
          if (res?.token) {
            console.log("[PushNotificationManager] Native FCM token fetched via bridge:", res.token);
            saveSubscription({
              boutiqueId,
              userId,
              fcmToken: res.token,
              subscription: {
                endpoint: `fcm://${res.token}`,
                keys: { p256dh: "fcm_native", auth: "fcm_native" },
              },
            }).catch(console.error);
          }
        })
        .catch((err: any) => {
          console.warn("[PushNotificationManager] FcmToken plugin call failed:", err);
        });
    }

    // A. Native Android / iOS App Platform (Capacitor)
    if (Capacitor.isNativePlatform()) {
      (async () => {
        try {
          const permStatus = await PushNotifications.checkPermissions();
          let receivePerm = permStatus.receive;
          if (receivePerm === "prompt") {
            const req = await PushNotifications.requestPermissions();
            receivePerm = req.receive;
          }
          if (receivePerm === "granted") {
            await PushNotifications.register();
          }

          PushNotifications.addListener("registration", (token) => {
            console.log("[PushNotificationManager] Native FCM token registered:", token.value);
            if (boutiqueId && userId) {
              saveSubscription({
                boutiqueId,
                userId,
                subscription: {
                  endpoint: token.value,
                  keys: { p256dh: "fcm_native", auth: "fcm_native" },
                },
              }).catch(console.error);
            }
          });

          PushNotifications.addListener("pushNotificationReceived", (notification) => {
            console.log("[PushNotificationManager] Native push received:", notification);
            startOrderAlarm({
              title: notification.title,
              body: notification.body,
              netPayout: notification.data?.netPayout ? parseFloat(notification.data.netPayout) : undefined,
              orderNumber: notification.data?.orderNumber,
              url: notification.data?.url || "/boutique/orders",
            });
          });

          PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
            console.log("[PushNotificationManager] Native push action performed:", action);
            if (action.actionId === "silence") {
              stopOrderAlarm();
            } else {
              stopOrderAlarm();
              router.push(action.notification.data?.url || "/boutique/orders");
            }
          });
        } catch (nativeErr) {
          console.warn("[PushNotificationManager] Native push init failed:", nativeErr);
        }
      })();

      return () => {
        PushNotifications.removeAllListeners();
        stopOrderAlarm();
      };
    }

    // B. Web PWA Platform (Safari on iPhone, Chrome on Desktop)
    if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) {
      const messageListener = (event: MessageEvent) => {
        if (event.data?.type === "TRIGGER_ORDER_ALARM" || event.data?.type === "PLAY_ORDER_CHIME") {
          console.log("[PushNotificationManager] Received SW alarm event:", event.data);
          startOrderAlarm(event.data.payload);
        }
        if (event.data?.type === "STOP_ORDER_ALARM") {
          console.log("[PushNotificationManager] Received STOP_ORDER_ALARM event from lockscreen!");
          stopOrderAlarm();
        }
      };
      navigator.serviceWorker.addEventListener("message", messageListener);

      // Auto subscribe if granted
      if (Notification.permission === "granted" && boutiqueId && userId) {
        navigator.serviceWorker.ready.then(async (registration) => {
          const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
          if (vapidPublicKey) {
            const existingSub = await registration.pushManager.getSubscription();
            if (!existingSub) {
              const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
              });
              await saveSubscription({
                boutiqueId,
                userId,
                subscription: JSON.parse(JSON.stringify(subscription)),
              }).catch(console.error);
            }
          }
        });
      }

      return () => {
        navigator.serviceWorker.removeEventListener("message", messageListener);
        stopOrderAlarm();
      };
    }
  }, [boutiqueId, userId, saveSubscription, startOrderAlarm, stopOrderAlarm, router]);

  return (
    <>
      {/* Dev / Staff Test Trigger Removed */}

      {/* Professional Incoming Order Alert Modal */}
      {isRinging && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md text-slate-900 flex items-center justify-center p-4 select-none">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 md:p-8 shadow-2xl border border-slate-200/80 flex flex-col items-center text-center gap-5 animate-in fade-in zoom-in-95 duration-200">
            {/* Status Tag */}
            <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200/60 text-emerald-700 font-bold text-xs uppercase tracking-wider px-3.5 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              New Order Received
            </div>

            {/* Central Icon */}
            <div className="w-20 h-20 bg-amber-50 rounded-2xl border border-amber-100 flex items-center justify-center text-[#D9A71E]">
              <ShoppingBag className="w-10 h-10" />
            </div>

            {/* Order Info */}
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-serif font-extrabold text-slate-900 tracking-tight">
                {activeAlert?.title || "Incoming Order"}
              </h2>
              <p className="text-xs font-medium text-slate-500 max-w-xs">
                {activeAlert?.body || "A customer has placed an order from your store."}
              </p>
            </div>

            {/* Net Payout Badge */}
            {activeAlert?.netPayout != null && (
              <div className="w-full bg-slate-50 border border-slate-200/60 rounded-2xl py-3 px-4 flex flex-col items-center justify-center">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Estimated Payout</span>
                <span className="text-2xl font-black text-slate-900">
                  ₹{activeAlert.netPayout.toFixed(2)}
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="w-full flex flex-col gap-2.5 mt-2">
              <button
                onClick={handleAcceptViewOrder}
                className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-xl shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>View & Manage Order</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={stopOrderAlarm}
                className="w-full py-2.5 text-slate-500 hover:text-slate-800 font-semibold text-xs transition-colors cursor-pointer"
              >
                Mute Alert Sound
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
