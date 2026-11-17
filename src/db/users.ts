import { db, isPostgresConfigured } from './index.ts';
import { users } from './schema.ts';
import { eq } from 'drizzle-orm';
import { adminDb } from '../lib/firebase-admin.ts';

type DbUserRow = typeof users.$inferSelect;
const memoryUsers = new Map<string, DbUserRow>();
let memoryUserIdCounter = 1;

export async function getOrCreateUser(uid: string, email: string, displayName?: string) {
  if (!isPostgresConfigured) {
    const existing = memoryUsers.get(uid);
    if (existing) {
      existing.email = email;
      if (displayName) existing.displayName = displayName;
      return existing;
    }
    const created: DbUserRow = {
      id: memoryUserIdCounter++,
      uid,
      email,
      displayName: displayName || null,
      role: email.toLowerCase() === 'omralabis@gmail.com' ? 'admin' : 'customer',
      createdAt: new Date(),
    };
    memoryUsers.set(uid, created);
    return created;
  }

  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName || null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          ...(displayName ? { displayName } : {}),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database user operation failed:', error);
    throw new Error('Database user operation failed.', { cause: error });
  }
}

export async function getUserByUid(uid: string) {
  if (!isPostgresConfigured) {
    const mem = memoryUsers.get(uid);
    if (mem) return mem;
    try {
      const snap = await adminDb.collection('users').doc(uid).get();
      if (snap.exists) {
        const d = snap.data() || {};
        const row: DbUserRow = {
          id: memoryUserIdCounter++,
          uid,
          email: d.email || '',
          displayName: d.name || d.displayName || null,
          role: d.role || 'customer',
          createdAt: d.createdAt ? new Date(d.createdAt) : new Date(),
        };
        memoryUsers.set(uid, row);
        return row;
      }
    } catch {
      // Ignore if adminDb lacks IAM in sandbox
    }
    return null;
  }
  try {
    const userRecords = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    return userRecords[0] || null;
  } catch (error) {
    console.error('Failed to fetch user by UID:', error);
    throw new Error('Database query failed.', { cause: error });
  }
}

export async function updateUserRole(uid: string, role: 'admin' | 'staff' | 'driver' | 'user' | 'customer') {
  try {
    await adminDb.collection('users').doc(uid).set(
      { role, updatedAt: new Date().toISOString() },
      { merge: true }
    );
  } catch {
    // Non-fatal in sandbox without FIREBASE_SERVICE_ACCOUNT
  }

  if (!isPostgresConfigured) {
    const existing = memoryUsers.get(uid);
    if (!existing) return null;
    existing.role = role;
    return existing;
  }
  try {
    const result = await db.update(users).set({ role }).where(eq(users.uid, uid)).returning();
    return result[0] || null;
  } catch (error) {
    console.error('Failed to update user role:', error);
    throw new Error('Database update failed.', { cause: error });
  }
}

export async function getUserByEmail(email: string) {
  if (!isPostgresConfigured) {
    for (const u of memoryUsers.values()) {
      if (u.email.toLowerCase() === email.toLowerCase()) return u;
    }
    try {
      const snap = await adminDb.collection('users').where('email', '==', email.trim()).limit(1).get();
      if (!snap.empty) {
        const docSnap = snap.docs[0];
        const d = docSnap.data() || {};
        const row: DbUserRow = {
          id: memoryUserIdCounter++,
          uid: docSnap.id,
          email: d.email || email,
          displayName: d.name || d.displayName || null,
          role: d.role || 'customer',
          createdAt: d.createdAt ? new Date(d.createdAt) : new Date(),
        };
        memoryUsers.set(docSnap.id, row);
        return row;
      }
    } catch {
      // Ignore if adminDb lacks IAM in sandbox
    }
    return null;
  }
  try {
    const userRecords = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return userRecords[0] || null;
  } catch (error) {
    console.error('Failed to fetch user by email:', error);
    throw new Error('Database query failed.', { cause: error });
  }
}
