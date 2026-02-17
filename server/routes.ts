import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage.js";
import { insertRideSchema, insertOrderSchema, insertPaymentSchema, updateRideSchema, updateAirbearSchema } from "../shared/schema.js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { getActiveSpotsData } from "../shared/spots-data.js";
import { env, ApiError, asyncHandler, requireAuth, requireAdmin, hmacSha256, safeCompare } from "./utils.js";


const logRouteError = (req: Request, error: unknown) => {
  const requestId = req.get("x-request-id");
  const prefix = requestId ? `[${requestId}] ` : "";
  console.error(`${prefix}[RouteError] ${req.method} ${req.path}`, error);
};

export async function registerRoutes(app: Express): Promise<Express> {
  // Debug endpoint to check session
  app.get("/api/debug/session", (req, res) => {
    res.json({
      session: req.session,
      userId: req.session?.userId,
      userRole: req.session?.userRole,
      headers: req.headers,
      cookies: req.headers.cookie
    });
  });

  // Test endpoint to set session
  app.post("/api/debug/set-session", (req, res) => {
    req.session.userId = "test-user-123";
    req.session.userRole = "user";
    req.session.save((err) => {
      if (err) {
        console.error('[Session] Save error:', err);
        res.status(500).json({ error: "Failed to save session" });
      } else {
        res.json({ success: true, message: "Session set successfully" });
      }
    });
  });

  // Auth helper functions for ownership checks
  const getAuthUserId = (req: Request): string | undefined => req.session?.userId || (req as any).userId;
  const getAuthUserRole = (req: Request): string | undefined => req.session?.userRole || (req as any).userRole;

  // Password reset tokens: token -> { email, expiresAt }
  const resetTokens = new Map<string, { email: string; expiresAt: number }>();

  // HMAC secret for signing cash QR codes
  const qrSecret = env.QR_HMAC_SECRET || globalThis.crypto.randomUUID();

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAnonKey = env.SUPABASE_ANON_KEY;

  // Admin client for admin operations (creating users, etc.)
  const supabaseAdmin = supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;

  // Regular client for auth operations (login, etc.) - uses anon key
  const supabaseAuth = supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;

  if (!supabaseAdmin) {
    console.warn("⚠️ Supabase admin client not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for live auth.");
  }

  if (!supabaseAuth) {
    console.warn("⚠️ Supabase auth client not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY for login.");
  }

  const stripeSecretKey = env.STRIPE_SECRET_KEY;
  const StripeMod = stripeSecretKey ? await import("stripe") : null;
  const Stripe = StripeMod?.default || StripeMod;
  const stripe = (stripeSecretKey && Stripe) ? new (Stripe as any)(stripeSecretKey, {}) : null;

  const getStripe = () => {
    if (!stripe) {
      throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY.");
    }
    return stripe;
  };

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      deployment: "a0bf1e3",
      authDisabled: true
    });
  });

  // Error and event logging endpoints
  app.post("/api/logs/errors", (req, res) => {
    const { errors } = req.body;
    if (Array.isArray(errors)) {
      errors.forEach((error: any) => {
        console.error("[ClientError]", {
          message: error.message,
          url: error.url,
          userId: error.userId,
          timestamp: error.timestamp,
          stack: error.stack?.substring(0, 500),
        });
      });
    }
    res.json({ received: true });
  });

  app.post("/api/logs/events", (req, res) => {
    const { event, data, timestamp } = req.body;
    console.log("[ClientEvent]", { event, data, timestamp });
    res.json({ received: true });
  });

  // Auth routes
  const profileSchema = z.object({
    id: z.string().optional(),
    email: z.string().email(),
    username: z.string().min(2),
    fullName: z.string().optional().nullable(),
    fullname: z.string().optional().nullable(),
    role: z.enum(["user", "driver", "admin"]).optional(),
    avatarUrl: z.string().optional().nullable(),
    avatarurl: z.string().optional().nullable(),
  }).transform((data) => ({
    ...data,
    fullName: data.fullName ?? data.fullname ?? null,
    avatarUrl: data.avatarUrl ?? data.avatarurl ?? null,
  }));

  const ensureUserProfile = async (payload: z.infer<typeof profileSchema>) => {
    // Fallback to local storage - Supabase API has permission issues
    const existingUser = payload.id
      ? await storage.getUser(payload.id)
      : payload.email ? await storage.getUserByEmail(payload.email) : null;

    if (existingUser) {
      // Deep comparison to avoid redundant updates
      const needsUpdate =
        existingUser.username !== payload.username ||
        (payload.fullName !== undefined && existingUser.fullName !== payload.fullName) ||
        (payload.avatarUrl !== undefined && existingUser.avatarUrl !== payload.avatarUrl) ||
        (payload.role !== undefined && existingUser.role !== payload.role);

      if (needsUpdate) {
        return storage.updateUser(existingUser.id, {
          username: payload.username,
          fullName: payload.fullName ?? existingUser.fullName,
          avatarUrl: payload.avatarUrl ?? existingUser.avatarUrl,
          role: payload.role || existingUser.role,
        });
      }
      return existingUser;
    }

    return storage.createUser({
      id: payload.id, // Pass the ID from Supabase Auth
      email: payload.email || "",
      username: payload.username,
      fullName: payload.fullName ?? null,
      avatarUrl: payload.avatarUrl ?? null,
      role: payload.role || "user",
      ecoPoints: 0,
      totalRides: 0,
      co2Saved: "0",
    });
  };

  app.post("/api/auth/register", async (req, res) => {
    try {
      const registerSchema = z.object({
        email: z.string().email(),
        username: z.string().min(2),
        fullName: z.string().optional().nullable(),
        role: z.enum(["user", "driver"]).optional(),
        avatarUrl: z.string().optional().nullable(),
        password: z.string().min(6),
        confirmPassword: z.string().min(6),
      }).refine((data) => data.password === data.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"],
      });
      const userData = registerSchema.parse(req.body);

      // Check for existing user with same email
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      let authUserId: string | undefined;

      // If Supabase is available, create auth user first
      if (supabaseAdmin) {
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: userData.email,
          password: userData.password,
          email_confirm: true, // Auto-confirm email for simplicity
          user_metadata: {
            username: userData.username,
            fullName: userData.fullName,
            role: userData.role || "user",
          },
        });

        if (authError) {
          console.error(`[Auth] Supabase auth user creation failed:`, authError);
          // If Supabase fails, fall back to local storage
        } else if (authData.user) {
          authUserId = authData.user.id;
        }
      }

      // Create user profile in storage
      const profile = await storage.createUser({
        id: authUserId, // Use Supabase auth user ID if available
        email: userData.email || "",
        username: userData.username,
        fullName: userData.fullName ?? null,
        avatarUrl: userData.avatarUrl ?? null,
        role: userData.role || "user",
        ecoPoints: 0,
        totalRides: 0,
        co2Saved: "0",
        hasCeoTshirt: false,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        tshirtPurchaseDate: null
      });

      // Store password for local auth fallback
      if (storage.setPassword) {
        await storage.setPassword(profile.id, userData.password);
      }

      req.session.userId = profile.id;
      req.session.userRole = profile.role;
      req.session.save((err) => {
        if (err) { console.error('[Session] Save error:', err); }
        res.json({ user: { id: profile.id, email: profile.email, username: profile.username, role: profile.role, ecoPoints: profile.ecoPoints, totalRides: profile.totalRides, co2Saved: profile.co2Saved } });
      });
    } catch (error: any) {
      logRouteError(req, error);
      console.error('Registration error:', error);
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = z.object({
        email: z.string().email(),
        password: z.string().min(6),
      }).parse(req.body);

      const sendLoginSuccess = (user: { id: string; email: string; username: string; role: string; ecoPoints: number; totalRides: number; co2Saved: string }) => {
        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.session.save((err) => {
          if (err) { console.error('[Session] Save error:', err); }
          res.json({ user });
        });
      };

      const toUserResponse = (profile: any) => ({
        id: profile.id, email: profile.email, username: profile.username,
        role: profile.role, ecoPoints: profile.ecoPoints, totalRides: profile.totalRides, co2Saved: profile.co2Saved,
      });

      // Try Supabase auth first if available (use anon client, fallback to admin for verification)
      const authClient = supabaseAuth || supabaseAdmin;
      if (authClient) {
        try {
          const { data, error } = await authClient.auth.signInWithPassword({ email, password });

          if (!error && data.user) {
            const profile = await ensureUserProfile({
              email,
              username: (data.user.user_metadata?.username as string) || email.split("@")[0],
              fullName: (data.user.user_metadata?.fullName as string | undefined) || null,
              role: (data.user.user_metadata?.role as "user" | "driver" | "admin" | undefined) || "user",
              avatarUrl: (data.user.user_metadata?.avatar_url as string | undefined) || null,
            });
            return sendLoginSuccess(toUserResponse(profile));
          }

          if (error) {
            console.log(`[Auth] Supabase signIn failed: ${error.message}`);
          }
        } catch (supabaseError: any) {
          console.error(`[Auth] Supabase auth exception:`, supabaseError);
        }
      }

      // Fallback: verify password hash stored in users table
      if (storage.verifyPassword) {
        const user = await storage.verifyPassword(email, password);
        if (user) {
          return sendLoginSuccess(toUserResponse(user));
        }
      }

      // Fallback: verify with Supabase admin (getUser by email, then try signIn with service key)
      if (supabaseAdmin) {
        try {
          const { data: userData } = await supabaseAdmin.from("users").select("*").eq("email", email).maybeSingle();
          if (userData) {
            // User exists in DB but neither auth method worked
          }
        } catch (e) {
          // ignore
        }
      }

      // No valid credentials found
      return res.status(401).json({ message: "Invalid email or password. If you registered recently, please try again or create a new account." });
    } catch (error: any) {
      logRouteError(req, error);
      console.error(`[Auth] Login error:`, error);
      res.status(400).json({ message: error.message });
    }
  });

  // Password reset request
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = z.object({
        email: z.string().email(),
      }).parse(req.body);

      // Check if user exists
      const user = await storage.getUserByEmail(email);
      if (!user) {
        // Don't reveal whether email exists - always return success
        return res.json({ success: true, message: "If an account with that email exists, a reset link has been sent." });
      }

      // Try Supabase password reset if available
      if (supabaseAdmin) {
        const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
          redirectTo: `${req.protocol}://${req.get('host')}/auth/reset-password`,
        });

        if (error) {
          console.error(`[Auth] Supabase password reset error:`, error);
          // Still return success for security
        }
      } else {
        // For local auth without email service, generate a secure reset token
        const resetToken = crypto.randomUUID();
        const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes
        resetTokens.set(resetToken, { email, expiresAt });
      }

      res.json({ success: true, message: "If an account with that email exists, a reset link has been sent." });
    } catch (error: any) {
      logRouteError(req, error);
      console.error(`[Auth] Forgot password error:`, error);
      // Always return success for security
      res.json({ success: true, message: "If an account with that email exists, a reset link has been sent." });
    }
  });

  // Reset password with token
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, email, newPassword } = z.object({
        token: z.string().min(1, "Reset token is required"),
        email: z.string().email(),
        newPassword: z.string().min(6),
      }).parse(req.body);

      // Validate reset token
      const tokenData = resetTokens.get(token);
      if (!tokenData) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      if (tokenData.email !== email) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      if (Date.now() > tokenData.expiresAt) {
        resetTokens.delete(token);
        return res.status(400).json({ message: "Reset token has expired. Please request a new one." });
      }

      // Token is valid - delete it (single use)
      resetTokens.delete(token);

      // Find user
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Update password in local storage
      if (storage.setPassword) {
        await storage.setPassword(user.id, newPassword);
        return res.json({ success: true, message: "Password has been reset successfully" });
      }

      return res.status(500).json({ message: "Password reset not available" });
    } catch (error: any) {
      logRouteError(req, error);
      console.error(`[Auth] Reset password error:`, error);
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/auth/sync-profile", async (req, res) => {
    try {
      // Prevent privilege escalation by ignoring client-provided role
      delete (req.body as any).role;
      const payload = profileSchema.parse(req.body);
      const profile = await ensureUserProfile(payload);
      req.session.userId = profile.id;
      req.session.userRole = profile.role;
      req.session.save((err) => {
        if (err) { console.error('[Session] Save error:', err); }
        res.json({ user: profile });
      });
    } catch (error: any) {
      logRouteError(req, error);
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        logRouteError(req, err);
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });

  // Spots routes
  app.get("/api/spots", async (req, res) => {
    try {
      // Try to get from storage first
      const storageSpots = await storage.getAllSpots();

      // If storage has insufficient spots, fallback to shared spots data
      if (storageSpots.length < 16) {
        const sharedSpots = getActiveSpotsData();
        return res.json(sharedSpots);
      }

      res.json(storageSpots);
    } catch (error) {
      logRouteError(req, error);
      res.status(500).json({ message: "Failed to fetch spots" });
    }
  });

  // Airbears route
  app.get("/api/airbears", async (req, res) => {
    try {
      const airbears = await storage.getAllAirbears();
      res.json(airbears);
    } catch (error) {
      logRouteError(req, error);
      res.status(500).json({ message: "Failed to fetch airbears" });
    }
  });

  // Available airbears route
  app.get("/api/airbears/available", async (req, res) => {
    try {
      const airbears = await storage.getAvailableAirbears();
      res.json(airbears);
    } catch (error) {
      logRouteError(req, error);
      res.status(500).json({ message: "Failed to fetch available airbears" });
    }
  });

  // Bodega items route
  app.get("/api/bodega-items", async (req, res) => {
    try {
      const items = await storage.getAllBodegaItems();
      res.json(items);
    } catch (error) {
      logRouteError(req, error);
      res.status(500).json({ message: "Failed to fetch bodega items" });
    }
  });

  app.post("/api/bodega-items", requireAdmin, async (req, res) => {
    try {
      const { name, description, price, imageUrl, category, isEcoFriendly, stock, isAvailable } = req.body;
      if (!name || !price) {
        return res.status(400).json({ message: "Name and price are required" });
      }
      const item = await storage.createBodegaItem({
        name,
        description: description || "",
        price: String(price),
        imageUrl: imageUrl || null,
        category: category || "other",
        isEcoFriendly: isEcoFriendly ?? false,
        stock: stock ?? 10,
        isAvailable: isAvailable ?? true,
      });
      res.json(item);
    } catch (error: any) {
      logRouteError(req, error);
      res.status(500).json({ message: error.message });
    }
  });

  // Rides routes
  app.post("/api/rides", async (req, res) => {
    try {
      console.log('[Rides] Creating ride');

      // Manual validation with proper field handling
      const rideData = {
        userId: req.body.userId,
        pickupSpotId: req.body.pickupSpotId,
        dropoffSpotId: req.body.dropoffSpotId,
        passengers: parseInt(req.body.passengers) || 1,
        fare: typeof req.body?.fare === "number"
          ? req.body.fare.toFixed(2)
          : req.body?.fare,
        airbearId: req.body.airbearId || null,
        driverId: req.body.driverId || null,
        status: req.body.status || "pending",
      };

      // Basic validation
      if (!rideData.userId || !rideData.pickupSpotId || !rideData.dropoffSpotId) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Ownership check: ride must belong to the authenticated user
      const authUserId = getAuthUserId(req);
      const authUserRole = getAuthUserRole(req);
      if (rideData.userId && authUserId && rideData.userId !== authUserId) {
        return res.status(403).json({ message: "Cannot create a ride for another user" });
      }

      // Role restriction: drivers cannot book rides as passengers
      if (authUserRole === "driver") {
        return res.status(403).json({
          message: "Drivers cannot book rides as passengers. This feature is for customers only."
        });
      }

      const ride = await storage.createRide(rideData);
      console.log('[Rides] Ride created successfully:', ride.id);
      res.json(ride);
    } catch (error: any) {
      logRouteError(req, error);
      console.error('[Rides] Error creating ride:', error);
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/rides/user/:userId", requireAuth, async (req, res) => {
    try {
      const { userId } = req.params;

      // Ownership check: only the user themselves or an admin can view rides
      const authUserId = getAuthUserId(req);
      const authUserRole = getAuthUserRole(req);
      if (userId !== authUserId && authUserRole !== "admin") {
        return res.status(403).json({ message: "Forbidden: cannot access another user's rides" });
      }

      const rides = await storage.getRidesByUser(userId);
      res.json(rides);
    } catch (error: any) {
      logRouteError(req, error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get pending rides for drivers (MUST be before /api/rides/:id)
  app.get("/api/rides/pending", requireAuth, async (req, res) => {
    try {
      const pendingRides = await storage.getPendingRides();
      res.json(pendingRides);
    } catch (error: any) {
      logRouteError(req, error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get rides assigned to a driver (MUST be before /api/rides/:id)
  app.get("/api/rides/driver/:driverId", requireAuth, async (req, res) => {
    try {
      const { driverId } = req.params;

      // Ownership check: only the driver themselves or an admin can view their rides
      const authUserId = getAuthUserId(req);
      const authUserRole = getAuthUserRole(req);
      if (driverId !== authUserId && authUserRole !== "admin") {
        return res.status(403).json({ message: "Forbidden: cannot access another driver's rides" });
      }

      const rides = await storage.getRidesByDriver(driverId);
      res.json(rides);
    } catch (error: any) {
      logRouteError(req, error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/rides/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const ride = await storage.getRideById(id);
      if (!ride) {
        return res.status(404).json({ message: "Ride not found" });
      }

      // Ownership check: only the user who requested the ride, the assigned driver, or an admin
      const authUserId = getAuthUserId(req);
      const authUserRole = getAuthUserRole(req);
      const isOwner = ride.userId === authUserId;
      const isDriver = ride.driverId === authUserId;
      const isAdmin = authUserRole === "admin";

      if (!isOwner && !isDriver && !isAdmin) {
        return res.status(403).json({ message: "Forbidden: you are not authorized to view this ride" });
      }

      res.json(ride);
    } catch (error: any) {
      logRouteError(req, error);
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/rides/:id", requireAuth, asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const updates = updateRideSchema.parse(req.body);

    // Verify ride exists before updating
    const existingRide = await storage.getRideById(id);
    if (!existingRide) {
      throw ApiError.notFound("Ride");
    }

    // Ownership check:
    // - The ride's user can update their own ride
    // - The assigned driver can update the ride
    // - A driver can accept a pending ride (status change to 'accepted' with driverId set)
    // - An admin can update any ride
    const authUserId = getAuthUserId(req);
    const authUserRole = getAuthUserRole(req);
    const isRideOwner = authUserId === existingRide.userId;
    const isAssignedDriver = existingRide.driverId && authUserId === existingRide.driverId;
    const isDriverAccepting = authUserRole === "driver" && existingRide.status === "pending" && updates.status === "accepted" && updates.driverId === authUserId;
    const isAdmin = authUserRole === "admin";

    if (!isRideOwner && !isAssignedDriver && !isDriverAccepting && !isAdmin) {
      res.status(403).json({ message: "Forbidden: you are not authorized to update this ride" });
      return;
    }

    // Auto-set timestamps based on status transitions
    const enrichedUpdates: Record<string, any> = { ...updates };
    if ((updates as any).status === "accepted" && !existingRide.acceptedAt) {
      enrichedUpdates.acceptedAt = new Date().toISOString();
    }
    if ((updates as any).status === "in_progress" && !existingRide.startedAt) {
      enrichedUpdates.startedAt = new Date().toISOString();
    }
    if ((updates as any).status === "completed" && !existingRide.completedAt) {
      enrichedUpdates.completedAt = new Date().toISOString();
    }

    const ride = await storage.updateRide(id, enrichedUpdates);
    res.json({ success: true, data: ride });
  }));

  // Update airbear (for assigning drivers, updating location, etc.)
  app.patch("/api/airbears/:id", requireAuth, asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const updates = updateAirbearSchema.parse(req.body);

    // Get current airbear state for ownership check
    const currentAirbear = (await storage.getAllAirbears()).find(a => a.id === id);

    if (!currentAirbear) {
      throw ApiError.notFound("Airbear");
    }

    // Ownership check: only the current driver, a driver claiming an unassigned airbear, or an admin
    const authUserId = getAuthUserId(req);
    const authUserRole = getAuthUserRole(req);
    const currentDriverId = (currentAirbear as any).driverId || (currentAirbear as any).driver_id;
    const isCurrentDriver = authUserId && authUserId === currentDriverId;
    const isClaiming = !currentDriverId && ((updates as any).driverId || (updates as any).driver_id);
    const isAdmin = authUserRole === "admin";

    if (!isCurrentDriver && !isClaiming && !isAdmin) {
      res.status(403).json({ message: "Forbidden: you are not authorized to update this airbear" });
      return;
    }

    const airbear = await storage.updateAirbear(id, updates);
    if (!airbear) {
      throw ApiError.notFound("Airbear");
    }
    res.json({ success: true, data: airbear });
  }));

  // Bodega routes
  app.get("/api/bodega/items", async (req, res) => {
    try {
      const { category } = req.query;
      const items = category
        ? await storage.getBodegaItemsByCategory(category as string)
        : await storage.getAllBodegaItems();
      res.json(items);
    } catch (error: any) {
      logRouteError(req, error);
      res.status(500).json({ message: error.message });
    }
  });

  // Orders routes
  app.post("/api/orders", requireAuth, async (req, res) => {
    try {
      const orderData = insertOrderSchema.parse({
        ...req.body,
        // Accept numeric amounts from clients and normalize to string for Drizzle schema
        totalAmount:
          typeof req.body?.totalAmount === "number"
            ? req.body.totalAmount.toFixed(2)
            : req.body?.totalAmount,
      });

      // Ownership check: userId must match the authenticated user
      const authUserId = getAuthUserId(req);
      const authUserRole = getAuthUserRole(req);
      if (orderData.userId !== authUserId) {
        return res.status(403).json({ message: "Forbidden: cannot create order for another user" });
      }

      // Role restriction: drivers cannot place bodega orders
      if (authUserRole === "driver") {
        return res.status(403).json({ 
          message: "Drivers cannot place bodega orders. This feature is for customers only." 
        });
      }

      const order = await storage.createOrder(orderData);
      res.json(order);
    } catch (error: any) {
      logRouteError(req, error);
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/orders/user/:userId", requireAuth, async (req, res) => {
    try {
      const { userId } = req.params;

      // Ownership check: only the user themselves or an admin can view orders
      const authUserId = getAuthUserId(req);
      const authUserRole = getAuthUserRole(req);
      if (userId !== authUserId && authUserRole !== "admin") {
        return res.status(403).json({ message: "Forbidden: cannot access another user's orders" });
      }

      const orders = await storage.getOrdersByUser(userId);
      res.json(orders);
    } catch (error: any) {
      logRouteError(req, error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/orders/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const order = await storage.getOrderById(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Ownership check: only the order owner or an admin can view
      const authUserId = getAuthUserId(req);
      const authUserRole = getAuthUserRole(req);
      if (order.userId !== authUserId && authUserRole !== "admin") {
        return res.status(403).json({ message: "Forbidden: cannot access another user's order" });
      }

      res.json(order);
    } catch (error: any) {
      logRouteError(req, error);
      res.status(500).json({ message: error.message });
    }
  });

  // Stripe payment routes
  app.post("/api/create-payment-intent", async (req, res) => {
    try {
      console.log(`[Payment] Payment intent request received: ${JSON.stringify(req.body)}`);
      
      // Apply authentication manually for better error handling
      const authResult = await new Promise<{ success: boolean; userId?: string; userRole?: string; error?: string }>((resolve) => {
        requireAuth(req, res, () => {
          const userId = getAuthUserId(req);
          const userRole = getAuthUserRole(req);
          resolve({ success: true, userId, userRole });
        }).catch((error) => {
          resolve({ success: false, error: error.message });
        });
      });

      if (!authResult.success || !authResult.userId) {
        console.log(`[Payment] Authentication failed: ${authResult.error}`);
        return res.status(401).json({ 
          message: "Authentication required. Please log in and try again.",
          code: "AUTH_REQUIRED",
          details: authResult.error 
        });
      }

      const { amount, orderId, rideId, userId, paymentMethod = "stripe" } = req.body;

      // Validate required fields
      if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Invalid amount specified" });
      }

      // Use authenticated user ID if not provided in request
      const finalUserId = userId || authResult.userId;

      console.log(`[Payment] Creating payment intent for user ${finalUserId}, amount: $${amount}, orderId: ${orderId}, rideId: ${rideId}`);

      // Verify order/ride ownership if provided
      if (orderId) {
        const order = await storage.getOrderById(orderId);
        if (!order) {
          return res.status(404).json({ message: "Order not found" });
        }
        if (order.userId !== finalUserId) {
          return res.status(403).json({ message: "Order does not belong to this user" });
        }
      }

      if (rideId) {
        const ride = await storage.getRideById(rideId);
        if (!ride) {
          return res.status(404).json({ message: "Ride not found" });
        }
        if (ride.userId !== finalUserId) {
          return res.status(403).json({ message: "Ride does not belong to this user" });
        }
      }

      // Ensure Stripe is configured
      const stripe = getStripe();
      if (!stripe) {
        console.error('[Payment] Stripe not configured');
        return res.status(500).json({ 
          message: "Payment service is not available. Please try again later.",
          code: "STRIPE_NOT_CONFIGURED"
        });
      }

      // Create Stripe PaymentIntent with enhanced metadata
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          userId: finalUserId,
          orderId: orderId || '',
          rideId: rideId || '',
          paymentMethod,
          userAgent: req.get('User-Agent') || '',
          timestamp: new Date().toISOString()
        },
        description: orderId 
          ? `Payment for order ${orderId}` 
          : rideId 
            ? `Payment for ride ${rideId}` 
            : 'AirBear payment'
      });

      console.log(`[Payment] PaymentIntent created successfully: ${paymentIntent.id}`);

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status
      });
    } catch (error: any) {
      logRouteError(req, error);
      console.error('[Payment] Payment intent creation error:', error);
      
      // Handle specific Stripe errors with better messaging
      if (error.type === 'StripeCardError') {
        return res.status(400).json({ 
          message: `Card error: ${error.message}`,
          code: "CARD_ERROR"
        });
      } else if (error.type === 'StripeRateLimitError') {
        return res.status(429).json({ 
          message: "Too many requests. Please try again later.",
          code: "RATE_LIMIT"
        });
      } else if (error.type === 'StripeInvalidRequestError') {
        return res.status(400).json({ 
          message: `Invalid request: ${error.message}`,
          code: "INVALID_REQUEST"
        });
      } else if (error.type === 'StripeAPIError') {
        return res.status(500).json({ 
          message: "Payment service temporarily unavailable. Please try again.",
          code: "API_ERROR"
        });
      } else if (error.code === 'authentication_required') {
        return res.status(401).json({ 
          message: "Additional authentication required. Please check your payment method.",
          code: "PAYMENT_AUTH_REQUIRED"
        });
      } else if (error.message?.includes('authentication')) {
        return res.status(401).json({ 
          message: "Authentication required. Please log in and try again.",
          code: "AUTH_REQUIRED"
        });
      }
      
      res.status(500).json({ 
        message: error.message || "Payment setup failed. Please try again.",
        code: "UNKNOWN_ERROR"
      });
    }
  });

  // Stripe checkout session route
  app.post("/api/stripe/create-checkout-session", requireAuth, async (req, res) => {
    try {
      const { amount, currency = "usd", successUrl, cancelUrl } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }

      // Check if Stripe is configured
      if (!stripe) {
        console.log('Stripe not configured - checkout unavailable');
        return res.status(503).json({
          error: "Payments not configured",
          message: "Payment processing is not available. Please contact support."
        });
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: currency,
            product_data: {
              name: 'AirBear Ride Credit',
              description: 'Add credits to your AirBear account',
            },
            unit_amount: Math.round(amount * 100), // Convert to cents
          },
          quantity: 1,
        }],
        success_url: successUrl || `${req.protocol}://${req.get('host')}/dashboard`,
        cancel_url: cancelUrl || `${req.protocol}://${req.get('host')}/checkout`,
      });

      res.json({
        sessionId: session.id,
        url: session.url,
      });
    } catch (error: any) {
      logRouteError(req, error);
      console.error('Checkout session creation error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Payment confirmation
  app.post("/api/payments/confirm", requireAuth, async (req, res) => {
    try {
      const paymentData = insertPaymentSchema.parse(req.body);

      // Ownership check: userId must match the authenticated user
      const authUserId = getAuthUserId(req);
      if (paymentData.userId !== authUserId) {
        return res.status(403).json({ message: "Forbidden: cannot confirm payment for another user" });
      }

      const payment = await storage.createPayment(paymentData);
      res.json(payment);
    } catch (error: any) {
      logRouteError(req, error);
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/payments/confirm-cash", requireAuth, async (req, res) => {
    try {
      const { qrCode, signature, driverId } = req.body;
      if (!qrCode) return res.status(400).json({ message: "Missing QR code data" });
      if (!signature) return res.status(400).json({ message: "Missing QR signature" });

      const decodedData = JSON.parse(Buffer.from(qrCode, 'base64').toString());

      // Verify HMAC signature to ensure QR data was not tampered with
      const expectedSignature = await hmacSha256(qrSecret, JSON.stringify(decodedData));
      if (!safeCompare(signature, expectedSignature)) {
        return res.status(400).json({ message: "Invalid QR code signature - data may have been tampered with" });
      }

      const { orderId, rideId, amount } = decodedData;

      if (orderId) {
        await storage.updateOrder(orderId, { status: "completed" });
      }
      if (rideId) {
        await storage.updateRide(rideId, { status: "completed" });
      }

      // Record the cash payment
      const payment = await storage.createPayment({
        rideId: rideId || null,
        userId: decodedData.userId || null,
        amount: amount.toString(),
        currency: "usd",
        paymentMethod: "cash",
        status: "completed",
        metadata: { driverId, confirmedAt: new Date().toISOString() }
      });

      res.json({ success: true, payment });
    } catch (error: any) {
      logRouteError(req, error);
      res.status(400).json({ message: "Invalid QR code or confirmation error: " + error.message });
    }
  });

  // CEO T-shirt purchase route
  app.post("/api/ceo-tshirt/purchase", requireAuth, async (req, res) => {
    try {
      const { userId, size } = req.body;

      // Ownership check: userId must match the authenticated user
      const authUserId = getAuthUserId(req);
      if (!userId || userId !== authUserId) {
        return res.status(403).json({ message: "Forbidden: cannot purchase for another user" });
      }

      // Check if Stripe is configured
      if (!stripe) {
        return res.status(503).json({
          error: "Payments not configured",
          message: "Payment processing is not available. Please contact support."
        });
      }

      // Create Stripe PaymentIntent for CEO T-shirt
      const paymentIntent = await stripe.paymentIntents.create({
        amount: 10000, // $100.00 in cents
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          product_type: "ceo_tshirt",
          user_id: userId,
          size: size,
          unlimited_rides: "true",
          non_transferable: "true"
        }
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
      });
    } catch (error: any) {
      logRouteError(req, error);
      res.status(500).json({ message: "Error creating CEO T-shirt payment: " + error.message });
    }
  });

  // Free ride validation for CEO T-shirt holders
  app.get("/api/users/:userId/free-ride-status", requireAuth, async (req, res) => {
    try {
      const { userId } = req.params;

      // Ownership check: only the user themselves or an admin can check free ride status
      const authUserId = getAuthUserId(req);
      const authUserRole = getAuthUserRole(req);
      if (userId !== authUserId && authUserRole !== "admin") {
        return res.status(403).json({ message: "Forbidden: cannot access another user's free ride status" });
      }

      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if user has CEO T-shirt
      if (!user.hasCeoTshirt) {
        return res.json({
          canRideFree: false,
          reason: "No CEO T-shirt purchased"
        });
      }

      // Check if user has already used free ride today
      const today = new Date().toISOString().split('T')[0];
      const todayRides = await storage.getRidesByUserAndDate(userId, today);
      const freeRidesToday = todayRides.filter(ride => ride.isFreeTshirtRide);

      if (freeRidesToday.length > 0) {
        return res.json({
          canRideFree: false,
          reason: "Daily free ride already used"
        });
      }

      res.json({ canRideFree: true });
    } catch (error: any) {
      logRouteError(req, error);
      res.status(500).json({ message: error.message });
    }
  });

  // Webhook for Stripe
  app.post("/api/webhooks/stripe", async (req, res) => {
    try {
      console.log('[Webhook] Stripe webhook received');
      
      // Check if Stripe is configured
      if (!stripe) {
        console.log('[Webhook] Stripe webhook received but Stripe not configured - ignoring');
        return res.json({ received: true, demo: true });
      }

      const sig = req.headers['stripe-signature'];
      const endpointSecret = env.STRIPE_WEBHOOK_SECRET;

      console.log(`[Webhook] Checking signature: ${sig ? 'present' : 'missing'}, secret: ${endpointSecret ? 'configured' : 'missing'}`);

      if (!sig || !endpointSecret) {
        console.error('[Webhook] Missing signature or webhook secret');
        return res.status(400).json({ 
          message: "Missing signature or webhook secret",
          code: "WEBHOOK_CONFIG_ERROR"
        });
      }

      let event;
      try {
        // Ensure rawBody is available for webhook verification
        const rawBody = (req as any).rawBody || req.body;
        if (!rawBody || typeof rawBody !== 'string') {
          throw new Error('Raw request body not available for webhook verification');
        }
        
        event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
        console.log(`[Webhook] Event verified: ${event.type}`);
      } catch (err: any) {
        console.error(`[Webhook] Signature verification failed: ${err.message}`);
        return res.status(400).json({ 
          message: `Webhook signature verification failed: ${err.message}`,
          code: "WEBHOOK_SIGNATURE_INVALID"
        });
      }

      // Handle the event
      switch (event.type) {
        case 'payment_intent.succeeded':
          const paymentIntent = event.data.object;
          console.log('[Webhook] PaymentIntent succeeded:', paymentIntent.id);

          // Handle CEO T-shirt purchase
          if (paymentIntent.metadata?.product_type === 'ceo_tshirt') {
            const userId = paymentIntent.metadata.user_id;
            if (userId) {
              await storage.updateUser(userId, {
                hasCeoTshirt: true,
                tshirtPurchaseDate: new Date(),
              });
              console.log(`[Webhook] CEO T-shirt purchase completed for user ${userId}`);
            }
          }

          // Update payment status in database
          const metadata = paymentIntent.metadata;
          if (metadata?.orderId || metadata?.rideId) {
            // Update order/ride status to completed
            if (metadata.orderId) {
              await storage.updateOrder(metadata.orderId, { status: 'completed' });
              console.log(`[Webhook] Order ${metadata.orderId} marked as completed`);
            }
            if (metadata.rideId) {
              await storage.updateRide(metadata.rideId, { status: 'completed' });
              console.log(`[Webhook] Ride ${metadata.rideId} marked as completed`);
            }

            // Create payment record
            await storage.createPayment({
              userId: metadata.userId,
              orderId: metadata.orderId || null,
              rideId: metadata.rideId || null,
              stripePaymentIntentId: paymentIntent.id,
              amount: (paymentIntent.amount / 100).toString(), // Convert from cents
              currency: paymentIntent.currency,
              paymentMethod: metadata.paymentMethod || 'stripe',
              status: 'completed',
              metadata: metadata
            });
            console.log(`[Webhook] Payment record created for ${paymentIntent.id}`);
          }
          break;

        case 'payment_intent.payment_failed':
          const failedPayment = event.data.object;
          console.log('[Webhook] PaymentIntent failed:', failedPayment.id);
          
          // Update payment status to failed
          const failedMetadata = failedPayment.metadata;
          if (failedMetadata?.orderId || failedMetadata?.rideId) {
            await storage.createPayment({
              userId: failedMetadata.userId,
              orderId: failedMetadata.orderId || null,
              rideId: failedMetadata.rideId || null,
              stripePaymentIntentId: failedPayment.id,
              amount: (failedPayment.amount / 100).toString(),
              currency: failedPayment.currency,
              paymentMethod: failedMetadata.paymentMethod || 'stripe',
              status: 'failed',
              metadata: failedMetadata
            });
          }
          break;

        case 'payment_intent.canceled':
          console.log('[Webhook] PaymentIntent canceled:', event.data.object.id);
          break;

        default:
          console.log(`[Webhook] Unhandled event type: ${event.type}`);
      }

      // Return a 200 response to acknowledge receipt of the event
      res.json({ received: true, processed: true });
    } catch (error: any) {
      console.error('[Webhook] Error processing webhook:', error);
      res.status(500).json({ 
        message: 'Webhook processing failed',
        error: error.message 
      });
    }
  });

  // Analytics routes (public aggregate counts for home page + dashboard)
  app.get("/api/analytics/overview", async (req, res) => {
    try {
      const spots = await storage.getAllSpots();
      const airbears = await storage.getAllAirbears();

      // Handle both camelCase (MemStorage) and snake_case (Supabase) field names
      const getField = (a: any, camel: string, snake: string) => a[camel] ?? a[snake];
      const isAvailable = (a: any) => getField(a, 'isAvailable', 'is_available') === true;
      const isCharging = (a: any) => getField(a, 'isCharging', 'is_charging') === true;
      const batteryLevel = (a: any) => getField(a, 'batteryLevel', 'battery_level') ?? 0;
      const maintenanceStatus = (a: any) => getField(a, 'maintenanceStatus', 'maintenance_status') ?? 'good';

      const activeAirbears = airbears.filter(a => isAvailable(a) && !isCharging(a));
      const chargingAirbears = airbears.filter(a => isCharging(a));
      const maintenanceAirbears = airbears.filter(a => maintenanceStatus(a) !== "good");

      const analytics = {
        totalSpots: spots.length,
        totalAirbears: airbears.length,
        activeAirbears: activeAirbears.length,
        chargingAirbears: chargingAirbears.length,
        maintenanceAirbears: maintenanceAirbears.length,
        averageBatteryLevel: airbears.length > 0
          ? Math.round(airbears.reduce((sum, a) => sum + (Number(batteryLevel(a)) || 0), 0) / airbears.length)
          : 0
      };

      res.json(analytics);
    } catch (error: any) {
      logRouteError(req, error);
      res.status(500).json({ message: error.message });
    }
  });

  // Push Notification Subscription Management
  app.post("/api/push-subscriptions", requireAuth, async (req, res) => {
    try {
      const { subscription, preferences } = req.body;

      if (!subscription || !preferences) {
        return res.status(400).json({ message: "Subscription and preferences required" });
      }

      // In a real app, you'd store this in a database
      // For now, we'll just log it and return success
      console.log('Push subscription registered:', {
        endpoint: subscription.endpoint,
        preferences
      });

      res.json({
        success: true,
        message: "Push subscription registered successfully"
      });
    } catch (error: any) {
      logRouteError(req, error);
      res.status(500).json({ message: error.message });
    }
  });

  // Update push notification preferences
  app.patch("/api/push-subscriptions", requireAuth, async (req, res) => {
    try {
      const { endpoint, preferences } = req.body;

      if (!endpoint || !preferences) {
        return res.status(400).json({ message: "Endpoint and preferences required" });
      }

      console.log('Push preferences updated:', {
        endpoint,
        preferences
      });

      res.json({
        success: true,
        message: "Push preferences updated successfully"
      });
    } catch (error: any) {
      logRouteError(req, error);
      res.status(500).json({ message: error.message });
    }
  });

  // Remove push subscription
  app.delete("/api/push-subscriptions", requireAuth, async (req, res) => {
    try {
      const { endpoint } = req.body;

      if (!endpoint) {
        return res.status(400).json({ message: "Endpoint required" });
      }

      console.log('Push subscription removed:', endpoint);

      res.json({
        success: true,
        message: "Push subscription removed successfully"
      });
    } catch (error: any) {
      logRouteError(req, error);
      res.status(500).json({ message: error.message });
    }
  });

  // Send test notification (for testing purposes)
  app.post("/api/notifications/test", requireAuth, async (req, res) => {
    try {
      // In a real app, this would send a push notification to the user's subscription
      // For now, we'll just simulate it

      res.json({
        success: true,
        message: "Test notification sent successfully"
      });
    } catch (error: any) {
      logRouteError(req, error);
      res.status(500).json({ message: error.message });
    }
  });

  // Driver availability notification endpoint (called when drivers become available)
  app.post("/api/notifications/driver-available", requireAuth, async (req, res) => {
    try {
      const { userId, location, availableDrivers } = req.body;

      if (!userId) {
        return res.status(400).json({ message: "User ID required" });
      }

      // Ownership check: userId must match the authenticated user
      const authUserId = getAuthUserId(req);
      if (userId !== authUserId) {
        return res.status(403).json({ message: "Forbidden: cannot request notifications for another user" });
      }

      // In a real app, this would:
      // 1. Find the user's push subscription
      // 2. Send a push notification with driver availability info
      // 3. Include location and number of available drivers

      console.log('Driver availability notification requested:', {
        userId,
        location,
        availableDrivers: availableDrivers || 1
      });

      res.json({
        success: true,
        message: "Driver availability notification sent"
      });
    } catch (error: any) {
      logRouteError(req, error);
      res.status(500).json({ message: error.message });
    }
  });

  return app;
}
// Trigger deployment
