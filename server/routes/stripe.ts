import { Router } from 'express';
import Stripe from 'stripe';
import { supabaseAdmin } from '../supabaseClient';

const router = Router();

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

router.post('/payments/create-checkout-session', async (req, res) => {
  const { lineItems, successUrl, cancelUrl, userId } = req.body;

  if (!Array.isArray(lineItems) || !successUrl || !cancelUrl || !userId) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { userId }
  });

  res.json({ id: session.id, url: session.url });
});

// NOTE: wire this route as raw body in your main server (express.raw)
// and verify the signature before trusting event.
router.post('/payments/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).send('Missing signature');

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig.toString(), STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error('Webhook signature verification failed', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const total = session.amount_total ?? 0;

    if (userId && session.id) {
      await supabaseAdmin
        .from('orders')
        .update({ status: 'paid', total_cents: total, stripe_session_id: session.id })
        .eq('stripe_session_id', session.id);
    }
  }

  res.json({ received: true });
});

export default router;
