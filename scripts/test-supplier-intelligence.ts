import { adminDb } from '../src/lib/firebase-admin.ts';
import * as supplierRag from '../src/features/whatsapp-supplier-ai/services/rag.ts';

async function runTests() {
  console.log('--- Starting Supplier Intelligence Tests ---');

  // Seed test data
  const supplierId = 'test-supp-001';
  const productId = 'test-prod-001';
  
  await adminDb.collection('supplier_ai_suppliers').doc(supplierId).set({
    supplierCode: 'SUP-TEST-001',
    shortCode: 'TST',
    businessName: 'أبو صالح للتجارة',
    whatsappPhone: '+967777777777',
    createdAt: new Date().toISOString()
  });

  await adminDb.collection('supplier_ai_supplier_products').doc(productId).set({
    supplierId,
    name: 'سيروم',
    sku: 'SERUM-TEST',
    currentCost: 10000,
    status: 'approved'
  });

  await adminDb.collection('supplier_ai_price_observations').add({
    supplierId,
    productId,
    supplierCost: 10000,
    currency: 'ريال',
    observedAt: '2026-10-01T00:00:00Z',
    createdAt: new Date().toISOString()
  });

  await adminDb.collection('supplier_ai_price_observations').add({
    supplierId,
    productId,
    supplierCost: 11000,
    currency: 'ريال',
    observedAt: '2026-10-06T00:00:00Z',
    createdAt: new Date().toISOString()
  });

  // Test A: Get Latest Price
  const price = await supplierRag.getLatestSupplierPrice(supplierId, productId);
  console.log('Test A (Latest Price):', price?.supplierCost === 11000 ? 'PASSED' : 'FAILED');

  // Test B: History
  const history = await supplierRag.getSupplierPriceHistory(supplierId, productId);
  console.log('Test B (History):', history.length === 2 ? 'PASSED' : 'FAILED');

  // Test C: Compare
  const comparison = await supplierRag.compareProductAcrossSuppliers(productId);
  console.log('Test C (Comparison):', comparison.length >= 1 ? 'PASSED' : 'FAILED');
}

runTests().catch(console.error);
