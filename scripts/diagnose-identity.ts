import { adminDb } from '../src/lib/firebase-admin.ts';
import firebaseConfig from '../firebase-applet-config.json';
import http from 'http';

async function diagnose() {
  console.log('--- Diagnostic Report ---');
  console.log('Project ID (from config):', firebaseConfig.projectId);
  console.log('Database ID (from config):', firebaseConfig.firestoreDatabaseId);

  // Check Metadata Server for Service Account
  const options = {
    hostname: 'metadata.google.internal',
    path: '/computeMetadata/v1/instance/service-accounts/default/email',
    headers: { 'Metadata-Flavor': 'Google' }
  };

  const getMetadata = () => new Promise((resolve, reject) => {
    http.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', (err) => reject(err));
  });

  try {
    const email = await getMetadata();
    console.log('Detected Service Account:', email);
  } catch (e) {
    console.log('Could not detect service account (not running on GCE/GKE/CloudRun?)');
  }

  // Check Firestore accessibility
  try {
    await adminDb.listCollections();
    console.log('Firestore access: OK');
  } catch (e: any) {
    console.log('Firestore access: FAILED');
    console.log('Error details:', e.message);
  }
}
diagnose();
