import { Router, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { requireAuth, AuthRequest } from '../../../middleware/auth.ts';
import { ExtractedVideoOrderData } from '../../../types/videoOrder.ts';

const router = Router();

// Configure Multer for secure /tmp uploads with 50MB file size limit
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = '/tmp/video-uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB Max limit
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/mov'];
    const allowedExtensions = ['.mp4', '.webm', '.mov', '.qt'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('الملف غير مدعوم. يرجى رفع فيديو بصيغة MP4, WebM أو MOV فقط.'));
    }
  },
});

// Single-file upload configuration
const uploadMiddleware = upload.single('video');

// Endpoint: POST /api/video-orders/analyze
router.post('/analyze', requireAuth, (req: AuthRequest, res: Response, next) => {
  uploadMiddleware(req as any, res, (err) => {
    if (err) {
      console.error('[Video Analyze] Multer upload error:', err.message);
      return res.status(400).json({ error: err.message || 'فشل رفع الملف.' });
    }
    next();
  });
}, async (req: AuthRequest, res: Response) => {
  const filePath = req.file?.path;
  
  if (!filePath) {
    return res.status(400).json({ error: 'لم يتم استلام أي فيديو للتحليل.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Cleanup local file immediately
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return res.status(500).json({ error: 'لم يتم تكوين مفتاح Gemini API في السيرفر.' });
  }

  let uploadedFileRef: any = null;
  const ai = new GoogleGenAI({ apiKey });

  try {
    console.info('[Video Analyze] Video upload received. Path:', filePath, 'Mime:', req.file?.mimetype);

    // Step 1: Upload to Gemini Files API
    uploadedFileRef = await ai.files.upload({
      file: filePath,
      config: {
        mimeType: req.file?.mimetype || 'video/mp4',
      }
    });

    console.info('[Video Analyze] Uploaded to Gemini Files API. Name:', uploadedFileRef.name);

    // Step 2: Poll status of the video file processing
    let fileState = await ai.files.get({ name: uploadedFileRef.name });
    let attempts = 0;
    const maxAttempts = 30; // 60 seconds total

    while (fileState.state === 'PROCESSING' && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      fileState = await ai.files.get({ name: uploadedFileRef.name });
      attempts++;
    }

    if (fileState.state === 'FAILED') {
      throw new Error('فشلت معالجة الفيديو بواسطة الذكاء الاصطناعي.');
    }
    if (fileState.state === 'PROCESSING') {
      throw new Error('انتهت مهلة معالجة الفيديو في الخادم.');
    }

    console.info('[Video Analyze] Gemini file state is active. Proceeding with analysis...');

    // Step 3: Call generation with structured schema configuration
    const prompt = `
      Please inspect this video very carefully. It is an order video or promotional showcase from a customer for Amazon Duaa.
      Extract the customer's shopping details, specifically:
      1. Customer Name (customer_name)
      2. Customer Phone (customer_phone)
      3. Shipping City (city)
      4. Detailed Shipping Address (address)
      5. Customer notes if any (notes)
      6. The shopping list items: each item must contain the exact raw product name (product_name_raw) as spoken or shown in the video, and the quantity (quantity).
      
      Provide a confidence score from 0.0 to 1.0 indicating how clear and correct the extracted text is.
      Identify any warnings (e.g. "اسم العميل غير واضح", "الرقم ناقص رقم", "العنوان مبهم") if information is missing or ambiguous.
      
      IMPORTANT: If customer_name, customer_phone, city, or address is completely missing or totally unclear, do NOT invent or guess values. Return null for them and add a clear warning about it.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        uploadedFileRef,
        prompt
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            customer_name: { type: 'STRING', nullable: true },
            customer_phone: { type: 'STRING', nullable: true },
            city: { type: 'STRING', nullable: true },
            address: { type: 'STRING', nullable: true },
            notes: { type: 'STRING', nullable: true },
            items: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  product_name_raw: { type: 'STRING' },
                  quantity: { type: 'INTEGER' },
                },
                required: ['product_name_raw', 'quantity'],
              },
            },
            confidence: { type: 'NUMBER' },
            warnings: {
              type: 'ARRAY',
              items: { type: 'STRING' },
            },
          },
          required: ['customer_name', 'customer_phone', 'city', 'address', 'items', 'confidence', 'warnings'],
        },
      },
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error('لم يقم نموذج الذكاء الاصطناعي بإرجاع أي بيانات.');
    }

    const parsedData: ExtractedVideoOrderData = JSON.parse(resultText);

    // Validate structure schema fields
    if (!parsedData || !Array.isArray(parsedData.items)) {
      throw new Error('البيانات المستخرجة غير متوافقة مع الهيكل المطلوب.');
    }

    console.info('[Video Analyze] Successfully extracted order data from video.');

    // Step 4: Return extracted results without persisting anything to the database yet
    return res.json({
      success: true,
      data: {
        customer_name: parsedData.customer_name || null,
        customer_phone: parsedData.customer_phone || null,
        city: parsedData.city || null,
        address: parsedData.address || null,
        notes: parsedData.notes || null,
        items: parsedData.items,
        confidence: Number(parsedData.confidence ?? 0),
        warnings: parsedData.warnings || [],
      }
    });

  } catch (error: any) {
    console.error('[Video Analyze] Error during analysis:', error.message);
    return res.status(500).json({ error: error.message || 'حدث خطأ أثناء معالجة وتحليل الفيديو.' });
  } finally {
    // CRITICAL: Clean up temporary files on local disk
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.info('[Video Analyze] Temporary upload file cleaned up:', filePath);
      }
    } catch (cleanupErr: any) {
      console.warn('[Video Analyze] Failed to delete local temp file:', cleanupErr.message);
    }

    // CRITICAL: Clean up temporary files on Gemini Cloud storage to prevent clutter and respect privacy
    if (uploadedFileRef?.name) {
      try {
        await ai.files.delete({ name: uploadedFileRef.name });
        console.info('[Video Analyze] Gemini file reference deleted:', uploadedFileRef.name);
      } catch (geminiCleanupErr: any) {
        console.warn('[Video Analyze] Failed to delete Gemini file reference:', geminiCleanupErr.message);
      }
    }
  }
});

export default router;
