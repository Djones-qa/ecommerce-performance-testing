/**
 * Mock E-Commerce API Server
 *
 * Express-based mock server that simulates a production e-commerce API.
 * Designed to be the target for k6 and Artillery load tests.
 *
 * Endpoints:
 *   GET  /health              — Health check
 *   GET  /products            — Product listing with pagination
 *   GET  /products/:id        — Product detail
 *   POST /cart                — Add item to cart
 *   GET  /cart/:sessionId     — Get cart contents
 *   POST /checkout            — Process order
 *   GET  /search?q=           — Product search
 *   POST /auth/login          — Mock authentication
 */

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";
import compression from "compression";
import { v4 as uuidv4 } from "uuid";

const app = express();
const PORT = parseInt(process.env["PORT"] ?? "3000", 10);

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("combined"));

// ─── In-Memory Store (simulates DB) ───────────────────────────────────────────
interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
  rating: number;
  stock: number;
  description: string;
  imageUrl: string;
}

interface CartItem {
  productId: number;
  quantity: number;
  variantId?: string;
  price: number;
  name: string;
}

interface Cart {
  sessionId: string;
  items: CartItem[];
  total: number;
  updatedAt: string;
}

interface Order {
  orderId: string;
  sessionId: string;
  status: string;
  total: number;
  createdAt: string;
  estimatedDelivery: string;
}

// Generate mock product catalog
const CATEGORIES = ["electronics", "clothing", "home-garden", "sports", "books", "toys", "beauty", "automotive"];

function generateProducts(): Product[] {
  const products: Product[] = [];
  const names = [
    "Wireless Headphones Pro", "Running Shoes X1", "Coffee Maker Deluxe",
    "Yoga Mat Premium", "Laptop Stand Adjustable", "Mechanical Keyboard RGB",
    "Gaming Mouse 16000DPI", "Standing Desk Electric", "Air Purifier HEPA",
    "Bluetooth Speaker Waterproof", "Phone Case MagSafe", "Desk Lamp LED",
    "Water Bottle Insulated", "Backpack 40L", "Sunglasses Polarized",
  ];

  for (let i = 1; i <= 100; i++) {
    products.push({
      id: i,
      name: `${names[(i - 1) % names.length]} v${Math.ceil(i / names.length)}`,
      price: parseFloat((Math.random() * 500 + 9.99).toFixed(2)),
      category: CATEGORIES[i % CATEGORIES.length] as string,
      rating: parseFloat((Math.random() * 2 + 3).toFixed(1)),
      stock: Math.floor(Math.random() * 1000),
      description: `High-quality product #${i} for everyday use. Trusted by thousands of customers.`,
      imageUrl: `https://picsum.photos/seed/${i}/400/300`,
    });
  }
  return products;
}

const PRODUCTS = generateProducts();
const CARTS = new Map<string, Cart>();
const ORDERS = new Map<string, Order>();

// ─── Utility: Simulate realistic latency ──────────────────────────────────────
function simulateLatency(minMs: number, maxMs: number): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs) + minMs);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

// ─── Routes ────────────────────────────────────────────────────────────────────

/** GET /health */
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: "1.0.0",
    services: {
      database: "connected",
      cache: "connected",
      queue: "connected",
    },
  });
});

/** POST /auth/login */
app.post("/auth/login", async (req: Request, res: Response) => {
  await simulateLatency(20, 80);

  const { email } = req.body as { email?: string; password?: string };

  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  res.json({
    token: `mock_jwt_${uuidv4().replace(/-/g, "")}`,
    sessionId: `sess_${uuidv4()}`,
    expiresIn: 3600,
    user: {
      id: uuidv4(),
      email,
      role: "customer",
    },
  });
});

/** GET /products */
app.get("/products", async (req: Request, res: Response) => {
  await simulateLatency(30, 120);

  const page = parseInt(String(req.query["page"] ?? "1"), 10);
  const limit = parseInt(String(req.query["limit"] ?? "20"), 10);
  const sort = String(req.query["sort"] ?? "newest");
  const category = req.query["category"] as string | undefined;

  let filtered = category
    ? PRODUCTS.filter((p) => p.category === category)
    : [...PRODUCTS];

  // Apply sorting
  switch (sort) {
    case "price_asc":
      filtered.sort((a, b) => a.price - b.price);
      break;
    case "price_desc":
      filtered.sort((a, b) => b.price - a.price);
      break;
    case "rating":
      filtered.sort((a, b) => b.rating - a.rating);
      break;
    default:
      filtered.sort((a, b) => b.id - a.id);
  }

  const total = filtered.length;
  const startIndex = (page - 1) * limit;
  const data = filtered.slice(startIndex, startIndex + limit);

  res.json({
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: startIndex + limit < total,
      hasPrev: page > 1,
    },
  });
});

/** GET /products/:id */
app.get("/products/:id", async (req: Request, res: Response) => {
  await simulateLatency(20, 80);

  const id = parseInt(req.params["id"] ?? "0", 10);
  const product = PRODUCTS.find((p) => p.id === id);

  if (!product) {
    res.status(404).json({ error: "Product not found", id });
    return;
  }

  res.json({
    ...product,
    relatedProducts: PRODUCTS.slice(0, 4).map((p) => ({ id: p.id, name: p.name, price: p.price })),
    reviews: {
      count: Math.floor(Math.random() * 500),
      average: product.rating,
    },
  });
});

/** POST /cart */
app.post("/cart", async (req: Request, res: Response) => {
  await simulateLatency(40, 150);

  const { productId, quantity, sessionId, variantId } = req.body as {
    productId?: number;
    quantity?: number;
    sessionId?: string;
    variantId?: string;
  };

  if (!productId || !quantity || !sessionId) {
    res.status(400).json({ error: "productId, quantity, and sessionId are required" });
    return;
  }

  const product = PRODUCTS.find((p) => p.id === productId);
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  if (product.stock < quantity) {
    res.status(409).json({ error: "Insufficient stock", available: product.stock });
    return;
  }

  const cart = CARTS.get(sessionId) ?? {
    sessionId,
    items: [],
    total: 0,
    updatedAt: new Date().toISOString(),
  };

  const existingItem = cart.items.find(
    (item) => item.productId === productId && item.variantId === variantId
  );

  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    cart.items.push({
      productId,
      quantity,
      variantId,
      price: product.price,
      name: product.name,
    });
  }

  cart.total = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  cart.updatedAt = new Date().toISOString();
  CARTS.set(sessionId, cart);

  res.status(201).json(cart);
});

/** GET /cart/:sessionId */
app.get("/cart/:sessionId", async (req: Request, res: Response) => {
  await simulateLatency(20, 60);

  const { sessionId } = req.params as { sessionId: string };
  const cart = CARTS.get(sessionId);

  if (!cart) {
    res.json({
      sessionId,
      items: [],
      total: 0,
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  res.json(cart);
});

/** POST /checkout */
app.post("/checkout", async (req: Request, res: Response) => {
  await simulateLatency(100, 400); // Checkout is slower — payment processing

  const { sessionId, paymentMethod, shippingAddress } = req.body as {
    sessionId?: string;
    paymentMethod?: string;
    shippingAddress?: Record<string, string>;
    promoCode?: string;
  };

  if (!sessionId || !paymentMethod || !shippingAddress) {
    res.status(400).json({ error: "sessionId, paymentMethod, and shippingAddress are required" });
    return;
  }

  const cart = CARTS.get(sessionId);
  if (!cart || cart.items.length === 0) {
    res.status(400).json({ error: "Cart is empty or not found" });
    return;
  }

  // Simulate occasional payment failures (2% rate)
  if (Math.random() < 0.02) {
    res.status(402).json({ error: "Payment declined", code: "PAYMENT_DECLINED" });
    return;
  }

  const orderId = `ORD-${uuidv4().toUpperCase().slice(0, 8)}`;
  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + Math.floor(Math.random() * 5) + 2);

  const order: Order = {
    orderId,
    sessionId,
    status: "confirmed",
    total: cart.total,
    createdAt: new Date().toISOString(),
    estimatedDelivery: deliveryDate.toISOString().split("T")[0] as string,
  };

  ORDERS.set(orderId, order);
  CARTS.delete(sessionId); // Clear cart after checkout

  res.status(201).json({
    ...order,
    items: cart.items,
    paymentMethod,
    shippingAddress,
    confirmationEmail: `confirmation+${orderId.toLowerCase()}@ecommerce-test.dev`,
  });
});

/** GET /search */
app.get("/search", async (req: Request, res: Response) => {
  await simulateLatency(50, 200); // Search is more expensive

  const query = String(req.query["q"] ?? "").toLowerCase().trim();
  const limit = parseInt(String(req.query["limit"] ?? "20"), 10);

  if (!query) {
    res.status(400).json({ error: "Search query 'q' is required" });
    return;
  }

  const results = PRODUCTS.filter(
    (p) =>
      p.name.toLowerCase().includes(query) ||
      p.category.toLowerCase().includes(query) ||
      p.description.toLowerCase().includes(query)
  ).slice(0, limit);

  res.json({
    query,
    results,
    total: results.length,
    took: Math.floor(Math.random() * 50 + 10),
  });
});

// ─── Error Handling ────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

// ─── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Mock E-Commerce API running on http://localhost:${PORT}`);
  console.log(`📊 Endpoints: /health, /products, /cart, /checkout, /search`);
});

export default app;
