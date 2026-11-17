import { Router, Response } from 'express';
import { requireAdmin, AuthRequest } from '../../../middleware/auth.ts';

const router = Router();

/**
 * POST /api/pricing-ai/export/sheets
 * Exports approved products to a Google Sheet.
 * Expects: { spreadsheetId: string, products: any[] }
 * Headers: { Authorization: Bearer <ID_TOKEN>, 'x-workspace-token': <ACCESS_TOKEN> }
 */
router.post('/sheets', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {

    const { spreadsheetId, products } = req.body;
    const workspaceToken = req.headers['x-workspace-token'] as string;

    if (!spreadsheetId) {
      return res.status(400).json({ error: 'ID جدول البيانات مطلوب.' });
    }

    if (!workspaceToken) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول باستخدام جوجل لتتمكن من التصدير.' });
    }

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'لا توجد بيانات للتصدير.' });
    }

    // Lazy-load googleapis only when exporting to Sheets
    const { google } = await import('googleapis');

    // Initialize Auth with the user's access token
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: workspaceToken });

    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    // Format data for Sheets
    const rows = products.map(p => [
      p.productName || p.name,
      p.supplierName,
      p.supplierCost,
      p.markupPercent + '%',
      p.calculatedSalePrice,
      p.observedAt || new Date().toISOString().split('T')[0]
    ]);

    // Add header row
    const header = ['المنتج', 'المورد', 'التكلفة', 'الهامش', 'سعر البيع', 'التاريخ'];
    
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [header, ...rows],
      },
    });

    return res.json({ success: true, message: 'تم التصدير بنجاح إلى جداول بيانات جوجل!' });

  } catch (error: any) {
    console.error('[Export AI] Sheets Error:', error);
    return res.status(500).json({ error: error.message || 'فشل التصدير إلى جداol بيانات جوجل.' });
  }
});

export default router;
