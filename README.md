# AirBear PWA - Solar-Powered Eco-Ride Platform

> **"AirBear flair, ride without a care—solar power in the air!"**

AirBear is a solar-powered ride-sharing PWA featuring eco-friendly vehicles with onboard mobile bodegas in Binghamton, NY.

**Production:** https://pwa4-seven.vercel.app

## Quick Start

```bash
# Install dependencies
npm install

# Development (with hot reload)
npm run dev

# Production build
npm run build

# Start production server
npm start
```

## Project Structure

```
pwa4/
├── client/                 # React frontend
│   └── src/
│       ├── components/     # Reusable UI components
│       ├── hooks/          # Custom React hooks
│       │   ├── use-auth.tsx           # Authentication state
│       │   ├── use-driver-location.tsx # Real-time GPS tracking
│       │   └── use-toast.ts           # Toast notifications
│       ├── lib/            # Utilities
│       │   ├── stripe.ts              # Payment processing
│       │   ├── supabase-client.ts     # Supabase connection
│       │   └── spots.ts               # Location data
│       └── pages/          # Route pages
│           ├── map.tsx                # Interactive map
│           ├── checkout.tsx           # Payment flow
│           ├── driver-dashboard.tsx   # Driver interface
│           └── auth.tsx               # Login/register
├── server/                 # Express backend
│   ├── index.ts           # App entry, middleware
│   ├── routes.ts          # API endpoints
│   ├── storage.ts         # Database abstraction
│   └── utils.ts           # Error handling, logging
├── shared/                # Shared code
│   ├── schema.ts          # Database schema (Drizzle)
│   └── spots-data.ts      # Location data
└── dist/                  # Production build output
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, TailwindCSS, Framer Motion |
| Backend | Express.js, Node.js, TypeScript |
| Database | PostgreSQL (Supabase), Drizzle ORM |
| Auth | Supabase Auth |
| Payments | Stripe, Apple Pay, Google Pay |
| Maps | Leaflet.js |
| Realtime | Supabase Realtime |
| Hosting | Vercel |

## API Endpoints

### Authentication
```
POST /api/auth/register     # Create user account
POST /api/auth/login        # Supabase sign-in
POST /api/auth/sync-profile # Sync user profile
```

### Rides
```
POST   /api/rides           # Create ride request
GET    /api/rides/user/:id  # Get user's rides
GET    /api/rides/pending   # Get pending rides (drivers)
GET    /api/rides/driver/:id # Get driver's rides
GET    /api/rides/:id       # Get ride by ID
PATCH  /api/rides/:id       # Update ride status
```

### AirBears (Vehicles)
```
GET    /api/airbears        # Get all vehicles
PATCH  /api/airbears/:id    # Update vehicle (location, status)
```

### Spots (Locations)
```
GET    /api/spots           # Get all pickup/dropoff locations
```

### Bodega (Store)
```
GET    /api/bodega-items    # Get all items
GET    /api/bodega/items?category=snacks # Filter by category
```

### Payments
```
POST   /api/create-payment-intent    # Create Stripe PaymentIntent
POST   /api/payments/confirm         # Confirm payment
POST   /api/payments/confirm-cash    # QR-based cash payment
POST   /api/webhooks/stripe          # Stripe webhook handler
```

### Health
```
GET    /api/health          # Service health check
```

## Database Schema

```typescript
// Users
users: { id, email, username, role, ecoPoints, totalRides, co2Saved, ... }

// Rides
rides: { id, userId, driverId, airbearId, pickupSpotId, dropoffSpotId, status, fare, ... }

// AirBears (Vehicles)
airbears: { id, driverId, latitude, longitude, batteryLevel, isAvailable, ... }

// Spots (Locations)
spots: { id, name, latitude, longitude, isActive, ... }

// Bodega Items
bodega_items: { id, name, price, category, isAvailable, stock, ... }

// Orders & Payments
orders: { id, userId, rideId, items, totalAmount, status, ... }
payments: { id, userId, amount, status, paymentMethod, ... }
```

## Environment Variables

```env
# Supabase (required for production)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_key
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key

# Stripe (required for payments)
VITE_STRIPE_PUBLIC_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Optional
DATABASE_URL=postgresql://...
NODE_ENV=production
USE_MOCK_DATABASE=false
```

## Development

### Local Development
```bash
npm run dev  # Starts Vite dev server with hot reload
```

### Type Checking
```bash
npx tsc --noEmit  # Check TypeScript errors
```

### Build & Deploy
```bash
npm run build           # Build for production
npx vercel --prod       # Deploy to Vercel
```

## Error Handling

The API uses standardized error responses:

```typescript
interface ErrorResponse {
  success: false;
  message: string;
  code: "VALIDATION_ERROR" | "NOT_FOUND" | "UNAUTHORIZED" | "BAD_REQUEST" | "INTERNAL_ERROR";
  details?: unknown;
  requestId?: string;
}
```

Example:
```json
{
  "success": false,
  "message": "Ride not found",
  "code": "NOT_FOUND",
  "requestId": "abc-123"
}
```

## Validation

PATCH endpoints use Zod schemas for validation:

```typescript
// Ride updates
updateRideSchema: {
  status?: "pending" | "accepted" | "in_progress" | "completed" | "cancelled",
  driverId?: string,
  airbearId?: string,
  ...
}

// AirBear updates
updateAirbearSchema: {
  latitude?: string,
  longitude?: string,
  isAvailable?: boolean,
  batteryLevel?: number,
  ...
}
```

## Key Features

- **Triple Role System**: Admin, Driver, User roles
- **Real-time Tracking**: GPS location updates via Supabase Realtime
- **Interactive Map**: Leaflet.js with custom AirBear markers
- **PWA**: Installable, offline-capable, push notifications
- **Multi-Payment**: Stripe, Apple Pay, Google Pay, Cash QR
- **CEO T-Shirt Promo**: $100 purchase = daily free rides

## Architecture Decisions

1. **PostgreSQL column names**: Uses lowercase (PostgreSQL lowercases unquoted identifiers)
2. **Dual storage**: MemStorage for dev, Supabase for production
3. **Field normalization**: `getField()` helper handles camelCase/snake_case/lowercase
4. **Error handling**: Centralized `ApiError` class with typed error codes
5. **Type safety**: Strict TypeScript, Zod validation on API boundaries

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/name`)
3. Commit changes (`git commit -m 'Add feature'`)
4. Push to branch (`git push origin feature/name`)
5. Open a Pull Request

## License

MIT License - Copyright © 2024 AirBear

---

**Made with 🌱 in Binghamton, NY**
