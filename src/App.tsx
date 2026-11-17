import React, { useState, useEffect, useRef, Suspense } from 'react';
import { Navbar } from './components/Navbar';
import { StoreFront } from './components/StoreFront';
import { CartDrawer } from './components/CartDrawer';
import { FlashSaleBanner } from './components/FlashSaleBanner';
import { Product, StoreSettings, CartItem, Order, OrderStatus, AdminUser } from './types';
import { INITIAL_CATEGORIES } from './data/initialData';
import {
  getStoredProducts,
  saveStoredProducts,
  upsertStoredProduct,
  upsertStoredProducts,
  removeStoredProduct,
  getStoredOrders,
  getStoredSettings,
  saveStoredSettings,
  getStoredCart,
  saveStoredCart,
  getStoredWishlist,
  saveStoredWishlist,
  getAdminSession,
  clearAdminSession,
  getAuthHeadersAsync,
  resetToDefaults,
} from './lib/storage';
import {
  fetchProductsCloud,
  saveProductCloud,
  deleteProductCloud,
  fetchOrdersCloud,
  createOrderCloud,
  updateOrderStatusCloud,
} from './lib/cloud';
import {
  fetchProductsFirestore,
  saveProductFirestore,
  deleteProductFirestore,
  fetchOrdersFirestore,
  createOrderFirestore,
  updateOrderStatusFirestore,
  subscribeToCartFirestore,
  saveCartItemFirestore,
  removeCartItemFirestore,
  clearCartFirestore,
  mergeCartOnLogin,
  fetchWishlistFirestore,
  addWishlistFirestore,
  removeWishlistFirestore,
  subscribeToAuthState,
  logoutFirebase,
  updateOrderDriverFirestore,
} from './lib/firebase';
import { AuthModal } from './components/AuthModal';
import { PublicAddProductModal } from './components/PublicAddProductModal';
import { OfflineStatusIndicator } from './components/OfflineStatusIndicator';
import { StaffDashboard } from './components/StaffDashboard';
import { DriverPortal } from './components/DriverPortal';
import { AdminSalesChart } from './components/AdminSalesChart';
import { UserProfile } from './types';
import { Sparkles, MessageCircle, Heart, ShieldCheck, CheckCircle2, Bot, Code2, Loader2, Percent, AlertCircle, Lock, Code, Truck } from 'lucide-react';
import { getProductPricing, verifyOrderItemsAgainstCatalog } from './lib/pricing';

// Consolidated Lazy Imports with Resilient Suspense & Production Chunk Handlers
import {
  ProductDetailsPage,
  CheckoutPage,
  CustomerOrderTrackingPage,
  QuickViewModal,
  WishlistDrawer,
  AdminDeveloperAdvisor,
  AdminOrders,
  AdminProductForm,
  AdminProductList,
  AdminSettings,
  AdminLogin,
  SupabaseCodeModal,
  AdminCopilotModal,
  WhatsAppSupplierDashboard,
  PricingAIDashboard,
  AISupplierIntelligenceCenter,
  BranchStoreLocator,
} from './lib/lazyImports';

// Loading Fallback Component
const ViewLoadingFallback = () => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] py-16 px-4">
    <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4 shadow-sm animate-spin">
      <Loader2 className="w-6 h-6" />
    </div>
    <span className="text-xs font-bold text-stone-600 animate-pulse">جاري تحميل الصفحة...</span>
  </div>
);

export default function App() {
  const [products, setProducts] = useState<Product[]>(getStoredProducts);
  const [orders, setOrders] = useState<Order[]>(getStoredOrders);
  const [settings, setSettings] = useState<StoreSettings>(getStoredSettings);
  const [cart, setCart] = useState<CartItem[]>(getStoredCart);
  const [wishlist, setWishlist] = useState<string[]>(getStoredWishlist);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(getAdminSession);
  const [adminSubTab, setAdminSubTab] = useState<'center' | 'products' | 'whatsapp-supplier' | 'pricing-ai' | 'settings'>('center');
  const [isAdminSupplierMode, setIsAdminSupplierMode] = useState(false);
  const [isAdminPricingMode, setIsAdminPricingMode] = useState(false);

  // Firebase User & Auth State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isPublicAddProductOpen, setIsPublicAddProductOpen] = useState(false);

  const handleProductAdded = (newProduct: Product) => {
    upsertStoredProduct(newProduct);
    setProducts((prev) => {
      const exists = prev.some((p) => p.id === newProduct.id);
      return exists ? prev.map((p) => (p.id === newProduct.id ? newProduct : p)) : [newProduct, ...prev];
    });
    saveProductCloud(newProduct).catch(() => {});
    getAuthHeadersAsync()
      .then((authHeaders) => {
        if (!authHeaders.Authorization) return;
        return fetch('/api/db/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify(newProduct),
        });
      })
      .catch(() => {});
    showToast('تم نشر منتجك بنجاح في المتجر!');
  };

  // References for Real-Time Cart Listener and Guest Cart Merging
  const cartUnsubscribeRef = useRef<(() => void) | null>(null);
  const guestCartRef = useRef<CartItem[]>(cart);

  useEffect(() => {
    guestCartRef.current = cart;
  }, [cart]);

  // Server-side verification of admin session and HMAC token on mount
  useEffect(() => {
    const verifyAdmin = async () => {
      const session = getAdminSession();
      if (!session || !session.token) {
        if (adminUser) {
          clearAdminSession();
          setAdminUser(null);
        }
        return;
      }
      try {
        const res = await fetch('/api/admin/verify', {
          headers: await getAuthHeadersAsync(),
        });
        if (!res.ok) {
          clearAdminSession();
          setAdminUser(null);
        }
      } catch {
        // Network resilience: do not immediately clear on transient network glitch
      }
    };
    verifyAdmin();
  }, []);

  const [activeTab, setActiveTab] = useState<'store' | 'product-detail' | 'checkout' | 'orders' | 'admin' | 'dev-advisor' | 'track-order' | 'branches' | 'driver'>('store');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Handle Navbar Global Search
  const handleNavbarSearch = (q: string) => {
    setSearchQuery(q);
    setActiveTab('store');
    window.scrollTo({ top: 380, behavior: 'smooth' });
  };

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  // Initial load from Firebase Firestore + server DB in parallel for fast, resilient mobile refresh
  useEffect(() => {
    let cancelled = false;

    const mapServerProduct = (sp: any): Product => ({
      id: sp.productId || sp.id || String(sp.id),
      title_ar: sp.titleAr || sp.title_ar,
      description_ar: sp.descriptionAr || sp.description_ar || '',
      original_price: Number(sp.originalPrice ?? sp.original_price ?? 50),
      discount_price:
        sp.discountPrice !== null && sp.discountPrice !== undefined
          ? Number(sp.discountPrice)
          : sp.discount_price !== null && sp.discount_price !== undefined
            ? Number(sp.discount_price)
            : null,
      stock_quantity: Number(sp.stockQuantity ?? sp.stock_quantity ?? 10),
      category_id: sp.categoryId || sp.category_id || 'skincare',
      category_name: sp.categoryName || sp.category_name || 'عناية بالبشرة',
      tags: Array.isArray(sp.tags) ? sp.tags : [],
      image_url:
        sp.imageUrl ||
        sp.image_url ||
        'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80',
      gallery_images: Array.isArray(sp.galleryImages)
        ? sp.galleryImages
        : Array.isArray(sp.gallery_images)
          ? sp.gallery_images
          : undefined,
      size_or_volume: sp.sizeOrVolume || sp.size_or_volume || undefined,
      skin_type: sp.skinType || sp.skin_type || undefined,
      key_benefits: Array.isArray(sp.keyBenefits)
        ? sp.keyBenefits
        : Array.isArray(sp.key_benefits)
          ? sp.key_benefits
          : undefined,
      how_to_use: sp.howToUse || sp.how_to_use || undefined,
      ingredients: sp.ingredients || undefined,
      badge: sp.badge || undefined,
      rating: Number(sp.rating ?? 5.0),
      reviews_count: Number(sp.reviewsCount ?? sp.reviews_count ?? 1),
      ai_generated: Boolean(sp.aiGenerated ?? sp.ai_generated),
      featured: Boolean(sp.featured),
      status: sp.status === 'draft' ? 'draft' : 'published',
      creator_id: sp.creatorId || sp.creator_id,
      contact_phone: sp.contactPhone || sp.contact_phone || undefined,
      created_at: sp.createdAt
        ? new Date(sp.createdAt).toISOString()
        : sp.created_at
          ? new Date(sp.created_at).toISOString()
          : new Date().toISOString(),
    });

    const mergeAndSortCatalog = (primary: Product[], secondary: Product[]): Product[] => {
      const byId = new Map<string, Product>();
      for (const p of primary) {
        if (p?.id) byId.set(p.id, p);
      }
      for (const p of secondary) {
        if (p?.id && !byId.has(p.id)) {
          byId.set(p.id, p);
        }
      }
      return Array.from(byId.values()).sort((a, b) => {
        const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return (Number.isFinite(tB) ? tB : 0) - (Number.isFinite(tA) ? tA : 0);
      });
    };

    async function loadData() {
      const serverPromise: Promise<Product[]> = fetch('/api/db/products?fresh=1', {
        cache: 'no-store',
      })
        .then(async (res) => {
          if (!res.ok) return [];
          const sqlProds = await res.json();
          if (!Array.isArray(sqlProds)) return [];
          const mapped = sqlProds.map(mapServerProduct).filter((p) => p.id && p.title_ar);
          if (!cancelled && mapped.length > 0) {
            setProducts((prev) => mergeAndSortCatalog(mapped, prev));
          }
          return mapped;
        })
        .catch((err) => {
          console.warn('Could not fetch products from /api/db/products:', err);
          return [];
        });

      const fsPromise = fetchProductsFirestore();

      const [fsOutcome, serverOutcome] = await Promise.allSettled([fsPromise, serverPromise]);
      if (cancelled) return;

      const fsProducts =
        fsOutcome.status === 'fulfilled' && fsOutcome.value?.isFirebase
          ? fsOutcome.value.products
          : [];
      const serverProducts = serverOutcome.status === 'fulfilled' ? serverOutcome.value : [];
      const localFallback =
        fsOutcome.status === 'fulfilled' ? fsOutcome.value.products : getStoredProducts();

      const primary = fsProducts.length > 0 ? fsProducts : serverProducts;
      const secondary = fsProducts.length > 0 ? serverProducts : localFallback;
      const merged = mergeAndSortCatalog(primary, secondary);

      if (merged.length > 0) {
        saveStoredProducts(merged);
        setProducts(merged);
      } else {
        const pResult = await fetchProductsCloud();
        if (!cancelled) {
          setProducts(pResult.products);
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  // Listen to Firebase Authentication State & Real-Time Cart Listener Lifecycle
  useEffect(() => {
    const unsubscribeAuth = subscribeToAuthState(async (fbUser, profile) => {
      if (!fbUser || !profile) {
        // Safe Cleanup: User logged out -> terminate old cart listener immediately
        if (cartUnsubscribeRef.current) {
          cartUnsubscribeRef.current();
          cartUnsubscribeRef.current = null;
        }
        setCurrentUser(null);
        return;
      }

      // User logged in:
      setCurrentUser(profile);

      // Fetch orders for this specific user (or all if admin, driver, or staff)
      try {
        const canViewAllOrders = profile.role === 'admin' || profile.role === 'driver' || profile.role === 'staff';
        const oResult = await fetchOrdersFirestore(profile.uid, canViewAllOrders);
        if (oResult.orders && oResult.orders.length > 0) {
          setOrders(oResult.orders);
        }
      } catch (err) {
        console.warn('Error fetching orders for user:', err);
      }

      if (profile.role === 'admin') {
        const adminSession: AdminUser = {
          id: profile.uid,
          username: profile.name || 'مدير المتجر',
          displayName: profile.name || 'مدير المتجر',
          role: 'superadmin',
        };
        setAdminUser(adminSession);
      } else {
        // If logged in user is NOT an admin, clear any old admin session
        clearAdminSession();
        setAdminUser(null);
      }

      // If user is a courier/driver, automatically navigate to Driver Portal
      if (profile.role === 'driver') {
        setActiveTab('driver');
      }

      // Clean up previous listener to prevent duplicate listeners or race conditions
      if (cartUnsubscribeRef.current) {
        cartUnsubscribeRef.current();
        cartUnsubscribeRef.current = null;
      }

      // Safe Merge on Login: Transfer guest items to Firestore without loss or duplication
      const currentGuestItems = guestCartRef.current;
      if (currentGuestItems && currentGuestItems.length > 0) {
        try {
          await mergeCartOnLogin(profile.uid, currentGuestItems, products);
        } catch (e) {
          console.warn('[Cart Merge] Error merging guest items on login:', e);
        }
      }

      // Start Real-Time Firestore onSnapshot Cart Listener across devices
      const unsubscribeCart = subscribeToCartFirestore(
        profile.uid,
        products,
        (serverCartItems) => {
          setCart(serverCartItems);
          saveStoredCart(serverCartItems);
        }
      );
      cartUnsubscribeRef.current = unsubscribeCart;

      // Sync Wishlist from Firestore
      try {
        const fsFavs = await fetchWishlistFirestore(profile.uid);
        if (fsFavs && fsFavs.length > 0) {
          setWishlist((prev) => Array.from(new Set([...prev, ...fsFavs])));
        }
      } catch (e) {
        console.warn('Error loading wishlist from Firestore:', e);
      }
    });

    return () => {
      unsubscribeAuth();
      if (cartUnsubscribeRef.current) {
        cartUnsubscribeRef.current();
        cartUnsubscribeRef.current = null;
      }
    };
  }, [products]);

  // Sync settings and wishlist locally
  useEffect(() => {
    saveStoredSettings(settings);
  }, [settings]);

  useEffect(() => {
    saveStoredWishlist(wishlist);
  }, [wishlist]);

  // Wishlist Handlers
  const handleToggleWishlist = (product: Product) => {
    setWishlist((prev) => {
      const exists = prev.includes(product.id);
      if (exists) {
        showToast(`تمت إزالة "${product.title_ar}" من المفضلة`, 'info');
        if (currentUser?.uid) {
          removeWishlistFirestore(currentUser.uid, product.id);
        }
        return prev.filter((id) => id !== product.id);
      } else {
        showToast(`تمت إضافة "${product.title_ar}" للمفضلة ❤️`, 'success');
        if (currentUser?.uid) {
          addWishlistFirestore(currentUser.uid, product);
        }
        return [...prev, product.id];
      }
    });
  };

  const handleClearWishlist = () => {
    setWishlist([]);
    showToast('تم إفراغ قائمة المفضلة', 'info');
  };

  // Product Update Handler (e.g., when a review is added and rating recalculates)
  const handleUpdateProduct = async (updatedProduct: Product) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === updatedProduct.id ? updatedProduct : p))
    );
    if (selectedProduct && selectedProduct.id === updatedProduct.id) {
      setSelectedProduct(updatedProduct);
    }
    await saveProductCloud(updatedProduct);
    await saveProductFirestore(updatedProduct);
    showToast('تم نشر التقييم وحساب المتوسط بنجاح! ⭐');
  };

  // Open Full Product Details Page
  const handleOpenProductDetails = (product: Product) => {
    setSelectedProduct(product);
    setActiveTab('product-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Cart Handlers
  const handleAddToCart = (product: Product, quantity: number = 1) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      const newQty = existing ? existing.quantity + quantity : quantity;
      const updated = existing
        ? prev.map((item) => (item.product.id === product.id ? { ...item, quantity: newQty } : item))
        : [...prev, { product, quantity }];

      if (currentUser?.uid) {
        saveCartItemFirestore(currentUser.uid, { product, quantity: newQty });
      } else {
        saveStoredCart(updated);
      }
      return updated;
    });
    showToast(`تمت إضافة "${product.title_ar}" (${quantity}) إلى السلة`);
  };

  const handleUpdateQuantity = (productId: string, delta: number) => {
    setCart((prev) => {
      const target = prev.find((item) => item.product.id === productId);
      if (!target) return prev;
      const newQty = target.quantity + delta;
      const updated = prev
        .map((item) => {
          if (item.product.id === productId) {
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[];

      if (currentUser?.uid) {
        if (newQty > 0) {
          saveCartItemFirestore(currentUser.uid, { product: target.product, quantity: newQty });
        } else {
          removeCartItemFirestore(currentUser.uid, productId);
        }
      } else {
        saveStoredCart(updated);
      }
      return updated;
    });
  };

  const handleRemoveItem = (productId: string) => {
    setCart((prev) => {
      const updated = prev.filter((item) => item.product.id !== productId);
      if (currentUser?.uid) {
        removeCartItemFirestore(currentUser.uid, productId);
      } else {
        saveStoredCart(updated);
      }
      return updated;
    });
    showToast('تمت إزالة المنتج من السلة', 'info');
  };

  const handleClearCart = () => {
    setCart([]);
    if (currentUser?.uid) {
      clearCartFirestore(currentUser.uid);
    } else {
      saveStoredCart([]);
    }
    showToast('تم إفراغ السلة بالكامل', 'info');
  };

  // When order is placed from CartDrawer or CheckoutPage
  const handleOrderPlaced = async (newOrder: Order): Promise<Order> => {
    const idempotencyKey = newOrder.id || `order-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    try {
      const res = await fetch('/api/orders/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey,
          orderNumber: newOrder.order_number,
          userId: currentUser?.uid || newOrder.userId || 'guest',
          customerName: newOrder.customer_name,
          customerPhone: newOrder.customer_phone,
          customerEmail: newOrder.customer_email,
          city: newOrder.city,
          address: newOrder.address,
          notes: newOrder.notes,
          paymentMethod: newOrder.payment_method,
          deliverySpeed: newOrder.delivery_speed,
          items: newOrder.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
          couponCode: newOrder.coupon_code || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'فشلت معالجة الطلب في الخادم.');
      }

      const data = await res.json();
      if (!data.success || !data.order) {
        throw new Error(data.error || 'تعذر تأكيد الطلب من الخادم.');
      }

      const confirmedOrder: Order = data.order;

      if (data.syncStatus !== 'synced' && currentUser?.uid) {
        createOrderFirestore(confirmedOrder, currentUser.uid).catch((syncErr) => {
          console.warn('Client Firestore order mirror notice:', syncErr);
        });
      }

      // Update state with confirmed order
      setOrders((prev) => {
        const exists = prev.some((o) => o.order_number === confirmedOrder.order_number);
        return exists ? prev : [confirmedOrder, ...prev];
      });

      // Update client products stock based on server confirmation
      setProducts((prev) =>
        prev.map((p) => {
          const orderedItem = confirmedOrder.items.find((i) => i.product_id === p.id);
          if (orderedItem) {
            return { ...p, stock_quantity: Math.max(0, p.stock_quantity - orderedItem.quantity) };
          }
          return p;
        })
      );

      // Clear Cart only after server confirmation
      setCart([]);
      if (currentUser?.uid) {
        clearCartFirestore(currentUser.uid);
      } else {
        saveStoredCart([]);
      }

      showToast(`تم تسجيل وتأكيد طلبكِ بنجاح #${confirmedOrder.order_number}`, 'success');
      return confirmedOrder;
    } catch (err: any) {
      const msg = err.message || 'حدث خطأ أثناء معالجة الطلب.';
      showToast(msg, 'error');
      throw err;
    }
  };

  // Product Admin Handlers
  const persistSingleProduct = async (newProduct: Product): Promise<void> => {
    let firestoreSaved = false;
    let serverSaved = false;
    let lastErrorMessage = '';

    try {
      await saveProductCloud(newProduct);
    } catch {
      // Optional cloud mirror
    }

    try {
      await saveProductFirestore(newProduct);
      firestoreSaved = true;
    } catch (fsErr: any) {
      lastErrorMessage = fsErr?.message || '';
      console.warn('Firestore save product notice:', fsErr);
    }

    try {
      const authHeaders = await getAuthHeadersAsync();
      if (authHeaders.Authorization) {
        const response = await fetch('/api/db/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify(newProduct),
        });
        if (response.ok) {
          serverSaved = true;
        } else if (!firestoreSaved) {
          const errData = await response.json().catch(() => ({}));
          lastErrorMessage = errData.error || lastErrorMessage || 'فشل حفظ المنتج في قاعدة بيانات الخادم';
        }
      }
    } catch (srvErr: any) {
      if (!firestoreSaved) {
        lastErrorMessage = lastErrorMessage || srvErr?.message || 'تعذر الاتصال بخادم المتجر';
      }
    }

    if (!firestoreSaved && !serverSaved) {
      throw new Error(lastErrorMessage || 'تعذر حفظ المنتج في قاعدة البيانات، يرجى المحاولة مرة أخرى.');
    }
  };

  const handleProductCreated = async (newProduct: Product) => {
    upsertStoredProduct(newProduct);
    setProducts((prev) => {
      const exists = prev.some((p) => p.id === newProduct.id);
      return exists ? prev.map((p) => (p.id === newProduct.id ? newProduct : p)) : [newProduct, ...prev];
    });

    try {
      await persistSingleProduct(newProduct);
      const successLabel = newProduct.status === 'draft'
        ? `تم حفظ "${newProduct.title_ar}" كمسودة بانتظار مراجعة المدير.`
        : `تم نشر "${newProduct.title_ar}" بنجاح في المتجر!`;
      showToast(successLabel, 'success');
    } catch (err: any) {
      removeStoredProduct(newProduct.id);
      setProducts((prev) => prev.filter((p) => p.id !== newProduct.id));
      const msg = err?.message || 'تعذر حفظ المنتج في قاعدة البيانات';
      console.error('Failed to save new product:', err);
      showToast(`خطأ في حفظ المنتج: ${msg}`, 'error');
      throw err;
    }
  };

  const handlePublishProduct = async (productId: string) => {
    try {
      const response = await fetch(`/api/db/products/${productId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeadersAsync()) },
        body: JSON.stringify({ status: 'published' }),
      });
      
      if (!response.ok) throw new Error('فشل تغيير حالة المنتج');
      
      await response.json();
      
      // Update local state
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, status: 'published' } : p));
      
      // Sync Firestore & Cloud (for cache)
      const target = products.find(p => p.id === productId);
      if (target) {
        const updated = { ...target, status: 'published' as const };
        upsertStoredProduct(updated);
        saveProductCloud(updated);
        await saveProductFirestore(updated);
      }
      
      showToast('تم نشر المنتج بنجاح وأصبح متاحاً للجمهور الآن ✨', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleProductsCreated = async (newProducts: Product[]) => {
    if (!newProducts || newProducts.length === 0) return;

    upsertStoredProducts(newProducts);
    setProducts((prev) => {
      const incomingIds = new Set(newProducts.map((p) => p.id));
      return [...newProducts, ...prev.filter((p) => !incomingIds.has(p.id))];
    });

    const failedIds = new Set<string>();
    let firstError = '';

    await Promise.all(
      newProducts.map(async (p) => {
        try {
          await persistSingleProduct(p);
        } catch (err: any) {
          failedIds.add(p.id);
          if (!firstError) firstError = err?.message || 'فشل الحفظ';
        }
      })
    );

    if (failedIds.size > 0) {
      failedIds.forEach((id) => removeStoredProduct(id));
      setProducts((prev) => prev.filter((p) => !failedIds.has(p.id)));
      const savedCount = newProducts.length - failedIds.size;
      if (savedCount === 0) {
        const msg = `تعذر حفظ المنتجات: ${firstError}`;
        showToast(msg, 'error');
        throw new Error(msg);
      }
      showToast(`تم حفظ ${savedCount} منتجات وتعذر حفظ ${failedIds.size}: ${firstError}`, 'error');
      return;
    }

    showToast(`تم نشر ${newProducts.length} منتجات بنجاح في المتجر دفعة واحدة!`);
  };

  const handleDeleteProduct = async (productId: string) => {
    removeStoredProduct(productId);
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
    await deleteProductCloud(productId);
    try {
      await deleteProductFirestore(productId);
    } catch (err) {
      console.warn('Firestore product deletion notice:', err);
    }
    try {
      await fetch(`/api/db/products/${encodeURIComponent(productId)}`, {
        method: 'DELETE',
        headers: await getAuthHeadersAsync(),
      });
    } catch (err) {
      console.warn('Backend product deletion notice:', err);
    }
    showToast('تم حذف المنتج بنجاح', 'info');
  };

  const handleUpdateStock = async (productId: string, newStock: number) => {
    const authHeaders = await getAuthHeadersAsync();
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === productId) {
          const updated = { ...p, stock_quantity: newStock };
          saveProductCloud(updated);
          saveProductFirestore(updated);
          fetch('/api/db/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify(updated),
          }).catch(() => {});
          return updated;
        }
        return p;
      })
    );
  };

  const handleToggleFeatured = async (productId: string) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === productId) {
          const updated = { ...p, featured: !p.featured };
          saveProductCloud(updated);
          saveProductFirestore(updated);
          return updated;
        }
        return p;
      })
    );
    showToast('تم تحديث حالة تمييز المنتج', 'info');
  };

  // Direct Price & Discount Update Handlers for Store Admin (Awaits database, prevents false success)
  const handleUpdateProductPrice = async (
    productId: string,
    originalPrice: number,
    discountPrice: number | null
  ) => {
    const target = products.find((p) => p.id === productId);
    if (!target) {
      throw new Error('المنتج المراد تعديل سعره غير موجود.');
    }

    const updated: Product = {
      ...target,
      original_price: originalPrice,
      discount_price: discountPrice,
    };

    // 1. Await database operations first (Zero fake success)
    await saveProductCloud(updated);
    await saveProductFirestore(updated);

    // 2. Update state only after confirmed database persistence
    setProducts((prev) => prev.map((p) => (p.id === productId ? updated : p)));

    // 3. Synchronize price within customer cart to prevent stale pricing display
    setCart((prevCart) => {
      const hasItem = prevCart.some((item) => item.product.id === productId);
      if (!hasItem) return prevCart;
      const updatedCart = prevCart.map((item) => {
        if (item.product.id === productId) {
          const updatedItem = {
            ...item,
            product: updated,
          };
          if (currentUser?.uid) {
            saveCartItemFirestore(currentUser.uid, updatedItem);
          }
          return updatedItem;
        }
        return item;
      });
      saveStoredCart(updatedCart);
      return updatedCart;
    });

    const discText = discountPrice ? ` وسعر العرض (${discountPrice} ${settings.currency})` : '';
    showToast(`تم حفظ وتحديث سعر المنتج للزبائن فورياً${discText}!`, 'success');
  };

  const handleBulkUpdateDiscount = async (
    productIds: string[],
    discountPercent: number | null
  ) => {
    if (productIds.length === 0) return;

    const updatedProducts: Product[] = [];
    const newProductsState = products.map((p) => {
      if (productIds.includes(p.id)) {
        let newDiscountPrice: number | null = null;
        if (discountPercent !== null && discountPercent > 0) {
          newDiscountPrice = Math.max(1, Math.round(p.original_price * (1 - discountPercent / 100)));
        }
        const updated = {
          ...p,
          discount_price: newDiscountPrice,
        };
        updatedProducts.push(updated);
        return updated;
      }
      return p;
    });

    // 1. Await database operations first
    for (const p of updatedProducts) {
      await saveProductCloud(p);
      await saveProductFirestore(p);
    }

    // 2. Update state only after database confirmation
    setProducts(newProductsState);

    // 3. Sync cart with bulk update
    setCart((prevCart) => {
      const updatedCart = prevCart.map((item) => {
        const found = updatedProducts.find((u) => u.id === item.product.id);
        if (found) {
          const updatedItem = {
            ...item,
            product: found,
          };
          if (currentUser?.uid) {
            saveCartItemFirestore(currentUser.uid, updatedItem);
          }
          return updatedItem;
        }
        return item;
      });
      saveStoredCart(updatedCart);
      return updatedCart;
    });

    if (discountPercent !== null) {
      showToast(`تم تطبيق خصم ${discountPercent}% على ${productIds.length} منتجات بنجاح!`, 'success');
    } else {
      showToast(`تمت إزالة الخصومات عن ${productIds.length} منتجات بنجاح!`, 'info');
    }
  };

  // Bulk Deduplication Handler (Stock merge & redundant copies deletion)
  const handleBulkDeduplicate = async (
    groups: { masterId: string; newStock: number; deleteIds: string[] }[]
  ) => {
    if (!groups || groups.length === 0) return;

    const allDeleteIds = new Set(groups.flatMap((g) => g.deleteIds));
    const stockMap = new Map<string, number>();
    groups.forEach((g) => {
      stockMap.set(g.masterId, g.newStock);
    });

    try {
      // 1. Post to backend Cloud SQL deduplicate endpoint
      await fetch('/api/db/products/deduplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeadersAsync()) },
        body: JSON.stringify({ groups }),
      });
    } catch (err) {
      console.warn('Backend deduplicate sync note:', err);
    }

    // 2. Synchronize Cloud/Firestore deletions
    for (const deleteId of allDeleteIds) {
      deleteProductCloud(deleteId).catch(() => {});
      deleteProductFirestore(deleteId).catch(() => {});
    }

    // 3. Update master products in Cloud & Firestore
    for (const [masterId, newStock] of stockMap.entries()) {
      const prod = products.find((p) => p.id === masterId);
      if (prod) {
        const updated = { ...prod, stock_quantity: newStock };
        saveProductCloud(updated).catch(() => {});
        saveProductFirestore(updated).catch(() => {});
      }
    }

    // 4. Update local state
    setProducts((prev) =>
      prev
        .filter((p) => !allDeleteIds.has(p.id))
        .map((p) => {
          if (stockMap.has(p.id)) {
            return { ...p, stock_quantity: stockMap.get(p.id)! };
          }
          return p;
        })
    );

    // 5. Clean customer cart if any deleted products were present
    setCart((prev) => prev.filter((item) => !allDeleteIds.has(item.product.id)));

    showToast(`تم دمج وتحديث (${groups.length}) مجموعات مكررة وحذف النسخ الفائضة بنجاح!`, 'success');
  };

  // Order Admin Handlers
  const handleUpdateOrderStatus = async (orderId: string, status: OrderStatus) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
    await updateOrderStatusCloud(orderId, status);
    await updateOrderStatusFirestore(orderId, status);
    showToast('تم تحديث حالة الطلب بنجاح');
  };

  const handleAssignDriver = async (
    orderId: string,
    orderNumber: string,
    driver: { driverName: string; driverPhone: string }
  ) => {
    try {
      // 1. Optimistic local update
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId || o.order_number === orderNumber
            ? {
                ...o,
                driver_name: driver.driverName,
                driver_phone: driver.driverPhone,
                status: o.status === 'pending' ? 'processing' : o.status,
              }
            : o
        )
      );

      // 2. Sync to Cloud SQL backend
      try {
        await fetch(`/api/db/orders/${encodeURIComponent(orderNumber)}/driver`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...(await getAuthHeadersAsync()) },
          body: JSON.stringify({
            driver_name: driver.driverName,
            driver_phone: driver.driverPhone,
          }),
        });
      } catch (e) {
        console.warn('Backend driver assignment sync warning:', e);
      }

      // 3. Sync to Firestore
      await updateOrderDriverFirestore(orderId, {
        driver_name: driver.driverName,
        driver_phone: driver.driverPhone,
      });

      showToast(`تم تعيين الكابتن (${driver.driverName}) للطلب ${orderNumber} بنجاح 🛵`, 'success');
    } catch (err: any) {
      console.error('Assign driver error:', err);
      showToast('تعذر تعيين المندوب، يرجى المحاولة مرة أخرى', 'error');
    }
  };

  const handleUpdateDeliveryStatus = async (
    orderId: string,
    orderNumber: string,
    status: OrderStatus,
    extraData?: {
      cod_collected?: boolean;
      cod_collected_amount?: number;
      driver_notes?: string;
      driver_name?: string;
      driver_phone?: string;
    }
  ) => {
    try {
      // 1. Optimistic state update
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id === orderId || o.order_number === orderNumber) {
            return {
              ...o,
              status,
              ...(extraData?.cod_collected !== undefined && { cod_collected: extraData.cod_collected }),
              ...(extraData?.cod_collected_amount !== undefined && { cod_collected_amount: extraData.cod_collected_amount }),
              ...(extraData?.driver_notes !== undefined && { driver_notes: extraData.driver_notes }),
              ...(extraData?.driver_name && { driver_name: extraData.driver_name }),
              ...(extraData?.driver_phone && { driver_phone: extraData.driver_phone }),
              ...(status === 'delivered' && { delivered_at: new Date().toISOString() }),
            };
          }
          return o;
        })
      );

      // 2. Sync to Cloud SQL backend
      try {
        await fetch(`/api/db/orders/${encodeURIComponent(orderNumber)}/delivery`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...(await getAuthHeadersAsync()) },
          body: JSON.stringify({
            status,
            ...extraData,
          }),
        });
      } catch (e) {
        console.warn('Backend delivery status sync warning:', e);
      }

      // 3. Sync to Firestore
      await updateOrderStatusFirestore(orderId, status, extraData);

      const statusLabels: Record<string, string> = {
        out_for_delivery: 'في الطريق للعميل 🛵',
        delivered: 'تم التوصيل واستلام المبلغ 💵',
        processing: 'جاري التجهيز 📦',
        pending: 'قيد المراجعة ⏳',
        cancelled: 'تم الإلغاء / تعذر التوصيل ❌',
      };

      showToast(`تم تحديث حالة الطلب إلى: ${statusLabels[status] || status}`, 'success');
    } catch (err: any) {
      console.error('Update delivery status error:', err);
      showToast('تعذر تحديث حالة التوصيل، يرجى المحاولة مرة أخرى', 'error');
    }
  };

  // User Logout Handler
  const handleLogoutUser = async () => {
    // 1. Immediately terminate and clean up cart onSnapshot listener
    if (cartUnsubscribeRef.current) {
      cartUnsubscribeRef.current();
      cartUnsubscribeRef.current = null;
    }
    // 2. Sign out from Firebase Authentication
    await logoutFirebase();
    // 3. Reset user and admin session
    setCurrentUser(null);
    clearAdminSession();
    setAdminUser(null);
    // 4. Clear user cart from React state and localStorage
    setCart([]);
    saveStoredCart([]);
    showToast('تم تسجيل الخروج بنجاح', 'info');
  };

  const handleUpdateUserRole = async (email: string, role: 'staff' | 'user') => {
    try {
      const response = await fetch(`/api/db/users/${email}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeadersAsync()) },
        body: JSON.stringify({ role }),
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'فشل تحديث الصلاحيات');
      }
      
      // If we updated our own role, we might need to sync or logout
      if (currentUser?.email === email) {
        const updated = await response.json();
        setCurrentUser(prev => prev ? { ...prev, role: updated.role } : null);
      }
      
      showToast('تم تحديث صلاحيات المستخدم بنجاح ✨', 'success');
    } catch (err: any) {
      console.error('Role update error:', err);
      throw err;
    }
  };

  const handleSaveSettings = (newSettings: StoreSettings) => {
    setSettings(newSettings);
    showToast('تم حفظ إعدادات المتجر ورقم الواتساب بنجاح');
  };

  const handleResetData = () => {
    resetToDefaults();
    window.location.reload();
  };

  const handleLogoutAdmin = () => {
    clearAdminSession();
    setAdminUser(null);
    setActiveTab('store');
    showToast('تم تسجيل الخروج بنجاح', 'info');
  };

  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalCartPrice = cart.reduce((sum, item) => {
    const price = getProductPricing(item.product).finalPrice;
    return sum + price * item.quantity;
  }, 0);

  const cartProductIds = new Set(cart.map((i) => i.product.id));
  const wishlistIdsSet = new Set(wishlist);
  const wishlistProducts = products.filter((p) => wishlistIdsSet.has(p.id));

  // Storefront only shows published products
  const publishedProducts = products.filter(p => p.status === 'published' || !p.status);

  // STAFF ROUTING: If user is staff, show staff dashboard
  if (currentUser?.role === 'staff') {
    return (
      <StaffDashboard
        currentUser={currentUser}
        products={products}
        settings={settings}
        onLogout={handleLogoutUser}
        onProductCreated={handleProductCreated}
        onProductsCreated={handleProductsCreated}
      />
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col justify-between selection:bg-rose-100 selection:text-rose-900 font-['Cairo',sans-serif]">
      {/* Top Flash Sale Countdown Banner */}
      <FlashSaleBanner
        onExploreSale={() => {
          setActiveTab('store');
          window.scrollTo({ top: 400, behavior: 'smooth' });
        }}
      />

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-24 left-1/2 -translate-x-1/2 z-50 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs sm:text-sm font-bold border animate-in fade-in slide-in-from-top-4 duration-300 ${
            toast.type === 'error'
              ? 'bg-rose-900 border-rose-800'
              : 'bg-stone-900 border-stone-800'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Main Navbar with Smart Search */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        cartCount={totalCartCount}
        cartTotal={totalCartPrice}
        onOpenCart={() => setIsCartOpen(true)}
        wishlistCount={wishlist.length}
        onOpenWishlist={() => setIsWishlistOpen(true)}
        settings={settings}
        onOpenDocs={() => setIsDocsOpen(true)}
        ordersCount={orders.length}
        adminUser={adminUser}
        onLogoutAdmin={handleLogoutAdmin}
        products={publishedProducts}
        onSelectProduct={handleOpenProductDetails}
        onAddToCart={handleAddToCart}
        onSearchSubmit={handleNavbarSearch}
        currentUser={currentUser}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onLogoutUser={handleLogoutUser}
      />

      {/* Main Views Container */}
      <main className="flex-1">
        <Suspense fallback={<ViewLoadingFallback />}>
          {/* Storefront View */}
          {activeTab === 'store' && (
          <StoreFront
            products={publishedProducts}
            categories={INITIAL_CATEGORIES}
            onAddToCart={handleAddToCart}
            onQuickView={(p) => setQuickViewProduct(p)}
            onOpenDetails={handleOpenProductDetails}
            cartProductIds={cartProductIds}
            wishlistIds={wishlistIdsSet}
            onToggleWishlist={handleToggleWishlist}
            settings={settings}
            onOpenAdmin={() => setActiveTab('admin')}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            onOpenPublicAddProduct={() => setIsPublicAddProductOpen(true)}
          />
        )}

        {/* Dedicated Product Details Page */}
        {activeTab === 'product-detail' && selectedProduct && (
          <ProductDetailsPage
            product={selectedProduct}
            allProducts={products}
            onBackToStore={() => {
              setActiveTab('store');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onAddToCart={handleAddToCart}
            onOpenCheckout={() => {
              setActiveTab('checkout');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onSelectProduct={handleOpenProductDetails}
            settings={settings}
            isWishlisted={wishlistIdsSet.has(selectedProduct.id)}
            onToggleWishlist={handleToggleWishlist}
            onUpdateProduct={handleUpdateProduct}
          />
        )}

        {/* Dedicated Full CheckoutPage */}
        {activeTab === 'checkout' && (
          <CheckoutPage
            cartItems={cart}
            products={products}
            settings={settings}
            onUpdateQuantity={handleUpdateQuantity}
            onRemoveItem={handleRemoveItem}
            onOrderPlaced={handleOrderPlaced}
            onBackToStore={() => {
              setActiveTab('store');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {/* Branch Store Locator View */}
        {activeTab === 'branches' && (
          <BranchStoreLocator
            settings={settings}
            onBackToStore={() => {
              setActiveTab('store');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {/* Courier & Delivery Driver Portal */}
        {activeTab === 'driver' && (
          <DriverPortal
            orders={orders}
            onUpdateDeliveryStatus={handleUpdateDeliveryStatus}
            settings={settings}
            currentUser={currentUser}
            onBackToStore={() => {
              setActiveTab('store');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenAdmin={() => {
              setActiveTab('admin');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {/* Orders View */}
        {activeTab === 'orders' &&
          (adminUser || currentUser?.role === 'admin' ? (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
              <AdminOrders
                orders={orders}
                onUpdateStatus={handleUpdateOrderStatus}
                onAssignDriver={handleAssignDriver}
                onOpenDriverPortal={() => {
                  setActiveTab('driver');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                settings={settings}
                onOpenDevAdvisor={() => setActiveTab('dev-advisor')}
                onBackToAdmin={() => setActiveTab('admin')}
              />
            </div>
          ) : (
            <CustomerOrderTrackingPage
              orders={orders}
              settings={settings}
              onBackToStore={() => {
                setActiveTab('store');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onAddToCart={handleAddToCart}
              allProducts={products}
            />
          ))}

        {/* Admin Products View */}
        {activeTab === 'admin' &&
          (adminUser ? (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
              {/* Admin Header Notice */}
              <div className="bg-gradient-to-r from-stone-900 via-rose-950 to-stone-900 text-white p-6 rounded-3xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <span className="text-rose-300 font-bold text-xs uppercase tracking-wider block mb-1">
                    لوحة إدارة متجر التجميل بالذكاء الاصطناعي
                  </span>
                  <h1 className="text-xl sm:text-2xl font-black">
                    تحليل المنتجات بالذكاء الاصطناعي وإدارة المخزون
                  </h1>
                  <p className="text-xs text-stone-300 mt-1">
                    مرحباً بك {adminUser.displayName}، المنتجات والطلبات متزامنة فورياً.
                  </p>
                </div>

                 <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => { setAdminSubTab('center'); setIsAdminSupplierMode(false); setIsAdminPricingMode(false); }}
                    className={`text-xs font-bold px-3.5 py-2.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                      adminSubTab === 'center'
                        ? 'bg-rose-600 text-white shadow-md font-extrabold ring-2 ring-rose-400'
                        : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 text-rose-200 animate-pulse" />
                    <span>AI Supplier Intelligence Center (مركز الموردين الشامل)</span>
                  </button>
                  <button
                    onClick={() => { setAdminSubTab('products'); setIsAdminSupplierMode(false); setIsAdminPricingMode(false); }}
                    className={`text-xs font-bold px-3.5 py-2.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                      adminSubTab === 'products'
                        ? 'bg-rose-600 text-white shadow-md'
                        : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
                    }`}
                  >
                    <span>لوحة إدارة المنتجات</span>
                  </button>
                  <button
                    onClick={() => { setAdminSubTab('whatsapp-supplier'); setIsAdminSupplierMode(true); setIsAdminPricingMode(false); }}
                    className={`text-xs font-bold px-3.5 py-2.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                      adminSubTab === 'whatsapp-supplier'
                        ? 'bg-rose-600 text-white shadow-md'
                        : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
                    }`}
                  >
                    <span>فيديوهات الموردين</span>
                  </button>
                  <button
                    onClick={() => { setAdminSubTab('pricing-ai'); setIsAdminSupplierMode(false); setIsAdminPricingMode(true); }}
                    className={`text-xs font-bold px-3.5 py-2.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                      adminSubTab === 'pricing-ai'
                        ? 'bg-rose-600 text-white shadow-md'
                        : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
                    }`}
                  >
                    <Percent className="w-4 h-4 text-rose-200" />
                    <span>ذاكرة التجار (Pricing AI)</span>
                  </button>
                  <button
                    onClick={() => { setAdminSubTab('settings'); setIsAdminSupplierMode(false); setIsAdminPricingMode(false); }}
                    className={`text-xs font-bold px-3.5 py-2.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                      adminSubTab === 'settings'
                        ? 'bg-rose-600 text-white shadow-md'
                        : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
                    }`}
                  >
                    <span>إعدادات المتجر</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('dev-advisor')}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Code2 className="w-4 h-4 text-indigo-200" />
                    <span>المستشار البرمجي</span>
                  </button>
                  <button
                    onClick={() => setIsCopilotOpen(true)}
                    className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-bold px-3.5 py-2.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <Bot className="w-4 h-4 text-rose-400" />
                    <span>المساعد الإداري</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('orders')}
                    className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-4 py-2.5 rounded-xl border border-white/20 transition-colors cursor-pointer"
                  >
                    عرض الطلبات ({orders.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('store')}
                    className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md transition-colors cursor-pointer"
                  >
                    معاينة المتجر
                  </button>
                </div>
              </div>

              {adminSubTab === 'center' ? (
                <AISupplierIntelligenceCenter />
              ) : adminSubTab === 'pricing-ai' ? (
                <PricingAIDashboard />
              ) : adminSubTab === 'whatsapp-supplier' ? (
                <WhatsAppSupplierDashboard />
              ) : adminSubTab === 'settings' ? (
                <AdminSettings
                  settings={settings}
                  onSaveSettings={handleSaveSettings}
                  onResetData={handleResetData}
                  onUpdateUserRole={handleUpdateUserRole}
                />
              ) : (
                <>
                  {/* Daily Sales Trends Recharts Component */}
                  <AdminSalesChart orders={orders} settings={settings} />

                  {/* AI Product Upload & Vision Form */}
                  <AdminProductForm
                    categories={INITIAL_CATEGORIES}
                    onProductCreated={handleProductCreated}
                    onProductsCreated={handleProductsCreated}
                    settings={settings}
                    currentUser={currentUser}
                  />

                  {/* Product Management Table */}
                  <AdminProductList
                    products={products}
                    categories={INITIAL_CATEGORIES}
                    onDeleteProduct={handleDeleteProduct}
                    onUpdateStock={handleUpdateStock}
                    onToggleFeatured={handleToggleFeatured}
                    onUpdatePrice={handleUpdateProductPrice}
                    onBulkUpdateDiscount={handleBulkUpdateDiscount}
                    onBulkDeduplicate={handleBulkDeduplicate}
                    onPublishProduct={handlePublishProduct}
                    settings={settings}
                  />
                </>
              )}
            </div>
          ) : (
            <AdminLogin
              settings={settings}
              onLoginSuccess={(user: AdminUser) => setAdminUser(user)}
              onBackToStore={() => setActiveTab('store')}
            />
          ))}

        {/* Dedicated Developer / Code Consultant View */}
        {activeTab === 'dev-advisor' &&
          (adminUser ? (
            <AdminDeveloperAdvisor
              settings={settings}
              onBackToAdmin={() => setActiveTab('admin')}
              onOpenStore={() => setActiveTab('store')}
              onOpenOrders={() => setActiveTab('orders')}
            />
          ) : (
            <AdminLogin
              settings={settings}
              onLoginSuccess={(user: AdminUser) => setAdminUser(user)}
              onBackToStore={() => setActiveTab('store')}
            />
          ))}

        {/* Customer Order Tracking View */}
        {activeTab === 'track-order' && (
          <CustomerOrderTrackingPage
            orders={orders}
            settings={settings}
            onBackToStore={() => {
              setActiveTab('store');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onAddToCart={handleAddToCart}
            allProducts={products}
          />
        )}
        </Suspense>
      </main>

      {/* Cart Drawer Slide-Over */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cart}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onClearCart={handleClearCart}
        settings={settings}
        onOrderPlaced={handleOrderPlaced}
        onOpenFullCheckout={() => {
          setIsCartOpen(false);
          setActiveTab('checkout');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      <Suspense fallback={null}>
        {/* Wishlist Drawer Slide-Over */}
        {isWishlistOpen && (
          <WishlistDrawer
            isOpen={isWishlistOpen}
            onClose={() => setIsWishlistOpen(false)}
            wishlistProducts={wishlistProducts}
            onRemoveFromWishlist={handleToggleWishlist}
            onAddToCart={handleAddToCart}
            onClearWishlist={handleClearWishlist}
            onOpenDetails={handleOpenProductDetails}
            settings={settings}
          />
        )}

        {/* Quick View Modal */}
        {quickViewProduct && (
          <QuickViewModal
            product={quickViewProduct}
            onClose={() => setQuickViewProduct(null)}
            onAddToCart={handleAddToCart}
            settings={settings}
            isInCart={cartProductIds.has(quickViewProduct.id)}
          />
        )}

        {/* Supabase & Bolt Code Modal */}
        {isDocsOpen && <SupabaseCodeModal isOpen={isDocsOpen} onClose={() => setIsDocsOpen(false)} />}

        {/* AI Admin Copilot Modal */}
        {isCopilotOpen && (
          <AdminCopilotModal
            isOpen={isCopilotOpen}
            onClose={() => setIsCopilotOpen(false)}
            products={products}
            orders={orders}
            settings={settings}
          />
        )}
      </Suspense>

      {/* Firebase Authentication Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={(profile) => {
          setCurrentUser(profile);
          showToast(`أهلاً بك يا ${profile.name || 'عزيزنا'}! تم تسجيل الدخول بنجاح ✨`);
        }}
      />

      {/* Public Add Product Modal (For Visitors without login) */}
      <PublicAddProductModal
        isOpen={isPublicAddProductOpen}
        onClose={() => setIsPublicAddProductOpen(false)}
        categories={INITIAL_CATEGORIES}
        settings={settings}
        onProductAdded={handleProductAdded}
      />

      {/* Non-intrusive Offline Status Indicator Banner */}
      <OfflineStatusIndicator />

      {/* Footer */}
      <footer className="bg-stone-900 text-stone-300 text-xs py-12 border-t border-stone-800 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8 pb-8 border-b border-stone-800">
            {/* Col 1 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 font-black text-white text-lg">
                <Sparkles className="w-5 h-5 text-rose-500" />
                <span>{settings.storeName}</span>
              </div>
              <p className="text-stone-400 text-xs leading-relaxed">
                متجر إلكتروني فاخر لمنتجات التجميل والعناية الشخصية والعطور الأصلية 100%. نظام طلب مباشر فوري عبر واتساب مدعوم بالذكاء الاصطناعي.
              </p>
            </div>

            {/* Col 2 */}
            <div>
              <h4 className="font-bold text-white mb-3 text-sm">أقسام المتجر</h4>
              <ul className="space-y-2 text-stone-400 text-xs">
                {INITIAL_CATEGORIES.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => {
                        setActiveTab('store');
                        window.scrollTo({ top: 400, behavior: 'smooth' });
                      }}
                      className="hover:text-rose-400 transition-colors"
                    >
                      {c.name_ar}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Col 3 */}
            <div>
              <h4 className="font-bold text-white mb-3 text-sm">طرق الطلب والدفع</h4>
              <p className="text-stone-400 text-xs leading-relaxed mb-3">
                يتم حفظ كافة الطلبات آلياً وإرسال تفاصيل الطلب عبر واتساب مع خدمة عملاء لتأكيد الشحن والتوصيل.
              </p>
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                <MessageCircle className="w-4 h-4" />
                <span>واتساب المتجر: {settings.whatsappNumber}</span>
              </div>
            </div>

            {/* Col 4 */}
            <div>
              <h4 className="font-bold text-white mb-3 text-sm">تطوير وتكامل</h4>
              <p className="text-stone-400 text-xs leading-relaxed mb-3">
                مشروع مهيأ بالكامل للإنتاج مع Supabase و Next.js و Tailwind CSS و Gemini 3.8 Flash.
              </p>
              <button
                onClick={() => setIsDocsOpen(true)}
                className="bg-stone-800 hover:bg-stone-700 text-rose-300 px-3.5 py-2 rounded-xl text-xs font-bold border border-stone-700 transition-colors mb-2 w-full text-right flex items-center gap-2 cursor-pointer"
              >
                <Code className="w-3.5 h-3.5" />
                <span>عرض كود Supabase و Edge Function</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab('driver');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 px-3.5 py-2 rounded-xl text-xs font-bold border border-amber-800/60 transition-colors mb-2 w-full text-right flex items-center gap-2 cursor-pointer"
              >
                <Truck className="w-3.5 h-3.5 text-amber-400" />
                <span>بوابة مندوب التوصيل الميداني 🛵</span>
              </button>
              <button
                onClick={() => setActiveTab('admin')}
                className="bg-stone-800 hover:bg-stone-700 text-white px-3.5 py-2 rounded-xl text-xs font-black border border-stone-700 transition-colors w-full text-right flex items-center gap-2 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5 text-rose-400" />
                <span>بوابة الإدارة والموظفين</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-stone-500 text-[11px]">
            <p>© {new Date().getFullYear()} {settings.storeName}. جميع الحقوق محفوظة.</p>
            <p className="flex items-center gap-1">
              صُنع بعناية فائقة لتقديم تجربة تسوق راقية
              <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
