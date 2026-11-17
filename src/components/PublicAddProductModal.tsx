import React, { useState } from 'react';
import { X, Sparkles, Plus, Image as ImageIcon, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Category, Product, StoreSettings } from '../types';
import { saveProductFirestore } from '../lib/firebase';
import { compressImageFileToDataUrl, compressDataUrlIfNeeded } from '../lib/imageCompression';

interface PublicAddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  settings: StoreSettings;
  onProductAdded: (product: Product) => void;
}

export const PublicAddProductModal: React.FC<PublicAddProductModalProps> = ({
  isOpen,
  onClose,
  categories,
  settings,
  onProductAdded,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || 'skincare');
  const [stock, setStock] = useState('10');
  const [contactPhone, setContactPhone] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isCompressingImage, setIsCompressingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMessage('');
    setIsCompressingImage(true);
    try {
      setImageFile(file);
      const compressedDataUrl = await compressImageFileToDataUrl(file);
      setImageUrl(compressedDataUrl);
    } catch (err: any) {
      setErrorMessage(err?.message || 'تعذر قراءة أو ضغط الصورة، يرجى اختيار صورة أخرى.');
    } finally {
      setIsCompressingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const cleanTitle = title.trim().slice(0, 300);
    if (!cleanTitle) {
      setErrorMessage('يرجى إدخال اسم المنتج.');
      return;
    }
    if (!price || isNaN(Number(price)) || Number(price) <= 0) {
      setErrorMessage('يرجى إدخال سعر صحيح أكبر من صفر للمنتج.');
      return;
    }
    if (!imageUrl.trim()) {
      setErrorMessage('يرجى إرفاق صورة المنتج أو إدخال رابط الصورة.');
      return;
    }

    setIsSubmitting(true);

    try {
      const selectedCategory = categories.find((c) => c.id === categoryId) || categories[0];
      const safeImage = imageUrl.trim().startsWith('data:image/')
        ? await compressDataUrlIfNeeded(imageUrl.trim())
        : imageUrl.trim();

      const newProduct: Product = {
        id: 'visitor-prod-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
        title_ar: cleanTitle,
        description_ar: description.trim() || 'منتج مضاف بواسطة زائر - ضمان الجودة والأصالة من أمازون دعاء.',
        original_price: Number(price),
        discount_price: null,
        stock_quantity: Math.max(1, parseInt(stock) || 10),
        category_id: selectedCategory.id,
        category_name: selectedCategory.name_ar,
        tags: ['مضاف_حديثاً', 'منتج_زائر'],
        image_url: safeImage,
        ai_generated: false,
        rating: 5.0,
        reviews_count: 1,
        created_at: new Date().toISOString(),
        featured: true,
        status: 'published',
        contact_phone: contactPhone.trim() || settings.whatsappNumber,
      };

      const fsPromise = saveProductFirestore(newProduct);
      const apiPromise = fetch('/api/db/products/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProduct),
      }).then(async (res) => {
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || 'تعذر الحفظ في خادم المتجر');
        }
        return res.json();
      });

      const [fsOutcome, apiOutcome] = await Promise.allSettled([fsPromise, apiPromise]);
      const firestoreOk = fsOutcome.status === 'fulfilled';
      const serverOk = apiOutcome.status === 'fulfilled';

      if (!firestoreOk && !serverOk) {
        const fsMsg = fsOutcome.status === 'rejected' ? fsOutcome.reason?.message : '';
        const apiMsg = apiOutcome.status === 'rejected' ? apiOutcome.reason?.message : '';
        throw new Error(fsMsg || apiMsg || 'تعذر حفظ المنتج، يرجى التحقق من الاتصال والمحاولة مرة أخرى.');
      }

      onProductAdded(newProduct);

      setSuccessMessage('تم إضافة المنتج ونشره في المتجر بنجاح!');
      setTimeout(() => {
        onClose();
        setTitle('');
        setDescription('');
        setPrice('');
        setImageUrl('');
        setImageFile(null);
        setContactPhone('');
        setSuccessMessage('');
      }, 1500);
    } catch (err: any) {
      console.error('Failed to add public product:', err);
      setErrorMessage(err.message || 'تعذر حفظ المنتج، يرجى المحاولة لاحقاً.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-rose-100 animate-in zoom-in-95 text-right">
        {/* Header */}
        <div className="bg-gradient-to-r from-rose-600 to-rose-800 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black">أضف منتجك إلى متجر أمازون دعاء</h2>
              <p className="text-xs text-rose-100">بدون تسجيل دخول • نشر فوري في المتجر</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-2xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-2xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">اسم المنتج <span className="text-rose-600">*</span></label>
            <input
              type="text"
              required
              placeholder="مثال: عطر فاخر / جهاز تجميل / مستحضر عناية..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-xs p-3 bg-stone-50 border border-stone-200 rounded-xl focus:bg-white focus:border-rose-500 focus:outline-hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">السعر ({settings.currency}) <span className="text-rose-600">*</span></label>
              <input
                type="number"
                required
                min="1"
                placeholder="99"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full text-xs p-3 bg-stone-50 border border-stone-200 rounded-xl focus:bg-white focus:border-rose-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">الكمية المتوفرة</label>
              <input
                type="number"
                min="1"
                placeholder="10"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="w-full text-xs p-3 bg-stone-50 border border-stone-200 rounded-xl focus:bg-white focus:border-rose-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">القسم / التصنيف</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full text-xs p-3 bg-stone-50 border border-stone-200 rounded-xl focus:bg-white focus:border-rose-500 focus:outline-hidden"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name_ar}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">صورة المنتج <span className="text-rose-600">*</span></label>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="رابط الصورة أو اختر ملفاً"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="flex-1 text-xs p-3 bg-stone-50 border border-stone-200 rounded-xl focus:bg-white focus:border-rose-500 focus:outline-hidden"
              />
              <label className="bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold px-4 py-3 rounded-xl cursor-pointer flex items-center gap-1.5 shrink-0 transition-colors">
                <ImageIcon className="w-4 h-4 text-rose-300" />
                <span>رفع صورة</span>
                <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              </label>
            </div>
            {imageUrl && (
              <div className="mt-2 w-20 h-20 rounded-xl overflow-hidden border border-stone-200 bg-stone-100">
                <img src={imageUrl} alt="معاينة" className="w-full h-full object-cover" />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">رقم التواصل (اختياري للواتساب)</label>
            <input
              type="text"
              placeholder="+966500000000"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="w-full text-xs p-3 bg-stone-50 border border-stone-200 rounded-xl focus:bg-white focus:border-rose-500 focus:outline-hidden"
            />
            <p className="text-[10px] text-stone-400 mt-1">يُستخدم لتواصل العملاء الراغبين في الشراء معك مباشرة.</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">وصف المنتج (اختياري)</label>
            <textarea
              rows={3}
              placeholder="اكتب وصفاً جذاباً ومبسطاً للمنتج..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-xs p-3 bg-stone-50 border border-stone-200 rounded-xl focus:bg-white focus:border-rose-500 focus:outline-hidden"
            />
          </div>

          <div className="pt-3 border-t border-stone-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isCompressingImage}
              className="bg-rose-600 hover:bg-rose-700 text-white px-6 py-2.5 rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جاري النشر...</span>
                </>
              ) : isCompressingImage ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جاري تجهيز الصورة...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>نشر المنتج في المتجر</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
