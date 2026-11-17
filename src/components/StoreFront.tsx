import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  ShieldCheck,
  Truck,
  Gift,
  MessageCircle,
  X,
  Tag,
  Hash,
  Filter,
  Waves,
  Flame,
  Palette,
  Heart,
  Zap,
  Smartphone,
  Watch,
  Home,
  Baby,
  Activity,
  Layers,
  ChevronLeft,
  Plus
} from 'lucide-react';
import { Category, Product, StoreSettings } from '../types';
import { ProductCard } from './ProductCard';
import { searchProducts } from '../lib/search';
import { TrustBadgesBar } from './TrustBadgesBar';

export const getCategoryIconComponent = (iconName?: string) => {
  switch (iconName) {
    case 'Sparkles': return Sparkles;
    case 'Waves': return Waves;
    case 'Flame': return Flame;
    case 'Palette': return Palette;
    case 'Heart': return Heart;
    case 'Zap': return Zap;
    case 'Smartphone': return Smartphone;
    case 'Watch': return Watch;
    case 'Home': return Home;
    case 'Baby': return Baby;
    case 'Activity': return Activity;
    default: return Tag;
  }
};

interface StoreFrontProps {
  products: Product[];
  categories: Category[];
  onAddToCart: (product: Product, quantity?: number) => void;
  onQuickView: (product: Product) => void;
  onOpenDetails: (product: Product) => void;
  cartProductIds: Set<string>;
  wishlistIds?: Set<string>;
  onToggleWishlist?: (product: Product) => void;
  settings: StoreSettings;
  onOpenAdmin: () => void;
  searchQuery?: string;
  onSearchQueryChange?: (q: string) => void;
  onOpenPublicAddProduct?: () => void;
}

export const StoreFront: React.FC<StoreFrontProps> = ({
  products,
  categories,
  onAddToCart,
  onQuickView,
  onOpenDetails,
  cartProductIds,
  wishlistIds = new Set(),
  onToggleWishlist,
  settings,
  onOpenAdmin,
  searchQuery = '',
  onSearchQueryChange,
  onOpenPublicAddProduct,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [internalSearch, setInternalSearch] = useState('');
  const [sortBy, setSortBy] = useState<'featured' | 'newest' | 'price-low' | 'price-high' | 'discount'>('featured');

  const activeQuery = searchQuery !== undefined && onSearchQueryChange ? searchQuery : internalSearch;

  const handleQueryChange = (val: string) => {
    if (onSearchQueryChange) {
      onSearchQueryChange(val);
    } else {
      setInternalSearch(val);
    }
  };

  const handleCategorySelect = (catId: string) => {
    setSelectedCategory(catId);
    if (selectedTag !== 'all') {
      const targetProducts = catId === 'all' ? products : products.filter((p) => p.category_id === catId);
      const tagExists = targetProducts.some((p) => p.tags && Array.isArray(p.tags) && p.tags.includes(selectedTag));
      if (!tagExists) {
        setSelectedTag('all');
      }
    }
  };

  // Extract available tags dynamically from products (scoped to selected category or overall)
  const availableTags = useMemo(() => {
    const targetProducts = selectedCategory === 'all'
      ? products
      : products.filter((p) => p.category_id === selectedCategory);

    const tagMap = new Map<string, number>();
    targetProducts.forEach((p) => {
      if (Array.isArray(p.tags)) {
        p.tags.forEach((rawTag) => {
          const clean = rawTag.trim();
          if (clean) {
            tagMap.set(clean, (tagMap.get(clean) || 0) + 1);
          }
        });
      }
    });

    return Array.from(tagMap.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }, [products, selectedCategory]);

  // Filter & Sort using Semantic Search Engine, Category Filter, and Tag Filter
  const filteredProducts = useMemo(() => {
    let list = [...products];

    // Category filter
    if (selectedCategory !== 'all') {
      list = list.filter((p) => p.category_id === selectedCategory);
    }

    // Tag filter (works in conjunction with category)
    if (selectedTag !== 'all') {
      list = list.filter((p) => p.tags && Array.isArray(p.tags) && p.tags.includes(selectedTag));
    }

    // Semantic & Text Search
    if (activeQuery.trim()) {
      const searchMatches = searchProducts(list, activeQuery);
      list = searchMatches.map((m) => m.product);
    } else {
      // Sorting when not actively ranked by search relevance
      list.sort((a, b) => {
        const priceA = a.discount_price ?? a.original_price;
        const priceB = b.discount_price ?? b.original_price;

        if (sortBy === 'featured') {
          if (a.featured && !b.featured) return -1;
          if (!a.featured && b.featured) return 1;
          const ratingDiff = (b.rating || 0) - (a.rating || 0);
          if (ratingDiff !== 0) return ratingDiff;
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        }
        if (sortBy === 'newest') {
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        }
        if (sortBy === 'price-low') {
          return priceA - priceB;
        }
        if (sortBy === 'price-high') {
          return priceB - priceA;
        }
        if (sortBy === 'discount') {
          const discA = a.discount_price ? a.original_price - a.discount_price : 0;
          const discB = b.discount_price ? b.original_price - b.discount_price : 0;
          return discB - discA;
        }
        return 0;
      });
    }

    return list;
  }, [products, selectedCategory, selectedTag, activeQuery, sortBy]);

  return (
    <div className="pb-16">
      {/* Hero Banner */}
      <section className="relative overflow-hidden bg-gradient-to-br from-rose-950 via-stone-900 to-rose-950 text-white py-12 sm:py-16 px-4 sm:px-6 lg:px-8 mb-8 rounded-3xl mx-4 sm:mx-6 lg:mx-8 shadow-xl mt-4">
        {/* Subtle background glow */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-rose-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-4xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-3.5 py-1.5 rounded-full text-xs font-semibold text-rose-200 border border-white/10 mb-2">
            <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
            <span>تسوق ذكي على طريقة أمازون | بحث دلالي وتوصيل فوري</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight sm:leading-tight">
            أمازون دعاء | وجهتكِ الأولى للتسوق الشامل <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-rose-300 via-rose-100 to-amber-200 bg-clip-text text-transparent">
              عناية وتجميل، أجهزة ذكية، عطور فاخرة، ومستلزمات عصرية
            </span>
          </h1>

          <p className="text-sm sm:text-base text-rose-100/80 max-w-2xl mx-auto leading-relaxed">
            تصفحي أكبر تشكيلة من المنتجات الأصلية 100% مع ضمان الجودة، واطلبي مباشرة عبر الواتساب أو السلة مع الدفع عند الاستلام.
          </p>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            {onOpenPublicAddProduct && (
              <button
                onClick={onOpenPublicAddProduct}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-black px-6 py-3.5 rounded-2xl flex items-center gap-2 shadow-xl shadow-rose-900/30 ring-2 ring-rose-400/40 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>أضف منتجك مجاناً (بدون تسجيل دخول) ✨</span>
              </button>
            )}

            <a
              href={`https://wa.me/${settings.whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(
                'مرحباً متجر أمازون دعاء، أود الاستفسار وطلب المنتجات.'
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold px-5 py-3 rounded-2xl flex items-center gap-2 shadow-lg transition-all"
            >
              <MessageCircle className="w-4 h-4" />
              <span>خدمة العملاء والطلب الفوري عبر واتساب</span>
            </a>

            <button
              onClick={onOpenAdmin}
              className="bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm font-bold px-5 py-3 rounded-2xl flex items-center gap-2 border border-white/20 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-rose-300" />
              <span>لوحة إضافة المنتجات بالذكاء الاصطناعي</span>
            </button>
          </div>
        </div>
      </section>

      {/* Trust Badges Bar */}
      <TrustBadgesBar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Amazon-style Visual Department Showcase */}
        <div className="mb-8 bg-white p-4 sm:p-6 rounded-3xl border border-stone-200/80 shadow-xs">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-black text-stone-900">
                  تصفح حسب أقسام أمازون دعاء ({categories.length} أقسام)
                </h2>
                <p className="text-[11px] text-stone-500">
                  انقر على أي قسم لتصفية المنتجات والانتقال الفوري إليها
                </p>
              </div>
            </div>
            {selectedCategory !== 'all' && (
              <button
                onClick={() => handleCategorySelect('all')}
                className="text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1"
              >
                <span>عرض كافة الأقسام</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-11 gap-2.5 sm:gap-3">
            {/* All button circular card */}
            <button
              onClick={() => handleCategorySelect('all')}
              className={`group flex flex-col items-center p-2.5 rounded-2xl transition-all text-center border cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-300'
                  : 'bg-stone-50 hover:bg-rose-50/50 border-stone-200 text-stone-700'
              }`}
            >
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center mb-1.5 transition-transform group-hover:scale-105 ${
                  selectedCategory === 'all' ? 'bg-white/20 text-white' : 'bg-rose-100/70 text-rose-600'
                }`}
              >
                <Sparkles className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-black line-clamp-1">الكل</span>
              <span className={`text-[9px] font-bold ${selectedCategory === 'all' ? 'text-white/80' : 'text-stone-400'}`}>
                {products.length} منتج
              </span>
            </button>

            {/* Each Category */}
            {categories.map((cat) => {
              const IconComp = getCategoryIconComponent(cat.icon);
              const count = products.filter((p) => p.category_id === cat.id).length;
              const isSelected = selectedCategory === cat.id;

              return (
                <button
                  key={cat.id}
                  onClick={() => handleCategorySelect(cat.id)}
                  className={`group relative flex flex-col items-center p-2 rounded-2xl transition-all text-center border cursor-pointer ${
                    isSelected
                      ? 'bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-300'
                      : 'bg-stone-50 hover:bg-rose-50/50 border-stone-200 text-stone-700'
                  }`}
                >
                  {cat.badge && (
                    <span
                      className={`absolute -top-1.5 right-0.5 text-[8px] font-extrabold px-1.5 py-0.2 rounded-full shadow-xs ${
                        isSelected ? 'bg-amber-400 text-stone-900' : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {cat.badge}
                    </span>
                  )}
                  <div
                    className={`w-12 h-12 rounded-full overflow-hidden flex items-center justify-center mb-1.5 transition-transform group-hover:scale-105 border ${
                      isSelected ? 'border-white/40 bg-white/20' : 'border-stone-200 bg-white shadow-2xs'
                    }`}
                  >
                    {cat.image ? (
                      <img
                        src={cat.image}
                        alt={cat.name_ar}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <IconComp
                        className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-rose-600'}`}
                      />
                    )}
                  </div>
                  <span className="text-[11px] font-black line-clamp-1">{cat.name_ar}</span>
                  <span
                    className={`text-[9px] font-bold ${
                      isSelected ? 'text-white/80' : 'text-stone-400'
                    }`}
                  >
                    {count} منتج
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Category Filter Pills Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-4 no-scrollbar scroll-smooth">
          <button
            onClick={() => handleCategorySelect('all')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-200'
                : 'bg-white text-stone-700 hover:bg-stone-100 border border-stone-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>الكل</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                selectedCategory === 'all' ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-600'
              }`}
            >
              {products.length}
            </span>
          </button>

          {categories.map((cat) => {
            const IconComp = getCategoryIconComponent(cat.icon);
            const count = products.filter((p) => p.category_id === cat.id).length;
            const isSelected = selectedCategory === cat.id;

            return (
              <button
                key={cat.id}
                onClick={() => handleCategorySelect(cat.id)}
                className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 cursor-pointer ${
                  isSelected
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-200'
                    : 'bg-white text-stone-700 hover:bg-stone-100 border border-stone-200'
                }`}
              >
                <IconComp className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-rose-600'}`} />
                <span>{cat.name_ar}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Available Tags Bar */}
        {availableTags.length > 0 && (
          <div className="bg-white p-3.5 sm:p-4 rounded-3xl border border-stone-200/80 mb-6 shadow-2xs">
            <div className="flex items-center justify-between gap-2 mb-2 px-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-stone-700">
                <Tag className="w-3.5 h-3.5 text-rose-600" />
                <span>الوسوم والكلمات المفتاحية ({availableTags.length}):</span>
              </div>
              {selectedTag !== 'all' && (
                <button
                  onClick={() => setSelectedTag('all')}
                  className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  <span>إلغاء تصفية الوسم</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar scroll-smooth">
              <button
                onClick={() => setSelectedTag('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                  selectedTag === 'all'
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200 border border-stone-200/60'
                }`}
              >
                <span>جميع الوسوم</span>
              </button>

              {availableTags.map(({ tag, count }) => {
                const isSelected = selectedTag === tag;
                const displayName = tag.replace(/^#/, '').replace(/_/g, ' ');

                return (
                  <button
                    key={tag}
                    onClick={() => setSelectedTag(isSelected ? 'all' : tag)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-rose-600 text-white shadow-xs shadow-rose-200 ring-2 ring-rose-300 font-bold'
                        : 'bg-stone-50 hover:bg-rose-50/70 text-stone-700 hover:text-rose-700 border border-stone-200/70'
                    }`}
                  >
                    <Hash className={`w-3 h-3 ${isSelected ? 'text-white' : 'text-rose-500'}`} />
                    <span>{displayName}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-stone-200/80 text-stone-600'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Search & Sort Controls Bar */}
        <div className="bg-white p-3.5 sm:p-4 rounded-3xl border border-stone-200/80 mb-8 flex flex-col items-center gap-3 shadow-2xs">
          <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Quick filter input */}
            <div className="relative w-full sm:w-80">
              <input
                type="text"
                placeholder="تصفية بالكلمة أو الاحتياج..."
                value={activeQuery}
                onChange={(e) => handleQueryChange(e.target.value)}
                className="w-full text-xs p-2.5 pr-8 bg-stone-50 border border-stone-200 rounded-xl focus:bg-white focus:border-rose-500 focus:outline-hidden"
              />
              <Search className="w-3.5 h-3.5 text-stone-400 absolute right-2.5 top-3" />
              {activeQuery && (
                <button
                  onClick={() => handleQueryChange('')}
                  className="absolute left-2.5 top-2.5 text-stone-400 hover:text-stone-700 text-xs"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sort Selector & Count */}
            <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto text-xs">
              <span className="text-stone-500 text-xs hidden sm:inline">
                عرض {filteredProducts.length} من {products.length} منتج
                {activeQuery && ` (مطابقة لـ "${activeQuery}")`}
              </span>

              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-3.5 h-3.5 text-stone-400" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="p-2 bg-stone-50 border border-stone-200 rounded-xl focus:outline-hidden focus:border-rose-500 text-xs font-semibold text-stone-800"
                >
                  <option value="featured">الأكثر طلباً ومميز</option>
                  <option value="newest">الأحدث وصولاً</option>
                  <option value="price-low">السعر: من الأقل للأعلى</option>
                  <option value="price-high">السعر: من الأعلى للأقل</option>
                  <option value="discount">أعلى نسبة خصم</option>
                </select>
              </div>
            </div>
          </div>

          {/* Active Filters Row */}
          {(selectedCategory !== 'all' || selectedTag !== 'all' || activeQuery) && (
            <div className="w-full flex flex-wrap items-center gap-2 pt-2.5 border-t border-stone-100 text-xs">
              <span className="text-stone-500 font-medium text-[11px] flex items-center gap-1">
                <Filter className="w-3 h-3 text-rose-600" />
                <span>التصفية الحالية:</span>
              </span>

              {selectedCategory !== 'all' && (
                <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold border border-rose-200">
                  قسم: {categories.find((c) => c.id === selectedCategory)?.name_ar || selectedCategory}
                  <button
                    onClick={() => handleCategorySelect('all')}
                    className="hover:text-rose-900 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {selectedTag !== 'all' && (
                <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold border border-rose-200">
                  وسم: #{selectedTag.replace(/^#/, '').replace(/_/g, ' ')}
                  <button
                    onClick={() => setSelectedTag('all')}
                    className="hover:text-rose-900 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {activeQuery && (
                <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold border border-rose-200">
                  بحث: "{activeQuery}"
                  <button
                    onClick={() => handleQueryChange('')}
                    className="hover:text-rose-900 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              <button
                onClick={() => {
                  handleCategorySelect('all');
                  setSelectedTag('all');
                  handleQueryChange('');
                }}
                className="text-stone-400 hover:text-rose-600 text-[11px] underline font-medium mr-auto transition-colors cursor-pointer"
              >
                إلغاء كافة الفلاتر
              </button>
            </div>
          )}
        </div>

        {/* Product Cards Grid */}
        {filteredProducts.length === 0 ? (
          <div className="bg-white rounded-3xl border border-stone-200 p-12 text-center max-w-md mx-auto my-8">
            <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-stone-800 text-base mb-1">لم نجد أي منتجات تطابق بحثك</h3>
            <p className="text-xs text-stone-500 mb-4">
              جربي البحث بكلمات أخرى أو تصفح قسم أو وسم آخر من الخيارات المتاحة
            </p>
            <button
              onClick={() => {
                handleQueryChange('');
                handleCategorySelect('all');
                setSelectedTag('all');
              }}
              className="bg-stone-900 text-white text-xs font-bold px-4 py-2 rounded-xl cursor-pointer"
            >
              عرض كافة المنتجات
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={(p) => onAddToCart(p)}
                onQuickView={onQuickView}
                onOpenDetails={onOpenDetails}
                settings={settings}
                isInCart={cartProductIds.has(product.id)}
                isWishlisted={wishlistIds.has(product.id)}
                onToggleWishlist={onToggleWishlist}
                onSelectTag={(tag) => setSelectedTag(tag)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Floating WhatsApp Bubble */}
      <a
        href={`https://wa.me/${settings.whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(
          'مرحباً! أود الاستفسار عن منتجات متجر ' + settings.storeName
        )}`}
        target="_blank"
        rel="noopener noreferrer"
        title="تواصل معنا عبر واتساب"
        className="fixed bottom-6 left-6 z-30 bg-emerald-500 hover:bg-emerald-600 text-white w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 group"
      >
        <MessageCircle className="w-7 h-7" />
        <span className="absolute right-16 bg-stone-900 text-white text-xs font-bold px-3 py-1.5 rounded-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-md">
          تواصل معنا عبر واتساب
        </span>
      </a>
    </div>
  );
};
