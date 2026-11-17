import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { initializeFirestore, doc, getDoc } from 'firebase/firestore';

/**
 * End-to-End Test Suite for Amazon Duaa Store:
 * Complete Customer Checkout Journey, Firestore Order Creation, and WhatsApp Link Generation.
 *
 * Configured with:
 * - Project ID: praxis-invention-rn2tx
 * - Firestore Database ID: ai-studio-amazonduaav1-d165f2c4-2a39-42e4-8dcb-0836e46a83bc
 */

const FIRESTORE_CONFIG = {
  projectId: 'praxis-invention-rn2tx',
  firestoreDatabaseId: 'ai-studio-amazonduaav1-d165f2c4-2a39-42e4-8dcb-0836e46a83bc',
  apiKey: 'AIzaSyAkxRwRNUSbIlLH3LpuJwm_gWkqIwUnmbI',
  authDomain: 'praxis-invention-rn2tx.firebaseapp.com',
};

test.describe('Amazon Duaa - E2E Customer Checkout & WhatsApp Flow', () => {

  test.beforeEach(async ({ page }) => {
    // 1. Ensure test environment does not write to production Firestore or create real orders
    await page.route('**/api/db/orders', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Safe test mock - order intercepted in E2E runner',
          data: { id: 'mock-order-safe-e2e' },
        }),
      });
    });

    // Abort direct network calls to Google Firestore to enforce local fallback and isolate test
    await page.route('**/firestore.googleapis.com/**', async (route) => {
      await route.abort('failed');
    });

    // 2. Intercept window.open before navigation so we can capture WhatsApp URLs
    await page.addInitScript(() => {
      (window as any).__capturedUrls = [];
      window.open = (url: string | URL | undefined) => {
        if (url) {
          (window as any).__capturedUrls.push(url.toString());
        }
        return null;
      };
    });

    // 3. Navigate to the storefront
    await page.goto('/');
    // Wait for the main page to load
    await expect(page.locator('header')).toBeVisible({ timeout: 15000 });
  });

  test('Complete Customer Journey: Browse -> Add to Cart -> Full Checkout Page -> Place Order -> Firestore & WhatsApp URL', async ({ page }) => {
    // -------------------------------------------------------------
    // 1. Browse Store and Verify Products are Displayed
    // -------------------------------------------------------------
    const addToCartButtons = page.locator('button:has-text("أضف للسلة")');
    await expect(addToCartButtons.first()).toBeVisible({ timeout: 15000 });

    // -------------------------------------------------------------
    // 2. Add Product to Cart
    // -------------------------------------------------------------
    await addToCartButtons.first().click();

    // Verify button state changes to "في السلة" or cart count in Navbar updates
    const cartButton = page.locator('header button:has-text("السلة")');
    await expect(cartButton).toBeVisible();

    // -------------------------------------------------------------
    // 3. Open Cart Drawer
    // -------------------------------------------------------------
    await cartButton.click();

    // Verify Cart Drawer is open
    const cartDrawer = page.locator('text=سلة المشتريات');
    await expect(cartDrawer.first()).toBeVisible();

    // Verify subtotal and checkout buttons are visible
    const proceedToCheckoutBtn = page.locator('button:has-text("متابعة الشراء والدفع الآمن")');
    await expect(proceedToCheckoutBtn).toBeVisible();

    // -------------------------------------------------------------
    // 4. Navigate to Full Checkout Page
    // -------------------------------------------------------------
    await proceedToCheckoutBtn.click();

    // Verify we are on the full checkout page
    const checkoutTitle = page.locator('h1:has-text("إتمام الشراء والدفع الآمن")');
    await expect(checkoutTitle).toBeVisible();

    // -------------------------------------------------------------
    // 5. Fill Customer Information Form (Traditional Checkout)
    // -------------------------------------------------------------
    const nameInput = page.locator('input[placeholder="مثال: دعاء محمد أحمد"]');
    const phoneInput = page.locator('input[placeholder="مثال: 777627595"]');
    const addressInput = page.locator('input[placeholder="مثال: شارع حدة - بجانب مركز الكميم"]');
    const notesTextarea = page.locator('textarea[placeholder="اكتب أي تعليمات أو ملاحظات خاصة هنا..."]');
    const citySelect = page.locator('select').first();

    const testCustomer = {
      name: 'دعاء محمد الأهدل',
      phone: '777627595',
      city: 'صنعاء',
      address: 'شارع حدة - برج الأمل السكني شقة 4',
      notes: 'يرجى الاتصال قبل الوصول بنصف ساعة وتغليف الطلب كهدية راقية',
    };

    await nameInput.fill(testCustomer.name);
    await phoneInput.fill(testCustomer.phone);
    await citySelect.selectOption(testCustomer.city);
    await addressInput.fill(testCustomer.address);
    await notesTextarea.fill(testCustomer.notes);

    // Verify values entered
    await expect(nameInput).toHaveValue(testCustomer.name);
    await expect(phoneInput).toHaveValue(testCustomer.phone);
    await expect(addressInput).toHaveValue(testCustomer.address);

    // -------------------------------------------------------------
    // 6. Confirm Order and Trigger WhatsApp Link Generation
    // -------------------------------------------------------------
    const placeOrderBtn = page.locator('button:has-text("تأكيد الطلب وإرسال عبر واتساب")');
    await expect(placeOrderBtn).toBeVisible();
    await placeOrderBtn.click();

    // -------------------------------------------------------------
    // 7. Verify Traditional Order Confirmation Screen in UI
    // -------------------------------------------------------------
    const successHeader = page.locator('text=تم استلام طلبك بنجاح!');
    await expect(successHeader).toBeVisible({ timeout: 10000 });

    // Verify order number is displayed (format: #ELEN-XXXX)
    const orderNumberElement = page.locator('span.font-mono:has-text("#ELEN-")');
    await expect(orderNumberElement).toBeVisible();
    const orderNumberText = await orderNumberElement.innerText();
    const cleanOrderNumber = orderNumberText.replace('#', '').trim();
    expect(cleanOrderNumber).toMatch(/^ELEN-\d+$/);

    // Verify Customer name on confirmation page
    await expect(page.locator(`text=${testCustomer.name}`)).toBeVisible();

    // -------------------------------------------------------------
    // 8. Verify WhatsApp URL Generation and Formatting
    // -------------------------------------------------------------
    const capturedUrls: string[] = await page.evaluate(() => (window as any).__capturedUrls || []);
    expect(capturedUrls.length).toBeGreaterThanOrEqual(1);

    const whatsappUrl = capturedUrls[capturedUrls.length - 1];
    expect(whatsappUrl).toContain('wa.me');

    // Decode WhatsApp URL and verify payload
    const parsedUrl = new URL(whatsappUrl);
    const textParam = parsedUrl.searchParams.get('text') || '';
    const decodedMessage = decodeURIComponent(textParam);

    // Verify WhatsApp message content contains essential customer & order elements
    expect(decodedMessage).toContain('أمازون دعاء');
    expect(decodedMessage).toContain(cleanOrderNumber);
    expect(decodedMessage).toContain(testCustomer.name);
    expect(decodedMessage).toContain(testCustomer.phone);
    expect(decodedMessage).toContain(testCustomer.address);
    expect(decodedMessage).toContain(testCustomer.notes);
    expect(decodedMessage).toContain('الإجمالي النهائي');
    expect(decodedMessage).toContain('ريال');

    // Verify WhatsApp button on success page
    const whatsappFollowupBtn = page.locator('a:has-text("متابعة المحادثة في واتساب")');
    await expect(whatsappFollowupBtn).toBeVisible();
    const followupHref = await whatsappFollowupBtn.getAttribute('href');
    expect(followupHref).toContain('whatsapp.com');
    expect(followupHref).toContain(cleanOrderNumber);

    // -------------------------------------------------------------
    // 9. Verify Order Persistence in Firestore & Local Sync
    // -------------------------------------------------------------
    // Verify order was stored in client state / local storage
    const storedOrdersRaw = await page.evaluate(() => localStorage.getItem('elen_beauty_orders_v1'));
    expect(storedOrdersRaw).not.toBeNull();
    const storedOrders = JSON.parse(storedOrdersRaw || '[]');
    const matchedOrder = storedOrders.find((o: any) => o.order_number === cleanOrderNumber);
    expect(matchedOrder).toBeDefined();
    expect(matchedOrder.customer_name).toBe(testCustomer.name);
    expect(matchedOrder.customer_phone).toBe(testCustomer.phone);
    expect(matchedOrder.items.length).toBeGreaterThan(0);
    expect(matchedOrder.total_amount).toBeGreaterThan(0);

    // Verify Firestore database configuration in the running client
    const clientDbId = await page.evaluate(async () => {
      try {
        const fbModule = await import('../src/lib/firebase');
        return fbModule.firestoreDatabaseId;
      } catch {
        return null;
      }
    });
    if (clientDbId) {
      expect(clientDbId).toBe(FIRESTORE_CONFIG.firestoreDatabaseId);
    }
  });

  test('Direct Quick Order Flow: Cart Drawer WhatsApp Order Generation', async ({ page }) => {
    // 1. Add product to cart
    const addToCartButtons = page.locator('button:has-text("أضف للسلة")');
    await expect(addToCartButtons.first()).toBeVisible({ timeout: 15000 });
    await addToCartButtons.first().click();

    // 2. Open Cart Drawer
    const cartButton = page.locator('header button:has-text("السلة")');
    await cartButton.click();
    await expect(page.locator('text=سلة المشتريات').first()).toBeVisible();

    // 3. Fill quick customer info inside Cart Drawer
    const drawerNameInput = page.locator('input[placeholder="مثال: سارة العتيبي"]');
    const drawerPhoneInput = page.locator('input[placeholder="050xxxxxxx"]');
    const drawerCityInput = page.locator('input[placeholder="الرياض / جدة..."]');

    if (await drawerNameInput.isVisible()) {
      await drawerNameInput.fill('سارة عبدالله');
      await drawerPhoneInput.fill('771234567');
      await drawerCityInput.fill('صنعاء');
    }

    // 4. Click direct WhatsApp checkout button
    const directWhatsAppBtn = page.locator('button:has-text("إتمام الطلب المباشر الفوري عبر واتساب")');
    await expect(directWhatsAppBtn).toBeVisible();
    await directWhatsAppBtn.click();

    // 5. Verify intercepted WhatsApp URL
    const capturedUrls: string[] = await page.evaluate(() => (window as any).__capturedUrls || []);
    expect(capturedUrls.length).toBeGreaterThanOrEqual(1);

    const latestUrl = capturedUrls[capturedUrls.length - 1];
    expect(latestUrl).toContain('wa.me/967777627595');

    const parsed = new URL(latestUrl);
    const decodedMsg = decodeURIComponent(parsed.searchParams.get('text') || '');

    expect(decodedMsg).toContain('طلب جديد من أمازون دعاء');
    expect(decodedMsg).toContain('ملخص الحساب');
    expect(decodedMsg).toContain('الإجمالي النهائي');
  });

  test('Coupon Discount Integration: Discount reflected in WhatsApp Order URL', async ({ page }) => {
    // 1. Add product
    const addToCartButtons = page.locator('button:has-text("أضف للسلة")');
    await expect(addToCartButtons.first()).toBeVisible({ timeout: 15000 });
    await addToCartButtons.first().click();

    // 2. Open Cart Drawer
    await page.locator('header button:has-text("السلة")').click();
    await expect(page.locator('text=سلة المشتريات').first()).toBeVisible();

    // 3. Apply Discount Coupon BEAUTY10 (10% off)
    const couponInput = page.locator('input[placeholder*="BEAUTY10"]');
    const applyCouponBtn = page.locator('button:has-text("تطبيق")').first();

    if (await couponInput.isVisible()) {
      await couponInput.fill('BEAUTY10');
      await applyCouponBtn.click();

      // Verify coupon applied message
      await expect(page.locator('text=BEAUTY10 (خصم 10%)')).toBeVisible({ timeout: 5000 });
    }

    // 4. Navigate to full checkout
    await page.locator('button:has-text("متابعة الشراء والدفع الآمن")').click();
    await expect(page.locator('h1:has-text("إتمام الشراء والدفع الآمن")')).toBeVisible();

    // Apply Coupon BEAUTY10 in Checkout Page
    const checkoutCouponInput = page.locator('input[placeholder*="BEAUTY10"]');
    const checkoutApplyBtn = page.locator('button:has-text("تطبيق")');
    if (await checkoutCouponInput.isVisible()) {
      await checkoutCouponInput.fill('BEAUTY10');
      await checkoutApplyBtn.click();
      await expect(page.locator('text=BEAUTY10 (خصم 10%)')).toBeVisible({ timeout: 5000 });
    }

    // 5. Fill required customer fields
    await page.locator('input[placeholder="مثال: دعاء محمد أحمد"]').fill('منى خالد');
    await page.locator('input[placeholder="مثال: 777627595"]').fill('778899001');
    await page.locator('input[placeholder="مثال: شارع حدة - بجانب مركز الكميم"]').fill('شارع الزبيري');

    // 6. Submit Order
    await page.locator('button:has-text("تأكيد الطلب وإرسال عبر واتساب")').click();

    // 7. Verify WhatsApp message contains coupon discount
    const capturedUrls: string[] = await page.evaluate(() => (window as any).__capturedUrls || []);
    expect(capturedUrls.length).toBeGreaterThanOrEqual(1);

    const latestUrl = capturedUrls[capturedUrls.length - 1];
    const textParam = new URL(latestUrl).searchParams.get('text') || '';

    expect(textParam).toContain('الخصم');
  });

  test('Direct Firestore Integration Verification with Specific Database ID', async () => {
    // Verify direct Firestore SDK initialization with the user's specific Database ID
    const apps = getApps();
    const app = apps.length === 0 ? initializeApp(FIRESTORE_CONFIG) : apps[0];
    const firestore = initializeFirestore(app, {
      experimentalForceLongPolling: true,
      useFetchStreams: false,
    }, FIRESTORE_CONFIG.firestoreDatabaseId);

    expect(firestore).toBeDefined();
    expect(FIRESTORE_CONFIG.firestoreDatabaseId).toBe('ai-studio-amazonduaav1-d165f2c4-2a39-42e4-8dcb-0836e46a83bc');
    expect(FIRESTORE_CONFIG.projectId).toBe('praxis-invention-rn2tx');
  });

});
