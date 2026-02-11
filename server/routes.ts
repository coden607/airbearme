import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage.js";
import { insertRideSchema, insertOrderSchema, insertPaymentSchema, updateRideSchema, updateAirbearSchema } from "../shared/schema.js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { getActiveSpotsData } from "../shared/spots-data.js";
import { env, ApiError, asyncHandler, requireAuth, requireAdmin } from "./utils.js";
import bcrypt from "bcryptjs";


const logRouteError = (req: Request, error: unknown) => {
  const requestId = req.get("x-request-id");
  const prefix = requestId ? `[${requestId}] ` : "";
  console.error(`${prefix}[RouteError] ${req.method} ${req.path}`, error);
};

export async function registerRoutes(app: Express): Promise<Express> {
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

      console.log(`[Auth] Registration attempt for: ${userData.email}`);

      // Check for existing user with same email
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      let authUserId: string | undefined;

      const passwordHash = await bcrypt.hash(userData.password, 10);

      // If Supabase is available, create auth user first
      if (supabaseAdmin) {
        console.log(`[Auth] Creating Supabase auth user for: ${userData.email}`);
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
          console.log(`[Auth] Supabase auth user created: ${authData.user.id}`);
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

      console.log(`[Auth] Registration successful for: ${userData.email}, user ID: ${profile.id}`);
      req.session.userId = profile.id;
      req.session.userRole = profile.role;
      req.session.save(() => {
        res.json({ user: { id: profile.id, email: profile.email, username: profile.username, role: profile.role } });
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

      console.log(`[Auth] Login attempt for: ${email}`);

      // Try Supabase auth first if available
      if (supabaseAdmin && supabaseAuth) {
        console.log(`[Auth] Trying Supabase auth for: ${email}`);
        try {
          const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });

          if (!error && data.user) {
            console.log(`[Auth] Supabase signIn success for: ${email}`);
            const profile = await ensureUserProfile({
              email,
              username: (data.user.user_metadata?.username as string) || email.split("@")[0],
              fullName: (data.user.user_metadata?.fullName as string | undefined) || null,
              role: (data.user.user_metadata?.role as "user" | "driver" | "admin" | undefined) || "user",
              avatarUrl: (data.user.user_metadata?.avatar_url as string | undefined) || null,
            });
            req.session.userId = profile.id;
            req.session.userRole = profile.role;
            return req.session.save(() => {
              res.json({ user: { id: profile.id, email: profile.email, username: profile.username, role: profile.role, ecoPoints: profile.ecoPoints, totalRides: profile.totalRides, co2Saved: profile.co2Saved } });
            });
          }

          if (error) {
            console.log(`[Auth] Supabase signIn failed: ${error.message}`);
          }
        } catch (supabaseError: any) {
          console.error(`[Auth] Supabase auth exception:`, supabaseError);
        }
      } else {
        console.log(`[Auth] Supabase clients not configured`);
      }

      // Fallback to local storage auth
      if (storage.verifyPassword) {
        const user = await storage.verifyPassword(email, password);
        if (user) {
          console.log(`[Auth] Local storage auth success for: ${email}`);
          req.session.userId = user.id;
          req.session.userRole = user.role;
          return req.session.save(() => {
            res.json({ user: { id: user.id, email: user.email, username: user.username, role: user.role, ecoPoints: user.ecoPoints, totalRides: user.totalRides, co2Saved: user.co2Saved } });
          });
        }
      }

      // No valid credentials found
      console.log(`[Auth] All auth methods failed for: ${email}`);
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

      console.log(`[Auth] Password reset requested for: ${email}`);

      // Check if user exists
      const user = await storage.getUserByEmail(email);
      if (!user) {
        // Don't reveal whether email exists - always return success
        console.log(`[Auth] No user found for: ${email} (returning success anyway for security)`);
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
        } else {
          console.log(`[Auth] Password reset email sent via Supabase to: ${email}`);
        }
      } else {
        // For local auth without email service, we'll generate a reset token
        // In production, you'd send this via email
        const resetToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        console.log(`[Auth] Generated reset token for ${email}: ${resetToken}`);
        console.log(`[Auth] Note: In production, this token would be sent via email`);

        // Store the reset token (you'd add this to storage in production)
        // For now, log it so the user can manually reset
      }

      res.json({ success: true, message: "If an account with that email exists, a reset link has been sent." });
    } catch (error: any) {
      logRouteError(req, error);
      console.error(`[Auth] Forgot password error:`, error);
      // Always return success for security
      res.json({ success: true, message: "If an account with that email exists, a reset link has been sent." });
    }
  });

  // Reset password with token (for direct reset without email)
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { email, newPassword } = z.object({
        email: z.string().email(),
        newPassword: z.string().min(6),
      }).parse(req.body);

      console.log(`[Auth] Password reset attempt for: ${email}`);

      // Find user
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Update password in local storage
      if (storage.setPassword) {
        await storage.setPassword(user.id, newPassword);
        console.log(`[Auth] Password reset successful for: ${email}`);
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
      req.session.save(() => {
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
  app.post("/api/rides", requireAuth, async (req, res) => {
    try {
      const rideData = insertRideSchema.parse(req.body);
      const ride = await storage.createRide(rideData);
      res.json(ride);
    } catch (error: any) {
      logRouteError(req, error);
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/rides/user/:userId", requireAuth, async (req, res) => {
    try {
      const { userId } = req.params;
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

    const ride = await storage.updateRide(id, updates);
    res.json({ success: true, data: ride });
  }));

  // Update airbear (for assigning drivers, updating location, etc.)
  app.patch("/api/airbears/:id", requireAuth, asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const updates = updateAirbearSchema.parse(req.body);
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
      res.json(order);
    } catch (error: any) {
      logRouteError(req, error);
      res.status(500).json({ message: error.message });
    }
  });

  // Stripe payment routes
  app.post("/api/create-payment-intent", requireAuth, async (req, res) => {
    try {
      const { amount, orderId, rideId, userId, paymentMethod = "stripe" } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }

      if (paymentMethod === "cash") {
        // For cash payments, generate QR code data
        const qrData = {
          orderId,
          rideId,
          userId,
          amount,
          timestamp: Date.now(),
          method: "cash"
        };

        return res.json({
          qrCode: Buffer.from(JSON.stringify(qrData)).toString('base64'),
          paymentMethod: "cash"
        });
      }

      // Check if Stripe is configured
      if (!stripe) {
        console.log('Stripe not configured - payments unavailable');
        return res.status(503).json({
          error: "Payments not configured",
          message: "Payment processing is not available. Please contact support."
        });
      }

      // Create Stripe PaymentIntent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: "usd",
        automatic_payment_methods: {
          enabled: true
        },
        metadata: {
          orderId: orderId || null,
          rideId: rideId || null,
          userId: userId || null
        }
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status
      });
    } catch (error: any) {
      logRouteError(req, error);
      console.error('Payment intent creation error:', error);
      res.status(500).json({ message: error.message });
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
      const payment = await storage.createPayment(paymentData);
      res.json(payment);
    } catch (error: any) {
      logRouteError(req, error);
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/payments/confirm-cash", requireAuth, async (req, res) => {
    try {
      const { qrCode, driverId } = req.body;
      if (!qrCode) return res.status(400).json({ message: "Missing QR code data" });

      const decodedData = JSON.parse(Buffer.from(qrCode, 'base64').toString());
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
      // Check if Stripe is configured
      if (!stripe) {
        console.log('Stripe webhook received but Stripe not configured - ignoring');
        return res.json({ received: true, demo: true });
      }

      const sig = req.headers['stripe-signature'];
      const endpointSecret = env.STRIPE_WEBHOOK_SECRET;

      if (!sig || !endpointSecret) {
        return res.status(400).json({ message: "Missing signature or webhook secret" });
      }

      let event;
      try {
        event = stripe.webhooks.constructEvent((req as any).rawBody, sig, endpointSecret);
      } catch (err: any) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return res.status(400).json({ message: `Webhook signature verification failed: ${err.message}` });
      }

      // Handle the event
      switch (event.type) {
        case 'payment_intent.succeeded':
          const paymentIntent = event.data.object;
          console.log('PaymentIntent succeeded:', paymentIntent.id);

          // Handle CEO T-shirt purchase
          if (paymentIntent.metadata?.product_type === 'ceo_tshirt') {
            const userId = paymentIntent.metadata.user_id;
            if (userId) {
              await storage.updateUser(userId, {
                hasCeoTshirt: true,
                tshirtPurchaseDate: new Date()
              });
              console.log('CEO T-shirt activated for user:', userId);
            }
          }

          // Update payment status in database
          const metadata = paymentIntent.metadata;
          if (metadata?.orderId || metadata?.rideId) {
            // Update order/ride status to completed
            if (metadata.orderId) {
              await storage.updateOrder(metadata.orderId, { status: "completed" });
            }
            if (metadata.rideId) {
              await storage.updateRide(metadata.rideId, { status: "completed" });
            }
          }
          break;

        case 'payment_intent.payment_failed':
          const failedPayment = event.data.object;
          console.log('PaymentIntent failed:', failedPayment.id);
          break;

        default:
          console.log(`Unhandled event type ${event.type}`);
      }

      res.json({ received: true });
    } catch (error: any) {
      logRouteError(req, error);
      res.status(500).json({ message: error.message });
    }
  });

  // Analytics routes (for admin dashboard)
  app.get("/api/analytics/overview", requireAdmin, async (req, res) => {
    try {
      const spots = await storage.getAllSpots();
      const airbears = await storage.getAllAirbears();
      const activeAirbears = airbears.filter(a => a.isAvailable && !a.isCharging);
      const chargingAirbears = airbears.filter(a => a.isCharging);
      const maintenanceAirbears = airbears.filter(a => a.maintenanceStatus !== "good");

      const analytics = {
        totalSpots: spots.length,
        totalAirbears: airbears.length,
        activeAirbears: activeAirbears.length,
        chargingAirbears: chargingAirbears.length,
        maintenanceAirbears: maintenanceAirbears.length,
        averageBatteryLevel: airbears.length > 0
          ? Math.round(airbears.reduce((sum, a) => sum + a.batteryLevel, 0) / airbears.length)
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
