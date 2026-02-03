# AirBear PWA - Production Database Fix Instructions

## 🔴 Current Issue

Your production deployment is **LIVE** but has a **critical database schema mismatch**:

```
Error: "column bodega_items.is_available does not exist"
```

This breaks:
- ❌ Bodega shopping
- ❌ E-commerce checkout
- ❌ Stripe/Apple Pay/Google Pay/Cash payments
- ❌ Complete user workflows

## ✅ What's Working

- ✅ Site is live at https://pwa4-seven.vercel.app
- ✅ PWA manifest & service worker
- ✅ Map with 16 spots
- ✅ 1 AirBear vehicle
- ✅ Authentication infrastructure
- ✅ All environment variables configured

## 🔧 Fix Steps (10 minutes)

### Step 1: Open Supabase SQL Editor (2 min)

1. Go to https://supabase.com/dashboard
2. Select your project
3. Click **SQL Editor** in left sidebar
4. Click **New query**

### Step 2: Run Migration Script (3 min)

Copy and paste the entire contents of `supabase-migration-fix.sql` into the SQL Editor and click **RUN**.

This will:
- ✅ Add missing `is_available` column
- ✅ Seed 12 bodega items with images
- ✅ Add 9 more AirBears (total 10)
- ✅ Verify counts

### Step 3: Verify Fix (2 min)

Test the APIs:

```bash
# Should return 12 products
curl https://pwa4-seven.vercel.app/api/bodega/items | jq length

# Should return 10 vehicles
curl https://pwa4-seven.vercel.app/api/airbears | jq length

# Should show several available
curl https://pwa4-seven.vercel.app/api/airbears | jq '[.[] | select(.isavailable == true)] | length'
```

### Step 4: Test Complete Workflows (10 min)

#### User Workflow
1. Open https://pwa4-seven.vercel.app
2. Click "Sign Up" → Register as user
3. Go to Map → See 10 AirBears and 16 spots
4. Request a ride
5. Go to Bodega → See 12 products
6. Add items to cart
7. Checkout → Test Stripe payment

#### Driver Workflow
1. Sign up as driver
2. Accept pending ride
3. Start ride → Location updates in real-time
4. Complete ride

## 🎯 Success Criteria

After the fix, you should have:

- ✅ 12 bodega items across 4 categories
- ✅ 10 AirBears (6-7 available, some charging)
- ✅ 16 pickup/dropoff spots
- ✅ Complete shopping cart → checkout flow
- ✅ All payment methods testable

## 📋 Testing Checklist

### Bodega & Payments
- [ ] Browse bodega items
- [ ] Add to cart
- [ ] Checkout with Stripe
- [ ] Test Apple Pay availability
- [ ] Test Google Pay availability
- [ ] Generate cash QR code

### Map & Rides
- [ ] Map displays with 16 spots
- [ ] See 10 AirBears with battery levels
- [ ] Available vs charging status visible
- [ ] Book ride between 2 spots
- [ ] Track driver location (real-time)

### Authentication
- [ ] Sign up as user
- [ ] Sign up as driver
- [ ] Profile data persists
- [ ] Supabase auth working

## 🚨 Alternative: Use Drizzle Push

If you have Drizzle Kit configured with your production database:

```bash
# Push schema to Supabase
npm run db:push

# Then seed data manually or run seeding script
```

But the SQL script above is **faster and safer** for production.

## 📞 Troubleshooting

### "Permission denied" error
- Make sure you're using the **service role key** in Supabase settings
- Check RLS policies allow inserts

### Bodega items still not loading
- Clear browser cache
- Check Vercel deployment logs
- Verify column names match schema (snake_case in DB)

### AirBears not showing on map
- Check browser console for errors
- Verify Supabase URL in environment variables
- Test API directly: `curl https://pwa4-seven.vercel.app/api/airbears`

## ✅ Once Fixed

Your production app will have:

1. **Complete Shopping Experience**
   - 12 eco-friendly products
   - Beautiful product images
   - Cart management
   - Multiple payment options

2. **Rich Map Experience**
   - 10 AirBears spread across campus
   - Real-time availability
   - Battery levels
   - Charging status

3. **Full User Workflows**
   - Sign up → Browse → Book → Ride → Shop → Pay
   - Driver: Accept → Navigate → Complete → Earn

4. **Production-Ready Payments**
   - Stripe integration
   - Apple Pay (iOS devices)
   - Google Pay (Android/Chrome)
   - Cash QR codes

## 🎉 Expected Result

After running the migration:

```bash
$ curl https://pwa4-seven.vercel.app/api/bodega/items | jq length
12

$ curl https://pwa4-seven.vercel.app/api/airbears | jq length
10

$ curl https://pwa4-seven.vercel.app/api/health
{
  "status": "ok",
  "supabaseUrl": "configured",
  "stripeSecretKey": "configured"
}
```

Now your app is **fully functional** and ready to demo! 🚀
