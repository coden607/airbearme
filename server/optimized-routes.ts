/**
 * Optimized API routes with improved performance, error handling, and type safety
 */

import type { Express, Request, Response, NextFunction } from "express";
import { 
  ApiResponse, 
  asyncHandler, 
  createAuthMiddleware, 
  createValidationMiddleware,
  createCacheMiddleware,
  createRateLimiter,
  createErrorHandler,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError
} from "./api-utils.js";
import { 
  insertRideSchema, 
  insertOrderSchema, 
  insertPaymentSchema, 
  updateRideSchema, 
  updateAirbearSchema 
} from "../shared/schema.js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { getActiveSpotsData } from "../shared/spots-data.js";
import { getEnvVar, getEnvVarOptional, createSafeValidator, retryAsync } from "../shared/utils.js";
import { optimizedStorage } from "./optimized-storage.js";
import { storage } from "./storage.js";

// Environment configuration with validation
const env = {
  SUPABASE_URL: getEnvVarOptional('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: getEnvVarOptional('SUPABASE_SERVICE_ROLE_KEY'),
  SUPABASE_ANON_KEY: getEnvVarOptional('SUPABASE_ANON_KEY'),
  STRIPE_SECRET_KEY: getEnvVarOptional('STRIPE_SECRET_KEY'),
  STRIPE_WEBHOOK_SECRET: getEnvVarOptional('STRIPE_WEBHOOK_SECRET'),
  QR_HMAC_SECRET: getEnvVarOptional('QR_HMAC_SECRET') || crypto.randomUUID(),
  NODE_ENV: getEnvVarOptional('NODE_ENV') || 'development',
} as const;

// Stripe initialization with lazy loading
let stripeInstance: any = null;
const getStripe = async () => {
  if (!stripeInstance && env.STRIPE_SECRET_KEY) {
    const Stripe = await import("stripe");
    stripeInstance = new Stripe.default(env.STRIPE_SECRET_KEY, {});
  }
  return stripeInstance;
};

// Supabase clients with lazy loading
let supabaseAdmin: any = null;
let supabaseAuth: any = null;

const getSupabaseAdmin = () => {
  if (!supabaseAdmin && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { 
      auth: { autoRefreshToken: false, persistSession: false } 
    });
  }
  return supabaseAdmin;
};

const getSupabaseAuth = () => {
  if (!supabaseAuth && env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { 
      auth: { autoRefreshToken: false, persistSession: false } 
    });
  }
  return supabaseAuth;
};

// Safe validators
const validateRide = createSafeValidator(insertRideSchema);
const validateOrder = createSafeValidator(insertOrderSchema);
const validatePayment = createSafeValidator(insertPaymentSchema);
const validateUpdateRide = createSafeValidator(updateRideSchema);
const validateUpdateAirbear = createSafeValidator(updateAirbearSchema);

// Auth helper functions
const getAuthUserId = (req: Request): string | undefined => {
  return req.session?.userId || (req as any).userId;
};

const getAuthUserRole = (req: Request): string | undefined => {
  return req.session?.userRole || (req as any).userRole;
};

// HMAC signature for QR codes
  const createHmacSignature = async (data: any): Promise<string> => {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(env.QR_HMAC_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(JSON.stringify(data))
    );
    
    return Array.from(new Uint8Array(signature))
      .map((b: number) => b.toString(16).padStart(2, '0'))
      .join('');
  };

const safeCompare = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
};

// Optimized user profile management
const ensureUserProfile = async (payload: any): Promise<any> => {
  const existingUser = payload.id
    ? await optimizedStorage.getUser(payload.id)
    : payload.email ? await optimizedStorage.getUserByEmail(payload.email) : null;

  if (existingUser) {
    // Only update if necessary
    const needsUpdate =
      existingUser.username !== payload.username ||
      (payload.fullName !== undefined && existingUser.fullName !== payload.fullName) ||
      (payload.avatarUrl !== undefined && existingUser.avatarUrl !== payload.avatarUrl) ||
      (payload.role !== undefined && existingUser.role !== payload.role);

    if (needsUpdate) {
      return optimizedStorage.updateUser(existingUser.id, {
        username: payload.username,
        fullName: payload.fullName ?? existingUser.fullName,
        avatarUrl: payload.avatarUrl ?? existingUser.avatarUrl,
        role: payload.role || existingUser.role,
      });
    }
    return existingUser;
  }

  return optimizedStorage.createUser({
    id: payload.id,
    email: payload.email || "",
    username: payload.username,
    fullName: payload.fullName ?? null,
    avatarUrl: payload.avatarUrl ?? null,
    role: payload.role || "user",
    ecoPoints: 0,
    totalRides: 0,
    co2Saved: "0",
    hasCeoTshirt: false,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    tshirtPurchaseDate: null
  });
};

// Optimized route registration
export async function registerOptimizedRoutes(app: Express): Promise<Express> {
  // Global middleware
  app.use(createErrorHandler());
  app.use(createRequestLogger({
    logLevel: 'info',
    skipPaths: ['/health', '/api/logs'],
    includeBody: false
  }));

  // Rate limiting
  app.use('/api/auth', createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10, // 10 requests per window
    message: 'Too many authentication attempts, please try again later'
  }));

  app.use('/api/payments', createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5, // 5 payment attempts per minute
    message: 'Too many payment attempts, please try again later'
  }));

  // Health check with caching
  app.get('/api/health', createCacheMiddleware({ ttl: 30 * 1000 }), (req, res) => {
    ApiResponse.success(res, {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "2.0.0",
      environment: env.NODE_ENV,
    });
  });

  // Error logging endpoint
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
    ApiResponse.success(res, { received: true });
  });

  // Event logging endpoint
  app.post("/api/logs/events", (req, res) => {
    const { event, data, timestamp } = req.body;
    console.log("[ClientEvent]", { event, data, timestamp });
    ApiResponse.success(res, { received: true });
  });

  // Authentication routes with validation
  app.post("/api/auth/register", 
    createValidationMiddleware(z.object({
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
    })),
    asyncHandler(async (req, res) => {
      const userData = req.body;

      // Check for existing user
      const existingUser = await optimizedStorage.getUserByEmail(userData.email);
      if (existingUser) {
        return ApiResponse.badRequest(res, "Email already registered");
      }

      let authUserId: string | undefined;

      // Try Supabase auth if available
      const supabase = getSupabaseAdmin();
      if (supabase) {
        try {
          const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: userData.email,
            password: userData.password,
            email_confirm: true,
            user_metadata: {
              username: userData.username,
              fullName: userData.fullName,
              role: userData.role || "user",
            },
          });

          if (authError) {
            console.error("[Auth] Supabase auth user creation failed:", authError);
          } else if (authData.user) {
            authUserId = authData.user.id;
          }
        } catch (error) {
          console.error("[Auth] Supabase auth exception:", error);
        }
      }

      // Create user profile
      const profile = await ensureUserProfile({
        id: authUserId,
        email: userData.email,
        username: userData.username,
        fullName: userData.fullName,
        avatarUrl: userData.avatarUrl,
        role: userData.role || "user",
      });

      // Store password for local auth fallback
      if ((optimizedStorage as any).setPassword) {
        await (optimizedStorage as any).setPassword(profile.id, userData.password);
      }

      // Create session
      req.session.userId = profile.id;
      req.session.userRole = profile.role;
      req.session.save((err) => {
        if (err) console.error('[Session] Save error:', err);
      });

      ApiResponse.created(res, {
        user: { 
          id: profile.id, 
          email: profile.email, 
          username: profile.username, 
          role: profile.role, 
          ecoPoints: profile.ecoPoints, 
          totalRides: profile.totalRides, 
          co2Saved: profile.co2Saved 
        }
      });
    })
  );

  app.post("/api/auth/login",
    createValidationMiddleware(z.object({
      email: z.string().email(),
      password: z.string().min(6),
    })),
    asyncHandler(async (req, res) => {
      const { email, password } = req.body;

      const sendLoginSuccess = (user: any) => {
        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.session.save((err) => {
          if (err) console.error('[Session] Save error:', err);
        });
        ApiResponse.success(res, { user });
      };

      const toUserResponse = (profile: any) => ({
        id: profile.id, 
        email: profile.email, 
        username: profile.username,
        role: profile.role, 
        ecoPoints: profile.ecoPoints, 
        totalRides: profile.totalRides, 
        co2Saved: profile.co2Saved,
      });

      // Try Supabase auth first
      const authClient = getSupabaseAuth() || getSupabaseAdmin();
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
        } catch (error) {
          console.error("[Auth] Supabase auth exception:", error);
        }
      }

      // Fallback to local auth
      if ((optimizedStorage as any).verifyPassword) {
        const user = await (optimizedStorage as any).verifyPassword(email, password);
        if (user) {
          return sendLoginSuccess(toUserResponse(user));
        }
      }

      ApiResponse.unauthorized(res, "Invalid email or password");
    })
  );

  // Password reset routes
  app.post("/api/auth/forgot-password",
    createValidationMiddleware(z.object({
      email: z.string().email(),
    })),
    asyncHandler(async (req, res) => {
      const { email } = req.body;

      // Check if user exists (but don't reveal if not)
      const user = await optimizedStorage.getUserByEmail(email);
      
      if (user && getSupabaseAdmin()) {
        try {
          const { error } = await getSupabaseAdmin()!.auth.resetPasswordForEmail(email, {
            redirectTo: `${req.protocol}://${req.get('host')}/auth/reset-password`,
          });

          if (error) {
            console.error("[Auth] Supabase password reset error:", error);
          }
        } catch (error) {
          console.error("[Auth] Password reset error:", error);
        }
      }

      // Always return success for security
      ApiResponse.success(res, { 
        success: true, 
        message: "If an account with that email exists, a reset link has been sent." 
      });
    })
  );

  // Data routes with caching
  app.get("/api/spots", 
    createCacheMiddleware({ ttl: 30 * 60 * 1000 }), // 30 minutes
    asyncHandler(async (req, res) => {
      try {
        const storageSpots = await optimizedStorage.getAllSpots();
        
        // Fallback to shared data if insufficient spots
        if (storageSpots.length < 16) {
          const sharedSpots = getActiveSpotsData();
          return ApiResponse.success(res, sharedSpots);
        }
        
        ApiResponse.success(res, storageSpots);
      } catch (error) {
        ApiResponse.internalError(res, "Failed to fetch spots");
      }
    })
  );

  app.get("/api/airbears",
    createCacheMiddleware({ ttl: 2 * 60 * 1000 }), // 2 minutes
    asyncHandler(async (req, res) => {
      try {
        const airbears = await optimizedStorage.getAllAirbears();
        ApiResponse.success(res, airbears);
      } catch (error) {
        ApiResponse.internalError(res, "Failed to fetch airbears");
      }
    })
  );

  app.get("/api/airbears/available",
    createCacheMiddleware({ ttl: 1 * 60 * 1000 }), // 1 minute
    asyncHandler(async (req, res) => {
      try {
        const airbears = await optimizedStorage.getAvailableAirbears();
        ApiResponse.success(res, airbears);
      } catch (error) {
        ApiResponse.internalError(res, "Failed to fetch available airbears");
      }
    })
  );

  // Bodega routes with caching
  app.get("/api/bodega/items",
    createCacheMiddleware({ ttl: 15 * 60 * 1000 }), // 15 minutes
    asyncHandler(async (req, res) => {
      try {
        const { category } = req.query;
        const items = category
          ? await optimizedStorage.getBodegaItemsByCategory(category as string)
          : await optimizedStorage.getAllBodegaItems();
        ApiResponse.success(res, items);
      } catch (error) {
        ApiResponse.internalError(res, "Failed to fetch bodega items");
      }
    })
  );

  // Protected routes with authentication
  app.use('/api', createAuthMiddleware({ required: true }));

  // Rides routes with validation
  app.post("/api/rides",
    createValidationMiddleware(insertRideSchema),
    asyncHandler(async (req, res) => {
      const rideData = req.body;
      const authUserId = getAuthUserId(req);
      const authUserRole = getAuthUserRole(req);

      // Ownership check
      if (rideData.userId && rideData.userId !== authUserId) {
        return ApiResponse.forbidden(res, "Cannot create a ride for another user");
      }

      // Role restriction
      if (authUserRole === "driver") {
        return ApiResponse.forbidden(res, "Drivers cannot book rides as passengers. This feature is for customers only.");
      }

      try {
        const ride = await optimizedStorage.createRide(rideData);
        ApiResponse.created(res, ride);
      } catch (error) {
        ApiResponse.internalError(res, "Failed to create ride");
      }
    })
  );

  app.get("/api/rides/user/:userId",
    createValidationMiddleware(z.object({ userId: z.string() }), 'params'),
    asyncHandler(async (req, res) => {
      const { userId } = req.params;
      const authUserId = getAuthUserId(req);
      const authUserRole = getAuthUserRole(req);

      // Ownership check
      if (userId !== authUserId && authUserRole !== "admin") {
        return ApiResponse.forbidden(res, "Cannot access another user's rides");
      }

      try {
        const rides = await optimizedStorage.getRidesByUser(userId);
        ApiResponse.success(res, rides);
      } catch (error) {
        ApiResponse.internalError(res, "Failed to fetch rides");
      }
    })
  );

  app.get("/api/rides/pending",
    asyncHandler(async (req, res) => {
      try {
        const rides = await optimizedStorage.getPendingRides();
        ApiResponse.success(res, rides);
      } catch (error) {
        ApiResponse.internalError(res, "Failed to fetch pending rides");
      }
    })
  );

  app.get("/api/rides/:id",
    createValidationMiddleware(z.object({ id: z.string() }), 'params'),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const authUserId = getAuthUserId(req);
      const authUserRole = getAuthUserRole(req);

      try {
        const ride = await optimizedStorage.getRide(id);
        if (!ride) {
          return ApiResponse.notFound(res, "Ride");
        }

        // Ownership check
        const isOwner = ride.userId === authUserId;
        const isDriver = ride.driverId === authUserId;
        const isAdmin = authUserRole === "admin";

        if (!isOwner && !isDriver && !isAdmin) {
          return ApiResponse.forbidden(res, "You are not authorized to view this ride");
        }

        ApiResponse.success(res, ride);
      } catch (error) {
        ApiResponse.internalError(res, "Failed to fetch ride");
      }
    })
  );

  app.patch("/api/rides/:id",
    createValidationMiddleware(z.object({ id: z.string() }), 'params'),
    createValidationMiddleware(updateRideSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const updates = req.body;
      const authUserId = getAuthUserId(req);
      const authUserRole = getAuthUserRole(req);

      try {
        const existingRide = await optimizedStorage.getRide(id);
        if (!existingRide) {
          return ApiResponse.notFound(res, "Ride");
        }

        // Ownership check
        const isRideOwner = authUserId === existingRide.userId;
        const isAssignedDriver = existingRide.driverId && authUserId === existingRide.driverId;
        const isDriverAccepting = authUserRole === "driver" && 
          existingRide.status === "pending" && 
          updates.status === "accepted" && 
          updates.driverId === authUserId;
        const isAdmin = authUserRole === "admin";

        if (!isRideOwner && !isAssignedDriver && !isDriverAccepting && !isAdmin) {
          return ApiResponse.forbidden(res, "You are not authorized to update this ride");
        }

        // Auto-set timestamps
        const enrichedUpdates: any = { ...updates };
        if (updates.status === "accepted" && !existingRide.acceptedAt) {
          enrichedUpdates.acceptedAt = new Date();
        }
        if (updates.status === "in_progress" && !existingRide.startedAt) {
          enrichedUpdates.startedAt = new Date();
        }
        if (updates.status === "completed" && !existingRide.completedAt) {
          enrichedUpdates.completedAt = new Date();
        }

        const ride = await optimizedStorage.updateRide(id, enrichedUpdates);
        ApiResponse.success(res, ride);
      } catch (error) {
        ApiResponse.internalError(res, "Failed to update ride");
      }
    })
  );

  // Orders routes
  app.post("/api/orders",
    createValidationMiddleware(insertOrderSchema),
    asyncHandler(async (req, res) => {
      const orderData = req.body;
      const authUserId = getAuthUserId(req);
      const authUserRole = getAuthUserRole(req);

      // Ownership check
      if (orderData.userId !== authUserId) {
        return ApiResponse.forbidden(res, "Cannot create order for another user");
      }

      // Role restriction
      if (authUserRole === "driver") {
        return ApiResponse.forbidden(res, "Drivers cannot place bodega orders. This feature is for customers only.");
      }

      try {
        const order = await optimizedStorage.createOrder(orderData);
        ApiResponse.created(res, order);
      } catch (error) {
        ApiResponse.internalError(res, "Failed to create order");
      }
    })
  );

  // Payment routes with enhanced security
  app.post("/api/create-payment-intent",
    createValidationMiddleware(z.object({
      amount: z.number().positive(),
      orderId: z.string().optional(),
      rideId: z.string().optional(),
      userId: z.string().optional(),
      paymentMethod: z.enum(["stripe", "cash"]).default("stripe"),
    })),
    asyncHandler(async (req, res) => {
      const { amount, orderId, rideId, userId, paymentMethod = "stripe" } = req.body;
      const authUserId = getAuthUserId(req);
      const authUserRole = getAuthUserRole(req);

      // Ownership check
      if (userId && userId !== authUserId) {
        return ApiResponse.forbidden(res, "Cannot create payment for another user");
      }

      // Role restriction
      if (authUserRole === "driver") {
        return ApiResponse.forbidden(res, "Drivers cannot create payment intents. This feature is for customers only.");
      }

      try {
        if (paymentMethod === "cash") {
          // Generate QR code with HMAC signature
          const qrData = {
            orderId,
            rideId,
            userId: authUserId,
            amount,
            timestamp: Date.now(),
            method: "cash"
          };

          const signature = await createHmacSignature(qrData);

          return ApiResponse.success(res, {
            qrCode: Buffer.from(JSON.stringify(qrData)).toString('base64'),
            signature,
            paymentMethod: "cash"
          });
        }

        // Stripe payment intent
        const stripe = await getStripe();
        if (!stripe) {
          return ApiResponse.error(res, new ApiError(503, "Payments not configured", "PAYMENTS_UNAVAILABLE"));
        }

        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(amount * 100),
          currency: "usd",
          automatic_payment_methods: { enabled: true },
          metadata: {
            orderId: orderId || null,
            rideId: rideId || null,
            userId: userId || null
          }
        });

        ApiResponse.success(res, {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          status: paymentIntent.status
        });
      } catch (error) {
        ApiResponse.internalError(res, "Failed to create payment intent");
      }
    })
  );

  // Analytics with caching
  app.get("/api/analytics/overview",
    createCacheMiddleware({ ttl: 5 * 60 * 1000 }), // 5 minutes
    asyncHandler(async (req, res) => {
      try {
        const analytics = await optimizedStorage.getAnalytics();
        ApiResponse.success(res, analytics);
      } catch (error) {
        ApiResponse.internalError(res, "Failed to fetch analytics");
      }
    })
  );

  // Cache management endpoint (admin only)
  app.post("/api/admin/cache/clear",
    createAuthMiddleware({ roles: ["admin"] }),
    asyncHandler(async (req, res) => {
      const { pattern } = req.body;
      optimizedStorage.clearCache(pattern);
      ApiResponse.success(res, { message: "Cache cleared successfully" });
    })
  );

  app.get("/api/admin/cache/stats",
    createAuthMiddleware({ roles: ["admin"] }),
    asyncHandler(async (req, res) => {
      const stats = optimizedStorage.getCacheStats();
      ApiResponse.success(res, stats);
    })
  );

  return app;
}
