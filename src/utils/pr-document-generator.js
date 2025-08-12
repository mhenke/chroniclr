#!/usr/bin/env node

/**
 * PR Document Generator CLI
 * Generate PR-specific documents for testing and validation
 */

const core = require('@actions/core');
const fs = require('fs').promises;
const path = require('path');
const { AIDocumentGenerator } = require('../generators/ai-document-generator');
const { PRTemplateMapper } = require('./pr-template-mapper');
const { FileAnalyzer } = require('./file-analyzer');

class PRDocumentGenerator {
  constructor() {
    this.generator = new AIDocumentGenerator();
    this.mapper = new PRTemplateMapper();
    this.fileAnalyzer = new FileAnalyzer();
    this.outputDir = 'docs';
  }

  /**
   * Generate a PR document using template and test data
   */
  async generateTestDocument(templateType) {
    console.log(`🔄 Generating test document: ${templateType}`);

    // Create comprehensive test PR data
    const testPRData = this.createTestPRData();
    const fileAnalysis = this.fileAnalyzer.analyzeChanges(testPRData.files, testPRData);
    
    // Map variables
    const variables = this.mapper.mapAllVariables(testPRData, fileAnalysis);
    this.mapper.logMappedVariables(variables, templateType);
    
    // Load and process template
    const template = await this.generator.loadTemplate(templateType);
    const processedTemplate = this.substituteVariables(template, variables);
    
    // Save to output directory
    await this.ensureOutputDirectory();
    const filename = `test-${templateType}-${Date.now()}.md`;
    const outputPath = path.join(this.outputDir, filename);
    
    await fs.writeFile(outputPath, processedTemplate, 'utf8');
    
    console.log(`✅ Generated: ${outputPath}`);
    console.log(`📄 Document length: ${processedTemplate.length} characters`);
    
    // Validate template processing
    const remainingVars = processedTemplate.match(/{[^}]+}/g);
    if (remainingVars && remainingVars.length > 0) {
      console.log(`⚠️ Unprocessed variables: ${remainingVars.length}`);
      console.log(`   Examples: ${remainingVars.slice(0, 5).join(', ')}`);
    } else {
      console.log('✅ All template variables processed');
    }
    
    return {
      templateType,
      outputPath,
      length: processedTemplate.length,
      unprocessedVars: remainingVars?.length || 0
    };
  }

  /**
   * Generate all PR document types
   */
  async generateAllPRDocuments() {
    console.log('🚀 Generating all PR document types...\n');
    
    const templateTypes = [
      'pr-summary',
      'pr-change-impact-assessment',
      'pr-review-report', 
      'pr-validation-checklist',
      'pr-release-notes'
    ];

    const results = [];
    
    for (const templateType of templateTypes) {
      try {
        const result = await this.generateTestDocument(templateType);
        results.push(result);
        console.log(''); // Add spacing
      } catch (error) {
        console.error(`❌ Failed to generate ${templateType}: ${error.message}`);
        results.push({ templateType, error: error.message });
      }
    }
    
    // Summary report
    console.log('📊 Generation Summary:');
    console.log('='.repeat(50));
    results.forEach(result => {
      if (result.error) {
        console.log(`❌ ${result.templateType}: ${result.error}`);
      } else {
        console.log(`✅ ${result.templateType}: ${result.length} chars (${result.unprocessedVars} unprocessed vars)`);
      }
    });
    
    const successful = results.filter(r => !r.error).length;
    console.log(`\n📋 Summary: ${successful}/${results.length} templates generated successfully`);
    
    return results;
  }

  /**
   * Create comprehensive test PR data
   */
  createTestPRData() {
    return {
      pr: {
        number: 456,
        title: 'Implement user authentication with OAuth2 integration',
        body: `This PR implements comprehensive OAuth2 authentication for the application.

## Changes
- Add OAuth2 provider integration
- Implement JWT token handling
- Add user session management
- Update security middleware

## Related Issues
Closes #123, addresses #789
Related to PROJ-456 and AUTH-789

## Breaking Changes
- Authentication API endpoints have changed
- User model schema updated

## Testing
- Unit tests for auth components
- Integration tests for OAuth flow
- Security tests for JWT handling`,
        author: 'dev-user',
        state: 'open',
        merged: false,
        mergedAt: null,
        created_at: '2025-01-15T10:30:00Z',
        updated_at: '2025-01-16T14:20:00Z',
        url: 'https://github.com/example/repo/pull/456',
        baseBranch: 'main',
        headBranch: 'feature/oauth2-auth',
        reviewers: ['senior-dev', 'security-lead'],
        assignees: ['dev-user'],
        labels: ['enhancement', 'security', 'breaking-change'],
        milestone: 'v2.0.0'
      },
      files: [
        { filename: 'src/auth/oauth.js', additions: 120, deletions: 5, changes: 125, status: 'added' },
        { filename: 'src/auth/jwt.js', additions: 80, deletions: 0, changes: 80, status: 'added' },
        { filename: 'src/middleware/auth.js', additions: 45, deletions: 30, changes: 75, status: 'modified' },
        { filename: 'src/models/user.js', additions: 25, deletions: 10, changes: 35, status: 'modified' },
        { filename: 'tests/auth.test.js', additions: 150, deletions: 0, changes: 150, status: 'added' },
        { filename: 'tests/integration/oauth.test.js', additions: 90, deletions: 0, changes: 90, status: 'added' },
        { filename: 'README.md', additions: 30, deletions: 5, changes: 35, status: 'modified' },
        { filename: 'package.json', additions: 8, deletions: 2, changes: 10, status: 'modified' }
      ],
      reviews: [
        {
          author: 'senior-dev',
          state: 'APPROVED',
          body: 'Great implementation! The OAuth2 flow looks solid and the tests are comprehensive.',
          createdAt: '2025-01-16T12:00:00Z'
        },
        {
          author: 'security-lead',
          state: 'CHANGES_REQUESTED',
          body: 'Please add input validation for the JWT tokens and consider rate limiting for auth endpoints.',
          createdAt: '2025-01-16T13:30:00Z'
        }
      ],
      comments: [
        {
          author: 'dev-user',
          body: 'Added comprehensive error handling and logging for all authentication flows.',
          createdAt: '2025-01-15T15:00:00Z'
        },
        {
          author: 'senior-dev', 
          body: 'The session management looks good. Have you considered using Redis for session storage?',
          createdAt: '2025-01-16T09:30:00Z'
        }
      ],
      reviewComments: [
        {
          author: 'security-lead',
          body: 'Consider using a more secure token validation approach here.',
          path: 'src/auth/jwt.js',
          line: 45,
          createdAt: '2025-01-16T13:15:00Z'
        }
      ],
      commits: [
        {
          sha: 'a1b2c3d4e5f6',
          message: 'feat: implement OAuth2 authentication flow',
          author: 'dev-user',
          date: '2025-01-15T10:30:00Z'
        },
        {
          sha: 'b2c3d4e5f6a1',
          message: 'feat: add JWT token handling and validation',
          author: 'dev-user',
          date: '2025-01-15T14:00:00Z'
        },
        {
          sha: 'c3d4e5f6a1b2',
          message: 'test: add comprehensive authentication tests',
          author: 'dev-user',
          date: '2025-01-16T09:00:00Z'
        }
      ]
    };
  }

  /**
   * Substitute template variables
   */
  substituteVariables(template, variables) {
    let result = template;
    
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{${key}}`;
      // Handle function-type defaults
      const actualValue = typeof value === 'function' ? value(variables) : value;
      result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), actualValue);
    });
    
    return result;
  }

  /**
   * Ensure output directory exists
   */
  async ensureOutputDirectory() {
    try {
      await fs.access(this.outputDir);
    } catch (error) {
      await fs.mkdir(this.outputDir, { recursive: true });
    }
  }
}

// CLI usage
async function main() {
  const generator = new PRDocumentGenerator();
  
  const args = process.argv.slice(2);
  const command = args[0];
  const templateType = args[1];
  
  try {
    if (command === 'test' && templateType) {
      // Generate specific template
      await generator.generateTestDocument(templateType);
    } else if (command === 'test-all' || !command) {
      // Generate all templates
      await generator.generateAllPRDocuments();
    } else {
      console.log('Usage:');
      console.log('  node pr-document-generator.js test [template-type]  # Generate specific template');
      console.log('  node pr-document-generator.js test-all             # Generate all templates');
      console.log('');
      console.log('Available template types:');
      console.log('  - pr-summary');
      console.log('  - pr-change-impact-assessment');
      console.log('  - pr-review-report');
      console.log('  - pr-validation-checklist');
      console.log('  - pr-release-notes');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { PRDocumentGenerator };