import React, { useState } from 'react';
import { X, Trash2, Plus, Minus, MessageCircle, ShoppingBag, Sparkles, Tag, Check, Copy, ArrowRight, CreditCard, MapPin, RefreshCw } from 'lucide-react';
import { CartItem, CustomerOrderInfo, StoreSettings, Order } from '../types';
import { buildWhatsAppMessage, generateWhatsAppOrderUrl } from '../lib/whatsapp';
import { CheckoutDeliveryMap } from './CheckoutDeliveryMap';
import { getProductPricing } from '../lib/pricing';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  onUpdateQuantity: (productId: string, delta: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  settings: StoreSettings;
  onOrderPlaced?: (order: Order) => void | Promise<any>;
  onOpenFullCheckout?: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cartItems,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  settings,
  onOrderPlaced,
  onOpenFullCheckout,
}) => {
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [appliedCouponCode, setAppliedCouponCode] = useState<string | undefined>(undefined);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponError, setCouponError] = useState('');

  const [customerInfo, setCustomerInfo] = useState<CustomerOrderInfo>({
    customerName: '',
    phone: '',
    city: '',
    address: '',
    notes: '',
  });

  const [copied, setCopied] = useState(false);
  const [showOrderDetailsForm, setShowOrderDetailsForm] = useState(true);
  const [showMap, setShowMap] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const totalItemsCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  const subtotal = cartItems.reduce((acc, item) => {
    const price = getProductPricing(item.product).finalPrice;
    return acc + price * item.quantity;
  }, 0);

  // Delivery calculation
  const freeThreshold = settings.freeDeliveryThreshold;
  const deliveryFee = subtotal >= freeThreshold || cartItems.length === 0 ? 0 : settings.deliveryFee;
  const remainingForFree = Math.max(0, freeThreshold - subtotal);
  const freeDeliveryProgress = Math.min(100, Math.round((subtotal / freeThreshold) * 100));

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    setCouponError('');
    const code = couponCode.trim().toUpperCase();

    if (code === 'BEAUTY10' || code === 'DUAA10') {
      const discount = Math.round(subtotal * 0.1);
      setCouponDiscount(discount);
      setAppliedCouponCode(code);
      setAppliedCoupon(`${code} (خصم 10%)`);
    } else if (code === 'AMAZON15') {
      const discount = Math.round(subtotal * 0.15);
      setCouponDiscount(discount);
      setAppliedCouponCode(code);
      setAppliedCoupon('AMAZON15 (خصم 15%)');
    } else if (code === 'BEAUTY20') {
      const discount = Math.round(subtotal * 0.2);
      setCouponDiscount(discount);
      setAppliedCouponCode(code);
      setAppliedCoupon('BEAUTY20 (خصم 20%)');
    } else if (code === 'WELCOME') {
      const discount = Math.min(20, subtotal);
      setCouponDiscount(discount);
      setAppliedCouponCode('WELCOME');
      setAppliedCoupon('WELCOME (خصم 20 ريال)');
    } else {
      setCouponError('رمز الكوبون غير صالح. جرب BEAUTY10 أو DUAA10 أو WELCOME');
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setAppliedCouponCode(undefined);
    setCouponDiscount(0);
    setCouponCode('');
  };

  const grandTotal = Math.max(0, subtotal - couponDiscount + deliveryFee);

  const handleWhatsAppCheckout = async () => {
    if (isSubmitting) return;

    // Generate order number
    const orderNum = 'ELEN-' + Math.floor(1000 + Math.random() * 9000);

    const newOrder: Order = {
      id: 'order-' + Date.now(),
      order_number: orderNum,
      customer_name: customerInfo.customerName || 'عميل المتجر',
      customer_phone: customerInfo.phone || settings.whatsappNumber,
      customer_email: customerInfo.email,
      city: customerInfo.city || 'الرياض',
      address: customerInfo.address || '',
      notes: customerInfo.notes,
      items: cartItems.map((ci) => ({
        product_id: ci.product.id,
        title_ar: ci.product.title_ar,
        price: getProductPricing(ci.product).finalPrice,
        quantity: ci.quantity,
        image_url: ci.product.image_url,
      })),
      subtotal,
      discount_amount: couponDiscount,
      coupon_code: appliedCouponCode,
      delivery_fee: deliveryFee,
      total_amount: grandTotal,
      status: 'pending',
      whatsapp_sent: true,
      created_at: new Date().toISOString(),
    };

    setIsSubmitting(true);
    try {
      if (onOrderPlaced) {
        await onOrderPlaced(newOrder);
      }

      const url = generateWhatsAppOrderUrl(
        cartItems,
        settings,
        customerInfo,
        couponDiscount,
        appliedCoupon || undefined,
        orderNum
      );
      try {
        window.open(url, '_blank');
      } catch (openErr) {
        console.warn('Iframe blocked window.open:', openErr);
      }
    } catch (err: any) {
      console.error('Order placement failed in cart:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyOrderText = () => {
    const text = buildWhatsAppMessage(
      cartItems,
      settings,
      customerInfo,
      couponDiscount,
      appliedCoupon || undefined
    );
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-stone-950/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-stone-200 flex items-center justify-between bg-stone-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-extrabold text-base sm:text-lg text-stone-900">سلة المشتريات</h2>
              <p className="text-xs text-stone-500">{totalItemsCount} منتج مختار</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {cartItems.length > 0 && (
              <button
                onClick={onClearCart}
                className="text-stone-400 hover:text-rose-600 p-2 text-xs font-semibold transition-colors flex items-center gap-1"
                title="تفريغ السلة"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">مسح</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-2xl bg-white hover:bg-stone-100 text-stone-700 flex items-center justify-center transition-colors border border-stone-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Free Delivery Banner */}
        {cartItems.length > 0 && (
          <div className="bg-rose-50/60 border-b border-rose-100 px-5 py-3">
            <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
              {remainingForFree > 0 ? (
                <span className="text-stone-700">
                  أضف بـ <strong className="text-rose-600">{remainingForFree} {settings.currency}</strong> إضافية للشحن المجاني! 🚚
                </span>
              ) : (
                <span className="text-emerald-700 font-bold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  مبروك! حصلت على شحن مجاني لكافة طلبك 🎉
                </span>
              )}
              <span className="text-stone-500 font-bold">{freeDeliveryProgress}%</span>
            </div>
            <div className="w-full bg-rose-200/60 h-2 rounded-full overflow-hidden">
              <div
                className="bg-rose-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${freeDeliveryProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 divide-y divide-stone-100">
          {cartItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <div className="w-20 h-20 rounded-full bg-rose-50 text-rose-400 flex items-center justify-center mb-4">
                <ShoppingBag className="w-10 h-10" />
              </div>
              <h3 className="font-bold text-stone-800 text-lg mb-1">سلتك فارغة حالياً</h3>
              <p className="text-xs text-stone-500 max-w-xs mb-6">
                استكشف مجموعتنا الفاخرة من منتجات العناية والتجميل والعطور وأضف منتجاتك المفضلة!
              </p>
              <button
                onClick={onClose}
                className="bg-stone-900 hover:bg-stone-800 text-white px-6 py-2.5 rounded-2xl text-xs font-bold transition-all shadow-md"
              >
                تصفح المنتجات الآن
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {cartItems.map((item) => {
                const pricing = getProductPricing(item.product);
                const unitPrice = pricing.finalPrice;
                const itemTotal = unitPrice * item.quantity;

                return (
                  <div key={item.product.id} className="pt-3 first:pt-0 flex gap-3 sm:gap-4">
                    <img
                      src={item.product.image_url || undefined}
                      alt={item.product.title_ar}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80';
                      }}
                      className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl object-cover bg-stone-100 shrink-0 border border-stone-200/60"
                    />

                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-bold text-stone-900 text-xs sm:text-sm line-clamp-2 leading-snug">
                            {item.product.title_ar}
                          </h4>
                          <button
                            onClick={() => onRemoveItem(item.product.id)}
                            className="text-stone-400 hover:text-rose-600 transition-colors p-1"
                            title="حذف"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <span className="text-[11px] text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md font-medium mt-1 inline-block">
                          {item.product.category_name}
                        </span>
                      </div>

                      <div className="flex items-center justify-between mt-2">
                        {/* Quantity Counter */}
                        <div className="flex items-center border border-stone-200 rounded-xl bg-stone-50 p-0.5">
                          <button
                            onClick={() => onUpdateQuantity(item.product.id, -1)}
                            className="w-7 h-7 rounded-lg bg-white hover:bg-stone-200 flex items-center justify-center text-stone-700 transition-colors shadow-2xs"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-8 text-center text-xs font-bold text-stone-800">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => onUpdateQuantity(item.product.id, 1)}
                            className="w-7 h-7 rounded-lg bg-white hover:bg-stone-200 flex items-center justify-center text-stone-700 transition-colors shadow-2xs"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Price */}
                        <div className="text-left font-black text-rose-600 text-sm">
                          {itemTotal} {settings.currency}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Coupon Accordion */}
              <div className="pt-4 border-t border-stone-200">
                {appliedCoupon ? (
                  <div className="flex items-center justify-between bg-emerald-50 text-emerald-800 p-3 rounded-2xl text-xs font-medium border border-emerald-200">
                    <span className="flex items-center gap-1.5 font-bold">
                      <Tag className="w-4 h-4 text-emerald-600" />
                      تم تطبيق: {appliedCoupon}
                    </span>
                    <button
                      onClick={handleRemoveCoupon}
                      className="text-stone-500 hover:text-rose-600 text-xs font-bold underline"
                    >
                      إلغاء
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleApplyCoupon} className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="كود الخصم (جرب BEAUTY10)"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)}
                        className="w-full text-xs bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 pr-8 focus:outline-hidden focus:border-rose-500 uppercase"
                      />
                      <Tag className="w-3.5 h-3.5 text-stone-400 absolute right-2.5 top-2.5" />
                    </div>
                    <button
                      type="submit"
                      className="bg-stone-800 hover:bg-stone-900 text-white text-xs px-4 py-2 rounded-xl font-bold transition-colors"
                    >
                      تطبيق
                    </button>
                  </form>
                )}
                {couponError && <p className="text-[11px] text-rose-600 mt-1">{couponError}</p>}
              </div>

              {/* Customer Info Form */}
              <div className="pt-3 border-t border-stone-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-stone-800">✍️ بيانات التوصيل المباشر:</span>
                  <span className="text-[11px] text-emerald-600 font-semibold">تُحفظ في طلبك تلقائياً</span>
                </div>

                <div className="space-y-2.5 p-3.5 bg-stone-50 rounded-2xl border border-stone-200 text-xs">
                  <div>
                    <label className="block text-stone-600 mb-1 font-semibold">الاسم الكريم *</label>
                    <input
                      type="text"
                      required
                      value={customerInfo.customerName}
                      onChange={(e) => setCustomerInfo({ ...customerInfo, customerName: e.target.value })}
                      placeholder="مثال: سارة العتيبي"
                      className="w-full p-2.5 bg-white border border-stone-200 rounded-xl focus:border-rose-500 focus:outline-hidden"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-stone-600 mb-1 font-semibold">المدينة *</label>
                      <input
                        type="text"
                        value={customerInfo.city}
                        onChange={(e) => setCustomerInfo({ ...customerInfo, city: e.target.value })}
                        placeholder="الرياض / جدة..."
                        className="w-full p-2.5 bg-white border border-stone-200 rounded-xl focus:border-rose-500 focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-stone-600 mb-1 font-semibold">رقم الجوال *</label>
                      <input
                        type="tel"
                        value={customerInfo.phone}
                        onChange={(e) => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                        placeholder="050xxxxxxx"
                        className="w-full p-2.5 bg-white border border-stone-200 rounded-xl focus:border-rose-500 focus:outline-hidden font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-stone-600 mb-1 font-semibold">البريد الإلكتروني (اختياري)</label>
                    <input
                      type="email"
                      value={customerInfo.email || ''}
                      onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                      placeholder="للحصول على تأكيد الطلب تلقائياً..."
                      className="w-full p-2.5 bg-white border border-stone-200 rounded-xl focus:border-rose-500 focus:outline-hidden text-left"
                    />
                  </div>
                  <div>
                    <label className="block text-stone-600 mb-1 font-semibold">الحي والشارع</label>
                    <input
                      type="text"
                      value={customerInfo.address}
                      onChange={(e) => setCustomerInfo({ ...customerInfo, address: e.target.value })}
                      placeholder="اسم الحي والشارع ورقم البناية"
                      className="w-full p-2.5 bg-white border border-stone-200 rounded-xl focus:border-rose-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowMap(!showMap)}
                      className="w-full py-2 px-3 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs flex items-center justify-center gap-1.5 border border-stone-200 rounded-xl transition-all cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5 text-rose-600" />
                      <span>{showMap ? 'إخفاء الخريطة الجغرافية' : 'تحديد موقع التوصيل بدقة على الخارطة (Google Maps)'}</span>
                    </button>
                    {showMap && (
                      <div className="mt-2 animate-in fade-in duration-300">
                        <CheckoutDeliveryMap
                          defaultCity={customerInfo.city || 'الرياض'}
                          onAddressSelected={(addr, city, lat, lng) => {
                            setCustomerInfo(prev => ({
                              ...prev,
                              address: addr,
                              city: city || prev.city,
                              notes: prev.notes ? `${prev.notes} (موقع الدبوس الجغرافي: ${lat.toFixed(5)}, ${lng.toFixed(5)})` : `(موقع الدبوس الجغرافي: ${lat.toFixed(5)}, ${lng.toFixed(5)})`
                            }));
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-stone-600 mb-1">ملاحظات إضافية (مثل: تغليف كهدية، وقت التسليم...)</label>
                    <textarea
                      rows={2}
                      value={customerInfo.notes}
                      onChange={(e) => setCustomerInfo({ ...customerInfo, notes: e.target.value })}
                      placeholder="اكتب أي تعليمات خاصة هنا..."
                      className="w-full p-2.5 bg-white border border-stone-200 rounded-xl focus:border-rose-500 focus:outline-hidden text-xs resize-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Drawer Footer & Checkout */}
        {cartItems.length > 0 && (
          <div className="p-4 sm:p-5 border-t border-stone-200 bg-stone-50 space-y-3">
            {/* Calculation rows */}
            <div className="space-y-1.5 text-xs text-stone-600">
              <div className="flex justify-between">
                <span>المجموع الفرعي:</span>
                <span className="font-semibold text-stone-800">{subtotal} {settings.currency}</span>
              </div>
              {couponDiscount > 0 && (
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>الخصم المطبق:</span>
                  <span>-{couponDiscount} {settings.currency}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>التوصيل:</span>
                <span className="font-semibold">
                  {deliveryFee === 0 ? (
                    <span className="text-emerald-600 font-bold">مجاني 🎉</span>
                  ) : (
                    <span>{deliveryFee} {settings.currency}</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between text-sm sm:text-base font-black text-stone-900 pt-2 border-t border-stone-200">
                <span>المجموع الكلي:</span>
                <span className="text-rose-600 font-black text-lg">
                  {grandTotal} {settings.currency}
                </span>
              </div>
            </div>

            {/* Action Buttons: Full Checkout and Instant WhatsApp */}
            <div className="space-y-2">
              {onOpenFullCheckout && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenFullCheckout();
                  }}
                  className="w-full bg-stone-900 hover:bg-stone-800 text-white py-3.5 px-4 rounded-2xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CreditCard className="w-4 h-4 text-rose-300" />
                  <span>متابعة الشراء والدفع الآمن ({grandTotal} {settings.currency})</span>
                </button>
              )}

              <button
                onClick={handleWhatsAppCheckout}
                disabled={isSubmitting}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm shadow-md hover:shadow-emerald-200 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 text-white animate-spin" />
                    <span>جاري التحقق من المخزون...</span>
                  </>
                ) : (
                  <>
                    <MessageCircle className="w-4 h-4 text-white" />
                    <span>إتمام الطلب المباشر الفوري عبر واتساب</span>
                  </>
                )}
              </button>
            </div>

            {/* Secondary actions: Copy text */}
            <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-stone-500">
              <button
                onClick={handleCopyOrderText}
                className="flex items-center gap-1 hover:text-stone-800 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-600 font-bold">تم نسخ نص الطلب!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>نسخ نص رسالة الطلب يدوياً</span>
                  </>
                )}
              </button>
              <span className="text-stone-400">واتساب: {settings.whatsappNumber}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
