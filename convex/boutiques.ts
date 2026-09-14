// @ts-nocheck
// convex/boutiques.ts
// Queries and mutations to manage boutiques in the marketplace registry.

import { mutation, query, internalQuery, internalAction, internalMutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireRole, getMyBoutique, getCurrentUserOrNull, getAuthenticatedUser, requireBoutiqueOwnership } from "./lib/auth";
import { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import { encryptData, decryptData } from "./lib/encryption";
import { ImageAsset } from "./schema";
import { getPublicUrl } from "./media/api";
import { normalizeEmail } from "./users";
import { getMerchantInviteTemplate, getStaffWelcomeTemplate } from "./lib/emailTemplates";
import { triggerNotification } from "./lib/notifications";

/**
 * Fetch all boutiques.
 * Admin-only query.
 */
export const getBoutiques = query({
  args: {
    excludeTestData: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const exclude = args.excludeTestData ?? true;
    let list = await ctx.db.query("boutiques").collect();
    list = list.filter(b => b.status !== "DELETED");
    if (exclude) {
      list = list.filter(b => 
        !b.boutiqueName.startsWith("Chaos Test Boutique") && 
        !b.boutiqueName.startsWith("Mock Boutique") && 
        b.isTestData !== true
      );
    }
    return await Promise.all(
      list.map(async (b) => {
        const onboardingStatus = await determineOnboardingStatus(ctx, b);
        return {
          ...b,
          onboardingStatus,
        };
      })
    );
  },
});

/**
 * Fetch a single boutique by its ID.
 * Admin or authorized query.
 */
export const getBoutiqueById = query({
  args: { id: v.id("boutiques") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const boutique = await ctx.db.get(args.id);
    if (!boutique) return null;

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_boutiqueId", (q: any) => q.eq("boutiqueId", boutique._id))
      .collect();
    const delivered = orders.filter((o: any) => o.status === "delivered").length;
    
    let suggestedTier: "Bronze" | "Silver" | "Gold" | "Elite" = "Bronze";
    if (delivered > 0) {
      const claims = await ctx.db
        .query("claims")
        .withIndex("by_boutiqueId", (q: any) => q.eq("boutiqueId", boutique._id))
        .collect();
      const claimRate = orders.length > 0 ? (claims.length / orders.length) * 100 : 0;
      const score = boutique.hiveScore || 100;
      
      if (score >= 95 && delivered >= 10 && claimRate < 2) {
        suggestedTier = "Elite";
      } else if (score >= 90 && delivered >= 5) {
        suggestedTier = "Gold";
      } else if (score >= 50 && delivered >= 1) {
        suggestedTier = "Silver";
      }
    }

    const onboardingStatus = await determineOnboardingStatus(ctx, boutique);

    return {
      ...boutique,
      suggestedTier,
      onboardingStatus,
    };
  },
});

export function normalizePhoneNumber(phone: string): string {
  // Strip all non-digit characters
  let cleaned = phone.replace(/\D/g, "");
  
  // If it starts with '0', remove the leading '0'
  if (cleaned.startsWith("0")) {
    cleaned = cleaned.substring(1);
  }
  
  // If it is 10 digits long, assume India (+91) and prepend 91
  if (cleaned.length === 10) {
    cleaned = "91" + cleaned;
  }
  
  // Validate final length: Meta Cloud API expects standard E.164 without '+'
  if (cleaned.length < 10 || cleaned.length > 15) {
    throw new ConvexError(`Invalid phone number format: "${phone}". It must be a valid phone number with country code.`);
  }
  
  return cleaned;
}

function validateBoutiqueDetails(details: {
  boutiqueName: string;
  ownerName: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number;
  longitude: number;
  deliveryRadiusKm: number;
  description: string;
  searchKeywords?: string[];
}) {
  if (!details.boutiqueName.trim()) throw new ConvexError("Boutique name is required.");
  if (!details.ownerName.trim()) throw new ConvexError("Owner name is required.");
  if (!details.phone.trim() || details.phone.replace(/[^0-9]/g, "").length < 10) {
    throw new ConvexError("Valid contact phone number (at least 10 digits) is required.");
  }
  if (!details.address.trim()) throw new ConvexError("Store physical address is required.");
  if (!details.city.trim()) throw new ConvexError("Store city is required.");
  if (!details.state.trim()) throw new ConvexError("Store state is required.");
  if (!details.pincode.trim()) throw new ConvexError("Store pincode is required.");
  if (
    details.latitude === 0 ||
    details.longitude === 0 ||
    Number.isNaN(details.latitude) ||
    Number.isNaN(details.longitude) ||
    !Number.isFinite(details.latitude) ||
    !Number.isFinite(details.longitude)
  ) {
    throw new ConvexError("Boutique coordinates are mandatory and cannot be at Null Island (0, 0) or NaN.");
  }
  if (details.latitude < 8.0 || details.latitude > 13.0) {
    throw new ConvexError("Store Latitude must be a valid coordinate within Kerala region (8.0 to 13.0).");
  }
  if (details.longitude < 74.0 || details.longitude > 78.0) {
    throw new ConvexError("Store Longitude must be a valid coordinate within Kerala region (74.0 to 78.0).");
  }
  if (!details.deliveryRadiusKm || details.deliveryRadiusKm <= 0) {
    throw new ConvexError("Delivery radius must be a positive number.");
  }
  if (details.deliveryRadiusKm > 13) {
    throw new ConvexError("Delivery radius cannot exceed 13 km. Please contact support if you need a larger coverage area.");
  }
  if (!details.description.trim()) throw new ConvexError("Boutique description is required.");

  if (details.searchKeywords) {
    if (details.searchKeywords.length > 10) {
      throw new ConvexError("Maximum of 10 search keywords allowed.");
    }
    for (const kw of details.searchKeywords) {
      if (kw.trim().length > 40) {
        throw new ConvexError(`Keyword "${kw}" exceeds maximum length of 40 characters.`);
      }
    }
  }
}

/**
 * Create a new boutique registry.
 * Admin-only mutation.
 */
export const createBoutique = mutation({
  args: {
    boutiqueName:     v.string(),
    ownerName:        v.string(),
    email:            v.string(),
    phone:            v.string(),
    address:          v.string(),
    city:             v.string(),
    state:            v.string(),
    pincode:          v.string(),
    latitude:         v.number(),
    longitude:        v.number(),
    deliveryRadiusKm: v.number(),
    description:      v.string(),
    status:           v.string(), // PENDING, APPROVED, REJECTED, SUSPENDED
    bankAccount:      v.optional(v.object({
                        holderName: v.string(),
                        accountNo:  v.string(),
                        ifsc:       v.string(),
                      })),
    storeCategory:    v.optional(
                        v.union(
                          v.literal("women_fashion"),
                          v.literal("mens_fashion"),
                          v.literal("footwear"),
                          v.literal("bags"),
                          v.literal("jewellery"),
                          v.literal("multi_category")
                        )
                      ),
    sellerModel:      v.optional(
                        v.union(
                          v.literal("boutique"),
                          v.literal("brand"),
                          v.literal("multi_brand_store")
                        )
                      ),
    area:             v.optional(v.string()),
    searchKeywords:    v.optional(v.array(v.string())),
    serviceType:       v.optional(
                        v.union(
                          v.literal("ready_to_ship"),
                          v.literal("made_to_order"),
                          v.literal("alterations"),
                          v.literal("custom_design")
                        )
                      ),
    staffEmail1:      v.optional(v.string()),
    staffEmail2:      v.optional(v.string()),
    staffPhone1:      v.optional(v.string()),
    staffPhone2:      v.optional(v.string()),
    razorpayAccountId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const adminUser = await requireRole(ctx, "admin");

    try {
      const normalizedPhone = normalizePhoneNumber(args.phone);
      validateBoutiqueDetails({ ...args, phone: normalizedPhone });

      await validateAndCheckDuplicateRazorpayAccountId(ctx, args.razorpayAccountId);

      const rawToken = generateInviteToken();
      const hashed = await hashInviteToken(rawToken);
      const now = Date.now();

      const emailNormalized = args.email.trim().toLowerCase();
      
      // Check for duplicates before proceeding
      await checkForDuplicateBoutique(ctx, emailNormalized, normalizedPhone);

      const defaults = getDefaultBoutiqueConfig();

      const insertData: any = {
        boutiqueName:     args.boutiqueName,
        ownerName:        args.ownerName,
        email:            emailNormalized,
        phone:            normalizedPhone,
        address:          args.address,
        latitude:         args.latitude,
        longitude:        args.longitude,
        city:             args.city,
        state:            args.state,
        pincode:          args.pincode,
        deliveryRadiusKm: args.deliveryRadiusKm,
        description:      args.description,
        status:           args.status,
        storeCategory:    args.storeCategory || defaults.storeCategory,
        sellerModel:      args.sellerModel || defaults.sellerModel,
        merchantTier:     defaults.merchantTier,
        pricingTier:      defaults.pricingTier,
        createdAt:        now,
        
        area:             args.area,
        searchKeywords:    args.searchKeywords,
        serviceType:       args.serviceType,
        razorpayAccountId: args.razorpayAccountId?.trim() || undefined,

        ownerEmail:       emailNormalized,
        ownerUserId:      undefined, // Unclaimed until invite is claimed
        
        staffEmail1:      args.staffEmail1 ? args.staffEmail1.toLowerCase() : undefined,
        staffEmail2:      args.staffEmail2 ? args.staffEmail2.toLowerCase() : undefined,
        staffPhone1:      args.staffPhone1 ? normalizePhoneNumber(args.staffPhone1) : undefined,
        staffPhone2:      args.staffPhone2 ? normalizePhoneNumber(args.staffPhone2) : undefined,

        // Invite metadata
        inviteTokenHash:  hashed,
        inviteStatus:     "sent",
        inviteSentAt:     now,
        inviteExpiresAt:  now + 14 * 24 * 60 * 60 * 1000,
        inviteCreatedBy:  adminUser._id,
        activeApprovedProductCount: defaults.activeApprovedProductCount,

        // WhatsApp preferences
        whatsAppNotificationsEnabled: defaults.whatsAppNotificationsEnabled,
        notificationPhone:            normalizedPhone,

        // Seed backward-compatibility properties if needed
        name:             args.boutiqueName,
        slug:             args.boutiqueName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
        phoneNumber:      normalizedPhone,
        addressDetails: {
          line1:          args.address,
          city:           args.city,
          state:          args.state,
          pincode:        args.pincode,
          lat:            args.latitude,
          lng:            args.longitude,
        },
      };

      if (args.bankAccount) {
        const secret = process.env.BANK_ENCRYPTION_KEY;
        if (!secret) throw new ConvexError("FATAL: BANK_ENCRYPTION_KEY environment variable is not configured. Cannot process bank data.");
        const encryptedAccountNo = await encryptData(args.bankAccount.accountNo, secret);
        const accountNoLast4 = args.bankAccount.accountNo.slice(-4).padStart(args.bankAccount.accountNo.length, "X");
        insertData.bankAccount = {
          holderName: args.bankAccount.holderName,
          accountNoLast4,
          encryptedAccountNo,
          ifsc: args.bankAccount.ifsc,
        };
      }

      const boutiqueId = await ctx.db.insert("boutiques", insertData);

      await ctx.db.insert("auditLogs", {
        actorId: adminUser._id,
        actorRole: "admin",
        action: "boutique.created",
        entityType: "boutiques",
        entityId: boutiqueId as unknown as string,
        metadata: JSON.stringify({
          inviteEmail: emailNormalized,
          boutiqueId: boutiqueId,
          status: args.status,
        }),
        createdAt: now,
      });

      // Schedule background invitation dispatch
      await ctx.scheduler.runAfter(0, internal.boutiques.sendMerchantInviteAction, {
        boutiqueId,
        rawToken,
      });

      return { boutiqueId, rawToken };
    } catch (e: any) {
      // Re-throw ConvexErrors as-is (they reach the client properly)
      if (e instanceof ConvexError) throw e;
      // Convert any other Error to ConvexError so the client sees the real message
      console.error("[createBoutique] Uncaught error:", e.message, e.stack);
      throw new ConvexError(`Boutique creation failed: ${e.message}`);
    }
  },
});

/**
 * Update boutique details.
 * Admin-only mutation.
 */
export const updateBoutique = mutation({
  args: {
    id:               v.id("boutiques"),
    boutiqueName:     v.string(),
    ownerName:        v.string(),
    email:            v.string(),
    phone:            v.string(),
    address:          v.string(),
    city:             v.string(),
    state:            v.string(),
    pincode:          v.string(),
    latitude:         v.number(),
    longitude:        v.number(),
    deliveryRadiusKm: v.number(),
    description:      v.string(),
    status:           v.string(),
    whatsAppNotificationsEnabled: v.optional(v.boolean()),
    notificationPhone:            v.optional(v.string()),
    bankAccount:      v.optional(v.object({
                        holderName: v.string(),
                        accountNo:  v.string(),
                        ifsc:       v.string(),
                      })),
    storeCategory:    v.optional(
                        v.union(
                          v.literal("women_fashion"),
                          v.literal("mens_fashion"),
                          v.literal("footwear"),
                          v.literal("bags"),
                          v.literal("jewellery"),
                          v.literal("multi_category")
                        )
                      ),
    sellerModel:      v.optional(
                        v.union(
                          v.literal("boutique"),
                          v.literal("brand"),
                          v.literal("multi_brand_store")
                        )
                      ),
    merchantTier:     v.optional(
                        v.union(
                          v.literal("Bronze"),
                          v.literal("Silver"),
                          v.literal("Gold"),
                          v.literal("Elite")
                        )
                      ),
    area:             v.optional(v.string()),
    searchKeywords:    v.optional(v.array(v.string())),
    serviceType:       v.optional(
                        v.union(
                          v.literal("ready_to_ship"),
                          v.literal("made_to_order"),
                          v.literal("alterations"),
                          v.literal("custom_design")
                        )
                      ),
    staffEmail1:      v.optional(v.string()),
    staffEmail2:      v.optional(v.string()),
    staffPhone1:      v.optional(v.string()),
    staffPhone2:      v.optional(v.string()),
    razorpayAccountId: v.optional(v.string()),
    returnsAcceptedDefault: v.optional(v.boolean()),
    exchangesAcceptedDefault: v.optional(v.boolean()),
    returnsAcceptedDefaultLocked: v.optional(v.boolean()),
    pricingTier: v.optional(
                  v.union(
                    v.literal("tier1"),
                    v.literal("tier2"),
                    v.literal("tier3"),
                    v.literal("bronze"),
                    v.literal("silver"),
                    v.literal("gold")
                  )
                ),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError(`Boutique not found (ID: ${args.id}). The boutique may have been re-created or deleted. Please return to the Partners list and select the boutique.`);
    }

    const normalizedPhone = normalizePhoneNumber(args.phone);
    validateBoutiqueDetails({ ...args, phone: normalizedPhone });

    await validateAndCheckDuplicateRazorpayAccountId(ctx, args.razorpayAccountId, args.id);

    const normalizedNotificationPhone = args.notificationPhone
      ? normalizePhoneNumber(args.notificationPhone)
      : undefined;

    const emailNormalized = args.email.trim().toLowerCase();

    const patchData: any = {
      boutiqueName:     args.boutiqueName,
      ownerName:        args.ownerName,
      email:            emailNormalized,
      phone:            normalizedPhone,
      address:          args.address,
      latitude:         args.latitude,
      longitude:        args.longitude,
      city:             args.city,
      state:            args.state,
      pincode:          args.pincode,
      deliveryRadiusKm: args.deliveryRadiusKm,
      description:      args.description,
      status:           args.status,
      storeCategory:    args.storeCategory,
      sellerModel:      args.sellerModel,
      merchantTier:     args.merchantTier,
      whatsAppNotificationsEnabled: args.whatsAppNotificationsEnabled,
      notificationPhone: normalizedNotificationPhone,

      area:             args.area,
      searchKeywords:    args.searchKeywords,
      serviceType:       args.serviceType,
      razorpayAccountId: args.razorpayAccountId,
      
      returnsAcceptedDefault: args.returnsAcceptedDefault,
      exchangesAcceptedDefault: args.exchangesAcceptedDefault,
      returnsAcceptedDefaultLocked: args.returnsAcceptedDefaultLocked,
      pricingTier: args.pricingTier,
      
      staffEmail1:      args.staffEmail1 ? args.staffEmail1.toLowerCase() : undefined,
      staffEmail2:      args.staffEmail2 ? args.staffEmail2.toLowerCase() : undefined,
      staffPhone1:      args.staffPhone1 ? normalizePhoneNumber(args.staffPhone1) : undefined,
      staffPhone2:      args.staffPhone2 ? normalizePhoneNumber(args.staffPhone2) : undefined,
      
      // Update compatibility fields
      name:             args.boutiqueName,
      phoneNumber:      normalizedPhone,
      addressDetails: {
        line1:          args.address,
        city:           args.city,
        state:          args.state,
        pincode:        args.pincode,
        lat:            args.latitude,
        lng:            args.longitude,
      },
    };

    if (args.bankAccount) {
      const secret = process.env.BANK_ENCRYPTION_KEY;
      if (!secret) throw new Error("FATAL: BANK_ENCRYPTION_KEY environment variable is not configured. Cannot process bank data.");
      const encryptedAccountNo = await encryptData(args.bankAccount.accountNo, secret);
      const accountNoLast4 = args.bankAccount.accountNo.slice(-4).padStart(args.bankAccount.accountNo.length, "X");
      patchData.bankAccount = {
        holderName: args.bankAccount.holderName,
        accountNoLast4,
        encryptedAccountNo,
        ifsc: args.bankAccount.ifsc,
      };
    }

    await ctx.db.patch(args.id, patchData);

    // If pricingTier was updated, recalculate product prices for this boutique
    // to prevent stale all-inclusive storefront prices
    if (args.pricingTier) {
      await ctx.scheduler.runAfter(0, internal.adminSettings.recalculateAllProductPricesInternal, {});
    }

    return args.id;
  },
});

/**
 * Approve a boutique application.
 * Admin-only mutation.
 */
export const approveBoutique = mutation({
  args: { id: v.id("boutiqueApplications") },
  handler: async (ctx, args) => {
    const adminUser = await requireRole(ctx, "admin");

    const app = await ctx.db.get(args.id);
    if (!app) throw new Error("Boutique application not found");
    if (app.status !== "PENDING") throw new Error("Application is already processed");

    // Compliance verification guard: check that required documents are verified
    // before allowing merchant activation
    const applicantUser = await ctx.db.get(app.userId);
    if (!applicantUser) throw new Error("Applicant user record not found");

    const now = Date.now();
    const normalizedPhone = normalizePhoneNumber(app.phone);

    // Create the approved boutique record
    const boutiqueId = await ctx.db.insert("boutiques", {
      boutiqueName:     app.boutiqueName,
      ownerName:        app.ownerName,
      email:            app.email,
      phone:            normalizedPhone,
      address:          app.address,
      latitude:         app.latitude,
      longitude:        app.longitude,
      city:             app.city,
      state:            app.state,
      pincode:          app.pincode,
      deliveryRadiusKm: app.deliveryRadiusKm,
      description:      app.description,
      status:           "APPROVED",
      storeCategory:    app.storeCategory || "women_fashion",
      sellerModel:      app.sellerModel || "boutique",
      merchantTier:     "Bronze",
      pricingTier:      "tier1",
      createdAt:        now,
      ownerEmail:       app.email,
      ownerUserId:      app.userId,
      userId:           app.userId, // legacy compatibility

      area:             app.area,
      searchKeywords:    app.searchKeywords,
      serviceType:       app.serviceType,

      // WhatsApp preferences
      whatsAppNotificationsEnabled: true,
      notificationPhone:            normalizedPhone,

      // Seed backward-compatibility properties
      name:             app.boutiqueName,
      slug:             app.boutiqueName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
      phoneNumber:      normalizedPhone,
      addressDetails: {
        line1:          app.address,
        city:           app.city ?? "",
        state:          app.state ?? "",
        pincode:        app.pincode ?? "",
        lat:            app.latitude,
        lng:            app.longitude,
      },
      approvedAt:       now,
      approvedBy:       adminUser._id,
    });

    // Update application status
    await ctx.db.patch(args.id, {
      status:     "APPROVED",
      approvedAt: now,
      approvedBy: adminUser._id,
    });

    await triggerNotification(
      ctx,
      app.userId,
      "email",
      "merchant_application_approved",
      "boutique",
      boutiqueId,
      JSON.stringify({
        ownerName: app.ownerName,
        boutiqueName: app.boutiqueName,
      })
    );

    // Upgrade user's role to boutique_owner
    const oldRole = applicantUser.role;
    await ctx.db.patch(app.userId, {
      role: "boutique_owner",
      updatedAt: now,
    });

    // Write audit logs
    await ctx.db.insert("auditLogs", {
      actorRole: "admin",
      actorId: adminUser._id,
      action: "boutique.approved",
      entityType: "boutiques",
      entityId: boutiqueId,
      metadata: JSON.stringify({
        applicationId: args.id,
        ownerUserId: app.userId,
        email: app.email,
      }),
      createdAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorRole: "admin",
      actorId: adminUser._id,
      action: "user.role_changed",
      entityType: "users",
      entityId: app.userId,
      metadata: JSON.stringify({
        oldRole,
        newRole: "boutique_owner",
        reason: "boutique_approval",
      }),
      createdAt: now,
    });

    return boutiqueId;
  },
});

/**
 * Reject a boutique application.
 * Admin-only mutation.
 */
export const rejectBoutique = mutation({
  args: { 
    id: v.id("boutiqueApplications"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const app = await ctx.db.get(args.id);
    if (!app) throw new Error("Boutique application not found");

    await ctx.db.patch(args.id, {
      status: "REJECTED",
      rejectionReason: args.reason || "Rejection by Admin",
    });

    const now = Date.now();
    await ctx.db.insert("auditLogs", {
      actorId: ctx.auth ? (await getAuthenticatedUser(ctx))._id : undefined,
      actorRole: "admin",
      action: "boutique.rejected",
      entityType: "boutiqueApplications",
      entityId: args.id,
      metadata: JSON.stringify({
        applicationId: args.id,
        email: app.email,
        reason: args.reason || "Rejection by Admin",
        previousStatus: app.status,
        newStatus: "REJECTED",
      }),
      createdAt: now,
    });

    // Downgrade user role to seller_rejected (preserves application history)
    const appUser = await ctx.db.get(app.userId);
    if (appUser && (appUser.role === "seller_pending" || appUser.role === "customer")) {
      await ctx.db.patch(app.userId, {
        role: "seller_rejected",
        updatedAt: Date.now(),
      });
    }

    await triggerNotification(
      ctx,
      app.userId,
      "email",
      "merchant_application_rejected",
      "boutique_application",
      app._id,
      JSON.stringify({
        ownerName: app.ownerName,
        boutiqueName: app.boutiqueName,
        reason: args.reason || "Rejection by Admin",
      })
    );

    return args.id;
  },
});

/**
 * Suspend a boutique.
 * Admin-only mutation.
 */
export const suspendBoutique = mutation({
  args: { 
    id: v.id("boutiques"),
    suspensionReason: v.string(),
    suspensionNotes: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const adminUser = await requireRole(ctx, "admin");
    const now = Date.now();
    
    const boutique = await ctx.db.get(args.id);
    if (!boutique) throw new Error("Boutique not found");
    const previousStatus = boutique.status;

    await ctx.db.patch(args.id, {
      status: "SUSPENDED",
      suspensionReason: args.suspensionReason,
      suspensionNotes: args.suspensionNotes,
      suspendedAt: now,
      suspendedBy: adminUser._id,
    });

    await ctx.db.insert("auditLogs", {
      actorId: adminUser._id,
      actorRole: "admin",
      action: "boutique.suspended",
      entityType: "boutiques",
      entityId: args.id,
      metadata: JSON.stringify({
        boutiqueId: args.id,
        reason: args.suspensionReason,
        notes: args.suspensionNotes,
        previousStatus,
        newStatus: "SUSPENDED",
      }),
      createdAt: now,
    });

    return args.id;
  },
});

/**
 * Soft delete a boutique.
 * Admin-only mutation.
 */
export const softDeleteBoutique = mutation({
  args: { 
    id: v.id("boutiques"),
  },
  handler: async (ctx, args) => {
    const adminUser = await requireRole(ctx, "admin");
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "DELETED",
    });

    // Write audit logs
    await ctx.db.insert("auditLogs", {
      actorRole: "admin",
      actorId: adminUser._id,
      action: "boutique.deleted",
      entityType: "boutiques",
      entityId: args.id,
      metadata: JSON.stringify({
        reason: "Admin soft delete",
      }),
      createdAt: now,
    });

    return args.id;
  },
});

/**
 * Activate/unsuspend a boutique.
 * Admin-only mutation.
 */
export const activateBoutique = mutation({
  args: { id: v.id("boutiques") },
  handler: async (ctx, args) => {
    const adminUser = await requireRole(ctx, "admin");
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "APPROVED",
      suspensionReason: undefined,
      suspensionNotes: undefined,
      suspendedAt: undefined,
      suspendedBy: undefined,
    });

    // Write audit logs
    await ctx.db.insert("auditLogs", {
      actorRole: "admin",
      actorId: adminUser._id,
      action: "boutique.activated",
      entityType: "boutiques",
      entityId: args.id,
      metadata: JSON.stringify({
        reason: "Activated by Admin",
      }),
      createdAt: now,
    });

    return args.id;
  },
});

/**
 * Fetch all approved boutiques.
 * Public query.
 */
async function resolveBoutiqueMerchantTier(ctx: any, b: any): Promise<"Bronze" | "Silver" | "Gold" | "Elite" | "New Boutique"> {
  if (b.merchantTier) return b.merchantTier;

  const orders = await ctx.db
    .query("orders")
    .withIndex("by_boutiqueId", (q: any) => q.eq("boutiqueId", b._id))
    .collect();
  const delivered = orders.filter((o: any) => o.status === "delivered").length;
  if (delivered === 0) return "New Boutique";

  const claims = await ctx.db
    .query("claims")
    .withIndex("by_boutiqueId", (q: any) => q.eq("boutiqueId", b._id))
    .collect();

  const claimRate = orders.length > 0 ? (claims.length / orders.length) * 100 : 0;
  const score = b.hiveScore || 100;

  if (score >= 95 && delivered >= 10 && claimRate < 2) {
    return "Elite";
  } else if (score >= 90 && delivered >= 5) {
    return "Gold";
  } else if (score >= 50 && delivered >= 1) {
    return "Silver";
  }
  return "Bronze";
}

export const getApprovedBoutiques = query({
  args: {},
  handler: async (ctx) => {
    const boutiques = await ctx.db
      .query("boutiques")
      .withIndex("by_status", (q) => q.eq("status", "APPROVED"))
      .collect();

    const filtered = boutiques.filter(b => 
      !b.boutiqueName.startsWith("Chaos Test Boutique") && 
      !b.boutiqueName.startsWith("Mock Boutique") && 
      b.isTestData !== true
    );

      return await Promise.all(
        filtered.map(async (b) => {
          let logoUrl = b.logoUrl ? getPublicUrl(b.logoUrl, "thumbnail") : undefined;
          let bannerUrl = b.bannerUrl ? getPublicUrl(b.bannerUrl, "original") : undefined;
          const merchantTier = await resolveBoutiqueMerchantTier(ctx, b);

          // Use pre-computed count instead of querying all products per boutique (N+1 elimination)
          const activeApprovedProductCount = b.activeApprovedProductCount ?? 0;

          return {
            ...b,
            logoUrl,
            bannerUrl,
            merchantTier,
            trustTier: merchantTier,
            activeApprovedProductCount,
          };
        })
      );
  },
});

/**
 * Fetch a single boutique's public profile by slug.
 * This is an unauthenticated query explicitly designed for the public storefront page.
 * It strictly picks only safe fields to prevent data leaks (no emails, commissions, or internal notes).
 */
export const getBoutiquePublicProfile = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    let boutique = await ctx.db
      .query("boutiques")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!boutique) {
      try {
        boutique = await ctx.db.get(args.slug as any);
      } catch (e) {
        boutique = null;
      }
    }

    if (!boutique || boutique.status !== "APPROVED") {
      return null;
    }

    let logoUrl = boutique.logoUrl ? getPublicUrl(boutique.logoUrl, "thumbnail") : undefined;
    let bannerUrl = boutique.bannerUrl ? getPublicUrl(boutique.bannerUrl, "original") : undefined;
    const merchantTier = await resolveBoutiqueMerchantTier(ctx, boutique);

    // Strictly pick public fields
    return {
      _id: boutique._id,
      slug: boutique.slug,
      boutiqueName: boutique.boutiqueName,
      description: boutique.description,
      logoUrl,
      bannerUrl,
      address: boutique.address,
      city: boutique.city,
      state: boutique.state,
      pincode: boutique.pincode,
      latitude: boutique.latitude,
      longitude: boutique.longitude,
      deliveryRadiusKm: boutique.deliveryRadiusKm,
      isAcceptingOrders: boutique.isAcceptingOrders,
      merchantTier,
      trustTier: merchantTier,
      storeCategory: boutique.storeCategory,
      createdAt: boutique.createdAt,
      averageRating: boutique.averageRating,
      reviewCount: boutique.reviewCount,
    };
  }
});

/**
 * Update boutique details by the owner.
 * Boutique-only mutation.
 */
export const updateBoutiqueProfile = mutation({
  args: {
    phone: v.string(),
    description: v.string(),
    logoUrl: v.optional(ImageAsset),
    bannerUrl: v.optional(ImageAsset),
    boutiqueName: v.optional(v.string()),
    ownerName: v.optional(v.string()),
    address: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    deliveryRadiusKm: v.optional(v.number()),
    whatsAppNotificationsEnabled: v.optional(v.boolean()),
    notificationPhone:            v.optional(v.string()),
    bankAccount: v.optional(v.object({
      holderName: v.string(),
      accountNo:  v.string(),
      ifsc:       v.string(),
    })),
    gstNumber: v.optional(v.string()),
    storeCategory:    v.optional(
                        v.union(
                          v.literal("women_fashion"),
                          v.literal("mens_fashion"),
                          v.literal("footwear"),
                          v.literal("bags"),
                          v.literal("jewellery"),
                          v.literal("multi_category")
                        )
                      ),
    sellerModel:      v.optional(
                        v.union(
                          v.literal("boutique"),
                          v.literal("brand"),
                          v.literal("multi_brand_store")
                        )
                      ),
    weeklyClosedDays: v.optional(v.array(v.number())),
    holidayDates:     v.optional(v.array(v.string())),
    prepTimeMinutes:  v.optional(v.number()),
    storeMessage:     v.optional(v.string()),
    openingTime:      v.optional(v.string()),
    closingTime:      v.optional(v.string()),
    area:             v.optional(v.string()),
    searchKeywords:    v.optional(v.array(v.string())),
    serviceType:       v.optional(
                        v.union(
                          v.literal("ready_to_ship"),
                          v.literal("made_to_order"),
                          v.literal("alterations"),
                          v.literal("custom_design")
                        )
                      ),
    storeStatus:      v.optional(v.union(v.literal("open"), v.literal("busy"), v.literal("closed"))),
    isAcceptingOrders: v.optional(v.boolean()),
    pauseReason:      v.optional(
                        v.union(
                          v.literal("vacation"),
                          v.literal("festival"),
                          v.literal("restocking"),
                          v.literal("personal"),
                          v.literal("wedding"),
                          v.literal("renovation"),
                          v.literal("emergency"),
                          v.literal("capacity"),
                          v.literal("other")
                        )
                      ),
    closedUntil:      v.optional(v.number()),
    returnsAcceptedDefault: v.optional(v.boolean()),
    exchangesAcceptedDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const boutique = await getMyBoutique(ctx);

    if (args.holidayDates) {
      const oldHolidays = boutique.holidayDates || [];
      const newHolidays = args.holidayDates.filter((h) => !oldHolidays.includes(h));

      if (newHolidays.length > 0) {
        const pendingOrders = await ctx.db
          .query("orders")
          .withIndex("by_boutiqueId", (q) => q.eq("boutiqueId", boutique._id))
          .filter((q) =>
            q.and(
              q.neq(q.field("status"), "delivered"),
              q.neq(q.field("status"), "cancelled"),
              q.neq(q.field("status"), "returned")
            )
          )
          .collect();

        for (const order of pendingOrders) {
          if (order.scheduledProcessingDate && newHolidays.includes(order.scheduledProcessingDate)) {
            throw new ConvexError(
              `Cannot set holiday on ${order.scheduledProcessingDate}. You have active pending pre-orders scheduled for delivery on this day.`
            );
          }
        }
      }
    }

    const normalizedPhone = normalizePhoneNumber(args.phone);
    const normalizedNotificationPhone = args.notificationPhone
      ? normalizePhoneNumber(args.notificationPhone)
      : undefined;

    // Validate searchKeywords if supplied
    if (args.searchKeywords) {
      if (args.searchKeywords.length > 10) {
        throw new Error("Maximum of 10 search keywords allowed.");
      }
      for (const kw of args.searchKeywords) {
        if (kw.trim().length > 40) {
          throw new Error(`Keyword "${kw}" exceeds maximum length of 40 characters.`);
        }
      }
    }

    // Bank details validation
    if (args.bankAccount) {
      if (!args.bankAccount.holderName || args.bankAccount.holderName.trim().length < 3) {
        throw new ConvexError("Account holder name must be at least 3 characters.");
      }
      const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
      if (!ifscRegex.test(args.bankAccount.ifsc)) {
        throw new ConvexError("Invalid IFSC code. Must match format e.g. HDFC0001234.");
      }
      const accNoRegex = /^\d{9,18}$/;
      if (!accNoRegex.test(args.bankAccount.accountNo)) {
        throw new ConvexError("Invalid Account Number. Must contain between 9 and 18 digits.");
      }
    }

    // GSTIN validation
    if (args.gstNumber) {
      const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstRegex.test(args.gstNumber)) {
        throw new ConvexError("Invalid GSTIN format. Must be a valid 15-character Indian GSTIN.");
      }
    }

    // Validate delivery radius cap and lock
    if (args.deliveryRadiusKm !== undefined) {
      if (boutique.deliveryRadiusKm !== undefined && args.deliveryRadiusKm !== boutique.deliveryRadiusKm) {
        throw new ConvexError("Delivery radius is locked once configured. Please contact support to change your delivery radius.");
      }
      if (args.deliveryRadiusKm > 13) {
        throw new ConvexError("Delivery radius cannot exceed 13 km. Please contact support if you need a larger coverage area.");
      }
    }

    const patchData: any = {
      phone: normalizedPhone,
      description: args.description,
      logoUrl: args.logoUrl !== undefined ? args.logoUrl : boutique.logoUrl,
      bannerUrl: args.bannerUrl !== undefined ? args.bannerUrl : boutique.bannerUrl,
      phoneNumber: normalizedPhone, // compatibility field
      whatsAppNotificationsEnabled: args.whatsAppNotificationsEnabled !== undefined ? args.whatsAppNotificationsEnabled : boutique.whatsAppNotificationsEnabled,
      notificationPhone: normalizedNotificationPhone !== undefined ? normalizedNotificationPhone : boutique.notificationPhone,
      
      boutiqueName: args.boutiqueName ?? boutique.boutiqueName,
      ownerName: args.ownerName ?? boutique.ownerName,
      address: args.address ?? boutique.address,
      latitude: args.latitude ?? boutique.latitude,
      longitude: args.longitude ?? boutique.longitude,
      deliveryRadiusKm: args.deliveryRadiusKm ?? boutique.deliveryRadiusKm,
      storeCategory: args.storeCategory ?? boutique.storeCategory,
      sellerModel: args.sellerModel ?? boutique.sellerModel,
      
      weeklyClosedDays: args.weeklyClosedDays ?? boutique.weeklyClosedDays,
      holidayDates: args.holidayDates ?? boutique.holidayDates,
      prepTimeMinutes: args.prepTimeMinutes ?? boutique.prepTimeMinutes,
      storeMessage: args.storeMessage ?? boutique.storeMessage,
      openingTime: args.openingTime ?? boutique.openingTime,
      closingTime: args.closingTime ?? boutique.closingTime,

      area: args.area ?? boutique.area,
      searchKeywords: args.searchKeywords ?? boutique.searchKeywords,
      serviceType: args.serviceType ?? boutique.serviceType,
      
      storeStatus: args.storeStatus ?? boutique.storeStatus,
      isAcceptingOrders: args.isAcceptingOrders ?? boutique.isAcceptingOrders,
      pauseReason: args.pauseReason ?? boutique.pauseReason,
      closedUntil: args.closedUntil !== undefined ? args.closedUntil : boutique.closedUntil,
      name: args.boutiqueName ?? boutique.name,
      gstNumber: args.gstNumber ?? boutique.gstNumber,
    };

    if (args.exchangesAcceptedDefault !== undefined) {
      patchData.exchangesAcceptedDefault = args.exchangesAcceptedDefault;
    }
    if (args.returnsAcceptedDefault !== undefined) {
      patchData.returnsAcceptedDefault = args.returnsAcceptedDefault;
    }


    if (args.bankAccount) {
      const secret = process.env.BANK_ENCRYPTION_KEY;
      if (!secret) throw new Error("FATAL: BANK_ENCRYPTION_KEY environment variable is not configured. Cannot process bank data.");
      const encryptedAccountNo = await encryptData(args.bankAccount.accountNo, secret);
      const accountNoLast4 = args.bankAccount.accountNo.slice(-4).padStart(args.bankAccount.accountNo.length, "X");
      patchData.bankAccount = {
        holderName: args.bankAccount.holderName,
        accountNoLast4,
        encryptedAccountNo,
        ifsc: args.bankAccount.ifsc,
      };
    }

    await ctx.db.patch(boutique._id, patchData);
    return boutique._id;
  },
});

export const getMyBoutiqueDetails = query({
  args: {},
  handler: async (ctx) => {
    const boutique = await getMyBoutique(ctx, undefined, true);
    let logoUrl = boutique.logoUrl ? getPublicUrl(boutique.logoUrl, "thumbnail") : undefined;
    let bannerUrl = boutique.bannerUrl ? getPublicUrl(boutique.bannerUrl, "original") : undefined;
    
    return {
      ...boutique,
      logoUrl,
      bannerUrl,
    };
  },
});

export const getBoutiqueFinance = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (user && user.role === "boutique") {
      throw new Error("Forbidden: Staff users do not have access to financial metrics.");
    }
    const boutique = await getMyBoutique(ctx, undefined, true);
    if (!boutique) {
      throw new Error("Boutique not found");
    }

    const settlements = await ctx.db
      .query("settlementLedger")
      .withIndex("by_boutiqueId", (q) => q.eq("boutiqueId", boutique._id))
      .collect();

    const payouts = await ctx.db
      .query("payoutLedger")
      .withIndex("by_boutiqueId", (q) => q.eq("boutiqueId", boutique._id))
      .collect();

    let pendingBalance = 0;
    let availableBalance = 0;
    let totalPaidOut = 0;

    for (const s of settlements) {
      if (s.status === "pending") {
        pendingBalance += s.amount;
      } else if (s.status === "available" && !s.payoutId) {
        availableBalance += s.amount;
      }
    }

    for (const p of payouts) {
      if (p.status === "success") {
        totalPaidOut += p.amount;
      }
    }

    const sortedSettlements = [...settlements]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50);

    const sortedPayouts = [...payouts]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50);

    const settlementsWithOrders = [];
    for (const s of sortedSettlements) {
      let orderNumber = undefined;
      let snapshotMath = undefined;
      
      if (s.orderId) {
        const order = await ctx.db.get(s.orderId);
        if (order) {
          orderNumber = order.orderNumber;
          
          // Fetch order items to calculate snapshot math for this boutique
          const orderItems = await ctx.db
            .query("orderItems")
            .withIndex("by_orderId", (q) => q.eq("orderId", s.orderId))
            .collect();
            
          let totalBasePrice = 0;
          let totalPlatformFee = 0;
          
          for (const item of orderItems) {
            if (item.boutiqueId === boutique._id) {
              // Ensure we fallback to (item.priceAtPurchase * quantity) if basePrice is missing during transition
              const base = item.basePriceAtPurchase ? (item.basePriceAtPurchase * item.quantity) : (item.priceAtPurchase * item.quantity);
              const fee = item.platformFeeAmount || 0;
              
              totalBasePrice += base;
              totalPlatformFee += fee;
            }
          }
          
          // Only attach snapshotMath if this settlement is an order payout (not an adjustment)
          if (totalBasePrice > 0) {
            snapshotMath = {
              basePrice: totalBasePrice,
              platformFee: totalPlatformFee
            };
          }
        }
      }
      settlementsWithOrders.push({
        ...s,
        orderNumber,
        snapshotMath,
      });
    }

    return {
      metrics: {
        pendingBalance,
        availableBalance,
        totalPaidOut,
      },
      settlements: settlementsWithOrders,
      payouts: sortedPayouts,
    };
  },
});

export const getMyBoutiqueSafe = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) return { exists: false, error: "Unauthenticated" };

    // 1. Check for approved boutique in main boutiques registry first
    let boutique = await ctx.db
      .query("boutiques")
      .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", user._id))
      .unique();

    const userEmail = user.email;
    if (!boutique && userEmail) {
      boutique = await ctx.db
        .query("boutiques")
        .withIndex("by_email", (q) => q.eq("email", userEmail))
        .unique();
    }

    if (!boutique && userEmail) {
      const normalizedUserEmail = normalizeEmail(userEmail) || userEmail.trim().toLowerCase();
      boutique = await ctx.db.query("boutiques").withIndex("by_staffEmail1", q => q.eq("staffEmail1", normalizedUserEmail)).first();
      
      if (!boutique) {
        boutique = await ctx.db.query("boutiques").withIndex("by_staffEmail2", q => q.eq("staffEmail2", normalizedUserEmail)).first();
      }
      if (!boutique && normalizedUserEmail !== userEmail) {
        boutique = await ctx.db.query("boutiques").withIndex("by_staffEmail1", q => q.eq("staffEmail1", userEmail)).first();
      }
      if (!boutique && normalizedUserEmail !== userEmail) {
        boutique = await ctx.db.query("boutiques").withIndex("by_staffEmail2", q => q.eq("staffEmail2", userEmail)).first();
      }
      if (!boutique) {
        const allBoutiques = await ctx.db.query("boutiques").collect();
        boutique = allBoutiques.find((b: any) =>
          b.status !== "DELETED" && (
            (b.staffEmail1 && normalizeEmail(b.staffEmail1) === normalizeEmail(userEmail)) ||
            (b.staffEmail2 && normalizeEmail(b.staffEmail2) === normalizeEmail(userEmail))
          )
        ) as any;
      }
    }

    if (!boutique && user.role === "admin") {
      // Fallback for admins
      boutique = await ctx.db
        .query("boutiques")
        .withIndex("by_status", (q) => q.eq("status", "APPROVED"))
        .first();
    }

    if (boutique) {
      return { exists: true, boutique };
    }

    // 2. Fall back to boutiqueApplications table for latest pending/rejected application status
    const latestApplication = await ctx.db
      .query("boutiqueApplications")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();

    if (latestApplication) {
      return {
        exists: true,
        boutique: {
          status: latestApplication.status,
          boutiqueName: latestApplication.boutiqueName,
          rejectionReason: latestApplication.rejectionReason,
          storeCategory: latestApplication.storeCategory,
          sellerModel: latestApplication.sellerModel,
          ownerName: latestApplication.ownerName,
          phone: latestApplication.phone,
          address: latestApplication.address,
          city: latestApplication.city,
          state: latestApplication.state,
          pincode: latestApplication.pincode,
          latitude: latestApplication.latitude,
          longitude: latestApplication.longitude,
          deliveryRadiusKm: latestApplication.deliveryRadiusKm,
          description: latestApplication.description,
          area: latestApplication.area,
          searchKeywords: latestApplication.searchKeywords,
          serviceType: latestApplication.serviceType,
        },
      };
    }

    return { exists: false, error: "No boutique or application found" };
  },
});

export const getMyBoutiqueSafeCustomer = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrNull(ctx, args.token);
    if (!user) return { exists: false, error: "Unauthenticated" };

    // A plain customer cannot own or staff a boutique, so none of the registry
    // lookups below can match for them — but they are the overwhelming majority
    // of callers, because the customer Navbar subscribes to this query on every
    // page. Running the lookups anyway meant every customer fell through to the
    // full-table scan at the end of the email chain, and because this is a live
    // subscription, ANY write to ANY boutique row re-ran that scan and re-pushed
    // to every connected shopper.
    //
    // Roles that genuinely can resolve a boutique keep the full path below,
    // unchanged. Customers skip straight to the applications lookup, which is
    // how a customer with a pending seller application still gets their status.
    const canOwnBoutique = user.role !== "customer";

    // 1. Check for approved boutique in main boutiques registry first
    let boutique = canOwnBoutique
      ? await ctx.db
          .query("boutiques")
          .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", user._id))
          .unique()
      : null;

    const userEmail = canOwnBoutique ? user.email : undefined;
    if (!boutique && userEmail) {
      boutique = await ctx.db
        .query("boutiques")
        .withIndex("by_email", (q) => q.eq("email", userEmail))
        .unique();
    }

    if (!boutique && userEmail) {
      const normalizedUserEmail = normalizeEmail(userEmail) || userEmail.trim().toLowerCase();
      boutique = await ctx.db.query("boutiques").withIndex("by_staffEmail1", q => q.eq("staffEmail1", normalizedUserEmail)).first();
      
      if (!boutique) {
        boutique = await ctx.db.query("boutiques").withIndex("by_staffEmail2", q => q.eq("staffEmail2", normalizedUserEmail)).first();
      }
      if (!boutique && normalizedUserEmail !== userEmail) {
        boutique = await ctx.db.query("boutiques").withIndex("by_staffEmail1", q => q.eq("staffEmail1", userEmail)).first();
      }
      if (!boutique && normalizedUserEmail !== userEmail) {
        boutique = await ctx.db.query("boutiques").withIndex("by_staffEmail2", q => q.eq("staffEmail2", userEmail)).first();
      }
      if (!boutique) {
        const allBoutiques = await ctx.db.query("boutiques").collect();
        boutique = allBoutiques.find((b: any) =>
          b.status !== "DELETED" && (
            (b.staffEmail1 && normalizeEmail(b.staffEmail1) === normalizeEmail(userEmail)) ||
            (b.staffEmail2 && normalizeEmail(b.staffEmail2) === normalizeEmail(userEmail))
          )
        ) as any;
      }
    }

    if (!boutique && user.role === "admin") {
      // Fallback for admins
      boutique = await ctx.db
        .query("boutiques")
        .withIndex("by_status", (q) => q.eq("status", "APPROVED"))
        .first();
    }

    if (boutique) {
      return { exists: true, boutique };
    }

    // 2. Fall back to boutiqueApplications table for latest pending/rejected application status
    const latestApplication = await ctx.db
      .query("boutiqueApplications")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();

    if (latestApplication) {
      return {
        exists: true,
        boutique: {
          status: latestApplication.status,
          boutiqueName: latestApplication.boutiqueName,
          rejectionReason: latestApplication.rejectionReason,
          storeCategory: latestApplication.storeCategory,
          sellerModel: latestApplication.sellerModel,
          ownerName: latestApplication.ownerName,
          phone: latestApplication.phone,
          address: latestApplication.address,
          city: latestApplication.city,
          state: latestApplication.state,
          pincode: latestApplication.pincode,
          latitude: latestApplication.latitude,
          longitude: latestApplication.longitude,
          deliveryRadiusKm: latestApplication.deliveryRadiusKm,
          description: latestApplication.description,
          area: latestApplication.area,
          searchKeywords: latestApplication.searchKeywords,
          serviceType: latestApplication.serviceType,
        },
      };
    }

    return { exists: false, error: "No boutique or application found" };
  },
});

/**
 * Submit a boutique partner application.
 * Called by any authenticated user who wants to register a boutique.
 */
export const applyBoutique = mutation({
  args: {
    boutiqueName:     v.string(),
    ownerName:        v.string(),
    phone:            v.string(),
    address:          v.string(),
    city:             v.string(),
    state:            v.string(),
    pincode:          v.string(),
    latitude:         v.number(),
    longitude:        v.number(),
    deliveryRadiusKm: v.number(),
    description:      v.string(),
    token:            v.optional(v.string()),
    storeCategory:    v.optional(
                        v.union(
                          v.literal("women_fashion"),
                          v.literal("mens_fashion"),
                          v.literal("footwear"),
                          v.literal("bags"),
                          v.literal("jewellery"),
                          v.literal("multi_category")
                        )
                      ),
    sellerModel:      v.optional(
                        v.union(
                          v.literal("boutique"),
                          v.literal("brand"),
                          v.literal("multi_brand_store")
                        )
                      ),
    area:             v.optional(v.string()),
    searchKeywords:    v.optional(v.array(v.string())),
    serviceType:       v.optional(
                        v.union(
                          v.literal("ready_to_ship"),
                          v.literal("made_to_order"),
                          v.literal("alterations"),
                          v.literal("custom_design")
                        )
                      ),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);

    const normalizedPhone = normalizePhoneNumber(args.phone);
    validateBoutiqueDetails({ ...args, phone: normalizedPhone });

    // 1. Check if the user already has an active boutique in the registry
    const existingBoutique = await ctx.db
      .query("boutiques")
      .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", user._id))
      .unique();

    if (existingBoutique) {
      throw new ConvexError("Application already exists");
    }

    // 2. Check if the user already has any boutique application
    const existingApps = await ctx.db
      .query("boutiqueApplications")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const pendingOrApprovedApp = existingApps.find(
      (app) => app.status === "PENDING" || app.status === "APPROVED"
    );

    if (pendingOrApprovedApp) {
      throw new ConvexError("Application already exists");
    }

    const rejectedApp = existingApps.find((app) => app.status === "REJECTED");

    if (rejectedApp) {
      // Re-apply by updating the rejected application
      await ctx.db.patch(rejectedApp._id, {
        boutiqueName:     args.boutiqueName,
        ownerName:        args.ownerName,
        phone:            normalizedPhone,
        address:          args.address,
        city:             args.city,
        state:            args.state,
        pincode:          args.pincode,
        latitude:         args.latitude,
        longitude:        args.longitude,
        deliveryRadiusKm: args.deliveryRadiusKm,
        description:      args.description,
        status:           "PENDING",
        rejectionReason:  undefined,
        storeCategory:    args.storeCategory || "women_fashion",
        sellerModel:      args.sellerModel || "boutique",
        area:             args.area,
        searchKeywords:   args.searchKeywords,
        serviceType:      args.serviceType,
      });

      // Upgrade user role to seller_pending so Seller Center shows application status
      if (user.role === "customer" || user.role === "seller_rejected") {
        await ctx.db.patch(user._id, {
          role: "seller_pending",
          updatedAt: Date.now(),
        });
      }

      return rejectedApp._id;
    }

    // Insert new application profile into boutiqueApplications
    const applicationId = await ctx.db.insert("boutiqueApplications", {
      userId:           user._id,
      boutiqueName:     args.boutiqueName,
      ownerName:        args.ownerName,
      email:            user.email || "",
      phone:            normalizedPhone,
      address:          args.address,
      city:             args.city,
      state:            args.state,
      pincode:          args.pincode,
      latitude:         args.latitude,
      longitude:        args.longitude,
      deliveryRadiusKm: args.deliveryRadiusKm,
      description:      args.description,
      status:           "PENDING",
      storeCategory:    args.storeCategory || "women_fashion",
      sellerModel:      args.sellerModel || "boutique",
      area:             args.area,
      searchKeywords:    args.searchKeywords,
      serviceType:       args.serviceType,
      createdAt:        Date.now(),
    });

    // Upgrade user role to seller_pending so Seller Center shows application status
    if (user.role === "customer" || user.role === "seller_rejected") {
      await ctx.db.patch(user._id, {
        role: "seller_pending",
        updatedAt: Date.now(),
      });
    }

    // Trigger ops Slack alert for new boutique application
    const superadmin = await ctx.db.query("users").withIndex("by_role", q => q.eq("role", "admin")).first();
    if (superadmin) {
      await triggerNotification(ctx, superadmin._id, "slack", "boutique_application_submitted", "boutique", applicationId, JSON.stringify({
        boutiqueName: args.boutiqueName,
        ownerName: args.ownerName,
        phone: normalizedPhone,
        city: args.city
      }));
    }

    return applicationId;
  },
});

/**
 * Fetch all boutique applications.
 * Admin-only query.
 */
export const getBoutiqueApplications = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    return await ctx.db.query("boutiqueApplications").order("desc").collect();
  },
});

/**
 * Upload and submit a boutique compliance document.
 * Checks file type, size, and matching extension.
 */
export const uploadBoutiqueDocument = mutation({
  args: {
    type: v.union(
      v.literal("gst_certificate"),
      v.literal("pan"),
      v.literal("trade_license"),
      v.literal("bank_proof"),
      v.literal("other")
    ),
    storageId: v.string(),
    filename: v.string(),
  },
  handler: async (ctx, args) => {
    const boutique = await getMyBoutique(ctx);
    const now = Date.now();

    // Enforce constraints (max 5MB, MIME types: JPEG, PNG, PDF)
    const allowedMimes = ["image/jpeg", "image/png", "application/pdf"];
    const maxBytes = 5 * 1024 * 1024;
    await validateUploadedFile(ctx, args.storageId, args.filename, allowedMimes, maxBytes);

    // Store the storageId directly — do NOT resolve signed URLs at upload time.
    // Signed URLs expire after ~1 hour. We resolve them at query-time instead.
    const storageUrl = args.storageId; // raw storageId stored as 'url' for backward compat

    // Check if a document of this type already exists
    const existing = await ctx.db
      .query("boutiqueDocuments")
      .withIndex("by_boutiqueId_type", (q) => q.eq("boutiqueId", boutique._id).eq("type", args.type))
      .unique();

    let docId;
    if (existing) {
      if (existing.status === "verified") {
        throw new Error("Cannot re-upload a verified document. Contact support for assistance.");
      }
      await ctx.db.patch(existing._id, {
        url: storageUrl,
        publicId: args.storageId,
        status: "pending",
        createdAt: now,
      });
      docId = existing._id;
    } else {
      docId = await ctx.db.insert("boutiqueDocuments", {
        boutiqueId: boutique._id,
        type: args.type,
        url: storageUrl,
        publicId: args.storageId,
        status: "pending",
        createdAt: now,
      });
    }

    await ctx.db.insert("boutiqueDocumentEvents", {
      documentId: docId,
      boutiqueId: boutique._id,
      action: "uploaded",
      createdAt: now,
    });

    // Trigger ops Slack alert for document upload
    const superadmin = await ctx.db.query("users").withIndex("by_role", q => q.eq("role", "admin")).first();
    if (superadmin) {
      await triggerNotification(ctx, superadmin._id, "slack", "boutique_document_uploaded", "boutique", boutique._id, JSON.stringify({
        boutiqueName: boutique.name,
        documentType: args.type,
      }));
    }

    return docId;
  },
});

/**
 * Toggles a boutique's Accepting Orders availability status.
 * Callable by boutique owners/designers.
 */
export const toggleBoutiqueAvailability = mutation({
  args: { isAcceptingOrders: v.boolean() },
  handler: async (ctx, args) => {
    const boutique = await getMyBoutique(ctx);
    await ctx.db.patch(boutique._id, {
      isAcceptingOrders: args.isAcceptingOrders,
    });
    return { success: true, isAcceptingOrders: args.isAcceptingOrders };
  },
});

/**
 * Mutation to update boutique status, vacation modes, and capacity.
 * Handles emergency pause, quick resume, and normal setting updates.
 */
export const updateStoreStatus = mutation({
  args: {
    storeStatus: v.union(v.literal("open"), v.literal("busy"), v.literal("closed")),
    closedUntil: v.optional(v.number()),
    pauseReason: v.optional(
      v.union(
        v.literal("vacation"),
        v.literal("festival"),
        v.literal("restocking"),
        v.literal("personal"),
        v.literal("wedding"),
        v.literal("renovation"),
        v.literal("emergency"),
        v.literal("capacity"),
        v.literal("other")
      )
    ),
    storeMessage: v.optional(v.string()),
    prepTimeMinutes: v.optional(v.number()),
    weeklyClosedDays: v.optional(v.array(v.number())),
    holidayDates: v.optional(v.array(v.string())),
    isEmergency: v.optional(v.boolean()),
    isResume: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const boutique = await getMyBoutique(ctx);
    const now = Date.now();
    const patchData: any = {};

    if (args.isEmergency) {
      patchData.storeStatus = "closed";
      patchData.closedUntil = undefined;
      patchData.pauseReason = "emergency";
      patchData.storeMessage = "Closed due to an operational emergency";
      patchData.lastPausedAt = now;
      patchData.isAcceptingOrders = false;
    } else if (args.isResume) {
      patchData.storeStatus = "open";
      patchData.closedUntil = undefined;
      patchData.pauseReason = undefined;
      patchData.storeMessage = undefined;
      patchData.lastResumedAt = now;
      patchData.isAcceptingOrders = true;
    } else {
      patchData.storeStatus = args.storeStatus;
      patchData.closedUntil = args.closedUntil;
      patchData.pauseReason = args.pauseReason;
      patchData.storeMessage = args.storeMessage;
      patchData.prepTimeMinutes = args.prepTimeMinutes;
      patchData.weeklyClosedDays = args.weeklyClosedDays;
      patchData.holidayDates = args.holidayDates;

      if (args.storeStatus === "open") {
        patchData.isAcceptingOrders = true;
        if (boutique.storeStatus !== "open") {
          patchData.lastResumedAt = now;
        }
      } else {
        if (args.storeStatus === "closed") {
          patchData.isAcceptingOrders = false;
        } else {
          patchData.isAcceptingOrders = true;
        }
        if (boutique.storeStatus === "open" || !boutique.storeStatus) {
          patchData.lastPausedAt = now;
        }
      }
    }

    await ctx.db.patch(boutique._id, patchData);
    return { success: true, boutiqueId: boutique._id };
  },
});

/**
 * Fetch uploaded documents for the logged-in boutique.
 */
export const getMyBoutiqueDocuments = query({
  args: {},
  handler: async (ctx) => {
    const boutique = await getMyBoutique(ctx, undefined, true);
    const docs = await ctx.db
      .query("boutiqueDocuments")
      .withIndex("by_boutiqueId", (q) => q.eq("boutiqueId", boutique._id))
      .collect();

    // Resolve fresh signed URLs at query-time (prevents expired URL issues)
    return await Promise.all(
      docs.map(async (doc) => {
        const freshUrl = await ctx.storage.getUrl(doc.publicId);
        return {
          ...doc,
          url: freshUrl ?? doc.url, // fallback to stored value if resolution fails
        };
      })
    );
  },
});

// Helper to generate a random 32-character hex token (safe in all JS runtimes)
export function generateInviteToken(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Helper to hash a token using SHA-256 (safe in all Web Crypto runtimes)
export async function hashInviteToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function determineOnboardingStatus(ctx: any, boutique: any): Promise<"invited" | "account_claimed" | "first_product_uploaded" | "profile_incomplete" | "launch_ready"> {
  if (!boutique.ownerUserId) {
    return "invited";
  }

  // 1. Logo
  const hasLogo = !!boutique.logoUrl && (typeof boutique.logoUrl === "string" ? boutique.logoUrl.trim().length > 0 : true);
  
  // 2. Address Details
  const hasAddress = !!boutique.address && boutique.address.trim().length > 0 &&
    !!boutique.addressDetails &&
    !!boutique.addressDetails.line1 && boutique.addressDetails.line1.trim().length > 0 &&
    !!boutique.addressDetails.city && boutique.addressDetails.city.trim().length > 0 &&
    !!boutique.addressDetails.state && boutique.addressDetails.state.trim().length > 0 &&
    !!boutique.addressDetails.pincode && boutique.addressDetails.pincode.trim().length > 0;

  // 3. Contact Phone
  const hasPhone = !!boutique.phone && boutique.phone.trim().length > 0;

  // 4. Operating Hours
  const hasStoreHours = !!boutique.openingTime && boutique.openingTime.trim().length > 0 &&
    !!boutique.closingTime && boutique.closingTime.trim().length > 0;

  // 5. Bank Details
  const hasBankDetails = !!boutique.bankAccount &&
    !!boutique.bankAccount.holderName && boutique.bankAccount.holderName.trim().length > 0 &&
    !!boutique.bankAccount.accountNoLast4 && boutique.bankAccount.accountNoLast4.trim().length > 0 &&
    !!boutique.bankAccount.encryptedAccountNo && boutique.bankAccount.encryptedAccountNo.trim().length > 0 &&
    !!boutique.bankAccount.ifsc && boutique.bankAccount.ifsc.trim().length > 0;

  // 6. Products count and approval
  const firstProduct = await ctx.db
    .query("products")
    .withIndex("by_boutiqueId", (q: any) => q.eq("boutiqueId", boutique._id))
    .first();
  const hasAnyProduct = !!firstProduct;

  let hasApprovedProduct = false;
  if (boutique.activeApprovedProductCount !== undefined) {
    hasApprovedProduct = boutique.activeApprovedProductCount > 0;
  } else {
    const approvedProduct = await ctx.db
      .query("products")
      .withIndex("by_boutiqueId", (q: any) => q.eq("boutiqueId", boutique._id))
      .filter((q: any) => 
        q.and(
          q.eq(q.field("active"), true),
          q.eq(q.field("approvalStatus"), "approved")
        )
      )
      .first();
    hasApprovedProduct = !!approvedProduct;
  }

  if (hasLogo && hasAddress && hasPhone && hasStoreHours && hasBankDetails && hasApprovedProduct) {
    return "launch_ready";
  }

  if (!hasAnyProduct) {
    return "account_claimed";
  }

  const hasOtherDetails = hasLogo || hasStoreHours || hasBankDetails;
  return hasOtherDetails ? "profile_incomplete" : "first_product_uploaded";
}

export async function updateBoutiqueProductCount(ctx: any, boutiqueId: any) {
  const boutique = await ctx.db.get(boutiqueId);
  if (!boutique) return;

  const products = await ctx.db
    .query("products")
    .withIndex("by_boutiqueId", (q: any) => q.eq("boutiqueId", boutiqueId))
    .filter((q: any) =>
      q.and(
        q.eq(q.field("active"), true),
        q.eq(q.field("approvalStatus"), "approved")
      )
    )
    .collect();

  const oldVal = boutique.activeApprovedProductCount ?? 0;
  const newVal = products.length;

  await ctx.db.patch(boutiqueId, {
    activeApprovedProductCount: newVal,
  });

  if (oldVal === 0 && newVal > 0) {
    // Send welcome WhatsApp sequence #2 (first product approved)
    await ctx.scheduler.runAfter(0, internal.whatsapp.sendTemplateMessage, {
      recipient: boutique.phone,
      templateName: "first_product_approved",
      parameters: [boutique.boutiqueName],
    });
  }
}

/**
 * Fetch a single boutique by its invite token (unauthenticated).
 */
export const getBoutiqueByInviteToken = query({
  args: { inviteToken: v.string() },
  handler: async (ctx, args) => {
    const hashed = await hashInviteToken(args.inviteToken);
    const boutique = await ctx.db
      .query("boutiques")
      .withIndex("by_inviteTokenHash", (q) => q.eq("inviteTokenHash", hashed))
      .unique();

    if (!boutique) return null;

    return {
      _id: boutique._id,
      boutiqueName: boutique.boutiqueName,
      ownerName: boutique.ownerName,
      ownerEmail: boutique.ownerEmail || boutique.email,
      phone: boutique.phone,
      address: boutique.address,
      inviteStatus: boutique.inviteStatus,
      inviteExpiresAt: boutique.inviteExpiresAt,
      ownerUserId: boutique.ownerUserId,
    };
  },
});

export const getBoutiqueInternal = internalQuery({
  args: { id: v.id("boutiques") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Background action to send merchant invitations via WhatsApp and email.
 */
export const sendMerchantInviteAction = internalAction({
  args: {
    boutiqueId: v.id("boutiques"),
    rawToken: v.string(),
  },
  handler: async (ctx, args) => {
    const boutique = await ctx.runQuery(internal.boutiques.getBoutiqueInternal, {
      id: args.boutiqueId,
    });

    if (!boutique) {
      console.error(`[sendMerchantInviteAction] Boutique not found: ${args.boutiqueId}`);
      return;
    }

    const claimLink = `https://seller.hivenow.in/invite/${args.rawToken}`;
    
    // Log the claim link so developers can easily test locally without emails
    console.log(`[sendMerchantInviteAction] Direct Invite Claim Link: ${claimLink}`);

    // 1. Owner Email Notification (using extracted template with logo, preheader, and footer)
    const ownerTargetEmail = boutique.ownerEmail || boutique.email;
    console.log(`[sendMerchantInviteAction] Sending Owner Email to ${ownerTargetEmail}`);
    try {
      const emailSubject = `Welcome to Hive 🎉 Your merchant portal for ${boutique.boutiqueName} is ready!`;
      const emailHtml = getMerchantInviteTemplate({
        ownerName: boutique.ownerName || "there",
        boutiqueName: boutique.boutiqueName,
        ownerEmail: ownerTargetEmail,
        claimLink,
      });

      await ctx.runAction(internal.emails.sendNotificationEmail, {
        to: ownerTargetEmail,
        subject: emailSubject,
        html: emailHtml,
        templateName: "merchant_invite",
      });
    } catch (e) {
      console.error("[sendMerchantInviteAction] Failed to dispatch Owner Email invite:", e);
    }

    // 2. Staff Email Notifications (if staff emails exist)
    const staffEmails = [boutique.staffEmail1, boutique.staffEmail2].filter((e): e is string => Boolean(e && e.trim()));
    const staffSignInLink = "https://seller.hivenow.in/sign-in";
    
    for (const staffEmail of staffEmails) {
      console.log(`[sendMerchantInviteAction] Sending Staff Email to ${staffEmail}`);
      try {
        const staffSubject = `You've been added to ${boutique.boutiqueName} on Hive Partners! 🛍️`;
        const staffHtml = getStaffWelcomeTemplate({
          boutiqueName: boutique.boutiqueName,
          staffEmail,
          signInLink: staffSignInLink,
        });

        await ctx.runAction(internal.emails.sendNotificationEmail, {
          to: staffEmail,
          subject: staffSubject,
          html: staffHtml,
          templateName: "staff_welcome",
        });
      } catch (e) {
        console.error(`[sendMerchantInviteAction] Failed to dispatch Staff Email to ${staffEmail}:`, e);
      }
    }
  },
});


/**
 * Regenerate and resend a boutique's invite.
 */
export const resendBoutiqueInvite = mutation({
  args: { 
    boutiqueId: v.optional(v.id("boutiques")),
    id: v.optional(v.id("boutiques")),
  },
  handler: async (ctx, args) => {
    const boutiqueId = args.boutiqueId || args.id;
    if (!boutiqueId) {
      throw new ConvexError("Boutique ID is required");
    }

    const admin = await requireRole(ctx, "admin");
    const boutique = await ctx.db.get(boutiqueId);
    if (!boutique) {
      throw new ConvexError("Boutique not found");
    }

    const rawToken = generateInviteToken();
    const hashed = await hashInviteToken(rawToken);
    const now = Date.now();

    // Patch new invite token if not already claimed, or update timestamp
    if (!boutique.ownerUserId) {
      await ctx.db.patch(boutiqueId, {
        inviteTokenHash: hashed,
        inviteStatus: "sent",
        inviteSentAt: now,
        inviteExpiresAt: now + 14 * 24 * 60 * 60 * 1000,
        inviteRequestedAt: undefined,
        inviteCreatedBy: admin._id,
      });
    }

    await ctx.scheduler.runAfter(0, internal.boutiques.sendMerchantInviteAction, {
      boutiqueId,
      rawToken: boutique.ownerUserId ? "claimed" : rawToken,
    });

    await ctx.db.insert("auditLogs", {
      actorId: admin._id,
      actorRole: "admin",
      action: "boutique.invite_resent",
      entityType: "boutiques",
      entityId: boutiqueId,
      metadata: JSON.stringify({
        inviteEmail: boutique.email,
        boutiqueId,
      }),
      createdAt: now,
    });

    return { success: true, rawToken };
  },
});

/**
 * Internal action helper to trigger sends in the background to avoid timeout in mutation.
 */
export const resendMultipleInvitesAction = internalAction({
  args: {
    invites: v.array(v.object({
      boutiqueId: v.id("boutiques"),
      rawToken: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    for (const invite of args.invites) {
      try {
        await ctx.runAction(internal.boutiques.sendMerchantInviteAction, {
          boutiqueId: invite.boutiqueId,
          rawToken: invite.rawToken,
        });
      } catch (e) {
        console.error(`[resendMultipleInvitesAction] Failed for ${invite.boutiqueId}:`, e);
      }
    }
  },
});

/**
 * Resend all invites that have expired and been requested.
 */
export const resendAllBoutiqueInvites = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireRole(ctx, "admin");
    const requests = await ctx.db
      .query("boutiques")
      .collect();

    // Filter to unclaimed boutiques that have inviteRequestedAt set
    const pendingRequests = requests.filter(
      (b) => !b.ownerUserId && b.inviteRequestedAt !== undefined
    );

    if (pendingRequests.length === 0) {
      return { count: 0 };
    }

    const invitesToSend = [];
    const now = Date.now();

    for (const boutique of pendingRequests) {
      const rawToken = generateInviteToken();
      const hashed = await hashInviteToken(rawToken);

      await ctx.db.patch(boutique._id, {
        inviteTokenHash: hashed,
        inviteStatus: "sent",
        inviteSentAt: now,
        inviteExpiresAt: now + 14 * 24 * 60 * 60 * 1000,
        inviteRequestedAt: undefined,
        inviteCreatedBy: admin._id,
      });

      invitesToSend.push({
        boutiqueId: boutique._id,
        rawToken,
      });
    }

    // Schedule background dispatch action to process invites asynchronously
    await ctx.scheduler.runAfter(0, internal.boutiques.resendMultipleInvitesAction, {
      invites: invitesToSend,
    });

    return { count: invitesToSend.length };
  },
});

/**
 * Self-recovery: request a new invite for an expired token.
 */
export const requestNewInvite = mutation({
  args: { inviteToken: v.string() },
  handler: async (ctx, args) => {
    const hashed = await hashInviteToken(args.inviteToken);
    const boutique = await ctx.db
      .query("boutiques")
      .withIndex("by_inviteTokenHash", (q) => q.eq("inviteTokenHash", hashed))
      .unique();

    if (!boutique) throw new Error("Invite invalid");
    if (boutique.ownerUserId) throw new Error("Invite already claimed");

    // Rate limit: max 1 request per 5 minutes
    const now = Date.now();
    if (boutique.inviteRequestedAt && (now - boutique.inviteRequestedAt) < 5 * 60 * 1000) {
      throw new Error("Please wait a few minutes before requesting again.");
    }

    await ctx.db.patch(boutique._id, {
      inviteRequestedAt: now,
    });

    return { success: true };
  },
});

/**
 * Claim an invite using a token and link it to the authenticated Clerk user.
 */
export const claimBoutiqueInvite = mutation({
  args: { inviteToken: v.string() },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, undefined, { skipIssuerGating: true });
    const hashed = await hashInviteToken(args.inviteToken);
    const boutique = await ctx.db
      .query("boutiques")
      .withIndex("by_inviteTokenHash", (q) => q.eq("inviteTokenHash", hashed))
      .unique();

    if (!boutique) throw new ConvexError("Invalid invite link");
    if (boutique.ownerUserId) throw new ConvexError("This merchant account has already been claimed");
    if (boutique.inviteExpiresAt && boutique.inviteExpiresAt < Date.now()) {
      throw new ConvexError("This invite link has expired");
    }

    const existingBoutique = await ctx.db
      .query("boutiques")
      .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", user._id))
      .unique();

    if (existingBoutique) {
      throw new ConvexError("You already own a boutique and cannot claim another one.");
    }

    const now = Date.now();

    // 1. Assign ownership and auto-approve if PENDING
    const patchData: any = {
      ownerUserId: user._id,
      userId: user._id, // Legacy compatibility
      inviteStatus: "claimed",
      claimedAt: now,
      inviteTokenHash: undefined,
      inviteRequestedAt: undefined,
    };

    // Auto-approve PENDING boutiques when claimed via valid invite
    if (boutique.status === "PENDING") {
      patchData.status = "APPROVED";
      patchData.approvedAt = now;
    }

    await ctx.db.patch(boutique._id, patchData);

    // 2. Upgrade user role
    await ctx.db.patch(user._id, {
      role: "boutique_owner",
      updatedAt: now,
    });

    // Send welcome WhatsApp (with safety wrap in case template isn't approved yet)
    try {
      await ctx.scheduler.runAfter(0, internal.whatsapp.sendTemplateMessage, {
        recipient: boutique.phone,
        templateName: "merchant_welcome",
        parameters: [boutique.boutiqueName],
      });
    } catch (e) {
      console.warn("[claimBoutiqueInvite] WhatsApp merchant_welcome failed (template may not be approved):", e);
    }

    // 3. Log Claim Event
    await ctx.db.insert("auditLogs", {
      actorId: user._id,
      actorRole: "boutique_owner",
      action: "boutique.claimed",
      entityType: "boutiques",
      entityId: boutique._id as unknown as string,
      metadata: JSON.stringify({
        inviteEmail: boutique.email,
        boutiqueId: boutique._id,
        previousStatus: boutique.status,
        newStatus: boutique.status === "PENDING" ? "APPROVED" : boutique.status,
      }),
      createdAt: now,
    });

    // 4. Admin Slack notification — founder gets instant alert when a partner activates
    try {
      const superadmin = await ctx.db.query("users")
        .withIndex("by_role", (q: any) => q.eq("role", "admin")).first();
      if (superadmin) {
        await triggerNotification(
          ctx, superadmin._id, "slack", "boutique_claimed", "boutique",
          boutique._id as unknown as string,
          JSON.stringify({
            boutiqueName: boutique.boutiqueName,
            claimedBy: user.email,
            claimedAt: new Date(now).toISOString(),
          })
        );
      }
    } catch (e) {
      console.warn("[claimBoutiqueInvite] Failed to send admin Slack notification:", e);
    }

    return { success: true, boutiqueId: boutique._id };
  },
});

/**
 * Get Founder Onboarding dashboard metrics, invite requests, and warning list.
 */
export const getFounderOnboardingMetrics = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");

    const boutiques = await ctx.db.query("boutiques").collect();

    let invited = 0;
    let account_claimed = 0;
    let first_product_uploaded = 0;
    let profile_incomplete = 0;
    let launch_ready = 0;

    const newInviteRequests: any[] = [];
    const stuckInvites: any[] = [];
    const stuckClaimedNoProducts: any[] = [];
    const stuckCatalogApproval: any[] = [];
    const stuckLaunchReadyNoOrders: any[] = [];

    const now = Date.now();

    for (const b of boutiques) {
      const status = await determineOnboardingStatus(ctx, b);
      
      if (status === "invited") invited++;
      else if (status === "account_claimed") account_claimed++;
      else if (status === "first_product_uploaded") first_product_uploaded++;
      else if (status === "profile_incomplete") profile_incomplete++;
      else if (status === "launch_ready") launch_ready++;

      // Check if self-recovery invite request is pending
      if (!b.ownerUserId && b.inviteRequestedAt !== undefined) {
        newInviteRequests.push({
          _id: b._id,
          boutiqueName: b.boutiqueName,
          ownerName: b.ownerName,
          email: b.email,
          phone: b.phone,
          inviteRequestedAt: b.inviteRequestedAt,
        });
      }

      // Stuck metrics calculation
      let referenceTime = b.inviteSentAt || b.createdAt;
      if (b.claimedAt) {
        referenceTime = b.claimedAt;
      }
      const elapsedMs = now - referenceTime;
      const daysElapsed = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));

      if (status === "invited" && daysElapsed >= 3) {
        stuckInvites.push({
          _id: b._id,
          boutiqueName: b.boutiqueName,
          ownerName: b.ownerName,
          phone: b.phone,
          daysWaiting: daysElapsed,
        });
      }

      if (status === "account_claimed" && daysElapsed >= 3) {
        stuckClaimedNoProducts.push({
          _id: b._id,
          boutiqueName: b.boutiqueName,
          ownerName: b.ownerName,
          phone: b.phone,
          daysWaiting: daysElapsed,
        });
      }

      if (status === "first_product_uploaded" || status === "profile_incomplete") {
        const totalProducts = await ctx.db
          .query("products")
          .withIndex("by_boutiqueId", (q: any) => q.eq("boutiqueId", b._id))
          .collect();
        const approvedCount = totalProducts.filter((p: any) => p.active && p.approvalStatus === "approved").length;

        if (totalProducts.length > 0 && approvedCount === 0) {
          stuckCatalogApproval.push({
            _id: b._id,
            boutiqueName: b.boutiqueName,
            ownerName: b.ownerName,
            phone: b.phone,
            uploadedCount: totalProducts.length,
          });
        }
      }

      if (status === "launch_ready") {
        const orders = await ctx.db
          .query("orders")
          .withIndex("by_boutiqueId", (q: any) => q.eq("boutiqueId", b._id))
          .take(1);
        
        if (orders.length === 0 && daysElapsed >= 7) {
          stuckLaunchReadyNoOrders.push({
            _id: b._id,
            boutiqueName: b.boutiqueName,
            ownerName: b.ownerName,
            phone: b.phone,
            daysActive: daysElapsed,
          });
        }
      }
    }

    return {
      funnel: {
        invited,
        account_claimed,
        first_product_uploaded,
        profile_incomplete,
        launch_ready,
      },
      newInviteRequests,
      stuckInvites,
      stuckClaimedNoProducts,
      stuckCatalogApproval,
      stuckLaunchReadyNoOrders,
    };
  },
});

export const getBoutiqueTierAndStats = query({
  args: { boutiqueId: v.id("boutiques") },
  handler: async (ctx, args) => {
    // 1. Verify the targeted boutique document exists first
    const boutique = await ctx.db.get(args.boutiqueId);
    if (!boutique) {
      return { tier: "Bronze", totalOrders: 0, totalRevenue: 0 };
    }

    const { user } = await requireBoutiqueOwnership(ctx, args.boutiqueId);

    // If staff user, return safe fallback values (omit sales/financial details)
    if (user.role === "boutique") {
      return { tier: "Bronze" as const, totalOrders: 0, totalRevenue: 0 };
    }

    // 2. Fetch completed records using the newly registered schema index
    const deliveredOrders = await ctx.db
      .query("orders")
      .withIndex("by_boutiqueId_status", (q) =>
        q.eq("boutiqueId", args.boutiqueId).eq("status", "delivered")
      )
      .collect();

    // 3. Fallback handle empty array arrays gracefully
    const safeOrders = deliveredOrders || [];
    const totalOrders = safeOrders.length;
    // Note: changed totalPrice to total, because totalPrice doesn't exist in orders schema
    const totalRevenuePaise = safeOrders.reduce((sum, order) => sum + (order.total || 0), 0);
    const totalRevenue = totalRevenuePaise / 100;

    let tier: "Bronze" | "Silver" | "Gold" = "Bronze";
    if (totalOrders >= 150 && totalRevenue >= 400000) tier = "Gold";
    else if (totalOrders >= 30 && totalRevenue >= 75000) tier = "Silver";

    return { tier, totalOrders, totalRevenue };
  },
});

export const acceptLegalTerms = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    const boutique = await getMyBoutique(ctx);
    const now = Date.now();
    await ctx.db.patch(boutique._id, {
      hasAcceptedLegalTerms: true,
      legalTermsAcceptedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: user._id,
      actorRole: user.role || "boutique_owner",
      action: "boutique.legal_terms_accepted",
      entityType: "boutiques",
      entityId: boutique._id as unknown as string,
      metadata: JSON.stringify({
        boutiqueId: boutique._id,
        userId: user._id,
        acceptedAt: now,
      }),
      createdAt: now,
    });

    return { success: true };
  },
});

async function checkForDuplicateBoutique(ctx: any, email: string, phone: string) {
  const existingByEmail = await ctx.db
    .query("boutiques")
    .withIndex("by_email", (q: any) => q.eq("email", email))
    .collect();

  for (const b of existingByEmail) {
    if (b.status !== "REJECTED" && b.status !== "SUSPENDED" && b.status !== "DELETED") {
      throw new ConvexError(`A boutique with email ${email} already exists (Status: ${b.status}).`);
    }
  }

  const existingByPhone = await ctx.db
    .query("boutiques")
    .filter((q: any) => q.eq(q.field("phone"), phone))
    .collect();

  for (const b of existingByPhone) {
    if (b.status !== "REJECTED" && b.status !== "SUSPENDED" && b.status !== "DELETED") {
      throw new ConvexError(`A boutique with phone ${phone} already exists (Status: ${b.status}).`);
    }
  }
}

async function validateAndCheckDuplicateRazorpayAccountId(ctx: any, razorpayAccountId?: string, excludeBoutiqueId?: string) {
  if (!razorpayAccountId) return;
  const trimmed = razorpayAccountId.trim();
  if (!trimmed) return;

  if (!trimmed.startsWith("acc_")) {
    throw new ConvexError(`Razorpay Linked Account ID must start with "acc_". Received: "${trimmed}"`);
  }

  const existing = await ctx.db
    .query("boutiques")
    .withIndex("by_razorpayAccountId", (q: any) => q.eq("razorpayAccountId", trimmed))
    .first();

  if (existing && existing._id !== excludeBoutiqueId) {
    throw new ConvexError(`The Razorpay Account ID "${trimmed}" is already assigned to boutique "${existing.boutiqueName}".`);
  }
}

function getDefaultBoutiqueConfig() {
  return {
    merchantTier: "Bronze" as const,
    storeCategory: "women_fashion" as const,
    sellerModel: "boutique" as const,
    activeApprovedProductCount: 0,
    whatsAppNotificationsEnabled: true,
    pricingTier: "tier1" as const,
  };
}

export const getById = internalQuery({
  args: { id: v.id("boutiques") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const updateRazorpayDetails = internalMutation({
  args: {
    boutiqueId: v.id("boutiques"),
    razorpayAccountId: v.string(),
    razorpayAccountStatus: v.union(
      v.literal("created"),
      v.literal("active"),
      v.literal("suspended"),
      v.literal("needs_attention")
    ),
    businessType: v.union(
      v.literal("individual"),
      v.literal("proprietorship"),
      v.literal("partnership"),
      v.literal("private_limited"),
      v.literal("llp")
    ),
    pan: v.string(),
    bankAccount: v.optional(v.object({
      holderName: v.string(),
      accountNo:  v.string(),
      ifsc:       v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const patchData: any = {
      razorpayAccountId: args.razorpayAccountId,
      razorpayAccountStatus: args.razorpayAccountStatus,
      razorpayAccountLinkedAt: Date.now(),
      businessType: args.businessType,
      pan: args.pan,
    };

    if (args.bankAccount) {
      const secret = process.env.BANK_ENCRYPTION_KEY;
      if (!secret) throw new ConvexError("FATAL: BANK_ENCRYPTION_KEY environment variable is not configured. Cannot process bank data.");
      const encryptedAccountNo = await encryptData(args.bankAccount.accountNo, secret);
      const accountNoLast4 = args.bankAccount.accountNo.slice(-4).padStart(args.bankAccount.accountNo.length, "X");
      patchData.bankAccount = {
        holderName: args.bankAccount.holderName,
        accountNoLast4,
        encryptedAccountNo,
        ifsc: args.bankAccount.ifsc,
      };
    }

    await ctx.db.patch(args.boutiqueId, patchData);
  },
});

export const getBoutiqueByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();
    if (!user) return null;
    
    let boutique = await ctx.db
      .query("boutiques")
      .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", user._id))
      .unique();

    if (!boutique && user.email) {
      boutique = await ctx.db
        .query("boutiques")
        .withIndex("by_email", (q) => q.eq("email", user.email))
        .unique();
    }
    return boutique;
  }
});

export const getBoutiqueByEmail = query({
  args: { email: v.string(), secret: v.string() },
  handler: async (ctx, args) => {
    const expectedSecret = process.env.CONVEX_SERVER_SECRET || process.env.CLERK_SECRET_KEY;
    if (!expectedSecret || args.secret !== expectedSecret) {
      throw new Error("Unauthorized: Invalid secret key.");
    }
    const normalized = args.email.trim().toLowerCase();
    // Try indexed owner email first (fast path)
    let boutique = await ctx.db
      .query("boutiques")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .unique();

    if (!boutique) {
      // Fallback: scan for ownerEmail or staffEmail matches
      const all = await ctx.db.query("boutiques").collect();
      boutique = all.find((b: any) =>
        b.status !== "DELETED" && b.status !== "REJECTED" && (
          (b.ownerEmail && b.ownerEmail.trim().toLowerCase() === normalized) ||
          (b.staffEmail1 && b.staffEmail1.trim().toLowerCase() === normalized) ||
          (b.staffEmail2 && b.staffEmail2.trim().toLowerCase() === normalized)
        )
      ) as any ?? null;
    }
    return boutique ?? null;
  },
});

export const updateBoutiqueRazorpayOnboarding = mutation({
  args: {
    secret: v.string(),
    boutiqueId: v.id("boutiques"),
    razorpayAccountId: v.string(),
    kycStatus: v.union(
      v.literal("not_started"),
      v.literal("created"),
      v.literal("under_review"),
      v.literal("activated"),
      v.literal("needs_clarification")
    )
  },
  handler: async (ctx, args) => {
    const expectedSecret = process.env.CONVEX_SERVER_SECRET || process.env.CLERK_SECRET_KEY;
    if (!expectedSecret || args.secret !== expectedSecret) {
      throw new Error("Unauthorized: Invalid secret key.");
    }
    await ctx.db.patch(args.boutiqueId, {
      razorpayAccountId: args.razorpayAccountId,
      kycStatus: args.kycStatus,
      razorpayAccountStatus: args.kycStatus === "activated" ? "active" : "created",
    });
  }
});

export const updateBoutiqueKycStatus = mutation({
  args: {
    secret: v.string(),
    razorpayAccountId: v.string(),
    kycStatus: v.union(
      v.literal("not_started"),
      v.literal("created"),
      v.literal("under_review"),
      v.literal("activated"),
      v.literal("needs_clarification")
    )
  },
  handler: async (ctx, args) => {
    const expectedSecret = process.env.CONVEX_SERVER_SECRET || process.env.CLERK_SECRET_KEY;
    if (!expectedSecret || args.secret !== expectedSecret) {
      throw new Error("Unauthorized: Invalid secret key.");
    }
    const boutique = await ctx.db
      .query("boutiques")
      .withIndex("by_razorpayAccountId", (q) => q.eq("razorpayAccountId", args.razorpayAccountId))
      .unique();
    if (!boutique) {
      throw new Error(`Boutique not found for Razorpay Account ID: ${args.razorpayAccountId}`);
    }
    await ctx.db.patch(boutique._id, {
      kycStatus: args.kycStatus,
      razorpayAccountStatus: args.kycStatus === "activated" ? "active" : boutique.razorpayAccountStatus,
    });
  }
});

export const updateBoutiqueStaff = mutation({
  args: {
    staffEmail1: v.optional(v.string()),
    staffEmail2: v.optional(v.string()),
    staffPhone1: v.optional(v.string()),
    staffPhone2: v.optional(v.string()),
    staffNotificationSelection: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const boutique = await getMyBoutique(ctx);

    if (user.role !== "boutique" && user.role !== "boutique_owner" && user.role !== "admin") {
      throw new ConvexError("Unauthorized: Only boutique owners can manage staff.");
    }

    const oldEmail1 = boutique.staffEmail1 ? boutique.staffEmail1.trim().toLowerCase() : "";
    const oldEmail2 = boutique.staffEmail2 ? boutique.staffEmail2.trim().toLowerCase() : "";
    const newEmail1 = args.staffEmail1 ? args.staffEmail1.trim().toLowerCase() : "";
    const newEmail2 = args.staffEmail2 ? args.staffEmail2.trim().toLowerCase() : "";

    let formattedPhone1: string | undefined = undefined;
    let formattedPhone2: string | undefined = undefined;

    if (args.staffPhone1 && args.staffPhone1.trim().length > 0) {
      try {
        formattedPhone1 = normalizePhoneNumber(args.staffPhone1);
      } catch (err: any) {
        throw new ConvexError(err.message || "Invalid Staff WhatsApp 1 phone number format.");
      }
    }

    if (args.staffPhone2 && args.staffPhone2.trim().length > 0) {
      try {
        formattedPhone2 = normalizePhoneNumber(args.staffPhone2);
      } catch (err: any) {
        throw new ConvexError(err.message || "Invalid Staff WhatsApp 2 phone number format.");
      }
    }

    const patchData: any = {
      staffEmail1: newEmail1 || undefined,
      staffEmail2: newEmail2 || undefined,
      staffPhone1: formattedPhone1,
      staffPhone2: formattedPhone2,
      staffNotificationSelection: args.staffNotificationSelection,
    };

    await ctx.db.patch(boutique._id, patchData);

    const now = Date.now();
    const oldEmails = [oldEmail1, oldEmail2].filter(Boolean);
    const newEmails = [newEmail1, newEmail2].filter(Boolean);

    // Revoke old staff access
    for (const oldEmail of oldEmails) {
      if (!newEmails.some(ne => normalizeEmail(ne) === normalizeEmail(oldEmail))) {
        const normOld = normalizeEmail(oldEmail);
        const existingUser = normOld
          ? await ctx.db
              .query("users")
              .withIndex("by_normalizedEmail", (q) => q.eq("normalizedEmail", normOld))
              .first()
          : null;

        if (existingUser && existingUser.role === "boutique") {
          await ctx.db.patch(existingUser._id, { role: "customer", updatedAt: now });

          await ctx.db.insert("auditLogs", {
            actorRole: "system",
            action: "boutique_staff.revoked",
            entityType: "boutiques",
            entityId: String(boutique._id),
            metadata: JSON.stringify({ userId: existingUser._id, email: oldEmail }),
            createdAt: now,
          });
        }
      }
    }

    // Grant new staff access
    for (const newEmail of newEmails) {
      if (newEmail && !oldEmails.some(oe => normalizeEmail(oe) === normalizeEmail(newEmail))) {
        const normNew = normalizeEmail(newEmail);
        const existingUser = normNew
          ? await ctx.db
              .query("users")
              .withIndex("by_normalizedEmail", (q) => q.eq("normalizedEmail", normNew))
              .first()
          : null;

        if (existingUser && existingUser.role !== "admin" && existingUser.role !== "boutique_owner") {
          await ctx.db.patch(existingUser._id, { role: "boutique", updatedAt: now });

          await ctx.db.insert("auditLogs", {
            actorRole: "system",
            action: "boutique_staff.linked",
            entityType: "boutiques",
            entityId: String(boutique._id),
            metadata: JSON.stringify({ userId: existingUser._id, email: newEmail }),
            createdAt: now,
          });
        }
      }
    }

    return boutique._id;
  },
});



