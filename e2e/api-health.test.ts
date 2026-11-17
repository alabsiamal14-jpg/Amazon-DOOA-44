import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';

const { testAdminUser, testAdminPass } = vi.hoisted(() => {
  const user = `sec_admin_${globalThis.crypto.randomUUID().slice(0, 8)}`;
  const pass = `SecPass_${globalThis.crypto.randomUUID()}`;
  process.env.ADMIN_USERNAME = user;
  process.env.ADMIN_PASSWORD = pass;
  process.env.ADMIN_JWT_SECRET = globalThis.crypto.randomUUID() + globalThis.crypto.randomUUID();
  return { testAdminUser: user, testAdminPass: pass };
});

import app from '../server.ts';
import {
  createAdminToken,
  verifyAdminToken,
  resolveAuthenticatedUser,
} from '../src/middleware/auth.ts';
import { adminAuth } from '../src/lib/firebase-admin.ts';
import * as usersDb from '../src/db/users.ts';

describe('Amazon Duaa API Health & Security Audit', () => {
  const validAdminToken = createAdminToken(testAdminUser);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/db/products remains publicly accessible for storefront', async () => {
    const res = await request(app).get('/api/db/products');
    expect([200, 500]).toContain(res.status);
  });

  it('GET /api/nonexistent returns 404 JSON', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('Unauthenticated requests to protected admin/order/review endpoints return 401', async () => {
    const checks = await Promise.all([
      request(app).get('/api/admin/firebase-health'),
      request(app).get('/api/admin/verify'),
      request(app).get('/api/admin/orders/sync-status'),
      request(app).get('/api/admin/orders/outbox-status'),
      request(app).get('/api/db/orders'),
      request(app).get('/api/db/orders/NONEXISTENT-123'),
      request(app).post('/api/db/products').send({ id: 'hack', title_ar: 'hack' }),
      request(app).delete('/api/db/products/nonexistent-id'),
      request(app).patch('/api/db/orders/NONEXISTENT-123/status').send({ status: 'cancelled' }),
      request(app).patch('/api/db/orders/NONEXISTENT-123/driver').send({ driverName: 'x', driverPhone: '123' }),
      request(app).patch('/api/db/orders/NONEXISTENT-123/delivery').send({ status: 'delivered' }),
      request(app).post('/api/ai/copilot').send({ message: 'test' }),
      request(app).post('/api/generate-product-content').send({ imageBase64: 'abc' }),
      request(app).post('/api/db/reviews/prod-1').send({ author: 'Test', rating: 5, comment: 'Great product' }),
    ]);

    for (const res of checks) {
      expect(res.status).toBe(401);
    }
  });

  it('Forged Bearer token is rejected with 401', async () => {
    const res = await request(app)
      .get('/api/db/orders')
      .set('Authorization', 'Bearer fake.forged.token');
    expect(res.status).toBe(401);
  });

  it('POST /api/admin/login rejects default admin/admin and invalid credentials with 401', async () => {
    const defaultRes = await request(app)
      .post('/api/admin/login')
      .send({ username: 'admin', password: 'admin' });
    expect(defaultRes.status).toBe(401);

    const invalidRes = await request(app)
      .post('/api/admin/login')
      .send({ username: testAdminUser, password: 'wrong-password-123' });
    expect(invalidRes.status).toBe(401);
  });

  it('POST /api/admin/login returns 503 and verifyAdminToken returns null when env secrets are unset', async () => {
    const prevUser = process.env.ADMIN_USERNAME;
    const prevPass = process.env.ADMIN_PASSWORD;
    const prevSecret = process.env.ADMIN_JWT_SECRET;
    try {
      delete process.env.ADMIN_USERNAME;
      delete process.env.ADMIN_PASSWORD;
      delete process.env.ADMIN_JWT_SECRET;

      expect(verifyAdminToken(validAdminToken)).toBeNull();

      const res = await request(app)
        .post('/api/admin/login')
        .send({ username: 'admin', password: 'admin' });
      expect(res.status).toBe(503);
    } finally {
      process.env.ADMIN_USERNAME = prevUser;
      process.env.ADMIN_PASSWORD = prevPass;
      process.env.ADMIN_JWT_SECRET = prevSecret;
    }
  });

  it('POST /api/admin/login succeeds with configured env credentials and returns signed token', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ username: testAdminUser, password: testAdminPass });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('role', 'superadmin');
  });

  it('GET /api/admin/verify succeeds with valid signed token', async () => {
    const res = await request(app)
      .get('/api/admin/verify')
      .set('Authorization', `Bearer ${validAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
  });

  it('GET /api/admin/firebase-health returns 200 with admin token', async () => {
    const res = await request(app)
      .get('/api/admin/firebase-health')
      .set('Authorization', `Bearer ${validAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
  });

  it('GET /api/admin/orders/sync-status returns 200 with admin token', async () => {
    const res = await request(app)
      .get('/api/admin/orders/sync-status')
      .set('Authorization', `Bearer ${validAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
    expect(res.body).toHaveProperty('postgresOrdersCount');
  });

  it('GET /api/admin/orders/outbox-status returns 200 with admin token', async () => {
    const res = await request(app)
      .get('/api/admin/orders/outbox-status')
      .set('Authorization', `Bearer ${validAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
    expect(res.body).toHaveProperty('totalOutboxEvents');
  });

  it('POST /api/db/reviews/:productId enforces authentication, validates rating/content, and sanitizes HTML', async () => {
    vi.spyOn(adminAuth, 'verifyIdToken').mockResolvedValue({
      uid: 'cust-rev-1',
      email: 'customer@example.com',
      email_verified: true,
      name: 'عميلة موثقة',
    } as any);

    const invalidRating = await request(app)
      .post('/api/db/reviews/prod-1')
      .set('Authorization', 'Bearer mock-firebase-token')
      .send({ author: 'سارة', rating: 9, comment: 'ممتاز جداً ومناسب للبشرة' });
    expect(invalidRating.status).toBe(400);

    const unknownProduct = await request(app)
      .post('/api/db/reviews/nonexistent-prod-xyz')
      .set('Authorization', 'Bearer mock-firebase-token')
      .send({ author: 'سارة', rating: 5, comment: 'ممتاز جداً ومناسب للبشرة' });
    expect(unknownProduct.status).toBe(404);

    const validRes = await request(app)
      .post('/api/db/reviews/prod-1')
      .set('Authorization', 'Bearer mock-firebase-token')
      .send({
        author: '<b>سارة</b>',
        rating: 5,
        comment: '<script>alert(1)</script>منتج رائع جداً وأنصح به',
        verifiedPurchase: true,
      });
    expect(validRes.status).toBe(201);
    expect(validRes.body.author).toBe('سارة');
    expect(validRes.body.comment).not.toContain('<script>');
    expect(validRes.body.verifiedPurchase).toBe(false);
  });

  it('RBAC middleware enforces email_verified for sovereign email and grants admin privileges by DB role', async () => {
    // 1. Unverified sovereign email is downgraded to customer and rejected from admin routes
    vi.spyOn(adminAuth, 'verifyIdToken').mockResolvedValueOnce({
      uid: 'spoof-uid',
      email: 'omralabis@gmail.com',
      email_verified: false,
    } as any);
    const unverifiedRes = await request(app)
      .post('/api/pricing-ai/prices/approve')
      .set('Authorization', 'Bearer mock-unverified-token')
      .send({});
    expect(unverifiedRes.status).toBe(403);

    // 2. Any DB-assigned RBAC admin user (non-omralabis email) can access admin RBAC endpoints
    vi.spyOn(adminAuth, 'verifyIdToken').mockResolvedValueOnce({
      uid: 'rbac-admin-uid',
      email: 'ops-manager@example.com',
      email_verified: true,
    } as any);
    vi.spyOn(usersDb, 'getUserByUid').mockResolvedValueOnce({
      id: 99,
      uid: 'rbac-admin-uid',
      email: 'ops-manager@example.com',
      displayName: 'مدير العمليات',
      role: 'admin',
      createdAt: new Date(),
    });
    const rbacAdminRes = await request(app)
      .post('/api/pricing-ai/prices/approve')
      .set('Authorization', 'Bearer mock-rbac-admin-token')
      .send({});
    // Passes RBAC (400 missing id, NOT 403)
    expect(rbacAdminRes.status).toBe(400);

    // 3. Verified sovereign email resolves to admin
    vi.spyOn(adminAuth, 'verifyIdToken').mockResolvedValueOnce({
      uid: 'sovereign-uid',
      email: 'omralabis@gmail.com',
      email_verified: true,
    } as any);
    const resolved = await resolveAuthenticatedUser('mock-sovereign-token');
    expect(resolved?.role).toBe('admin');
    expect(resolved?.isSuperAdmin).toBe(true);
  });

  it('GET /api/db/products includes unified Firestore + initial catalog (>55 products when Firestore reachable)', async () => {
    const res = await request(app).get('/api/db/products');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(55);
  });

  it('POST /api/orders/checkout applies unified store settings (deliveryFee=25, threshold=200) and coupon codes', async () => {
    const prodRes = await request(app).get('/api/db/products');
    expect(prodRes.status).toBe(200);
    const inStockProd = (prodRes.body as any[]).find(
      (p) => Number(p.stockQuantity ?? 0) >= 1 && Number(p.discountPrice ?? p.originalPrice ?? 0) > 0
    );
    expect(inStockProd).toBeDefined();

    const unitPrice = Number(inStockProd.discountPrice ?? inStockProd.originalPrice);
    const res = await request(app)
      .post('/api/orders/checkout')
      .send({
        idempotencyKey: `test-check-${Date.now()}`,
        orderNumber: `TEST-${Date.now()}`,
        userId: 'guest',
        customerName: 'اختبار المزامنة',
        customerPhone: '0500000000',
        city: 'صنعاء',
        address: 'شارع الزبيري',
        couponCode: 'DUAA10',
        items: [{ product_id: inStockProd.productId, quantity: 1 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.order.subtotal).toBe(unitPrice);
    expect(res.body.order.discount_amount).toBe(Math.round(unitPrice * 0.1));
    expect(res.body.order.delivery_fee).toBe(unitPrice >= 200 ? 0 : 25);
  });

  it('POST /api/db/products/public validates input, persists product, and GET /api/db/products?fresh=1 serves no-store catalog', async () => {
    const invalidRes = await request(app).post('/api/db/products/public').send({
      title_ar: '',
      original_price: 0,
      image_url: 'blob:http://localhost/temp',
    });
    expect(invalidRes.status).toBe(400);

    const testId = `visitor-prod-test-${Date.now()}`;
    const validRes = await request(app).post('/api/db/products/public').send({
      id: testId,
      title_ar: 'عطر اختبار الهاتف المحمول',
      original_price: 120,
      stock_quantity: 5,
      category_id: 'perfumes',
      category_name: 'عطور فاخرة',
      image_url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80',
    });
    expect(validRes.status).toBe(200);
    expect(validRes.body.success).toBe(true);
    expect(validRes.body.product.productId).toBe(testId);

    const freshRes = await request(app).get('/api/db/products?fresh=1');
    expect(freshRes.status).toBe(200);
    expect(freshRes.headers['cache-control']).toContain('no-store');
    expect((freshRes.body as any[]).some((p) => p.productId === testId)).toBe(true);
  });

  it('Expired or kid-less HS256 JWT returns 401 cleanly without calling adminAuth.verifyIdToken', async () => {
    const verifySpy = vi.spyOn(adminAuth, 'verifyIdToken');
    const hs256Header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const expiredPayload = Buffer.from(
      JSON.stringify({ sub: 'admin', role: 'admin', exp: Date.now() - 60_000 })
    ).toString('base64url');
    const expiredHs256Token = `${hs256Header}.${expiredPayload}.invalid_sig`;

    const res = await request(app)
      .get('/api/admin/verify')
      .set('Authorization', `Bearer ${expiredHs256Token}`);

    expect(res.status).toBe(401);
    expect(verifySpy).not.toHaveBeenCalled();
  });
});
