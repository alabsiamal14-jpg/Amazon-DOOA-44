import { db, isPostgresConfigured } from './index.ts';
import { products } from './schema.ts';
import { eq, desc } from 'drizzle-orm';
import type { Product } from '../types.ts';
import { INITIAL_PRODUCTS } from '../data/initialData.ts';
import {
  fetchFirestoreCatalog,
  fetchFirestoreProductById,
  updateFirestoreProductStock,
  invalidateFirestoreCatalogCache,
} from '../lib/firestore-catalog.ts';

type DbProductRow = typeof products.$inferSelect;

const memoryOverrides = new Map<string, DbProductRow>();
const memoryDeletedIds = new Set<string>();
let memoryIdCounter = 1000;

function productToDbRow(p: Product, numericId: number): DbProductRow {
  return {
    id: numericId,
    productId: p.id,
    titleAr: p.title_ar,
    descriptionAr: p.description_ar || '',
    originalPrice: Number(p.original_price || 0),
    discountPrice: p.discount_price !== undefined && p.discount_price !== null ? Number(p.discount_price) : null,
    stockQuantity: Number(p.stock_quantity ?? 10),
    categoryId: p.category_id || 'skincare',
    categoryName: p.category_name || 'عناية بالبشرة',
    imageUrl: p.image_url || '',
    galleryImages: p.gallery_images || [],
    tags: p.tags || [],
    rating: Number(p.rating ?? 5.0),
    reviewsCount: Number(p.reviews_count ?? 0),
    aiGenerated: Boolean(p.ai_generated),
    featured: Boolean(p.featured),
    sizeOrVolume: p.size_or_volume || null,
    skinType: p.skin_type || null,
    keyBenefits: p.key_benefits || [],
    howToUse: p.how_to_use || null,
    ingredients: p.ingredients || null,
    badge: p.badge || null,
    status: p.status || 'published',
    creatorId: p.creator_id || null,
    createdAt: p.created_at ? new Date(p.created_at) : new Date(),
  };
}

async function getUnifiedFallbackProducts(forceRefresh = false): Promise<DbProductRow[]> {
  const fsProducts = await fetchFirestoreCatalog(forceRefresh);
  const byProductId = new Map<string, DbProductRow>();
  let idx = 1;

  for (const fp of fsProducts) {
    if (!memoryDeletedIds.has(fp.id)) {
      byProductId.set(fp.id, productToDbRow(fp, idx++));
    }
  }

  for (const ip of INITIAL_PRODUCTS) {
    if (!byProductId.has(ip.id) && !memoryDeletedIds.has(ip.id)) {
      byProductId.set(ip.id, productToDbRow(ip, idx++));
    }
  }

  for (const [prodId, overrideRow] of memoryOverrides.entries()) {
    if (!memoryDeletedIds.has(prodId)) {
      byProductId.set(prodId, overrideRow);
    }
  }

  return Array.from(byProductId.values());
}

export async function getAllProducts(forceRefresh = false) {
  if (!isPostgresConfigured) {
    const unified = await getUnifiedFallbackProducts(forceRefresh);
    return unified.sort(
      (a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)
    );
  }
  try {
    const records = await db.select().from(products).orderBy(desc(products.createdAt));
    return records;
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getProductById(productId: string) {
  if (!isPostgresConfigured) {
    if (memoryDeletedIds.has(productId)) return null;
    const override = memoryOverrides.get(productId);
    if (override) return override;

    const fsProd = await fetchFirestoreProductById(productId);
    if (fsProd) {
      return productToDbRow(fsProd, memoryIdCounter++);
    }

    const initialProd = INITIAL_PRODUCTS.find((p) => p.id === productId);
    return initialProd ? productToDbRow(initialProd, memoryIdCounter++) : null;
  }
  try {
    const records = await db.select().from(products).where(eq(products.productId, productId)).limit(1);
    if (records[0]) return records[0];

    // Bridge gap when Firestore catalog contains a product not yet mirrored to Postgres
    const fsProd = await fetchFirestoreProductById(productId);
    if (fsProd) {
      return await upsertProduct(fsProd);
    }
    return null;
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function upsertProduct(product: Partial<Product> & { id: string; title_ar: string; category_id: string; category_name: string; original_price: number; image_url: string }) {
  if (!isPostgresConfigured) {
    memoryDeletedIds.delete(product.id);
    const existing = memoryOverrides.get(product.id);
    const row: DbProductRow = {
      id: existing ? existing.id : memoryIdCounter++,
      productId: product.id,
      titleAr: product.title_ar || 'منتج',
      descriptionAr: product.description_ar || '',
      originalPrice: Number(product.original_price || 0),
      discountPrice: product.discount_price !== undefined && product.discount_price !== null ? Number(product.discount_price) : null,
      stockQuantity: product.stock_quantity !== undefined ? Number(product.stock_quantity) : 10,
      categoryId: product.category_id || 'skincare',
      categoryName: product.category_name || 'عناية بالبشرة',
      imageUrl: product.image_url || '',
      galleryImages: product.gallery_images || [],
      tags: product.tags || [],
      rating: product.rating ?? 5.0,
      reviewsCount: product.reviews_count ?? 0,
      aiGenerated: product.ai_generated ?? false,
      featured: product.featured ?? false,
      sizeOrVolume: product.size_or_volume || null,
      skinType: product.skin_type || null,
      keyBenefits: product.key_benefits || [],
      howToUse: product.how_to_use || null,
      ingredients: product.ingredients || null,
      badge: product.badge || null,
      status: product.status || 'published',
      creatorId: product.creator_id || null,
      createdAt: existing ? existing.createdAt : new Date(),
    };
    memoryOverrides.set(product.id, row);
    invalidateFirestoreCatalogCache();
    return row;
  }

  try {
    const result = await db
      .insert(products)
      .values({
        productId: product.id,
        titleAr: product.title_ar || 'منتج',
        descriptionAr: product.description_ar || '',
        originalPrice: Number(product.original_price || 0),
        discountPrice: product.discount_price !== undefined && product.discount_price !== null ? Number(product.discount_price) : null,
        stockQuantity: product.stock_quantity !== undefined ? Number(product.stock_quantity) : 10,
        categoryId: product.category_id || 'skincare',
        categoryName: product.category_name || 'عناية بالبشرة',
        imageUrl: product.image_url || '',
        galleryImages: product.gallery_images || [],
        tags: product.tags || [],
        rating: product.rating ?? 5.0,
        reviewsCount: product.reviews_count ?? 0,
        aiGenerated: product.ai_generated ?? false,
        featured: product.featured ?? false,
        sizeOrVolume: product.size_or_volume || null,
        skinType: product.skin_type || null,
        keyBenefits: product.key_benefits || [],
        howToUse: product.how_to_use || null,
        ingredients: product.ingredients || null,
        badge: product.badge || null,
        status: product.status || 'published',
        creatorId: product.creator_id || null,
      })
      .onConflictDoUpdate({
        target: products.productId,
        set: {
          titleAr: product.title_ar,
          descriptionAr: product.description_ar || '',
          originalPrice: product.original_price,
          discountPrice: product.discount_price ?? null,
          stockQuantity: product.stock_quantity ?? 10,
          categoryId: product.category_id,
          categoryName: product.category_name,
          imageUrl: product.image_url,
          galleryImages: product.gallery_images || [],
          tags: product.tags || [],
          rating: product.rating ?? 5.0,
          reviewsCount: product.reviews_count ?? 0,
          aiGenerated: product.ai_generated ?? false,
          featured: product.featured ?? false,
          sizeOrVolume: product.size_or_volume || null,
          skinType: product.skin_type || null,
          keyBenefits: product.key_benefits || [],
          howToUse: product.how_to_use || null,
          ingredients: product.ingredients || null,
          badge: product.badge || null,
          status: product.status ?? 'published',
          creatorId: product.creator_id ?? null,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Failed to upsert product:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}

export async function deleteProductFromDb(productId: string) {
  if (!isPostgresConfigured) {
    const existing = await getProductById(productId);
    memoryDeletedIds.add(productId);
    memoryOverrides.delete(productId);
    invalidateFirestoreCatalogCache();
    return existing;
  }
  try {
    const result = await db.delete(products).where(eq(products.productId, productId)).returning();
    return result[0] || null;
  } catch (error) {
    console.error('Failed to delete product from database:', error);
    throw new Error('Failed to delete product from database.', { cause: error });
  }
}

export async function updateProductStockInDb(productId: string, newStock: number) {
  const safeStock = Math.max(0, Math.floor(newStock));
  if (!isPostgresConfigured) {
    const existing = await getProductById(productId);
    if (!existing) return null;
    const updated: DbProductRow = { ...existing, stockQuantity: safeStock };
    memoryOverrides.set(productId, updated);
    await updateFirestoreProductStock(productId, safeStock);
    return updated;
  }
  try {
    const result = await db.update(products).set({ stockQuantity: safeStock }).where(eq(products.productId, productId)).returning();
    await updateFirestoreProductStock(productId, safeStock);
    return result[0] || null;
  } catch (error) {
    console.error('Failed to update product stock in database:', error);
    throw new Error('Failed to update product stock in database.', { cause: error });
  }
}

