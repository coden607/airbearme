import { Router } from 'express';
import { supabaseAdmin } from '../supabaseClient';

const router = Router();

// list orders for a user (user id should come from auth middleware in real app)
router.get('/orders/:userId', async (req, res) => {
  const { userId } = req.params;
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('*, order_items(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

export default router;
