import { Router } from 'express';
import { supabaseAdmin } from '../supabaseClient';

const router = Router();

router.get('/inventory', async (_req, res) => {
  const { data, error } = await supabaseAdmin.from('inventory').select('*').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/inventory/adjust', async (req, res) => {
  const { productId, delta, reason } = req.body;
  if (!productId || !delta) return res.status(400).json({ error: 'productId and delta required' });

  const { error } = await supabaseAdmin.from('inventory_events').insert({
    product_id: productId,
    delta,
    reason
  });

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ ok: true });
});

export default router;
