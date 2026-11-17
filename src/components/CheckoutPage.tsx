import React, { useState, useEffect, useRef } from 'react';
import {
  ShoppingBag,
  ArrowRight,
  ShieldCheck,
  Truck,
  MessageCircle,
  CreditCard,
  Banknote,
  CheckCircle2,
  Tag,
  Clock,
  Sparkles,
  Lock,
  ChevronRight,
  Check,
  Copy,
  Plus,
  Minus,
  Trash2,
  Video,
  Upload,
  Loader2,
  AlertCircle,
  Edit2,
  CheckSquare,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { CartItem, StoreSettings, Order, Product, CustomerOrderInfo } from '../types';
import { getAuthHeadersAsync } from '../lib/storage';
import { MatchedVideoOrderItem } from '../types/videoOrder.ts';
import { generateWhatsAppOrderUrl } from '../lib/whatsapp';
import { getProductPricing } from '../lib/pricing';

interface CheckoutPageProps {
  cartItems: CartItem[];
  products: Product[];
  settings: StoreSettings;
  onUpdateQuantity: (productId: string, delta: number) => void;
  onRemoveItem: (productId: string) => void;
  onOrderPlaced: (order: Order) => void | Promise<any>;
  onBackToStore: () => void;
}

// Arabic normalization helper for high-fidelity product matching in the client
const normalizeArabic = (str: string): string => {
  if (!str) return '';
  return str
    .replace(/[\u064B-\u065F]/g, '') // remove diacritics
    .replace(/[أإآا]/g, 'ا')        // normalize alefs
    .replace(/ة/g, 'ه')            // normalize teh marbuta
    .replace(/ى/g, 'ي')            // normalize alef maksura
    .replace(/\s+/g, ' ')          // collapse whitespaces
    .trim()
    .toLowerCase();
};

export const CheckoutPage: React.FC<CheckoutPageProps> = ({
  cartItems,
  products,
  settings,
  onUpdateQuantity,
  onRemoveItem,
  onOrderPlaced,
  onBackToStore,
}) => {
  const [checkoutMode, setCheckoutMode] = useState<'traditional' | 'video'>('traditional');

  // Local Toast System (Replaces alert() to match design system)
  const [localToast, setLocalToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setLocalToast({ message, type });
    setTimeout(() => setLocalToast(null), 4000);
  };

  // --- TRADITIONAL CHECKOUT STATE ---
  const [customerInfo, setCustomerInfo] = useState<CustomerOrderInfo>({
    customerName: '',
    phone: '',
    email: '',
    city: 'الرياض',
    address: '',
    notes: '',
    paymentMethod: 'cod',
    deliverySpeed: 'standard',
  });

  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponError, setCouponError] = useState('');
  const [copied, setCopied] = useState(false);
  const [isTraditionalSuccess, setIsTraditionalSuccess] = useState(false);
  const [traditionalConfirmedOrder, setTraditionalConfirmedOrder] = useState<Order | null>(null);

  const traditionalSubtotal = cartItems.reduce((acc, item) => {
    const price = getProductPricing(item.product).finalPrice;
    return acc + price * item.quantity;
  }, 0);

  const isFreeDelivery = traditionalSubtotal >= settings.freeDeliveryThreshold;
  const standardFee = isFreeDelivery ? 0 : settings.deliveryFee;
  const expressExtraFee = customerInfo.deliverySpeed === 'express' ? 15 : 0;
  const traditionalDeliveryFee = standardFee + expressExtraFee;
  const traditionalGrandTotal = Math.max(0, traditionalSubtotal - couponDiscount + traditionalDeliveryFee);

  // --- VIDEO-TO-ORDER STATE ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  // Parsed and validated items
  const [rawExtractedData, setRawExtractedData] = useState<any>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  
  // Edited values of customer and products
  const [editedName, setEditedName] = useState('');
  const [editedPhone, setEditedPhone] = useState('');
  const [editedCity, setEditedCity] = useState('');
  const [editedAddress, setEditedAddress] = useState('');
  const [editedNotes, setEditedNotes] = useState('');
  const [editedItems, setEditedItems] = useState<{ id: string; product_name_raw: string; quantity: number; resolvedProductId: string }[]>([]);
  const [matchedItems, setMatchedItems] = useState<MatchedVideoOrderItem[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confidence, setConfidence] = useState(1.0);

  // Ordering submission state
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmedVideoOrder, setConfirmedVideoOrder] = useState<any>(null);
  const [confirmedVideoWaUrl, setConfirmedVideoWaUrl] = useState<string>('');

  // Clean up Object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (videoPreviewUrl) {
        URL.revokeObjectURL(videoPreviewUrl);
      }
    };
  }, [videoPreviewUrl]);

  // Recalculate server-trusted totals and match products whenever items or catalog changes
  useEffect(() => {
    if (!rawExtractedData) return;

    const matchedList: MatchedVideoOrderItem[] = [];
    const autoWarnings: string[] = [];

    editedItems.forEach((item) => {
      let matchedProd: Product | undefined = undefined;

      // 1. If a resolved product id is manually chosen
      if (item.resolvedProductId) {
        matchedProd = products.find(p => p.id === item.resolvedProductId);
      }

      // 2. Otherwise try fuzzy string matching
      if (!matchedProd) {
        const normRaw = normalizeArabic(item.product_name_raw);
        const candidates = products.filter(p => {
          const normTitle = normalizeArabic(p.title_ar);
          return normTitle.includes(normRaw) || normRaw.includes(normTitle);
        });

        if (candidates.length === 1) {
          matchedProd = candidates[0];
        } else if (candidates.length > 1) {
          autoWarnings.push(`الاسم "${item.product_name_raw}" مبهم ويطابق أكثر من منتج في المتجر.`);
        } else {
          autoWarnings.push(`تعذر العثور على منتج يطابق: "${item.product_name_raw}". يرجى اختياره يدوياً.`);
        }
      }

      if (matchedProd) {
        const price = matchedProd.discount_price ?? matchedProd.original_price;
        const subtotal = price * item.quantity;
        const outOfStock = matchedProd.stock_quantity < item.quantity;

        if (outOfStock) {
          autoWarnings.push(`الكمية المطلوبة من "${matchedProd.title_ar}" غير متوفرة (المخزون الحالي: ${matchedProd.stock_quantity} فقط).`);
        }

        matchedList.push({
          productId: matchedProd.id,
          productTitleAr: matchedProd.title_ar,
          quantity: item.quantity,
          price,
          subtotal,
          outOfStock,
        });
      } else {
        matchedList.push({
          productId: '',
          productTitleAr: `[غير معروف] ${item.product_name_raw}`,
          quantity: item.quantity,
          price: 0,
          subtotal: 0,
          outOfStock: false,
        });
      }
    });

    setMatchedItems(matchedList);
    setWarnings(Array.from(new Set([...(rawExtractedData.warnings || []), ...autoWarnings])));
  }, [editedItems, products, rawExtractedData]);

  // Calculate totals for Matched Video Orders
  const videoSubtotal = matchedItems.reduce((sum, item) => sum + item.subtotal, 0);
  const matchedDeliveryFee = videoSubtotal > 0 && normalizeArabic(editedCity).includes('صنعاء') ? 10 : 20;
  const videoGrandTotal = videoSubtotal + matchedDeliveryFee;

  // Handles traditional checkout coupons
  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    setCouponError('');
    const code = couponCode.trim().toUpperCase();

    if (code === 'BEAUTY10' || code === 'DUAA10') {
      const disc = Math.round(traditionalSubtotal * 0.1);
      setCouponDiscount(disc);
      setAppliedCoupon(`${code} (خصم 10%)`);
      showToast(`تم تطبيق الكوبون ${code} بنجاح!`, 'success');
    } else if (code === 'AMAZON15') {
      const disc = Math.round(traditionalSubtotal * 0.15);
      setCouponDiscount(disc);
      setAppliedCoupon('AMAZON15 (خصم 15%)');
      showToast('تم تطبيق الكوبون AMAZON15 بنجاح!', 'success');
    } else if (code === 'BEAUTY20') {
      const disc = Math.round(traditionalSubtotal * 0.2);
      setCouponDiscount(disc);
      setAppliedCoupon('BEAUTY20 (خصم 20%)');
      showToast('تم تطبيق الكوبون BEAUTY20 بنجاح!', 'success');
    } else if (code === 'WELCOME') {
      const disc = Math.min(20, traditionalSubtotal);
      setCouponDiscount(disc);
      setAppliedCoupon('WELCOME (خصم 20 ريال)');
      showToast('تم تطبيق الكوبون WELCOME بنجاح!', 'success');
    } else {
      setCouponError('رمز الكوبون غير صالح. جرب BEAUTY10 أو DUAA10 أو WELCOME');
      showToast('رمز الكوبون المكتوب غير صالح', 'error');
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponDiscount(0);
    setCouponCode('');
    showToast('تم إلغاء الكوبون المطبق', 'info');
  };

  // Traditional order submission state
  const [isPlacingTraditional, setIsPlacingTraditional] = useState(false);

  // Handles placing order traditionally
  const handleTraditionalPlaceOrder = async () => {
    if (isPlacingTraditional) return;
    if (!customerInfo.customerName.trim() || !customerInfo.phone.trim()) {
      showToast('يرجى إدخال اسم المستلم ورقم الجوال للمتابعة', 'error');
      return;
    }

    setIsPlacingTraditional(true);
    try {
      const orderNum = 'ELEN-' + Math.floor(1000 + Math.random() * 9000);
      const cleanCouponCode = appliedCoupon ? appliedCoupon.split(' ')[0].trim().toUpperCase() : undefined;
      const newOrder: Order = {
        id: 'order-' + Date.now(),
        order_number: orderNum,
        customer_name: customerInfo.customerName,
        customer_phone: customerInfo.phone,
        customer_email: customerInfo.email,
        city: customerInfo.city,
        address: customerInfo.address,
        notes: customerInfo.notes,
        items: cartItems.map((ci) => ({
          product_id: ci.product.id,
          title_ar: ci.product.title_ar,
          price: getProductPricing(ci.product).finalPrice,
          quantity: ci.quantity,
          image_url: ci.product.image_url,
        })),
        subtotal: traditionalSubtotal,
        discount_amount: couponDiscount,
        coupon_code: cleanCouponCode,
        delivery_fee: traditionalDeliveryFee,
        total_amount: traditionalGrandTotal,
        status: 'pending',
        whatsapp_sent: true,
        payment_method: customerInfo.paymentMethod === 'cod' ? 'الدفع عند الاستلام' : 'تحويل بنكي فوري',
        delivery_speed: customerInfo.deliverySpeed === 'express' ? 'توصيل إكسبرس فائق السرعة' : 'توصيل قياسي',
        created_at: new Date().toISOString(),
      };

      // Await authoritative order processing from server
      const confirmedResult = await onOrderPlaced(newOrder);
      const finalConfirmed: Order = (confirmedResult && typeof confirmedResult === 'object' && 'order_number' in confirmedResult)
        ? (confirmedResult as Order)
        : newOrder;

      setTraditionalConfirmedOrder(finalConfirmed);
      setIsTraditionalSuccess(true);
      showToast('تم تسجيل وتأكيد الطلب بنجاح! جاري تحويلك لواتساب...', 'success');

      // Generate WhatsApp Order URL using confirmed order details
      const url = generateWhatsAppOrderUrl(
        cartItems,
        settings,
        customerInfo,
        finalConfirmed.discount_amount || couponDiscount,
        appliedCoupon || undefined,
        finalConfirmed.order_number
      );
      try {
        window.open(url, '_blank');
      } catch (openErr) {
        console.warn('Iframe blocked window.open:', openErr);
      }
    } catch (err: any) {
      console.error('Traditional order submission failed:', err);
    } finally {
      setIsPlacingTraditional(false);
    }
  };

  // --- VIDEO CHECKOUT LOGIC & HANDLERS ---
  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleVideoFileCheck = (file: File) => {
    const allowedMimeTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/mov'];
    const allowedExtensions = ['.mp4', '.webm', '.mov', '.qt'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();

    if (!allowedMimeTypes.includes(file.type) && !allowedExtensions.includes(ext)) {
      showToast('صيغة الفيديو غير مدعومة. يرجى رفع ملفات MP4, WebM أو MOV فقط.', 'error');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      showToast('حجم الفيديو يتجاوز الحد الأقصى 50MB. يرجى رفع ملف أصغر.', 'error');
      return;
    }

    setVideoFile(file);
    setVideoPreviewUrl(URL.createObjectURL(file));
    showToast('تم تحميل الفيديو بنجاح، جاهز لبدء التحليل.', 'success');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleVideoFileCheck(e.dataTransfer.files[0]);
    }
  };

  // Sends the video securely to `/api/video-orders/analyze`
  const handleAnalyzeVideo = async () => {
    if (!videoFile) return;

    setIsAnalyzing(true);
    setAnalysisProgress(15);
    setRawExtractedData(null);

    const interval = setInterval(() => {
      setAnalysisProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + 5;
      });
    }, 1500);

    try {
      // Fetch user Auth token securely
      const authHeaders = await getAuthHeadersAsync();
      if (!authHeaders.Authorization) {
        throw new Error('يرجى تسجيل الدخول أولاً لتتمكن من رفع وتحليل الفيديو.');
      }

      setAnalysisProgress(30);

      const formData = new FormData();
      formData.append('video', videoFile);

      const res = await fetch('/api/video-orders/analyze', {
        method: 'POST',
        headers: authHeaders,
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'فشلت معالجة وتحليل الفيديو. يرجى المحاولة ثانية.');
      }

      const json = await res.json();
      setAnalysisProgress(100);
      clearInterval(interval);

      if (json.success && json.data) {
        const extData = json.data;
        setRawExtractedData(extData);
        setEditedName(extData.customer_name || '');
        setEditedPhone(extData.customer_phone || '');
        setEditedCity(extData.city || 'صنعاء');
        setEditedAddress(extData.address || '');
        setEditedNotes(extData.notes || '');
        setConfidence(extData.confidence ?? 1.0);
        
        // Structure items with a unique id and standard properties
        const itemsList = (extData.items || []).map((it: any, idx: number) => ({
          id: `ext-item-${idx}-${Date.now()}`,
          product_name_raw: it.product_name_raw || '',
          quantity: parseInt(it.quantity) || 1,
          resolvedProductId: '',
        }));
        setEditedItems(itemsList);
        
        // Generate an Idempotency Key unique for this video order
        setIdempotencyKey(`vid-order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
        showToast('تم تحليل واستخراج بيانات الطلب بنجاح!', 'success');
      } else {
        throw new Error('لم يقم نموذج الذكاء الاصطناعي بإرجاع أي بيانات للتحليل.');
      }
    } catch (e: any) {
      clearInterval(interval);
      setAnalysisProgress(0);
      setIsAnalyzing(false);
      showToast(e.message || 'فشل تحليل الفيديو.', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Commits the order securely using `/api/video-orders/confirm`
  const handleConfirmVideoOrder = async () => {
    if (warnings.some(w => w.includes('غير معروف') || w.includes('اختياره يدوياً'))) {
      showToast('يرجى حل أخطاء مطابقة المنتجات وتحديد المنتج يدوياً قبل التأكيد.', 'error');
      return;
    }
    if (!editedName.trim() || !editedPhone.trim() || !editedCity.trim() || !editedAddress.trim()) {
      showToast('يرجى ملء جميع بيانات العميل الأساسية للمتابعة.', 'error');
      return;
    }

    setIsConfirming(true);

    try {
      const authHeaders = await getAuthHeadersAsync();
      if (!authHeaders.Authorization) {
        throw new Error('يرجى تسجيل الدخول للتأكيد.');
      }

      const postBody = {
        customer_name: editedName,
        customer_phone: editedPhone,
        city: editedCity,
        address: editedAddress,
        notes: editedNotes,
        items: editedItems.map((item, idx) => {
          const matched = matchedItems[idx];
          return {
            product_name_raw: item.product_name_raw,
            quantity: item.quantity,
            resolvedProductId: matched?.productId || '',
          };
        }),
        idempotencyKey,
      };

      const res = await fetch('/api/video-orders/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify(postBody),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || 'فشل تأكيد الطلب.');
      }

      const json = await res.json();
      if (json.success && json.order) {
        setConfirmedVideoOrder(json.order);
        setConfirmedVideoWaUrl(json.whatsappUrl);
        
        // Trigger onOrderPlaced so App/Local state can track this order
        onOrderPlaced({
          id: json.orderId,
          order_number: json.order.order_number,
          customer_name: editedName,
          customer_phone: editedPhone,
          city: editedCity,
          address: editedAddress,
          notes: editedNotes,
          items: matchedItems.map(m => {
            const prod = products.find(p => p.id === m.productId);
            return {
              product_id: m.productId,
              title_ar: m.productTitleAr,
              price: m.price,
              quantity: m.quantity,
              image_url: prod?.image_url || 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=600&q=80',
            };
          }),
          subtotal: videoSubtotal,
          discount_amount: 0,
          delivery_fee: matchedDeliveryFee,
          total_amount: json.order.total_amount,
          status: 'pending',
          whatsapp_sent: true,
          payment_method: 'الدفع عند الاستلام',
          created_at: new Date().toISOString(),
        });

        showToast('تم تأكيد طلب الفيديو وحفظه بنجاح!', 'success');

        // Redirect to WhatsApp immediately
        if (json.whatsappUrl) {
          try {
            window.open(json.whatsappUrl, '_blank');
          } catch (openErr) {
            console.warn('Iframe blocked window.open:', openErr);
          }
        }
      }
    } catch (e: any) {
      showToast(e.message || 'فشل تأكيد الطلب بالفيديو.', 'error');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleCancelVideoOrder = () => {
    setVideoFile(null);
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoPreviewUrl('');
    setRawExtractedData(null);
    setEditedItems([]);
    setMatchedItems([]);
    setWarnings([]);
    showToast('تم إلغاء الطلب ومسح البيانات.', 'info');
  };

  // Reopen WhatsApp if failed on confirm screen
  const handleReopenWhatsApp = () => {
    if (confirmedVideoWaUrl) {
      try {
        window.open(confirmedVideoWaUrl, '_blank');
      } catch (openErr) {
        console.warn('Iframe blocked window.open:', openErr);
      }
    }
  };

  // --- RENDERING SUCCESS SCREENS ---

  // Success 1: Video Order Confirmation Success Page
  if (confirmedVideoOrder) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center animate-in fade-in duration-300">
        <div className="w-20 h-20 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-6 border border-emerald-200 shadow-md">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        <span className="text-xs font-bold text-rose-600 uppercase tracking-widest block mb-1">
          رؤية الفيديو الذكية ✓
        </span>
        <h1 className="text-2xl sm:text-4xl font-black text-stone-900 mb-2">
          تم تأكيد طلبكِ بالفيديو بنجاح!
        </h1>
        <p className="text-stone-500 text-xs sm:text-sm max-w-md mx-auto mb-6">
          تم استخراج طلبكِ ومطابقة المنتجات بدقة، وتم تسجيل طلبكِ برقم مرجعي: <strong className="text-stone-900">#{confirmedVideoOrder.order_number}</strong>
        </p>

        {/* Video Order Details */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 text-right text-xs space-y-4 mb-8 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <span className="text-stone-500">رقم المرجع للطلب:</span>
            <span className="font-mono font-bold text-stone-900 text-sm">#{confirmedVideoOrder.order_number}</span>
          </div>

          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <span className="text-stone-500">المستلم:</span>
            <span className="font-bold text-stone-900">{editedName} ({editedPhone})</span>
          </div>

          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <span className="text-stone-500">عنوان الشحن المستخرج:</span>
            <span className="font-bold text-stone-900">{editedCity} - {editedAddress}</span>
          </div>

          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <span className="text-stone-500">المنتجات المؤكدة:</span>
            <div className="space-y-1">
              {matchedItems.map((m, idx) => (
                <div key={idx} className="font-bold text-stone-900 text-left">
                  {m.productTitleAr} × {m.quantity}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <span className="text-stone-500">الإجمالي النهائي المعتمد:</span>
            <span className="font-black text-rose-600 text-base">{confirmedVideoOrder.total_amount} ريال</span>
          </div>

          <div className="bg-stone-50 p-4 rounded-2xl text-[11px] text-stone-600 flex items-center gap-2">
            <Clock className="w-4 h-4 text-rose-600 shrink-0" />
            <span>في حال فشل فتح واتساب تلقائياً، يمكنك الضغط على الزر أدناه لمتابعة المحادثة معنا وتأكيد الشحن.</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={handleReopenWhatsApp}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm px-6 py-3.5 rounded-2xl flex items-center gap-2 shadow-lg transition-all cursor-pointer"
          >
            <MessageCircle className="w-5 h-5" />
            <span>إعادة فتح المحادثة في واتساب</span>
          </button>

          <button
            onClick={onBackToStore}
            className="bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs sm:text-sm px-6 py-3.5 rounded-2xl transition-all shadow-md cursor-pointer"
          >
            العودة للتسوق في المتجر
          </button>
        </div>
      </div>
    );
  }

  // Success 2: Traditional Success Page
  if (isTraditionalSuccess && traditionalConfirmedOrder) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center animate-in fade-in duration-300">
        <div className="w-20 h-20 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-6 border border-emerald-200 shadow-md">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        <span className="text-xs font-bold text-rose-600 uppercase tracking-widest block mb-1">
          تم استلام طلبك بنجاح!
        </span>
        <h1 className="text-2xl sm:text-4xl font-black text-stone-900 mb-2">
          شكراً لتسوقكِ من أمازون دعاء
        </h1>
        <p className="text-stone-500 text-xs sm:text-sm max-w-md mx-auto mb-6">
          تم تسجيل طلبكِ رقم <strong className="text-stone-900">#{traditionalConfirmedOrder.order_number}</strong> بنجاح. سنبدأ بتجهيزه فوراً للتوصيل.
        </p>

        {/* Traditional Order Summary */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 text-right text-xs space-y-4 mb-8 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <span className="text-stone-500">رقم الطلب:</span>
            <span className="font-mono font-bold text-stone-900 text-sm">#{traditionalConfirmedOrder.order_number}</span>
          </div>

          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <span className="text-stone-500">المستلم:</span>
            <span className="font-bold text-stone-900">{customerInfo.customerName} ({customerInfo.phone})</span>
          </div>

          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <span className="text-stone-500">عنوان التوصيل:</span>
            <span className="font-bold text-stone-900">{customerInfo.city} - {customerInfo.address}</span>
          </div>

          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <span className="text-stone-500">الإجمالي النهائي المطلوب:</span>
            <span className="font-black text-rose-600 text-base">{traditionalGrandTotal} {settings.currency}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href={`https://api.whatsapp.com/send?phone=967777627595&text=${encodeURIComponent(
              `السلام عليكم، أنا طلبت من متجركم برقم طلب #${traditionalConfirmedOrder.order_number} بقيمة إجمالية ${traditionalGrandTotal} ريال. يرجى تأكيد الشحنة.`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm px-6 py-3.5 rounded-2xl flex items-center gap-2 shadow-lg transition-all"
          >
            <MessageCircle className="w-5 h-5" />
            <span>متابعة المحادثة في واتساب</span>
          </a>

          <button
            onClick={onBackToStore}
            className="bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs sm:text-sm px-6 py-3.5 rounded-2xl transition-all shadow-md cursor-pointer"
          >
            العودة للتسوق في المتجر
          </button>
        </div>
      </div>
    );
  }

  // Empty cart fallback (only applies to traditional checkout)
  if (cartItems.length === 0 && checkoutMode === 'traditional') {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <div className="w-20 h-20 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-4">
          <ShoppingBag className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-bold text-stone-900 mb-2">سلة التسوق فارغة حالياً</h2>
        <p className="text-xs text-stone-500 mb-6">
          تصفحي تشكيلة مستحضرات التجميل والعناية الفاخرة، أو جربي الطلب السريع والمبتكر بواسطة الفيديو من التبويب أدناه!
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => setCheckoutMode('video')}
            className="bg-rose-600 text-white text-xs font-bold px-6 py-3 rounded-2xl shadow-md cursor-pointer flex items-center gap-2"
          >
            <Video className="w-4 h-4" />
            <span>جربي الشراء بالفيديو (Video-to-Order)</span>
          </button>
          <button
            onClick={onBackToStore}
            className="bg-stone-900 text-white text-xs font-bold px-6 py-3 rounded-2xl shadow-md cursor-pointer"
          >
            تصفح المتجر الآن
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
      {/* Toast Alert Banner */}
      {localToast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3.5 rounded-2xl text-xs font-bold flex items-center gap-2.5 shadow-xl animate-fadeIn border ${
            localToast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : localToast.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          {localToast.type === 'success' ? (
            <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
          ) : localToast.type === 'error' ? (
            <AlertCircle className="w-4.5 h-4.5 text-rose-600 shrink-0" />
          ) : (
            <Sparkles className="w-4.5 h-4.5 text-blue-600 shrink-0" />
          )}
          <span>{localToast.message}</span>
        </div>
      )}

      {/* Mode Navigation & Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 mb-8 border-b border-stone-200 gap-4">
        <div>
          <button
            onClick={onBackToStore}
            className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-900 transition-colors font-bold mb-1.5 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
            <span>العودة للمتجر</span>
          </button>
          <h1 className="text-xl sm:text-2xl font-black text-stone-900">إتمام الشراء والدفع الآمن</h1>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1 bg-stone-100 p-1.5 rounded-2xl border border-stone-200 self-stretch sm:self-auto">
          <button
            onClick={() => setCheckoutMode('traditional')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              checkoutMode === 'traditional'
                ? 'bg-white text-rose-700 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>الدفع التقليدي بالسلة</span>
          </button>

          <button
            onClick={() => setCheckoutMode('video')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              checkoutMode === 'video'
                ? 'bg-white text-rose-700 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Video className="w-4 h-4 text-rose-600" />
            <span>الشراء بالفيديو (Video-to-Order)</span>
            <span className="bg-rose-100 text-rose-700 text-[9px] px-1.5 py-0.5 rounded-full font-black animate-pulse">
              ذكي ✨
            </span>
          </button>
        </div>
      </div>

      {/* ===================== CHECOUT MODE 1: TRADITIONAL ===================== */}
      {checkoutMode === 'traditional' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Right Column: Checkout Steps Forms (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Step 1: Customer Details */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-xs space-y-4">
              <div className="flex items-center gap-3 pb-4 border-b border-stone-100">
                <div className="w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center font-black text-sm">
                  1
                </div>
                <h2 className="text-base sm:text-lg font-black text-stone-900">
                  بيانات المستلم وشحن الشحنة
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-bold text-stone-700 mb-1.5">اسم المستلم بالكامل *</label>
                  <input
                    type="text"
                    required
                    value={customerInfo.customerName}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, customerName: e.target.value })}
                    placeholder="مثال: دعاء محمد أحمد"
                    className="w-full text-xs p-3 bg-stone-50 border border-stone-200 rounded-2xl focus:bg-white focus:border-rose-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1.5">رقم جوال المستلم *</label>
                  <input
                    type="tel"
                    required
                    value={customerInfo.phone}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                    placeholder="مثال: 777627595"
                    className="w-full text-xs p-3 bg-stone-50 border border-stone-200 rounded-2xl focus:bg-white focus:border-rose-500 focus:outline-hidden text-left"
                  />
                </div>
                <div>
                  <label className="block font-bold text-stone-700 mb-1.5">البريد الإلكتروني (اختياري)</label>
                  <input
                    type="email"
                    value={customerInfo.email || ''}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                    placeholder="مثال: name@example.com"
                    className="w-full text-xs p-3 bg-stone-50 border border-stone-200 rounded-2xl focus:bg-white focus:border-rose-500 focus:outline-hidden text-left"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-bold text-stone-700 mb-1.5">المحافظة / المدينة *</label>
                  <select
                    value={customerInfo.city}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, city: e.target.value })}
                    className="w-full text-xs p-3 bg-stone-50 border border-stone-200 rounded-2xl focus:bg-white focus:border-rose-500 focus:outline-hidden"
                  >
                    <option value="الرياض">الرياض</option>
                    <option value="صنعاء">صنعاء</option>
                    <option value="عدن">عدن</option>
                    <option value="تعز">تعز</option>
                    <option value="حضرموت">حضرموت</option>
                    <option value="الحديدة">الحديدة</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1.5">العنوان بالتفصيل *</label>
                  <input
                    type="text"
                    required
                    value={customerInfo.address}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, address: e.target.value })}
                    placeholder="مثال: شارع حدة - بجانب مركز الكميم"
                    className="w-full text-xs p-3 bg-stone-50 border border-stone-200 rounded-2xl focus:bg-white focus:border-rose-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">ملاحظات التوصيل (مثل: وقت التسليم المفضل، تغليف كهدية...)</label>
                <textarea
                  rows={2}
                  value={customerInfo.notes}
                  onChange={(e) => setCustomerInfo({ ...customerInfo, notes: e.target.value })}
                  placeholder="اكتب أي تعليمات أو ملاحظات خاصة هنا..."
                  className="w-full text-xs p-3 bg-stone-50 border border-stone-200 rounded-2xl focus:bg-white focus:border-rose-500 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Step 2: Shipping Method */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-xs">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-stone-100">
                <div className="w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center font-black text-sm">
                  2
                </div>
                <h2 className="text-base sm:text-lg font-black text-stone-900">سرعة التوصيل المفضلة</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label
                  className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                    customerInfo.deliverySpeed === 'standard'
                      ? 'border-rose-600 bg-rose-50/40'
                      : 'border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="deliverySpeed"
                    value="standard"
                    checked={customerInfo.deliverySpeed === 'standard'}
                    onChange={() => setCustomerInfo({ ...customerInfo, deliverySpeed: 'standard' })}
                    className="mt-1 text-rose-600 focus:ring-rose-500"
                  />
                  <div>
                    <span className="font-bold text-stone-900 block mb-0.5">توصيل قياسي مبرد 🚛</span>
                    <span className="text-stone-500 block mb-1">تصل خلال 2-4 أيام عمل مع الحفاظ على الفعالية</span>
                    <span className="font-bold text-emerald-600">
                      {standardFee === 0 ? 'شحن مجاني 🎉' : `${standardFee} ${settings.currency}`}
                    </span>
                  </div>
                </label>

                <label
                  className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                    customerInfo.deliverySpeed === 'express'
                      ? 'border-rose-600 bg-rose-50/40'
                      : 'border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="deliverySpeed"
                    value="express"
                    checked={customerInfo.deliverySpeed === 'express'}
                    onChange={() => setCustomerInfo({ ...customerInfo, deliverySpeed: 'express' })}
                    className="mt-1 text-rose-600 focus:ring-rose-500"
                  />
                  <div>
                    <span className="font-bold text-stone-900 block mb-0.5">توصيل إكسبرس سريع ⚡</span>
                    <span className="text-stone-500 block mb-1">خلال 24-48 ساعة أولوية قصوى</span>
                    <span className="font-bold text-rose-600">
                      +{expressExtraFee} {settings.currency} إضافية
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Step 3: Payment Options */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-xs">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-stone-100">
                <div className="w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center font-black text-sm">
                  3
                </div>
                <h2 className="text-base sm:text-lg font-black text-stone-900">طريقة الدفع وتأكيد الحساب</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label
                  className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                    customerInfo.paymentMethod === 'cod'
                      ? 'border-rose-600 bg-rose-50/40'
                      : 'border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="cod"
                    checked={customerInfo.paymentMethod === 'cod'}
                    onChange={() => setCustomerInfo({ ...customerInfo, paymentMethod: 'cod' })}
                    className="mt-1 text-rose-600 focus:ring-rose-500"
                  />
                  <div>
                    <div className="flex items-center gap-1.5 font-bold text-stone-900 mb-0.5">
                      <Banknote className="w-4 h-4 text-emerald-600" />
                      <span>الدفع عند الاستلام (COD)</span>
                    </div>
                    <span className="text-stone-500 block">الدفع نقداً أو عبر بطاقة مدى لمندوب التوصيل</span>
                  </div>
                </label>

                <label
                  className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                    customerInfo.paymentMethod === 'bank_transfer'
                      ? 'border-rose-600 bg-rose-50/40'
                      : 'border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="bank_transfer"
                    checked={customerInfo.paymentMethod === 'bank_transfer'}
                    onChange={() => setCustomerInfo({ ...customerInfo, paymentMethod: 'bank_transfer' })}
                    className="mt-1 text-rose-600 focus:ring-rose-500"
                  />
                  <div>
                    <div className="flex items-center gap-1.5 font-bold text-stone-900 mb-0.5">
                      <CreditCard className="w-4 h-4 text-rose-600" />
                      <span>تحويل بنكي فوري / مدى</span>
                    </div>
                    <span className="text-stone-500 block">إرسال إيصال التحويل عبر واتساب مباشرة</span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Left Column: Order Summary (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-stone-200 shadow-md space-y-6">
              <h2 className="text-lg font-black text-stone-900 pb-3 border-b border-stone-100 flex items-center justify-between">
                <span>ملخص السلة ({cartItems.reduce((s, i) => s + i.quantity, 0)} قطعة)</span>
                <span className="text-xs text-stone-500 font-normal">شحن آمن</span>
              </h2>

              {/* Cart Items List */}
              <div className="divide-y divide-stone-100 max-h-64 overflow-y-auto pr-1">
                {cartItems.map((item) => {
                  const unitPrice = getProductPricing(item.product).finalPrice;
                  return (
                    <div key={item.product.id} className="py-3 flex gap-3 items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img
                          src={item.product.image_url || undefined}
                          alt={item.product.title_ar}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80';
                          }}
                          className="w-14 h-14 rounded-xl object-cover border border-stone-200 shrink-0"
                        />
                        <div>
                          <h4 className="text-xs font-bold text-stone-900 line-clamp-1 max-w-[180px]">
                            {item.product.title_ar}
                          </h4>
                          <span className="text-[11px] text-stone-400">
                            {unitPrice} {settings.currency} × {item.quantity}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center border border-stone-200 rounded-lg bg-stone-50 p-0.5 text-xs">
                          <button
                            type="button"
                            onClick={() => onUpdateQuantity(item.product.id, -1)}
                            className="w-6 h-6 rounded bg-white hover:bg-stone-200 flex items-center justify-center font-bold cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center font-bold">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => onUpdateQuantity(item.product.id, 1)}
                            className="w-6 h-6 rounded bg-white hover:bg-stone-200 flex items-center justify-center font-bold cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="text-xs font-black text-stone-900 min-w-16 text-left">
                          {unitPrice * item.quantity} {settings.currency}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Coupon Code Section */}
              <div className="pt-2 border-t border-stone-100">
                {appliedCoupon ? (
                  <div className="flex items-center justify-between bg-emerald-50 text-emerald-800 p-3 rounded-2xl text-xs font-medium border border-emerald-200 animate-fadeIn">
                    <span className="flex items-center gap-1.5 font-bold">
                      <Tag className="w-4 h-4 text-emerald-600" />
                      تم تفعيل: {appliedCoupon}
                    </span>
                    <button
                      onClick={handleRemoveCoupon}
                      className="text-stone-500 hover:text-rose-600 text-xs font-bold underline cursor-pointer"
                    >
                      إلغاء
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleApplyCoupon} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="كود الخصم (جرب BEAUTY10)"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                      className="flex-1 text-xs bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 uppercase focus:outline-hidden focus:border-rose-500"
                    />
                    <button
                      type="submit"
                      className="bg-stone-800 hover:bg-stone-900 text-white text-xs px-4 py-2 rounded-xl font-bold transition-colors cursor-pointer"
                    >
                      تطبيق
                    </button>
                  </form>
                )}
                {couponError && <p className="text-[11px] text-rose-600 mt-1">{couponError}</p>}
              </div>

              {/* Price Calculations */}
              <div className="space-y-2 text-xs text-stone-600 pt-2 border-t border-stone-100">
                <div className="flex justify-between">
                  <span>المجموع الفرعي:</span>
                  <span className="font-bold text-stone-900">{traditionalSubtotal} {settings.currency}</span>
                </div>

                {couponDiscount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-bold">
                    <span>الخصم المطبق:</span>
                    <span>-{couponDiscount} {settings.currency}</span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span>رسوم التوصيل:</span>
                  <span>
                    {traditionalDeliveryFee === 0 ? (
                      <span className="text-emerald-600 font-bold">مجاني 🎉</span>
                    ) : (
                      <span className="font-bold text-stone-900">{traditionalDeliveryFee} {settings.currency}</span>
                    )}
                  </span>
                </div>

                <div className="flex justify-between text-base font-black text-stone-900 pt-3 border-t border-stone-200">
                  <span>الإجمالي النهائي للدفع:</span>
                  <span className="text-rose-600 text-xl font-black">
                    {traditionalGrandTotal} {settings.currency}
                  </span>
                </div>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleTraditionalPlaceOrder}
                disabled={isPlacingTraditional}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white py-4 px-6 rounded-2xl font-black text-sm shadow-xl hover:shadow-emerald-200 transition-all flex items-center justify-center gap-2.5 active:scale-98 cursor-pointer"
              >
                {isPlacingTraditional ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>جاري التحقق من المخزون وتأكيد الطلب...</span>
                  </>
                ) : (
                  <>
                    <MessageCircle className="w-5 h-5" />
                    <span>تأكيد الطلب وإرسال عبر واتساب ({traditionalGrandTotal} {settings.currency})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== CHECOUT MODE 2: VIDEO-TO-ORDER ===================== */}
      {checkoutMode === 'video' && (
        <div className="space-y-6">
          {/* Status Header Block */}
          <div className="bg-rose-50 border border-rose-100 p-5 rounded-3xl text-xs text-rose-950 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="font-black text-sm flex items-center gap-1.5 text-rose-800">
                <Sparkles className="w-4.5 h-4.5 text-rose-600 shrink-0" />
                ميزة الشراء الذكي بالفيديو (Video-to-Order)
              </span>
              <p className="text-stone-600 leading-relaxed max-w-2xl">
                ببساطة، قومي برفع مقطع فيديو تطلبين فيه منتجاتك بالصوت أو تستعرضينها مع ذكر اسمك ورقم جوالك وعنوان التوصيل، وسيقوم الذكاء الاصطناعي باستخراج المنتجات وعناوين الشحن وتأكيد طلبك فورا بلمحة بصر!
              </p>
            </div>
            <div className="text-[11px] bg-white border border-rose-200 rounded-xl px-3 py-2 text-stone-500 font-bold shrink-0 self-start md:self-auto">
              🔒 معالجة آمنة وسريعة • خصوصية تامة للملفات
            </div>
          </div>

          {!rawExtractedData ? (
            /* PHASE A: Upload & Process Area */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Drag & Drop Upload Block */}
              <div className="lg:col-span-8 bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-xs space-y-6">
                <h2 className="text-base sm:text-lg font-black text-stone-900 pb-3 border-b border-stone-100 flex items-center gap-2">
                  <Video className="w-5 h-5 text-rose-600" />
                  <span>خطوة 1: اختاري أو اسحبي فيديو الطلب</span>
                </h2>

                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all ${
                    isDragging
                      ? 'border-rose-500 bg-rose-50/20'
                      : videoFile
                      ? 'border-stone-300 bg-stone-50/20'
                      : 'border-stone-300 bg-stone-50/40 hover:border-rose-400'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    onChange={(e) => e.target.files && handleVideoFileCheck(e.target.files[0])}
                    className="hidden"
                  />

                  {videoPreviewUrl ? (
                    <div className="space-y-4">
                      <video
                        src={videoPreviewUrl || undefined}
                        controls
                        className="max-h-72 rounded-2xl mx-auto shadow-md border border-stone-200"
                      />
                      <div className="space-y-1 text-xs">
                        <p className="font-bold text-stone-800">{videoFile?.name}</p>
                        <p className="text-stone-400">الحجم: {videoFile ? (videoFile.size / 1024 / 1024).toFixed(1) : 0} MB</p>
                      </div>
                      <button
                        type="button"
                        onClick={triggerFileSelect}
                        className="text-xs bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold px-4 py-2 rounded-xl transition-all cursor-pointer border border-stone-200"
                      >
                        استبدال الفيديو
                      </button>
                    </div>
                  ) : (
                    <div onClick={triggerFileSelect} className="cursor-pointer space-y-3 py-6">
                      <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto shadow-xs">
                        <Upload className="w-8 h-8" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-stone-800">اسحبي فيديو الطلب إلى هنا أو انقري للتصفح</p>
                        <p className="text-xs text-stone-400">يدعم MP4, WebM, MOV بحد أقصى 50 ميجابايت</p>
                      </div>
                    </div>
                  )}
                </div>

                {videoFile && !isAnalyzing && (
                  <button
                    onClick={handleAnalyzeVideo}
                    className="w-full bg-rose-600 hover:bg-rose-700 text-white py-4 px-6 rounded-2xl font-black text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Sparkles className="w-5 h-5 animate-pulse" />
                    <span>ابدئي معالجة واستخراج بيانات الفيديو بالذكاء الاصطناعي</span>
                  </button>
                )}

                {isAnalyzing && (
                  <div className="bg-rose-50/50 border border-rose-100 p-6 rounded-3xl space-y-4 animate-pulse">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 text-rose-600 animate-spin" />
                      <span className="text-xs font-bold text-rose-900">جاري رفع وتحليل الفيديو بالذكاء الاصطناعي... {analysisProgress}%</span>
                    </div>
                    <div className="w-full bg-stone-100 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-rose-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${analysisProgress}%` }}
                      ></div>
                    </div>
                    <p className="text-[11px] text-stone-400">
                      ملاحظة: نقوم برفع الفيديو وتمريره لنموذج Gemini Multimodal لاستخراج المنتجات وعنوان الشحن. قد تستغرق العملية ما يصل إلى دقيقة وفقاً لحجم الفيديو وسرعة الاتصال.
                    </p>
                  </div>
                )}
              </div>

              {/* Guide and Warnings Box */}
              <div className="lg:col-span-4 bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-5">
                <h3 className="font-black text-sm text-stone-900 flex items-center gap-2 pb-3 border-b border-stone-100">
                  <Clock className="w-4 h-4 text-rose-600" />
                  <span>نصائح للحصول على دقة 100%</span>
                </h3>
                <ul className="text-xs text-stone-600 space-y-2.5 list-disc list-inside pr-1">
                  <li>اذكري <strong>اسمكِ بالكامل ورقم الجوال</strong> بوضوح أثناء الفيديو أو أظهري ورقة مطبوعة بها تفاصيل عنوانكِ.</li>
                  <li>استعرضي المنتجات التي ترغبين في شرائها عن قرب ليتعرف عليها الذكاء الاصطناعي.</li>
                  <li>حددي مدينة التوصيل (مثال: صنعاء، عدن، تعز) بوضوح لضمان احتساب الشحن الصحيح.</li>
                  <li>لا تقلقي! بعد انتهاء الاستخراج ستظهر لكِ مراجعة كاملة لتعديل أي تفاصيل يدوياً قبل تأكيد الطلب الفعلي.</li>
                </ul>
              </div>
            </div>
          ) : (
            /* PHASE B: Order Preview, Mapping, and Validations Screen */
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-stone-200">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-rose-600" />
                  <h2 className="text-base sm:text-lg font-black text-stone-900">مراجعة ومطابقة الطلب المستخرج</h2>
                </div>
                <div className="flex items-center gap-3">
                  {/* Confidence Display */}
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 border border-stone-200 rounded-xl text-stone-700 text-xs font-bold">
                    <span>نسبة دقة الاستخراج:</span>
                    <span className={`font-black ${confidence >= 0.8 ? 'text-emerald-600' : confidence >= 0.5 ? 'text-amber-600' : 'text-rose-600'}`}>
                      {Math.round(confidence * 100)}%
                    </span>
                  </div>
                  <button
                    onClick={() => setIsEditMode(!isEditMode)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold cursor-pointer transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>{isEditMode ? 'حفظ البيانات' : 'تعديل البيانات'}</span>
                  </button>
                </div>
              </div>

              {/* Warning Banners List */}
              {warnings.length > 0 && (
                <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl space-y-2">
                  <span className="text-xs font-black text-rose-900 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    تنبيهات وملاحظات تتطلب مراجعتكِ:
                  </span>
                  <ul className="text-xs text-rose-800 list-disc list-inside space-y-1 pr-1 font-bold">
                    {warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Right Area: Customer & Matched Products Cards */}
                <div className="lg:col-span-7 space-y-6">
                  
                  {/* Customer Info Card */}
                  <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-xs space-y-4">
                    <h3 className="font-black text-sm text-stone-900 pb-2 border-b border-stone-100 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-rose-600" />
                      <span>تفاصيل العميل وعنوان شحن الفيديو</span>
                    </h3>

                    {isEditMode ? (
                      /* Input fields when in edit mode */
                      <div className="space-y-3.5 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block font-bold text-stone-700 mb-1">اسم العميل بالكامل</label>
                            <input
                              type="text"
                              value={editedName}
                              onChange={(e) => setEditedName(e.target.value)}
                              className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl"
                            />
                          </div>
                          <div>
                            <label className="block font-bold text-stone-700 mb-1">رقم الجوال</label>
                            <input
                              type="tel"
                              value={editedPhone}
                              onChange={(e) => setEditedPhone(e.target.value)}
                              className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-left"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block font-bold text-stone-700 mb-1">المدينة / المحافظة</label>
                            <input
                              type="text"
                              value={editedCity}
                              onChange={(e) => setEditedCity(e.target.value)}
                              className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl"
                            />
                          </div>
                          <div>
                            <label className="block font-bold text-stone-700 mb-1">العنوان بالتفصيل</label>
                            <input
                              type="text"
                              value={editedAddress}
                              onChange={(e) => setEditedAddress(e.target.value)}
                              className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block font-bold text-stone-700 mb-1">ملاحظات العميل</label>
                          <textarea
                            rows={2}
                            value={editedNotes}
                            onChange={(e) => setEditedNotes(e.target.value)}
                            className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl"
                          />
                        </div>
                      </div>
                    ) : (
                      /* Display text read-only when not editing */
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-xs text-stone-600 bg-stone-50/60 p-4 rounded-2xl border border-stone-100">
                        <div>
                          <span className="block text-stone-400 mb-0.5">اسم العميل:</span>
                          <strong className="text-stone-900 text-sm">{editedName || '---'}</strong>
                        </div>
                        <div>
                          <span className="block text-stone-400 mb-0.5">رقم الجوال:</span>
                          <strong className="text-stone-900 font-mono text-sm">{editedPhone || '---'}</strong>
                        </div>
                        <div>
                          <span className="block text-stone-400 mb-0.5">المدينة:</span>
                          <strong className="text-stone-900">{editedCity || '---'}</strong>
                        </div>
                        <div>
                          <span className="block text-stone-400 mb-0.5">العنوان بالتفصيل:</span>
                          <strong className="text-stone-900">{editedAddress || '---'}</strong>
                        </div>
                        {editedNotes && (
                          <div className="sm:col-span-2">
                            <span className="block text-stone-400 mb-0.5">ملاحظات إضافية:</span>
                            <p className="text-stone-700">{editedNotes}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Matched Products Card */}
                  <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-xs space-y-4">
                    <h3 className="font-black text-sm text-stone-900 pb-2 border-b border-stone-100 flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-rose-600" />
                      <span>المنتجات المستخرجة ومطابقتها مع المتجر</span>
                    </h3>

                    <div className="divide-y divide-stone-100">
                      {editedItems.map((item, idx) => {
                        const matched = matchedItems[idx];
                        const matchedProd = matched ? products.find(p => p.id === matched.productId) : null;

                        return (
                          <div key={item.id} className="py-4 space-y-3.5">
                            {/* Raw extracted name vs resolved product row */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                              <div>
                                <span className="text-[10px] bg-stone-100 text-stone-500 px-2 py-0.5 rounded-md font-bold block w-fit mb-1">
                                  الاسم المستخرج من الفيديو: "{item.product_name_raw}"
                                </span>
                                <div className="flex items-center gap-2">
                                  {matchedProd ? (
                                    <>
                                      <img
                                        src={matchedProd.image_url || undefined}
                                        alt={matchedProd.title_ar}
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).src =
                                            'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80';
                                        }}
                                        className="w-10 h-10 rounded-lg object-cover border border-stone-200"
                                      />
                                      <strong className="text-stone-950 font-bold">{matchedProd.title_ar}</strong>
                                    </>
                                  ) : (
                                    <span className="text-rose-600 font-bold flex items-center gap-1">
                                      <XCircle className="w-4 h-4" />
                                      لم تتم مطابقة هذا المنتج تلقائياً
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Controls: quantity or mapping dropdown */}
                              <div className="flex items-center gap-2 self-end sm:self-auto">
                                <div className="flex items-center border border-stone-200 rounded-lg bg-stone-50 p-0.5 text-xs">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...editedItems];
                                      updated[idx].quantity = Math.max(1, item.quantity - 1);
                                      setEditedItems(updated);
                                    }}
                                    className="w-6 h-6 rounded bg-white hover:bg-stone-200 flex items-center justify-center font-bold"
                                  >
                                    -
                                  </button>
                                  <span className="w-6 text-center font-bold">{item.quantity}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...editedItems];
                                      updated[idx].quantity = item.quantity + 1;
                                      setEditedItems(updated);
                                    }}
                                    className="w-6 h-6 rounded bg-white hover:bg-stone-200 flex items-center justify-center font-bold"
                                  >
                                    +
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditedItems(editedItems.filter(it => it.id !== item.id));
                                  }}
                                  className="p-1 bg-stone-50 hover:bg-rose-50 text-stone-400 hover:text-rose-600 rounded-lg transition-colors border border-stone-200 cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {/* Dropdown mapping selector if ambiguous or unmatched */}
                            {(!matchedProd || warnings.some(w => w.includes(item.product_name_raw))) && (
                              <div className="bg-amber-50/50 border border-amber-200 p-3 rounded-2xl space-y-1.5 text-xs animate-fadeIn">
                                <span className="font-bold text-amber-900 block">ربط يدوي وتصحيح المطابقة:</span>
                                <select
                                  value={item.resolvedProductId}
                                  onChange={(e) => {
                                    const updated = [...editedItems];
                                    updated[idx].resolvedProductId = e.target.value;
                                    setEditedItems(updated);
                                  }}
                                  className="w-full text-xs p-2.5 bg-white border border-stone-200 rounded-xl focus:outline-hidden"
                                >
                                  <option value="">-- اختاري المنتج المطابق من المتجر --</option>
                                  {products.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.title_ar} ({p.discount_price ?? p.original_price} ريال • متوفر {p.stock_quantity})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Left Area: Server Trusted Calculations, Idempotence & Confirm */}
                <div className="lg:col-span-5 space-y-6">
                  <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-md space-y-6">
                    <h2 className="text-base sm:text-lg font-black text-stone-900 pb-3 border-b border-stone-100 flex items-center justify-between">
                      <span>تفاصيل الفاتورة الرسمية للطلب</span>
                      <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">
                        أسعار موثوقة من قاعدة البيانات ✓
                      </span>
                    </h2>

                    {/* Calculated Prices Block */}
                    <div className="space-y-2 text-xs text-stone-600">
                      <div className="flex justify-between">
                        <span>مجموع المنتجات المعتمدة:</span>
                        <span className="font-bold text-stone-900">{videoSubtotal} ريال</span>
                      </div>

                      <div className="flex justify-between">
                        <span>رسوم شحن التوصيل للمدينة:</span>
                        <span className="font-bold text-stone-900">{matchedDeliveryFee} ريال</span>
                      </div>

                      <div className="flex justify-between text-base font-black text-stone-900 pt-3 border-t border-stone-200">
                        <span>الإجمالي الإجمالي المطلوب:</span>
                        <span className="text-rose-600 text-xl font-black">{videoGrandTotal} ريال</span>
                      </div>
                    </div>

                    {/* Confirm and Cancel Buttons */}
                    <div className="space-y-2 pt-2 border-t border-stone-100">
                      <button
                        onClick={handleConfirmVideoOrder}
                        disabled={isConfirming || matchedItems.length === 0}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 text-white py-4 px-6 rounded-2xl font-black text-sm shadow-xl hover:shadow-emerald-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {isConfirming ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>جاري تسجيل وحفظ الطلب...</span>
                          </>
                        ) : (
                          <>
                            <MessageCircle className="w-5 h-5" />
                            <span>تأكيد طلب الفيديو عبر واتساب ({videoGrandTotal} ريال)</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={handleCancelVideoOrder}
                        disabled={isConfirming}
                        className="w-full bg-stone-100 hover:bg-stone-200 text-stone-700 py-3 px-6 rounded-2xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer border border-stone-200"
                      >
                        إلغاء المراجعة ومسح البيانات
                      </button>
                    </div>

                    <div className="text-[10px] text-stone-400 text-center space-y-1">
                      <p>🔒 تأمين وحماية المعاملة بنظام Idempotency لضمان عدم تكرار الخصم أو تسجيل الطلب مرتين.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CheckoutPage;
