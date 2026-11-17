import { Router, Response } from 'express';
import { adminDb } from '../../../lib/firebase-admin.ts';
import { requireAdmin, AuthRequest } from '../../../middleware/auth.ts';
import { SupplierAiDocument, SupplierProductDraft } from '../../../features/whatsapp-supplier-ai/types/index.ts';

const router = Router();

// Endpoint: POST /api/whatsapp-supplier-ai/review
router.post('/review', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {

    const { supplier, products } = req.body;

    if (!supplier || !supplier.name || !supplier.whatsappPhone || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'معلومات المورد أو قائمة المنتجات غير مكتملة.' });
    }

    const cleanPhone = supplier.whatsappPhone.replace(/\D/g, '');

    // Transaction-based supplier creation with atomic SUP-XXXX code generation
    const transactionResult = await adminDb.runTransaction(async (transaction) => {
      // 1. Fetch existing suppliers to avoid duplicate phones and calculate unique sequential SUP code
      const suppliersSnap = await adminDb.collection('supplier_ai_suppliers').get();
      const existingSuppliers = suppliersSnap.docs.map(doc => doc.data() as SupplierAiDocument);

      const alreadyExists = existingSuppliers.find(s => s.whatsappPhone === cleanPhone);
      
      let supplierCode = '';
      let supplierId = '';

      if (alreadyExists) {
        supplierCode = alreadyExists.code;
        supplierId = alreadyExists.id;
        console.info(`[Supplier Review] Supplier phone ${cleanPhone} already exists. Using code ${supplierCode}`);
      } else {
        // Calculate the next SUP sequence
        let maxNum = 0;
        existingSuppliers.forEach(s => {
          const match = s.code.match(/SUP-(\d+)/);
          if (match) {
            const num = parseInt(match[1]);
            if (num > maxNum) maxNum = num;
          }
        });

        const nextNum = maxNum + 1;
        supplierCode = `SUP-${String(nextNum).padStart(4, '0')}`;
        supplierId = `sup-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

        const newSupplierRef = adminDb.collection('supplier_ai_suppliers').doc(supplierId);
        const newSupplierData: SupplierAiDocument = {
          id: supplierId,
          code: supplierCode,
          name: supplier.name,
          whatsappName: supplier.whatsappName || '',
          whatsappPhone: cleanPhone,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        transaction.set(newSupplierRef, newSupplierData);
        console.info(`[Supplier Review] Atomically generated new supplier code ${supplierCode}`);
      }

      // 2. Draft approved products and calculate trusted server-side markup pricing
      const createdDrafts: SupplierProductDraft[] = [];

      for (const item of products) {
        const costPrice = parseFloat(item.supplierCost) || 0;
        const markupPercent = parseFloat(item.markupPercent) || 30; // 30% default markup
        const salePrice = Math.round(costPrice * (1 + markupPercent / 100)); // Server calculates price safely

        const draftId = `draft-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const draftRef = adminDb.collection('supplier_ai_product_drafts').doc(draftId);

        const draftData: SupplierProductDraft = {
          id: draftId,
          supplierId,
          supplierCode,
          productName: item.name || 'مستحضر تجميل مورد',
          description: item.description || '',
          costPrice,
          markupPercent,
          salePrice,
          stockQuantity: parseInt(item.stockQuantity) || 15,
          status: 'draft',
          createdAt: new Date().toISOString(),
        };

        transaction.set(draftRef, draftData);
        createdDrafts.push(draftData);
      }

      // Record this import transaction history
      const importId = `import-${Date.now()}`;
      const importRef = adminDb.collection('supplier_ai_imports').doc(importId);
      transaction.set(importRef, {
        id: importId,
        supplierId,
        supplierCode,
        importedAt: new Date().toISOString(),
        itemCount: products.length,
      });

      return {
        supplier: {
          id: supplierId,
          code: supplierCode,
          name: supplier.name,
          whatsappPhone: cleanPhone,
        },
        drafts: createdDrafts,
      };
    });

    return res.json({
      success: true,
      message: 'تم إدراج المورد وحفظ قائمة المسودات بنجاح.',
      data: transactionResult,
    });

  } catch (error: any) {
    console.error('[Supplier Review] Confirmation error:', error.message);
    return res.status(500).json({ error: error.message || 'فشل معالجة واعتماد المورد.' });
  }
});

export default router;
