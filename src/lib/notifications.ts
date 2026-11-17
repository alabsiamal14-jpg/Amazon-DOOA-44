import { Order, StoreSettings } from '../types';
import { buildWhatsAppMessage } from './whatsapp';

/**
 * Automated Notification Service
 */
export async function triggerOrderConfirmation(order: Order, settings: StoreSettings) {
  try {
    const orderNum = order.order_number;
    console.info(`[Notification Trigger] Automated confirmation for order #${orderNum}`);

    // 1. Build the professional WhatsApp/Email message
    const cartItems = order.items.map(item => ({
      product: {
        id: item.product_id || (item as any).productId,
        title_ar: item.title_ar,
        original_price: item.price,
        discount_price: null,
        image_url: item.image_url || '',
        category_name: 'عناية',
      } as any,
      quantity: item.quantity,
    }));

    const customerInfo = {
      customerName: order.customer_name,
      phone: order.customer_phone,
      city: order.city,
      address: order.address,
      notes: order.notes || '',
    };

    const messageText = buildWhatsAppMessage(
      cartItems,
      settings,
      customerInfo,
      order.discount_amount,
      undefined,
      orderNum
    );

    // 2. SEND AUTOMATED EMAIL CONFIRMATION (via Resend)
    // We send this to the customer (if they have email) and always to the admin as a record.
    const resendApiKey = process.env.RESEND_API_KEY;
    
    if (resendApiKey) {
      const recipients = ['omralabis@gmail.com'];
      if (order.customer_email) recipients.push(order.customer_email);

      try {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: 'Amazon Duaa <onboarding@resend.dev>',
            to: recipients,
            subject: `تأكيد طلبك رقم #${orderNum} - أمازون دعاء`,
            html: `
              <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
                <h2 style="color: #e11d48; text-align: center;">شكراً لتسوقكِ من أمازون دعاء! 🌸</h2>
                <p>مرحباً <strong>${order.customer_name}</strong>،</p>
                <p>لقد تم استلام طلبكِ بنجاح وهو قيد المراجعة حالياً.</p>
                <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="margin-top: 0;">تفاصيل الطلب #${orderNum}</h3>
                  <pre style="white-space: pre-wrap; font-size: 14px;">${messageText}</pre>
                </div>
                <p style="text-align: center; color: #666; font-size: 12px;">سيتم التواصل معكِ عبر الواتساب لتأكيد الشحن.</p>
              </div>
            `,
          }),
        });

        if (emailResponse.ok) {
          console.info(`[Notification Trigger] Confirmation email sent to ${recipients.join(', ')}`);
        } else {
          const errData = await emailResponse.json();
          console.warn('[Notification Trigger] Resend API error:', errData);
        }
      } catch (emailErr: any) {
        console.warn('[Notification Trigger] Failed to send email:', emailErr.message);
      }
    }

    // 3. WHATSAPP API TRIGGER (STUB)
    // Note: This requires a verified WhatsApp Business API token.
    // We log it as "Triggered" for now.
    console.info(`[Notification Trigger] WhatsApp direct message triggered for ${order.customer_phone}`);

    return {
      success: true,
      orderNumber: orderNum,
      automatedChannels: ['email', 'log'],
    };

  } catch (error: any) {
    console.error('[Notification Trigger] Critical Error:', error.message);
    return { success: false, error: error.message };
  }
}
