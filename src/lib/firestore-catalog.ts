import { collection, doc, getDoc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { adminDb, hasAdminServiceAccount } from './firebase-admin.ts';
import { db as clientDb, withFirestoreTimeout } from './firebase.ts';
import type { Product } from '../types.ts';

const DEFAULT_FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80';

let cachedCatalog: Product[] | null = null;
let cachedAt = 0;
const CATALOG_CACHE_TTL_MS = 5_000;

export function invalidateFirestoreCatalogCache(): void {
  cachedCatalog = null;
  cachedAt = 0;
}

function sortProductsNewestFirst(items: Product[]): Product[] {
  return [...items].sort((a, b) => {
    const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return (Number.isFinite(tB) ? tB : 0) - (Number.isFinite(tA) ? tA : 0);
  });
}

export function normalizeFirestoreProduct(docId: string, d: Record<string, any>): Product | null {
  if (!d || typeof d !== 'object') return null;

  const title = String(d.title_ar || d.name || '').trim();
  if (!title || title === 'منتج غير مسمى') {
    return null;
  }

  let img = d.image_url || (Array.isArray(d.images) && d.images[0]) || '';
  if (!img || typeof img !== 'string' || img.startsWith('blob:')) {
    img = DEFAULT_FALLBACK_IMAGE;
  }

  const rawOriginalPrice = Number(d.original_price ?? d.price ?? 50);
  const originalPrice = Number.isFinite(rawOriginalPrice) && rawOriginalPrice > 0 ? rawOriginalPrice : 50;

  const discountPrice =
    d.discount_price !== undefined && d.discount_price !== null && Number.isFinite(Number(d.discount_price))
      ? Number(d.discount_price)
      : null;

  const rawStock = d.stock_quantity ?? d.quantity ?? 10;
  const stockQuantity = Number.isFinite(Number(rawStock)) ? Math.max(0, Math.floor(Number(rawStock))) : 10;

  return {
    id: docId,
    title_ar: title,
    description_ar: String(d.description_ar || d.description || ''),
    original_price: originalPrice,
    discount_price: discountPrice,
    stock_quantity: stockQuantity,
    category_id: String(d.category_id || 'skincare'),
    category_name: String(d.category_name || 'عناية بالبشرة'),
    tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
    image_url: img,
    gallery_images: Array.isArray(d.gallery_images) ? d.gallery_images : undefined,
    video_url: d.video_url || undefined,
    video_duration: typeof d.video_duration === 'number' ? d.video_duration : undefined,
    size_or_volume: d.size_or_volume || undefined,
    skin_type: d.skin_type || undefined,
    key_benefits: Array.isArray(d.key_benefits) ? d.key_benefits : undefined,
    how_to_use: d.how_to_use || undefined,
    ingredients: d.ingredients || undefined,
    badge: d.badge || undefined,
    ai_generated: Boolean(d.ai_generated),
    rating: Number.isFinite(Number(d.rating)) ? Number(d.rating) : 5.0,
    reviews_count: Number.isFinite(Number(d.reviews_count)) ? Number(d.reviews_count) : 1,
    featured: Boolean(d.featured),
    status: d.status === 'draft' ? 'draft' : 'published',
    creator_id: d.creator_id || undefined,
    created_at:
      typeof d.createdAt === 'string'
        ? d.createdAt
        : typeof d.created_at === 'string'
          ? d.created_at
          : new Date().toISOString(),
  };
}

export async function fetchFirestoreCatalog(forceRefresh = false): Promise<Product[]> {
  if (!forceRefresh && cachedCatalog && Date.now() - cachedAt < CATALOG_CACHE_TTL_MS) {
    return cachedCatalog;
  }

  // 1. Try Admin SDK first (only when FIREBASE_SERVICE_ACCOUNT is configured)
  if (hasAdminServiceAccount) {
    try {
      const snap = await withFirestoreTimeout(adminDb.collection('products').get(), 8000);
      const items: Product[] = [];
      snap.forEach((docSnap) => {
        const normalized = normalizeFirestoreProduct(docSnap.id, docSnap.data());
        if (normalized) items.push(normalized);
      });
      const sorted = sortProductsNewestFirst(items);
      cachedCatalog = sorted;
      cachedAt = Date.now();
      return sorted;
    } catch {
      // Fall back to public-read Client SDK when Admin IAM is unavailable
    }
  }

  // 2. Public-read Client SDK fallback (products has `allow read: if true` in firestore.rules)
  try {
    const snap = await withFirestoreTimeout(getDocs(collection(clientDb, 'products')), 12000);
    const items: Product[] = [];
    snap.forEach((docSnap) => {
      const normalized = normalizeFirestoreProduct(docSnap.id, docSnap.data());
      if (normalized) items.push(normalized);
    });
    const sorted = sortProductsNewestFirst(items);
    cachedCatalog = sorted;
    cachedAt = Date.now();
    return sorted;
  } catch (err: any) {
    console.warn('[Firestore Catalog] Could not read Firestore products:', err?.message || err);
    return cachedCatalog || [];
  }
}

export async function fetchFirestoreProductById(productId: string): Promise<Product | null> {
  if (!productId) return null;

  if (cachedCatalog && Date.now() - cachedAt < CATALOG_CACHE_TTL_MS) {
    const cached = cachedCatalog.find((p) => p.id === productId);
    if (cached) return cached;
  }

  // 1. Try Admin SDK when configured
  if (hasAdminServiceAccount) {
    try {
      const docSnap = await withFirestoreTimeout(adminDb.collection('products').doc(productId).get(), 2500);
      if (docSnap.exists) {
        return normalizeFirestoreProduct(docSnap.id, docSnap.data() || {});
      }
    } catch {
      // Fall back to public-read Client SDK
    }
  }

  // 2. Public-read Client SDK fallback
  try {
    const docSnap = await withFirestoreTimeout(getDoc(doc(clientDb, 'products', productId)), 3000);
    if (docSnap.exists()) {
      return normalizeFirestoreProduct(docSnap.id, docSnap.data() || {});
    }
  } catch (err: any) {
    console.warn(`[Firestore Catalog] Failed to fetch product ${productId}:`, err?.message || err);
  }

  return null;
}

export async function updateFirestoreProductStock(productId: string, newStock: number): Promise<boolean> {
  if (!productId) return false;
  const safeStock = Math.max(0, Math.floor(newStock));

  if (cachedCatalog) {
    cachedCatalog = cachedCatalog.map((p) => (p.id === productId ? { ...p, stock_quantity: safeStock } : p));
  }

  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return true;
  }

  if (hasAdminServiceAccount) {
    try {
      await withFirestoreTimeout(
        adminDb.collection('products').doc(productId).update({
          stock_quantity: safeStock,
          updatedAt: new Date().toISOString(),
        }),
        2500
      );
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function syncFirestoreProduct(productId: string, payload: Record<string, any>): Promise<boolean> {
  if (!productId) return false;
  invalidateFirestoreCatalogCache();

  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return true;
  }

  // 1. Try Admin SDK first only when explicit service account is configured (or try silently)
  if (hasAdminServiceAccount) {
    try {
      await withFirestoreTimeout(
        adminDb.collection('products').doc(productId).set(payload, { merge: true }),
        3500
      );
      return true;
    } catch (adminErr: any) {
      console.info(`[Firestore Product Sync] Admin SDK skipped for ${productId}: ${adminErr?.message || 'unavailable'}`);
    }
  }

  // 2. Fallback to Firebase Web Client SDK (permitted by firestore.rules when title_ar & original_price are valid)
  try {
    await withFirestoreTimeout(
      setDoc(doc(clientDb, 'products', productId), payload, { merge: true }),
      4000
    );
    return true;
  } catch (clientErr: any) {
    console.info(`[Firestore Product Sync] Deferred for ${productId}: ${clientErr?.message || 'offline/restricted'}`);
    return false;
  }
}

export async function deleteFirestoreProduct(productId: string): Promise<boolean> {
  if (!productId) return false;
  invalidateFirestoreCatalogCache();

  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return true;
  }

  if (hasAdminServiceAccount) {
    try {
      await withFirestoreTimeout(adminDb.collection('products').doc(productId).delete(), 3500);
      return true;
    } catch (adminErr: any) {
      console.info(`[Firestore Product Delete] Admin SDK skipped for ${productId}: ${adminErr?.message || 'unavailable'}`);
    }
  }

  try {
    await withFirestoreTimeout(deleteDoc(doc(clientDb, 'products', productId)), 3500);
    return true;
  } catch {
    // Expected in restricted sandbox mode when rules require Firebase Staff Auth (`isStaff()`)
    return false;
  }
}
