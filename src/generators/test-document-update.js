#!/usr/bin/env node

/**
 * Test the Document Update System
 */

const fs = require('fs').promises;
const path = require('path');
const { DocumentUpdateManager } = require('../utils/document-update-manager');

// Sample PR data for testing
const testPRData = {
  number: 999,
  title: 'Add new authentication features',
  body: 'This PR adds OAuth2 authentication support and user profile management.',
  user: { login: 'test-user' },
  html_url: 'https://github.com/owner/repo/pull/999',
  additions: 350,
  deletions: 50,
  files: [
    {
      filename: 'src/auth/oauth.js',
      additions: 120,
      deletions: 0,
      status: 'added',
    },
    {
      filename: 'src/auth/user-profile.js',
      additions: 85,
      deletions: 0,
      status: 'added',
    },
    {
      filename: 'src/api/auth-routes.js',
      additions: 75,
      deletions: 10,
      status: 'modified',
    },
    {
      filename: 'tests/auth.test.js',
      additions: 50,
      deletions: 5,
      status: 'modified',
    },
    {
      filename: 'docs/API-Documentation.md',
      additions: 20,
      deletions: 35,
      status: 'modified',
    },
  ],
  created_at: '2025-08-01T10:00:00Z',
  updated_at: '2025-08-05T14:30:00Z',
  labels: [{ name: 'feature' }, { name: 'authentication' }],
};

// Create test document for testing updates
async function createTestDocument() {
  const testDocPath = path.join('docs', 'test-document.md');
  const content = `---
title: Test Document
version: 1.0
---

# Test Document

This is a test document that will be updated by the document update system.

## Introduction

This section should be preserved.

<!-- manual-edit -->
## Custom Section

This is a custom section that should be preserved during updates.
<!-- preserve -->

## API Changes

This section will be replaced during updates.

## Conclusion

This is the end of the document.
`;

  await fs.mkdir(path.dirname(testDocPath), { recursive: true });
  await fs.writeFile(testDocPath, content, 'utf8');

  return testDocPath;
}

// Run the test
async function runTest() {
  console.log('🧪 Testing Document Update System');
  console.log('--------------------------------');

  try {
    // Create a test document
    const testDocPath = await createTestDocument();
    console.log(`✅ Created test document: ${testDocPath}`);

    // Initialize document manager
    const config = { outputDir: 'docs' };
    const documentManager = await new DocumentUpdateManager(
      config
    ).initialize();
    console.log('✅ Initialized document manager');

    // Register the test document
    await documentManager.registerDocument(testDocPath);
    console.log('✅ Registered test document');

    // Check document status
    const status = await documentManager.checkDocumentStatus(testDocPath);
    console.log('📊 Document status:', status);

    // Identify documents to update
    const { documentsToUpdate } =
      await documentManager.identifyDocumentsToUpdate(testPRData);
    console.log(`📋 Found ${documentsToUpdate.length} documents to update`);

    // Update documents
    const results = await documentManager.updateDocumentsFromPR(testPRData);
    console.log('✅ Document update complete');
    console.log(
      `📊 Updated ${results.updated.filter((r) => r.updated).length} documents`
    );
    console.log(`📝 Update report: ${results.report}`);

    // Check updated document content
    const updatedContent = await fs.readFile(testDocPath, 'utf8');
    console.log('\n📄 Updated document content:');
    console.log('------------------------');
    console.log(updatedContent.substring(0, 500) + '...');

    console.log('\n✅ Test completed successfully');
  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
  }
}

// Run the test
runTest().catch(console.error);
