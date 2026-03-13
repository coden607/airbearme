import React from 'react';
import { useQuery } from '@tanstack/react-query';

type InventoryItem = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  stock_level: number;
  image_url: string | null;
};

async function fetchInventory(): Promise<InventoryItem[]> {
  const res = await fetch('/api/inventory');
  if (!res.ok) throw new Error('Failed to fetch inventory');
  return res.json();
}

export const InventoryPage: React.FC = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['inventory'],
    queryFn: fetchInventory
  });

  if (isLoading) return <div>Loading inventory...</div>;
  if (error) return <div>Error loading inventory.</div>;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">Inventory</h1>
      <div className="grid gap-4 md:grid-cols-3">
        {data?.map(item => (
          <div key={item.id} className="border rounded-lg p-3 flex flex-col gap-2">
            <div className="font-semibold">{item.name}</div>
            {item.image_url && (
              <img src={item.image_url} alt={item.name} className="h-32 w-full object-cover rounded" />
            )}
            <div className="text-sm text-gray-500">{item.description}</div>
            <div className="flex justify-between items-center mt-auto">
              <span className="font-bold">
                {(item.price_cents / 100).toFixed(2)} {item.currency.toUpperCase()}
              </span>
              <span className={item.stock_level > 0 ? 'text-green-600' : 'text-red-600'}>
                {item.stock_level > 0 ? `${item.stock_level} in stock` : 'Out of stock'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
