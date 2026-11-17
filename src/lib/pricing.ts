import { Product, StoreSettings, CartItem, OrderItem } from '../types';

export interface ProductPricingInfo {
  originalPrice: number;
  discountPrice: number | null;
  finalPrice: number;
  hasDiscount: boolean;
  savingsAmount: number;
  discountPercent: number;
}

/**
 * Single authoritative source of truth for calculating product pricing and discounts.
 * Enforces strict validation:
 * - originalPrice must be a positive finite number.
 * - discountPrice is only valid if it is a positive finite number strictly less than originalPrice.
 * - If discountPrice is equal to or greater than originalPrice, or <= 0, discount is treated as inactive.
 */
export function getProductPricing(product: {
  original_price: number;
  discount_price?: number | null;
}): ProductPricingInfo {
  const rawOriginal = Number(product?.original_price);
  const originalPrice = Number.isFinite(rawOriginal) && rawOriginal > 0 ? Math.round(rawOriginal * 100) / 100 : 0;

  const rawDiscount = product?.discount_price !== null && product?.discount_price !== undefined
    ? Number(product.discount_price)
    : null;

  const isValidDiscount =
    rawDiscount !== null &&
    Number.isFinite(rawDiscount) &&
    rawDiscount > 0 &&
    rawDiscount < originalPrice;

  if (isValidDiscount) {
    const discountPrice = Math.round(rawDiscount * 100) / 100;
    const savingsAmount = Math.max(0, Math.round((originalPrice - discountPrice) * 100) / 100);
    const discountPercent = originalPrice > 0
      ? Math.max(1, Math.min(99, Math.round(((originalPrice - discountPrice) / originalPrice) * 100)))
      : 0;

    return {
      originalPrice,
      discountPrice,
      finalPrice: discountPrice,
      hasDiscount: true,
      savingsAmount,
      discountPercent,
    };
  }

  return {
    originalPrice,
    discountPrice: null,
    finalPrice: originalPrice,
    hasDiscount: false,
    savingsAmount: 0,
    discountPercent: 0,
  };
}

/**
 * Returns the customer-facing effective unit price for a product.
 */
export function getEffectivePrice(product: {
  original_price: number;
  discount_price?: number | null;
}): number {
  return getProductPricing(product).finalPrice;
}

/**
 * Calculates a discounted price from an original price and a percentage discount.
 * Clamps percentage to [1, 99] and rounds to nearest whole currency unit or 2 decimals.
 */
export function calculateDiscountPriceFromPercent(
  originalPrice: number,
  percent: number
): number {
  const safeOriginal = Math.max(0, Number(originalPrice) || 0);
  if (safeOriginal <= 0) return 0;

  const safePercent = Math.max(1, Math.min(99, Math.round(Number(percent) || 0)));
  const calculated = safeOriginal * (1 - safePercent / 100);
  // Round to nearest integer (or 0.5 if applicable)
  return Math.max(1, Math.round(calculated));
}

/**
 * Calculates discount percentage from original price and discounted price.
 */
export function calculatePercentFromDiscountPrice(
  originalPrice: number,
  discountPrice: number
): number {
  const safeOriginal = Math.max(0, Number(originalPrice) || 0);
  const safeDiscount = Math.max(0, Number(discountPrice) || 0);

  if (safeOriginal <= 0 || safeDiscount <= 0 || safeDiscount >= safeOriginal) {
    return 0;
  }

  const rawPct = ((safeOriginal - safeDiscount) / safeOriginal) * 100;
  return Math.max(1, Math.min(99, Math.round(rawPct)));
}

export interface OrderVerificationResult {
  isValid: boolean;
  verifiedItems: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  grandTotal: number;
  errors: string[];
  warnings: string[];
  priceAdjusted: boolean;
}

/**
 * Authoritatively re-verifies order items, stock availability, and prices against the catalog.
 * Protects against tampered client pricing and stale cart prices.
 */
export function verifyOrderItemsAgainstCatalog(
  rawItems: { product_id: string; quantity: number; price?: number }[],
  catalog: Product[],
  settings: StoreSettings,
  couponDiscount: number = 0,
  expressDelivery: boolean = false
): OrderVerificationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const verifiedItems: OrderItem[] = [];
  let subtotal = 0;
  let priceAdjusted = false;

  const catalogMap = new Map<string, Product>();
  catalog.forEach((p) => catalogMap.set(p.id, p));

  if (!rawItems || rawItems.length === 0) {
    return {
      isValid: false,
      verifiedItems: [],
      subtotal: 0,
      deliveryFee: 0,
      grandTotal: 0,
      errors: ['سلة المشتريات فارغة، لا يمكن إتمام الطلب.'],
      warnings: [],
      priceAdjusted: false,
    };
  }

  for (const item of rawItems) {
    const product = catalogMap.get(item.product_id);
    if (!product) {
      errors.push(`المنتج بالمعرف "${item.product_id}" لم يعد متوفراً في المتجر.`);
      continue;
    }

    const safeQty = Math.max(1, Math.floor(Number(item.quantity) || 1));

    // Inventory & Stock Validation
    if (product.stock_quantity <= 0) {
      errors.push(`عذراً، المنتج "${product.title_ar}" نفد من المخزون حالياً.`);
      continue;
    }

    if (safeQty > product.stock_quantity) {
      errors.push(
        `الكمية المطلوبة (${safeQty}) للمنتج "${product.title_ar}" تتجاوز المخزون المتوفر (${product.stock_quantity}).`
      );
      continue;
    }

    // Authoritative Price Calculation
    const pricing = getProductPricing(product);
    const authoritativePrice = pricing.finalPrice;

    if (item.price !== undefined && Math.abs(item.price - authoritativePrice) > 0.01) {
      priceAdjusted = true;
      warnings.push(
        `تم تحديث سعر المنتج "${product.title_ar}" تلقائياً إلى السعر الرسمي الحالي (${authoritativePrice} ${settings.currency}).`
      );
    }

    const lineTotal = authoritativePrice * safeQty;
    subtotal += lineTotal;

    verifiedItems.push({
      product_id: product.id,
      title_ar: product.title_ar,
      price: authoritativePrice,
      quantity: safeQty,
      image_url: product.image_url,
    });
  }

  const isValid = errors.length === 0 && verifiedItems.length > 0;

  // Delivery calculation
  const isFreeDelivery = subtotal >= settings.freeDeliveryThreshold;
  const standardFee = isFreeDelivery ? 0 : settings.deliveryFee;
  const expressExtraFee = expressDelivery ? 15 : 0;
  const deliveryFee = subtotal > 0 ? standardFee + expressExtraFee : 0;

  const safeCouponDiscount = Math.max(0, Math.min(subtotal, Number(couponDiscount) || 0));
  const grandTotal = Math.max(0, subtotal - safeCouponDiscount + deliveryFee);

  return {
    isValid,
    verifiedItems,
    subtotal,
    deliveryFee,
    grandTotal,
    errors,
    warnings,
    priceAdjusted,
  };
}
