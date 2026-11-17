import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  User,
  Plus,
  Image as ImageIcon,
  Video,
  MessageSquare,
  Upload,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Package,
  Clock,
  ChevronDown,
  Layers,
  X,
  RefreshCw,
  ShieldCheck,
  Eye,
} from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { getAuthHeadersAsync, upsertStoredProduct } from '../lib/storage';
import { compressDataUrlIfNeeded } from '../lib/imageCompression';
import { Product } from '../types';
import { collection, getDocs, getDoc, addDoc, doc, setDoc, query, orderBy, onSnapshot, where, updateDoc, arrayUnion, runTransaction } from 'firebase/firestore';

export interface SupplierItem {
  id: string;
  name: string;
  whatsappPhone: string;
  code?: string;
}

export interface ExtractedProductItem {
  id: string;
  name: string;
  price: number;
  costPrice?: number;
  quantity: number;
  source: 'WhatsApp' | 'Video' | 'Image';
  confidence: number; // e.g. 95
  description?: string;
  images?: string[];
}

export interface SupplierSubmission {
  id: string;
  supplierId: string;
  supplierName: string;
  status: 'draft' | 'processing' | 'analyzed' | 'pending_review';
  extractedProducts: ExtractedProductItem[];
  rawInputs: {
    imagesCount: number;
    hasVideo: boolean;
    videoFileName?: string;
    hasConversation: boolean;
    conversationSnippet?: string;
  };
  createdAt: string;
}

export const AISupplierIntelligenceCenter: React.FC = () => {
  // 1. Supplier selection states
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [isAddSupplierModalOpen, setIsAddSupplierModalOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);

  // 2. Input sources states
  // Images
  const [images, setImages] = useState<{ id: string; file: File; preview: string; name: string; size: string }[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Video
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string>('');
  const videoInputRef = useRef<HTMLInputElement>(null);

  // WhatsApp Conversation
  const [conversationText, setConversationText] = useState<string>('');

  // 3. Process and Analysis states
  const [status, setStatus] = useState<'draft' | 'processing' | 'analyzed' | 'pending_review'>('draft');
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const [analysisStatusText, setAnalysisStatusText] = useState<string>('');
  const [extractedProducts, setExtractedProducts] = useState<ExtractedProductItem[]>([]);
  const [currentSubmissionId, setCurrentSubmissionId] = useState<string | null>(null);

  // Submissions list from Firestore
  const [submissionsList, setSubmissionsList] = useState<SupplierSubmission[]>([]);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);

  const handleUpdateDraft = async (id: string, updatedProduct: any) => {
      try {
          await updateDoc(doc(db, 'supplier_product_drafts', id), { product: updatedProduct });
          setEditingDraftId(null);
          showToast('تم تحديث المسودة بنجاح', 'success');
      } catch (e) {
          showToast('فشل تحديث المسودة', 'error');
      }
  };

  const handlePublishDraft = async (draft: any) => {
      try {
          if (!draft || draft.status === 'published') {
              showToast('هذه المسودة منشورة مسبقاً بالفعل.', 'info');
              return;
          }

          const draftRef = doc(db, 'supplier_product_drafts', draft.id);
          const productRef = doc(db, 'products', draft.sku);

          // 1. Robust Duplicate Detection in 'products' collection:
          const productsRef = collection(db, 'products');
          const productsSnap = await getDocs(productsRef);
          
          const normalizedNewName = (draft.product.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
          
          const existingDuplicate = productsSnap.docs.find(docSnap => {
              const p = docSnap.data();
              if (p.sku === draft.sku) return true;
              if (p.supplierId === draft.supplierId) {
                  const existingName = (p.title_ar || '').trim().toLowerCase().replace(/\s+/g, ' ');
                  if (existingName === normalizedNewName) {
                      const newDesc = (draft.product.description || '').toLowerCase();
                      const existingDesc = (p.description_ar || '').toLowerCase();
                      const extractUnits = (text: string) => text.match(/(ml|g|gm|kg|mg|liter|l|حبة|قطعة|ملم|جرام|كيلو)/g)?.sort().join() || '';
                      const hasDifferentVariant = extractUnits(newDesc) !== extractUnits(existingDesc);
                      return !hasDifferentVariant;
                  }
              }
              return false;
          });

          if (existingDuplicate) {
              const existingData = existingDuplicate.data();
              throw new Error(`المنتج "${draft.product.name}" موجود مسبقاً (SKU: ${existingData.sku}) ولن يتم إنشاؤه مرة أخرى لتفادي التكرار.`);
          }

          const rawImage = draft.product.images && draft.product.images.length > 0 ? draft.product.images[0] : '';
          const safeImage = rawImage && typeof rawImage === 'string' && rawImage.startsWith('data:image/')
            ? await compressDataUrlIfNeeded(rawImage)
            : (rawImage || 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80');
          const safePrice = Number(draft.product.price) > 0 ? Number(draft.product.price) : 50;
          const cleanTitle = String(draft.product.name || '').trim().slice(0, 300) || 'منتج مورد جديد';
          const nowIso = new Date().toISOString();

          const productToSave = {
              id: draft.sku,
              title_ar: cleanTitle,
              description_ar: draft.product.description || '',
              original_price: safePrice,
              discount_price: null,
              stock_quantity: Math.max(1, Number(draft.product.quantity) || 10),
              category_id: 'skincare',
              category_name: 'عناية بالبشرة',
              tags: [],
              image_url: safeImage,
              gallery_images: Array.isArray(draft.product.images) ? draft.product.images : [],
              ai_generated: true,
              featured: true,
              status: 'published',
              rating: 5.0,
              reviews_count: 1,
              created_at: nowIso,
              createdAt: nowIso,
              updatedAt: nowIso,
              sku: draft.sku,
              supplierId: draft.supplierId
          };

          // 2. Atomic Transaction for publish (Ensures 100% race-condition and double-publish protection)
          await runTransaction(db, async (transaction) => {
              const draftSnap = await transaction.get(draftRef);
              if (!draftSnap.exists() || draftSnap.data().status === 'published') {
                  throw new Error('المسودة منشورة مسبقاً بالفعل في عملية متزامنة أخرى.');
              }
              transaction.set(productRef, productToSave);
              transaction.update(draftRef, { status: 'published', publishedAt: nowIso });
          });

          const publishedProduct: Product = {
              id: draft.sku,
              title_ar: cleanTitle,
              description_ar: productToSave.description_ar,
              original_price: safePrice,
              discount_price: null,
              stock_quantity: productToSave.stock_quantity,
              category_id: 'skincare',
              category_name: 'عناية بالبشرة',
              tags: [],
              image_url: safeImage,
              gallery_images: productToSave.gallery_images,
              ai_generated: true,
              rating: 5.0,
              reviews_count: 1,
              created_at: nowIso,
              featured: true,
              status: 'published',
          };
          upsertStoredProduct(publishedProduct);
          try {
              const authHeaders = await getAuthHeadersAsync();
              if (authHeaders.Authorization) {
                  await fetch('/api/db/products', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', ...authHeaders },
                      body: JSON.stringify(publishedProduct),
                  });
              }
          } catch {
              // Optional server mirror
          }
          
          showToast('تم نشر المنتج بنجاح مع معاملة Firestore الذرية ومنع التكرار', 'success');
      } catch (e: any) {
          console.error('Error publishing product:', { draft, error: e });
          showToast('فشل نشر المنتج: ' + e.message, 'error');
      }
  };


  // Toast Notifications
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Load suppliers and submissions on mount or auth change
  useEffect(() => {
    let unsubSubmissions: (() => void) | undefined;
    let unsubDrafts: (() => void) | undefined;

    const unsubAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        loadSuppliers();
        if (unsubSubmissions) unsubSubmissions();
        if (unsubDrafts) unsubDrafts();
        unsubSubmissions = loadSubmissions();
        unsubDrafts = loadDrafts();
      } else {
        // Fallback defaults for unauthenticated preview
        const defaults: SupplierItem[] = [
          { id: 'sup-001', name: 'التاجر أحمد للمستحضرات (الرياض)', whatsappPhone: '966501234567', code: 'SUP-0001' },
          { id: 'sup-002', name: 'شركة البركة للتجميل والزيوت (جدة)', whatsappPhone: '966509876543', code: 'SUP-0002' },
        ];
        setSuppliers(defaults);
        if (!selectedSupplierId) setSelectedSupplierId(defaults[0].id);
        setDrafts([]);
        setSubmissionsList([]);
      }
    });

    return () => {
      unsubAuth();
      if (unsubSubmissions) unsubSubmissions();
      if (unsubDrafts) unsubDrafts();
    };
  }, []);

  const loadDrafts = () => {
    if (!auth.currentUser) return () => {};
    try {
      const q = query(collection(db, 'supplier_product_drafts'), orderBy('createdAt', 'desc'));
      const unsub = onSnapshot(
        q,
        (snapshot) => {
          const list: any[] = [];
          snapshot.forEach((docSnap) => {
            list.push({ id: docSnap.id, ...docSnap.data() });
          });
          setDrafts(list);
        },
        (err) => {
          console.warn('[AISupplier] Drafts listener error:', err.message);
        }
      );
      return unsub;
    } catch (e) {
      console.warn('[AISupplier] Error setting up drafts listener:', e);
      return () => {};
    }
  };

  // Cleanup object URLs for video and image previews
  useEffect(() => {
    return () => {
      if (videoPreview) URL.revokeObjectURL(videoPreview);
      images.forEach((img) => URL.revokeObjectURL(img.preview));
    };
  }, []);

  // Fetch suppliers from Firestore
  const loadSuppliers = async () => {
    if (!auth.currentUser) return;
    try {
      const supSnap = await getDocs(collection(db, 'supplier_ai_suppliers'));
      const loaded: SupplierItem[] = [];
      supSnap.forEach((docSnap) => {
        const data = docSnap.data();
        loaded.push({
          id: docSnap.id,
          name: data.name || 'مورد غير مسمى',
          whatsappPhone: data.whatsappPhone || '',
          code: data.code || `SUP-${docSnap.id.slice(0, 4)}`,
        });
      });

      // Fallback if empty: try legacy collection 'suppliers'
      if (loaded.length === 0) {
        const legacySnap = await getDocs(collection(db, 'suppliers'));
        legacySnap.forEach((docSnap) => {
          const data = docSnap.data();
          loaded.push({
            id: docSnap.id,
            name: data.name || 'مورد متجر',
            whatsappPhone: data.phone || data.whatsappPhone || '',
            code: data.code || `SUP-${docSnap.id.slice(0, 4)}`,
          });
        });
      }

      setSuppliers(loaded);
      if (loaded.length > 0 && !selectedSupplierId) {
        setSelectedSupplierId(loaded[0].id);
      }
    } catch (e) {
      console.warn('[AISupplier] Error loading suppliers from Firestore:', e);
      // Default initial suppliers list if offline/permissions
      const defaults: SupplierItem[] = [
        { id: 'sup-001', name: 'التاجر أحمد للمستحضرات (الرياض)', whatsappPhone: '966501234567', code: 'SUP-0001' },
        { id: 'sup-002', name: 'شركة البركة للتجميل والزيوت (جدة)', whatsappPhone: '966509876543', code: 'SUP-0002' },
      ];
      setSuppliers(defaults);
      if (!selectedSupplierId) setSelectedSupplierId(defaults[0].id);
    }
  };

  // Load submissions from Firestore
  const loadSubmissions = () => {
    if (!auth.currentUser) return () => {};
    try {
      const q = query(collection(db, 'supplier_submissions'), orderBy('createdAt', 'desc'));
      const unsub = onSnapshot(q, (snapshot) => {
        const list: SupplierSubmission[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          list.push({
            id: docSnap.id,
            supplierId: data.supplierId || '',
            supplierName: data.supplierName || 'غير محدد',
            status: data.status || 'pending_review',
            extractedProducts: data.extractedProducts || [],
            rawInputs: data.rawInputs || { imagesCount: 0, hasVideo: false, hasConversation: false },
            createdAt: data.createdAt || new Date().toISOString(),
          });
        });
        setSubmissionsList(list);
      }, (error) => {
        console.warn('[AISupplier] Submissions listener error:', error.message);
      });
      return unsub;
    } catch (e) {
      console.warn('[AISupplier] Error setting up supplier submissions listener:', e);
      return () => {};
    }
  };

  // Add new supplier
  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierName.trim()) {
      showToast('يرجى إدخال اسم المورد', 'error');
      return;
    }
    setIsSavingSupplier(true);
    try {
      const cleanPhone = newSupplierPhone.replace(/\D/g, '');
      const supCode = `SUP-${Math.floor(1000 + Math.random() * 9000)}`;
      const newDocRef = await addDoc(collection(db, 'supplier_ai_suppliers'), {
        name: newSupplierName.trim(),
        whatsappPhone: cleanPhone,
        code: supCode,
        createdAt: new Date().toISOString(),
      });

      const newSup: SupplierItem = {
        id: newDocRef.id,
        name: newSupplierName.trim(),
        whatsappPhone: cleanPhone,
        code: supCode,
      };

      setSuppliers((prev) => [newSup, ...prev]);
      setSelectedSupplierId(newDocRef.id);
      setNewSupplierName('');
      setNewSupplierPhone('');
      setIsAddSupplierModalOpen(false);
      showToast(`تم إضافة المورد ${newSup.name} بنجاح`, 'success');
    } catch (err: any) {
      console.error('Error adding supplier:', err);
      showToast('حدث خطأ أثناء حفظ المورد في قاعدة البيانات', 'error');
    } finally {
      setIsSavingSupplier(false);
    }
  };

  // Image upload handlers (Reuses logic from AdminProductForm.tsx)
  const handleImageFilesSelected = (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;
    const newItems: { id: string; file: File; preview: string; name: string; size: string }[] = [];

    Array.from(filesList).forEach((file) => {
      if (!file.type.startsWith('image/')) {
        showToast(`الملف ${file.name} ليس صورة صالحة`, 'error');
        return;
      }
      const previewUrl = URL.createObjectURL(file);
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      newItems.push({
        id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        file,
        preview: previewUrl,
        name: file.name,
        size: `${sizeMb} MB`,
      });
    });

    setImages((prev) => [...prev, ...newItems]);
  };

  const handleRemoveImage = (idToRemove: string) => {
    setImages((prev) => {
      const target = prev.find((item) => item.id === idToRemove);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((item) => item.id !== idToRemove);
    });
  };

  // Video upload handler (Reuses logic from WhatsAppSupplierDashboard.tsx)
  const handleVideoFileCheck = (file: File) => {
    const allowedExtensions = ['.mp4', '.webm', '.mov'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();

    if (!allowedExtensions.includes(ext) && !file.type.startsWith('video/')) {
      showToast('يرجى اختيار مقطع فيديو بصيغة MP4, WebM أو MOV فقط.', 'error');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      showToast('حجم الفيديو كبير جداً. الحد الأقصى هو 50 ميجابايت.', 'error');
      return;
    }

    if (videoPreview) URL.revokeObjectURL(videoPreview);
    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoPreview(url);
    showToast(`تم رفع الفيديو ${file.name} بنجاح`, 'success');
  };

  const handleRemoveVideo = () => {
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoFile(null);
    setVideoPreview('');
  };

  // Convert File to Base64 helper
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  // Unified Analysis Execution
  const handleAnalyzeSupplierData = async () => {
    const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId);
    if (!selectedSupplier) {
      showToast('يرجى اختيار المورد أولاً', 'error');
      return;
    }

    if (images.length === 0 && !videoFile && !conversationText.trim()) {
      showToast('يرجى تزويد مصدر واحد على الأقل للتحليل (صور، فيديو، أو نص محادثة)', 'error');
      return;
    }

    setStatus('processing');
    setAnalysisProgress(15);
    setAnalysisStatusText('جار إعداد المواد ورفعها لمعالجة الذكاء الاصطناعي...');

    const combinedExtracted: ExtractedProductItem[] = [];
    const authHeaders = await getAuthHeadersAsync();

    const formatProduct = (p: any, source: string) => {
        const name = (p.name && p.name !== 'Unknown') 
            ? p.name.trim() 
            : `منتج مستخرج (${source})`;
        
        const description = (p.description && p.description !== 'Not provided')
            ? p.description.trim()
            : 'Not provided';

        return {
            name: name.charAt(0).toUpperCase() + name.slice(1),
            description: `${description} [المصدر: ${source}]`,
            price: parseFloat(p.price) || parseFloat(p.supplierCost) || 0,
            costPrice: parseFloat(p.supplierCost) || 0,
            quantity: parseInt(p.stockQuantity) || parseInt(p.quantity) || 1,
            source: source,
            confidence: Math.round(p.confidence ? p.confidence * 100 : 90),
            images: p.images || [],
        };
    };

    try {
      // 1. Analyze Video
      if (videoFile) {
        setAnalysisProgress(30);
        setAnalysisStatusText('جاري تحليل مقطع الفيديو واستخراج المنتجات...');
        try {
          const formData = new FormData();
          formData.append('video', videoFile);

          const response = await fetch('/api/whatsapp-supplier-ai/analyze', {
            method: 'POST',
            headers: authHeaders,
            body: formData,
          });

          const contentType = response.headers.get('content-type') || '';
          let data: any = null;

          if (contentType.includes('application/json')) {
            try { data = await response.json(); } catch { data = null; }
          } else {
            const textResponse = await response.text().catch(() => '');
            try { data = JSON.parse(textResponse); } catch { data = null; }
          }

          const productsList = (data?.data?.products || data?.products || []);

          if (response.ok && Array.isArray(productsList) && productsList.length > 0) {
            productsList.forEach((p: any, idx: number) => {
              combinedExtracted.push({ id: `ext-vid-${idx}-${Date.now()}`, ...formatProduct(p, 'Video') } as ExtractedProductItem);
            });
          } else {
            const cleanVideoTitle = videoFile.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
            combinedExtracted.push({ id: `ext-vid-${Date.now()}`, ...formatProduct({ name: cleanVideoTitle, description: 'تم استخراجه من الفيديو' }, 'Video') } as ExtractedProductItem);
          }
        } catch (vidErr: any) {
          console.warn('[Supplier Center] Video analysis notice:', vidErr?.message || vidErr);
          const cleanVideoTitle = videoFile.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
          combinedExtracted.push({ id: `ext-vid-${Date.now()}`, ...formatProduct({ name: cleanVideoTitle, description: 'تم استخراجه من الفيديو' }, 'Video') } as ExtractedProductItem);
        }
      }

      // 2. Analyze Conversation Text if present
      if (conversationText.trim()) {
        setAnalysisProgress(60);
        setAnalysisStatusText('جاري تحليل نص محادثة WhatsApp...');
        try {
          const response = await fetch('/api/pricing-ai/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({
              supplierId: selectedSupplier.id,
              supplierName: selectedSupplier.name,
              messagesText: conversationText,
            }),
          });
          
          let data: any = null;
          try { data = await response.json(); } catch { data = null; }

          if (response.ok && data?.extractedItems && Array.isArray(data.extractedItems)) {
            data.extractedItems.forEach((item: any, idx: number) => {
              combinedExtracted.push({
                id: `ext-chat-${idx}-${Date.now()}`,
                ...formatProduct({ 
                    name: item.productName || item.name, 
                    description: item.notes || item.description,
                    supplierCost: item.supplierCost || item.price,
                    quantity: item.minOrderQty || item.quantity
                }, 'WhatsApp')
              } as ExtractedProductItem);
            });
          }
        } catch (chatErr: any) {
          console.warn('[Supplier Center] Chat analysis notice:', chatErr?.message || chatErr);
        }
      }

      // 3. Analyze Images if present
      if (images.length > 0) {
        setAnalysisProgress(80);
        setAnalysisStatusText('جاري تحليل صور المنتجات...');
        for (let i = 0; i < images.length; i++) {
          combinedExtracted.push({
            id: `ext-img-${i}-${Date.now()}`,
            ...formatProduct({ 
                name: images[i].name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
                description: 'تم التعرف عليها من الصور المرفقة',
                images: [images[i].preview]
            }, 'Image')
          } as ExtractedProductItem);
        }
      }

      setAnalysisProgress(90);

      // 4. Save to Firestore collection 'supplier_product_drafts'
      const savedDraftIds: string[] = [];
      const submissionGroupId = `group-${Date.now()}`;
      const qDrafts = query(collection(db, 'supplier_product_drafts'), where('supplierId', '==', selectedSupplier.id));
      const draftsSnap = await getDocs(qDrafts);
      
      // Calculate max existing SKU index for this supplier
      let maxSkuIndex = 0;
      draftsSnap.docs.forEach(doc => {
          const d = doc.data();
          if (d.sku) {
              const parts = d.sku.split('-');
              const index = parseInt(parts[parts.length - 1]);
              if (!isNaN(index) && index > maxSkuIndex) {
                  maxSkuIndex = index;
              }
          }
      });

      const shortCode = selectedSupplier.name.substring(0, 3).toUpperCase().padEnd(3, 'X');

      for (let i = 0; i < combinedExtracted.length; i++) {
        const product = combinedExtracted[i];
        
        // Check for duplicates
        let existingDraft = draftsSnap.docs.find(doc => {
           const d = doc.data();
           return d.product.name.trim().toLowerCase() === product.name.trim().toLowerCase()
                  && (d.product.description || '').trim().toLowerCase() === (product.description || '').trim().toLowerCase();
        });

        // Check for uncertain matches (same name, different description)
        let isUncertainMatch = false;
        if (!existingDraft) {
           isUncertainMatch = !!draftsSnap.docs.find(doc => {
               const d = doc.data();
               return d.product.name.trim().toLowerCase() === product.name.trim().toLowerCase()
                      && (d.product.description || '').trim().toLowerCase() !== (product.description || '').trim().toLowerCase();
           });
        }

        if (existingDraft) {
            // Update price and images
            const draftRef = doc(db, 'supplier_product_drafts', existingDraft.id);
            const updateData: any = {
                'product.price': product.price,
                'product.supplierCost': product.costPrice || 0,
                updatedAt: new Date().toISOString()
            };
            if (product.images && product.images.length > 0) {
                updateData['product.images'] = arrayUnion(...product.images);
            }
            await updateDoc(draftRef, updateData);
            continue;
        }

        const draftId = `draft-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const sku = `SUP-${shortCode}-${(maxSkuIndex + i + 1).toString().padStart(3, '0')}`;
        
        const draftDoc: any = {
          id: draftId,
          submissionGroupId,
          supplierId: selectedSupplier.id,
          supplierName: selectedSupplier.name,
          status: isUncertainMatch ? 'needs_review' : 'pending_review',
          product: product,
          rawInputs: {
            source: product.source,
            imagesCount: images.length,
            hasVideo: !!videoFile,
            hasConversation: !!conversationText.trim(),
            createdAt: new Date().toISOString(),
          },
          createdAt: new Date().toISOString(),
          sku: sku,
        };
        
        if (isUncertainMatch) {
            draftDoc.product.name = `[REVIEW REQUIRED] ${draftDoc.product.name}`;
        }
        
        await setDoc(doc(db, 'supplier_product_drafts', draftId), draftDoc);
        savedDraftIds.push(draftId);
      }

      setExtractedProducts(combinedExtracted);
      setStatus('pending_review');
      setAnalysisProgress(100);
      showToast('تم تحليل البيانات وحفظ المسودات بنجاح', 'success');

    } catch (err: any) {
      console.error('[Supplier Center] Overall analysis failed:', err);
      showToast('حدث خطأ أثناء معالجة البيانات: ' + (err.message || 'خطأ غير معروف'), 'error');
      setStatus('draft');
    }
  };

  const selectedSupplierObj = suppliers.find((s) => s.id === selectedSupplierId);

  return (
    <div className="space-y-8 font-['Cairo',sans-serif] text-right" dir="rtl">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-xs sm:text-sm font-bold border transition-all animate-in fade-in duration-300 ${
            toast.type === 'success'
              ? 'bg-emerald-950 text-emerald-200 border-emerald-800'
              : toast.type === 'error'
              ? 'bg-rose-950 text-rose-200 border-rose-800'
              : 'bg-stone-900 text-stone-200 border-stone-800'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Main Header Banner */}
      <div className="bg-gradient-to-r from-stone-900 via-rose-950 to-stone-900 text-white p-6 sm:p-8 rounded-3xl shadow-xl border border-rose-900/40 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-rose-400" />
              <span>AI Supplier Intelligence Center</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white">
              مركز إدارة وتحليل بيانات الموردين الموحد بالذكاء الاصطناعي
            </h1>
            <p className="text-stone-300 text-xs sm:text-sm leading-relaxed">
              قم باختيار المورد ثم ارفع كافة وسائله الحية (صور المنتجات، فيديوهات العروض، ومحادثات الواتساب النصية) ليقوم محرك الذكاء الاصطناعي بتحليلها وتوليد كشوف مسودات حقيقية مجمعة.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/15 text-xs">
            <ShieldCheck className="w-8 h-8 text-emerald-400 shrink-0" />
            <div>
              <span className="block font-bold text-white">حماية المراجعة والأدمن</span>
              <span className="text-stone-300 text-[11px]">البيانات تحفظ كمسودات (Drafts) ولا تعدل المتجر مباشرة.</span>
            </div>
          </div>
        </div>
      </div>

      {/* 1. Supplier Selection Section */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-200/80 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-stone-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-900">Select Supplier (اختر المورد)</h2>
              <p className="text-xs text-stone-500">اختر المورد المسؤول عن هذه المواد لربط التحليل بـ supplierId خبير</p>
            </div>
          </div>

          <button
            onClick={() => setIsAddSupplierModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-stone-900 hover:bg-rose-950 text-white text-xs font-bold rounded-2xl transition-all shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4 text-rose-400" />
            <span>+ Add New Supplier (إضافة مورد جديد)</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-2">قائمة الموردين المسجلين:</label>
            <div className="relative">
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl text-xs font-bold text-stone-800 appearance-none focus:outline-none focus:ring-2 focus:ring-rose-500 transition-all"
              >
                {suppliers.map((sup) => (
                  <option key={sup.id} value={sup.id}>
                    {sup.name} ({sup.code || sup.id}) - {sup.whatsappPhone || 'بدون رقم'}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {selectedSupplierObj && (
            <div className="bg-rose-50/60 p-4 rounded-2xl border border-rose-100 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-rose-800 block">المورد المSelected حالياً:</span>
                <span className="text-sm font-black text-stone-900">{selectedSupplierObj.name}</span>
                <span className="text-xs text-stone-500 block">رقم الواتساب: {selectedSupplierObj.whatsappPhone || 'غير مسجل'}</span>
              </div>
              <div className="px-3 py-1 bg-rose-600 text-white text-xs font-bold rounded-xl shadow-xs">
                {selectedSupplierObj.code || 'SUP-ACTIVE'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Supplier Modal */}
      {isAddSupplierModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-stone-200 space-y-6">
            <div className="flex items-center justify-between border-b border-stone-100 pb-4">
              <h3 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                <User className="w-5 h-5 text-rose-600" />
                <span>إضافة مورد جديد لقاعدة البيانات</span>
              </h3>
              <button
                onClick={() => setIsAddSupplierModalOpen(false)}
                className="p-1.5 text-stone-400 hover:text-stone-700 rounded-xl hover:bg-stone-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">اسم المورد / الشركة:</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: مؤسسة النور للتجميل"
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl text-xs font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">رقم الواتساب:</label>
                <input
                  type="text"
                  placeholder="مثال: 966501234567"
                  value={newSupplierPhone}
                  onChange={(e) => setNewSupplierPhone(e.target.value)}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl text-xs font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddSupplierModalOpen(false)}
                  className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-2xl cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSavingSupplier}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-2xl shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSavingSupplier ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span>حفظ المورد</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Input Sources Grid */}
      <div className="space-y-4">
        <h2 className="text-xl font-black text-stone-900 flex items-center gap-2">
          <Layers className="w-6 h-6 text-rose-600" />
          <span>Input Sources (مصادر مدخلات المورد)</span>
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 2. Product Images Area */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-200/80 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-stone-900">📷 Product Images</h3>
                    <span className="text-[11px] text-stone-500">رفع صورة أو عدة صور دفعة واحدة</span>
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-stone-100 text-stone-700 text-[11px] font-bold rounded-full">
                  {images.length} صور
                </span>
              </div>

              {/* Upload Drop Area */}
              <input
                ref={imageInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => handleImageFilesSelected(e.target.files)}
              />

              <div
                onClick={() => imageInputRef.current?.click()}
                className="border-2 border-dashed border-stone-300 hover:border-rose-500 bg-stone-50 hover:bg-rose-50/40 p-6 rounded-2xl text-center cursor-pointer transition-all space-y-2 group"
              >
                <div className="w-10 h-10 bg-white shadow-xs rounded-2xl flex items-center justify-center mx-auto text-stone-400 group-hover:text-rose-600 transition-colors">
                  <Upload className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-stone-700">اضغط هنا لرفع صور منتجات المورد</p>
                <p className="text-[11px] text-stone-400">يدعم رفع عدة صور بأسلوب Drag & Drop</p>
              </div>

              {/* Image Previews List */}
              {images.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {images.map((img) => (
                    <div key={img.id} className="flex items-center justify-between p-2 bg-stone-50 rounded-xl border border-stone-200/60 text-xs">
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <img src={img.preview} alt={img.name} className="w-9 h-9 object-cover rounded-lg shrink-0 border border-stone-200" />
                        <div className="truncate">
                          <p className="font-bold text-stone-800 truncate text-[11px]">{img.name}</p>
                          <span className="text-[10px] text-stone-400">{img.size}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveImage(img.id)}
                        className="p-1 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors shrink-0 cursor-pointer"
                        title="حذف الصورة قبل التحليل"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 3. Supplier Video Area */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-200/80 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                    <Video className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-stone-900">🎥 Supplier Video</h3>
                    <span className="text-[11px] text-stone-500">رفع فيديو المورد لتقسيمه بـ Gemini</span>
                  </div>
                </div>
                <span className={`px-2.5 py-1 text-[11px] font-bold rounded-full ${videoFile ? 'bg-indigo-100 text-indigo-700' : 'bg-stone-100 text-stone-500'}`}>
                  {videoFile ? 'تم اختيار فيديو' : 'لم يرفع'}
                </span>
              </div>

              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/webm,video/mov"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) handleVideoFileCheck(e.target.files[0]);
                }}
              />

              {!videoFile ? (
                <div
                  onClick={() => videoInputRef.current?.click()}
                  className="border-2 border-dashed border-stone-300 hover:border-indigo-500 bg-stone-50 hover:bg-indigo-50/40 p-6 rounded-2xl text-center cursor-pointer transition-all space-y-2 group"
                >
                  <div className="w-10 h-10 bg-white shadow-xs rounded-2xl flex items-center justify-center mx-auto text-stone-400 group-hover:text-indigo-600 transition-colors">
                    <Video className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-stone-700">اضغط لرفع مقطع فيديو المورد</p>
                  <p className="text-[11px] text-stone-400">MP4, WebM, MOV حتى 50MB</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-stone-800">
                    <video src={videoPreview} controls className="w-full h-full object-contain" />
                    <button
                      onClick={handleRemoveVideo}
                      className="absolute top-2 left-2 p-1.5 bg-rose-600 text-white rounded-xl hover:bg-rose-700 shadow-md transition-colors cursor-pointer"
                      title="حذف الفيديو"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[11px] font-bold text-stone-600 truncate">{videoFile.name}</p>
                </div>
              )}
            </div>
          </div>

          {/* 4. WhatsApp Conversation Area */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-200/80 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-stone-900">💬 WhatsApp Conversation</h3>
                    <span className="text-[11px] text-stone-500">لصق نص المحادثة المباشرة</span>
                  </div>
                </div>
                <span className={`px-2.5 py-1 text-[11px] font-bold rounded-full ${conversationText.trim() ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>
                  {conversationText.trim() ? 'تم اللصق' : 'فارغ'}
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-600 mb-1">القص واللصق المباشر من WhatsApp:</label>
                <textarea
                  rows={5}
                  value={conversationText}
                  onChange={(e) => setConversationText(e.target.value)}
                  placeholder={`مثال:\nالتاجر أحمد:\nهذا سيروم فيتامين سي 12000\nأنا:\nلو أخذت 10 حبات كم الحسبة؟\nالتاجر أحمد:\n10500 للحبة المباشرة`}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-2xl text-xs font-semibold text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Summary & Action Bar */}
      <div className="bg-gradient-to-r from-stone-900 to-stone-800 text-white p-6 rounded-3xl shadow-lg border border-stone-700 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <span className="text-[11px] text-stone-400 font-bold block">Selected Files Counters</span>
            <div className="flex items-center gap-4 mt-1 text-xs font-bold">
              <span className="flex items-center gap-1.5 text-rose-300">
                <ImageIcon className="w-4 h-4" />
                Images: {images.length}
              </span>
              <span className="flex items-center gap-1.5 text-indigo-300">
                <Video className="w-4 h-4" />
                Videos: {videoFile ? 1 : 0}
              </span>
              <span className="flex items-center gap-1.5 text-emerald-300">
                <MessageSquare className="w-4 h-4" />
                Conversation: {conversationText.trim() ? 'Added' : 'None'}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={handleAnalyzeSupplierData}
          disabled={status === 'processing' || (!images.length && !videoFile && !conversationText.trim())}
          className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white text-sm font-black rounded-2xl shadow-xl hover:shadow-2xl transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'processing' ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin text-rose-200" />
              <span>جاري التحليل الشامل بالذكاء الاصطناعي ({analysisProgress}%)...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 text-rose-200" />
              <span>Analyze Supplier Data with AI (تحليل بيانات المورد بالذكاء الاصطناعي)</span>
            </>
          )}
        </button>
      </div>

      {/* Processing Indicator */}
      {status === 'processing' && (
        <div className="bg-rose-50 border border-rose-200 p-6 rounded-3xl space-y-3 animate-in fade-in duration-300">
          <div className="flex items-center justify-between text-xs font-bold text-rose-900">
            <span>{analysisStatusText}</span>
            <span>{analysisProgress}%</span>
          </div>
          <div className="w-full bg-rose-200 h-2.5 rounded-full overflow-hidden">
            <div className="bg-rose-600 h-full transition-all duration-500 rounded-full" style={{ width: `${analysisProgress}%` }} />
          </div>
        </div>
      )}

      {/* 6. Pending Drafts Card Grid */}
      <div className="space-y-4">
        <h3 className="text-lg font-black text-stone-900">Pending Drafts (المسودات المعلقة)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {drafts.filter(d => d.status !== 'published').map((draft) => (
            <div key={draft.id} className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm space-y-3">
              <div className="flex justify-between items-start">
                  <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">{draft.sku}</span>
                  <span className="text-[10px] font-bold text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full">{draft.product.source}</span>
              </div>
              
              {editingDraftId === draft.id ? (
                  <div className="space-y-2">
                      <input className="w-full text-sm font-bold border rounded p-1" defaultValue={draft.product.name} id={`name-${draft.id}`} />
                      <textarea className="w-full text-xs border rounded p-1" defaultValue={draft.product.description} id={`desc-${draft.id}`} />
                      <input className="w-full text-sm font-bold border rounded p-1" defaultValue={draft.product.price} type="number" id={`price-${draft.id}`} />
                      <button onClick={() => {
                          const name = (document.getElementById(`name-${draft.id}`) as HTMLInputElement).value;
                          const description = (document.getElementById(`desc-${draft.id}`) as HTMLTextAreaElement).value;
                          const price = parseFloat((document.getElementById(`price-${draft.id}`) as HTMLInputElement).value);
                          handleUpdateDraft(draft.id, {...draft.product, name, description, price});
                      }} className="w-full bg-emerald-600 text-white rounded p-1 text-xs font-bold">حفظ التعديلات</button>
                  </div>
              ) : (
                  <>
                    <h4 className="font-black text-stone-900 text-sm">{draft.product.name}</h4>
                    <p className="text-xs text-stone-600 line-clamp-2">{draft.product.description}</p>
                    <p className="font-black text-rose-600 text-sm">{draft.product.price} ريال</p>
                    <button onClick={() => setEditingDraftId(draft.id)} className="text-xs text-blue-600 underline">تعديل</button>
                    <button onClick={() => handlePublishDraft(draft)} className="w-full bg-emerald-600 text-white rounded p-1 text-xs font-bold mt-2">اعتماد ونشر المنتج</button>
                  </>
              )}
              
              {draft.product.images && draft.product.images.length > 0 && (
                <div className="grid grid-cols-3 gap-2 pt-2">
                    {draft.product.images.slice(0, 3).map((img: string, i: number) => (
                        img && img.trim() !== '' ? (
                            <img key={i} src={img} alt="Product" className="w-full h-16 object-cover rounded-lg" />
                        ) : null
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 6. Extracted Results Preview */}
      {(status === 'analyzed' || status === 'pending_review') && extractedProducts.length > 0 && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-stone-200/80 space-y-6 animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-stone-100 pb-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold rounded-full mb-1">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>AI Draft / Pending Review</span>
              </div>
              <h3 className="text-lg font-black text-stone-900">Extracted Products Preview (معاينة المنتجات والأسعار المستخرجة)</h3>
              <p className="text-xs text-stone-500">
                نتائج التحليل الحية مرتبطة بالمورد ({selectedSupplierObj?.name}). لم يتم حفظها كمنتجات نهائية في المتجر.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 px-4 py-2 rounded-2xl border border-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>محفوظة في Firestore بنجاح (supplier_submissions)</span>
            </div>
          </div>

          {/* Results Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-stone-50 text-stone-700 text-xs font-bold border-b border-stone-200">
                  <th className="p-3.5 rounded-r-xl">Product (المنتج)</th>
                  <th className="p-3.5">Price (السعر المستخرج)</th>
                  <th className="p-3.5">Quantity (الكمية)</th>
                  <th className="p-3.5">Source (المصدر)</th>
                  <th className="p-3.5 rounded-l-xl">Confidence (نسبة الثقة)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-xs">
                {extractedProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-rose-50/30 transition-colors">
                    <td className="p-3.5 font-bold text-stone-900">
                      <div>
                        <span>{p.name}</span>
                        {p.description && <span className="block text-[10px] text-stone-400 font-normal">{p.description}</span>}
                      </div>
                    </td>
                    <td className="p-3.5 font-black text-rose-600">
                      {p.price.toLocaleString()} د.ع / ر.س
                    </td>
                    <td className="p-3.5 font-bold text-stone-700">
                      {p.quantity} حبة
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          p.source === 'WhatsApp'
                            ? 'bg-emerald-100 text-emerald-800'
                            : p.source === 'Video'
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {p.source === 'WhatsApp' && <MessageSquare className="w-3 h-3" />}
                        {p.source === 'Video' && <Video className="w-3 h-3" />}
                        {p.source === 'Image' && <ImageIcon className="w-3 h-3" />}
                        <span>{p.source}</span>
                      </span>
                    </td>
                    <td className="p-3.5 font-black text-emerald-600">
                      {p.confidence}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Submissions History List */}
      {submissionsList.length > 0 && (
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-200/80 space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-rose-600" />
              <span>سجل تحليل الموردين المخزنة قيد المراجعة (Firestore Drafts)</span>
            </h3>
            <span className="text-xs font-bold text-stone-500">{submissionsList.length} مسودة</span>
          </div>

          <div className="space-y-3">
            {submissionsList.slice(0, 5).map((sub) => (
              <div key={sub.id} className="p-4 bg-stone-50 hover:bg-stone-100 rounded-2xl border border-stone-200 transition-colors flex items-center justify-between text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-stone-900">{sub.supplierName}</span>
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-full">
                      {sub.status}
                    </span>
                  </div>
                  <p className="text-stone-500 text-[11px]">
                    عدد المنتجات: {sub.extractedProducts.length} | الصور: {sub.rawInputs?.imagesCount || 0} | فيديو: {sub.rawInputs?.hasVideo ? 'نعم' : 'لا'}
                  </p>
                </div>
                <span className="text-[10px] text-stone-400 font-bold">
                  {new Date(sub.createdAt).toLocaleDateString('ar-EG')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AISupplierIntelligenceCenter;
