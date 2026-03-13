import React from 'react';
import { useCartStore } from '../cart/CartStore';

type Props = {
  successUrl: string;
  cancelUrl: string;
  userId: string;
};

export const CheckoutButton: React.FC<Props> = ({ successUrl, cancelUrl, userId }) => {
  const items = useCartStore((s) => s.items);

  const handleCheckout = async () => {
    if (!items.length) return;

    const lineItems = items.map((i) => ({
      price_data: {
        currency: 'usd',
        product_data: { name: i.name },
        unit_amount: i.price_cents
      },
      quantity: i.quantity
    }));

    const res = await fetch('/api/payments/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineItems, successUrl, cancelUrl, userId })
    });

    if (!res.ok) {
      console.error('Failed to create session');
      return;
    }

    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    }
  };

  return (
    <button
      className="px-4 py-2 rounded bg-black text-white disabled:bg-gray-400"
      disabled={!items.length}
      onClick={handleCheckout}
    >
      Checkout
    </button>
  );
};
