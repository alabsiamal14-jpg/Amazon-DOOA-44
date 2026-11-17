import { CartItem, CustomerOrderInfo, StoreSettings, Order } from '../types';
import { getProductPricing } from './pricing';

export function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('05') && cleaned.length === 10) {
    cleaned = '966' + cleaned.substring(1);
  } else if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2);
  }
  return cleaned || '966500000000';
}

export function buildWhatsAppMessage(
  cartItems: CartItem[],
  settings: StoreSettings,
  customerInfo?: CustomerOrderInfo,
  discountAmount: number = 0,
  couponCode?: string,
  orderNumber?: string
): string {
  const currency = settings.currency || 'ريال';
  const subtotal = cartItems.reduce((acc, item) => {
    const price = getProductPricing(item.product).finalPrice;
    return acc + price * item.quantity;
  }, 0);

  const deliveryFee = subtotal >= settings.freeDeliveryThreshold ? 0 : settings.deliveryFee;
  const finalTotal = Math.max(0, subtotal - discountAmount + deliveryFee);

  const lines: string[] = [];

  lines.push(`🛍️ *طلب جديد من ${settings.storeName}*`);
  if (orderNumber) {
    lines.push(`🔖 *رقم الطلب: #${orderNumber}*`);
  }
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

  if (customerInfo && customerInfo.customerName) {
    lines.push(`👤 *بيانات العميل والتوصيل:*`);
    lines.push(`• الاسم: ${customerInfo.customerName}`);
    if (customerInfo.phone) lines.push(`• رقم الجوال: ${customerInfo.phone}`);
    if (customerInfo.city || customerInfo.address) {
      lines.push(`• العنوان: ${[customerInfo.city, customerInfo.address].filter(Boolean).join(' - ')}`);
    }
    if (customerInfo.notes) {
      lines.push(`• ملاحظات: ${customerInfo.notes}`);
    }
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  }

  lines.push(`📦 *المنتجات المطلوبة (${cartItems.reduce((s, i) => s + i.quantity, 0)} قطعة):*`);

  cartItems.forEach((item, index) => {
    const unitPrice = getProductPricing(item.product).finalPrice;
    const itemTotal = unitPrice * item.quantity;
    lines.push(
      `${index + 1}. *${item.product.title_ar}*\n` +
      `   الكمية: ${item.quantity} × ${unitPrice} ${currency} = ${itemTotal} ${currency}`
    );
  });

  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`💰 *ملخص الحساب:*`);
  lines.push(`• المجموع الفرعي: ${subtotal} ${currency}`);

  if (discountAmount > 0) {
    lines.push(`• الخصم ${couponCode ? `(كوبون: ${couponCode})` : ''}: -${discountAmount} ${currency}`);
  }

  if (deliveryFee === 0) {
    lines.push(`• التوصيل: مجاني (عرض الشحن المجاني) 🎉`);
  } else {
    lines.push(`• رسوم التوصيل: ${deliveryFee} ${currency}`);
  }

  lines.push(`\n✨ *الإجمالي النهائي: ${finalTotal} ${currency}*`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`يرجى تأكيد استلام الطلب وتزويدي برقم الحساب أو خيارات الدفع المتاحة. شكراً لكم! 🌸`);
  lines.push(`⚠️ *إشعار أمني:* هذه الرسالة للتنسيق وتأكيد تفاصيل الطلب مع المتجر، ولا تُعد وحدها إيصال دفع أو تأكيداً نهائياً للدفع حتى مراجعة الإدارة.`);

  return lines.join('\n');
}

/**
 * Builds an authoritative WhatsApp message directly from a verified Order document.
 * Guarantees exact price and items match with the server database.
 */
export function buildConfirmedOrderWhatsAppMessage(
  order: Order,
  settings: StoreSettings
): string {
  const currency = settings.currency || 'ريال';
  const lines: string[] = [];

  lines.push(`🛍️ *طلب معتمد من ${settings.storeName}*`);
  lines.push(`🔖 *رقم الطلب الرسمي: #${order.order_number}*`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

  lines.push(`👤 *بيانات العميل والتوصيل:*`);
  lines.push(`• الاسم: ${order.customer_name}`);
  lines.push(`• رقم الجوال: ${order.customer_phone}`);
  if (order.city || order.address) {
    lines.push(`• العنوان: ${[order.city, order.address].filter(Boolean).join(' - ')}`);
  }
  if (order.notes) {
    lines.push(`• ملاحظات: ${order.notes}`);
  }
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

  lines.push(`📦 *المنتجات المعتمدة (${order.items.reduce((s, i) => s + i.quantity, 0)} قطعة):*`);
  order.items.forEach((item, index) => {
    lines.push(
      `${index + 1}. *${item.title_ar}*\n` +
      `   الكمية: ${item.quantity} × ${item.price} ${currency} = ${item.quantity * item.price} ${currency}`
    );
  });

  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`💰 *ملخص الحساب المعتمد:*`);
  lines.push(`• المجموع الفرعي: ${order.subtotal} ${currency}`);
  if (order.discount_amount && order.discount_amount > 0) {
    lines.push(`• الخصم المعتمد: -${order.discount_amount} ${currency}`);
  }
  lines.push(`• رسوم التوصيل: ${order.delivery_fee} ${currency}`);
  lines.push(`\n✨ *الإجمالي النهائي المطلوب: ${order.total_amount} ${currency}*`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`يرجى تأكيد التوصيل واستلام الطلب. شكراً لتسوقكم من ${settings.storeName}! 🌸`);
  lines.push(`⚠️ *إشعار أمني:* هذه الرسالة للمطابقة والتنسيق، ولا تُعتبر وحدها إثبات دفع رسمي للعميل دون مراجعة الحساب.`);

  return lines.join('\n');
}

export function generateConfirmedOrderWhatsAppUrl(
  order: Order,
  settings: StoreSettings
): string {
  const phone = formatPhoneNumber(settings.whatsappNumber);
  const message = buildConfirmedOrderWhatsAppMessage(order, settings);
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function generateWhatsAppOrderUrl(
  cartItems: CartItem[],
  settings: StoreSettings,
  customerInfo?: CustomerOrderInfo,
  discountAmount: number = 0,
  couponCode?: string,
  orderNumber?: string
): string {
  const phone = formatPhoneNumber(settings.whatsappNumber);
  const message = buildWhatsAppMessage(cartItems, settings, customerInfo, discountAmount, couponCode, orderNumber);
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function generateSingleProductWhatsAppUrl(
  product: { title_ar: string; original_price: number; discount_price: number | null },
  settings: StoreSettings
): string {
  const phone = formatPhoneNumber(settings.whatsappNumber);
  const currency = settings.currency || 'ريال';
  const price = getProductPricing(product).finalPrice;

  const message = `
مرحباً، أود الاستفسار وطلب هذا المنتج من *${settings.storeName}*:
✨ *${product.title_ar}*
💰 السعر: ${price} ${currency}

هل المنتج متوفر حالياً للتوصيل؟
  `.trim();

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function generateOrderStatusWhatsAppUrl(order: Order, settings: StoreSettings): string {
  const phone = formatPhoneNumber(order.customer_phone);
  const statusArabic: Record<string, string> = {
    pending: 'قيد المراجعة والتدقيق',
    processing: 'جاري التجهيز والتغليف 🎁',
    shipped: 'تم الشحن وبانتظار وصول المندوب 🚚',
    delivered: 'تم التوصيل بنجاح، شكراً لاختياركم لنا 🌸',
    cancelled: 'تم إلغاء الطلب',
  };

  const message = `
مرحباً ${order.customer_name} 🌸
تحديث بخصوص طلبك من *${settings.storeName}*:
🔖 رقم الطلب: #${order.order_number}
📌 الحالة الحالية: *${statusArabic[order.status] || order.status}*
💰 الإجمالي: ${order.total_amount} ${settings.currency}

إذا كان لديك أي استفسار، يسعدنا تواصلك معنا دائماً!
  `.trim();

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
