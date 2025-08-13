#!/usr/bin/env node

/**
 * Test script to demonstrate data fabrication audit capabilities
 */

const core = require('@actions/core');
const {
  AIDocumentGenerator,
} = require('./src/generators/ai-document-generator');

async function testFabricationAudit() {
  console.log('🔍 Testing Data Fabrication Audit System...\n');

  // Test with minimal data to trigger fabrication
  const minimalData = {
    discussion: {
      number: 999,
      title: 'Test Discussion',
      body: 'Minimal content to test fabrication detection.',
      author: 'test-user',
      url: 'https://github.com/test/test/discussions/999',
      commentsCount: 0,
    },
    prs: [],
    issues: [],
    jiraIssues: [],
    sources: ['discussion'],
  };

  // Test with fabrication allowed
  console.log('📋 Test 1: Fabrication ALLOWED (Development Mode)');
  console.log('=====================================================');

  process.env.ALLOW_FABRICATED_CONTENT = 'true';
  process.env.PRODUCTION_MODE = 'false';

  const devGenerator = new AIDocumentGenerator();

  console.log('\n🔍 Testing fabricated content methods:');
  console.log('\n• Budget Status:');
  console.log(devGenerator.generateBudgetStatus(minimalData));

  console.log('\n• Risks and Blockers:');
  console.log(devGenerator.generateRisksBlockers(minimalData));

  console.log('\n• Timeline Updates:');
  console.log(devGenerator.generateTimelineUpdates(minimalData));

  console.log('\n• Decisions Needed:');
  console.log(devGenerator.generateDecisionsNeeded(minimalData));

  console.log('\n• Upcoming Items:');
  console.log(devGenerator.generateUpcomingItems(minimalData));

  // Test with fabrication disabled
  console.log('\n\n📋 Test 2: Fabrication DISABLED (Production Mode)');
  console.log('==================================================');

  process.env.ALLOW_FABRICATED_CONTENT = 'false';
  process.env.PRODUCTION_MODE = 'true';

  const prodGenerator = new AIDocumentGenerator();

  console.log('\n🔍 Testing with fabrication disabled:');
  console.log('\n• Budget Status (should be blocked):');
  console.log(prodGenerator.generateBudgetStatus(minimalData));

  console.log('\n• Risks and Blockers (should be blocked):');
  console.log(prodGenerator.generateRisksBlockers(minimalData));

  console.log('\n• Timeline Updates (should be blocked):');
  console.log(prodGenerator.generateTimelineUpdates(minimalData));

  // Test template variable tracking
  console.log('\n\n📋 Test 3: Template Variable Audit Trail');
  console.log('========================================');

  const testContent = `
# Test Document

## Summary
{summary}

## Current Status
- Progress: {progress}
- Current Phase: {currentPhase}
- Budget Status: {budgetStatus}

## Risks and Action Items
{risksBlockers}

{actionItems}

## Timeline
{timelineUpdates}

## Stakeholders
{stakeholders}
`;

  console.log('\n🔍 Processing template variables...');
  const processedContent = devGenerator.replaceTemplateVariables(
    testContent,
    minimalData
  );

  console.log('\n📊 Audit Trail Results:');
  if (devGenerator.auditTrail?.templateVariables) {
    const { extracted, inferred, generated } =
      devGenerator.auditTrail.templateVariables;
    console.log(`🔍 Extracted: ${extracted.length} variables`);
    console.log(`🧠 Inferred: ${inferred.length} variables`);
    console.log(`📝 Generated: ${generated.length} variables`);

    const total = extracted.length + inferred.length + generated.length;
    const authenticity = Math.round((extracted.length / total) * 100);
    console.log(`\n🎯 Content Authenticity Score: ${authenticity}%`);

    if (authenticity < 50) {
      console.log('🚨 LOW AUTHENTICITY - Requires validation');
    } else if (authenticity < 70) {
      console.log('⚠️  MEDIUM AUTHENTICITY - Review recommended');
    } else {
      console.log('✅ HIGH AUTHENTICITY - Source-based content');
    }
  }

  console.log('\n\n📋 Test 4: High-Risk Content Detection');
  console.log('======================================');

  const HIGH_RISK_VARIABLES = [
    'budgetStatus',
    'risksBlockers',
    'decisionsNeeded',
    'upcomingItems',
    'timelineUpdates',
  ];

  console.log('\n🚨 High-Risk Variables Detected:');
  HIGH_RISK_VARIABLES.forEach((variable) => {
    const riskLevel = ['budgetStatus', 'timelineUpdates'].includes(variable)
      ? 'CRITICAL'
      : 'HIGH';
    console.log(`- {${variable}} - ${riskLevel} RISK`);
  });

  console.log('\n💡 Recommendations:');
  console.log(
    '- Set PRODUCTION_MODE=true to disable fabricated financial/timeline data'
  );
  console.log('- Review all generated content before official distribution');
  console.log(
    '- Obtain stakeholder approval for documents with <70% authenticity'
  );
  console.log(
    '- Implement source data validation for critical business information'
  );

  console.log('\n✅ Fabrication Audit Test Complete!');
}

// Mock core module for testing
if (!core.info) {
  global.core = {
    info: console.log,
    warning: console.warn,
    error: console.error,
    setOutput: () => {},
  };
}

// Run the test
if (require.main === module) {
  testFabricationAudit().catch(console.error);
}

module.exports = { testFabricationAudit };
