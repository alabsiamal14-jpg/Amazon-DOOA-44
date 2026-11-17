import { db } from '../src/db/index.ts';
import { products, orders } from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';
import { processServerCheckout } from '../src/services/orderProcessor.ts';
import { getProductPricing } from '../src/lib/pricing.ts';
import { buildConfirmedOrderWhatsAppMessage, formatPhoneNumber } from '../src/lib/whatsapp.ts';
import { StoreSettings, Order } from '../src/types.ts';

const testSettings: StoreSettings = {
  storeName: 'أمازون دعاء',
  tagline: 'جمالكِ باهتمامنا',
  whatsappNumber: '967777627595',
  currency: 'ريال',
  deliveryFee: 20,
  freeDeliveryThreshold: 500,
  welcomeMessage: 'أهلاً بكِ في متجرنا',
};

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(msg);
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('🔒 AMAZON DUAA: COMPREHENSIVE SECURITY & TRANSACTION AUDIT SUITE');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  async function test(name: string, fn: () => Promise<void>) {
    totalTests++;
    try {
      await fn();
      passedTests++;
      console.log(`✅ [PASS] ${name}`);
    } catch (err: any) {
      console.error(`❌ [FAIL] ${name}:`, err.message);
      process.exitCode = 1;
    }
  }

  // --- SETUP: Ensure a clean dedicated test product in Cloud SQL ---
  const TEST_PROD_ID = 'test-security-serum-audit';
  await db
    .insert(products)
    .values({
      productId: TEST_PROD_ID,
      titleAr: 'سيروم الاختبار الأمني المركز',
      descriptionAr: 'منتج مخصص لاختبارات الأمان والمعاملات الذرية',
      originalPrice: 150,
      discountPrice: 100, // 33% discount -> final price: 100
      stockQuantity: 1,   // Only 1 item in stock to test race conditions
      categoryId: 'skincare',
      categoryName: 'عناية بالبشرة',
      imageUrl: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be',
    })
    .onConflictDoUpdate({
      target: products.productId,
      set: {
        originalPrice: 150,
        discountPrice: 100,
        stockQuantity: 1,
      },
    });

  // TEST 1: Price Tampering Prevention (Server ignores browser pricing)
  await test('1. منع التلاعب بالأسعار: الخادم يتجاهل أسعار المتصفح ويعتمد الكتالوج الرسمي', async () => {
    // Reset stock to 5
    await db.update(products).set({ stockQuantity: 5 }).where(eq(products.productId, TEST_PROD_ID));

    const key = `audit-tamper-${Date.now()}`;
    const result = await processServerCheckout({
      idempotencyKey: key,
      orderNumber: `ORD-TAMPER-${Date.now()}`,
      customerName: 'عميل اختبار الأمان',
      customerPhone: '0501234567',
      city: 'الرياض',
      address: 'شارع التحلية',
      items: [
        {
          product_id: TEST_PROD_ID,
          quantity: 2,
          // Malicious client might try to pass price = 5 or total = 10, but interface only takes product_id and quantity!
        },
      ],
    });

    assert(result.success === true, 'يجب أن ينجح الطلب');
    // Official catalog price is 100 (discount from 150). Qty: 2. Subtotal: 200. Delivery: 20. Total: 220.
    assert(result.order.subtotal === 200, `المجموع الفرعي يجب أن يكون 200 ولكن وُجد ${result.order.subtotal}`);
    assert(result.order.delivery_fee === 20, `رسوم التوصيل يجب أن تكون 20 ولكن وُجد ${result.order.delivery_fee}`);
    assert(result.order.total_amount === 220, `الإجمالي يجب أن يكون 220 ولكن وُجد ${result.order.total_amount}`);
  });

  // TEST 2: Out of Stock Prevention
  await test('2. منع البيع عند نفاد المخزون: رفض الطلب عند تجاوز الكمية المتوفرة', async () => {
    // Set stock to 2
    await db.update(products).set({ stockQuantity: 2 }).where(eq(products.productId, TEST_PROD_ID));

    const key = `audit-outofstock-${Date.now()}`;
    let threw = false;
    try {
      await processServerCheckout({
        idempotencyKey: key,
        orderNumber: `ORD-OOS-${Date.now()}`,
        customerName: 'عميل الكميات',
        customerPhone: '0501234567',
        city: 'الرياض',
        address: 'حي النرجس',
        items: [{ product_id: TEST_PROD_ID, quantity: 5 }], // Requesting 5 when only 2 available
      });
    } catch (err: any) {
      threw = true;
      assert(err.message.includes('نفد من المخزون') || err.message.includes('غير متوفرة'), 'رسالة الخطأ يجب أن توضح عدم كفاية المخزون');
    }
    assert(threw, 'كان يجب أن يفشل الطلب بسبب عدم كفاية المخزون');

    // Verify stock was NOT decremented
    const p = await db.select().from(products).where(eq(products.productId, TEST_PROD_ID));
    assert(p[0].stockQuantity === 2, 'المخزون يجب ألا يتغير عند فشل الطلب');
  });

  // TEST 3: Concurrency Race Condition Test (Point 5)
  await test('3. اختبار المعاملات الذرية والطلبات المتزامنة لشراء آخر قطعة (Pessimistic Row Lock)', async () => {
    // Exactly 1 item in stock!
    await db.update(products).set({ stockQuantity: 1 }).where(eq(products.productId, TEST_PROD_ID));

    const req1 = {
      idempotencyKey: `audit-race-1-${Date.now()}`,
      orderNumber: `ORD-RACE-1-${Date.now()}`,
      customerName: 'المشتري الأول (متزامن)',
      customerPhone: '0501111111',
      city: 'الرياض',
      address: 'العليا',
      items: [{ product_id: TEST_PROD_ID, quantity: 1 }],
    };

    const req2 = {
      idempotencyKey: `audit-race-2-${Date.now()}`,
      orderNumber: `ORD-RACE-2-${Date.now()}`,
      customerName: 'المشتري الثاني (متزامن)',
      customerPhone: '0502222222',
      city: 'جدة',
      address: 'الروضة',
      items: [{ product_id: TEST_PROD_ID, quantity: 1 }],
    };

    // Fire both requests concurrently in parallel!
    const results = await Promise.allSettled([
      processServerCheckout(req1),
      processServerCheckout(req2),
    ]);

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    assert(successes.length === 1, `طلب واحد فقط يجب أن ينجح من أصل 2، ولكن نجح ${successes.length}`);
    assert(failures.length === 1, `طلب واحد يجب أن يفشل بسبب نفاد المخزون، ولكن فشل ${failures.length}`);

    // Verify stock is exactly 0 and never became negative!
    const finalProd = await db.select().from(products).where(eq(products.productId, TEST_PROD_ID));
    assert(finalProd[0].stockQuantity === 0, `المخزون المتبقي يجب أن يكون 0 تماماً، ولكن وُجد ${finalProd[0].stockQuantity}`);
  });

  // TEST 4: Idempotency (Point 6)
  await test('4. اختبار Idempotency: إعادة إرسال الطلب نفسه لا تنشئ طلبين ولا تخصم المخزون مرتين', async () => {
    // Set stock to 10
    await db.update(products).set({ stockQuantity: 10 }).where(eq(products.productId, TEST_PROD_ID));

    const sameOrderNum = `ORD-IDEMP-${Date.now()}`;
    const req = {
      idempotencyKey: sameOrderNum,
      orderNumber: sameOrderNum,
      customerName: 'عميل التكرار',
      customerPhone: '0503333333',
      city: 'الدمام',
      address: 'الشاطئ',
      items: [{ product_id: TEST_PROD_ID, quantity: 2 }],
    };

    // First attempt
    const res1 = await processServerCheckout(req);
    assert(res1.success === true && res1.isDuplicate === false, 'المحاولة الأولى يجب أن تنجح كطلب جديد');

    // Stock after first attempt should be 8
    const check1 = await db.select().from(products).where(eq(products.productId, TEST_PROD_ID));
    assert(check1[0].stockQuantity === 8, `المخزون بعد المحاولة الأولى يجب أن يكون 8`);

    // Second attempt (exact same order number / idempotency key)
    const res2 = await processServerCheckout(req);
    assert(res2.success === true && res2.isDuplicate === true, 'المحاولة الثانية يجب أن تعود كطلب مكرر معتمد');
    assert(res2.order.order_number === sameOrderNum, 'رقم الطلب المرتجع يجب أن يطابق الطلب الأصلي');

    // Stock after second attempt MUST still be 8 (NOT decremented again to 6)!
    const check2 = await db.select().from(products).where(eq(products.productId, TEST_PROD_ID));
    assert(check2[0].stockQuantity === 8, `المخزون بعد محاولة التكرار يجب أن يظل 8 دون خصم إضافي، ووُجد ${check2[0].stockQuantity}`);
  });

  // TEST 5: Atomic Transaction Rollback on Failure (Point 7)
  await test('5. الاتساق والذرية: فشل أي جزء من العملية يؤدي لتراجع كامل (Rollback) دون حالة جزئية', async () => {
    // Reset stock to 10
    await db.update(products).set({ stockQuantity: 10 }).where(eq(products.productId, TEST_PROD_ID));

    let threw = false;
    try {
      await processServerCheckout({
        idempotencyKey: `audit-rollback-${Date.now()}`,
        orderNumber: `ORD-ROLLBACK-${Date.now()}`,
        customerName: 'عميل التراجع',
        customerPhone: '0504444444',
        city: 'الرياض',
        address: 'حي الياسمين',
        items: [
          { product_id: TEST_PROD_ID, quantity: 2 }, // Valid item
          { product_id: 'non-existent-product-id-999', quantity: 1 }, // Invalid non-existent item
        ],
      });
    } catch (err: any) {
      threw = true;
    }

    assert(threw, 'المعاملة كان يجب أن تفشل لوجود منتج غير صالح');

    // Crucial check: stock for TEST_PROD_ID must NOT have been decremented!
    const check = await db.select().from(products).where(eq(products.productId, TEST_PROD_ID));
    assert(check[0].stockQuantity === 10, `المخزون يجب أن يظل 10 بفعل الـ Rollback التلقائي، ووُجد ${check[0].stockQuantity}`);
  });

  // TEST 6: Immutable Historical Snapshot (Point 8)
  await test('6. تجميد لقطة تاريخية غير قابلة للتعديل لأسعار وبيانات المنتجات عند الطلب', async () => {
    // Reset stock to 10 and originalPrice to 150, discount to 100
    await db
      .update(products)
      .set({ originalPrice: 150, discountPrice: 100, stockQuantity: 10 })
      .where(eq(products.productId, TEST_PROD_ID));

    const snapOrderNum = `ORD-SNAP-${Date.now()}`;
    const snapResult = await processServerCheckout({
      idempotencyKey: snapOrderNum,
      orderNumber: snapOrderNum,
      customerName: 'عميل اللقطة التاريخية',
      customerPhone: '0505555555',
      city: 'الرياض',
      address: 'حي حطين',
      items: [{ product_id: TEST_PROD_ID, quantity: 1 }],
    });

    const frozenItem = snapResult.order.items[0] as any;
    assert(frozenItem.original_price === 150, 'السعر الأصلي المحفوظ في اللقطة يجب أن يكون 150');
    assert(frozenItem.discount_price === 100, 'سعر الخصم المحفوظ في اللقطة يجب أن يكون 100');
    assert(frozenItem.price === 100, 'سعر البيع المعتمد يجب أن يكون 100');

    // Now simulate an admin modifying the catalog price tomorrow to 300!
    await db
      .update(products)
      .set({ originalPrice: 300, discountPrice: 250 })
      .where(eq(products.productId, TEST_PROD_ID));

    // Re-query the historical order from DB
    const savedOrder = await db.select().from(orders).where(eq(orders.orderNumber, snapOrderNum));
    const savedItems = savedOrder[0].items as any[];
    assert(savedItems[0].price === 100, 'سعر الطلب القديم يجب ألا يتأثر بتغيير سعر المنتج اللاحق');
    assert(savedOrder[0].totalAmount === 120, 'إجمالي الطلب القديم يجب أن يظل 120 (100 + 20 توصيل)');
  });

  // TEST 7: WhatsApp Message Compliance & Security Disclaimer (Point 9)
  await test('7. تطابق رسالة WhatsApp مع الطلب المعتمد ووجود الإشعار الأمني', async () => {
    const mockOrder: Order = {
      id: 'ord-test-wa',
      order_number: 'ELEN-9988',
      customer_name: 'سارة العتيبي',
      customer_phone: '0555555555',
      city: 'الرياض',
      address: 'حي الملقا',
      items: [
        {
          product_id: 'prod-1',
          title_ar: 'سيروم حمض الهيالورونيك',
          price: 95,
          quantity: 2,
        },
      ],
      subtotal: 190,
      discount_amount: 19,
      delivery_fee: 20,
      total_amount: 191,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    const waMsg = buildConfirmedOrderWhatsAppMessage(mockOrder, testSettings);
    assert(waMsg.includes('#ELEN-9988'), 'رسالة الواتساب يجب أن تحتوي رقم الطلب المعتمد');
    assert(waMsg.includes('191 ريال'), 'رسالة الواتساب يجب أن تحتوي الإجمالي المعتمد المطابق لقاعدة البيانات');
    assert(waMsg.includes('إشعار أمني'), 'رسالة الواتساب يجب أن تحتوي الإشعار الأمني بأن الرسالة ليست إيصال دفع');
    assert(waMsg.includes('سارة العتيبي'), 'اسم العميل يجب أن يظهر في الرسالة');
  });

  // Clean up test product
  await db.delete(products).where(eq(products.productId, TEST_PROD_ID));

  console.log('\n================================================================');
  console.log(`🎉 AUDIT SUITE FINISHED: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('================================================================\n');
}

runTestSuite().catch((e) => {
  console.error('Fatal audit failure:', e);
  process.exit(1);
});
