/**
 * Firebase Firestore Security Rules Automated Unit Tests
 * Project ID: praxis-invention-rn2tx
 * Database ID: ai-studio-amazonduaav1-d165f2c4-2a39-42e4-8dcb-0836e46a83bc
 * 
 * To run these tests:
 * 1. Install firebase tools: npm install -g firebase-tools
 * 2. Start emulator: firebase emulators:start --only firestore
 * 3. Run test runner (e.g., jest / mocha with @firebase/rules-unit-testing)
 */

const { assertFails, assertSucceeds, initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const fs = require('fs');
const http = require('http');

describe('Amazon Duaa Firestore Security Rules Tests', () => {
  let testEnv;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'praxis-invention-rn2tx',
      firestore: {
        rules: fs.readFileSync('./firestore.rules', 'utf8'),
        host: 'localhost',
        port: 8080
      }
    });
  });

  after(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    if (testEnv) {
      await testEnv.clearFirestore();
    }
  });

  it('1. Client A can read their own order', async () => {
    const dbA = testEnv.authenticatedContext('userA').firestore();
    // Setup test data as admin
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      await adminContext.firestore().collection('orders').doc('orderA').set({
        userId: 'userA',
        status: 'pending',
        total_amount: 100,
        customer_name: 'Customer A'
      });
    });

    await assertSucceeds(dbA.collection('orders').doc('orderA').get());
  });

  it('2. Client B is prevented from reading Client A order', async () => {
    const dbB = testEnv.authenticatedContext('userB').firestore();
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      await adminContext.firestore().collection('orders').doc('orderA').set({
        userId: 'userA',
        status: 'pending',
        total_amount: 100,
        customer_name: 'Customer A'
      });
    });

    await assertFails(dbB.collection('orders').doc('orderA').get());
  });

  it('3. Regular customer is prevented from modifying order price or status', async () => {
    const dbA = testEnv.authenticatedContext('userA').firestore();
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      await adminContext.firestore().collection('orders').doc('orderA').set({
        userId: 'userA',
        status: 'pending',
        total_amount: 100,
        customer_name: 'Customer A'
      });
    });

    await assertFails(dbA.collection('orders').doc('orderA').update({
      total_amount: 10,
      status: 'completed'
    }));
  });

  it('4. Regular user is prevented from elevating themselves to admin role (create & update)', async () => {
    const dbA = testEnv.authenticatedContext('userA').firestore();
    
    // User tries to create user doc with role: 'admin'
    await assertFails(dbA.collection('users').doc('userA').set({
      email: 'userA@example.com',
      role: 'admin'
    }));

    // User creates doc as customer successfully
    await assertSucceeds(dbA.collection('users').doc('userA').set({
      email: 'userA@example.com',
      role: 'customer'
    }));

    // User tries to update their role to admin
    await assertFails(dbA.collection('users').doc('userA').update({
      role: 'admin'
    }));

    // User tries to change role to another value
    await assertFails(dbA.collection('users').doc('userA').update({
      role: 'moderator'
    }));

    // User tries to delete role field
    const { deleteField } = require('firebase/firestore');
    await assertFails(dbA.collection('users').doc('userA').update({
      role: deleteField()
    }));

    // User updates allowed profile field (displayName) successfully
    await assertSucceeds(dbA.collection('users').doc('userA').update({
      displayName: 'Updated Name'
    }));
  });

  it('4b. Regular user cannot modify another user document', async () => {
    const dbA = testEnv.authenticatedContext('userA').firestore();
    await assertFails(dbA.collection('users').doc('userB').set({
      email: 'userB@example.com',
      role: 'customer'
    }));
  });

  it('4c. Admin user with verified email can manage users and roles', async () => {
    const adminDb = testEnv.authenticatedContext('adminUser', {
      email: 'omralabis@gmail.com',
      email_verified: true
    }).firestore();
    await assertSucceeds(adminDb.collection('users').doc('userB').set({
      email: 'userB@example.com',
      role: 'admin'
    }));
  });

  it('4d. Unverified admin email cannot bypass admin authorization', async () => {
    const unverifiedAdminDb = testEnv.authenticatedContext('spoofAdmin', {
      email: 'omralabis@gmail.com',
      email_verified: false
    }).firestore();
    await assertFails(unverifiedAdminDb.collection('users').doc('userB').set({
      email: 'userB@example.com',
      role: 'admin'
    }));
  });

  it('5. Regular user cannot write to supplier AI or product drafts collections', async () => {
    const dbA = testEnv.authenticatedContext('userA').firestore();

    await assertFails(dbA.collection('supplier_ai_suppliers').doc('test').set({
      name: 'Malicious Supplier'
    }));
    
    await assertFails(dbA.collection('supplier_product_drafts').doc('test').set({
      title: 'Malicious Draft'
    }));
  });

  it('6. Unauthenticated user is denied write operations on protected collections', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();

    await assertFails(unauthDb.collection('orders').add({
      userId: 'someone',
      status: 'pending',
      total_amount: 50,
      customer_name: 'Test'
    }));
  });

  it('7. Unauthenticated user is denied bulk list operations on orders (guest order scraping protection)', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(unauthDb.collection('orders').get());
  });

  it('8. Regular user is prevented from creating or modifying products (prices/stock)', async () => {
    const dbA = testEnv.authenticatedContext('userA').firestore();
    await assertFails(dbA.collection('products').doc('prod1').set({
      titleAr: 'Malicious Product',
      originalPrice: 10
    }));
  });

  it('9. Public can read published products', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      await adminContext.firestore().collection('products').doc('prod1').set({
        titleAr: 'Test Product',
        originalPrice: 100
      });
    });
    await assertSucceeds(unauthDb.collection('products').doc('prod1').get());
  });

  it('10. Staff member can read and list shared orders created by other users', async () => {
    const dbStaff = testEnv.authenticatedContext('userStaff').firestore();
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      await adminContext.firestore().collection('users').doc('userStaff').set({
        email: 'staff@example.com',
        role: 'staff'
      });
      await adminContext.firestore().collection('orders').doc('orderA').set({
        userId: 'userA',
        status: 'pending',
        total_amount: 100,
        customer_name: 'Customer A'
      });
    });

    await assertSucceeds(dbStaff.collection('orders').doc('orderA').get());
    await assertSucceeds(dbStaff.collection('orders').get());
  });
});
