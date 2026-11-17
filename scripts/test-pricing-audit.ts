import {
  getProductPricing,
  getEffectivePrice,
  calculateDiscountPriceFromPercent,
  calculatePercentFromDiscountPrice,
  verifyOrderItemsAgainstCatalog,
} from '../src/lib/pricing';
import { Product, StoreSettings } from '../src/types';

const defaultSettings: StoreSettings = {
  storeName: 'أمازون دعاء',
  tagline: 'جمالكِ باهتمامنا',
  whatsappNumber: '967777627595',
  currency: 'ريال',
  deliveryFee: 20,
  freeDeliveryThreshold: 500,
  welcomeMessage: 'أهلاً بكِ في متجرنا',
};

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
  } catch (err: any) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
    process.exitCode = 1;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

console.log('====================================================');
console.log('🧪 AMAZON DUAA: PRICING & DISCOUNT TECHNICAL AUDIT');
console.log('====================================================\n');

// 1. Discount 0% & Equal Price
runTest('حالة الخصم 0% أو السعر المخفض المساوي للسعر الأصلي', () => {
  const p1 = getProductPricing({ original_price: 100, discount_price: 100 });
  assert(!p1.hasDiscount, 'يجب ألا يعتبر الخصم فعالاً إذا كان مساوياً للسعر الأصلي');
  assert(p1.finalPrice === 100, 'السعر النهائي يجب أن يساوي السعر الأصلي (100)');
  assert(p1.discountPrice === null, 'سعر الخصم يجب أن يعود null');
  assert(p1.savingsAmount === 0, 'مقدار التوفير يجب أن يكون 0');

  const p0 = getProductPricing({ original_price: 100, discount_price: null });
  assert(!p0.hasDiscount, 'الخصم غير مفعل عند null');
  assert(p0.finalPrice === 100, 'السعر النهائي 100');
});

// 2. Discount 5%
runTest('حالة الخصم 5% والتقريب الصحيح', () => {
  const discPrice = calculateDiscountPriceFromPercent(100, 5);
  assert(discPrice === 95, `السعر المخفض لخصم 5% من 100 يجب أن يكون 95 ولكن وُجد ${discPrice}`);
  const pricing = getProductPricing({ original_price: 100, discount_price: discPrice });
  assert(pricing.hasDiscount, 'الخصم يجب أن يكون فعالاً');
  assert(pricing.finalPrice === 95, 'السعر النهائي 95');
  assert(pricing.savingsAmount === 5, 'مقدار التوفير 5');
  assert(pricing.discountPercent === 5, 'نسبة الخصم 5%');
});

// 3. Discount 20%
runTest('حالة الخصم 20% والتقريب الصحيح', () => {
  const discPrice = calculateDiscountPriceFromPercent(150, 20);
  assert(discPrice === 120, `السعر المخفض لخصم 20% من 150 يجب أن يكون 120 ولكن وُجد ${discPrice}`);
  const pricing = getProductPricing({ original_price: 150, discount_price: discPrice });
  assert(pricing.hasDiscount, 'الخصم فعال');
  assert(pricing.finalPrice === 120, 'السعر النهائي 120');
  assert(pricing.savingsAmount === 30, 'مقدار التوفير 30');
  assert(pricing.discountPercent === 20, 'نسبة الخصم 20%');
});

// 4. Discount 50%
runTest('حالة الخصم 50% والتقريب الصحيح', () => {
  const discPrice = calculateDiscountPriceFromPercent(240, 50);
  assert(discPrice === 120, `السعر المخفض لخصم 50% من 240 يجب أن يكون 120 ولكن وُجد ${discPrice}`);
  const pricing = getProductPricing({ original_price: 240, discount_price: discPrice });
  assert(pricing.hasDiscount, 'الخصم فعال');
  assert(pricing.finalPrice === 120, 'السعر النهائي 120');
  assert(pricing.savingsAmount === 120, 'مقدار التوفير 120');
  assert(pricing.discountPercent === 50, 'نسبة الخصم 50%');
});

// 5. Discount 90%
runTest('حالة الخصم 90% والتقريب الصحيح', () => {
  const discPrice = calculateDiscountPriceFromPercent(300, 90);
  assert(discPrice === 30, `السعر المخفض لخصم 90% من 300 يجب أن يكون 30 ولكن وُجد ${discPrice}`);
  const pricing = getProductPricing({ original_price: 300, discount_price: discPrice });
  assert(pricing.hasDiscount, 'الخصم فعال');
  assert(pricing.finalPrice === 30, 'السعر النهائي 30');
  assert(pricing.savingsAmount === 270, 'مقدار التوفير 270');
  assert(pricing.discountPercent === 90, 'نسبة الخصم 90%');
});

// 6. Invalid and Negative Input Hardening
runTest('منع وتطهير الأسعار السالبة والمدخلات غير الصالحة', () => {
  // Negative original price
  const pNeg = getProductPricing({ original_price: -50, discount_price: 20 });
  assert(pNeg.finalPrice === 0, 'السعر الأصلي السالب يجب تطهيره إلى 0');
  assert(!pNeg.hasDiscount, 'لا يوجد خصم على سعر أصلي غير صالح');

  // Negative discount price
  const pNegDisc = getProductPricing({ original_price: 100, discount_price: -25 });
  assert(!pNegDisc.hasDiscount, 'سعر الخصم السالب يجب رفضه');
  assert(pNegDisc.finalPrice === 100, 'السعر يجب أن يعود للأصلي 100');

  // Zero discount price
  const pZeroDisc = getProductPricing({ original_price: 100, discount_price: 0 });
  assert(!pZeroDisc.hasDiscount, 'سعر الخصم صفر يجب تجاهله والعودة للأصلي');
  assert(pZeroDisc.finalPrice === 100, 'السعر يعود للأصلي 100');

  // Discount price greater than original price
  const pGreater = getProductPricing({ original_price: 100, discount_price: 150 });
  assert(!pGreater.hasDiscount, 'الخصم الأكبر من السعر الأصلي مرفوض');
  assert(pGreater.finalPrice === 100, 'السعر يعود للأصلي 100');
});

// 7. Cancel Discount Independence Test
runTest('استقلالية السعر الأصلي وعدم فقدانه عند إلغاء الخصم', () => {
  const product: Product = {
    id: 'prod-test-1',
    title_ar: 'سيروم الهيالورونيك',
    description_ar: 'ترطيب عميق',
    original_price: 180,
    discount_price: 140,
    stock_quantity: 15,
    category_id: 'skincare',
    category_name: 'عناية بالبشرة',
    tags: ['سيروم', 'ترطيب'],
    image_url: 'https://example.com/serum.jpg',
    ai_generated: false,
    created_at: new Date().toISOString(),
  };

  // 1. Initial promo state
  const promo = getProductPricing(product);
  assert(promo.finalPrice === 140, 'السعر أثناء الخصم 140');
  assert(promo.originalPrice === 180, 'السعر الأصلي محفوظ 180');

  // 2. Cancel discount
  const revertedProduct = {
    ...product,
    discount_price: null,
  };
  const reverted = getProductPricing(revertedProduct);
  assert(!reverted.hasDiscount, 'تم إلغاء الخصم بنجاح');
  assert(reverted.originalPrice === 180, 'السعر الأصلي لم يُفقد وما زال 180');
  assert(reverted.finalPrice === 180, 'السعر المعروض عاد فورياً إلى 180');
});

// 8. Order Item & Catalog Price Verification (Anti-Tampering)
runTest('إعادة التحقق من الأسعار والخصم والمخزون عند إتمام الطلب (Anti-Tampering)', () => {
  const mockCatalog: Product[] = [
    {
      id: 'prod-1',
      title_ar: 'كريم الليل',
      description_ar: 'ترميم للبشرة',
      original_price: 200,
      discount_price: 160, // official current price: 160
      stock_quantity: 5,
      category_id: 'skincare',
      category_name: 'عناية',
      tags: [],
      image_url: '',
      ai_generated: false,
      created_at: '',
    },
    {
      id: 'prod-2',
      title_ar: 'غسول رغوي',
      description_ar: 'تنظيف عميق',
      original_price: 80,
      discount_price: null, // official current price: 80
      stock_quantity: 0, // Out of stock!
      category_id: 'skincare',
      category_name: 'عناية',
      tags: [],
      image_url: '',
      ai_generated: false,
      created_at: '',
    },
  ];

  // Test 8a: Tampered client price detected and corrected
  const tamperedCart = [
    { product_id: 'prod-1', quantity: 2, price: 10 }, // Maliciously altered to 10
  ];
  const res1 = verifyOrderItemsAgainstCatalog(tamperedCart, mockCatalog, defaultSettings);
  assert(res1.isValid, 'الطلب صالح بعد تصحيح السعر');
  assert(res1.priceAdjusted, 'يجب رصد تعديل السعر غير المطابق');
  assert(res1.verifiedItems[0].price === 160, 'يجب فرض السعر الموثوق 160 بدلاً من 10');
  assert(res1.subtotal === 320, 'المجموع الفرعي الصحيح 2 * 160 = 320');

  // Test 8b: Out of stock product rejected
  const oosCart = [
    { product_id: 'prod-2', quantity: 1, price: 80 },
  ];
  const res2 = verifyOrderItemsAgainstCatalog(oosCart, mockCatalog, defaultSettings);
  assert(!res2.isValid, 'يجب رفض الطلب إذا كان المنتج نافداً من المخزون');
  assert(res2.errors.length > 0, 'يجب إرجاع رسالة خطأ واضحة باللغة العربية');

  // Test 8c: Requested quantity exceeds stock
  const overQtyCart = [
    { product_id: 'prod-1', quantity: 10, price: 160 }, // stock is only 5
  ];
  const res3 = verifyOrderItemsAgainstCatalog(overQtyCart, mockCatalog, defaultSettings);
  assert(!res3.isValid, 'يجب رفض الطلب إذا تجاوزت الكمية المخزون المتوفر');
});

console.log('\n✨ ALL AUDIT AND PRACTICAL TESTS COMPLETED SUCCESSFULLY!\n');
