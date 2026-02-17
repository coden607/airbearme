/**
 * Optimized storage layer with caching and performance improvements
 */

import type { User, InsertUser, Ride, InsertRide, Order, InsertOrder, Airbear, InsertAirbear, Spot, InsertSpot, BodegaItem, InsertBodegaItem, Payment, InsertPayment } from "../shared/schema.js";
import { createCache, createBatchProcessor, memoize, retryAsync, createGenericCache } from "../shared/utils.js";

// Cache configuration
const CACHE_TTL = {
  USERS: 10 * 60 * 1000, // 10 minutes
  RIDES: 5 * 60 * 1000,  // 5 minutes
  SPOTS: 30 * 60 * 1000, // 30 minutes
  AIRBEARS: 2 * 60 * 1000, // 2 minutes
  ORDERS: 5 * 60 * 1000, // 5 minutes
  BODEGA_ITEMS: 15 * 60 * 1000, // 15 minutes
} as const;

// Create caches
const userCache = createCache<User>(CACHE_TTL.USERS);
const rideCache = createGenericCache<Ride>(CACHE_TTL.RIDES);
const spotCache = createGenericCache<Spot[]>(CACHE_TTL.SPOTS);
const airbearCache = createGenericCache<Airbear[]>(CACHE_TTL.AIRBEARS);
const orderCache = createGenericCache<Order[]>(CACHE_TTL.ORDERS);
const bodegaItemCache = createGenericCache<BodegaItem[]>(CACHE_TTL.BODEGA_ITEMS);

// Memoized expensive operations
const memoizedCalculateDistance = memoize(
  (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  },
  (lat1, lon1, lat2, lon2) => `${lat1},${lon1},${lat2},${lon2}`
);

// Optimized storage interface
export interface OptimizedStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;
  getAllUsers(): Promise<User[]>;
  
  // Ride operations
  getRide(id: string): Promise<Ride | undefined>;
  createRide(ride: InsertRide): Promise<Ride>;
  updateRide(id: string, updates: Partial<Ride>): Promise<Ride>;
  getRidesByUser(userId: string): Promise<Ride[]>;
  getRidesByDriver(driverId: string): Promise<Ride[]>;
  getPendingRides(): Promise<Ride[]>;
  getRidesByDate(date: string): Promise<Ride[]>;
  
  // Spot operations
  getAllSpots(): Promise<Spot[]>;
  getSpot(id: string): Promise<Spot | undefined>;
  createSpot(spot: InsertSpot): Promise<Spot>;
  
  // Airbear operations
  getAllAirbears(): Promise<Airbear[]>;
  getAirbear(id: string): Promise<Airbear | undefined>;
  getAvailableAirbears(): Promise<Airbear[]>;
  updateAirbear(id: string, updates: Partial<Airbear>): Promise<Airbear>;
  
  // Order operations
  getOrder(id: string): Promise<Order | undefined>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrder(id: string, updates: Partial<Order>): Promise<Order>;
  getOrdersByUser(userId: string): Promise<Order[]>;
  
  // Bodega operations
  getAllBodegaItems(): Promise<BodegaItem[]>;
  getBodegaItemsByCategory(category: string): Promise<BodegaItem[]>;
  createBodegaItem(item: InsertBodegaItem): Promise<BodegaItem>;
  updateBodegaItem(id: string, updates: Partial<BodegaItem>): Promise<BodegaItem>;
  
  // Payment operations
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPaymentsByUser(userId: string): Promise<Payment[]>;
  
  // Analytics operations
  getAnalytics(): Promise<any>;
  
  // Cache management
  clearCache(pattern?: string): void;
  getCacheStats(): Record<string, number>;
}

// Optimized MemStorage implementation
export class OptimizedMemStorage implements OptimizedStorage {
  private users = new Map<string, User>();
  private rides = new Map<string, Ride>();
  private spots = new Map<string, Spot>();
  private airbears = new Map<string, Airbear>();
  private orders = new Map<string, Order>();
  private bodegaItems = new Map<string, BodegaItem>();
  private payments = new Map<string, Payment>();

  // User operations with caching
  async getUser(id: string): Promise<User | undefined> {
    // Check cache first
    const cached = userCache.get(id);
    if (cached) return cached;

    const user = this.users.get(id);
    if (user) {
      userCache.set(id, user);
    }
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    // Create cache key for email lookup
    const cacheKey = `email:${email}`;
    const cached = userCache.get(cacheKey);
    if (cached) return cached;

    for (const user of this.users.values()) {
      if (user.email === email) {
        userCache.set(cacheKey, user);
        userCache.set(user.id, user);
        return user;
      }
    }
    return undefined;
  }

  async createUser(user: InsertUser): Promise<User> {
    const newUser: User = {
      ...user,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      fullName: user.fullName ?? null,
      avatarUrl: user.avatarUrl ?? null,
      ecoPoints: user.ecoPoints ?? 0,
      totalRides: user.totalRides ?? 0,
      co2Saved: user.co2Saved ?? "0",
      hasCeoTshirt: user.hasCeoTshirt ?? false,
      stripeCustomerId: user.stripeCustomerId ?? null,
      stripeSubscriptionId: user.stripeSubscriptionId ?? null,
      tshirtPurchaseDate: user.tshirtPurchaseDate ?? null
    };
    
    this.users.set(newUser.id, newUser);
    
    // Update cache
    userCache.set(newUser.id, newUser);
    userCache.set(`email:${newUser.email}`, newUser);
    
    return newUser;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const existing = this.users.get(id);
    if (!existing) throw new Error('User not found');
    
    const updated: User = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    
    this.users.set(id, updated);
    
    // Update cache
    userCache.set(id, updated);
    if (updated.email) {
      userCache.set(`email:${updated.email}`, updated);
    }
    
    return updated;
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  // Ride operations with caching
  async getRide(id: string): Promise<Ride | undefined> {
    const cached = rideCache.get(id);
    if (cached) return cached;

    const ride = this.rides.get(id);
    if (ride) {
      rideCache.set(id, ride);
    }
    return ride;
  }

  async createRide(ride: InsertRide): Promise<Ride> {
    const newRide: Ride = {
      ...ride,
      id: crypto.randomUUID(),
      requestedAt: new Date(),
      acceptedAt: ride.acceptedAt ?? null,
      startedAt: ride.startedAt ?? null,
      completedAt: ride.completedAt ?? null,
      co2Saved: ride.co2Saved ?? null,
      driverId: ride.driverId ?? null,
      airbearId: ride.airbearId ?? null,
      status: ride.status ?? 'pending',
      passengers: ride.passengers ?? 1,
      estimatedDuration: ride.estimatedDuration ?? null,
      actualDuration: ride.actualDuration ?? null,
      distance: ride.distance ?? null,
      isFreeTshirtRide: ride.isFreeTshirtRide ?? false,
    };
    
    this.rides.set(newRide.id, newRide);
    
    // Update cache
    rideCache.set(newRide.id, newRide);
    
    // Invalidate related caches
    this.invalidateUserRidesCache(newRide.userId);
    if (newRide.driverId) {
      this.invalidateDriverRidesCache(newRide.driverId);
    }
    
    return newRide;
  }

  async updateRide(id: string, updates: Partial<Ride>): Promise<Ride> {
    const existing = this.rides.get(id);
    if (!existing) throw new Error('Ride not found');
    
    const updated: Ride = {
      ...existing,
      ...updates,
    };
    
    this.rides.set(id, updated);
    
    // Update cache
    rideCache.set(id, updated);
    
    // Invalidate related caches
    this.invalidateUserRidesCache(updated.userId);
    if (updated.driverId) {
      this.invalidateDriverRidesCache(updated.driverId);
    }
    
    return updated;
  }

  async getRidesByUser(userId: string): Promise<Ride[]> {
    const cacheKey = `user_rides:${userId}`;
    const cached = rideCache.get(cacheKey);
    if (cached) return cached;

    const rides = Array.from(this.rides.values()).filter(r => r.userId === userId);
    rideCache.set(cacheKey, rides);
    return rides;
  }

  async getRidesByDriver(driverId: string): Promise<Ride[]> {
    const cacheKey = `driver_rides:${driverId}`;
    const cached = rideCache.get(cacheKey);
    if (cached) return cached;

    const rides = Array.from(this.rides.values()).filter(r => r.driverId === driverId);
    rideCache.set(cacheKey, rides);
    return rides;
  }

  async getPendingRides(): Promise<Ride[]> {
    const cacheKey = 'pending_rides';
    const cached = rideCache.get(cacheKey);
    if (cached) return cached;

    const rides = Array.from(this.rides.values()).filter(r => r.status === 'pending');
    rideCache.set(cacheKey, rides);
    return rides;
  }

  async getRidesByDate(date: string): Promise<Ride[]> {
    const cacheKey = `rides_date:${date}`;
    const cached = rideCache.get(cacheKey);
    if (cached) return cached;

    const targetDate = new Date(date);
    const rides = Array.from(this.rides.values()).filter(r => {
      const rideDate = new Date(r.requestedAt);
      return rideDate.toDateString() === targetDate.toDateString();
    });
    rideCache.set(cacheKey, rides);
    return rides;
  }

  // Spot operations with caching
  async getAllSpots(): Promise<Spot[]> {
    const cached = spotCache.get('all');
    if (cached) return cached;

    const spots = Array.from(this.spots.values());
    spotCache.set('all', spots);
    return spots;
  }

  async getSpot(id: string): Promise<Spot | undefined> {
    return this.spots.get(id);
  }

  async createSpot(spot: InsertSpot): Promise<Spot> {
    const newSpot: Spot = {
      ...spot,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      isActive: spot.isActive ?? true,
    };
    
    this.spots.set(newSpot.id, newSpot);
    
    // Invalidate spots cache
    spotCache.clear();
    
    return newSpot;
  }

  // Airbear operations with caching
  async getAllAirbears(): Promise<Airbear[]> {
    const cached = airbearCache.get('all');
    if (cached) return cached;

    const airbears = Array.from(this.airbears.values());
    airbearCache.set('all', airbears);
    return airbears;
  }

  async getAirbear(id: string): Promise<Airbear | undefined> {
    return this.airbears.get(id);
  }

  async getAvailableAirbears(): Promise<Airbear[]> {
    const cacheKey = 'available_airbears';
    const cached = airbearCache.get(cacheKey);
    if (cached) return cached as Airbear[];

    const airbears = Array.from(this.airbears.values()).filter(ab => 
      ab.isAvailable && !ab.isCharging && ab.batteryLevel > 20
    );
    airbearCache.set(cacheKey, airbears);
    return airbears;
  }

  async updateAirbear(id: string, updates: Partial<Airbear>): Promise<Airbear> {
    const existing = this.airbears.get(id);
    if (!existing) throw new Error('Airbear not found');
    
    const updated: Airbear = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    
    this.airbears.set(id, updated);
    
    // Invalidate airbear caches
    airbearCache.clear();
    
    return updated;
  }

  // Order operations with caching
  async getOrder(id: string): Promise<Order | undefined> {
    return this.orders.get(id);
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const newOrder: Order = {
      ...order,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      status: order.status ?? 'pending',
      notes: order.notes ?? null,
      airbearId: order.airbearId ?? null,
      rideId: order.rideId ?? null,
    };
    
    this.orders.set(newOrder.id, newOrder);
    
    // Invalidate order caches
    this.invalidateUserOrdersCache(newOrder.userId);
    
    return newOrder;
  }

  async updateOrder(id: string, updates: Partial<Order>): Promise<Order> {
    const existing = this.orders.get(id);
    if (!existing) throw new Error('Order not found');
    
    const updated: Order = {
      ...existing,
      ...updates,
    };
    
    this.orders.set(id, updated);
    
    // Invalidate order caches
    this.invalidateUserOrdersCache(updated.userId);
    
    return updated;
  }

  async getOrdersByUser(userId: string): Promise<Order[]> {
    const cacheKey = `user_orders:${userId}`;
    const cached = orderCache.get(cacheKey);
    if (cached) return cached as Order[];

    const orders = Array.from(this.orders.values()).filter(o => o.userId === userId);
    orderCache.set(cacheKey, orders);
    return orders;
  }

  // Bodega operations with caching
  async getAllBodegaItems(): Promise<BodegaItem[]> {
    const cached = bodegaItemCache.get('all');
    if (cached) return cached;

    const items = Array.from(this.bodegaItems.values());
    bodegaItemCache.set('all', items);
    return items;
  }

  async getBodegaItemsByCategory(category: string): Promise<BodegaItem[]> {
    const cacheKey = `bodega_category:${category}`;
    const cached = bodegaItemCache.get(cacheKey);
    if (cached) return cached as BodegaItem[];

    const items = Array.from(this.bodegaItems.values()).filter(item => item.category === category);
    bodegaItemCache.set(cacheKey, items);
    return items;
  }

  async createBodegaItem(item: InsertBodegaItem): Promise<BodegaItem> {
    const newItem: BodegaItem = {
      ...item,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      isAvailable: item.isAvailable ?? true,
      description: item.description ?? null,
      imageUrl: item.imageUrl ?? null,
      isEcoFriendly: item.isEcoFriendly ?? false,
      stock: item.stock ?? 10,
    };
    
    this.bodegaItems.set(newItem.id, newItem);
    
    // Invalidate bodega caches
    bodegaItemCache.clear();
    
    return newItem;
  }

  async updateBodegaItem(id: string, updates: Partial<BodegaItem>): Promise<BodegaItem> {
    const existing = this.bodegaItems.get(id);
    if (!existing) throw new Error('Bodega item not found');
    
    const updated: BodegaItem = {
      ...existing,
      ...updates,
    };
    
    this.bodegaItems.set(id, updated);
    
    // Invalidate bodega caches
    bodegaItemCache.clear();
    
    return updated;
  }

  // Payment operations
  async createPayment(payment: InsertPayment): Promise<Payment> {
    const newPayment: Payment = {
      ...payment,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      status: payment.status ?? 'pending',
      metadata: payment.metadata ?? null,
      rideId: payment.rideId ?? null,
      orderId: payment.orderId ?? null,
      stripePaymentIntentId: payment.stripePaymentIntentId ?? null,
      currency: payment.currency ?? 'usd',
    };
    
    this.payments.set(newPayment.id, newPayment);
    return newPayment;
  }

  async getPaymentsByUser(userId: string): Promise<Payment[]> {
    return Array.from(this.payments.values()).filter(p => p.userId === userId);
  }

  // Analytics with caching
  async getAnalytics(): Promise<any> {
    const cacheKey = 'analytics';
    const cached = userCache.get(cacheKey) as any;
    if (cached) return cached;

    const users = this.users.size;
    const rides = this.rides.size;
    const orders = this.orders.size;
    const airbears = this.airbears.size;
    
    const activeAirbears = Array.from(this.airbears.values()).filter(ab => 
      ab.isAvailable && !ab.isCharging
    ).length;
    
    const completedRides = Array.from(this.rides.values()).filter(r => 
      r.status === 'completed'
    ).length;
    
    const analytics = {
      users,
      rides,
      orders,
      airbears,
      activeAirbears,
      completedRides,
      completionRate: rides > 0 ? (completedRides / rides * 100).toFixed(2) : '0',
    };
    
    userCache.set(cacheKey, analytics as any);
    return analytics;
  }

  // Cache management
  clearCache(pattern?: string): void {
    if (!pattern) {
      userCache.clear();
      rideCache.clear();
      spotCache.clear();
      airbearCache.clear();
      orderCache.clear();
      bodegaItemCache.clear();
      return;
    }

    // Clear caches matching pattern
    if (pattern.includes('user')) {
      userCache.clear();
    }
    if (pattern.includes('ride')) {
      rideCache.clear();
    }
    if (pattern.includes('spot')) {
      spotCache.clear();
    }
    if (pattern.includes('airbear')) {
      airbearCache.clear();
    }
    if (pattern.includes('order')) {
      orderCache.clear();
    }
    if (pattern.includes('bodega')) {
      bodegaItemCache.clear();
    }
  }

  getCacheStats(): Record<string, number> {
    return {
      users: userCache.size(),
      rides: rideCache.size(),
      spots: spotCache.size(),
      airbears: airbearCache.size(),
      orders: orderCache.size(),
      bodegaItems: bodegaItemCache.size(),
    };
  }

  // Private helper methods
  private invalidateUserRidesCache(userId: string): void {
    rideCache.clear(); // Simple invalidation for now
  }

  private invalidateDriverRidesCache(driverId: string): void {
    rideCache.clear(); // Simple invalidation for now
  }

  private invalidateUserOrdersCache(userId: string): void {
    orderCache.clear(); // Simple invalidation for now
  }
}

// Create singleton instance
export const optimizedStorage = new OptimizedMemStorage();

// Batch processors for bulk operations
export const batchProcessors = {
  users: createBatchProcessor(
    async (users: InsertUser[]) => {
      return Promise.all(users.map(user => optimizedStorage.createUser(user)));
    },
    50
  ),
  rides: createBatchProcessor(
    async (rides: InsertRide[]) => {
      return Promise.all(rides.map(ride => optimizedStorage.createRide(ride)));
    },
    25
  ),
  orders: createBatchProcessor(
    async (orders: InsertOrder[]) => {
      return Promise.all(orders.map(order => optimizedStorage.createOrder(order)));
    },
    30
  ),
};

// Export the optimized storage as default
export default optimizedStorage;
