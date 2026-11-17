import { db, isPostgresConfigured } from './index.ts';
import { reviews } from './schema.ts';
import { eq, desc } from 'drizzle-orm';
import { ProductReview } from '../types.ts';

type DbReviewRow = typeof reviews.$inferSelect;
const memoryReviews: DbReviewRow[] = [];
let memoryReviewIdCounter = 1;

export async function getReviewsForProduct(productId: string) {
  if (!isPostgresConfigured) {
    return memoryReviews
      .filter((r) => r.productId === productId)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }
  try {
    const records = await db
      .select()
      .from(reviews)
      .where(eq(reviews.productId, productId))
      .orderBy(desc(reviews.createdAt));
    return records;
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function createReviewInDb(productId: string, review: Omit<ProductReview, 'id'>) {
  if (!isPostgresConfigured) {
    const row: DbReviewRow = {
      id: memoryReviewIdCounter++,
      productId,
      author: review.author,
      rating: Math.round(review.rating),
      comment: review.comment,
      verifiedPurchase: review.verifiedPurchase ?? true,
      title: review.title || null,
      createdAt: new Date(),
    };
    memoryReviews.unshift(row);
    return row;
  }
  try {
    const result = await db
      .insert(reviews)
      .values({
        productId,
        author: review.author,
        rating: Math.round(review.rating),
        comment: review.comment,
        verifiedPurchase: review.verifiedPurchase ?? true,
        title: review.title || null,
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Failed to create review:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}
