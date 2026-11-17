import { adminDb } from '../../../lib/firebase-admin.ts';
import { PriceObservation, Supplier, SupplierProduct } from '../types/hub.ts';

const SUPPLIERS_COL = 'supplier_ai_suppliers';
const PRODUCTS_COL = 'supplier_ai_supplier_products';
const OBSERVATIONS_COL = 'supplier_ai_price_observations';

export const resolveSupplier = async (query: string): Promise<Supplier | null> => {
  // Simple search by name or code - RAG-based search should be here
  const suppliersSnapshot = await adminDb.collection(SUPPLIERS_COL).get();
  
  for (const doc of suppliersSnapshot.docs) {
    const data = doc.data() as Supplier;
    if (
        data.businessName.includes(query) || 
        data.supplierCode === query || 
        data.whatsappPhone.includes(query)
    ) {
      return { ...data, id: doc.id };
    }
  }
  return null;
};

export const resolveProduct = async (supplierId: string, query: string): Promise<SupplierProduct | null> => {
  const productsSnapshot = await adminDb.collection(PRODUCTS_COL)
    .where('supplierId', '==', supplierId)
    .get();

  for (const doc of productsSnapshot.docs) {
    const data = doc.data() as SupplierProduct;
    if (data.name.includes(query) || data.sku === query) {
      return { ...data, id: doc.id };
    }
  }
  return null;
};

export const getLatestSupplierPrice = async (supplierId: string, productId: string): Promise<PriceObservation | null> => {
  const snapshot = await adminDb.collection(OBSERVATIONS_COL)
    .where('supplierId', '==', supplierId)
    .where('productId', '==', productId)
    .orderBy('observedAt', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as PriceObservation;
};

export const getSupplierPriceHistory = async (supplierId: string, productId: string): Promise<PriceObservation[]> => {
  const snapshot = await adminDb.collection(OBSERVATIONS_COL)
    .where('supplierId', '==', supplierId)
    .where('productId', '==', productId)
    .orderBy('observedAt', 'desc')
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PriceObservation));
};

export const compareProductAcrossSuppliers = async (productId: string): Promise<any[]> => {
  const snapshot = await adminDb.collection(OBSERVATIONS_COL)
    .where('productId', '==', productId)
    .get();

  // Aggregate by supplier
  const comparisons: Record<string, PriceObservation> = {};
  
  snapshot.docs.forEach(doc => {
    const obs = { id: doc.id, ...doc.data() } as PriceObservation;
    if (!comparisons[obs.supplierId] || new Date(obs.observedAt) > new Date(comparisons[obs.supplierId].observedAt)) {
        comparisons[obs.supplierId] = obs;
    }
  });

  return Object.values(comparisons);
};
