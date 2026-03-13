import express from 'express';

const router = express.Router();

// Mock data
const mockData = {
  products: [
    { id: 1, name: 'Sample Product 1', price: 99.99 },
    { id: 2, name: 'Sample Product 2', price: 149.99 },
  ],
  features: [
    { id: 1, title: 'Fast', description: 'Lightning fast performance' },
    { id: 2, title: 'Secure', description: 'Bank-grade security' },
  ]
};

// Mock API endpoints
router.get('/api/products', (req, res) => {
  res.json(mockData.products);
});

router.get('/api/features', (req, res) => {
  res.json(mockData.features);
});

export default router;
