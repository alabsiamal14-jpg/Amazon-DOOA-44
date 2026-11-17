import { adminDb } from '../src/lib/firebase-admin.ts';

async function testRead() {
  console.log('--- Testing Read Access ---');
  try {
    const snap = await adminDb.collection('supplier_ai_suppliers').limit(1).get();
    console.log('Read success! Found', snap.size, 'suppliers.');
  } catch (e) {
    console.error('Read failed:', e);
  }
}
testRead();
