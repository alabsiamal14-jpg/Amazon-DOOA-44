import { adminDb } from './src/lib/firebase-admin.ts';

async function testConnection() {
  try {
    console.log('--- Testing Firestore Connection ---');
    console.log('Project ID:', (adminDb as any).projectId);
    console.log('Database ID:', (adminDb as any).databaseId);
    
    // console.log('Attempting to list collections...');
    // const collections = await adminDb.listCollections();
    // console.log('Successfully listed collections:', collections.map(c => c.id));
    
    console.log('Attempting to write a test document...');
    const testRef = adminDb.collection('test_admin_connection').doc('status');
    await testRef.set({
      connected: true,
      at: new Date().toISOString()
    });
    console.log('Write successful!');
    
    console.log('Attempting to read back...');
    const snap = await testRef.get();
    console.log('Read successful, data:', snap.data());
    
    process.exit(0);
  } catch (err: any) {
    console.error('--- CONNECTION FAILED ---');
    console.error('Error Code:', err.code);
    console.error('Error Message:', err.message);
    process.exit(1);
  }
}

testConnection();
