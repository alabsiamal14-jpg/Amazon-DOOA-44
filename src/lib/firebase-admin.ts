import { initializeApp, getApps, getApp, cert, AppOptions } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

let _hasServiceAccount = false;

function getFirebaseAdminOptions(): AppOptions {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (
    rawServiceAccount &&
    rawServiceAccount !== '""' &&
    rawServiceAccount !== "''" &&
    rawServiceAccount !== 'null' &&
    rawServiceAccount !== 'undefined'
  ) {
    try {
      const jsonStr = rawServiceAccount.startsWith('{')
        ? rawServiceAccount
        : Buffer.from(rawServiceAccount, 'base64').toString('utf8').trim();
      if (jsonStr.startsWith('{')) {
        const parsed = JSON.parse(jsonStr);
        if (parsed && typeof parsed === 'object' && parsed.project_id) {
          _hasServiceAccount = true;
          return {
            credential: cert(parsed),
            projectId: parsed.project_id || firebaseConfig.projectId,
          };
        }
      }
    } catch {
      // Quietly fall back to default credentials / projectId
    }
  }
  return { projectId: firebaseConfig.projectId };
}

const app = getApps().length === 0 
  ? initializeApp(getFirebaseAdminOptions())
  : getApp();

export const hasAdminServiceAccount = _hasServiceAccount;

export const adminAuth = getAuth(app);

// Attempt to use the databaseId if available
const databaseId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? firebaseConfig.firestoreDatabaseId
  : undefined;

// If we have a custom databaseId, pass it. If not, use default.
export const adminDb = databaseId 
    ? getFirestore(app, databaseId)
    : getFirestore(app);
