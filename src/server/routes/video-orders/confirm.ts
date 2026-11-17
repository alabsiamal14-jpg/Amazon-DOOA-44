import { Router, Response } from 'express';
import { doc, collection, getDocs, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase.ts';
import { adminDb } from '../../../lib/firebase-admin.ts';
import {
  fetchFirestoreCatalog,
  invalidateFirestoreCatalogCache,
  updateFirestoreProductStock,
} from '../../../lib/firestore-catalog.ts';
import { updateProductStockInDb } from '../../../db/products.ts';
import { createOrderInDb, getOrderByNumber } from '../../../db/orders.ts';
import { INITIAL_PRODUCTS, INITIAL_SETTINGS } from '../../../data/initialData.ts';
import { requireAuth, AuthRequest } from '../../../middleware/auth.ts';
import { MatchedVideoOrderItem } from '../../../types/videoOrder.ts';
import { OrderStatus, Product } from '../../../types.ts';
import { triggerOrderConfirmation } from '../../../lib/notifications.ts';
import { getProductPricing } from '../../../lib/pricing.ts';

const router = Router();

// Helper to normalize Arabic strings for high-fidelity matching
const normalizeArabic = (str: string): string => {
  if (!str) return '';
  return str
    .replace(/[\u064B-\u065F]/g, '') // remove diacritics (tashkeel)
    .replace(/[أإآا]/g, 'ا')        // normalize alefs
    .replace(/ة/g, 'ه')            // normalize teh marbuta
    .replace(/ى/g, 'ي')            // normalize alef maksura
    .replace(/\s+/g, ' ')          // collapse whitespaces
    .trim()
    .toLowerCase();
};

function computeVideoDeliveryFee(city: string): number {
  const normCity = normalizeArabic(city);
  if (normCity.includes('صنعاء')) return 10;
  if (normCity.includes('عدن') || normCity.includes('تعز')) return 25;
  return INITIAL_SETTINGS.deliveryFee;
}

function buildVideoWhatsAppUrl(orderNumber: string, customerName: string, customerPhone: string, city: string, address: string, notes: string, totalAmount: number) {
  const waNumber = INITIAL_SETTINGS.whatsappNumber || '967777627595';
  const waMessage = `السلام عليكم، تم تسجيل وتأكيد طلبي (رقم المرجع: ${orderNumber}) من خلال استوديو الفيديو الذكي بنجاح!\n\n` +
    `اسم العميل: ${customerName}\n` +
    `الهاتف: ${customerPhone}\n` +
    `العنوان: ${city} - ${address}\n` +
    (notes ? `الملاحظات: ${notes}\n` : '') +
    `المجموع النهائي المعتمد: ${totalAmount} ريال\n\n` +
    `⚠️ ملاحظة: هذه الرسالة هي لتأكيد وتنسيق تفاصيل الطلب وليست إيصال دفع رسمي.\n` +
    `شكراً لكم!`;
  return `https://api.whatsapp.com/send?phone=${waNumber}&text=${encodeURIComponent(waMessage)}`;
}

// Endpoint: POST /api/video-orders/confirm
router.post('/confirm', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ error: 'غير مصرح: لم يتم التعرف على معرف المستخدم.' });
    }

    const {
      customer_name,
      customer_phone,
      city,
      address,
      notes,
      items, // array of { product_name_raw: string, quantity: number, resolvedProductId?: string }
      idempotencyKey,
    } = req.body;

    if (!customer_name || !customer_phone || !city || !address || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'البيانات المرسلة غير مكتملة لتأكيد الطلب.' });
    }

    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      return res.status(400).json({ error: 'مفتاح التكرار (idempotencyKey) مطلوب لتأمين المعاملة.' });
    }

    console.info(`[Video Confirm] Processing confirmation for user ${userId}. IdempotencyKey: ${idempotencyKey}`);

    // --- IDEMPOTENCY CHECK ---
    let existingOrderData: any = null;
    try {
      const adminOrderSnap = await adminDb.collection('orders').doc(idempotencyKey).get();
      if (adminOrderSnap.exists) {
        existingOrderData = adminOrderSnap.data();
      }
    } catch {
      try {
        const orderDocRef = doc(db, 'orders', idempotencyKey);
        const existingOrderSnap = await getDoc(orderDocRef);
        if (existingOrderSnap.exists()) {
          existingOrderData = existingOrderSnap.data();
        }
      } catch {
        // Ignore rule-based permission errors when checking unauthenticated Client SDK
      }
    }

    if (!existingOrderData) {
      const memExisting = await getOrderByNumber(idempotencyKey);
      if (memExisting) {
        existingOrderData = {
          order_number: memExisting.orderNumber,
          customer_name: memExisting.customerName,
          customer_phone: memExisting.customerPhone,
          customer_city: memExisting.city,
          customer_address: memExisting.address,
          notes: memExisting.notes,
          total_amount: memExisting.totalAmount,
          status: memExisting.status,
        };
      }
    }

    if (existingOrderData) {
      const whatsappUrl = buildVideoWhatsAppUrl(
        existingOrderData.order_number,
        existingOrderData.customer_name,
        existingOrderData.customer_phone,
        existingOrderData.customer_city || city,
        existingOrderData.customer_address || address,
        existingOrderData.notes || '',
        existingOrderData.total_amount
      );
      return res.json({
        success: true,
        isDuplicate: true,
        orderId: idempotencyKey,
        order: {
          id: idempotencyKey,
          order_number: existingOrderData.order_number,
          total_amount: existingOrderData.total_amount,
          status: existingOrderData.status,
        },
        whatsappUrl,
      });
    }

    // Build unified product catalog (Firestore 208 products + missing INITIAL_PRODUCTS)
    const fsCatalog = await fetchFirestoreCatalog();
    const fsIds = new Set(fsCatalog.map((p) => p.id));
    const unifiedProducts: Product[] = [
      ...fsCatalog,
      ...INITIAL_PRODUCTS.filter((p) => !fsIds.has(p.id)),
    ];

    const resolveProducts = (): { resolvedItems: MatchedVideoOrderItem[]; subtotal: number; stockUpdates: { id: string; newStock: number }[] } => {
      const resolvedItems: MatchedVideoOrderItem[] = [];
      const stockUpdates: { id: string; newStock: number }[] = [];
      let subtotal = 0;

      for (const reqItem of items) {
        const rawName = reqItem.product_name_raw || '';
        const normRawName = normalizeArabic(rawName);
        const reqQty = Math.max(1, parseInt(reqItem.quantity) || 1);

        let matchedProduct: Product | undefined;
        if (reqItem.resolvedProductId) {
          matchedProduct = unifiedProducts.find((p) => p.id === reqItem.resolvedProductId);
        }

        if (!matchedProduct) {
          const candidates = unifiedProducts.filter((p) => {
            const normTitle = normalizeArabic(p.title_ar);
            return normTitle.includes(normRawName) || normRawName.includes(normTitle);
          });

          if (candidates.length === 0) {
            throw new Error(`ProductNotFound:${rawName}`);
          }
          if (candidates.length > 1) {
            const namesList = candidates.map((c) => c.title_ar).join(' | ');
            throw new Error(`ProductAmbiguous:${rawName}:${namesList}`);
          }
          matchedProduct = candidates[0];
        }

        const currentStock = Number(matchedProduct.stock_quantity ?? 0);
        if (currentStock < reqQty) {
          throw new Error(`OutOfStock:${matchedProduct.title_ar}:${currentStock}`);
        }

        const pricing = getProductPricing({
          original_price: Number(matchedProduct.original_price || 0),
          discount_price: matchedProduct.discount_price !== undefined && matchedProduct.discount_price !== null ? Number(matchedProduct.discount_price) : null,
        });
        const price = pricing.finalPrice;
        const itemSubtotal = price * reqQty;
        subtotal += itemSubtotal;

        stockUpdates.push({ id: matchedProduct.id, newStock: currentStock - reqQty });
        resolvedItems.push({
          productId: matchedProduct.id,
          productTitleAr: matchedProduct.title_ar,
          originalPrice: pricing.originalPrice,
          discountPrice: pricing.discountPrice,
          quantity: reqQty,
          price,
          subtotal: itemSubtotal,
          outOfStock: false,
        } as any);
      }

      return { resolvedItems, subtotal, stockUpdates };
    };

    const { resolvedItems, subtotal, stockUpdates } = resolveProducts();
    const delivery_fee = computeVideoDeliveryFee(city);
    const total_amount = subtotal + delivery_fee;
    const orderNumber = `VID-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

    const newOrderPayload: any = {
      id: idempotencyKey,
      order_number: orderNumber,
      userId,
      customer_name,
      customer_phone,
      customer_city: city,
      customer_address: address,
      items: resolvedItems.map((ri: any) => ({
        productId: ri.productId,
        product_id: ri.productId,
        title_ar: ri.productTitleAr,
        original_price: ri.originalPrice,
        discount_price: ri.discountPrice,
        quantity: ri.quantity,
        price: ri.price,
        total_price: ri.subtotal,
      })),
      subtotal,
      discount_amount: 0,
      delivery_fee,
      total_amount,
      currency: 'ريال',
      status: 'pending' as OrderStatus,
      payment_method: 'cod',
      notes: notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // --- PERSIST ATOMICALLY VIA ADMIN SDK OR SERVER DB FALLBACK ---
    let syncStatus: 'synced' | 'client_sync_required' = 'synced';
    try {
      await adminDb.runTransaction(async (transaction) => {
        const orderAdminRef = adminDb.collection('orders').doc(idempotencyKey);
        const existingSnap = await transaction.get(orderAdminRef);
        if (existingSnap.exists) return;

        for (const upd of stockUpdates) {
          const prodRef = adminDb.collection('products').doc(upd.id);
          const prodSnap = await transaction.get(prodRef);
          if (prodSnap.exists) {
            const liveData = prodSnap.data() || {};
            const liveStock = Number(liveData.stock_quantity ?? liveData.quantity ?? 0);
            const orderedItem = resolvedItems.find((r: any) => r.productId === upd.id);
            const qty = orderedItem ? orderedItem.quantity : 1;
            if (liveStock < qty) {
              throw new Error(`OutOfStock:${orderedItem?.productTitleAr || upd.id}:${liveStock}`);
            }
            transaction.update(prodRef, {
              stock_quantity: liveStock - qty,
              updatedAt: new Date().toISOString(),
            });
          }
        }
        transaction.set(orderAdminRef, newOrderPayload);
      });
      invalidateFirestoreCatalogCache();
    } catch (adminErr: any) {
      if (adminErr?.message?.startsWith('OutOfStock:')) {
        throw adminErr;
      }
      // Fallback when FIREBASE_SERVICE_ACCOUNT is absent in sandbox
      syncStatus = 'client_sync_required';
      for (const upd of stockUpdates) {
        await updateProductStockInDb(upd.id, upd.newStock);
        await updateFirestoreProductStock(upd.id, upd.newStock);
      }
    }

    await createOrderInDb({
      id: idempotencyKey,
      order_number: orderNumber,
      userId,
      customer_name,
      customer_phone,
      city,
      address,
      notes: notes || '',
      items: newOrderPayload.items,
      subtotal,
      discount_amount: 0,
      delivery_fee,
      total_amount,
      status: 'pending',
      payment_method: 'cod',
      whatsapp_sent: true,
      created_at: newOrderPayload.createdAt,
    });

    // --- CART CLEANUP (Admin SDK) ---
    try {
      const cartSnap = await adminDb.collection('users').doc(userId).collection('cart').get();
      await Promise.all(cartSnap.docs.map((d) => d.ref.delete()));
    } catch {
      // Client SDK fallback when running under browser auth or ignore in sandbox
      try {
        const cartCol = collection(db, 'users', userId, 'cart');
        const cartSnap = await getDocs(cartCol);
        for (const d of cartSnap.docs) {
          await deleteDoc(d.ref);
        }
      } catch {
        // Non-fatal
      }
    }

    triggerOrderConfirmation(
      {
        id: idempotencyKey,
        order_number: orderNumber,
        customer_name,
        customer_phone,
        city,
        address,
        items: newOrderPayload.items,
        subtotal,
        discount_amount: 0,
        delivery_fee,
        total_amount,
        status: 'pending',
        whatsapp_sent: true,
        created_at: newOrderPayload.createdAt,
      },
      INITIAL_SETTINGS
    ).catch((err) => {
      console.warn('[Notification Trigger] Failed to execute background trigger:', err.message);
    });

    const whatsappUrl = buildVideoWhatsAppUrl(orderNumber, customer_name, customer_phone, city, address, notes || '', total_amount);

    return res.json({
      success: true,
      syncStatus,
      orderId: idempotencyKey,
      order: {
        id: idempotencyKey,
        order_number: orderNumber,
        customer_name,
        customer_phone,
        city,
        address,
        items: newOrderPayload.items,
        subtotal,
        discount_amount: 0,
        delivery_fee,
        total_amount,
        status: 'pending',
        created_at: newOrderPayload.createdAt,
      },
      whatsappUrl,
    });

  } catch (error: any) {
    const message = error.message || '';
    console.error('[Video Confirm] Error during confirmation:', message);

    if (message.startsWith('ProductNotFound:')) {
      const rawName = message.split('ProductNotFound:')[1];
      return res.status(404).json({
        code: 'ProductNotFound',
        message: `تعذر مطابقة المنتج: "${rawName}" مع السجلات الرسمية. يرجى مراجعته وتعديله يدوياً.`,
        productNameRaw: rawName
      });
    }

    if (message.startsWith('ProductAmbiguous:')) {
      const parts = message.split('ProductAmbiguous:')[1].split(':');
      const rawName = parts[0];
      const candidates = parts[1];
      return res.status(409).json({
        code: 'ProductAmbiguous',
        message: `تم العثور على أكثر من مطابقة للمنتج: "${rawName}". يرجى اختيار المنتج الصحيح.`,
        productNameRaw: rawName,
        candidates: candidates.split(' | ')
      });
    }

    if (message.startsWith('OutOfStock:')) {
      const parts = message.split('OutOfStock:')[1].split(':');
      const title = parts[0];
      const stock = parts[1];
      return res.status(400).json({
        code: 'OutOfStock',
        message: `المنتج "${title}" غير متوفر بالكمية المطلوبة (الكمية المتاحة حالياً: ${stock} قطع).`
      });
    }

    return res.status(500).json({ error: error.message || 'فشل تأكيد الطلب.' });
  }
});

export default router;
