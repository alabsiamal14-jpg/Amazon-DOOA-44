import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';

/**
 * Real HTTP Integration Test for Supplier AI Upload & Analysis.
 * Exercises multipart parsing, Admin Auth (token required), and Gemini SDK connectivity.
 */
async function runIntegrationTest() {
  const PORT = process.env.PORT || 3000;
  const ENDPOINT = `http://localhost:${PORT}/api/whatsapp-supplier-ai/analyze`;
  
  // NOTE: You must provide a valid Admin ID Token for a successful real test.
  // In a CI/CD or local test environment, this would be generated via Firebase Auth.
  const ADMIN_TOKEN = process.env.TEST_ADMIN_TOKEN || 'MOCK_TOKEN_FOR_PARSING_ONLY';

  const uploadDir = '/tmp/supplier-test';
  const testVideoPath = path.join(uploadDir, 'integration_test_video.mp4');

  console.log('\x1b[35m=== [Supplier AI HTTP Integration Test] ===\x1b[0m\n');

  try {
    // 1. Prepare Test File
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const dummyBuffer = Buffer.alloc(1024 * 10); // 10KB
    dummyBuffer.write('ftypmp42', 4);
    fs.writeFileSync(testVideoPath, dummyBuffer);
    console.log(`✓ Test video prepared: ${testVideoPath}`);

    // 2. Build Multipart Payload
    const form = new FormData();
    form.append('video', fs.createReadStream(testVideoPath), {
      filename: 'test_video.mp4',
      contentType: 'video/mp4',
    });

    console.log(`✓ Sending POST request to ${ENDPOINT}...`);

    // 3. Execute Fetch
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        ...form.getHeaders(),
      },
      body: form,
    });

    const result: any = await response.json();

    if (response.ok) {
      console.log('\x1b[32m✓ SUCCESS: Endpoint responded with 200 OK\x1b[0m');
      console.log('Result Data:', JSON.stringify(result.data, null, 2));
    } else {
      console.error(`\x1b[31m✖ FAILED: Status ${response.status}\x1b[0m`);
      console.error('Error Details:', result.error || result);
      
      if (response.status === 401 || response.status === 403) {
        console.warn('\n[i] Note: This test requires a valid Firebase Admin ID Token via TEST_ADMIN_TOKEN env var.');
      }
    }

  } catch (err: any) {
    console.error('\x1b[31m✖ CRITICAL ERROR:\x1b[0m', err.message);
  } finally {
    if (fs.existsSync(testVideoPath)) fs.unlinkSync(testVideoPath);
  }
}

runIntegrationTest();
