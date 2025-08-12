#!/usr/bin/env node

/**
 * Comprehensive Test for Enhanced Document Update System
 * Tests all new features: enhanced metadata, smart merge, CLI enhancements
 */

const fs = require('fs').promises;
const path = require('path');
const { DocumentUpdateManager } = require('../src/utils/document-update-manager');

// Test data for simulating different scenarios
const testScenarios = {
  // Scenario 1: Document with manual edits
  manualEditsDoc: `---
title: API Documentation
version: 1.0
---

# API Documentation

## Overview
This section describes our API endpoints.

<!-- manual-edit -->
## Custom Authentication
This is a custom authentication section that should be preserved.
The implementation details are specific to our environment.
<!-- manual-edit -->

## Endpoints
Auto-generated endpoint documentation here.

## Conclusion
Standard conclusion section.`,

  // Scenario 2: New generated content
  newGeneratedContent: `---
title: API Documentation
version: 2.0
---

# API Documentation

## Overview
This section describes our enhanced API endpoints with new features.

## Authentication
Standard OAuth2 authentication is now supported.

## Endpoints
Updated endpoint documentation with new REST endpoints:
- GET /api/v2/users
- POST /api/v2/auth/login

## Rate Limiting
New section about API rate limiting.

## Conclusion
Updated conclusion with new information.`,

  // Scenario 3: Complex PR data for testing analysis
  complexPRData: {
    number: 456,
    title: 'Add advanced authentication and user management features',
    body: 'This PR introduces OAuth2, JWT tokens, and comprehensive user management system.',
    user: { login: 'developer' },
    html_url: 'https://github.com/owner/repo/pull/456',
    additions: 450,
    deletions: 120,
    files: [
      { filename: 'src/auth/oauth2.js', additions: 150, deletions: 0, status: 'added' },
      { filename: 'src/auth/jwt-handler.js', additions: 90, deletions: 0, status: 'added' },
      { filename: 'src/api/user-routes.js', additions: 120, deletions: 20, status: 'modified' },
      { filename: 'src/middleware/auth.js', additions: 60, deletions: 30, status: 'modified' },
      { filename: 'docs/API-Documentation.md', additions: 30, deletions: 70, status: 'modified' }
    ],
    created_at: '2025-08-01T10:00:00Z',
    updated_at: '2025-08-05T14:30:00Z',
    labels: [{ name: 'feature' }, { name: 'authentication' }, { name: 'breaking-change' }]
  }
};

class EnhancedSystemTester {
  constructor() {
    this.testResults = [];
    this.testDir = path.join(__dirname, '..', 'test-docs');
  }

  async runAllTests() {
    console.log('🧪 Running Enhanced Document Update System Tests');
    console.log('================================================');
    
    try {
      // Setup test environment
      await this.setupTestEnvironment();
      
      // Test 1: Enhanced metadata and versioning
      await this.testEnhancedMetadata();
      
      // Test 2: Smart merge algorithm
      await this.testSmartMergeAlgorithm();
      
      // Test 3: Conflict resolution
      await this.testConflictResolution();
      
      // Test 4: Document analysis and relationships
      await this.testDocumentAnalysis();
      
      // Test 5: Update report generation
      await this.testUpdateReportGeneration();
      
      // Generate test report
      await this.generateTestReport();
      
      // Cleanup
      await this.cleanup();
      
    } catch (error) {
      console.error(`❌ Test suite failed: ${error.message}`);
      process.exit(1);
    }
  }

  async setupTestEnvironment() {
    console.log('🔧 Setting up test environment...');
    
    // Create test directory
    await fs.mkdir(this.testDir, { recursive: true });
    
    // Create test configuration
    const testConfig = {
      outputDir: this.testDir,
      updateThreshold: 1, // 1 day for testing
      preserveMarkers: ['<!-- manual-edit -->', '<!-- preserve -->']
    };
    
    // Initialize document manager
    this.documentManager = await new DocumentUpdateManager(testConfig).initialize();
    
    this.recordResult('Setup', true, 'Test environment initialized successfully');
  }

  async testEnhancedMetadata() {
    console.log('\n📊 Testing Enhanced Metadata and Versioning...');
    
    try {
      // Create a test document
      const testDoc = path.join(this.testDir, 'metadata-test.md');
      await fs.writeFile(testDoc, testScenarios.manualEditsDoc, 'utf8');
      
      // Register document with enhanced metadata
      const metadata = await this.documentManager.registerDocument(testDoc, {
        trigger: 'test',
        sources: ['manual', 'test'],
        dependencies: ['auth.js', 'user-routes.js'],
        completeness: 85,
        linesAdded: 25,
        sectionsModified: ['Authentication', 'Endpoints']
      });
      
      // Verify enhanced metadata structure
      const expectedFields = [
        'version', 'lastUpdated', 'created', 'lastAnalyzed', 'updateHistory',
        'dependencies', 'quality', 'automation'
      ];
      
      for (const field of expectedFields) {
        if (!metadata[field]) {
          throw new Error(`Missing metadata field: ${field}`);
        }
      }
      
      // Test version increment
      const secondVersion = await this.documentManager.registerDocument(testDoc, {
        trigger: 'update',
        linesAdded: 10
      });
      
      if (secondVersion.version !== metadata.version + 1) {
        throw new Error('Version increment failed');
      }
      
      // Test update history
      if (secondVersion.updateHistory.length !== 2) {
        throw new Error('Update history not properly maintained');
      }
      
      this.recordResult('Enhanced Metadata', true, 'All metadata fields properly tracked and updated');
      
    } catch (error) {
      this.recordResult('Enhanced Metadata', false, error.message);
    }
  }

  async testSmartMergeAlgorithm() {
    console.log('\n🔀 Testing Smart Merge Algorithm...');
    
    try {
      // Create test document with existing content
      const testDoc = path.join(this.testDir, 'merge-test.md');
      await fs.writeFile(testDoc, testScenarios.manualEditsDoc, 'utf8');
      
      // Register the document
      await this.documentManager.registerDocument(testDoc);
      
      // Update with new content using smart merge
      const updateResult = await this.documentManager.updateDocument(
        testDoc,
        testScenarios.newGeneratedContent,
        {
          trigger: 'smart-merge-test',
          forceOverwrite: false
        }
      );
      
      if (!updateResult.updated) {
        throw new Error('Smart merge update failed');
      }
      
      // Read merged content
      const mergedContent = await fs.readFile(testDoc, 'utf8');
      
      // Verify manual edits are preserved
      if (!mergedContent.includes('<!-- manual-edit -->')) {
        throw new Error('Manual edit markers not preserved');
      }
      
      if (!mergedContent.includes('custom authentication section')) {
        throw new Error('Manual edit content not preserved');
      }
      
      // Verify new sections are added
      if (!mergedContent.includes('Rate Limiting')) {
        throw new Error('New sections not properly merged');
      }
      
      // Check merge analysis
      if (!updateResult.mergeAnalysis) {
        throw new Error('Merge analysis not generated');
      }
      
      this.recordResult('Smart Merge Algorithm', true, 'Manual edits preserved, new content merged successfully');
      
    } catch (error) {
      this.recordResult('Smart Merge Algorithm', false, error.message);
    }
  }

  async testConflictResolution() {
    console.log('\n⚔️ Testing Conflict Resolution...');
    
    try {
      // Create a document with potential conflicts
      const conflictDoc = path.join(this.testDir, 'conflict-test.md');
      const existingContent = `# API Guide

## Authentication
<!-- manual-edit -->
Our custom auth implementation with special tokens.
This section has been manually customized.
<!-- manual-edit -->

## Endpoints
Basic endpoint list here.

## Custom Section
This is a user-added section.`;

      const newContent = `# API Guide

## Authentication  
Standard OAuth2 authentication system.
Completely different from the manual version.

## Endpoints
Updated endpoints with new REST API structure:
- GET /api/v1/users
- POST /api/v1/login

## Rate Limiting
New section about API limits.`;

      await fs.writeFile(conflictDoc, existingContent, 'utf8');
      await this.documentManager.registerDocument(conflictDoc);
      
      // Perform update that should create conflicts
      const result = await this.documentManager.updateDocument(
        conflictDoc,
        newContent,
        { trigger: 'conflict-test' }
      );
      
      // Read the merged result
      const mergedContent = await fs.readFile(conflictDoc, 'utf8');
      
      // Should preserve manual authentication section
      if (!mergedContent.includes('custom auth implementation')) {
        throw new Error('Manual authentication section not preserved');
      }
      
      // Should add new rate limiting section
      if (!mergedContent.includes('Rate Limiting')) {
        throw new Error('New sections not added');
      }
      
      // Should preserve custom section
      if (!mergedContent.includes('Custom Section')) {
        throw new Error('Custom section not preserved');
      }
      
      // Check for conflict analysis
      if (!result.mergeAnalysis || !result.mergeAnalysis.conflicts) {
        throw new Error('Conflict analysis not generated');
      }
      
      this.recordResult('Conflict Resolution', true, 'Conflicts properly detected and resolved');
      
    } catch (error) {
      this.recordResult('Conflict Resolution', false, error.message);
    }
  }

  async testDocumentAnalysis() {
    console.log('\n📈 Testing Document Analysis and Relationships...');
    
    try {
      // Test PR-based document identification
      const { documentsToUpdate, analysis } = await this.documentManager.identifyDocumentsToUpdate(
        testScenarios.complexPRData
      );
      
      // Verify analysis structure
      if (!analysis || !analysis.summary || !analysis.impactAreas) {
        throw new Error('Document analysis structure incomplete');
      }
      
      // Check risk assessment
      if (!analysis.risks || !analysis.risks.level) {
        throw new Error('Risk assessment not performed');
      }
      
      // Verify documentation needs assessment
      if (!analysis.documentationNeeds) {
        throw new Error('Documentation needs not assessed');
      }
      
      // Check stakeholder impact analysis
      if (!analysis.stakeholderImpact) {
        throw new Error('Stakeholder impact not analyzed');
      }
      
      // Verify breaking change detection
      if (!analysis.breakingChanges.detected) {
        console.log('⚠️ Breaking changes should have been detected from labels');
      }
      
      this.recordResult('Document Analysis', true, 'Comprehensive analysis performed successfully');
      
    } catch (error) {
      this.recordResult('Document Analysis', false, error.message);
    }
  }

  async testUpdateReportGeneration() {
    console.log('\n📝 Testing Update Report Generation...');
    
    try {
      // Create some test update results
      const updateResults = [
        {
          path: 'docs/api.md',
          updated: true,
          isNew: false,
          version: 2,
          stats: { linesAdded: 25, linesDeleted: 10, linesChanged: 5, charactersAdded: 150 },
          mergeAnalysis: {
            conflicts: [{ section: 'Authentication', type: 'manual_edits', resolution: 'preserve_manual' }],
            preserved: ['Authentication'],
            updated: ['Endpoints', 'Overview'],
            added: ['Rate Limiting']
          }
        },
        {
          path: 'docs/user-guide.md',
          updated: true,
          isNew: true,
          version: 1,
          stats: { linesAdded: 50, linesDeleted: 0, linesChanged: 0, charactersAdded: 300 }
        },
        {
          path: 'docs/failed.md',
          updated: false,
          error: 'Permission denied'
        }
      ];
      
      // Generate report
      const report = this.documentManager.generateUpdateReport(updateResults, testScenarios.complexPRData);
      
      // Verify report content
      if (!report.includes('Document Update Report')) {
        throw new Error('Report title missing');
      }
      
      if (!report.includes('Executive Summary')) {
        throw new Error('Executive summary missing');
      }
      
      if (!report.includes('Merge Statistics')) {
        throw new Error('Merge statistics missing');
      }
      
      if (!report.includes('Change Analysis')) {
        throw new Error('Change analysis missing');
      }
      
      if (!report.includes('Successfully Updated')) {
        throw new Error('Success section missing');
      }
      
      if (!report.includes('Failed Updates')) {
        throw new Error('Failed updates section missing');
      }
      
      if (!report.includes('Recommendations')) {
        throw new Error('Recommendations section missing');
      }
      
      // Save the report for inspection
      const reportPath = path.join(this.testDir, 'test-report.md');
      await fs.writeFile(reportPath, report, 'utf8');
      
      this.recordResult('Update Report Generation', true, 'Comprehensive update report generated successfully');
      
    } catch (error) {
      this.recordResult('Update Report Generation', false, error.message);
    }
  }

  recordResult(testName, passed, message) {
    this.testResults.push({ testName, passed, message });
    const status = passed ? '✅' : '❌';
    console.log(`   ${status} ${testName}: ${message}`);
  }

  async generateTestReport() {
    console.log('\n📋 Generating Test Report...');
    
    const passed = this.testResults.filter(r => r.passed).length;
    const failed = this.testResults.filter(r => !r.passed).length;
    const total = this.testResults.length;
    
    const report = [
      '# Enhanced Document Update System Test Report',
      '',
      `Generated on: ${new Date().toISOString()}`,
      '',
      '## Summary',
      '',
      `- **Total tests**: ${total}`,
      `- **Passed**: ${passed}`,
      `- **Failed**: ${failed}`,
      `- **Success rate**: ${Math.round((passed / total) * 100)}%`,
      '',
      '## Test Results',
      ''
    ];
    
    this.testResults.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      report.push(`### ${status} ${result.testName}`);
      report.push(`- **Status**: ${result.passed ? 'PASSED' : 'FAILED'}`);
      report.push(`- **Message**: ${result.message}`);
      report.push('');
    });
    
    if (failed > 0) {
      report.push('## Failed Tests Details');
      report.push('');
      this.testResults.filter(r => !r.passed).forEach(result => {
        report.push(`- **${result.testName}**: ${result.message}`);
      });
      report.push('');
    }
    
    report.push('## Conclusion');
    report.push('');
    if (failed === 0) {
      report.push('🎉 All tests passed! The enhanced document update system is working correctly.');
    } else {
      report.push(`⚠️ ${failed} test(s) failed. Review the failures above and fix the issues.`);
    }
    
    const reportContent = report.join('\n');
    const reportPath = path.join(this.testDir, 'enhanced-system-test-report.md');
    await fs.writeFile(reportPath, reportContent, 'utf8');
    
    console.log('\n📊 Test Results:');
    console.log(`   ✅ Passed: ${passed}/${total}`);
    console.log(`   ❌ Failed: ${failed}/${total}`);
    console.log(`   📄 Report: ${reportPath}`);
    
    if (failed > 0) {
      console.log('\n⚠️ Some tests failed. Check the detailed report for more information.');
      return false;
    }
    
    console.log('\n🎉 All tests passed successfully!');
    return true;
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up test environment...');
    
    try {
      // Remove test directory and files
      await fs.rm(this.testDir, { recursive: true, force: true });
      console.log('   ✅ Test files cleaned up');
    } catch (error) {
      console.log(`   ⚠️ Cleanup warning: ${error.message}`);
    }
  }
}

// Run the tests if this file is executed directly
if (require.main === module) {
  const tester = new EnhancedSystemTester();
  tester.runAllTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { EnhancedSystemTester };