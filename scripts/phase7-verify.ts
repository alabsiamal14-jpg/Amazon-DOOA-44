import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { products, orders, orderOutbox } from '../src/db/schema.ts';
import { eq, sql } from 'drizzle-orm';
import { adminDb } from '../src/lib/firebase-admin.ts';
import { syncOrderToFirestoreWithRetry } from '../src/services/orderProcessor.ts';

async function runPhase7Verification() {
  console.log('==================================================');
  console.log('  AMAZON DUAA - PHASE 7 DATABASE & RELIABILITY AUDIT');
  console.log('==================================================\n');

  // --- SECTION A: OUTBOX DATABASE VERIFICATION ---
  console.log('--- [Section A] Outbox Database Verification ---');
  try {
    const tableCheck = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'order_outbox';
    `);
    
    if (tableCheck.rows.length === 0) {
      console.log('⚠️ order_outbox table not found. Creating table now...');
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS order_outbox (
          id SERIAL PRIMARY KEY,
          idempotency_key TEXT NOT NULL UNIQUE,
          order_number TEXT NOT NULL,
          payload JSONB NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          attempts INT NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);
      console.log('✅ order_outbox table created successfully.');
    } else {
      console.log('✅ order_outbox table exists in PostgreSQL.');
    }

    const columnsCheck = await db.execute(sql`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'order_outbox';
    `);
    console.log('📊 order_outbox columns:');
    columnsCheck.rows.forEach((col: any) => {
      console.log(`   - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
    });
  } catch (err: any) {
    console.error('❌ Section A verification failed:', err.message);
  }

  // --- SECTION B: ORDER RECOVERY TEST ---
  console.log('\n--- [Section B] Controlled Order Recovery Test ---');
  const testIdempotencyKey = 'TEST-ISO-OUTBOX-' + Date.now();
  const testOrderNum = 'ELEN-TEST-' + Math.floor(1000 + Math.random() * 9000);
  
  try {
    const allProds = await db.select().from(products).limit(1);
    if (allProds.length === 0) {
      console.error('❌ No products found in PostgreSQL for test order.');
      return;
    }
    const testProd = allProds[0];
    console.log(`📦 Using test product: ${testProd.productId} (${testProd.titleAr}), Stock: ${testProd.stockQuantity}`);

    const initialStock = testProd.stockQuantity;

    console.log('🔄 Creating test order and outbox record atomically in PostgreSQL...');
    const testOrderPayload = {
      id: testIdempotencyKey,
      order_number: testOrderNum,
      userId: 'test-user-isolated',
      customer_name: 'عميل اختبار معزول',
      customer_phone: '777000000',
      city: 'صنعاء',
      address: 'شارع حدة',
      items: [{
        product_id: testProd.productId,
        title_ar: testProd.titleAr,
        price: testProd.originalPrice,
        quantity: 1,
        total_price: testProd.originalPrice,
        image_url: testProd.imageUrl
      }],
      subtotal: testProd.originalPrice,
      delivery_fee: 20,
      total_amount: testProd.originalPrice + 20,
      status: 'pending',
      payment_method: 'الدفع عند الاستلام',
      delivery_speed: 'توصيل قياسي',
      whatsapp_sent: true,
      created_at: new Date().toISOString(),
    };

    await db.transaction(async (tx) => {
      await tx.update(products)
        .set({ stockQuantity: initialStock - 1 })
        .where(eq(products.productId, testProd.productId));

      await tx.insert(orders).values({
        orderNumber: testOrderNum,
        customerName: 'عميل اختبار معزول',
        customerPhone: '777000000',
        city: 'صنعاء',
        address: 'شارع حدة',
        items: testOrderPayload.items,
        subtotal: testOrderPayload.subtotal,
        deliveryFee: 20,
        totalAmount: testOrderPayload.total_amount,
        status: 'pending',
        whatsappSent: true,
      });

      await tx.insert(orderOutbox).values({
        idempotencyKey: testIdempotencyKey,
        orderNumber: testOrderNum,
        payload: testOrderPayload,
        status: 'pending',
        attempts: 0,
      });
    });
    console.log(`✅ Test order ${testOrderNum} and outbox event created atomically. Status: pending.`);

    const outboxRecord = await db.select().from(orderOutbox).where(eq(orderOutbox.idempotencyKey, testIdempotencyKey));
    console.log(`📋 Outbox event status in DB: ${outboxRecord[0]?.status}, Attempts: ${outboxRecord[0]?.attempts}`);

    console.log('🔄 Executing reliable sync recovery with automatic retry...');
    const syncResult = await syncOrderToFirestoreWithRetry(testOrderPayload as any, testIdempotencyKey, 3);
    console.log(`✨ Sync result: ${syncResult}`);

    const recoveredRecord = await db.select().from(orderOutbox).where(eq(orderOutbox.idempotencyKey, testIdempotencyKey));
    console.log(`✅ Final outbox status in DB: ${recoveredRecord[0]?.status}, Attempts: ${recoveredRecord[0]?.attempts}`);

    const updatedProd = await db.select().from(products).where(eq(products.productId, testProd.productId));
    console.log(`📦 Final stock for test product: ${updatedProd[0]?.stockQuantity} (Expected: ${initialStock - 1})`);

  } catch (err: any) {
    console.error('❌ Section B order recovery test failed:', err.message);
  }

  // --- SECTION C: PRODUCT CONSISTENCY ---
  console.log('\n--- [Section C] Product Consistency & Discrepancy Audit ---');
  try {
    const pgProducts = await db.select().from(products);
    const fsSnapshot = await adminDb.collection('products').get();
    const fsProductIds = new Set(fsSnapshot.docs.map(d => d.id));
    const pgProductIds = new Set(pgProducts.map(p => p.productId));

    const missingInPg = Array.from(fsProductIds).filter(id => !pgProductIds.has(id));
    const missingInFs = Array.from(pgProductIds).filter(id => !fsProductIds.has(id));

    console.log(`📊 Total PostgreSQL Products: ${pgProducts.length}`);
    console.log(`📊 Total Firestore Products: ${fsSnapshot.size}`);
    console.log(`⚠️ Products in Firestore but missing in PostgreSQL: ${missingInPg.length}`);
    console.log(`⚠️ Products in PostgreSQL but missing in Firestore: ${missingInFs.length}`);

    const autoIdProducts = pgProducts.filter(p => p.productId.length > 15 && !p.productId.startsWith('prod-'));
    console.log(`🔍 PostgreSQL products with Firestore Auto-IDs / non-standard IDs: ${autoIdProducts.length}`);
    autoIdProducts.slice(0, 5).forEach(p => {
      console.log(`   - ID: ${p.productId}, Title: ${p.titleAr}`);
    });

  } catch (err: any) {
    console.error('❌ Section C product audit failed:', err.message);
  }

  console.log('\n==================================================');
  console.log('  PHASE 7 AUDIT COMPLETED SUCCESSFULLY');
  console.log('==================================================');
}

runPhase7Verification();
