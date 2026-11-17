import React, { useState, useEffect } from 'react';
import {
  X,
  Tag,
  Percent,
  Check,
  Sparkles,
  AlertCircle,
  TrendingDown,
  Eye,
  RefreshCw,
  Trash2,
  DollarSign,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react';
import { Product, StoreSettings } from '../types';
import {
  getProductPricing,
  calculateDiscountPriceFromPercent,
  calculatePercentFromDiscountPrice,
} from '../lib/pricing';

interface AdminPriceDiscountModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onSavePrice: (productId: string, originalPrice: number, discountPrice: number | null) => Promise<void> | void;
  settings: StoreSettings;
}

export const AdminPriceDiscountModal: React.FC<AdminPriceDiscountModalProps> = ({
  product,
  isOpen,
  onClose,
  onSavePrice,
  settings,
}) => {
  const [originalPrice, setOriginalPrice] = useState<number>(0);
  const [hasDiscount, setHasDiscount] = useState<boolean>(false);
  const [discountPrice, setDiscountPrice] = useState<number>(0);
  const [discountPercent, setDiscountPercent] = useState<number>(15);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Sync state whenever selected product changes or modal opens
  useEffect(() => {
    if (product) {
      const orig = Number(product.original_price) || 0;
      setOriginalPrice(orig);

      if (
        product.discount_price !== null &&
        product.discount_price !== undefined &&
        Number(product.discount_price) < orig &&
        Number(product.discount_price) > 0
      ) {
        setHasDiscount(true);
        const disc = Number(product.discount_price);
        setDiscountPrice(disc);
        const pct = calculatePercentFromDiscountPrice(orig, disc);
        setDiscountPercent(pct > 0 ? pct : 15);
      } else {
        setHasDiscount(false);
        // Default suggested discount: 15% off original
        const defaultDiscount = orig > 0 ? calculateDiscountPriceFromPercent(orig, 15) : 0;
        setDiscountPrice(defaultDiscount);
        setDiscountPercent(15);
      }
      setError('');
    }
  }, [product, isOpen]);

  if (!isOpen || !product) return null;

  // Handle original price change
  const handleOriginalPriceChange = (rawVal: number) => {
    const val = Math.max(0, Number.isFinite(rawVal) ? Math.round(rawVal * 100) / 100 : 0);
    setOriginalPrice(val);
    setError('');
    if (hasDiscount && val > 0) {
      const newDiscPrice = calculateDiscountPriceFromPercent(val, discountPercent);
      setDiscountPrice(newDiscPrice);
    }
  };

  // Handle discount percent change (via buttons or slider)
  const handlePercentChange = (pct: number) => {
    const safePct = Math.max(1, Math.min(90, Math.round(pct)));
    setDiscountPercent(safePct);
    setError('');
    if (originalPrice > 0) {
      const newDiscPrice = calculateDiscountPriceFromPercent(originalPrice, safePct);
      setDiscountPrice(newDiscPrice);
    }
  };

  // Handle direct discount price input
  const handleDiscountPriceChange = (rawVal: number) => {
    const val = Math.max(0, Number.isFinite(rawVal) ? Math.round(rawVal * 100) / 100 : 0);
    setDiscountPrice(val);
    setError('');
    if (originalPrice > 0 && val > 0) {
      if (val >= originalPrice) {
        setError('تنبيه: سعر الخصم يجب أن يكون أقل من السعر الأصلي لظهور الخصم.');
      } else {
        const calculatedPct = calculatePercentFromDiscountPrice(originalPrice, val);
        setDiscountPercent(calculatedPct);
      }
    }
  };

  // Quick preset percentages (including 5%, 20%, 50%, 90% as tested)
  const PRESET_PERCENTAGES = [5, 10, 15, 20, 25, 30, 40, 50, 70, 90];

  // Save changes
  const handleSave = async () => {
    if (!Number.isFinite(originalPrice) || originalPrice <= 0) {
      setError('يرجى إدخال سعر أصلي صالح أكبر من صفر.');
      return;
    }

    let finalDiscountPrice: number | null = null;
    if (hasDiscount) {
      if (!Number.isFinite(discountPrice) || discountPrice <= 0) {
        setError('يرجى تحديد سعر مخفض أكبر من صفر أو إيقاف تفعيل الخصم.');
        return;
      }
      if (discountPrice >= originalPrice) {
        setError('سعر الخصم يجب أن يكون أقل من السعر الأصلي لكي يظهر كعرض ترويجي. إذا كان الخصم 0% أو مساوياً للسعر الأصلي، يرجى إيقاف تفعيل الخصم.');
        return;
      }
      finalDiscountPrice = Math.round(discountPrice * 100) / 100;
    }

    try {
      setIsSaving(true);
      setError('');
      await onSavePrice(product.id, originalPrice, finalDiscountPrice);
      setIsSaving(false);
      onClose();
    } catch (e: any) {
      setIsSaving(false);
      setError(e?.message || 'حدث خطأ أثناء حفظ السعر الجديد في قاعدة البيانات، يرجى المحاولة ثانية.');
    }
  };

  // Quick remove discount
  const handleRemoveDiscount = async () => {
    try {
      setIsSaving(true);
      setError('');
      await onSavePrice(product.id, originalPrice, null);
      setHasDiscount(false);
      setIsSaving(false);
      onClose();
    } catch (e: any) {
      setIsSaving(false);
      setError(e?.message || 'حدث خطأ أثناء إزالة الخصم من قاعدة البيانات.');
    }
  };

  // Unified authoritative preview calculation
  const previewPricing = getProductPricing({
    original_price: originalPrice,
    discount_price: hasDiscount ? discountPrice : null,
  });

  const savingsAmount = hasDiscount && discountPrice < originalPrice ? originalPrice - discountPrice : 0;
  const currentCustomerPrice = hasDiscount && discountPrice > 0 ? discountPrice : originalPrice;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-sm animate-fadeIn">
      <div
        className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden border border-stone-200 flex flex-col max-h-[92vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-rose-600 via-rose-700 to-stone-900 text-white p-5 sm:p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20">
              <Tag className="w-5 h-5 text-rose-200" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black flex items-center gap-2">
                <span>تعديل السعر والخصم المباشر للزبائن</span>
              </h3>
              <p className="text-xs text-rose-100">
                التحكم بالأسعار والعروض الترويجية مع ظهورها فورياً في المتجر
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Container */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {/* Product Summary Header Card */}
          <div className="flex items-center gap-3.5 p-3.5 bg-stone-50 rounded-2xl border border-stone-200/80">
            <img
              src={product.image_url || undefined}
              alt={product.title_ar}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover border border-stone-200 shrink-0 bg-stone-100"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=400&q=80';
              }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="bg-rose-50 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-md">
                  {product.category_name}
                </span>
                <span className="text-[10px] text-stone-400">
                  كود المنتج: {product.id.slice(0, 10)}
                </span>
              </div>
              <h4 className="font-bold text-stone-900 text-sm truncate" title={product.title_ar}>
                {product.title_ar}
              </h4>
              <p className="text-xs text-stone-500 mt-0.5">
                المخزون الحالي: <span className="font-bold text-stone-800">{product.stock_quantity} قطعة</span>
              </p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Price Settings Form */}
          <div className="space-y-5">
            {/* 1. Original Price Input */}
            <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
              <label className="block text-xs font-bold text-stone-800 mb-1.5">
                السعر الأساسي / الأصلي ({settings.currency})
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  value={originalPrice || ''}
                  onChange={(e) => handleOriginalPriceChange(parseFloat(e.target.value) || 0)}
                  className="w-full text-base sm:text-lg font-black text-stone-900 px-4 py-2.5 bg-stone-50 border border-stone-300 rounded-xl focus:outline-hidden focus:border-rose-500 focus:bg-white transition-all pl-16"
                  placeholder="مثال: 120"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400 bg-stone-200/80 px-2.5 py-1 rounded-lg">
                  {settings.currency}
                </span>
              </div>
              <p className="text-[11px] text-stone-400 mt-1">
                هذا هو السعر القياسي للمنتج. في حال تفعيل الخصم، سيظهر هذا السعر مشطوباً للزبائن.
              </p>
            </div>

            {/* 2. Discount Toggle Switch */}
            <div className="bg-gradient-to-r from-rose-50/70 to-pink-50/50 p-4 rounded-2xl border border-rose-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-xs">
                    <Percent className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="font-bold text-stone-900 text-xs sm:text-sm">
                      تفعيل خصم أو عرض ترويجي للمنتج
                    </h5>
                    <p className="text-[11px] text-stone-500">
                      إظهار شارة الخصم والسعر المشطوب لجذب المزيد من المشترين
                    </p>
                  </div>
                </div>

                {/* Toggle Button */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !hasDiscount;
                    setHasDiscount(next);
                    if (next && originalPrice > 0) {
                      const newDisc = Math.max(1, Math.round(originalPrice * (1 - discountPercent / 100)));
                      setDiscountPrice(newDisc);
                    }
                  }}
                  className={`relative inline-flex h-6 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                    hasDiscount ? 'bg-rose-600' : 'bg-stone-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
                      hasDiscount ? '-translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Discount Controls (shown only when discount is active) */}
              {hasDiscount && (
                <div className="mt-4 pt-4 border-t border-rose-200/80 space-y-4">
                  {/* Quick Preset Buttons */}
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1.5">
                      اختيار نسبة خصم سريعة:
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_PERCENTAGES.map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => handlePercentChange(pct)}
                          className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                            discountPercent === pct
                              ? 'bg-rose-600 text-white border-rose-600 shadow-xs scale-105'
                              : 'bg-white text-stone-700 border-stone-200 hover:border-rose-300 hover:bg-rose-50/50'
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Percentage Slider */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold text-stone-700 mb-1">
                      <span>نسبة الخصم المئوية:</span>
                      <span className="text-rose-600 font-black text-sm bg-rose-100/80 px-2 py-0.5 rounded-lg">
                        {discountPercent}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="90"
                      value={discountPercent}
                      onChange={(e) => handlePercentChange(parseInt(e.target.value) || 1)}
                      className="w-full accent-rose-600 cursor-pointer h-2 bg-rose-200 rounded-lg"
                    />
                    <div className="flex justify-between text-[10px] text-stone-400 mt-0.5">
                      <span>1%</span>
                      <span>50%</span>
                      <span>90%</span>
                    </div>
                  </div>

                  {/* Two Column Direct Price & Percent Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-bold text-stone-700 mb-1">
                        السعر المخفض النهائي للزبائن ({settings.currency})
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="1"
                          step="0.5"
                          value={discountPrice || ''}
                          onChange={(e) => handleDiscountPriceChange(parseFloat(e.target.value) || 0)}
                          className="w-full text-sm font-black text-rose-600 px-3.5 py-2 bg-white border border-rose-300 rounded-xl focus:outline-hidden focus:border-rose-500 pl-16 shadow-xs"
                          placeholder="مثال: 95"
                        />
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-rose-600 bg-rose-100 px-2 py-0.5 rounded-md">
                          {settings.currency}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-stone-700 mb-1">
                        مقدار التوفير للزبون
                      </label>
                      <div className="h-[38px] flex items-center px-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 font-bold text-xs">
                        <TrendingDown className="w-3.5 h-3.5 ml-1.5 text-emerald-600" />
                        <span>وفر {savingsAmount > 0 ? savingsAmount : 0} {settings.currency}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Live Customer Preview Card (معاينة حية للمتجر) */}
            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-rose-600" />
                  <span>معاينة حية فورية: كيف سيظهر السعر للزبائن في المتجر</span>
                </span>
                <span className="text-[10px] bg-stone-200 text-stone-600 px-2 py-0.5 rounded-md font-bold">
                  متجر الزبون
                </span>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-stone-200/90 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-stone-400 block mb-0.5">السعر المعروض للعميل:</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl sm:text-2xl font-black text-rose-600">
                      {previewPricing.finalPrice} {settings.currency}
                    </span>
                    {previewPricing.hasDiscount && (
                      <span className="text-xs text-stone-400 line-through">
                        {previewPricing.originalPrice} {settings.currency}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-left flex flex-col items-end gap-1">
                  {previewPricing.hasDiscount ? (
                    <>
                      <span className="bg-rose-600 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-xs">
                        خصم {previewPricing.discountPercent}%
                      </span>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        الزبون يوفر {previewPricing.savingsAmount} {settings.currency}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs font-bold text-stone-500 bg-stone-100 px-2.5 py-1 rounded-lg">
                      سعر أساسي (بدون عرض)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 bg-stone-50 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            {product.discount_price !== null && (
              <button
                type="button"
                onClick={handleRemoveDiscount}
                disabled={isSaving}
                className="text-xs text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1.5 p-2 rounded-xl hover:bg-rose-50 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>إلغاء الخصم والعودة للسعر الأصلي</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="w-1/2 sm:w-auto px-4 py-2.5 text-xs font-bold text-stone-600 hover:text-stone-900 bg-white border border-stone-300 rounded-xl hover:bg-stone-100 transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="w-1/2 sm:w-auto px-6 py-2.5 text-xs font-black text-white bg-rose-600 hover:bg-rose-700 active:scale-98 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري الحفظ...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>حفظ وتطبيق فوراً للزبائن</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPriceDiscountModal;
