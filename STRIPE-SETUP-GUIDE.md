# Stripe Payment Setup Guide

This guide will help you configure Stripe payments for the AirBear PWA application.

## 🔧 Environment Configuration

### 1. Set up Stripe Environment Variables

Add the following to your `.env` file (or `.env.production` for production):

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_...your_live_secret_key...
STRIPE_WEBHOOK_SECRET=whsec_...your_webhook_secret...
VITE_STRIPE_PUBLIC_KEY=pk_live_...your_live_public_key...

# For testing/development:
# STRIPE_SECRET_KEY=sk_test_...your_test_secret_key...
# VITE_STRIPE_PUBLIC_KEY=pk_test_...your_test_public_key...
```

### 2. Get Your Stripe Keys

1. Log in to your [Stripe Dashboard](https://dashboard.stripe.com/)
2. Go to **Developers** → **API keys**
3. Copy the **Publishable key** (starts with `pk_`) → `VITE_STRIPE_PUBLIC_KEY`
4. Copy the **Secret key** (starts with `sk_`) → `STRIPE_SECRET_KEY`

## 🎣 Webhook Configuration

### 1. Create Webhook Endpoint

1. In Stripe Dashboard, go to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. Set endpoint URL: `https://your-domain.com/api/webhooks/stripe`
4. Select events to listen to:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payment_intent.canceled`

### 2. Get Webhook Secret

After creating the webhook, Stripe will show you a **Signing secret**. Copy this value to:
- `STRIPE_WEBHOOK_SECRET`

### 3. Webhook Events Handled

The application handles these webhook events:

- **`payment_intent.succeeded`**: Updates order/ride status, creates payment record
- **`payment_intent.payment_failed`**: Records failed payment
- **`payment_intent.canceled`**: Logs cancellation

## 🔐 Authentication & Permissions

### Payment Flow Authentication

The payment system uses multiple authentication methods:

1. **Session-based auth** (local development)
2. **Supabase JWT** (production/Vercel)
3. **Demo fallback** (development testing)

### Required Permissions

Ensure your Stripe account has:
- **Payments** enabled
- **Webhooks** enabled
- **Connected accounts** (if using marketplace features)

## 🚀 Deployment Checklist

### For Production:

1. ✅ Use live Stripe keys (`pk_live_`, `sk_live_`)
2. ✅ Set webhook endpoint to production URL
3. ✅ Configure webhook signing secret
4. ✅ Enable HTTPS (required for Stripe)
5. ✅ Test payment flow with real cards

### For Development:

1. ✅ Use test Stripe keys (`pk_test_`, `sk_test_`)
2. ✅ Use Stripe test cards for testing
3. ✅ Webhook can use ngrok for local testing

## 🧪 Testing

### Test Cards for Development

Use these Stripe test cards:

- **Success**: `4242 4242 4242 4242`
- **Declined**: `4000 0000 0000 0002`
- **Insufficient Funds**: `4000 0000 0000 9995`

### Test Webhooks Locally

Use ngrok to expose your local server:

```bash
ngrok http 5000
```

Then set your webhook URL to: `https://your-ngrok-url.ngrok.io/api/webhooks/stripe`

## 🔍 Troubleshooting

### Common Issues:

1. **"Authentication required" error**
   - Check user is logged in
   - Verify session/JWT token is valid
   - Check environment variables are set

2. **"Webhook signature verification failed"**
   - Verify webhook secret is correct
   - Check endpoint URL matches Stripe configuration
   - Ensure raw body parsing is enabled

3. **"Stripe not configured" error**
   - Check `STRIPE_SECRET_KEY` is set
   - Verify key format (should start with `sk_`)

4. **Payment intent creation fails**
   - Check user authentication
   - Verify amount is positive
   - Check order/ride ownership

### Debug Mode

Enable debug logging by setting:
```bash
NODE_ENV=development
```

This will show detailed payment logs in the console.

## 📋 Environment Variables Summary

```bash
# Required for payments
STRIPE_SECRET_KEY=sk_...              # Server-side
VITE_STRIPE_PUBLIC_KEY=pk_...         # Client-side
STRIPE_WEBHOOK_SECRET=whsec_...       # Webhook verification

# Optional for development
NODE_ENV=development                   # Enable debug logs
```

## 🔗 Useful Links

- [Stripe Dashboard](https://dashboard.stripe.com/)
- [Stripe Test Cards](https://stripe.com/docs/testing)
- [Stripe Webhooks Documentation](https://stripe.com/docs/webhooks)
- [Stripe API Reference](https://stripe.com/docs/api)

## 🚨 Security Notes

1. **Never expose secret keys** in client code
2. **Always use HTTPS** in production
3. **Verify webhook signatures** to prevent fraud
4. **Monitor webhook delivery** for failed events
5. **Keep Stripe keys updated** and rotate regularly

## 💡 Tips

- Use test mode during development
- Set up Stripe Radar for fraud detection
- Monitor payment failures in Stripe Dashboard
- Test webhook endpoints with Stripe CLI
- Keep webhook logs for debugging

---

**Need help?** Check the Stripe documentation or contact support for assistance with payment integration.
