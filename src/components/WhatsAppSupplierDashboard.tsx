import React, { useState, useRef, useEffect } from 'react';
import {
  Video,
  Upload,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  DollarSign,
  Plus,
  Trash2,
  RefreshCw,
  X,
  UserCheck,
  Package,
  TrendingUp,
  Percent,
  CheckSquare,
} from 'lucide-react';
import { getAuthHeadersAsync } from '../lib/storage.ts';
import { SupplierImportResult } from '../features/whatsapp-supplier-ai/types/index.ts';

export const WhatsAppSupplierDashboard: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string>('');
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<SupplierImportResult | null>(null);

  // Form states for review
  const [supplierName, setSupplierName] = useState('');
  const [whatsappName, setWhatsappName] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [confidence, setConfidence] = useState(1.0);
  
  interface ProductDraftItem {
    id: string;
    name: string;
    description: string;
    supplierCost: number;
    markupPercent: number;
    stockQuantity: number;
  }
  const [draftProducts, setProductDrafts] = useState<ProductDraftItem[]>([]);

  // Import Submission states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importSuccessData, setImportSuccessData] = useState<any>(null);

  // Local Toast notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    return () => {
      if (videoPreview) {
        URL.revokeObjectURL(videoPreview);
      }
    };
  }, [videoPreview]);

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleVideoFileCheck = (file: File) => {
    const allowedExtensions = ['.mp4', '.webm', '.mov'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedExtensions.includes(ext) && !file.type.startsWith('video/')) {
      showToast('يرجى اختيار مقطع فيديو بصيغة MP4, WebM أو MOV فقط.', 'error');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      showToast('حجم الملف كبير جداً. الحد الأقصى المسموح به هو 50 ميجابايت.', 'error');
      return;
    }

    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
    showToast('تم تحميل فيديو المورد بنجاح، جاهز للتحليل.', 'success');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleVideoFileCheck(e.dataTransfer.files[0]);
    }
  };

  const handleAnalyzeSupplierVideo = async () => {
    if (!videoFile) return;

    setIsAnalyzing(true);
    setAnalysisProgress(10);
    setAnalysisResult(null);

    const interval = setInterval(() => {
      setAnalysisProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + 5;
      });
    }, 1500);

    try {
      const authHeaders = await getAuthHeadersAsync();
      if (!authHeaders.Authorization) {
        throw new Error('يرجى تسجيل الدخول كمسؤول للنظام للتمكن من معالجة البيانات.');
      }

      setAnalysisProgress(25);

      const formData = new FormData();
      formData.append('video', videoFile);

      const res = await fetch('/api/whatsapp-supplier-ai/analyze', {
        method: 'POST',
        headers: authHeaders,
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'فشلت معالجة وتحليل فيديو المورد.');
      }

      const json = await res.json();
      setAnalysisProgress(100);
      clearInterval(interval);

      if (json.success && json.data) {
        const data: SupplierImportResult = json.data;
        setAnalysisResult(data);
        setSupplierName(data.supplier.name || '');
        setWhatsappName(data.supplier.whatsappName || '');
        setWhatsappPhone(data.supplier.whatsappPhone || '');
        setConfidence(data.supplier.confidence ?? 1.0);

        const mappedProducts = (data.products || []).map((p: any, idx: number) => ({
          id: `p-${idx}-${Date.now()}`,
          name: p.name || 'مستحضر تجميل مورد',
          description: p.description || '',
          supplierCost: Number(p.supplierCost ?? 50),
          markupPercent: 30, // 30% default markup margin
          stockQuantity: 20,
        }));
        setProductDrafts(mappedProducts);

        showToast('تم تحليل واستخراج كتالوج المورد بالذكاء الاصطناعي بنجاح!', 'success');
      } else {
        throw new Error('فشل استخراج البيانات المهيكلة من المقطع.');
      }

    } catch (e: any) {
      clearInterval(interval);
      setAnalysisProgress(0);
      setIsAnalyzing(false);
      showToast(e.message || 'فشل معالجة الفيديو.', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAddNewProductDraft = () => {
    const newItem = {
      id: `p-new-${Date.now()}`,
      name: 'منتج مورد جديد',
      description: '',
      supplierCost: 50,
      markupPercent: 30,
      stockQuantity: 15,
    };
    setProductDrafts([...draftProducts, newItem]);
    showToast('تمت إضافة مسودة منتج جديدة.', 'info');
  };

  const handleRemoveProductDraft = (id: string) => {
    setProductDrafts(draftProducts.filter(p => p.id !== id));
    showToast('تمت إزالة مسودة المنتج من القائمة.', 'info');
  };

  const handleConfirmSupplierImport = async () => {
    if (!supplierName.trim() || !whatsappPhone.trim()) {
      showToast('يرجى ملء اسم المورد ورقم جوال الواتساب للمتابعة.', 'error');
      return;
    }

    if (draftProducts.length === 0) {
      showToast('قائمة المنتجات فارغة. يرجى إضافة منتج واحد على الأقل للاستيراد.', 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      const authHeaders = await getAuthHeadersAsync();
      if (!authHeaders.Authorization) {
        throw new Error('يرجى تسجيل الدخول أولاً كمسؤول.');
      }

      const postBody = {
        supplier: {
          name: supplierName,
          whatsappName,
          whatsappPhone,
        },
        products: draftProducts.map(p => ({
          name: p.name,
          description: p.description,
          supplierCost: p.supplierCost,
          markupPercent: p.markupPercent,
          stockQuantity: p.stockQuantity,
        })),
      };

      const res = await fetch('/api/whatsapp-supplier-ai/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify(postBody),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'فشلت معالجة واعتماد المورد.');
      }

      const json = await res.json();
      if (json.success && json.data) {
        setImportSuccessData(json.data);
        showToast('تم اعتماد المورد وحفظ قائمة كتالوج المنتجات في Firestore!', 'success');
      }

    } catch (e: any) {
      showToast(e.message || 'فشلت عملية الاعتماد والاستيراد.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelAndReset = () => {
    if (window.confirm('هل تريد إلغاء مراجعة فيديو المورد الحالي ومسح البيانات؟')) {
      setVideoFile(null);
      if (videoPreview) URL.revokeObjectURL(videoPreview);
      setVideoPreview('');
      setAnalysisResult(null);
      setProductDrafts([]);
      setImportSuccessData(null);
      showToast('تم تصفير البيانات والرجوع للبداية.', 'info');
    }
  };

  // --- RENDERING VIEWS ---

  if (importSuccessData) {
    return (
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm max-w-4xl mx-auto text-center space-y-6 animate-fadeIn">
        <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200 shadow-xs">
          <CheckCircle2 className="w-8 h-8" />
        </div>

        <div className="space-y-1">
          <span className="text-xs font-bold text-rose-600 uppercase tracking-widest block">الذكاء الاصطناعي للمشتريات ✓</span>
          <h2 className="text-xl sm:text-2xl font-black text-stone-900">تم استيراد واعتماد المورد بنجاح!</h2>
          <p className="text-stone-500 text-xs sm:text-sm max-w-md mx-auto">
            تم تسجيل بيانات المورد وتوليد الكود التعريفي الذري وحفظ مسودات المنتجات بنجاح في قاعدة البيانات.
          </p>
        </div>

        {/* Success Metadata Summary Box */}
        <div className="bg-stone-50 border border-stone-200 rounded-3xl p-6 text-right text-xs space-y-4 max-w-2xl mx-auto">
          <div className="flex items-center justify-between pb-2 border-b border-stone-100">
            <span className="text-stone-500">اسم المورد المعتمد:</span>
            <span className="font-bold text-stone-900">{importSuccessData.supplier.name}</span>
          </div>
          <div className="flex items-center justify-between pb-2 border-b border-stone-100">
            <span className="text-stone-500">كود المورد الموحد:</span>
            <span className="font-mono font-black text-rose-600 text-sm">{importSuccessData.supplier.code}</span>
          </div>
          <div className="flex items-center justify-between pb-2 border-b border-stone-100">
            <span className="text-stone-500">رقم جوال الواتساب للمورد:</span>
            <span className="font-mono font-bold text-stone-900">{importSuccessData.supplier.whatsappPhone}</span>
          </div>
          <div className="flex items-center justify-between pb-2 border-b border-stone-100">
            <span className="text-stone-500">عدد المنتجات المدرجة كمسودة:</span>
            <span className="font-bold text-stone-900">{importSuccessData.drafts?.length || 0} منتجات</span>
          </div>
        </div>

        <button
          onClick={() => {
            setVideoFile(null);
            if (videoPreview) URL.revokeObjectURL(videoPreview);
            setVideoPreview('');
            setAnalysisResult(null);
            setProductDrafts([]);
            setImportSuccessData(null);
          }}
          className="bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs sm:text-sm px-6 py-3 rounded-2xl shadow-md transition-all cursor-pointer inline-flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          <span>تحليل واستيراد مقطع مورد آخر</span>
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm relative">
      {/* Absolute Toast */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-xl animate-fadeIn border ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : toast.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
          ) : toast.type === 'error' ? (
            <AlertCircle className="w-4.5 h-4.5 text-rose-600 shrink-0" />
          ) : (
            <Sparkles className="w-4.5 h-4.5 text-blue-600 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header section */}
      <div className="pb-5 mb-6 border-b border-stone-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-stone-900 flex items-center gap-2">
            <Sparkles className="w-5.5 h-5.5 text-rose-600" />
            <span>نظام الذكاء الاصطناعي لمستودعات الموردين (WhatsApp Supplier AI)</span>
          </h2>
          <p className="text-xs text-stone-500 mt-1">
            ارفعي فيديوهات المنتجات المستلمة من الموردين على واتساب لإنشاء سجلات الموردين وتوليد كود المورد الموحد (SUP-XXXX) واستيراد عينات مسودات المنتجات تلقائياً.
          </p>
        </div>
        <div className="text-[10px] bg-rose-50 text-rose-700 px-3 py-1.5 rounded-xl border border-rose-100 font-bold shrink-0 self-start md:self-auto">
          🔒 معزول وآمن ومثبت بـ Firestore Transactions
        </div>
      </div>

      {!analysisResult ? (
        /* Upload Area */
        <div className="space-y-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all ${
              isDragging
                ? 'border-rose-500 bg-rose-50/10'
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

            {videoPreview ? (
              <div className="space-y-4">
                <video
                  src={videoPreview}
                  controls
                  className="max-h-64 rounded-2xl mx-auto shadow-md border border-stone-200"
                />
                <div className="text-xs text-stone-500">
                  <p className="font-bold text-stone-800">{videoFile?.name}</p>
                  <p>الحجم: {videoFile ? (videoFile.size / 1024 / 1024).toFixed(1) : 0} MB</p>
                </div>
                <button
                  type="button"
                  onClick={triggerFileSelect}
                  className="text-[11px] bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold px-3.5 py-1.5 rounded-xl border border-stone-200 cursor-pointer"
                >
                  استبدال الفيديو
                </button>
              </div>
            ) : (
              <div onClick={triggerFileSelect} className="cursor-pointer space-y-3 py-6">
                <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto">
                  <Upload className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm font-bold text-stone-800">اسحبي مقطع المورد إلى هنا أو انقري للتصفح</p>
                  <p className="text-[11px] text-stone-400">يدعم صيغ MP4, WebM, MOV بحد أقصى 50MB</p>
                </div>
              </div>
            )}
          </div>

          {videoFile && !isAnalyzing && (
            <button
              onClick={handleAnalyzeSupplierVideo}
              className="w-full bg-rose-600 hover:bg-rose-700 text-white py-3.5 px-6 rounded-2xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 animate-pulse" />
              <span>البدء في استخراج ومطابقة بيانات المورد والمنتجات</span>
            </button>
          )}

          {isAnalyzing && (
            <div className="bg-stone-50 border border-stone-200 p-5 rounded-3xl space-y-3 animate-pulse">
              <div className="flex items-center gap-2.5 text-xs text-stone-700 font-bold">
                <Loader2 className="w-4 h-4 text-rose-600 animate-spin" />
                <span>جاري إرسال مقطع المورد لـ Gemini وتحليله... {analysisProgress}%</span>
              </div>
              <div className="w-full bg-stone-100 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-rose-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${analysisProgress}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Review UI Block */
        <div className="space-y-6">
          {/* Top Review actions & status */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-100">
            <span className="text-xs font-bold text-stone-700 flex items-center gap-2">
              <TrendingUp className="w-4.5 h-4.5 text-rose-600" />
              <span>معدل موثوقية استخراج البيانات:</span>
              <span className={`font-black ${confidence >= 0.8 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {Math.round(confidence * 100)}%
              </span>
            </span>

            <button
              onClick={handleAddNewProductDraft}
              className="bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 self-end sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة مسودة منتج يدوياً</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Area: Supplier and Product Cards */}
            <div className="lg:col-span-8 space-y-6 text-xs text-stone-700">
              
              {/* Supplier Info */}
              <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-4">
                <h3 className="font-black text-sm text-stone-900 pb-2 border-b border-stone-100 flex items-center gap-2">
                  <UserCheck className="w-4.5 h-4.5 text-rose-600" />
                  <span>معلومات المورد المستخرجة</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-bold">
                  <div>
                    <label className="block text-stone-500 mb-1">اسم المورد المكتشف</label>
                    <input
                      type="text"
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-stone-500 mb-1">الاسم على واتساب</label>
                    <input
                      type="text"
                      value={whatsappName}
                      onChange={(e) => setWhatsappName(e.target.value)}
                      className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-stone-500 mb-1">رقم واتساب المورد *</label>
                    <input
                      type="text"
                      value={whatsappPhone}
                      onChange={(e) => setWhatsappPhone(e.target.value)}
                      className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-left"
                    />
                  </div>
                </div>
              </div>

              {/* Products Catalog Drafts */}
              <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-4">
                <h3 className="font-black text-sm text-stone-900 pb-2 border-b border-stone-100 flex items-center gap-2">
                  <Package className="w-4.5 h-4.5 text-rose-600" />
                  <span>قائمة عينات الكتالوج المستخرج ({draftProducts.length})</span>
                </h3>

                <div className="divide-y divide-stone-100 max-h-[50vh] overflow-y-auto pr-1">
                  {draftProducts.map((prod, idx) => {
                    const salePrice = Math.round(prod.supplierCost * (1 + prod.markupPercent / 100));

                    return (
                      <div key={prod.id} className="py-4 space-y-3 font-bold animate-fadeIn">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex-1">
                            <label className="block text-[10px] text-stone-400 mb-0.5">اسم المنتج المستخرج</label>
                            <input
                              type="text"
                              value={prod.name}
                              onChange={(e) => {
                                const updated = [...draftProducts];
                                updated[idx].name = e.target.value;
                                setProductDrafts(updated);
                              }}
                              className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-xs"
                            />
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                            <button
                              type="button"
                              onClick={() => handleRemoveProductDraft(prod.id)}
                              className="p-1.5 bg-stone-50 hover:bg-rose-50 text-stone-400 hover:text-rose-600 rounded-lg border border-stone-200 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Cost, Margin, Pricing fields */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                          <div>
                            <label className="block text-[10px] text-stone-400 mb-0.5">سعر التكلفة (ريال)</label>
                            <input
                              type="number"
                              value={prod.supplierCost}
                              onChange={(e) => {
                                const updated = [...draftProducts];
                                updated[idx].supplierCost = parseFloat(e.target.value) || 0;
                                setProductDrafts(updated);
                              }}
                              className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] text-stone-400 mb-0.5">هامش الربح المقترح (%)</label>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={prod.markupPercent}
                                onChange={(e) => {
                                  const updated = [...draftProducts];
                                  updated[idx].markupPercent = parseFloat(e.target.value) || 0;
                                  setProductDrafts(updated);
                                }}
                                className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] text-stone-400 mb-0.5">سعر البيع المحسوب</label>
                            <div className="p-2 bg-emerald-50 text-emerald-800 rounded-lg font-black border border-emerald-100 text-center text-xs">
                              {salePrice} ريال
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] text-stone-400 mb-0.5">الكمية المقدرة</label>
                            <input
                              type="number"
                              value={prod.stockQuantity}
                              onChange={(e) => {
                                const updated = [...draftProducts];
                                updated[idx].stockQuantity = parseInt(e.target.value) || 0;
                                setProductDrafts(updated);
                              }}
                              className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg"
                            />
                          </div>
                        </div>

                        {/* Description field */}
                        <div>
                          <label className="block text-[10px] text-stone-400 mb-0.5">الوصف والخصائص المستخرجة</label>
                          <textarea
                            rows={1}
                            value={prod.description}
                            onChange={(e) => {
                              const updated = [...draftProducts];
                              updated[idx].description = e.target.value;
                              setProductDrafts(updated);
                            }}
                            className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-[11px]"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Left Area: Submit Actions */}
            <div className="lg:col-span-4 bg-white rounded-3xl p-6 border border-stone-200 shadow-md text-xs text-stone-600 space-y-4">
              <h3 className="font-black text-sm text-stone-900 pb-2 border-b border-stone-100 flex items-center gap-2">
                <CheckSquare className="w-4.5 h-4.5 text-rose-600" />
                <span>الاعتماد والتسجيل السحابي</span>
              </h3>
              <p className="leading-relaxed">
                عند النقر على تأكيد الاستيراد، يقوم السيرفر بأخذ البيانات ومعالجتها داخل <strong>Firestore Multi-Document Transaction</strong> ذرية بالكامل:
              </p>
              <ul className="list-disc list-inside space-y-1.5 font-bold text-stone-700">
                <li>توليد كود المورد الفريد SUP-XXXX تلقائياً.</li>
                <li>حفظ ملف التعريف للمورد بقاعدة البيانات.</li>
                <li>تسجيل المنتجات المدرجة كمسودات تسعير حقيقية.</li>
              </ul>

              <div className="space-y-2 pt-3 border-t border-stone-100">
                <button
                  onClick={handleConfirmSupplierImport}
                  disabled={isSubmitting || draftProducts.length === 0}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 text-white py-3.5 px-6 rounded-2xl font-black text-xs shadow-lg hover:shadow-emerald-100 transition-all flex items-center justify-center gap-2 cursor-pointer animate-pulse"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جاري الحفظ والاعتماد السحابي...</span>
                    </>
                  ) : (
                    <>
                      <UserCheck className="w-4.5 h-4.5" />
                      <span>تأكيد استيراد المورد والمنتجات</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleCancelAndReset}
                  disabled={isSubmitting}
                  className="w-full bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-700 py-2.5 px-6 rounded-2xl font-bold transition-all cursor-pointer text-[11px]"
                >
                  إلغاء المعالجة والرجوع للبداية
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatsAppSupplierDashboard;
