import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "./utils.js";
import {
  User, InsertUser,
  Spot, InsertSpot,
  Airbear, InsertAirbear,
  Ride, InsertRide,
  BodegaItem, InsertBodegaItem,
  Order, InsertOrder,
  Payment, InsertPayment,
} from "../shared/schema.js";

const stripUndefined = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;

const isMissingColumnError = (error: unknown): boolean => {
  const err = error as { code?: string; message?: string } | undefined;
  const message = String(err?.message ?? "");
  return err?.code === "PGRST204" || message.includes("Could not find the") || message.includes("column");
};

/**
 * Multi-case field getter - handles camelCase, snake_case, and lowercase (PostgreSQL)
 * PostgreSQL lowercases unquoted identifiers, so we need to check all three formats.
 *
 * @example
 * getField(row, 'userId', 'user_id', 'userid') // Returns first non-nullish value
 */
function getField<T>(row: Record<string, unknown>, ...keys: string[]): T | undefined {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      return row[key] as T;
    }
  }
  return undefined;
}

// User normalization - handles camelCase and snake_case
const normalizeUserRow = (row: Record<string, unknown>): User => ({
  id: row.id as string,
  email: row.email as string,
  username: row.username as string,
  fullName: getField<string>(row, 'fullName', 'full_name') ?? null,
  avatarUrl: getField<string>(row, 'avatarUrl', 'avatar_url') ?? null,
  role: (row.role as User['role']) ?? 'user',
  stripeCustomerId: getField<string>(row, 'stripeCustomerId', 'stripe_customer_id') ?? null,
  stripeSubscriptionId: getField<string>(row, 'stripeSubscriptionId', 'stripe_subscription_id') ?? null,
  ecoPoints: getField<number>(row, 'ecoPoints', 'eco_points') ?? 0,
  totalRides: getField<number>(row, 'totalRides', 'total_rides') ?? 0,
  co2Saved: getField<string>(row, 'co2Saved', 'co2_saved') ?? '0',
  hasCeoTshirt: getField<boolean>(row, 'hasCeoTshirt', 'has_ceo_tshirt') ?? false,
  tshirtPurchaseDate: getField<Date>(row, 'tshirtPurchaseDate', 'tshirt_purchase_date') ?? null,
  createdAt: getField<Date>(row, 'createdAt', 'created_at') ?? new Date(),
  updatedAt: getField<Date>(row, 'updatedAt', 'updated_at') ?? new Date(),
});

const toSnakeUserPayload = (user: Partial<InsertUser>) =>
  stripUndefined({
    id: user.id,
    email: user.email,
    username: user.username,
    full_name: user.fullName,
    avatar_url: user.avatarUrl,
    role: user.role,
    stripe_customer_id: user.stripeCustomerId,
    stripe_subscription_id: user.stripeSubscriptionId,
    eco_points: user.ecoPoints,
    total_rides: user.totalRides,
    co2_saved: user.co2Saved,
    has_ceo_tshirt: user.hasCeoTshirt,
    tshirt_purchase_date: user.tshirtPurchaseDate,
  });

// Ride normalization - handles camelCase, snake_case, and lowercase (PostgreSQL)
const normalizeRideRow = (row: Record<string, unknown>): Ride => ({
  id: row.id as string,
  userId: getField<string>(row, 'userId', 'user_id', 'userid') ?? '',
  driverId: getField<string>(row, 'driverId', 'driver_id', 'driverid') ?? null,
  airbearId: getField<string>(row, 'airbearId', 'airbear_id', 'airbearid') ?? null,
  pickupSpotId: getField<string>(row, 'pickupSpotId', 'pickup_spot_id', 'pickupspotid') ?? '',
  dropoffSpotId: getField<string>(row, 'dropoffSpotId', 'dropoff_spot_id', 'dropoffspotid') ?? '',
  status: (row.status as Ride['status']) ?? 'pending',
  fare: (row.fare as string) ?? '0',
  distance: (row.distance as string) ?? null,
  estimatedDuration: getField<number>(row, 'estimatedDuration', 'estimated_duration', 'estimatedduration') ?? null,
  actualDuration: getField<number>(row, 'actualDuration', 'actual_duration', 'actualduration') ?? null,
  co2Saved: getField<string>(row, 'co2Saved', 'co2_saved', 'co2saved') ?? null,
  isFreeTshirtRide: getField<boolean>(row, 'isFreeTshirtRide', 'is_free_tshirt_ride', 'isfreetshirtride') ?? false,
  requestedAt: getField<Date>(row, 'requestedAt', 'requested_at', 'requestedat') ?? new Date(),
  acceptedAt: getField<Date>(row, 'acceptedAt', 'accepted_at', 'acceptedat') ?? null,
  startedAt: getField<Date>(row, 'startedAt', 'started_at', 'startedat') ?? null,
  completedAt: getField<Date>(row, 'completedAt', 'completed_at', 'completedat') ?? null,
});

// PostgreSQL lowercases unquoted identifiers, so we need lowercase versions
// Using Partial<Ride> to include both insert fields and auto-generated fields
const toSnakeRidePayload = (ride: Partial<Ride>) =>
  stripUndefined({
    id: ride.id,
    userid: ride.userId,
    driverid: ride.driverId,
    airbearid: ride.airbearId,
    pickupspotid: ride.pickupSpotId,
    dropoffspotid: ride.dropoffSpotId,
    estimatedduration: ride.estimatedDuration,
    actualduration: ride.actualDuration,
    co2saved: ride.co2Saved,
    isfreetshirtride: ride.isFreeTshirtRide,
    requestedat: ride.requestedAt,
    acceptedat: ride.acceptedAt,
    startedat: ride.startedAt,
    completedat: ride.completedAt,
    status: ride.status,
    fare: ride.fare,
    distance: ride.distance,
  });

interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;
  getRidesByUserAndDate(userId: string, date: string): Promise<Ride[]>;

  // Password management (for local auth)
  verifyPassword?(email: string, password: string): Promise<User | null>;
  setPassword?(userId: string, password: string): Promise<void>;

  // Spots
  getAllSpots(): Promise<Spot[]>;
  createSpot(spot: InsertSpot): Promise<Spot>;
  getSpotById(id: string): Promise<Spot | undefined>;

  // Airbears
  getAllAirbears(): Promise<Airbear[]>;
  getAvailableAirbears(): Promise<Airbear[]>;
  getAirbearsByDriver(driverId: string): Promise<Airbear[]>;
  createAirbear(airbear: InsertAirbear): Promise<Airbear>;
  updateAirbear(id: string, updates: Partial<Airbear>): Promise<Airbear>;

  // Rides
  getRidesByUser(userId: string): Promise<Ride[]>;
  getRidesByDriver(driverId: string): Promise<Ride[]>;
  getPendingRides(): Promise<Ride[]>;
  createRide(ride: InsertRide): Promise<Ride>;
  updateRide(id: string, updates: Partial<Ride>): Promise<Ride>;
  getRideById(id: string): Promise<Ride | undefined>;

  // Bodega Items
  getAllBodegaItems(): Promise<BodegaItem[]>;
  getBodegaItemsByCategory(category: string): Promise<BodegaItem[]>;
  createBodegaItem(item: InsertBodegaItem): Promise<BodegaItem>;
  updateBodegaItem(id: string, updates: Partial<BodegaItem>): Promise<BodegaItem>;

  // Orders
  getOrderById(id: string): Promise<Order | undefined>;
  getOrdersByUser(userId: string): Promise<Order[]>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrder(id: string, updates: Partial<Order>): Promise<Order>;

  // Payments
  getPaymentsByUser(userId: string): Promise<Payment[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePayment(id: string, updates: Partial<Payment>): Promise<Payment>;

  // Legacy API support
  getAllRickshaws(): Promise<any[]>;
  getAvailableRickshaws(): Promise<any[]>;
}

class MemStorage implements IStorage {
  private users = new Map<string, User>();
  private userPasswords = new Map<string, string>(); // Store hashed passwords
  private spots = new Map<string, Spot>();
  private airbears = new Map<string, Airbear>();
  private rides = new Map<string, Ride>();
  private bodegaItems = new Map<string, BodegaItem>();
  private orders = new Map<string, Order>();
  private payments = new Map<string, Payment>();

  // Simple password hashing for demo (in production, use bcrypt)
  private hashPassword(password: string): string {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      const char = password.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `hash_${Math.abs(hash).toString(16)}_${password.length}`;
  }

  async verifyPassword(email: string, password: string): Promise<User | null> {
    const user = await this.getUserByEmail(email);
    if (!user) return null;
    const storedHash = this.userPasswords.get(user.id);
    if (!storedHash) return null;
    const inputHash = this.hashPassword(password);
    return storedHash === inputHash ? user : null;
  }

  async setPassword(userId: string, password: string): Promise<void> {
    this.userPasswords.set(userId, this.hashPassword(password));
  }

  constructor() {
    // Pre-seed with Binghamton spots for development
    const spotsData: InsertSpot[] = [
      { name: 'Court Street Downtown', latitude: '42.099118', longitude: '-75.917538' },
      { name: 'Riverwalk BU Center', latitude: '42.098765', longitude: '-75.916543' },
      { name: 'Confluence Park', latitude: '42.090123', longitude: '-75.912345' },
      { name: 'Southside Walking Bridge', latitude: '42.091409', longitude: '-75.914568' },
      { name: 'General Hospital', latitude: '42.086741', longitude: '-75.915711' },
      { name: 'McArthur Park', latitude: '42.086165', longitude: '-75.926153' },
      { name: 'Greenway Path', latitude: '42.086678', longitude: '-75.932483' },
      { name: 'Vestal Center', latitude: '42.091851', longitude: '-75.951729' },
      { name: 'Innovation Park', latitude: '42.093877', longitude: '-75.958331' },
      { name: 'BU East Gym', latitude: '42.091695', longitude: '-75.963590' },
      { name: 'BU Fine Arts Building', latitude: '42.089282', longitude: '-75.967441' },
      { name: 'Whitney Hall', latitude: '42.088456', longitude: '-75.965432' },
      { name: 'Student Union', latitude: '42.086903', longitude: '-75.966704' },
      { name: 'Appalachian Dining', latitude: '42.084523', longitude: '-75.971264' },
      { name: 'Hinman Dining Hall', latitude: '42.086314', longitude: '-75.973292' },
      { name: 'BU Science Building', latitude: '42.090227', longitude: '-75.972315' },
      { name: 'Downtown Station', latitude: '42.101234', longitude: '-75.915678' },
    ];
    spotsData.forEach(spot => this.createSpot(spot));

    // Pre-seed bodega items with proper images
    const bodegaItems: InsertBodegaItem[] = [
      {
        name: 'Cold Brew Coffee',
        description: 'Smooth, cold-brewed coffee served over ice with a hint of vanilla',
        price: '4.50',
        imageUrl: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=400&h=400&fit=crop',
        category: 'beverages',
        isEcoFriendly: true,
        stock: 25
      },
      {
        name: 'Green Smoothie Bowl',
        description: 'Organic spinach, banana, almond milk, topped with granola and berries',
        price: '8.75',
        imageUrl: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=400&fit=crop',
        category: 'food',
        isEcoFriendly: true,
        stock: 15
      },
      {
        name: 'Avocado Toast',
        description: 'Sourdough bread with smashed avocado, cherry tomatoes, and microgreens',
        price: '7.25',
        imageUrl: 'https://images.unsplash.com/photo-1541519227354-08fa5d50c44d?w=400&h=400&fit=crop',
        category: 'food',
        isEcoFriendly: true,
        stock: 20
      },
      {
        name: 'Sparkling Water',
        description: 'Naturally carbonated spring water in recyclable glass bottles',
        price: '2.50',
        imageUrl: 'https://images.unsplash.com/photo-1559839914-17aae19cec71?w=400&h=400&fit=crop',
        category: 'beverages',
        isEcoFriendly: true,
        stock: 30
      },
      {
        name: 'Dark Chocolate Bar',
        description: '70% cocoa organic dark chocolate with sea salt',
        price: '3.75',
        imageUrl: 'https://images.unsplash.com/photo-1606312619070-d48b4c652a52?w=400&h=400&fit=crop',
        category: 'snacks',
        isEcoFriendly: true,
        stock: 40
      },
      {
        name: 'Trail Mix',
        description: 'Mixed nuts, dried cranberries, and dark chocolate chips',
        price: '5.25',
        imageUrl: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=400&fit=crop',
        category: 'snacks',
        isEcoFriendly: true,
        stock: 35
      },
      {
        name: 'Herbal Tea',
        description: 'Caffeine-free chamomile tea in compostable packaging',
        price: '3.25',
        imageUrl: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=400&h=400&fit=crop',
        category: 'beverages',
        isEcoFriendly: true,
        stock: 22
      },
      {
        name: 'Veggie Wrap',
        description: 'Whole wheat wrap with hummus, cucumber, bell peppers, and sprouts',
        price: '6.50',
        imageUrl: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&h=400&fit=crop',
        category: 'food',
        isEcoFriendly: true,
        stock: 18
      },
      {
        name: 'Protein Bar',
        description: 'Plant-based protein bar with almonds and dates',
        price: '4.00',
        imageUrl: 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400&h=400&fit=crop',
        category: 'snacks',
        isEcoFriendly: true,
        stock: 28
      },
      {
        name: 'Matcha Latte',
        description: 'Ceremonial grade matcha with oat milk and honey',
        price: '5.75',
        imageUrl: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=400&h=400&fit=crop',
        category: 'beverages',
        isEcoFriendly: true,
        stock: 16
      },
      {
        name: 'Reusable Water Bottle',
        description: 'Stainless steel insulated water bottle - perfect for eco-conscious riders',
        price: '24.99',
        imageUrl: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400&h=400&fit=crop',
        category: 'accessories',
        isEcoFriendly: true,
        stock: 12
      },
      {
        name: 'Bamboo Toothbrush',
        description: 'Biodegradable bamboo toothbrush with charcoal bristles',
        price: '4.99',
        imageUrl: 'https://images.unsplash.com/photo-1559599101-f09722fb4948?w=400&h=400&fit=crop',
        category: 'accessories',
        isEcoFriendly: true,
        stock: 25
      },
      // HIGH-DEMAND CONVENIENCE ITEMS
      {
        name: 'Phone Charger Cable',
        description: 'Universal USB-C & Lightning cable - charge any phone',
        price: '9.99',
        imageUrl: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=400&h=400&fit=crop',
        category: 'electronics',
        isEcoFriendly: false,
        stock: 50
      },
      {
        name: 'Portable Power Bank',
        description: '10,000mAh portable charger - full phone charge on the go',
        price: '19.99',
        imageUrl: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=400&h=400&fit=crop',
        category: 'electronics',
        isEcoFriendly: false,
        stock: 30
      },
      {
        name: 'Wireless Earbuds',
        description: 'Bluetooth earbuds with charging case - 4hr battery life',
        price: '24.99',
        imageUrl: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400&h=400&fit=crop',
        category: 'electronics',
        isEcoFriendly: false,
        stock: 20
      },
      {
        name: 'Pain Relief Pack',
        description: 'Ibuprofen 2-pack for headaches and minor pain',
        price: '2.99',
        imageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&h=400&fit=crop',
        category: 'health',
        isEcoFriendly: false,
        stock: 100
      },
      {
        name: 'Hand Sanitizer',
        description: '2oz travel-size sanitizer - 70% alcohol, aloe-infused',
        price: '2.49',
        imageUrl: 'https://images.unsplash.com/photo-1584483766114-2cea6facdf57?w=400&h=400&fit=crop',
        category: 'health',
        isEcoFriendly: true,
        stock: 75
      },
      {
        name: 'Pocket Tissues',
        description: 'Soft 3-ply tissues - 10 pack',
        price: '1.49',
        imageUrl: 'https://images.unsplash.com/photo-1584515933487-779824d29309?w=400&h=400&fit=crop',
        category: 'health',
        isEcoFriendly: true,
        stock: 80
      },
      {
        name: 'Fresh Mints',
        description: 'Sugar-free peppermint breath fresheners',
        price: '1.99',
        imageUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop',
        category: 'snacks',
        isEcoFriendly: true,
        stock: 60
      },
      {
        name: 'Energy Drink',
        description: 'Natural caffeine boost - zero sugar, tropical flavor',
        price: '3.99',
        imageUrl: 'https://images.unsplash.com/photo-1527960471264-932f39eb5846?w=400&h=400&fit=crop',
        category: 'beverages',
        isEcoFriendly: false,
        stock: 40
      },
      {
        name: 'Classic Chips',
        description: 'Kettle-cooked sea salt chips - single serve bag',
        price: '2.25',
        imageUrl: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=400&h=400&fit=crop',
        category: 'snacks',
        isEcoFriendly: false,
        stock: 55
      },
      {
        name: 'Sunglasses',
        description: 'UV400 protection polarized sunglasses - unisex style',
        price: '12.99',
        imageUrl: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=400&h=400&fit=crop',
        category: 'accessories',
        isEcoFriendly: false,
        stock: 25
      },
      {
        name: 'Lip Balm',
        description: 'Natural beeswax lip balm with SPF 15',
        price: '2.99',
        imageUrl: 'https://images.unsplash.com/photo-1585652757141-8837d676f3e4?w=400&h=400&fit=crop',
        category: 'health',
        isEcoFriendly: true,
        stock: 45
      },
      {
        name: 'Compact Umbrella',
        description: 'Pocket-size automatic umbrella - windproof design',
        price: '14.99',
        imageUrl: 'https://images.unsplash.com/photo-1534309466160-70b22cc6252c?w=400&h=400&fit=crop',
        category: 'accessories',
        isEcoFriendly: false,
        stock: 20
      },
      {
        name: 'Gummy Bears',
        description: 'Organic fruit gummy bears - no artificial colors',
        price: '2.75',
        imageUrl: 'https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?w=400&h=400&fit=crop',
        category: 'snacks',
        isEcoFriendly: true,
        stock: 50
      },
      {
        name: 'Bottled Water',
        description: 'Pure spring water - 16.9oz recyclable bottle',
        price: '1.50',
        imageUrl: 'https://images.unsplash.com/photo-1564419320461-6870880221ad?w=400&h=400&fit=crop',
        category: 'beverages',
        isEcoFriendly: true,
        stock: 100
      }
    ];
    bodegaItems.forEach(item => this.createBodegaItem(item));

    // Pre-seed airbears across Binghamton for rich demo experience
    const spotsList = Array.from(this.spots.values());
    const airbearConfigs = [
      { spotIndex: 0, battery: 92, available: true, charging: false },
      { spotIndex: 1, battery: 78, available: true, charging: false },
      { spotIndex: 2, battery: 65, available: true, charging: false },
      { spotIndex: 3, battery: 45, available: false, charging: true },
      { spotIndex: 5, battery: 88, available: true, charging: false },
      { spotIndex: 7, battery: 72, available: true, charging: false },
      { spotIndex: 9, battery: 35, available: false, charging: true },
      { spotIndex: 10, battery: 95, available: true, charging: false },
      { spotIndex: 12, battery: 82, available: true, charging: false },
      { spotIndex: 14, battery: 68, available: false, charging: false },
    ];

    airbearConfigs.forEach((config, idx) => {
      const spot = spotsList[config.spotIndex];
      if (spot) {
        this.createAirbear({
          driverId: null,
          currentSpotId: spot.id,
          latitude: String(Number(spot.latitude) + (Math.random() - 0.5) * 0.002),
          longitude: String(Number(spot.longitude) + (Math.random() - 0.5) * 0.002),
          batteryLevel: config.battery,
          isAvailable: config.available,
          isCharging: config.charging,
          maintenanceStatus: 'good'
        });
      }
    });
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(u => u.email === email);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const user: User = {
      ...insertUser,
      id: insertUser.id || (globalThis as any).crypto.randomUUID(),
      fullName: insertUser.fullName || null,
      avatarUrl: insertUser.avatarUrl || null,
      role: insertUser.role || "user",
      ecoPoints: insertUser.ecoPoints || 0,
      totalRides: insertUser.totalRides || 0,
      co2Saved: insertUser.co2Saved || "0",
      hasCeoTshirt: insertUser.hasCeoTshirt || false,
      stripeCustomerId: insertUser.stripeCustomerId ?? null,
      stripeSubscriptionId: insertUser.stripeSubscriptionId ?? null,
      tshirtPurchaseDate: insertUser.tshirtPurchaseDate || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.users.set(user.id, user);
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new Error("User not found");
    const updatedUser = { ...user, ...updates, updatedAt: new Date() };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async getRidesByUserAndDate(userId: string, date: string): Promise<Ride[]> {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(`${date}T23:59:59.999Z`);
    return Array.from(this.rides.values()).filter(r =>
      r.userId === userId &&
      r.requestedAt >= start &&
      r.requestedAt <= end
    );
  }

  // Spots
  async getAllSpots(): Promise<Spot[]> {
    return Array.from(this.spots.values());
  }

  async createSpot(insertSpot: InsertSpot): Promise<Spot> {
    const spot: Spot = {
      ...insertSpot,
      id: (globalThis as any).crypto.randomUUID(),
      isActive: insertSpot.isActive ?? true,
      createdAt: new Date()
    };
    this.spots.set(spot.id, spot);
    return spot;
  }

  async getSpotById(id: string): Promise<Spot | undefined> {
    return this.spots.get(id);
  }

  // Airbears
  async getAllAirbears(): Promise<Airbear[]> {
    return Array.from(this.airbears.values());
  }

  async getAvailableAirbears(): Promise<Airbear[]> {
    return Array.from(this.airbears.values()).filter(a => a.isAvailable);
  }

  async getAirbearsByDriver(driverId: string): Promise<Airbear[]> {
    return Array.from(this.airbears.values()).filter(a => a.driverId === driverId);
  }

  async createAirbear(insertAirbear: InsertAirbear): Promise<Airbear> {
    const airbear: Airbear = {
      ...insertAirbear,
      id: (globalThis as any).crypto.randomUUID(),
      driverId: insertAirbear.driverId || null,
      currentSpotId: insertAirbear.currentSpotId || null,
      latitude: insertAirbear.latitude ?? null,
      longitude: insertAirbear.longitude ?? null,
      heading: insertAirbear.heading ?? null,
      batteryLevel: insertAirbear.batteryLevel || 100,
      isAvailable: insertAirbear.isAvailable ?? true,
      isCharging: insertAirbear.isCharging || false,
      maintenanceStatus: insertAirbear.maintenanceStatus || "good",
      totalDistance: "0",
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.airbears.set(airbear.id, airbear);
    return airbear;
  }

  async updateAirbear(id: string, updates: Partial<Airbear>): Promise<Airbear> {
    const airbear = this.airbears.get(id);
    if (!airbear) throw new Error("Airbear not found");
    const updatedAirbear = { ...airbear, ...updates };
    this.airbears.set(id, updatedAirbear);
    return updatedAirbear;
  }

  // Legacy API support
  async getAllRickshaws(): Promise<any[]> {
    return this.getAllAirbears();
  }
  async getAvailableRickshaws(): Promise<any[]> {
    return this.getAvailableAirbears();
  }

  // Rides
  async getRidesByUser(userId: string): Promise<Ride[]> {
    return Array.from(this.rides.values()).filter(r => r.userId === userId);
  }

  async getRidesByDriver(driverId: string): Promise<Ride[]> {
    return Array.from(this.rides.values()).filter(r => r.driverId === driverId);
  }

  async getPendingRides(): Promise<Ride[]> {
    return Array.from(this.rides.values()).filter(r => r.status === 'pending');
  }

  async createRide(insertRide: InsertRide): Promise<Ride> {
    const ride: Ride = {
      ...insertRide,
      id: (globalThis as any).crypto.randomUUID(),
      driverId: insertRide.driverId || null,
      airbearId: insertRide.airbearId || null,
      status: insertRide.status || "pending",
      fare: insertRide.fare || "0",
      distance: insertRide.distance || null,
      estimatedDuration: insertRide.estimatedDuration || null,
      actualDuration: insertRide.actualDuration || null,
      co2Saved: insertRide.co2Saved || null,
      isFreeTshirtRide: insertRide.isFreeTshirtRide || false,
      requestedAt: new Date(),
      acceptedAt: null,
      startedAt: null,
      completedAt: null
    };
    this.rides.set(ride.id, ride);
    return ride;
  }

  async updateRide(id: string, updates: Partial<Ride>): Promise<Ride> {
    const ride = this.rides.get(id);
    if (!ride) throw new Error("Ride not found");
    const updatedRide = { ...ride, ...updates };
    this.rides.set(id, updatedRide);
    return updatedRide;
  }

  async getRideById(id: string): Promise<Ride | undefined> {
    return this.rides.get(id);
  }

  // Bodega Items
  async getAllBodegaItems(): Promise<BodegaItem[]> {
    return Array.from(this.bodegaItems.values());
  }

  async getBodegaItemsByCategory(category: string): Promise<BodegaItem[]> {
    return Array.from(this.bodegaItems.values()).filter(i => i.category === category);
  }

  async createBodegaItem(insertItem: InsertBodegaItem): Promise<BodegaItem> {
    const item: BodegaItem = {
      ...insertItem,
      id: (globalThis as any).crypto.randomUUID(),
      description: insertItem.description || null,
      imageUrl: insertItem.imageUrl || null,
      isEcoFriendly: insertItem.isEcoFriendly || false,
      isAvailable: insertItem.isAvailable ?? true,
      stock: insertItem.stock || 0,
      createdAt: new Date()
    };
    this.bodegaItems.set(item.id, item);
    return item;
  }

  async updateBodegaItem(id: string, updates: Partial<BodegaItem>): Promise<BodegaItem> {
    const item = this.bodegaItems.get(id);
    if (!item) throw new Error("Item not found");
    const updatedItem = { ...item, ...updates };
    this.bodegaItems.set(id, updatedItem);
    return updatedItem;
  }

  // Orders
  async getOrderById(id: string): Promise<Order | undefined> {
    return this.orders.get(id);
  }

  async getOrdersByUser(userId: string): Promise<Order[]> {
    return Array.from(this.orders.values()).filter(o => o.userId === userId);
  }

  async createOrder(insertOrder: InsertOrder): Promise<Order> {
    const order: Order = {
      ...insertOrder,
      id: (globalThis as any).crypto.randomUUID(),
      rideId: insertOrder.rideId || null,
      airbearId: insertOrder.airbearId || null,
      status: insertOrder.status || "pending",
      notes: insertOrder.notes || null,
      createdAt: new Date()
    };
    this.orders.set(order.id, order);
    return order;
  }

  async updateOrder(id: string, updates: Partial<Order>): Promise<Order> {
    const order = this.orders.get(id);
    if (!order) throw new Error("Order not found");
    const updatedOrder = { ...order, ...updates };
    this.orders.set(id, updatedOrder);
    return updatedOrder;
  }

  // Payments
  async getPaymentsByUser(userId: string): Promise<Payment[]> {
    return Array.from(this.payments.values()).filter(p => p.userId === userId);
  }

  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    const payment: Payment = {
      ...insertPayment,
      id: (globalThis as any).crypto.randomUUID(),
      orderId: insertPayment.orderId || null,
      rideId: insertPayment.rideId || null,
      stripePaymentIntentId: insertPayment.stripePaymentIntentId || null,
      currency: insertPayment.currency || "usd",
      status: insertPayment.status || "pending",
      metadata: insertPayment.metadata || null,
      createdAt: new Date()
    };
    this.payments.set(payment.id, payment);
    return payment;
  }

  async updatePayment(id: string, updates: Partial<Payment>): Promise<Payment> {
    const payment = this.payments.get(id);
    if (!payment) throw new Error("Payment not found");
    const updatedPayment = { ...payment, ...updates };
    this.payments.set(id, updatedPayment);
    return updatedPayment;
  }
}

class SupabaseStorage implements IStorage {
  constructor(private supabase: SupabaseClient) { }

  private assert<T>(data: T | null, error: any): T {
    if (error) {
      throw new Error(error.message || "Supabase query failed");
    }
    if (data === null) {
      throw new Error("Supabase returned no data");
    }
    return data;
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    const { data, error } = await this.supabase.from("users").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? normalizeUserRow(data) : undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const { data, error } = await this.supabase.from("users").select("*").eq("email", email).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? normalizeUserRow(data) : undefined;
  }

  async createUser(user: InsertUser): Promise<User> {
    const primaryPayload = stripUndefined(user);
    const fallbackPayload = toSnakeUserPayload(user);
    let data;
    let error;

    ({ data, error } = await this.supabase.from("users").insert(primaryPayload).select().single());
    if (error && isMissingColumnError(error)) {
      ({ data, error } = await this.supabase.from("users").insert(fallbackPayload).select().single());
    }

    return normalizeUserRow(this.assert(data as User, error));
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const primaryPayload = stripUndefined(updates);
    const fallbackPayload = toSnakeUserPayload(updates as Partial<InsertUser>);
    let data;
    let error;

    ({ data, error } = await this.supabase.from("users").update(primaryPayload).eq("id", id).select().single());
    if (error && isMissingColumnError(error)) {
      ({ data, error } = await this.supabase.from("users").update(fallbackPayload).eq("id", id).select().single());
    }

    return normalizeUserRow(this.assert(data as User, error));
  }

  async getRidesByUserAndDate(userId: string, date: string): Promise<Ride[]> {
    const start = new Date(`${date}T00:00:00.000Z`).toISOString();
    const end = new Date(`${date}T23:59:59.999Z`).toISOString();
    const { data, error } = await this.supabase
      .from("rides")
      .select("*")
      .eq("user_id", userId)
      .gte("requested_at", start)
      .lte("requested_at", end);
    return this.assert((data ?? []) as Ride[], error);
  }

  // Spots
  async getAllSpots(): Promise<Spot[]> {
    const { data, error } = await this.supabase.from("spots").select("*").eq("is_active", true).order("name");
    return this.assert((data ?? []) as Spot[], error);
  }

  async createSpot(spot: InsertSpot): Promise<Spot> {
    const { data, error } = await this.supabase.from("spots").insert(spot).select().single();
    return this.assert(data as Spot, error);
  }

  async getSpotById(id: string): Promise<Spot | undefined> {
    const { data, error } = await this.supabase.from("spots").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? undefined;
  }

  // Airbears
  async getAllAirbears(): Promise<Airbear[]> {
    const { data, error } = await this.supabase.from("airbears").select("*");
    return this.assert((data ?? []) as Airbear[], error);
  }

  async getAvailableAirbears(): Promise<Airbear[]> {
    const { data, error } = await this.supabase.from("airbears").select("*").eq("is_available", true);
    return this.assert((data ?? []) as Airbear[], error);
  }

  async getAirbearsByDriver(driverId: string): Promise<Airbear[]> {
    const { data, error } = await this.supabase.from("airbears").select("*").eq("driver_id", driverId);
    return this.assert((data ?? []) as Airbear[], error);
  }

  async createAirbear(airbear: InsertAirbear): Promise<Airbear> {
    const { data, error } = await this.supabase.from("airbears").insert(airbear).select().single();
    return this.assert(data as Airbear, error);
  }

  async updateAirbear(id: string, updates: Partial<Airbear>): Promise<Airbear> {
    const { data, error } = await this.supabase.from("airbears").update(updates).eq("id", id).select().single();
    return this.assert(data as Airbear, error);
  }

  // Legacy helpers
  async getAllRickshaws(): Promise<any[]> {
    return this.getAllAirbears();
  }
  async getAvailableRickshaws(): Promise<any[]> {
    return this.getAvailableAirbears();
  }

  // Rides
  async getRidesByUser(userId: string): Promise<Ride[]> {
    const { data, error } = await this.supabase.from("rides").select("*").eq("userid", userId).order("requestedat", { ascending: false });
    const rides = this.assert((data ?? []) as any[], error);
    return rides.map(normalizeRideRow);
  }

  async getRidesByDriver(driverId: string): Promise<Ride[]> {
    const { data, error } = await this.supabase.from("rides").select("*").eq("driverid", driverId).order("requestedat", { ascending: false });
    const rides = this.assert((data ?? []) as any[], error);
    return rides.map(normalizeRideRow);
  }

  async getPendingRides(): Promise<Ride[]> {
    const { data, error } = await this.supabase.from("rides").select("*").eq("status", "pending").order("requestedat", { ascending: false });
    const rides = this.assert((data ?? []) as any[], error);
    return rides.map(normalizeRideRow);
  }

  async createRide(ride: InsertRide): Promise<Ride> {
    // Use lowercase columns for PostgreSQL compatibility (PG lowercases unquoted identifiers)
    const payload = toSnakeRidePayload(ride);
    const { data, error } = await this.supabase.from("rides").insert(payload).select().single();
    return normalizeRideRow(this.assert(data as Ride, error));
  }

  async updateRide(id: string, updates: Partial<Ride>): Promise<Ride> {
    // Use lowercase columns for PostgreSQL compatibility
    const payload = toSnakeRidePayload(updates);
    const { data, error } = await this.supabase.from("rides").update(payload).eq("id", id).select().single();
    return normalizeRideRow(this.assert(data as Ride, error));
  }

  async getRideById(id: string): Promise<Ride | undefined> {
    const { data, error } = await this.supabase.from("rides").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? normalizeRideRow(data) : undefined;
  }

  // Bodega Items
  async getAllBodegaItems(): Promise<BodegaItem[]> {
    const { data, error } = await this.supabase.from("bodega_items").select("*").eq("is_available", true).order("name");
    return this.assert((data ?? []) as BodegaItem[], error);
  }

  async getBodegaItemsByCategory(category: string): Promise<BodegaItem[]> {
    const { data, error } = await this.supabase.from("bodega_items").select("*").eq("category", category);
    return this.assert((data ?? []) as BodegaItem[], error);
  }

  async createBodegaItem(item: InsertBodegaItem): Promise<BodegaItem> {
    // Convert camelCase to snake_case for database
    const dbItem = stripUndefined({
      name: item.name,
      description: item.description,
      price: item.price,
      image_url: item.imageUrl,
      category: item.category,
      is_eco_friendly: item.isEcoFriendly,
      is_available: item.isAvailable ?? true,
      stock: item.stock,
    });
    const { data, error } = await this.supabase.from("bodega_items").insert(dbItem).select().single();
    return this.assert(data as BodegaItem, error);
  }

  async updateBodegaItem(id: string, updates: Partial<BodegaItem>): Promise<BodegaItem> {
    const { data, error } = await this.supabase.from("bodega_items").update(updates).eq("id", id).select().single();
    return this.assert(data as BodegaItem, error);
  }

  // Orders
  async getOrderById(id: string): Promise<Order | undefined> {
    const { data, error } = await this.supabase.from("orders").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? undefined;
  }

  async getOrdersByUser(userId: string): Promise<Order[]> {
    const { data, error } = await this.supabase.from("orders").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    return this.assert((data ?? []) as Order[], error);
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const { data, error } = await this.supabase.from("orders").insert(order).select().single();
    return this.assert(data as Order, error);
  }

  async updateOrder(id: string, updates: Partial<Order>): Promise<Order> {
    const { data, error } = await this.supabase.from("orders").update(updates).eq("id", id).select().single();
    return this.assert(data as Order, error);
  }

  // Payments
  async getPaymentsByUser(userId: string): Promise<Payment[]> {
    const { data, error } = await this.supabase.from("payments").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    return this.assert((data ?? []) as Payment[], error);
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const { data, error } = await this.supabase.from("payments").insert(payment).select().single();
    return this.assert(data as Payment, error);
  }

  async updatePayment(id: string, updates: Partial<Payment>): Promise<Payment> {
    const { data, error } = await this.supabase.from("payments").update(updates).eq("id", id).select().single();
    return this.assert(data as Payment, error);
  }
}

const supabaseUrl = env.SUPABASE_URL;
const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

// Force using MemStorage for development/testing when using test credentials
const isUsingTestCredentials =
  supabaseUrl?.includes('test-project.supabase.co') ||
  supabaseServiceRoleKey?.includes('test-supabase-secret-key-for-development-only');

// Use MemStorage for development or when USE_MOCK_DATABASE is explicitly set
const useMockDatabase = env.USE_MOCK_DATABASE === 'true' ||
                       env.NODE_ENV === "development" ||
                       env.VERCEL_ENV === 'development';

export const storage: IStorage = !isUsingTestCredentials && !useMockDatabase && supabaseUrl && supabaseServiceRoleKey
  ? (() => {
    console.log('Using SupabaseStorage for production');
    const client = createClient(supabaseUrl, supabaseServiceRoleKey);
    return new SupabaseStorage(client);
  })()
  : (() => {
    console.log('Using MemStorage for development/testing');
    return new MemStorage();
  })();