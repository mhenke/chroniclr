#!/usr/bin/env node

/**
 * Document Update CLI Tool
 * Scan and update documentation based on recent code changes
 */

const core = require('@actions/core');
const fs = require('fs').promises;
const path = require('path');
const { DocumentUpdateManager } = require('./document-update-manager');
const { PRClient } = require('./pr-client');

// Parse command line arguments
const args = process.argv.slice(2);
let options = {
  force: false,
  since: null,
  dryRun: false,
  prNumber: null
};

// Process command line options
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  if (arg === '--force' || arg === '-f') {
    options.force = true;
  } else if (arg === '--dry-run') {
    options.dryRun = true;
  } else if (arg.startsWith('--since=')) {
    options.since = arg.split('=')[1];
  } else if (arg.startsWith('--pr=')) {
    options.prNumber = arg.split('=')[1];
  } else if (arg === '--help' || arg === '-h') {
    showHelp();
    process.exit(0);
  }
}

// Load configuration
async function loadConfig() {
  try {
    const configPath = path.join(process.cwd(), 'chroniclr.config.json');
    const configData = await fs.readFile(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    console.error(`Error loading configuration: ${error.message}`);
    return {};
  }
}

function showHelp() {
  console.log(`
Document Update Tool
-------------------
Updates documentation based on code changes

Usage:
  update-documents [options]

Options:
  --force, -f            Force update all documents regardless of age
  --dry-run              Show what would be updated without making changes
  --since=<date>         Only update documents based on changes since date (YYYY-MM-DD)
  --pr=<number>          Update documents based on a specific PR number
  --help, -h             Show this help message

Examples:
  update-documents                    # Update documents that need refreshing
  update-documents --force            # Force update all documents
  update-documents --since=2024-01-01 # Update based on changes since January 1st
  update-documents --pr=123           # Update based on PR #123
  `);
}

// Main function
async function main() {
  try {
    console.log('🔄 Chroniclr Document Update Tool');
    console.log('-------------------------------');
    
    // Load configuration
    const config = await loadConfig();
    
    // Initialize document manager
    const documentManager = await new DocumentUpdateManager(config.documents).initialize();
    
    if (options.prNumber) {
      // Update documents based on a specific PR
      await updateFromPR(documentManager, options.prNumber, options);
    } else {
      // Scan and update outdated documents
      await scanAndUpdate(documentManager, options);
    }
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Update documents from a specific PR
async function updateFromPR(documentManager, prNumber, options) {
  console.log(`📄 Updating documents based on PR #${prNumber}`);
  
  // Initialize PR client
  const prClient = new PRClient();
  
  // Fetch PR data
  const prData = await prClient.getPullRequestDetails(prNumber);
  
  if (!prData) {
    console.error(`❌ PR #${prNumber} not found`);
    process.exit(1);
  }
  
  console.log(`📊 Analyzing PR: ${prData.title}`);
  console.log(`👤 Author: ${prData.user.login}`);
  console.log(`📝 Changes: ${prData.files?.length || 0} files`);
  
  if (options.dryRun) {
    // Dry run - show what would be updated
    const { documentsToUpdate, suggestedDocuments } = await documentManager.identifyDocumentsToUpdate(prData);
    
    console.log('\n📋 Documents that would be updated:');
    if (documentsToUpdate.length === 0) {
      console.log('  None');
    } else {
      documentsToUpdate.forEach(doc => {
        console.log(`  - ${doc.path} (${doc.documentationNeeds.type})`);
      });
    }
    
    console.log('\n💡 Suggested new documents:');
    if (suggestedDocuments.length === 0) {
      console.log('  None');
    } else {
      suggestedDocuments.forEach(doc => {
        console.log(`  - ${doc}`);
      });
    }
    
  } else {
    // Perform actual update
    const results = await documentManager.updateDocumentsFromPR(prData, options);
    
    console.log('\n✅ Update complete!');
    console.log(`📊 Updated ${results.updated.filter(r => r.updated).length} documents`);
    console.log(`📝 Update report: ${path.basename(results.report)}`);
    
    // Suggest new documents if any
    if (results.suggestedDocuments.length > 0) {
      console.log('\n💡 Suggested new documents:');
      results.suggestedDocuments.forEach(doc => {
        console.log(`  - ${doc}`);
      });
    }
  }
}

// Scan and update outdated documents
async function scanAndUpdate(documentManager, options) {
  console.log('🔍 Scanning for outdated documentation...');
  
  // Find all documentation files
  const documentFiles = await documentManager.scanDocuments();
  
  console.log(`📄 Found ${documentFiles.length} documentation files`);
  
  // Check status of each document
  const documentsToUpdate = [];
  
  for (const file of documentFiles) {
    const status = await documentManager.checkDocumentStatus(file);
    
    if (options.force || status.needsUpdate) {
      documentsToUpdate.push({ path: file, status });
    }
  }
  
  console.log(`📊 Found ${documentsToUpdate.length} documents that need updating`);
  
  if (options.dryRun) {
    // Dry run - just show what would be updated
    console.log('\n📋 Documents that would be updated:');
    if (documentsToUpdate.length === 0) {
      console.log('  None');
    } else {
      documentsToUpdate.forEach(doc => {
        const relativePath = path.relative(process.cwd(), doc.path);
        const lastUpdated = doc.status.lastUpdated 
          ? new Date(doc.status.lastUpdated).toLocaleDateString() 
          : 'never';
        
        console.log(`  - ${relativePath} (Last updated: ${lastUpdated})`);
      });
    }
  } else if (documentsToUpdate.length > 0) {
    // Perform actual update
    console.log('\n🔄 Updating documents...');
    // Implementation would depend on how we want to update documents without PR context
    console.log('\n⚠️ Manual update of documents is not implemented yet.');
    console.log('Please use --pr=<number> to update documents based on a PR.');
  } else {
    console.log('✅ All documents are up to date!');
  }
}

// Run the main function
main().catch(error => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
