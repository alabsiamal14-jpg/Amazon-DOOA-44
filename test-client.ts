import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function testClientSDK() {
  try {
    console.log('--- Testing Client SDK Connection ---');
    console.log('Database ID:', firebaseConfig.firestoreDatabaseId);
    
    console.log('Attempting to read a public document (products)...');
    const snap = await getDocFromServer(doc(db, 'products', 'test'));
    console.log('Read attempted. Exists?', snap.exists());
    
    process.exit(0);
  } catch (err: any) {
    console.error('--- CLIENT SDK FAILED ---');
    console.error('Error Code:', err.code);
    console.error('Error Message:', err.message);
    process.exit(1);
  }
}

testClientSDK();
