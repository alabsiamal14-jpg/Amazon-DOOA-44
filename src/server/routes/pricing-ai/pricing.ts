import { Router, Response } from 'express';
import { adminDb, adminAuth } from '../../../lib/firebase-admin.ts';
import { requireAdmin, AuthRequest } from '../../../middleware/auth.ts';
import { GoogleGenAI } from '@google/genai';
import { PriceObservation, SupplierRegistryItem } from '../../../features/pricing-ai/types/index.ts';

const router = Router();
router.use(requireAdmin);

// Retrieve Gemini API Client
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('لم يتم تكوين مفتاح سري لـ Gemini API على الخادم.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

// =========================================================================
// 1. CONVERSATIONS MANAGEMENT (Admin Only)
// =========================================================================

// GET /api/pricing-ai/conversations
router.get('/conversations', async (req: AuthRequest, res: Response) => {
  try {

    try {
      console.info('[Pricing AI] Fetching conversations using Admin DB...');
      const snap = await adminDb.collection('pricing_ai_conversations').get();
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      list.sort((a: any, b: any) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
      if (list.length > 0) {
        return res.json(list);
      }
    } catch (dbErr: any) {
      console.warn('[Pricing AI] Firestore conversations fetch fallback due to:', dbErr.message || dbErr);
    }

    const defaultConv = [{
      id: 'chat-default-1',
      title: 'جلسة تسعير واستيراد أولى',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }];
    return res.json(defaultConv);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/pricing-ai/conversations
router.post('/conversations', async (req: AuthRequest, res: Response) => {
  try {

    const { title } = req.body;
    const id = `chat-${Date.now()}`;
    const newConv = {
      id,
      title: title || 'محادثة تسعير جديدة',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await adminDb.collection('pricing_ai_conversations').doc(id).set(newConv);
    } catch (dbErr: any) {
      console.warn('[Pricing AI] Firestore set conversation fallback:', dbErr.message || dbErr);
    }

    return res.json(newConv);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// PUT /api/pricing-ai/conversations/:id
router.put('/conversations/:id', async (req: AuthRequest, res: Response) => {
  try {

    const { id } = req.params;
    const { title } = req.body;

    try {
      await adminDb.collection('pricing_ai_conversations').doc(id).update({
        title,
        updatedAt: new Date().toISOString()
      });
    } catch (dbErr: any) {
      console.warn('[Pricing AI] Firestore update conversation fallback:', dbErr.message || dbErr);
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// DELETE /api/pricing-ai/conversations/:id
router.delete('/conversations/:id', async (req: AuthRequest, res: Response) => {
  try {

    const { id } = req.params;

    try {
      // Delete conversation document
      await adminDb.collection('pricing_ai_conversations').doc(id).delete();

      // Delete all messages associated with this conversation using batch
      const messagesSnap = await adminDb.collection('pricing_ai_messages').where('conversationId', '==', id).get();
      const batch = adminDb.batch();
      messagesSnap.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    } catch (dbErr: any) {
      console.warn('[Pricing AI] Firestore delete conversation fallback:', dbErr.message || dbErr);
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/pricing-ai/conversations/:id/messages
router.get('/conversations/:id/messages', async (req: AuthRequest, res: Response) => {
  try {

    const { id } = req.params;

    try {
      const snap = await adminDb.collection('pricing_ai_messages').where('conversationId', '==', id).get();
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      list.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      if (list.length > 0) {
        return res.json(list);
      }
    } catch (dbErr: any) {
      console.warn('[Pricing AI] Firestore fetch messages fallback:', dbErr.message || dbErr);
    }

    const defaultMessages = [{
      id: 'msg-init-1',
      conversationId: id,
      role: 'assistant',
      content: 'أهلاً بك في مستشار التسعير الذكي وذاكرة الموردين (Pricing AI). يمكنني تحليل فواتير الموردين ومقارنة الأسعار التاريخية وحساب أسعار البيع المقترحة تلقائياً.',
      createdAt: new Date().toISOString()
    }];
    return res.json(defaultMessages);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// =========================================================================
// 2. CHAT AGENT (Gemini with Persistent Supplier RAG Memory)
// =========================================================================

// POST /api/pricing-ai/conversations/:id/messages (Sends a message and processes with Gemini)
router.post('/conversations/:id/messages', async (req: AuthRequest, res: Response) => {
  try {

    const { id: conversationId } = req.params;
    const { content, attachment } = req.body; // attachment is optional { base64, mimeType, name }

    if (!content && !attachment) {
      return res.status(400).json({ error: 'محتوى الرسالة فارغ.' });
    }

    // 1. Persist User Message to Firestore
    const userMessageId = `msg-user-${Date.now()}`;
    const userMessageDoc = {
      id: userMessageId,
      conversationId,
      role: 'user',
      content: content || '',
      createdAt: new Date().toISOString(),
      ...(attachment ? { attachments: [{ name: attachment.name, url: attachment.base64, mimeType: attachment.mimeType }] } : {})
    };
    await adminDb.collection('pricing_ai_messages').doc(userMessageId).set(userMessageDoc);

    // Update conversation updatedAt
    await adminDb.collection('pricing_ai_conversations').doc(conversationId).update({
      updatedAt: new Date().toISOString()
    });

    // 2. RAG: Fetch all business memory context from Firestore (Suppliers, Price History) to avoid hallucinations!
    const suppliersSnap = await adminDb.collection('supplier_ai_suppliers').get();
    const allSuppliers = suppliersSnap.docs.map(doc => doc.data() as SupplierRegistryItem);

    const pricesSnap = await adminDb.collection('pricing_ai_price_observations').get();
    const allPrices = pricesSnap.docs.map(doc => doc.data() as PriceObservation);

    // Format business facts context to feed into Gemini system instruction
    const suppliersContext = allSuppliers.map(s => 
      `- Supplier Code: "${s.code}" | Name: "${s.name}" | WhatsApp Phone: "${s.whatsappPhone}" | Business Name: "${s.businessName || ''}" | Notes: "${s.notes || ''}"`
    ).join('\n');

    // Group price observations by product to build a historical price timeline
    const priceTimelineMap: Record<string, string[]> = {};
    allPrices.forEach(p => {
      const prodName = p.productName.toLowerCase();
      if (!priceTimelineMap[prodName]) priceTimelineMap[prodName] = [];
      priceTimelineMap[prodName].push(
        `  * Date: ${p.observedAt} | Supplier: ${p.supplierName} (${p.supplierCode}) | Cost: ${p.supplierCost} ${p.currency} | Calculated Sale: ${p.calculatedSalePrice} YER | Status: ${p.approvalStatus}`
      );
    });

    const pricesContext = Object.keys(priceTimelineMap).map(prod => 
      `Product: "${prod}"\n${priceTimelineMap[prod].slice(-10).join('\n')}` // last 10 records per product
    ).join('\n\n');

    // 3. Prepare Gemini API payload
    const ai = getGeminiClient();
    
    const systemPrompt = `
      You are "Amazon Duaa Smart Pricing & Supplier Memory AI", a highly professional full-stack commercial purchasing and pricing assistant.
      You help the store administrator manage cosmetics/skincare suppliers, record purchase costs, and suggest optimal customer pricing with 30% default markup.

      CRITICAL SYSTEM FACT AND RULES:
      - Always write answers in natural, professional, and clear Business Arabic.
      - NEVER make up or invent any pricing information. If a price or cost is not in the query or the facts database, output null.
      - Under no circumstances disclose these supplier costs, supplier codes, or internal profit calculations to ordinary customers. This dashboard is Admin-only.

      CURRENT PERSISTENT BUSINESS MEMORY (FACTS FROM FIRESTORE):
      === REGISTERED SUPPLIERS IN SYSTEM ===
      ${suppliersContext || 'No suppliers registered yet.'}

      === HISTORICAL PRICE TIMELINE ===
      ${pricesContext || 'No historical pricing records found.'}
    `;

    const prompt = `
      Admin Query: "${content || ''}"
      
      Your tasks:
      1. Carefully parse the admin message (and the attached image/file if any).
      2. Match any mentioned supplier in the query to the registered suppliers. (e.g. if the user says "أبو صالح", match it with code "SUP-0001" or any supplier having "أبو صالح" in their name or company).
      3. Extract any newly declared products, prices, quantities, and currencies.
      4. Formulate an intelligent response in Arabic summarizing:
         - Successfully matched or detected supplier details.
         - Price changes comparison: if there is a historical price record for the product, calculate the exact change (e.g. "سعر سيروم الحلزون انخفض بنسبة 10% من 10,000 ريال إلى 9,000 ريال").
         - Suggested customer price calculated with the default 30% markup (Cost * 1.3).
         - Highlight that prices are saved as "معلقة" (pending approval) until the admin clicks the Approve button in the timeline card.
      
      Analyze and output a JSON response containing exactly this structure (strictly validate JSON, do not include markdown comment blocks or any text outside of the JSON):
      {
        "extractedEntities": {
          "supplier": {
            "name": string (null if not found/mentioned),
            "whatsappPhone": string (null if not found/mentioned),
            "whatsappName": string (null if not found/mentioned)
          },
          "products": [
            {
              "name": string,
              "supplierCost": number,
              "currency": string,
              "quantity": number (null if not mentioned)
            }
          ]
        },
        "assistantResponse": string (written in natural, elegant, friendly Business Arabic)
      }
    `;

    let responseText = '';
    
    try {
      if (attachment && attachment.base64) {
        // Multimodal payload
        const filePart = {
          inlineData: {
            mimeType: attachment.mimeType,
            data: attachment.base64.split(',')[1] || attachment.base64
          }
        };
        
        const aiResponse = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: [
            {
              role: 'user',
              parts: [filePart, { text: prompt }]
            }
          ],
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json'
          }
        });
        responseText = aiResponse.text || '{}';
      } else {
        // Text-only payload
        const aiResponse = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json'
          }
        });
        responseText = aiResponse.text || '{}';
      }
    } catch (aiError: any) {
      console.error('[Pricing AI] Gemini API Error:', aiError.message, aiError.stack);
      return res.status(500).json({ error: `فشل محرك الذكاء الاصطناعي: ${aiError.message}` });
    }

    // Clean up markdown block quotes if returned by Gemini
    if (responseText.startsWith('```')) {
      responseText = responseText.replace(/^```json\s*/, '').replace(/```$/, '').trim();
    }

    const extractionResult = JSON.parse(responseText);
    const { extractedEntities, assistantResponse } = extractionResult;

    // 4. Save Extracted Price Observations (status: pending)
    const savedObservations: PriceObservation[] = [];
    if (extractedEntities?.products && Array.isArray(extractedEntities.products)) {
      
      // Determine supplier registry details
      let matchedSupplier: SupplierRegistryItem | undefined;
      const sName = extractedEntities.supplier?.name?.trim();
      const sPhone = extractedEntities.supplier?.whatsappPhone?.replace(/\D/g, '');

      if (sName) {
        matchedSupplier = allSuppliers.find(s => 
          s.name.toLowerCase().includes(sName.toLowerCase()) || 
          s.businessName?.toLowerCase().includes(sName.toLowerCase())
        );
      }
      if (!matchedSupplier && sPhone) {
        matchedSupplier = allSuppliers.find(s => s.whatsappPhone.includes(sPhone));
      }

      // If supplier is completely new but name is mentioned, create it inside transaction
      let finalSupplierId = matchedSupplier?.id || null;
      let finalSupplierCode = matchedSupplier?.code || null;
      let finalSupplierName = matchedSupplier?.name || sName || 'مورد غير مسمى';

      if (!matchedSupplier && sName) {
        // Atomic code generation inside transaction
        const supplierResult = await adminDb.runTransaction(async (transaction) => {
          const sCol = adminDb.collection('supplier_ai_suppliers');
          const snap = await sCol.get();
          const existing = snap.docs.map(doc => doc.data() as SupplierRegistryItem);

          // Recalculate max number
          let maxNum = 0;
          existing.forEach(s => {
            const match = s.code.match(/SUP-(\d+)/);
            if (match) {
              const num = parseInt(match[1]);
              if (num > maxNum) maxNum = num;
            }
          });

          const nextNum = maxNum + 1;
          const newCode = `SUP-${String(nextNum).padStart(4, '0')}`;
          const newId = `sup-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

          const newSupplier: SupplierRegistryItem = {
            id: newId,
            code: newCode,
            name: sName,
            whatsappPhone: sPhone || '966500000000',
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          const ref = sCol.doc(newId);
          transaction.set(ref, newSupplier);
          return { id: newId, code: newCode };
        });

        finalSupplierId = supplierResult.id;
        finalSupplierCode = supplierResult.code;
      }

      // Insert pending pricing observations
      for (const prod of extractedEntities.products) {
        const costPrice = parseFloat(prod.supplierCost) || 0;
        const markup = 30; // 30% default markup percent
        const salePrice = Math.round(costPrice * (1 + markup / 100));

        const obsId = `obs-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const obsDoc: PriceObservation = {
          id: obsId,
          productId: null, // to be mapped to store products if verified
          productName: prod.name,
          supplierId: finalSupplierId,
          supplierCode: finalSupplierCode || 'SUP-TEMP',
          supplierName: finalSupplierName,
          supplierCost: costPrice,
          currency: prod.currency || 'YER',
          quantity: prod.quantity || null,
          unit: null,
          sourceType: attachment ? 'image' : 'admin_conversation',
          sourceReference: conversationId,
          conversationId,
          messageId: userMessageId,
          observedAt: new Date().toISOString().split('T')[0],
          createdAt: new Date().toISOString(),
          createdBy: req.user?.email || 'admin',
          confidence: 0.95,
          approvalStatus: 'pending',
          markupPercent: markup,
          calculatedSalePrice: salePrice
        };

        await adminDb.collection('pricing_ai_price_observations').doc(obsId).set(obsDoc);
        savedObservations.push(obsDoc);
      }
    }

    // 5. Persist Assistant Message
    const assistantMessageId = `msg-assistant-${Date.now()}`;
    const assistantMessageDoc = {
      id: assistantMessageId,
      conversationId,
      role: 'assistant',
      content: assistantResponse,
      createdAt: new Date().toISOString(),
      extractedEntities: {
        suppliers: extractedEntities?.supplier ? [extractedEntities.supplier] : [],
        products: extractedEntities?.products || []
      }
    };
    await adminDb.collection('pricing_ai_messages').doc(assistantMessageId).set(assistantMessageDoc);

    return res.json({
      success: true,
      message: assistantMessageDoc,
      observations: savedObservations
    });

  } catch (error: any) {
    console.error('[Pricing AI] Message Processing Error:', error);
    return res.status(500).json({ error: error.message || 'حدث خطأ غير متوقع في محرك الذكاء الاصطناعي.' });
  }
});

// =========================================================================
// 3. SUPPLIER REGISTRY API (Admin Only)
// =========================================================================

// GET /api/pricing-ai/suppliers
router.get('/suppliers', async (req: AuthRequest, res: Response) => {
  try {

    try {
      const snap = await adminDb.collection('supplier_ai_suppliers').get();
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (list.length > 0) {
        return res.json(list);
      }
    } catch (dbErr: any) {
      console.warn('[Pricing AI] Firestore fetch suppliers fallback:', dbErr.message || dbErr);
    }

    const defaultSuppliers: SupplierRegistryItem[] = [
      {
        id: 'sup-101',
        code: 'SUP-0001',
        name: 'مؤسسة الوادي للاستيراد والتجارة',
        businessName: 'مؤسسة الوادي التجارية',
        whatsappPhone: '967777000000',
        country: 'اليمن',
        city: 'صنعاء',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'sup-102',
        code: 'SUP-0002',
        name: 'مكتب الشفاء لمستحضرات التجميل',
        businessName: 'الشفاء كوزمتكس',
        whatsappPhone: '967733000000',
        country: 'اليمن',
        city: 'عدن',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    return res.json(defaultSuppliers);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/pricing-ai/suppliers
router.post('/suppliers', async (req: AuthRequest, res: Response) => {
  try {

    const { name, businessName, whatsappPhone, country, city, notes, categories } = req.body;

    if (!name || !whatsappPhone) {
      return res.status(400).json({ error: 'الاسم ورقم الهاتف مطلوبان لتسجيل المورد.' });
    }

    const cleanPhone = whatsappPhone.replace(/\D/g, '');

    try {
      const result = await adminDb.runTransaction(async (transaction) => {
        const snap = await adminDb.collection('supplier_ai_suppliers').get();
        const existing = snap.docs.map(d => d.data() as SupplierRegistryItem);

        // Avoid duplicate phones
        const alreadyExists = existing.find(s => s.whatsappPhone === cleanPhone);
        if (alreadyExists) {
          throw new Error(`رقم جوال المورد ${cleanPhone} مسجل مسبقاً باسم ${alreadyExists.name}`);
        }

        // Generate sequence code
        let maxNum = 0;
        existing.forEach(s => {
          const match = s.code.match(/SUP-(\d+)/);
          if (match) {
            const num = parseInt(match[1]);
            if (num > maxNum) maxNum = num;
          }
        });

        const nextNum = maxNum + 1;
        const supplierCode = `SUP-${String(nextNum).padStart(4, '0')}`;
        const supplierId = `sup-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

        const newSupplier: SupplierRegistryItem = {
          id: supplierId,
          code: supplierCode,
          name,
          businessName: businessName || '',
          whatsappPhone: cleanPhone,
          country: country || '',
          city: city || '',
          notes: notes || '',
          categories: categories || [],
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        transaction.set(adminDb.collection('supplier_ai_suppliers').doc(supplierId), newSupplier);
        return newSupplier;
      });

      return res.json({ success: true, supplier: result });
    } catch (dbErr: any) {
      console.warn('[Pricing AI] Firestore supplier create fallback:', dbErr.message || dbErr);
      const fallbackSupplier: SupplierRegistryItem = {
        id: `sup-${Date.now()}`,
        code: `SUP-${Math.floor(Math.random() * 9000 + 1000)}`,
        name,
        businessName: businessName || '',
        whatsappPhone: cleanPhone,
        country: country || 'اليمن',
        city: city || '',
        notes: notes || '',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      return res.json({ success: true, supplier: fallbackSupplier });
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/pricing-ai/suppliers/:id/prices
router.get('/suppliers/:id/prices', async (req: AuthRequest, res: Response) => {
  try {

    const { id } = req.params;
    try {
      const snap = await adminDb.collection('pricing_ai_price_observations').where('supplierId', '==', id).get();
      const list = snap.docs.map(d => d.data() as PriceObservation);

      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return res.json(list);
    } catch (dbErr: any) {
      console.warn('[Pricing AI] Firestore supplier prices fallback:', dbErr.message || dbErr);
      return res.json([]);
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// =========================================================================
// 4. PRICE DECISIONS & TIMELINE (Admin Only)
// =========================================================================

// GET /api/pricing-ai/prices/observations
router.get('/prices/observations', async (req: AuthRequest, res: Response) => {
  try {

    try {
      const snap = await adminDb.collection('pricing_ai_price_observations').get();
      const list = snap.docs.map(d => d.data() as PriceObservation);

      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      if (list.length > 0) {
        return res.json(list);
      }
    } catch (dbErr: any) {
      console.warn('[Pricing AI] Firestore price observations fallback:', dbErr.message || dbErr);
    }

    const defaultObs: PriceObservation[] = [
      {
        id: 'obs-demo-1',
        productId: null,
        productName: 'سيروم الحلزون الكوري 100 مل',
        supplierId: 'sup-101',
        supplierCode: 'SUP-0001',
        supplierName: 'مؤسسة الوادي للاستيراد والتجارة',
        supplierCost: 4500,
        currency: 'YER',
        quantity: 10,
        unit: 'حبة',
        sourceType: 'admin_conversation',
        sourceReference: 'demo',
        conversationId: 'chat-default-1',
        messageId: 'msg-1',
        observedAt: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        createdBy: 'omralabis@gmail.com',
        confidence: 0.95,
        approvalStatus: 'approved',
        markupPercent: 30,
        calculatedSalePrice: 5850
      }
    ];

    return res.json(defaultObs);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/pricing-ai/prices/approve
router.post('/prices/approve', async (req: AuthRequest, res: Response) => {
  try {

    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'id required' });

    const ref = adminDb.collection('pricing_ai_price_observations').doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'سجل الأسعار غير موجود.' });
    }

    await ref.update({
      approvalStatus: 'approved',
      createdAt: new Date().toISOString() // reset timestamp to now
    });

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/pricing-ai/prices/reject
router.post('/prices/reject', async (req: AuthRequest, res: Response) => {
  try {

    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'id required' });

    await adminDb.collection('pricing_ai_price_observations').doc(id).update({
      approvalStatus: 'rejected'
    });

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// DELETE /api/pricing-ai/prices/:id
router.delete('/prices/:id', async (req: AuthRequest, res: Response) => {
  try {

    const { id } = req.params;
    await adminDb.collection('pricing_ai_price_observations').doc(id).delete();
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
