import React, { useState, useMemo } from 'react';
import {
  Search,
  Trash2,
  Edit3,
  Plus,
  Sparkles,
  Star,
  Package,
  Eye,
  MessageCircle,
  AlertTriangle,
  Tag,
  Percent,
  CheckCircle2,
  TrendingDown,
  ArrowUpDown,
  SlidersHorizontal,
  DollarSign,
  AlertCircle,
  Copy,
  Scan,
  GitMerge,
  Layers,
  Check,
  X,
  Loader2,
  Barcode,
} from 'lucide-react';
import { Category, Product, StoreSettings } from '../types';
import { generateSingleProductWhatsAppUrl } from '../lib/whatsapp';
import { AdminPriceDiscountModal } from './AdminPriceDiscountModal';
import { getProductPricing } from '../lib/pricing';

export interface DuplicateGroup {
  key: string;
  matchType: 'barcode' | 'sku' | 'exact_name' | 'normalized_name';
  reasonLabel: string;
  items: Product[];
  masterItem: Product;
  redundantItems: Product[];
  totalStock: number;
}

interface AdminProductListProps {
  products: Product[];
  categories: Category[];
  onDeleteProduct: (id: string) => void;
  onUpdateStock: (id: string, newStock: number) => void;
  onToggleFeatured: (id: string) => void;
  onUpdatePrice?: (productId: string, originalPrice: number, discountPrice: number | null) => Promise<void> | void;
  onBulkUpdateDiscount?: (productIds: string[], discountPercent: number | null) => Promise<void> | void;
  onBulkDeduplicate?: (groups: { masterId: string; newStock: number; deleteIds: string[] }[]) => Promise<void> | void;
  onPublishProduct?: (id: string) => Promise<void> | void;
  settings: StoreSettings;
}

export const AdminProductList: React.FC<AdminProductListProps> = ({
  products,
  categories,
  onDeleteProduct,
  onUpdateStock,
  onToggleFeatured,
  onUpdatePrice,
  onBulkUpdateDiscount,
  onBulkDeduplicate,
  onPublishProduct,
  settings,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [discountFilter, setDiscountFilter] = useState<'all' | 'discounted' | 'regular'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [editingPriceProduct, setEditingPriceProduct] = useState<Product | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkDiscountPercent, setBulkDiscountPercent] = useState<number>(15);
  const [isBulkApplying, setIsBulkApplying] = useState(false);
  const [bulkError, setBulkError] = useState<string>('');
  const [bulkConfirmAction, setBulkConfirmAction] = useState<{ type: 'apply' | 'remove'; percent: number | null } | null>(null);

  // --- Duplicate Detection & Scanner Tool State ---
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [duplicateScanAction, setDuplicateScanAction] = useState<'all' | 'name' | 'barcode'>('all');
  const [isProcessingDedup, setIsProcessingDedup] = useState(false);
  const [dedupSuccessMessage, setDedupSuccessMessage] = useState<string | null>(null);
  const [selectedGroupKeys, setSelectedGroupKeys] = useState<Set<string>>(new Set());

  // Helper to extract barcodes or SKUs from product tags or fields
  const extractBarcodeOrSku = (p: Product): string | null => {
    // Check tags for barcode/SKU patterns (e.g. barcode:12345 or sku:xyz)
    for (const tag of p.tags || []) {
      const cleanTag = tag.trim().toLowerCase();
      if (cleanTag.startsWith('barcode:') || cleanTag.startsWith('باركود:')) {
        return cleanTag.split(/[:：]/)[1]?.trim() || null;
      }
      if (cleanTag.startsWith('sku:') || cleanTag.startsWith('كود:')) {
        return cleanTag.split(/[:：]/)[1]?.trim() || null;
      }
    }
    // Also check if ID is an explicit SKU pattern
    if (p.id && (p.id.startsWith('SUP-') || p.id.startsWith('SKU-') || p.id.startsWith('BC-'))) {
      return p.id;
    }
    return null;
  };

  // Helper to normalize product titles for fuzzy matching
  const normalizeTitle = (title: string): string => {
    if (!title) return '';
    return title
      .toLowerCase()
      .trim()
      // Normalize Arabic letters
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      // Remove symbols, accents, extra spaces
      .replace(/[^\w\s\u0600-\u06FF]/gi, '')
      .replace(/\s+/g, ' ');
  };

  // Scanner Logic: Discovers duplicate groups based on barcodes, exact titles, and normalized titles
  const duplicateGroups = useMemo<DuplicateGroup[]>(() => {
    if (!products || products.length === 0) return [];

    const barcodeMap = new Map<string, Product[]>();
    const exactNameMap = new Map<string, Product[]>();
    const normalizedNameMap = new Map<string, Product[]>();

    for (const p of products) {
      // 1. Group by Barcode / SKU if available
      const bc = extractBarcodeOrSku(p);
      if (bc) {
        if (!barcodeMap.has(bc)) barcodeMap.set(bc, []);
        barcodeMap.get(bc)!.push(p);
      }

      // 2. Group by exact title
      const rawTitle = (p.title_ar || '').trim();
      if (rawTitle) {
        if (!exactNameMap.has(rawTitle)) exactNameMap.set(rawTitle, []);
        exactNameMap.get(rawTitle)!.push(p);
      }

      // 3. Group by normalized title
      const normTitle = normalizeTitle(rawTitle);
      if (normTitle && normTitle.length > 2) {
        if (!normalizedNameMap.has(normTitle)) normalizedNameMap.set(normTitle, []);
        normalizedNameMap.get(normTitle)!.push(p);
      }
    }

    const groups: DuplicateGroup[] = [];
    const seenProductIds = new Set<string>();

    const evaluateAndAddGroup = (
      key: string,
      items: Product[],
      matchType: DuplicateGroup['matchType'],
      reasonLabel: string
    ) => {
      if (items.length <= 1) return;

      // Filter out products already handled in a higher-priority match
      const availableItems = items.filter((item) => !seenProductIds.has(item.id));
      if (availableItems.length <= 1) return;

      // Pick master item: highest price, longest description, has image, or highest stock
      const sorted = [...availableItems].sort((a, b) => {
        const aPrice = Number(a.original_price || 0);
        const bPrice = Number(b.original_price || 0);
        if (aPrice !== bPrice) return bPrice - aPrice;

        const aDesc = (a.description_ar || '').length;
        const bDesc = (b.description_ar || '').length;
        if (aDesc !== bDesc) return bDesc - aDesc;

        return Number(b.stock_quantity || 0) - Number(a.stock_quantity || 0);
      });

      const master = sorted[0];
      const redundant = sorted.slice(1);
      const totalStock = availableItems.reduce((sum, item) => sum + Number(item.stock_quantity || 0), 0);

      availableItems.forEach((item) => seenProductIds.add(item.id));

      groups.push({
        key,
        matchType,
        reasonLabel,
        items: availableItems,
        masterItem: master,
        redundantItems: redundant,
        totalStock,
      });
    };

    // Priority 1: Barcode / SKU Matches
    if (duplicateScanAction === 'all' || duplicateScanAction === 'barcode') {
      for (const [bc, items] of barcodeMap.entries()) {
        evaluateAndAddGroup(`barcode_${bc}`, items, 'barcode', `تطابق الباركود / SKU: ${bc}`);
      }
    }

    // Priority 2: Exact Name Matches
    if (duplicateScanAction === 'all' || duplicateScanAction === 'name') {
      for (const [title, items] of exactNameMap.entries()) {
        evaluateAndAddGroup(`exact_${title}`, items, 'exact_name', `تطابق الاسم الدقيق: "${title}"`);
      }
    }

    // Priority 3: Normalized / Fuzzy Matches
    if (duplicateScanAction === 'all' || duplicateScanAction === 'name') {
      for (const [norm, items] of normalizedNameMap.entries()) {
        evaluateAndAddGroup(`norm_${norm}`, items, 'normalized_name', `تشابه الاسم بالتحليل الذكي`);
      }
    }

    return groups;
  }, [products, duplicateScanAction]);

  // Total redundant items count
  const totalRedundantCount = useMemo(() => {
    return duplicateGroups.reduce((acc, g) => acc + g.redundantItems.length, 0);
  }, [duplicateGroups]);

  // Trigger Scanner Scan
  const handleStartScan = () => {
    setIsScanning(true);
    setDedupSuccessMessage(null);
    setTimeout(() => {
      setIsScanning(false);
      setHasScanned(true);
      // Select all detected groups by default
      setSelectedGroupKeys(new Set(duplicateGroups.map((g) => g.key)));
    }, 600);
  };

  // Toggle selection for a group
  const toggleGroupSelection = (key: string) => {
    setSelectedGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Handle Single Group Merge
  const handleMergeSingleGroup = async (group: DuplicateGroup) => {
    try {
      setIsProcessingDedup(true);
      // 1. Update master stock
      await onUpdateStock(group.masterItem.id, group.totalStock);

      // 2. Delete redundant items
      for (const item of group.redundantItems) {
        await onDeleteProduct(item.id);
      }

      setDedupSuccessMessage(`تم دمج منتج "${group.masterItem.title_ar}" بنجاح وتحديث المخزون إلى (${group.totalStock}).`);
    } catch (err: any) {
      console.error('Failed to merge single group:', err);
    } finally {
      setIsProcessingDedup(false);
    }
  };

  // Handle Single Group Delete (Without Merging Stock)
  const handleDeleteSingleGroupRedundant = async (group: DuplicateGroup) => {
    try {
      setIsProcessingDedup(true);
      for (const item of group.redundantItems) {
        await onDeleteProduct(item.id);
      }
      setDedupSuccessMessage(`تم حذف (${group.redundantItems.length}) نسخ مكررة من "${group.masterItem.title_ar}".`);
    } catch (err: any) {
      console.error('Failed to delete redundant items:', err);
    } finally {
      setIsProcessingDedup(false);
    }
  };

  // Handle Bulk Merge of Selected Groups
  const handleBulkMergeSelected = async () => {
    const selected = duplicateGroups.filter((g) => selectedGroupKeys.has(g.key));
    if (selected.length === 0) return;

    try {
      setIsProcessingDedup(true);
      setDedupSuccessMessage(null);

      // If backend deduplication callback or route is provided
      if (onBulkDeduplicate) {
        const payload = selected.map((g) => ({
          masterId: g.masterItem.id,
          newStock: g.totalStock,
          deleteIds: g.redundantItems.map((r) => r.id),
        }));
        await onBulkDeduplicate(payload);
      } else {
        // Fallback: Perform atomic updates across provided props
        for (const g of selected) {
          await onUpdateStock(g.masterItem.id, g.totalStock);
          for (const r of g.redundantItems) {
            await onDeleteProduct(r.id);
          }
        }
      }

      setDedupSuccessMessage(`تم دمج وتحديث (${selected.length}) مجموعات مكررة وحذف العناصر الفائضة بنجاح!`);
      setSelectedGroupKeys(new Set());
    } catch (err: any) {
      console.error('Failed bulk deduplication:', err);
    } finally {
      setIsProcessingDedup(false);
    }
  };

  // Handle Bulk Delete Only of Selected Groups (Without Stock Add)
  const handleBulkDeleteSelected = async () => {
    const selected = duplicateGroups.filter((g) => selectedGroupKeys.has(g.key));
    if (selected.length === 0) return;

    try {
      setIsProcessingDedup(true);
      setDedupSuccessMessage(null);

      for (const g of selected) {
        for (const r of g.redundantItems) {
          await onDeleteProduct(r.id);
        }
      }

      const totalDeleted = selected.reduce((acc, g) => acc + g.redundantItems.length, 0);
      setDedupSuccessMessage(`تم حذف (${totalDeleted}) عناصر مكررة من المنتجات المحددة بنجاح.`);
      setSelectedGroupKeys(new Set());
    } catch (err: any) {
      console.error('Failed bulk deletion of duplicates:', err);
    } finally {
      setIsProcessingDedup(false);
    }
  };


  // Filter products based on search, category, and discount status
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.title_ar.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.description_ar.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.tags.some((t) => t.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCat = selectedCategory === 'all' || p.category_id === selectedCategory;

    const pricing = getProductPricing(p);
    const hasDiscount = pricing.hasDiscount;

    let matchesDiscount = true;
    if (discountFilter === 'discounted') matchesDiscount = hasDiscount;
    if (discountFilter === 'regular') matchesDiscount = !hasDiscount;

    let matchesStatus = true;
    if (statusFilter !== 'all') matchesStatus = (p.status || 'published') === statusFilter;

    return matchesSearch && matchesCat && matchesDiscount && matchesStatus;
  });

  // Calculate statistics using unified pricing
  const discountedCount = products.filter((p) => getProductPricing(p).hasDiscount).length;
  const regularCount = products.length - discountedCount;

  // Handle saving price via modal
  const handleSavePriceModal = async (
    productId: string,
    originalPrice: number,
    discountPrice: number | null
  ) => {
    if (onUpdatePrice) {
      await onUpdatePrice(productId, originalPrice, discountPrice);
    }
  };

  // Handle bulk discount application
  const handleApplyBulkDiscount = async () => {
    if (!onBulkUpdateDiscount || filteredProducts.length === 0 || !bulkConfirmAction) return;
    try {
      setIsBulkApplying(true);
      setBulkError('');
      const ids = filteredProducts.map((p) => p.id);
      await onBulkUpdateDiscount(ids, bulkConfirmAction.percent);
      setIsBulkApplying(false);
      setShowBulkModal(false);
      setBulkConfirmAction(null);
    } catch (e: any) {
      console.error('Error applying bulk discount:', e);
      setIsBulkApplying(false);
      setBulkError(e?.message || 'حدث خطأ أثناء تطبيق الخصم الجماعي على قاعدة البيانات.');
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm mt-8">
      {/* Header & Title */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-stone-100">
        <div>
          <h3 className="text-lg sm:text-xl font-black text-stone-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-rose-600" />
            <span>إدارة المنتجات، الأسعار والخصومات ({products.length})</span>
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            عرض وتعديل أسعار المنتجات ونسب الخصم والكميات لعرضها بشكل فوري للزبائن
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Duplicate Scanner & Merging Tool Button */}
          <button
            type="button"
            onClick={() => {
              setShowDuplicateModal(true);
              if (!hasScanned) {
                handleStartScan();
              }
            }}
            className="text-xs font-bold px-3.5 py-2 rounded-xl bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Scan className="w-4 h-4 text-amber-600" />
            <span>كاشف المنتجات المكررة</span>
            {hasScanned && duplicateGroups.length > 0 && (
              <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-black">
                {duplicateGroups.length}
              </span>
            )}
          </button>

          {/* Quick Bulk Discount Button */}
          {onBulkUpdateDiscount && (
            <button
              type="button"
              onClick={() => setShowBulkModal(true)}
              className="text-xs font-bold px-3.5 py-2 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Percent className="w-4 h-4 text-rose-600" />
              <span>تطبيق خصم جماعي للنتائج المعروضة</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-stone-50 p-3 rounded-2xl border border-stone-200/80">
          <span className="text-[11px] font-bold text-stone-500 block">إجمالي المنتجات</span>
          <span className="text-lg font-black text-stone-900">{products.length}</span>
        </div>

        <div
          onClick={() => setDiscountFilter(discountFilter === 'discounted' ? 'all' : 'discounted')}
          className={`p-3 rounded-2xl border transition-all cursor-pointer ${
            discountFilter === 'discounted'
              ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
              : 'bg-rose-50/70 border-rose-200 text-rose-900 hover:bg-rose-100/70'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold ${discountFilter === 'discounted' ? 'text-rose-100' : 'text-rose-700'}`}>
              عروض وخصومات نشطة
            </span>
            <Tag className={`w-3.5 h-3.5 ${discountFilter === 'discounted' ? 'text-white' : 'text-rose-600'}`} />
          </div>
          <span className="text-lg font-black mt-0.5 block">{discountedCount} منتج</span>
        </div>

        <div
          onClick={() => setDiscountFilter(discountFilter === 'regular' ? 'all' : 'regular')}
          className={`p-3 rounded-2xl border transition-all cursor-pointer ${
            discountFilter === 'regular'
              ? 'bg-stone-800 text-white border-stone-800 shadow-sm'
              : 'bg-stone-50 border-stone-200/80 text-stone-800 hover:bg-stone-100'
          }`}
        >
          <span className={`text-[11px] font-bold block ${discountFilter === 'regular' ? 'text-stone-200' : 'text-stone-500'}`}>
            بالسعر الأساسي (بدون خصم)
          </span>
          <span className="text-lg font-black mt-0.5 block">{regularCount} منتج</span>
        </div>

        <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-200/80">
          <span className="text-[11px] font-bold text-emerald-700 block">حالة المزامنة</span>
          <span className="text-xs font-black text-emerald-800 flex items-center gap-1 mt-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>محدثة للزبائن فورياً</span>
          </span>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6">
        {/* Search Input */}
        <div className="relative flex-1 sm:max-w-xs">
          <input
            type="text"
            placeholder="بحث بالاسم أو الكود أو الوصف..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs p-2.5 pr-8 bg-stone-50 border border-stone-200 rounded-xl focus:outline-hidden focus:border-rose-500"
          />
          <Search className="w-3.5 h-3.5 text-stone-400 absolute right-2.5 top-3" />
        </div>

        {/* Filter Selects & Badges */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Dropdown */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-hidden focus:border-rose-500"
          >
            <option value="all">كل الأقسام</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name_ar}
              </option>
            ))}
          </select>

          {/* Discount Status Filter */}
          <select
            value={discountFilter}
            onChange={(e) => setDiscountFilter(e.target.value as any)}
            className="text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-hidden focus:border-rose-500"
          >
            <option value="all">كل حالات الأسعار</option>
            <option value="discounted">المنتجات المخفضة فقط (% خصم)</option>
            <option value="regular">المنتجات بدون خصم فقط</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-hidden focus:border-rose-500"
          >
            <option value="all">كل الحالات (منشور + مسودة)</option>
            <option value="published">المنشورة حالياً</option>
            <option value="draft">المسودات (بانتظار المراجعة)</option>
          </select>
        </div>
      </div>

      {/* Table or Cards */}
      {filteredProducts.length === 0 ? (
        <div className="text-center py-12 text-stone-500 text-xs bg-stone-50 rounded-2xl border border-dashed border-stone-200">
          لا توجد منتجات مطابقة لخيارات البحث أو الفلترة المحددة
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-bold">
                <th className="py-3 px-4 rounded-r-xl">المنتج</th>
                <th className="py-3 px-3">القسم</th>
                <th className="py-3 px-3">السعر والخصم للزبائن</th>
                <th className="py-3 px-3">المخزون</th>
                <th className="py-3 px-3">النوع</th>
                <th className="py-3 px-4 rounded-l-xl text-center">إجراءات المدير</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredProducts.map((p) => {
                const pricing = getProductPricing(p);
                const singleWhatsApp = generateSingleProductWhatsAppUrl(p, settings);

                return (
                  <tr key={p.id} className="hover:bg-stone-50/60 transition-colors">
                    {/* Product Info */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={p.image_url || undefined}
                          alt={p.title_ar}
                          className="w-12 h-12 rounded-xl object-cover border border-stone-200 shrink-0 bg-stone-100"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=400&q=80';
                          }}
                        />
                        <div className="min-w-0">
                          <h4 className="font-bold text-stone-900 max-w-xs sm:max-w-md truncate" title={p.title_ar}>
                            {p.title_ar}
                          </h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-stone-400">
                              ID: {p.id.slice(0, 12)}
                            </span>
                            {p.status === 'draft' && (
                              <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded-md font-bold flex items-center gap-1 border border-amber-200">
                                <AlertCircle className="w-3 h-3" />
                                مسودة
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3 px-3">
                      <span className="bg-rose-50 text-rose-700 px-2.5 py-0.5 rounded-lg font-medium inline-block text-[11px]">
                        {p.category_name}
                      </span>
                    </td>

                    {/* Price & Discount Interactive Column */}
                    <td className="py-3 px-3">
                      <button
                        type="button"
                        onClick={() => setEditingPriceProduct(p)}
                        className="group flex flex-col items-start p-1.5 -m-1.5 rounded-xl hover:bg-rose-50/80 transition-all text-right cursor-pointer"
                        title="انقر لتعديل السعر أو تطبيق خصم مباشرة"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-black text-rose-600 text-sm">
                            {pricing.finalPrice} {settings.currency}
                          </span>
                          {pricing.hasDiscount && (
                            <span className="bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow-xs">
                              خصم {pricing.discountPercent}%
                            </span>
                          )}
                          <Tag className="w-3.5 h-3.5 text-stone-300 group-hover:text-rose-600 transition-colors" />
                        </div>

                        {pricing.hasDiscount ? (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-stone-400 line-through">
                              {pricing.originalPrice} {settings.currency}
                            </span>
                            <span className="text-[10px] text-emerald-600 font-semibold">
                              (وفر {pricing.savingsAmount} {settings.currency})
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-stone-400 group-hover:text-rose-500 font-medium">
                            انقر لتعديل السعر والخصم
                          </span>
                        )}
                      </button>
                    </td>

                    {/* Stock & Quick Adjust */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onUpdateStock(p.id, Math.max(0, p.stock_quantity - 1))}
                          className="w-6 h-6 rounded-md bg-stone-100 hover:bg-stone-200 flex items-center justify-center font-bold text-stone-700 cursor-pointer"
                          title="إنقاص المخزون"
                        >
                          -
                        </button>
                        <span
                          className={`w-8 text-center font-bold ${
                            p.stock_quantity <= 0
                              ? 'text-rose-600'
                              : p.stock_quantity <= 5
                              ? 'text-amber-600'
                              : 'text-stone-800'
                          }`}
                        >
                          {p.stock_quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateStock(p.id, p.stock_quantity + 1)}
                          className="w-6 h-6 rounded-md bg-stone-100 hover:bg-stone-200 flex items-center justify-center font-bold text-stone-700 cursor-pointer"
                          title="زيادة المخزون"
                        >
                          +
                        </button>
                      </div>
                    </td>

                    {/* Type / AI */}
                    <td className="py-3 px-3">
                      {p.ai_generated ? (
                        <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-md font-semibold text-[10px]">
                          <Sparkles className="w-3 h-3 text-amber-500" />
                          Gemini
                        </span>
                      ) : (
                        <span className="text-stone-400 text-[10px]">يدوي</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Publish Draft Button */}
                        {p.status === 'draft' && onPublishProduct && (
                          <button
                            type="button"
                            onClick={() => onPublishProduct(p.id)}
                            className="p-1.5 rounded-lg text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer"
                            title="نشر المنتج في المتجر فوراً"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}

                        {/* Direct Price & Discount Edit Button */}
                        <button
                          type="button"
                          onClick={() => setEditingPriceProduct(p)}
                          className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="تعديل السعر والخصم مباشرة للزبائن"
                        >
                          <Tag className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => onToggleFeatured(p.id)}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            p.featured
                              ? 'text-amber-500 bg-amber-50'
                              : 'text-stone-400 hover:text-stone-600'
                          }`}
                          title={p.featured ? 'إلغاء التمييز' : 'تمييز المنتج في المتجر'}
                        >
                          <Star className={`w-4 h-4 ${p.featured ? 'fill-amber-400' : ''}`} />
                        </button>

                        <a
                          href={singleWhatsApp}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
                          title="تجربة رابط الواتساب لهذا المنتج"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </a>

                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`هل أنت متأكد من حذف المنتج: ${p.title_ar}؟`)) {
                              onDeleteProduct(p.id);
                            }
                          }}
                          className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="حذف المنتج"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Direct Price & Discount Modal */}
      {editingPriceProduct && (
        <AdminPriceDiscountModal
          product={editingPriceProduct}
          isOpen={Boolean(editingPriceProduct)}
          onClose={() => setEditingPriceProduct(null)}
          onSavePrice={handleSavePriceModal}
          settings={settings}
        />
      )}

      {/* Bulk Discount Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-stone-200" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-black text-stone-900 text-base flex items-center gap-2">
                <Percent className="w-5 h-5 text-rose-600" />
                <span>
                  {bulkConfirmAction
                    ? 'تأكيد العملية الجماعية'
                    : `تطبيق خصم جماعي (${filteredProducts.length} منتج)`}
                </span>
              </h4>
              <button
                onClick={() => {
                  setShowBulkModal(false);
                  setBulkConfirmAction(null);
                  setBulkError('');
                }}
                disabled={isBulkApplying}
                className="w-7 h-7 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-500 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {bulkError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{bulkError}</span>
              </div>
            )}

            {bulkConfirmAction ? (
              <div className="space-y-4">
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-bold text-amber-900 text-sm">
                      تأكيد تطبيق التعديل الجماعي
                    </h5>
                    <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                      {bulkConfirmAction.type === 'apply'
                        ? `أنت على وشك تطبيق نسبة خصم ${bulkConfirmAction.percent}% على عدد (${filteredProducts.length}) منتجات مستهدفة وحفظها فورياً للزبائن.`
                        : `أنت على وشك إزالة جميع الخصومات والعودة للأسعار الأساسية لعدد (${filteredProducts.length}) منتجات وحفظها فورياً في المتجر.`}
                    </p>
                    <div className="mt-2 text-[11px] text-stone-600 bg-white/70 p-2 rounded-lg border border-amber-200/50">
                      القسم المستهدف: <span className="font-bold">{selectedCategory === 'all' ? 'كافة الأقسام' : categories.find(c => c.id === selectedCategory)?.name_ar}</span> | عدد المنتجات: <span className="font-bold">{filteredProducts.length}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                  <button
                    type="button"
                    onClick={() => {
                      setBulkConfirmAction(null);
                      setBulkError('');
                    }}
                    disabled={isBulkApplying}
                    className="px-4 py-2 text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl cursor-pointer"
                  >
                    تراجع وتعديل
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyBulkDiscount}
                    disabled={isBulkApplying}
                    className="px-5 py-2 text-xs font-black text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isBulkApplying ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                        <span>جاري الحفظ والتطبيق...</span>
                      </>
                    ) : (
                      <span>نعم، تأكيد وتطبيق الآن</span>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs text-stone-600 mb-4 leading-relaxed">
                  سيتم تطبيق نسبة الخصم المحددة أدناه على كافة المنتجات المعروضة حالياً (<span className="font-bold text-rose-600">{filteredProducts.length} منتج</span>) وحفظها فورياً في المتجر.
                </p>

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1.5">
                      اختيار نسبة خصم سريعة:
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {[10, 15, 20, 25, 30, 50].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setBulkDiscountPercent(pct)}
                          className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                            bulkDiscountPercent === pct
                              ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                              : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-rose-50'
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <input
                      type="range"
                      min="5"
                      max="80"
                      step="5"
                      value={bulkDiscountPercent}
                      onChange={(e) => setBulkDiscountPercent(parseInt(e.target.value) || 15)}
                      className="w-full accent-rose-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[11px] text-stone-400 mt-1">
                      <span>5%</span>
                      <span className="font-bold text-rose-600">{bulkDiscountPercent}%</span>
                      <span>80%</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-100">
                  <button
                    type="button"
                    onClick={() => {
                      setBulkError('');
                      setBulkConfirmAction({ type: 'remove', percent: null });
                    }}
                    disabled={isBulkApplying}
                    className="text-xs text-stone-500 hover:text-rose-600 font-bold p-2 cursor-pointer"
                  >
                    إزالة كل الخصومات
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowBulkModal(false)}
                      disabled={isBulkApplying}
                      className="px-4 py-2 text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBulkError('');
                        setBulkConfirmAction({ type: 'apply', percent: bulkDiscountPercent });
                      }}
                      disabled={isBulkApplying}
                      className="px-5 py-2 text-xs font-black text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md cursor-pointer disabled:opacity-50"
                    >
                      متابعة الخصم ({bulkDiscountPercent}%)
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================== DUPLICATE SCANNER & MERGE / BULK DELETE MODAL ===================== */}
      {showDuplicateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 sm:p-6 border-b border-stone-100 bg-stone-50/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-xs">
                  <Scan className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-black text-base sm:text-lg text-stone-900 flex items-center gap-2">
                    <span>كاشف وتحليل المنتجات المكررة</span>
                    {hasScanned && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                        {duplicateGroups.length} صنف مكرر ({totalRedundantCount} نسخة زائدة)
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-stone-500">
                    فحص ذكي للأسماء، الباركودات، وأكواد SKU لاكتشاف العناصر المكررة مع خيارات الدمج أو الحذف المجمع
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowDuplicateModal(false)}
                className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Success Notification */}
            {dedupSuccessMessage && (
              <div className="p-3.5 mx-6 mt-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 font-bold flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{dedupSuccessMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDedupSuccessMessage(null)}
                  className="text-emerald-700 hover:text-emerald-900 text-xs px-2"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Filter / Match Type Bar */}
            <div className="p-4 sm:p-5 border-b border-stone-100 bg-white flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-stone-600">معيار الفحص:</span>
                <div className="flex items-center bg-stone-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setDuplicateScanAction('all')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                      duplicateScanAction === 'all'
                        ? 'bg-white text-stone-900 shadow-xs'
                        : 'text-stone-500 hover:text-stone-800'
                    }`}
                  >
                    الكل (الاسم + الباركود)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuplicateScanAction('name')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                      duplicateScanAction === 'name'
                        ? 'bg-white text-stone-900 shadow-xs'
                        : 'text-stone-500 hover:text-stone-800'
                    }`}
                  >
                    تطابق الاسم
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuplicateScanAction('barcode')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                      duplicateScanAction === 'barcode'
                        ? 'bg-white text-stone-900 shadow-xs'
                        : 'text-stone-500 hover:text-stone-800'
                    }`}
                  >
                    تطابق الباركود / SKU
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleStartScan}
                  disabled={isScanning}
                  className="px-3.5 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  {isScanning ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Scan className="w-3.5 h-3.5" />
                  )}
                  <span>إعادة الفحص الآن</span>
                </button>
              </div>
            </div>

            {/* Modal Content / Groups List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {isScanning ? (
                <div className="py-16 flex flex-col items-center justify-center text-stone-500">
                  <Loader2 className="w-10 h-10 text-amber-600 animate-spin mb-3" />
                  <p className="text-sm font-bold text-stone-800">جاري فحص قائمة المنتجات ومقارنة الأسماء والباركودات...</p>
                  <p className="text-xs text-stone-400 mt-1">يتم البحث عن التشابهات وتحديد السجلات المرجعية الأساسية</p>
                </div>
              ) : duplicateGroups.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4 border border-emerald-200">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h4 className="text-base font-black text-stone-900 mb-1">
                    ممتاز! لا توجد منتجات مكررة
                  </h4>
                  <p className="text-xs text-stone-500 max-w-md">
                    جميع المنتجات والباركودات في كتالوج المتجر فريدة ومضبوطة بالكامل، ولا توجد أي عناصر متطابقة بحاجة لدمج أو حذف.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Select All Toggle Bar */}
                  <div className="flex items-center justify-between p-3 bg-stone-50 rounded-2xl border border-stone-200 text-xs">
                    <label className="flex items-center gap-2 font-bold text-stone-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedGroupKeys.size === duplicateGroups.length && duplicateGroups.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedGroupKeys(new Set(duplicateGroups.map((g) => g.key)));
                          } else {
                            setSelectedGroupKeys(new Set());
                          }
                        }}
                        className="w-4 h-4 rounded text-rose-600 accent-rose-600 cursor-pointer"
                      />
                      <span>تحديد الكل ({duplicateGroups.length} مجموعة)</span>
                    </label>

                    <span className="text-[11px] text-stone-400 font-semibold">
                      المحدد حالياً: {selectedGroupKeys.size} مجموعة
                    </span>
                  </div>

                  {/* Groups Cards */}
                  {duplicateGroups.map((group) => {
                    const isSelected = selectedGroupKeys.has(group.key);

                    return (
                      <div
                        key={group.key}
                        className={`rounded-2xl border transition-all p-4 ${
                          isSelected
                            ? 'bg-amber-50/40 border-amber-300 shadow-xs'
                            : 'bg-white border-stone-200 hover:border-stone-300'
                        }`}
                      >
                        {/* Group Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-stone-100">
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleGroupSelection(group.key)}
                              className="w-4 h-4 rounded text-rose-600 accent-rose-600 cursor-pointer shrink-0"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-black text-sm text-stone-900">
                                  {group.masterItem.title_ar}
                                </h4>
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                                  {group.matchType === 'barcode' ? (
                                    <Barcode className="w-3 h-3" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                  {group.reasonLabel}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-[11px] text-stone-500 mt-1">
                                <span>عدد النسخ: <strong>{group.items.length}</strong></span>
                                <span>•</span>
                                <span>المخزون الإجمالي بعد الدمج: <strong className="text-emerald-700">{group.totalStock} وحدة</strong></span>
                              </div>
                            </div>
                          </div>

                          {/* Single Group Actions */}
                          <div className="flex items-center gap-2 self-end sm:self-center">
                            <button
                              type="button"
                              onClick={() => handleMergeSingleGroup(group)}
                              disabled={isProcessingDedup}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                              title="دمج الكميات وحذف النسخ الإضافية"
                            >
                              <GitMerge className="w-3.5 h-3.5" />
                              <span>دمج المخزون ({group.totalStock})</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteSingleGroupRedundant(group)}
                              disabled={isProcessingDedup}
                              className="p-1.5 rounded-xl bg-stone-100 hover:bg-rose-50 text-stone-500 hover:text-rose-600 border border-stone-200 transition-colors cursor-pointer"
                              title="حذف النسخ المكررة فقط"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Items Comparison Table */}
                        <div className="divide-y divide-stone-100 bg-stone-50/70 rounded-xl overflow-hidden border border-stone-200/60 text-xs">
                          {/* Master Item */}
                          <div className="p-2.5 flex items-center justify-between gap-3 bg-emerald-50/50">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-600 text-white shrink-0">
                                السجل الأساسي المعتمد
                              </span>
                              <img
                                src={group.masterItem.image_url}
                                alt=""
                                className="w-8 h-8 rounded-lg object-cover border border-emerald-200 shrink-0"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src =
                                    'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80';
                                }}
                              />
                              <div className="truncate">
                                <span className="font-bold text-stone-900 block truncate">
                                  {group.masterItem.title_ar}
                                </span>
                                <span className="text-[10px] text-stone-400 font-mono">
                                  ID: {group.masterItem.id}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 text-right">
                              <span className="font-black text-stone-900">
                                {group.masterItem.original_price} {settings.currency}
                              </span>
                              <span className="text-stone-500 text-[11px]">
                                المخزون: <strong>{group.masterItem.stock_quantity}</strong>
                              </span>
                            </div>
                          </div>

                          {/* Redundant Items */}
                          {group.redundantItems.map((redundant) => (
                            <div key={redundant.id} className="p-2.5 flex items-center justify-between gap-3 text-stone-600">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700 shrink-0">
                                  نسخة زائدة
                                </span>
                                <img
                                  src={redundant.image_url}
                                  alt=""
                                  className="w-8 h-8 rounded-lg object-cover border border-stone-200 shrink-0 opacity-80"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src =
                                      'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80';
                                  }}
                                />
                                <div className="truncate">
                                  <span className="font-medium text-stone-700 block truncate">
                                    {redundant.title_ar}
                                  </span>
                                  <span className="text-[10px] text-stone-400 font-mono">
                                    ID: {redundant.id}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 shrink-0 text-right">
                                <span className="text-stone-700">
                                  {redundant.original_price} {settings.currency}
                                </span>
                                <span className="text-stone-500 text-[11px]">
                                  المخزون: <strong>{redundant.stock_quantity}</strong>
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Bottom Sticky Actions */}
            {duplicateGroups.length > 0 && (
              <div className="p-4 sm:p-5 border-t border-stone-200 bg-stone-50/90 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs text-stone-600">
                  <span>تم تحديد: <strong>{selectedGroupKeys.size}</strong> من أصل {duplicateGroups.length} مجموعة</span>
                  <span className="block text-[11px] text-stone-400">
                    الدمج يجمع الكميات بالسجل الأساسي تلقائياً ويحذف النسخ المكررة
                  </span>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleBulkDeleteSelected}
                    disabled={selectedGroupKeys.size === 0 || isProcessingDedup}
                    className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>حذف النسخ المحددة</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleBulkMergeSelected}
                    disabled={selectedGroupKeys.size === 0 || isProcessingDedup}
                    className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-md transition-colors cursor-pointer disabled:opacity-40"
                  >
                    {isProcessingDedup ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <GitMerge className="w-4 h-4" />
                    )}
                    <span>دمج المجموعات المحددة ({selectedGroupKeys.size})</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminProductList;

