import { adminDb } from '../../../lib/firebase-admin.ts';
import { GoogleGenAI } from '@google/genai';

// Simple text parser using Gemini for structured extraction
export const parseWhatsAppChat = async (chatText: string) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
أنت خبير في استخراج البيانات التجارية من محادثات واتساب بين التاجر والموردين.
قم بتحليل المحادثة التالية واستخرج البيانات بدقة بصيغة JSON.

محتوى المحادثة:
${chatText}

المطلوب استخراجه:
{
  "supplier": {
    "businessName": "اسم المورد/المجموعة",
    "whatsappPhone": "رقم الهاتف إن وجد"
  },
  "products": [
    {
      "name": "اسم المنتج",
      "cost": 0,
      "currency": "العملة",
      "quantity": 0
    }
  ],
  "notes": "أي ملاحظات أخرى (مثل تاريخ أو تفاصيل شحن)"
}

إذا كانت قيمة غير موجودة، اجعلها null.
لا تخترع بيانات.
`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
    },
  });

  return JSON.parse(response.text || '{}');
};
