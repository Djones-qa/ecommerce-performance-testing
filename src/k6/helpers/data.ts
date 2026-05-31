/**
 * Test data generators for k6 load test scenarios.
 * Provides realistic e-commerce data to simulate production traffic patterns.
 */

/** Product categories matching the mock API catalog */
export const PRODUCT_CATEGORIES = [
  "electronics",
  "clothing",
  "home-garden",
  "sports",
  "books",
  "toys",
  "beauty",
  "automotive",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

/** Search terms that simulate real user search behavior */
export const SEARCH_TERMS = [
  "laptop",
  "wireless headphones",
  "running shoes",
  "coffee maker",
  "yoga mat",
  "phone case",
  "desk lamp",
  "water bottle",
  "backpack",
  "sunglasses",
  "bluetooth speaker",
  "gaming mouse",
  "mechanical keyboard",
  "standing desk",
  "air purifier",
] as const;

/** Product IDs available in the mock catalog (1–100) */
export function randomProductId(): number {
  return Math.floor(Math.random() * 100) + 1;
}

/** Random integer between min and max (inclusive) */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Pick a random element from an array */
export function randomChoice<T>(arr: readonly T[]): T {
  const index = Math.floor(Math.random() * arr.length);
  return arr[index] as T;
}

/** Generate a realistic cart item payload */
export interface CartItem {
  productId: number;
  quantity: number;
  variantId?: string;
}

export function generateCartItem(): CartItem {
  return {
    productId: randomProductId(),
    quantity: randomInt(1, 5),
    variantId: Math.random() > 0.5 ? `var_${randomInt(1, 10)}` : undefined,
  };
}

/** Generate a multi-item cart (1–4 items, simulating real shopping behavior) */
export function generateCart(): CartItem[] {
  const itemCount = randomInt(1, 4);
  const items: CartItem[] = [];
  const usedIds = new Set<number>();

  for (let i = 0; i < itemCount; i++) {
    let productId = randomProductId();
    // Avoid duplicate product IDs in the same cart
    while (usedIds.has(productId)) {
      productId = randomProductId();
    }
    usedIds.add(productId);
    items.push({ productId, quantity: randomInt(1, 3) });
  }

  return items;
}

/** Generate a checkout payload */
export interface CheckoutPayload {
  sessionId: string;
  paymentMethod: string;
  shippingAddress: ShippingAddress;
  promoCode?: string;
}

export interface ShippingAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

const CITIES = ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix"] as const;
const STATES = ["NY", "CA", "IL", "TX", "AZ"] as const;
const PAYMENT_METHODS = ["credit_card", "paypal", "apple_pay", "google_pay"] as const;

export function generateCheckoutPayload(sessionId: string): CheckoutPayload {
  const cityIndex = randomInt(0, CITIES.length - 1);
  return {
    sessionId,
    paymentMethod: randomChoice(PAYMENT_METHODS),
    shippingAddress: {
      street: `${randomInt(100, 9999)} ${randomChoice(["Main St", "Oak Ave", "Elm Dr", "Park Blvd"])}`,
      city: CITIES[cityIndex] as string,
      state: STATES[cityIndex] as string,
      zip: String(randomInt(10000, 99999)),
      country: "US",
    },
    promoCode: Math.random() > 0.8 ? "BLACKFRIDAY20" : undefined,
  };
}

/** Generate pagination parameters */
export interface PaginationParams {
  page: number;
  limit: number;
  sort: string;
}

export function generatePaginationParams(): PaginationParams {
  return {
    page: randomInt(1, 10),
    limit: randomChoice([10, 20, 50] as const),
    sort: randomChoice(["price_asc", "price_desc", "rating", "newest"] as const),
  };
}

/** Generate a random search query */
export function generateSearchQuery(): string {
  return randomChoice(SEARCH_TERMS);
}
