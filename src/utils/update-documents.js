#!/usr/bin/env node

/**
 * Enhanced Document Update CLI Tool
 * Scan and update documentation based on recent code changes with interactive features
 */

const core = require('@actions/core');
const fs = require('fs').promises;
const path = require('path');
const { DocumentUpdateManager } = require('./document-update-manager');
const { PRClient } = require('./pr-client');


// Enhanced progress reporting
class ProgressReporter {
  constructor(verbose = false) {
    this.verbose = verbose;
    this.startTime = Date.now();
  }
  
  log(message, level = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const levelEmojis = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '❌',
      progress: '🔄'
    };
    
    console.log(`[${timestamp}] ${levelEmojis[level] || ''} ${message}`);
  }
  
  progress(current, total, operation = '') {
    if (!this.verbose && current % 5 !== 0 && current !== total) return;
    
    const percentage = Math.round((current / total) * 100);
    const progressBar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    
    process.stdout.write(`\r🔄 [${progressBar}] ${percentage}% (${current}/${total}) ${operation} - ${elapsed}s`);
    
    if (current === total) {
      console.log(); // New line when complete
    }
  }
  
  summary(stats) {
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    console.log('\n📊 Summary:');
    console.log(`   ⏱️  Total time: ${elapsed}s`);
    console.log(`   📄 Documents processed: ${stats.processed}`);
    console.log(`   ✅ Successfully updated: ${stats.updated}`);
    console.log(`   📝 New documents: ${stats.created}`);
    console.log(`   ❌ Failed updates: ${stats.failed}`);
    if (stats.conflicts > 0) {
      console.log(`   ⚠️  Merge conflicts: ${stats.conflicts}`);
    }
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
let options = {
  force: false,
  since: null,
  dryRun: false,
  prNumber: null,
  interactive: false,
  verbose: false,
  batch: false,
  report: true
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
📚 Chroniclr Document Update Tool
---------------------------------
Intelligent documentation updates based on code changes

Usage:
  update-documents [options]

Options:
  --force, -f            Force update all documents regardless of age
  --dry-run              Show what would be updated without making changes
  --interactive, -i      Interactive mode with prompts for each document
  --verbose, -v          Verbose output with detailed progress information
  --batch, -b            Batch mode - update all without prompts
  --no-report           Skip generating update report
  --since=<date>         Only update documents based on changes since date (YYYY-MM-DD)
  --pr=<number>          Update documents based on a specific PR number
  --help, -h             Show this help message

Examples:
  update-documents                           # Interactive update of outdated documents
  update-documents --force --batch           # Force update all documents in batch mode
  update-documents --interactive --pr=123    # Interactive updates based on PR #123
  update-documents --since=2024-01-01 -v    # Verbose update based on changes since January 1st
  update-documents --dry-run                 # Preview what would be updated

Interactive Features:
  • Preview changes before applying
  • Choose merge strategies for conflicts
  • Select specific sections to update
  • Customize update parameters per document
  `);
}

// Main function
async function main() {
  const reporter = new ProgressReporter(options.verbose);
  
  try {
    console.log('📚 Chroniclr Document Update Tool');
    console.log('==================================');
    
    if (options.interactive && !options.batch) {
      console.log('🎯 Interactive mode enabled - you will be prompted for decisions');
    }
    
    // Load configuration
    reporter.log('Loading configuration...', 'progress');
    const config = await loadConfig();
    
    // Initialize document manager
    reporter.log('Initializing document update manager...', 'progress');
    const documentManager = await new DocumentUpdateManager(config.documents).initialize();
    
    if (options.prNumber) {
      // Update documents based on a specific PR
      await updateFromPR(documentManager, options.prNumber, options, reporter);
    } else {
      // Scan and update outdated documents
      await scanAndUpdate(documentManager, options, reporter);
    }
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Interactive confirmation helper
async function askUserConfirmation(question, defaultValue = false) {
  if (options.batch) return true;
  if (!options.interactive) return defaultValue;
  
  return new Promise((resolve) => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const defaultText = defaultValue ? '[Y/n]' : '[y/N]';
    readline.question(`${question} ${defaultText}: `, (answer) => {
      readline.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === '') resolve(defaultValue);
      else resolve(trimmed === 'y' || trimmed === 'yes');
    });
  });
}

// Update documents from a specific PR
async function updateFromPR(documentManager, prNumber, options, reporter) {
  reporter.log(`Analyzing PR #${prNumber} for documentation updates...`, 'progress');
  
  // Initialize PR client
  const prClient = new PRClient();
  
  // Fetch PR data
  const prData = await prClient.getPullRequestDetails(prNumber);
  
  if (!prData) {
    reporter.log(`PR #${prNumber} not found`, 'error');
    process.exit(1);
  }
  
  reporter.log(`📊 PR Analysis: ${prData.title}`, 'info');
  reporter.log(`👤 Author: ${prData.user.login}`, 'info');
  reporter.log(`📝 Changes: ${prData.files?.length || 0} files (+${prData.additions}/-${prData.deletions})`, 'info');
  
  if (options.dryRun) {
    // Dry run - show what would be updated
    const { documentsToUpdate, suggestedDocuments, analysis } = await documentManager.identifyDocumentsToUpdate(prData);
    
    console.log('\n📋 Documents that would be updated:');
    if (documentsToUpdate.length === 0) {
      console.log('  🔍 No existing documents require updates');
    } else {
      documentsToUpdate.forEach((doc, index) => {
        console.log(`  ${index + 1}. ${doc.path}`);
        console.log(`     📊 Type: ${doc.documentationNeeds?.type || 'general'}`);
        console.log(`     📅 Last updated: ${doc.status.lastUpdated ? new Date(doc.status.lastUpdated).toLocaleDateString() : 'never'}`);
        console.log(`     🔄 Status: ${doc.status.needsUpdate ? 'outdated' : 'current'}`);
      });
    }
    
    console.log('\n💡 Suggested new documents:');
    if (suggestedDocuments.length === 0) {
      console.log('  ➕ No new documents suggested');
    } else {
      suggestedDocuments.forEach((doc, index) => {
        console.log(`  ${index + 1}. ${doc}`);
      });
    }
    
    // Show analysis summary
    if (analysis && options.verbose) {
      console.log('\n📈 Change Analysis:');
      console.log(`     📊 Files: ${analysis.summary?.totalFiles || 0} (+${analysis.summary?.totalAdditions || 0}/-${analysis.summary?.totalDeletions || 0})`);
      console.log(`     ⚠️  Risk: ${analysis.risks?.level || 'unknown'}`);
      console.log(`     💥 Breaking: ${analysis.breakingChanges?.detected ? 'Yes' : 'No'}`);
    }
    
  } else {
    // Perform actual update
    reporter.log('Performing document updates...', 'progress');
    
    const { documentsToUpdate, suggestedDocuments, analysis } = await documentManager.identifyDocumentsToUpdate(prData);
    
    if (options.interactive && documentsToUpdate.length > 0) {
      const proceed = await askUserConfirmation(`Update ${documentsToUpdate.length} documents?`, true);
      if (!proceed) {
        console.log('Operation cancelled by user');
        return;
      }
    }
    
    // Track statistics
    const stats = { processed: 0, updated: 0, created: 0, failed: 0, conflicts: 0 };
    
    const results = await documentManager.updateDocumentsFromPR(prData, {
      ...options,
      trigger: 'pr',
      progressCallback: (current, total, operation) => {
        reporter.progress(current, total, operation);
        stats.processed = current;
      }
    });
    
    // Calculate final statistics
    results.updated.forEach(result => {
      if (result.updated) {
        stats.updated++;
        if (result.isNew) stats.created++;
        if (result.mergeAnalysis?.conflicts?.length > 0) {
          stats.conflicts += result.mergeAnalysis.conflicts.length;
        }
      } else {
        stats.failed++;
      }
    });
    
    reporter.summary(stats);
    
    reporter.log(`Document updates completed successfully!`, 'success');
    reporter.log(`📊 Updated: ${stats.updated} documents`, 'info');
    
    if (options.report && results.report) {
      reporter.log(`📝 Detailed report: ${path.basename(results.report)}`, 'info');
    }
    
    // Suggest new documents if any
    if (results.suggestedDocuments.length > 0) {
      console.log('\n💡 Consider creating these new documents:');
      results.suggestedDocuments.forEach(doc => {
        console.log(`   📄 ${doc}`);
      });
    }
    
    // Show merge conflicts if any
    if (stats.conflicts > 0) {
      console.log(`\n⚠️  ${stats.conflicts} merge conflicts were resolved automatically`);
      console.log('   Review the updated documents to ensure correctness');
    }
  }
}

// Scan and update outdated documents
async function scanAndUpdate(documentManager, options, reporter) {
  reporter.log('Scanning for outdated documentation...', 'progress');
  
  // Find all documentation files
  const documentFiles = await documentManager.scanDocuments();
  
  reporter.log(`Found ${documentFiles.length} documentation files`, 'info');
  
  // Check status of each document
  const documentsToUpdate = [];
  const documentStatuses = [];
  
  for (let i = 0; i < documentFiles.length; i++) {
    const file = documentFiles[i];
    reporter.progress(i + 1, documentFiles.length, 'Analyzing documents');
    
    const status = await documentManager.checkDocumentStatus(file);
    documentStatuses.push({ path: file, status });
    
    if (options.force || status.needsUpdate) {
      documentsToUpdate.push({ path: file, status });
    }
  }
  
  const stats = { processed: documentFiles.length, updated: 0, created: 0, failed: 0, conflicts: 0 };
  
  reporter.log(`Found ${documentsToUpdate.length} documents that need updating`, 'info');
  
  if (options.dryRun) {
    // Dry run - just show what would be updated
    console.log('\n📋 Documents that would be updated:');
    if (documentsToUpdate.length === 0) {
      console.log('  🎉 All documents are up to date!');
    } else {
      documentsToUpdate.forEach((doc, index) => {
        const relativePath = path.relative(process.cwd(), doc.path);
        const lastUpdated = doc.status.lastUpdated 
          ? new Date(doc.status.lastUpdated).toLocaleDateString() 
          : 'never';
        
        console.log(`  ${index + 1}. ${relativePath}`);
        console.log(`     📅 Last updated: ${lastUpdated}`);
        console.log(`     📊 Version: ${doc.status.version || 'untracked'}`);
        console.log(`     🔄 Reason: ${doc.status.needsUpdate ? 'outdated' : 'forced'}`);
      });
    }
    
    // Show document health overview
    if (options.verbose) {
      console.log('\n📈 Documentation Health Overview:');
      const fresh = documentStatuses.filter(d => !d.status.needsUpdate).length;
      const outdated = documentStatuses.filter(d => d.status.needsUpdate).length;
      const untracked = documentStatuses.filter(d => !d.status.registered).length;
      
      console.log(`   🟢 Fresh: ${fresh} documents`);
      console.log(`   🟡 Outdated: ${outdated} documents`);
      console.log(`   ⚪ Untracked: ${untracked} documents`);
      console.log(`   📊 Health Score: ${Math.round((fresh / documentFiles.length) * 100)}%`);
    }
    
  } else if (documentsToUpdate.length > 0) {
    
    if (options.interactive) {
      const proceed = await askUserConfirmation(`Update ${documentsToUpdate.length} documents?`, true);
      if (!proceed) {
        console.log('Operation cancelled by user');
        return;
      }
    }
    
    // Perform actual update
    reporter.log('Updating documents...', 'progress');
    
    // For general document updates without PR context, we need a different approach
    // This would typically involve regenerating documents based on current codebase state
    console.log('\n⚠️  General document updates without PR context are limited.');
    console.log('💡 Consider using --pr=<number> to update documents based on specific changes.');
    console.log('🔧 For now, we can refresh document metadata and check for manual updates needed.');
    
    // Refresh document registry
    for (let i = 0; i < documentsToUpdate.length; i++) {
      const doc = documentsToUpdate[i];
      reporter.progress(i + 1, documentsToUpdate.length, 'Refreshing metadata');
      
      try {
        await documentManager.registerDocument(doc.path, {
          trigger: 'refresh',
          forceRefresh: options.force
        });
        stats.updated++;
      } catch (error) {
        reporter.log(`Failed to refresh ${doc.path}: ${error.message}`, 'error');
        stats.failed++;
      }
    }
    
    reporter.summary(stats);
    
    if (stats.updated > 0) {
      reporter.log('Document metadata refreshed successfully', 'success');
      reporter.log('💡 Use PR-based updates for content regeneration', 'info');
    }
    
  } else {
    reporter.log('All documents are up to date!', 'success');
  }
}

// Run the main function
main().catch(error => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
