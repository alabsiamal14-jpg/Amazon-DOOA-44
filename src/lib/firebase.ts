import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  onIdTokenChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  getDocFromServer,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Product, CartItem, Order, OrderStatus, UserProfile } from '../types';
import { INITIAL_PRODUCTS } from '../data/initialData';
import {
  getStoredProducts,
  saveStoredProducts,
  upsertStoredProduct,
  removeStoredProduct,
  getStoredOrders,
  saveStoredOrders,
  setFirebaseIdToken,
  registerFirebaseTokenProvider,
  getAuthHeadersAsync,
  getAdminToken,
} from './storage';

// =========================================================================
// 1. FIREBASE SINGLETON INITIALIZATION WITH EXACT PROJECT CONFIGURATION
// =========================================================================

// Ensure single instance across the entire application runtime
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Auth Instance
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();

registerFirebaseTokenProvider(async () => {
  if (!auth.currentUser) return null;
  const token = await auth.currentUser.getIdToken();
  setFirebaseIdToken(token);
  return token;
});

onIdTokenChanged(auth, async (user) => {
  if (!user) {
    setFirebaseIdToken(null);
    return;
  }
  try {
    const token = await user.getIdToken();
    setFirebaseIdToken(token);
  } catch {
    setFirebaseIdToken(null);
  }
});

// Workspace Scopes
googleAuthProvider.addScope('https://www.googleapis.com/auth/spreadsheets');

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Cache the access token in memory.
let cachedAccessToken: string | null = null;

// Firestore Instance with exact Database ID from firebase-applet-config.json
export const firestoreDatabaseId = firebaseConfig.firestoreDatabaseId || '(default)';

export const db = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// Helper for resilient async operations with timeout fallback
export async function withFirestoreTimeout<T>(promise: Promise<T>, timeoutMs = 4500): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Firestore connection timeout or offline')), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  const friendly = getFriendlyFirebaseErrorMessage(error);
  throw new Error(friendly || (error instanceof Error ? error.message : String(error)));
}

// Connection verification test
export async function testConnection(): Promise<boolean> {
  try {
    const snap = await withFirestoreTimeout(getDocs(collection(db, 'products')), 3000);
    return !snap.empty;
  } catch (error) {
    if (error instanceof Error) {
      console.warn('[Firebase] Firestore client connection probe:', error.message);
    }
    return false;
  }
}

// =========================================================================
// 2. ERROR TRANSLATION (ARABIC USER-FRIENDLY MESSAGES)
// =========================================================================

export function getFriendlyFirebaseErrorMessage(err: any): string {
  if (!err) return 'حدث خطأ غير متوقع، يرجى المحاولة ثانية.';
  const code = err.code || '';
  if (code !== 'auth/popup-closed-by-user') {
    console.error('[Firebase Error Code]:', code, err);
  }
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'البريد الإلكتروني أو كلمة المرور غير صحيحة، يرجى التحقق والمحاولة مجدداً.';
    case 'auth/user-not-found':
      return 'لم يتم العثور على حساب مسجل بهذا البريد الإلكتروني. يمكنك إنشاء حساب جديد الآن.';
    case 'auth/email-already-in-use':
      return 'هذا البريد الإلكتروني مسجل مسبقاً. يرجى تسجيل الدخول أو استعادة كلمة المرور.';
    case 'auth/weak-password':
      return 'كلمة المرور ضعيفة جداً. يرجى اختيار كلمة مرور تحتوي على 6 خانات على الأقل.';
    case 'auth/invalid-email':
      return 'صيغة البريد الإلكتروني غير صحيحة. يرجى إدخال بريد صالح مثل name@example.com.';
    case 'auth/operation-not-allowed':
      return 'طريقة تسجيل الدخول هذه غير مفعلة حالياً في إعدادات المشروع.';
    case 'auth/network-request-failed':
      return 'تعذر الاتصال بالخادم، يرجى التحقق من اتصال الإنترنت والمحاولة ثانية.';
    case 'auth/too-many-requests':
      return 'تمت محاولة تسجيل الدخول عدة مرات بشكل خاطئ. تم إيقاف الحساب مؤقتاً لحمايتك، يرجى المحاولة بعد قليل.';
    case 'auth/user-disabled':
      return 'تم تعطيل هذا الحساب من قِبل إدارة النظام.';
    case 'permission-denied':
      return 'ليس لديك الصلاحيات الكافية لتنفيذ هذه العملية.';
    case 'resource-exhausted':
    case 'invalid-argument':
      return 'حجم بيانات المنتج أو الصورة يتجاوز الحد المسموح (1 ميجابايت). يرجى اختيار صورة أصغر أو المحاولة مجدداً.';
    case 'unavailable':
      return 'الخدمة غير متوفرة حالياً، يرجى المحاولة بعد لحظات.';
    default:
      if (err.message && typeof err.message === 'string') {
        if (err.message.includes('maximum allowed size') || err.message.includes('longer than')) {
          return 'حجم الصورة أو بيانات المنتج كبير جداً لحفظه. يرجى ضغط الصورة أو استخدام رابط صورة.';
        }
        if (err.message.includes('offline')) {
          return 'أنت في وضع عدم الاتصال بالإنترنت، تعذر إتمام العملية.';
        }
        if (err.message.includes('timeout')) {
          return 'انتهت مهلة الاتصال بقاعدة البيانات، يرجى التحقق من الشبكة والمحاولة مرة أخرى.';
        }
      }
      return `حدث خطأ غير معروف (${code}): ${err.message || 'يرجى المحاولة لاحقاً.'}`;
  }
}

// =========================================================================
// 3. FIREBASE AUTHENTICATION SERVICES
// =========================================================================

export async function registerWithEmail(
  name: string,
  email: string,
  pass: string
): Promise<{ user: FirebaseUser; profile: UserProfile }> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
  if (name.trim()) {
    try {
      await updateProfile(cred.user, { displayName: name.trim() });
    } catch (e) {
      console.warn('Failed to update displayName on auth user:', e);
    }
  }
  const profile = await syncUserProfile(cred.user, name.trim());
  return { user: cred.user, profile };
}

export async function loginWithEmail(
  email: string,
  pass: string
): Promise<{ user: FirebaseUser; profile: UserProfile }> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
  const profile = await syncUserProfile(cred.user);
  return { user: cred.user, profile };
}

export async function loginWithGooglePopup(): Promise<{ user: FirebaseUser; profile: UserProfile; accessToken: string }> {
  isSigningIn = true;
  try {
    const result = await signInWithPopup(auth, googleAuthProvider);
    const profile = await syncUserProfile(result.user);
    
    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedAccessToken = credential?.accessToken || null;
    
    return { user: result.user, profile, accessToken: cachedAccessToken || '' };
  } finally {
    isSigningIn = false;
  }
}

export const getWorkspaceAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export async function resetUserPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function logoutFirebase(): Promise<void> {
  setFirebaseIdToken(null);
  await signOut(auth);
}

export async function syncUserProfile(
  firebaseUser: FirebaseUser,
  customName?: string
): Promise<UserProfile> {
  const isAdminEmail =
    firebaseUser.email?.toLowerCase() === 'omralabis@gmail.com' &&
    Boolean(firebaseUser.emailVerified);
  
  const userRef = doc(db, 'users', firebaseUser.uid);
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      return {
        uid: firebaseUser.uid,
        name: data.name || customName || firebaseUser.displayName || 'مستخدم أمازون دعاء',
        email: data.email || firebaseUser.email || '',
        photoURL: data.photoURL || firebaseUser.photoURL || undefined,
        role: data.role || (isAdminEmail ? 'admin' : 'customer'),
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    }
  } catch (err) {
    console.warn('Could not read user profile from Firestore:', err);
  }

  // Create clean user document matching Firestore Rules (initial create requires role == 'customer')
  const role: 'admin' | 'customer' = isAdminEmail ? 'admin' : 'customer';
  const newProfile: UserProfile = {
    uid: firebaseUser.uid,
    name: customName || firebaseUser.displayName || 'مستخدم أمازون دعاء',
    email: firebaseUser.email || '',
    photoURL: firebaseUser.photoURL || undefined,
    role,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await setDoc(userRef, {
      ...newProfile,
      role: 'customer',
    });
    if (role === 'admin') {
      await setDoc(userRef, { role: 'admin', updatedAt: new Date().toISOString() }, { merge: true });
      await setDoc(doc(db, 'admins', firebaseUser.uid), {
        email: firebaseUser.email,
        role: 'admin',
        createdAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn('Could not persist new user profile in Firestore:', err);
  }

  return newProfile;
}

export function subscribeToAuthState(
  callback: (user: FirebaseUser | null, profile: UserProfile | null) => void
): () => void {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      callback(null, null);
      return;
    }
    try {
      const profile = await syncUserProfile(firebaseUser);
      callback(firebaseUser, profile);
    } catch {
      callback(firebaseUser, {
        uid: firebaseUser.uid,
        name: firebaseUser.displayName || 'مستخدم أمازون دعاء',
        email: firebaseUser.email || '',
        photoURL: firebaseUser.photoURL || undefined,
        role:
          firebaseUser.email?.toLowerCase() === 'omralabis@gmail.com' &&
          Boolean(firebaseUser.emailVerified)
            ? 'admin'
            : 'customer',
      });
    }
  });
}

// =========================================================================
// 4. CLOUD FIRESTORE CART SERVICES & REAL-TIME SYNC
// =========================================================================

/**
 * Real-time listener for user cart across devices using onSnapshot.
 * Any add/remove/quantity change from another tab or device is broadcasted immediately.
 */
export function subscribeToCartFirestore(
  userId: string,
  allProducts: Product[],
  onUpdate: (items: CartItem[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!userId) {
    return () => {};
  }

  const cartCol = collection(db, 'users', userId, 'cart');
  return onSnapshot(
    cartCol,
    (snapshot) => {
      const items: CartItem[] = [];
      snapshot.forEach((docItem) => {
        const d = docItem.data();
        const product = allProducts.find((p) => p.id === d.productId) || {
          id: d.productId,
          title_ar: d.title_ar || 'منتج',
          description_ar: '',
          original_price: Number(d.price || 0),
          discount_price: null,
          stock_quantity: 10,
          category_id: 'skincare',
          category_name: 'عناية',
          tags: [],
          image_url: d.image_url || '',
          ai_generated: false,
          status: 'published',
          created_at: new Date().toISOString(),
        };

        items.push({
          product,
          quantity: Number(d.quantity || 1),
        });
      });
      onUpdate(items);
    },
    (error) => {
      console.warn('[Firebase] Real-time cart onSnapshot error:', error);
      if (onError) onError(error);
    }
  );
}

/**
 * Fetch one-time cart snapshot from Firestore
 */
export async function fetchCartFirestore(userId: string, allProducts: Product[]): Promise<CartItem[]> {
  if (!userId) return [];
  try {
    const cartCol = collection(db, 'users', userId, 'cart');
    const snap = await withFirestoreTimeout(getDocs(cartCol), 3500);
    if (snap.empty) return [];

    const cartItems: CartItem[] = [];
    snap.forEach((docItem) => {
      const d = docItem.data();
      const product = allProducts.find((p) => p.id === d.productId) || {
        id: d.productId,
        title_ar: d.title_ar || 'منتج',
        description_ar: '',
        original_price: Number(d.price || 0),
        discount_price: null,
        stock_quantity: 10,
        category_id: 'skincare',
        category_name: 'عناية',
        tags: [],
        image_url: d.image_url || '',
        ai_generated: false,
        status: 'published',
        created_at: new Date().toISOString(),
      };

      cartItems.push({
        product,
        quantity: Number(d.quantity || 1),
      });
    });
    return cartItems;
  } catch (err) {
    console.warn('Failed to load cart from Firestore:', err);
    return [];
  }
}

/**
 * Save single cart item with updated quantity in Firestore
 */
export async function saveCartItemFirestore(userId: string, item: CartItem): Promise<void> {
  if (!userId || !item.product?.id) return;
  try {
    const docRef = doc(db, 'users', userId, 'cart', item.product.id);
    await setDoc(docRef, {
      productId: item.product.id,
      quantity: item.quantity,
      title_ar: item.product.title_ar,
      price: item.product.discount_price ?? item.product.original_price,
      image_url: item.product.image_url,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Failed to save cart item in Firestore:', err);
  }
}

/**
 * Remove single item from user cart in Firestore
 */
export async function removeCartItemFirestore(userId: string, productId: string): Promise<void> {
  if (!userId || !productId) return;
  try {
    await deleteDoc(doc(db, 'users', userId, 'cart', productId));
  } catch (err) {
    console.warn('Failed to remove cart item from Firestore:', err);
  }
}

/**
 * Clear all cart items in Firestore
 */
export async function clearCartFirestore(userId: string): Promise<void> {
  if (!userId) return;
  try {
    const cartCol = collection(db, 'users', userId, 'cart');
    const snap = await getDocs(cartCol);
    const deletePromises = snap.docs.map((d) => deleteDoc(d.ref));
    await Promise.all(deletePromises);
  } catch (err) {
    console.warn('Failed to clear cart in Firestore:', err);
  }
}

/**
 * Safe merge policy on login: Combines guest items with Firestore items without loss or duplication.
 */
export async function mergeCartOnLogin(
  userId: string,
  guestCart: CartItem[],
  allProducts: Product[]
): Promise<CartItem[]> {
  if (!userId) return guestCart;
  try {
    const serverCart = await fetchCartFirestore(userId, allProducts);
    const mergedMap = new Map<string, CartItem>();

    // 1. Add existing Firestore items
    for (const item of serverCart) {
      mergedMap.set(item.product.id, { ...item });
    }

    // 2. Merge guest items: sum quantities if item already exists in server cart
    for (const guestItem of guestCart) {
      if (mergedMap.has(guestItem.product.id)) {
        const existing = mergedMap.get(guestItem.product.id)!;
        existing.quantity = Math.max(existing.quantity, guestItem.quantity);
      } else {
        mergedMap.set(guestItem.product.id, { ...guestItem });
      }
    }

    const mergedList = Array.from(mergedMap.values());

    // 3. Persist merged result back to Firestore
    for (const item of mergedList) {
      await saveCartItemFirestore(userId, item);
    }

    return mergedList;
  } catch (err) {
    console.warn('Failed to merge cart on login:', err);
    return guestCart;
  }
}

export async function syncCartFirestore(userId: string, items: CartItem[]): Promise<void> {
  if (!userId) return;
  try {
    for (const it of items) {
      await saveCartItemFirestore(userId, it);
    }
  } catch (err) {
    console.warn('Failed to sync cart to Firestore:', err);
  }
}

// =========================================================================
// 5. CLOUD FIRESTORE WISHLIST SERVICES
// =========================================================================

export async function fetchWishlistFirestore(userId: string): Promise<string[]> {
  if (!userId) return [];
  try {
    const favCol = collection(db, 'users', userId, 'favorites');
    const snap = await withFirestoreTimeout(getDocs(favCol), 3500);
    if (snap.empty) return [];

    const ids: string[] = [];
    snap.forEach((docItem) => {
      ids.push(docItem.id);
    });
    return ids;
  } catch (err) {
    console.warn('Failed to load wishlist from Firestore:', err);
    return [];
  }
}

export async function addWishlistFirestore(userId: string, product: Product): Promise<void> {
  if (!userId || !product?.id) return;
  try {
    const docRef = doc(db, 'users', userId, 'favorites', product.id);
    await setDoc(docRef, {
      productId: product.id,
      title_ar: product.title_ar,
      price: product.discount_price ?? product.original_price,
      image_url: product.image_url,
      addedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Failed to add to wishlist in Firestore:', err);
  }
}

export async function removeWishlistFirestore(userId: string, productId: string): Promise<void> {
  if (!userId || !productId) return;
  try {
    await deleteDoc(doc(db, 'users', userId, 'favorites', productId));
  } catch (err) {
    console.warn('Failed to remove from wishlist in Firestore:', err);
  }
}

// =========================================================================
// 6. CLOUD FIRESTORE PRODUCTS SERVICES
// =========================================================================

export async function fetchProductsFirestore(): Promise<{ products: Product[]; isFirebase: boolean }> {
  try {
    const productsRef = collection(db, 'products');
    const snap = await withFirestoreTimeout(getDocs(productsRef), 12000);

    if (snap.empty) {
      const seeded = await seedInitialProductsFirestore(INITIAL_PRODUCTS);
      if (seeded) {
        saveStoredProducts(INITIAL_PRODUCTS);
        return { products: INITIAL_PRODUCTS, isFirebase: true };
      }
      return { products: getStoredProducts(), isFirebase: false };
    }

    const items: Product[] = [];
    const DEFAULT_IMG = 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80';
    snap.forEach((docItem) => {
      const d = docItem.data();
      const title = (d.title_ar || d.name || '').trim();
      // Skip empty drafts or placeholder records with 0 price and missing proper titles
      if (!title || title === 'منتج غير مسمى') {
        return;
      }

      let img = d.image_url || (Array.isArray(d.images) && d.images[0]) || '';
      if (!img || img.startsWith('blob:')) {
        img = DEFAULT_IMG;
      }

      const price = Number(d.original_price ?? d.price ?? 50);

      items.push({
        id: docItem.id,
        title_ar: title,
        description_ar: d.description_ar || d.description || '',
        original_price: price > 0 ? price : 50,
        discount_price: d.discount_price !== undefined && d.discount_price !== null ? Number(d.discount_price) : null,
        stock_quantity: Number(d.stock_quantity ?? d.quantity ?? 10),
        category_id: d.category_id || 'skincare',
        category_name: d.category_name || 'عناية بالبشرة',
        tags: Array.isArray(d.tags) ? d.tags : [],
        image_url: img,
        gallery_images: Array.isArray(d.gallery_images) ? d.gallery_images : undefined,
        video_url: typeof d.video_url === 'string' && !d.video_url.startsWith('blob:') ? d.video_url : undefined,
        video_duration: typeof d.video_duration === 'number' ? d.video_duration : undefined,
        size_or_volume: d.size_or_volume || undefined,
        skin_type: d.skin_type || undefined,
        key_benefits: Array.isArray(d.key_benefits) ? d.key_benefits : undefined,
        ai_generated: Boolean(d.ai_generated),
        rating: Number(d.rating ?? 5.0),
        reviews_count: Number(d.reviews_count ?? 1),
        how_to_use: d.how_to_use || undefined,
        ingredients: d.ingredients || undefined,
        badge: d.badge || undefined,
        contact_phone: d.contact_phone || undefined,
        created_at: d.createdAt || d.created_at || new Date().toISOString(),
        featured: Boolean(d.featured),
        status: d.status === 'draft' ? 'draft' : 'published',
        creator_id: d.creator_id,
      });
    });

    // Sort Firestore items newest-first so newly added products always lead
    items.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    const firestoreIds = new Set(items.map(p => p.id));
    const missingInitial = INITIAL_PRODUCTS.filter(ip => !firestoreIds.has(ip.id));
    const combinedProducts = missingInitial.length > 0 ? [...items, ...missingInitial] : items;

    saveStoredProducts(combinedProducts);
    return { products: combinedProducts, isFirebase: true };
  } catch (err) {
    console.warn('Error fetching products from Firestore, using local fallback:', err);
    return { products: getStoredProducts(), isFirebase: false };
  }
}

export async function seedInitialProductsFirestore(productsList: Product[]): Promise<boolean> {
  try {
    for (const p of productsList) {
      await setDoc(doc(db, 'products', p.id), {
        id: p.id,
        title_ar: p.title_ar,
        description_ar: p.description_ar,
        original_price: p.original_price,
        discount_price: p.discount_price ?? null,
        stock_quantity: p.stock_quantity,
        category_id: p.category_id,
        category_name: p.category_name,
        image_url: p.image_url,
        video_url: p.video_url || null,
        tags: p.tags || [],
        rating: p.rating ?? 5.0,
        reviews_count: p.reviews_count ?? 1,
        featured: Boolean(p.featured),
        ai_generated: Boolean(p.ai_generated),
        createdAt: p.created_at || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    return true;
  } catch (e) {
    console.warn('Could not seed initial products to Firestore:', e);
    return false;
  }
}

export async function saveProductFirestore(product: Product): Promise<void> {
  const path = `products/${product.id}`;
  const cleanTitle = String(product.title_ar || '').trim().slice(0, 300) || 'منتج جديد';
  const rawPrice = Number(product.original_price);
  const safeOriginalPrice = Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : 50;
  const rawDiscount = product.discount_price !== undefined && product.discount_price !== null ? Number(product.discount_price) : null;
  const safeDiscountPrice = rawDiscount !== null && Number.isFinite(rawDiscount) && rawDiscount > 0 ? rawDiscount : null;
  const safeVideoUrl =
    typeof product.video_url === 'string' && product.video_url.trim() && !product.video_url.startsWith('blob:')
      ? product.video_url.trim()
      : null;
  const safeImageUrl =
    typeof product.image_url === 'string' && product.image_url.trim() && !product.image_url.startsWith('blob:')
      ? product.image_url.trim()
      : 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80';

  const normalizedProduct: Product = {
    ...product,
    title_ar: cleanTitle,
    original_price: safeOriginalPrice,
    discount_price: safeDiscountPrice,
    image_url: safeImageUrl,
    video_url: safeVideoUrl || undefined,
    status: product.status || 'published',
  };

  // Always cache locally immediately so offline/slow refreshes still keep the new product
  upsertStoredProduct(normalizedProduct);

  const payload: Record<string, any> = {
    id: normalizedProduct.id,
    title_ar: cleanTitle,
    description_ar: String(normalizedProduct.description_ar || ''),
    original_price: safeOriginalPrice,
    discount_price: safeDiscountPrice,
    stock_quantity: Number.isFinite(Number(normalizedProduct.stock_quantity))
      ? Math.max(0, Math.floor(Number(normalizedProduct.stock_quantity)))
      : 10,
    category_id: normalizedProduct.category_id || 'skincare',
    category_name: normalizedProduct.category_name || 'عناية بالبشرة',
    image_url: safeImageUrl,
    gallery_images: Array.isArray(normalizedProduct.gallery_images)
      ? normalizedProduct.gallery_images.filter((img) => typeof img === 'string' && !img.startsWith('blob:'))
      : [],
    video_url: safeVideoUrl,
    video_duration: typeof normalizedProduct.video_duration === 'number' ? normalizedProduct.video_duration : null,
    size_or_volume: normalizedProduct.size_or_volume || null,
    skin_type: normalizedProduct.skin_type || null,
    key_benefits: Array.isArray(normalizedProduct.key_benefits) ? normalizedProduct.key_benefits : [],
    how_to_use: normalizedProduct.how_to_use || null,
    ingredients: normalizedProduct.ingredients || null,
    badge: normalizedProduct.badge || null,
    tags: Array.isArray(normalizedProduct.tags) ? normalizedProduct.tags : [],
    rating: Number.isFinite(Number(normalizedProduct.rating)) ? Number(normalizedProduct.rating) : 5.0,
    reviews_count: Number.isFinite(Number(normalizedProduct.reviews_count)) ? Number(normalizedProduct.reviews_count) : 1,
    featured: Boolean(normalizedProduct.featured),
    ai_generated: Boolean(normalizedProduct.ai_generated),
    status: normalizedProduct.status || 'published',
    creator_id: normalizedProduct.creator_id || null,
    contact_phone: normalizedProduct.contact_phone || null,
    createdAt: normalizedProduct.created_at || new Date().toISOString(),
    created_at: normalizedProduct.created_at || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await withFirestoreTimeout(
      setDoc(doc(db, 'products', normalizedProduct.id), payload, { merge: true }),
      12000
    );
  } catch (err: any) {
    // Only try staff/admin backend fallback when an authenticated session exists
    if (auth.currentUser || getAdminToken()) {
      try {
        const authHeaders = await getAuthHeadersAsync();
        const res = await fetch('/api/db/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify(normalizedProduct),
        });
        if (res.ok) {
          return;
        }
      } catch {
        // Fall through to standard handleFirestoreError
      }
    }
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteProductFirestore(productId: string): Promise<void> {
  const path = `products/${productId}`;
  removeStoredProduct(productId);
  try {
    await withFirestoreTimeout(deleteDoc(doc(db, 'products', productId)), 10000);
  } catch (err: any) {
    if (auth.currentUser || getAdminToken()) {
      try {
        const authHeaders = await getAuthHeadersAsync();
        const res = await fetch(`/api/db/products/${encodeURIComponent(productId)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
        });
        if (res.ok) {
          return;
        }
      } catch {
        // Fall through to standard handleFirestoreError
      }
    }
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// =========================================================================
// 7. CLOUD FIRESTORE ORDERS SERVICES
// =========================================================================

export async function createOrderFirestore(order: Order, userId?: string): Promise<void> {
  const currentOrders = getStoredOrders();
  saveStoredOrders([order, ...currentOrders]);

  try {
    const orderDocRef = doc(db, 'orders', order.id);
    await setDoc(orderDocRef, {
      id: order.id,
      order_number: order.order_number,
      userId: userId || order.userId || 'guest',
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      customer_email: order.customer_email || '',
      customer_city: order.city,
      customer_address: order.address,
      items: order.items || [],
      subtotal: Number(order.subtotal || 0),
      discount_amount: Number(order.discount_amount || 0),
      coupon_code: order.coupon_code || null,
      delivery_fee: Number(order.delivery_fee || 0),
      total_amount: Number(order.total_amount || 0),
      currency: 'ريال',
      status: order.status || 'pending',
      payment_method: order.payment_method || 'cod',
      delivery_speed: order.delivery_speed || 'توصيل قياسي',
      whatsapp_sent: Boolean(order.whatsapp_sent ?? true),
      notes: order.notes || '',
      createdAt: order.created_at || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Failed to save order to Firestore, cached locally:', err);
  }
}

export async function fetchOrdersFirestore(
  userId?: string,
  isAdmin?: boolean
): Promise<{ orders: Order[]; isFirebase: boolean }> {
  try {
    const ordersCol = collection(db, 'orders');
    let q = query(ordersCol);

    if (!isAdmin && userId) {
      q = query(ordersCol, where('userId', '==', userId));
    }

    const snap = await withFirestoreTimeout(getDocs(q), 3500);
    if (snap.empty) {
      return { orders: getStoredOrders(), isFirebase: true };
    }

    const items: Order[] = [];
    snap.forEach((docItem) => {
      const d = docItem.data();
      items.push({
        id: docItem.id,
        order_number: d.order_number || docItem.id,
        userId: d.userId,
        customer_name: d.customer_name || 'عميل',
        customer_phone: d.customer_phone || '',
        city: d.customer_city || d.city || '',
        address: d.customer_address || d.address || '',
        notes: d.notes || '',
        items: Array.isArray(d.items) ? d.items : [],
        subtotal: Number(d.subtotal || 0),
        discount_amount: Number(d.discount_amount || 0),
        delivery_fee: Number(d.delivery_fee || 0),
        total_amount: Number(d.total_amount || 0),
        status: (d.status || 'pending') as OrderStatus,
        whatsapp_sent: Boolean(d.whatsapp_sent),
        payment_method: d.payment_method,
        driver_name: d.driver_name,
        driver_phone: d.driver_phone,
        driver_id: d.driver_id,
        cod_collected: Boolean(d.cod_collected),
        cod_collected_amount: d.cod_collected_amount ? Number(d.cod_collected_amount) : undefined,
        driver_notes: d.driver_notes,
        delivered_at: d.delivered_at,
        created_at: d.createdAt || new Date().toISOString(),
        updated_at: d.updatedAt,
      });
    });

    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    saveStoredOrders(items);
    return { orders: items, isFirebase: true };
  } catch (err) {
    console.warn('Failed to load orders from Firestore:', err);
    return { orders: getStoredOrders(), isFirebase: false };
  }
}

export async function updateOrderStatusFirestore(
  orderId: string,
  status: OrderStatus,
  extraData?: {
    cod_collected?: boolean;
    cod_collected_amount?: number;
    driver_notes?: string;
    driver_name?: string;
    driver_phone?: string;
  }
): Promise<void> {
  const orders = getStoredOrders();
  const updated = orders.map((o) =>
    o.id === orderId
      ? {
          ...o,
          status,
          ...(extraData || {}),
          updated_at: new Date().toISOString(),
        }
      : o
  );
  saveStoredOrders(updated);

  try {
    const docRef = doc(db, 'orders', orderId);
    const updatePayload: Record<string, any> = {
      status,
      updatedAt: new Date().toISOString(),
      ...(extraData || {}),
    };
    if (status === 'delivered') {
      updatePayload.delivered_at = new Date().toISOString();
    }
    await updateDoc(docRef, updatePayload);
  } catch (err) {
    console.warn('Failed to update order status in Firestore:', err);
  }
}

/**
 * Assign driver to an order in Firestore
 */
export async function updateOrderDriverFirestore(
  orderId: string,
  driverInfo: { driver_name: string; driver_phone: string; driver_id?: string }
): Promise<void> {
  try {
    const docRef = doc(db, 'orders', orderId);
    await updateDoc(docRef, {
      driver_name: driverInfo.driver_name,
      driver_phone: driverInfo.driver_phone,
      driver_id: driverInfo.driver_id || null,
      status: 'shipped',
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Failed to update driver in Firestore:', err);
  }
}

/**
 * Update user role in Firestore (Admin only)
 */
export async function updateUserProfileRole(uid: string, role: 'admin' | 'staff' | 'driver' | 'user' | 'customer'): Promise<void> {
  if (!uid) return;
  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      role,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to update user role in Firestore:', err);
    throw err;
  }
}
