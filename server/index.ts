import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import session from "express-session";
import { registerRoutes } from "./routes.js";
import { log, env, errorHandler } from "./utils.js";

const app = express();
app.use((req, res, next) => {
  const incomingRequestId = req.get("x-request-id");
  const requestId = incomingRequestId && incomingRequestId.length < 128
    ? incomingRequestId
    : (globalThis as any).crypto.randomUUID();
  res.locals.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
});

app.use(express.json({
  verify: (req: any, _res, buf) => {
    if (req.originalUrl.startsWith('/api/webhooks/stripe')) {
      req.rawBody = buf;
    }
  }
}));
app.use(express.urlencoded({ extended: false }));

// Trust proxy for Vercel (HTTPS terminates at the edge)
app.set('trust proxy', 1);

// Session middleware for server-side auth
app.use(session({
  secret: env.SESSION_SECRET || "dev-session-secret-change-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to false for localhost testing
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

// Define lenient CSP for development
const devCsp = {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
      "https://js.stripe.com",
      "https://unpkg.com",
      "https://vercel.live",
      "https://*.facebook.com"
    ],
    scriptSrcElem: [
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
      "https://js.stripe.com",
      "https://unpkg.com",
      "https://vercel.live",
      "https://*.facebook.com"
    ],
    styleSrc: [
      "'self'",
      "'unsafe-inline'",
      "https://unpkg.com",
      "https://fonts.googleapis.com"
    ],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://*.stripe.com",
          "https://unpkg.com",
          "https://*.facebook.com",
          "https://*.fbcdn.net",
          "https://*.tile.openstreetmap.org",
          "https://tile.openstreetmap.org",
          "https://images.unsplash.com",
          "https://*.unsplash.com"
        ],
        fontSrc: [
          "'self'",
          "https://unpkg.com",
          "https://fonts.gstatic.com",
          "data:"
        ],
        connectSrc: [
          "'self'",
          "ws:",
          "wss:",
          "http:",
          "https:",
          "https://*.supabase.co",
          "https://*.stripe.com",
          "https://vercel.live",
          "https://*.facebook.com",
          "wss://*.supabase.co",
          "data:"
        ],
        frameSrc: [
          "'self'",
          "https://js.stripe.com",
          "https://hooks.stripe.com",
          "https://vercel.live",
          "https://*.vercel.live",
          "https://*.facebook.com"
        ],
        mediaSrc: [
          "'self'",
          "https://*.facebook.com",
          "https://*.fbcdn.net"
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: [
          "'self'",
          "https://*.stripe.com",
          "https://*.facebook.com"
        ],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: []
      }
};

// Define CSP for production - need unsafe-inline for Vite-injected styles and inline scripts
const prodCsp = {
  ...devCsp,
  directives: {
    ...devCsp.directives,
    scriptSrc: [
      "'self'",
      "'unsafe-inline'",
      "https://js.stripe.com",
      "https://unpkg.com",
      "https://vercel.live",
      "https://*.facebook.com"
    ],
    scriptSrcElem: [
      "'self'",
      "'unsafe-inline'",
      "https://js.stripe.com",
      "https://unpkg.com",
      "https://vercel.live",
      "https://*.facebook.com"
    ],
    styleSrc: [
      "'self'",
      "'unsafe-inline'",
      "https://unpkg.com",
      "https://fonts.googleapis.com"
    ],
  }
};

// Security middleware with CSP
app.use(
  helmet({
    contentSecurityPolicy: env.NODE_ENV === 'production' ? prodCsp : devCsp,
    crossOriginEmbedderPolicy: false,
  })
);

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  if (path.startsWith("/api")) {
    let capturedJsonResponse: Record<string, any> | undefined = undefined;
    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      const isProduction = env.NODE_ENV === "production";
      const isError = res.statusCode >= 400;
      const requestId = res.locals.requestId as string | undefined;

      // Only log if not in production, or if it's an error in production
      if (!isProduction || isError) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (requestId) {
          logLine = `[${requestId}] ${logLine}`;
        }
        if (capturedJsonResponse && !isProduction) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }

        if (logLine.length > 200) {
          logLine = logLine.slice(0, 199) + "…";
        }

        log(logLine);
      }
    });
  }

  next();
});

export async function createApp() {
  // Register API routes BEFORE Vite middleware
  await registerRoutes(app);

  // Centralized error handler - must be last middleware
  app.use(errorHandler);

  let server;
  if (app.get("env") === "development") {
    const { createServer } = await import("http");
    server = createServer(app);
    const { setupVite } = await import("./vite.js");
    await setupVite(app, server);
  } else {
    const { serveStatic } = await import("./vite.js");
    serveStatic(app);
  }

  return { app, server };
}

export default app;
