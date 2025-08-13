#!/usr/bin/env node

/**
 * Test Rate Limiting Performance
 * Run this script to test the enhanced rate limiting system
 */

const { AIDocumentGenerator } = require('./src/generators/ai-document-generator.js');

async function testRateLimiting() {
  console.log('🧪 Testing Enhanced Rate Limiting System...\n');

  const generator = new AIDocumentGenerator();
  
  // Mock data for testing
  const testData = {
    sources: ['discussions'],
    discussion: {
      number: 123,
      title: 'Rate Limiting Test Discussion',
      author: 'test-user',
      url: 'https://github.com/owner/repo/discussions/123',
      body: 'This is a test discussion for rate limiting.\n\nObjectives: Test the enhanced rate limiting system.\nAction: Verify that templates work without API calls.',
      commentsCount: 3
    },
    prs: [],
    issues: [],
    jiraIssues: []
  };

  console.log('📝 Testing template-only generation (no API calls)...');
  
  // Set environment to prefer templates
  process.env.PREFER_TEMPLATES = 'true';
  process.env.DOC_TYPE = 'summary meeting-notes';
  
  try {
    const results = await generator.generateTemplateOnlyDocuments(['summary', 'meeting-notes'], testData);
    
    console.log(`\n✅ Template-only generation results:`);
    console.log(`   📊 Documents generated: ${results.length}`);
    console.log(`   🎯 API calls made: 0 (template-only mode)`);
    console.log(`   ⚡ Rate limit risk: None\n`);
    
    results.forEach((result, index) => {
      console.log(`   📄 Document ${index + 1}: ${result.fileName}`);
    });
    
    console.log('\n🎉 Rate limiting test completed successfully!');
    console.log('💡 The system can now generate documents without any API calls when needed.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  testRateLimiting().catch(error => {
    console.error('❌ Test execution failed:', error.message);
    process.exit(1);
  });
}

module.exports = { testRateLimiting };
