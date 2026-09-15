// convex/users.ts
// User sync and profile queries for the HIVE customer app.

import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { getAuthenticatedUser, requireRole } from "./lib/auth";
import { internal } from "./_generated/api";

/**
 * Normalizes email addresses for deduplication and account linking.
 * - Trims whitespace
 * - Converts to lowercase
 * - Strips plus (+) tags (sub-addressing)
 * - Removes dots (.) for Gmail and Googlemail addresses
 */
export function normalizeEmail(email?: string): string | undefined {
  if (!email) return undefined;
  let clean = email.trim().toLowerCase();
  const parts = clean.split("@");
  if (parts.length !== 2) return clean;
  let local = parts[0];
  let domain = parts[1];
  if (!local || !domain) return clean;

  // Strip sub-address tag if present (e.g., name+tag@domain.com -> name@domain.com)
  const plusIndex = local.indexOf("+");
  if (plusIndex !== -1) {
    local = local.substring(0, plusIndex);
  }

  // Remove dots for gmail.com and googlemail.com domains
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
  }

  return `${local}@${domain}`;
}

/**
 * Upsert the Clerk-authenticated user into the `users` table.
 * Called once on every login from the UserSync client component.
 * NEVER accepts userId as an argument – always derived server-side.
 */
export const syncUser = mutation({
  args: {
    email: v.optional(v.string()),
    name:  v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    // Use tokenIdentifier as the canonical stable Clerk ID
    const clerkId = identity.subject;

    const isFirebase = identity.issuer && identity.issuer.includes("securetoken.google.com");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();

    const now = Date.now();
    const originalEmail = args.email;
    const emailNormalized = normalizeEmail(args.email);

    let targetUserId = existing?._id;
    let targetUserRole = existing?.role ?? "customer";

    if (existing) {
      // Update email/name/phone in case they changed in Clerk
      const hasChanges = (args.email !== undefined && (
        existing.email !== args.email ||
        existing.originalEmail !== args.email ||
        existing.normalizedEmail !== emailNormalized
      )) || (args.phone !== undefined && existing.phone !== args.phone) || existing.authProvider !== (isFirebase ? "firebase" : "clerk");
      if (hasChanges) {
        await ctx.db.patch(existing._id, {
          email:           args.email ?? existing.email,
          originalEmail:   args.email ?? existing.originalEmail,
          normalizedEmail: emailNormalized ?? existing.normalizedEmail,
          phone:           args.phone ?? existing.phone,
          isPhoneVerified: args.phone !== undefined ? true : existing.isPhoneVerified,
          authProvider:    isFirebase ? "firebase" : "clerk",
          updatedAt: now,
        });
      }
    } else {
      // Section 3 Cut: Do NOT soft-link by email/phone for Firebase customer logins to prevent account takeover vectors
      if (!isFirebase && emailNormalized) {
        const existingEmailUser = await ctx.db
          .query("users")
          .withIndex("by_normalizedEmail", (q) => q.eq("normalizedEmail", emailNormalized))
          .unique();

        if (existingEmailUser) {
          // Link Clerk ID to the existing credentials user
          await ctx.db.patch(existingEmailUser._id, {
            clerkId,
            email:           originalEmail ?? existingEmailUser.email,
            originalEmail:   originalEmail ?? existingEmailUser.originalEmail,
            normalizedEmail: emailNormalized,
            phone:           args.phone ?? existingEmailUser.phone,
            isPhoneVerified: args.phone !== undefined ? true : existingEmailUser.isPhoneVerified,
            authProvider:    "clerk",
            updatedAt:       now,
          });
          targetUserId = existingEmailUser._id;
          targetUserRole = existingEmailUser.role;

          // Audit link
          await ctx.db.insert("auditLogs", {
            actorRole: "system",
            action: "user.linked_clerk",
            entityType: "users",
            entityId: existingEmailUser._id,
            metadata: JSON.stringify({ clerkId, email: originalEmail, normalizedEmail: emailNormalized }),
            createdAt: now,
          });
        }
      }

      if (!targetUserId) {
        // Create new user
        const userId = await ctx.db.insert("users", {
          clerkId,
          email:           originalEmail,
          originalEmail,
          normalizedEmail: emailNormalized,
          phone:           args.phone,
          role:            "customer",
          authProvider:    isFirebase ? "firebase" : "clerk",
          isActive:        true,
          isPhoneVerified: args.phone !== undefined,
          createdAt:       now,
          updatedAt:       now,
        });
        targetUserId = userId;

        // Create default customer profile
        await ctx.db.insert("customerProfiles", {
          userId,
          displayName:          args.name ?? originalEmail?.split("@")[0] ?? "Customer",
          hiveScore:            100,
          totalOrders:          0,
          totalClaimsSubmitted: 0,
          updatedAt:            now,
        });

        // Audit creation
        await ctx.db.insert("auditLogs", {
          actorRole: "system",
          action: "user.created",
          entityType: "users",
          entityId: userId,
          metadata: JSON.stringify({ clerkId, email: originalEmail, normalizedEmail: emailNormalized }),
          createdAt: now,
        });
      }
    }

    // Auto link approved boutique owner/staff by normalized email (Firebase + Clerk both allowed).
    // Uses the server-verified identity.email, never args.email, so a caller can't spoof
    // ownership of a boutique by lying about the email in the mutation args.
    const verifiedEmailNormalized = normalizeEmail(identity.email ?? undefined);
    if (verifiedEmailNormalized && targetUserRole !== "admin") {
      const emailNormalized = verifiedEmailNormalized;
      let boutique = await ctx.db
        .query("boutiques")
        .withIndex("by_email", (q) => q.eq("email", emailNormalized))
        .unique();

      if (!boutique) {
        const allBoutiques = await ctx.db.query("boutiques").collect();
        boutique = allBoutiques.find((b: any) =>
          b.status !== "DELETED" && b.status !== "REJECTED" && (
            (b.email && normalizeEmail(b.email) === emailNormalized) ||
            (b.ownerEmail && normalizeEmail(b.ownerEmail) === emailNormalized)
          )
        ) as any;
      }

      // Auto-link boutique owner by email: if admin created a boutique with this email,
      // the person signing in with it IS the intended owner — auto-approve and link.
      if (boutique && boutique.status !== "DELETED" && boutique.status !== "REJECTED" && targetUserId) {
        const boutiqueUpdate: any = { 
          userId: targetUserId,
          ownerUserId: targetUserId,
          inviteStatus: "claimed",
          claimedAt: now,
        };
        // Auto-approve PENDING boutiques when owner signs in
        if (boutique.status === "PENDING") {
          boutiqueUpdate.status = "APPROVED";
          boutiqueUpdate.approvedAt = now;
        }
        await ctx.db.patch(boutique._id, boutiqueUpdate);
        await ctx.db.patch(targetUserId, { role: "boutique_owner", updatedAt: now });
        targetUserRole = "boutique_owner";

        await ctx.db.insert("auditLogs", {
          actorRole: "system",
          action: "boutique.approved",
          entityType: "boutiques",
          entityId: boutique._id,
          metadata: JSON.stringify({ userId: targetUserId, email: originalEmail, normalizedEmail: emailNormalized, previousStatus: boutique.status }),
          createdAt: now,
        });
      } else if (!boutique && targetUserId) {
        // Check if user is staff for any boutique (no status guard — admin entered the email)
        const allBoutiques = await ctx.db.query("boutiques").collect();
        const staffBoutique = allBoutiques.find(b => 
          b.status !== "DELETED" && (
            (b.staffEmail1 && normalizeEmail(b.staffEmail1) === emailNormalized) || 
            (b.staffEmail2 && normalizeEmail(b.staffEmail2) === emailNormalized)
          )
        );

        if (staffBoutique) {
          if (targetUserRole !== "boutique" && targetUserRole !== "boutique_owner") {
            await ctx.db.patch(targetUserId, { role: "boutique", updatedAt: now });
            targetUserRole = "boutique";

            await ctx.db.insert("auditLogs", {
              actorRole: "system",
              action: "boutique_staff.linked",
              entityType: "boutiques",
              entityId: staffBoutique._id,
              metadata: JSON.stringify({ userId: targetUserId, email: originalEmail, normalizedEmail: emailNormalized }),
              createdAt: now,
            });
          }
        } else if (targetUserRole === "boutique") {
          // If the user had boutique role solely as staff but is no longer staff on any active boutique and doesn't own one, demote to customer
          const ownedBoutique = await ctx.db.query("boutiques").withIndex("by_ownerUserId", q => q.eq("ownerUserId", targetUserId!)).first();
          if (!ownedBoutique) {
            await ctx.db.patch(targetUserId, { role: "customer", updatedAt: now });
            targetUserRole = "customer";

            await ctx.db.insert("auditLogs", {
              actorRole: "system",
              action: "boutique_staff.revoked",
              entityType: "boutiques",
              entityId: "syncUser_cleanup",
              metadata: JSON.stringify({ userId: targetUserId, email: originalEmail, normalizedEmail: emailNormalized }),
              createdAt: now,
            });
          }
        }
      }
    }

    if (targetUserRole === "boutique_owner" && originalEmail && targetUserId) {
      let boutique = await ctx.db
        .query("boutiques")
        .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", targetUserId))
        .unique();

      if (!boutique && emailNormalized) {
        boutique = await ctx.db
          .query("boutiques")
          .withIndex("by_email", (q) => q.eq("email", emailNormalized))
          .unique();
      }

      if (!boutique) {
        // Create a default boutique for this boutique owner so they can log in
        await ctx.db.insert("boutiques", {
          boutiqueName: args.name ? `${args.name}'s Boutique` : "My Boutique",
          ownerName: args.name ?? "Boutique Owner",
          email: originalEmail,
          phone: "+919999999999",
          address: "123 Fashion Street, Hyderabad, Telangana",
          latitude: 17.3850,
          longitude: 78.4867,
          deliveryRadiusKm: 10,
          description: "Welcome to my design boutique!",
          status: "APPROVED",
          ownerEmail: originalEmail,
          ownerUserId: targetUserId,
          userId: targetUserId,
          name: args.name ? `${args.name}'s Boutique` : "My Boutique",
          slug: (args.name ? `${args.name}'s Boutique` : "My Boutique").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
          createdAt: now,
        });
      } else {
        const updates: any = {};
        // Secure Clerk Takeover: only assign ownerUserId/userId if they are currently unassigned
        if (!boutique.ownerUserId) updates.ownerUserId = targetUserId;
        if (!boutique.userId) updates.userId = targetUserId;
        if (Object.keys(updates).length > 0) {
          await ctx.db.patch(boutique._id, updates);
        }
      }
    }

    return targetUserId;
  },
});

/**
 * Returns the current user's DB document.
 * Returns null if unauthenticated or not yet synced.
 */
export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
  },
});

/**
 * Promotes the currently authenticated user to admin.
 * Used for development/testing access to admin views.
 */
export const makeMeAdmin = mutation({
  args: {},
  handler: async (ctx) => {
    throw new Error("makeMeAdmin is permanently disabled.");
  },
});

/**
 * Checks if at least one admin exists in the system.
 */
export const hasAdmins = query({
  args: {},
  handler: async (ctx) => {
    const existingAdmin = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .first();
    return !!existingAdmin;
  },
});

/**
 * Returns all users. Requires admin privileges.
 */
export const getUsers = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const me = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!me || me.role !== "admin") {
      throw new Error("Unauthorized: Only admins can view users.");
    }

    // Sort by updatedAt descending so newly upgraded boutique owners jump to the top
    const allUsers = await ctx.db.query("users").collect();
    return allUsers.sort((a, b) => (b.updatedAt ?? b._creationTime) - (a.updatedAt ?? a._creationTime));
  },
});

/**
 * Updates a user's role. Requires admin privileges.
 */
export const updateUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("customer"), v.literal("seller_pending"), v.literal("seller_rejected"), v.literal("boutique_owner"), v.literal("admin")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const me = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!me || me.role !== "admin") {
      throw new Error("Unauthorized: Only admins can change roles.");
    }

    if ((args.role as string) === "admin") {
      throw new Error("Direct admin promotion is disabled. Use the dual-signature proposal/approval flow instead.");
    }

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) throw new Error("User not found");
    const oldRole = targetUser.role;

    // Self-demotion protection
    if (targetUser._id === me._id && (args.role as string) !== "admin") {
      throw new Error("Self-Demotion Protection: You cannot demote yourself from the admin role.");
    }

    // Last admin protection
    if (oldRole === "admin" && (args.role as string) !== "admin") {
      const allAdmins = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "admin"))
        .collect();
      const activeAdminsCount = allAdmins.filter((u) => u.isActive).length;
      if (activeAdminsCount <= 1) {
        throw new Error("Admin Safety Guard: Cannot demote the last remaining active admin in the system.");
      }
    }

    await ctx.db.patch(args.userId, {
      role: args.role,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("auditLogs", {
      actorRole: "admin",
      actorId: me._id,
      action: "user.role_changed",
      entityType: "users",
      entityId: args.userId,
      metadata: JSON.stringify({
        oldRole,
        newRole: args.role,
        reason: "admin_manual",
      }),
      createdAt: Date.now(),
    });

    return args.userId;
  },
});

/**
 * Propose promoting a user to the admin role. Requires admin privileges.
 */
export const proposeAdminPromotion = mutation({
  args: {
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const me = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!me || me.role !== "admin") {
      throw new Error("Unauthorized: Only admins can propose promotions.");
    }

    const targetUser = await ctx.db.get(args.targetUserId);
    if (!targetUser) throw new Error("Target user not found");

    if (targetUser.role === "admin") {
      throw new Error("Target user is already an admin.");
    }

    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours expiry

    // Check if there's already an active pending proposal for this user
    const existing = await ctx.db
      .query("adminRoleProposals")
      .withIndex("by_targetUserId", (q) => q.eq("targetUserId", args.targetUserId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    const activeProposal = existing.find((p) => p.expiresAt > now);
    if (activeProposal) {
      return activeProposal._id;
    }

    const proposalId = await ctx.db.insert("adminRoleProposals", {
      targetUserId: args.targetUserId,
      requestedRole: "admin",
      proposedBy: me._id,
      proposedAt: now,
      expiresAt,
      status: "pending",
    });

    await ctx.db.insert("auditLogs", {
      actorRole: "admin",
      actorId: me._id,
      action: "admin_promotion.proposed",
      entityType: "adminRoleProposals",
      entityId: proposalId,
      metadata: JSON.stringify({
        targetUserId: args.targetUserId,
        expiresAt,
      }),
      createdAt: now,
    });

    return proposalId;
  },
});

/**
 * Approve a pending admin promotion proposal. Requires dual-signature.
 */
export const approveAdminPromotion = mutation({
  args: {
    proposalId: v.id("adminRoleProposals"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const me = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!me || me.role !== "admin") {
      throw new Error("Unauthorized: Only admins can approve promotions.");
    }

    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) throw new Error("Proposal not found.");

    const now = Date.now();

    if (proposal.status !== "pending") {
      throw new Error(`Proposal is already ${proposal.status}.`);
    }

    if (proposal.expiresAt <= now) {
      await ctx.db.patch(args.proposalId, { status: "rejected", rejectionReason: "Proposal expired." });
      throw new Error("Proposal has expired.");
    }

    // Dual-Signature constraint: proposer cannot approve
    if (proposal.proposedBy === me._id) {
      throw new Error("Dual-Signature Protection: Proposer cannot approve their own admin proposal.");
    }

    const targetUser = await ctx.db.get(proposal.targetUserId);
    if (!targetUser) throw new Error("Target user not found.");

    const oldRole = targetUser.role;

    // Apply the promotion
    await ctx.db.patch(proposal.targetUserId, {
      role: "admin",
      updatedAt: now,
    });

    // Mark proposal approved
    await ctx.db.patch(args.proposalId, {
      status: "approved",
      approvedBy: me._id,
      approvedAt: now,
    });

    // Write audit logs
    await ctx.db.insert("auditLogs", {
      actorRole: "admin",
      actorId: me._id,
      action: "admin_promotion.approved",
      entityType: "adminRoleProposals",
      entityId: args.proposalId,
      metadata: JSON.stringify({
        targetUserId: proposal.targetUserId,
        proposedBy: proposal.proposedBy,
      }),
      createdAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorRole: "admin",
      actorId: me._id,
      action: "user.role_changed",
      entityType: "users",
      entityId: proposal.targetUserId,
      metadata: JSON.stringify({
        oldRole,
        newRole: "admin",
        reason: "dual_signature_promotion",
      }),
      createdAt: now,
    });

    return proposal.targetUserId;
  },
});

export const syncUserFromWebhook = internalMutation({
  args: {
    clerkId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    isEmailVerified: v.boolean(),
    phone: v.optional(v.string()),
    isPhoneVerified: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const originalEmail = args.email;
    const emailNormalized = normalizeEmail(args.email);

    // 1. Check if user already exists with this clerkId
    let clerkUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    // 2. If no clerkId match, check if we can link by verified email
    if (!clerkUser && emailNormalized && args.isEmailVerified) {
      const existingEmailUser = await ctx.db
        .query("users")
        .withIndex("by_normalizedEmail", (q) => q.eq("normalizedEmail", emailNormalized))
        .unique();

      if (existingEmailUser) {
        // Safe Link: Add clerkId to the existing credentials/Google record
        await ctx.db.patch(existingEmailUser._id, {
          clerkId: args.clerkId,
          email: originalEmail ?? existingEmailUser.email,
          originalEmail: originalEmail ?? existingEmailUser.originalEmail,
          normalizedEmail: emailNormalized,
          phone: args.phone ?? existingEmailUser.phone,
          isPhoneVerified: args.isPhoneVerified ?? existingEmailUser.isPhoneVerified,
          updatedAt: now,
        });

        // Audit link creation
        await ctx.db.insert("auditLogs", {
          actorRole: "system",
          action: "user.linked_clerk",
          entityType: "users",
          entityId: existingEmailUser._id,
          metadata: JSON.stringify({ clerkId: args.clerkId, email: originalEmail, normalizedEmail: emailNormalized }),
          createdAt: now,
        });

        // Auto-link boutiques by owner email
        const boutique = await ctx.db
          .query("boutiques")
          .withIndex("by_email", (q) => q.eq("email", emailNormalized))
          .unique();

        // Auto-link if boutique is not deleted/rejected and doesn't have a different owner
        if (boutique && boutique.status !== "DELETED" && boutique.status !== "REJECTED" && (!boutique.ownerUserId || boutique.ownerUserId === existingEmailUser._id)) {
          const boutiqueUpdate: any = {
            userId: existingEmailUser._id,
            ownerUserId: existingEmailUser._id,
          };
          if (boutique.status === "PENDING") {
            boutiqueUpdate.status = "APPROVED";
            boutiqueUpdate.approvedAt = now;
          }
          await ctx.db.patch(boutique._id, boutiqueUpdate);
          await ctx.db.patch(existingEmailUser._id, {
            role: "boutique_owner",
            updatedAt: now,
          });

          await ctx.db.insert("auditLogs", {
            actorRole: "system",
            action: "boutique.approved",
            entityType: "boutiques",
            entityId: boutique._id,
            metadata: JSON.stringify({ userId: existingEmailUser._id, email: originalEmail, normalizedEmail: emailNormalized, previousStatus: boutique.status }),
            createdAt: now,
          });
        }

        return existingEmailUser._id;
      }
    }

    // 3. Handle duplicate resolution: if both clerkId user and email credentials user exist
    if (clerkUser && emailNormalized && args.isEmailVerified) {
      const credentialsUser = await ctx.db
        .query("users")
        .withIndex("by_normalizedEmail", (q) => q.eq("normalizedEmail", emailNormalized))
        .first(); // Find any credentials record that is not this clerk record

      if (credentialsUser && credentialsUser._id !== clerkUser._id) {
        // Merge Clerk ID into credentials record
        await ctx.db.patch(credentialsUser._id, {
          clerkId: args.clerkId,
          email: originalEmail ?? credentialsUser.email,
          originalEmail: originalEmail ?? credentialsUser.originalEmail,
          normalizedEmail: emailNormalized,
          phone: args.phone ?? credentialsUser.phone,
          isPhoneVerified: args.isPhoneVerified ?? credentialsUser.isPhoneVerified,
          updatedAt: now,
        });

        // Soft-deactivate the duplicate Clerk-only user
        await ctx.db.patch(clerkUser._id, {
          isActive: false,
          isMerged: true,
          mergedIntoUserId: credentialsUser._id,
          updatedAt: now,
        });

        // Re-associate any boutiques owned by Clerk-only profile
        const boutiques = await ctx.db
          .query("boutiques")
          .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", clerkUser!._id))
          .collect();

        for (const b of boutiques) {
          await ctx.db.patch(b._id, {
            ownerUserId: credentialsUser._id,
            userId: credentialsUser._id,
          });
        }

        // Write identity links audit record
        await ctx.db.insert("identityLinks", {
          oldUserId: clerkUser._id,
          newUserId: credentialsUser._id,
          clerkId: args.clerkId,
          linkedBy: "webhook",
          linkedAt: now,
          reason: "Deduplicated Clerk-only profile and merged with existing credentials user.",
        });

        // Audit merge creation
        await ctx.db.insert("auditLogs", {
          actorRole: "system",
          action: "user.merged",
          entityType: "users",
          entityId: credentialsUser._id,
          metadata: JSON.stringify({
            oldUserId: clerkUser._id,
            newUserId: credentialsUser._id,
            email: originalEmail,
            normalizedEmail: emailNormalized,
          }),
          createdAt: now,
        });

        return credentialsUser._id;
      }
    }

    // 4. If user already exists by clerkId (and no merging is required), return it
    if (clerkUser) {
      return clerkUser._id;
    }

    // 5. Create new user if no match exists
    const userId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: originalEmail,
      originalEmail,
      normalizedEmail: emailNormalized,
      phone: args.phone,
      role: "customer",
      isActive: true,
      isPhoneVerified: args.isPhoneVerified ?? false,
      createdAt: now,
      updatedAt: now,
    });

    // Create customer profile
    await ctx.db.insert("customerProfiles", {
      userId,
      displayName: args.name ?? originalEmail?.split("@")[0] ?? "Customer",
      hiveScore: 100,
      totalOrders: 0,
      totalClaimsSubmitted: 0,
      updatedAt: now,
    });

    // Audit creation
    await ctx.db.insert("auditLogs", {
      actorRole: "system",
      action: "user.created",
      entityType: "users",
      entityId: userId,
      metadata: JSON.stringify({ clerkId: args.clerkId, email: originalEmail, normalizedEmail: emailNormalized }),
      createdAt: now,
    });

    // Auto-detect staff: if this email matches a boutique's staffEmail, upgrade role
    if (emailNormalized) {
      const allBoutiques = await ctx.db.query("boutiques").collect();
      const staffBoutique = allBoutiques.find(b =>
        b.status !== "DELETED" && (
          (b.staffEmail1 && normalizeEmail(b.staffEmail1) === emailNormalized) ||
          (b.staffEmail2 && normalizeEmail(b.staffEmail2) === emailNormalized)
        )
      );

      if (staffBoutique) {
        await ctx.db.patch(userId, { role: "boutique", updatedAt: now });

        await ctx.db.insert("auditLogs", {
          actorRole: "system",
          action: "boutique_staff.linked",
          entityType: "boutiques",
          entityId: staffBoutique._id,
          metadata: JSON.stringify({ userId, email: originalEmail, normalizedEmail: emailNormalized }),
          createdAt: now,
        });
      }
    }

    return userId;
  },
});

/**
 * Syncs Clerk user updates via Webhooks.
 */
export const syncUserUpdateFromWebhook = internalMutation({
  args: {
    clerkId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    isEmailVerified: v.boolean(),
    phone: v.optional(v.string()),
    isPhoneVerified: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const originalEmail = args.email;
    const emailNormalized = normalizeEmail(args.email);

    // Look up user by clerkId
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      // Bails or falls back to creating if not found
      return null;
    }

    // Handle duplicate resolution: if this clerk user now has a verified email,
    // merge them into any existing credentials/admin-created user to prevent orphaned accounts.
    if (emailNormalized && args.isEmailVerified && !user.isMerged) {
      const credentialsUser = await ctx.db
        .query("users")
        .withIndex("by_normalizedEmail", (q) => q.eq("normalizedEmail", emailNormalized))
        .first(); // Find any credentials record

      if (credentialsUser && credentialsUser._id !== user._id && credentialsUser.role !== "admin") {
        // Merge Clerk ID into credentials record
        await ctx.db.patch(credentialsUser._id, {
          clerkId: args.clerkId,
          email: originalEmail ?? credentialsUser.email,
          originalEmail: originalEmail ?? credentialsUser.originalEmail,
          normalizedEmail: emailNormalized,
          phone: args.phone ?? credentialsUser.phone,
          isPhoneVerified: args.isPhoneVerified ?? credentialsUser.isPhoneVerified,
          updatedAt: now,
        });

        // Soft-deactivate the duplicate Clerk-only user
        await ctx.db.patch(user._id, {
          isActive: false,
          isMerged: true,
          mergedIntoUserId: credentialsUser._id,
          updatedAt: now,
        });

        // Re-associate any boutiques owned by the duplicate Clerk profile
        const boutiques = await ctx.db
          .query("boutiques")
          .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", user._id))
          .collect();

        for (const b of boutiques) {
          await ctx.db.patch(b._id, {
            ownerUserId: credentialsUser._id,
            userId: credentialsUser._id,
          });
        }
        
        // Auto-link approved boutiques that match by email
        const emailBoutique = await ctx.db
          .query("boutiques")
          .withIndex("by_email", (q) => q.eq("email", emailNormalized))
          .unique();

        if (emailBoutique && emailBoutique.status === "APPROVED" && (!emailBoutique.ownerUserId || emailBoutique.ownerUserId === credentialsUser._id)) {
          await ctx.db.patch(emailBoutique._id, {
            userId: credentialsUser._id,
            ownerUserId: credentialsUser._id,
          });
          await ctx.db.patch(credentialsUser._id, {
            role: "boutique_owner",
            updatedAt: now,
          });
        }

        // Audit merge creation
        await ctx.db.insert("auditLogs", {
          actorRole: "system",
          action: "user.merged",
          entityType: "users",
          entityId: credentialsUser._id,
          metadata: JSON.stringify({
            oldUserId: user._id,
            newUserId: credentialsUser._id,
            email: originalEmail,
            normalizedEmail: emailNormalized,
            reason: "Webhook user update triggered merge",
          }),
          createdAt: now,
        });

        return credentialsUser._id;
      }
    }

    const updates: any = { updatedAt: now };
    if (originalEmail && user.email !== originalEmail) {
      updates.email = originalEmail;
      updates.originalEmail = originalEmail;
    }
    if (emailNormalized && user.normalizedEmail !== emailNormalized) {
      updates.normalizedEmail = emailNormalized;
    }
    if (args.phone !== undefined && user.phone !== args.phone) {
      updates.phone = args.phone;
    }
    if (args.isPhoneVerified !== undefined && user.isPhoneVerified !== args.isPhoneVerified) {
      updates.isPhoneVerified = args.isPhoneVerified;
    }

    if (Object.keys(updates).length > 1) {
      await ctx.db.patch(user._id, updates);
    }

    // Profile updates
    const profile = await ctx.db
      .query("customerProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (profile && args.name && profile.displayName !== args.name) {
      await ctx.db.patch(profile._id, {
        displayName: args.name,
        updatedAt: now,
      });
    }

    // Audit update
    await ctx.db.insert("auditLogs", {
      actorRole: "system",
      action: "user.updated",
      entityType: "users",
      entityId: user._id,
      metadata: JSON.stringify({ clerkId: args.clerkId, updates }),
      createdAt: now,
    });

    // Auto-detect staff on webhook update: if this email matches a boutique's staffEmail, upgrade role
    if (emailNormalized && user.role === "customer") {
      const allBoutiques = await ctx.db.query("boutiques").collect();
      const staffBoutique = allBoutiques.find(b =>
        b.status !== "DELETED" && (
          (b.staffEmail1 && normalizeEmail(b.staffEmail1) === emailNormalized) ||
          (b.staffEmail2 && normalizeEmail(b.staffEmail2) === emailNormalized)
        )
      );

      if (staffBoutique) {
        await ctx.db.patch(user._id, { role: "boutique", updatedAt: now });

        await ctx.db.insert("auditLogs", {
          actorRole: "system",
          action: "boutique_staff.linked",
          entityType: "boutiques",
          entityId: staffBoutique._id,
          metadata: JSON.stringify({ userId: user._id, email: originalEmail, normalizedEmail: emailNormalized }),
          createdAt: now,
        });
      }
    }

    return user._id;
  },
});

/**
 * Syncs Clerk user deletions via Webhooks.
 */
export const syncUserDeleteFromWebhook = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) return null;

    // Soft deactivate user record
    await ctx.db.patch(user._id, {
      isActive: false,
      updatedAt: now,
    });

    // Suspend associated boutiques
    const boutiques = await ctx.db
      .query("boutiques")
      .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", user._id))
      .collect();

    for (const b of boutiques) {
      await ctx.db.patch(b._id, {
        status: "SUSPENDED",
      });
    }

    // Audit delete
    await ctx.db.insert("auditLogs", {
      actorRole: "system",
      action: "user.deleted",
      entityType: "users",
      entityId: user._id,
      metadata: JSON.stringify({ clerkId: args.clerkId }),
      createdAt: now,
    });

    return user._id;
  },
});

/**
 * Logs user session events (signed in / signed out) from Clerk webhooks.
 */
export const logUserSessionEvent = internalMutation({
  args: {
    clerkId: v.string(),
    action: v.union(v.literal("user.signed_in"), v.literal("user.signed_out")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      console.warn(`[logUserSessionEvent] User not found for clerkId: ${args.clerkId}`);
      return null;
    }

    await ctx.db.insert("auditLogs", {
      actorRole: "system",
      action: args.action,
      entityType: "users",
      entityId: user._id,
      metadata: JSON.stringify({ clerkId: args.clerkId, email: user.email }),
      createdAt: Date.now(),
    });

    return user._id;
  },
});

export const getAuthenticatedUserQuery = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return await getAuthenticatedUser(ctx, args.token);
  },
});

export const promoteEmailToAdminDebug = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    // STRICT PRODUCTION GATE
    if (process.env.NODE_ENV === "production" || process.env.ENABLE_DEBUG_TOOLS !== "true") {
      throw new Error("Unauthorized: Debug mutations are strictly disabled in this environment.");
    }

    const emailNormalized = args.email.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("by_normalizedEmail", (q) => q.eq("normalizedEmail", emailNormalized))
      .unique();
    if (!user) throw new Error("User not found in Convex database.");
    await ctx.db.patch(user._id, { role: "admin", updatedAt: Date.now() });
    return user._id;
  },
});

export const forceCreateAdminDebug = mutation({
  args: { email: v.string(), clerkId: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // STRICT PRODUCTION GATE
    if (process.env.NODE_ENV === "production" || process.env.ENABLE_DEBUG_TOOLS !== "true") {
      throw new Error("Unauthorized: Debug mutations are strictly disabled in this environment.");
    }

    const emailNormalized = args.email.trim().toLowerCase();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { role: "admin", email: args.email, normalizedEmail: emailNormalized });
      return existing._id;
    }
    const userId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      originalEmail: args.email,
      normalizedEmail: emailNormalized,
      role: "admin",
      isActive: true,
      isPhoneVerified: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return userId;
  },
});

/**
 * Updates the current authenticated user's profile display name.
 */
export const updateProfileDisplayName = mutation({
  args: {
    displayName: v.string(),
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);
    const now = Date.now();
    const profile = await ctx.db
      .query("customerProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!profile) {
      throw new Error("Customer profile not found");
    }
    await ctx.db.patch(profile._id, {
      displayName: args.displayName.trim(),
      updatedAt: now,
    });
    return profile._id;
  },
});

/**
 * Updates the current authenticated user's phone number in Convex DB.
 */
export const updateProfilePhone = mutation({
  args: {
    phone: v.string(),
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);
    const cleanPhone = args.phone.trim();
    await ctx.db.patch(user._id, {
      phone: cleanPhone,
      isPhoneVerified: true,
      updatedAt: Date.now(),
    });
    return { success: true, phone: cleanPhone };
  },
});

// Internal: returns the full user document for any subject with no auth check, so it must not
// be callable from clients. Authenticated callers should use auth.getMe for their own record.
export const getUserByClerkId = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();
  },
});




