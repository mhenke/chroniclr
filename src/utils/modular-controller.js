#!/usr/bin/env node

/**
 * Modular Controller for Chroniclr
 * Orchestrates all modules based on configuration and ensures independent operation
 */

const core = require('@actions/core');
const fs = require('fs');
const path = require('path');

class ModularController {
  constructor() {
    this.config = this.loadConfiguration();
    this.moduleStatus = {};
  }

  loadConfiguration() {
    try {
      const configPath = path.join(process.cwd(), 'chroniclr.config.json');
      const configData = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      core.warning(`Failed to load configuration: ${error.message}`);
      return {};
    }
  }

  /**
   * Check if a specific module is enabled
   */
  isModuleEnabled(category, module = null) {
    const categoryConfig = this.config[category];
    if (!categoryConfig || !categoryConfig.enabled) {
      return false;
    }

    if (module) {
      return categoryConfig.modules?.[module]?.enabled || false;
    }

    return true;
  }

  /**
   * Get module configuration
   */
  getModuleConfig(category, module = null) {
    const categoryConfig = this.config[category] || {};
    
    if (module) {
      return categoryConfig.modules?.[module] || {};
    }
    
    return categoryConfig;
  }

  /**
   * Initialize all enabled modules
   */
  async initializeModules() {
    core.info('Initializing Chroniclr modules...');

    const moduleInitializers = {
      discussions: this.initializeDiscussionModule.bind(this),
      jira: this.initializeJiraModule.bind(this),
      pullRequests: this.initializePullRequestModules.bind(this),
      issues: this.initializeIssueModule.bind(this),
      ai: this.initializeAIModule.bind(this)
    };

    for (const [category, initializer] of Object.entries(moduleInitializers)) {
      try {
        if (this.isModuleEnabled(category)) {
          core.info(`Initializing ${category} module...`);
          await initializer();
          this.moduleStatus[category] = { enabled: true, initialized: true };
        } else {
          core.info(`${category} module disabled, skipping`);
          this.moduleStatus[category] = { enabled: false, initialized: false };
        }
      } catch (error) {
        core.error(`Failed to initialize ${category} module: ${error.message}`);
        this.moduleStatus[category] = { enabled: true, initialized: false, error: error.message };
      }
    }

    this.logModuleStatus();
    return this.moduleStatus;
  }

  async initializeDiscussionModule() {
    // Discussion processing is the core module, always available
    core.info('Discussion processing module ready');
  }

  async initializeJiraModule() {
    const { JiraClient } = require('./jira-client');
    const jiraClient = new JiraClient();
    
    if (jiraClient.isEnabled()) {
      const status = jiraClient.getStatus();
      if (status.enabled) {
        core.info(`Jira integration ready: ${status.baseUrl} (${status.project})`);
      } else {
        throw new Error(`Jira configuration invalid: ${status.reason}`);
      }
    } else {
      throw new Error('Jira module enabled in config but client not configured');
    }
  }

  async initializePullRequestModules() {
    const { PullRequestClient } = require('./pr-client');
    const prClient = new PullRequestClient();
    
    if (!prClient.isEnabled()) {
      throw new Error('Pull Request module enabled in config but client not configured');
    }

    // Initialize sub-modules
    const subModules = [
      'prAnalysis',
      'mergedPrProcessing', 
      'fileChangeAnalysis',
      'jiraIntegration',
      'releaseManagement',
      'stakeholderNotifications'
    ];

    const enabledSubModules = subModules.filter(module => 
      prClient.isModuleEnabled(module)
    );

    core.info(`PR sub-modules enabled: ${enabledSubModules.join(', ') || 'none'}`);

    // Validate file change analysis if enabled
    if (prClient.isModuleEnabled('fileChangeAnalysis')) {
      const { FileAnalyzer } = require('./file-analyzer');
      const fileAnalyzer = new FileAnalyzer();
      core.info('File change analysis module ready');
    }

    // Validate cross-platform correlation if enabled
    if (prClient.isModuleEnabled('jiraIntegration') && this.isModuleEnabled('jira')) {
      const { CrossPlatformCorrelator } = require('./cross-platform-correlator');
      const correlator = new CrossPlatformCorrelator();
      if (correlator.isEnabled()) {
        core.info('Cross-platform correlation ready');
      }
    }
  }

  async initializeIssueModule() {
    const { ActionItemIssueCreator } = require('./issue-creator');
    const issueCreator = new ActionItemIssueCreator();
    core.info('Issue creation module ready');
  }

  async initializeAIModule() {
    const { AIDocumentGenerator } = require('../generators/ai-document-generator');
    const aiGenerator = new AIDocumentGenerator();
    core.info(`AI document generation ready: ${this.config.ai?.model || 'gpt-4o'}`);
  }

  /**
   * Process discussion with only enabled modules
   */
  async processDiscussion(discussionData) {
    core.info(`Processing discussion #${discussionData.number} with enabled modules...`);
    
    const results = {
      discussionProcessing: null,
      jiraEnrichment: null,
      crossPlatformCorrelation: null,
      documentGeneration: null,
      actionItems: null
    };

    try {
      // Core discussion processing (always enabled)
      results.discussionProcessing = {
        success: true,
        discussionData
      };

      // Jira enrichment (if enabled)
      if (this.isModuleEnabled('jira')) {
        try {
          const { JiraClient } = require('./jira-client');
          const jiraClient = new JiraClient();
          
          if (jiraClient.isEnabled()) {
            const jiraData = await jiraClient.getEnrichedProjectData();
            results.jiraEnrichment = { success: true, data: jiraData };
            core.info('Jira enrichment completed');
          }
        } catch (error) {
          results.jiraEnrichment = { success: false, error: error.message };
          core.warning(`Jira enrichment failed: ${error.message}`);
        }
      }

      // Document generation (AI module)
      if (this.isModuleEnabled('ai')) {
        try {
          const { AIDocumentGenerator } = require('../generators/ai-document-generator');
          const generator = new AIDocumentGenerator();
          
          // Generate based on configured document types
          const docTypes = this.determineDocumentTypes(discussionData);
          const generatedDocs = [];
          
          for (const docType of docTypes) {
            const content = await generator.generateDocument(docType, {
              ...discussionData,
              owner: discussionData.owner,
              repo: discussionData.repo
            });
            
            const filepath = await generator.saveDocument(docType, content, discussionData.number);
            generatedDocs.push({ docType, filepath });
          }
          
          results.documentGeneration = { success: true, documents: generatedDocs };
          core.info(`Generated ${generatedDocs.length} documents`);
        } catch (error) {
          results.documentGeneration = { success: false, error: error.message };
          core.error(`Document generation failed: ${error.message}`);
        }
      }

      // Action items processing (if enabled)
      if (this.isModuleEnabled('issues')) {
        try {
          const { ActionItemIssueCreator } = require('./issue-creator');
          const issueCreator = new ActionItemIssueCreator();
          
          const actionItemResults = await issueCreator.processActionItems(discussionData);
          results.actionItems = actionItemResults;
          core.info('Action items processed');
        } catch (error) {
          results.actionItems = { success: false, error: error.message };
          core.warning(`Action item processing failed: ${error.message}`);
        }
      }

      return results;

    } catch (error) {
      core.error(`Discussion processing failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Process pull request with only enabled modules
   */
  async processPullRequest(prData) {
    if (!this.isModuleEnabled('pullRequests')) {
      core.info('Pull request processing disabled');
      return { success: false, reason: 'module_disabled' };
    }

    core.info(`Processing PR #${prData.pr?.number || 'unknown'} with enabled modules...`);
    
    const results = {
      prAnalysis: null,
      fileChangeAnalysis: null,
      jiraCorrelation: null,
      releaseNotes: null,
      crossPlatformCorrelation: null
    };

    try {
      const { PullRequestClient } = require('./pr-client');
      const prClient = new PullRequestClient();

      // Basic PR analysis (if enabled)
      if (prClient.isModuleEnabled('prAnalysis')) {
        results.prAnalysis = { success: true, data: prData };
      }

      // File change analysis (if enabled)
      if (prClient.isModuleEnabled('fileChangeAnalysis')) {
        try {
          const { FileAnalyzer } = require('./file-analyzer');
          const fileAnalyzer = new FileAnalyzer();
          
          const analysis = fileAnalyzer.analyzeChanges(prData.files || [], prData);
          results.fileChangeAnalysis = { success: true, analysis };
          core.info('File change analysis completed');
        } catch (error) {
          results.fileChangeAnalysis = { success: false, error: error.message };
        }
      }

      // Release notes processing (if enabled and PR is merged)
      if (prClient.isModuleEnabled('mergedPrProcessing') && prData.pr?.merged) {
        try {
          const releaseResult = await prClient.processMergedPR(prData.pr.number);
          results.releaseNotes = releaseResult;
          core.info('Release notes processing completed');
        } catch (error) {
          results.releaseNotes = { success: false, error: error.message };
        }
      }

      // Cross-platform correlation (if enabled)
      if (prClient.isModuleEnabled('jiraIntegration') && this.isModuleEnabled('jira')) {
        try {
          const { CrossPlatformCorrelator } = require('./cross-platform-correlator');
          const correlator = new CrossPlatformCorrelator();
          
          if (correlator.isEnabled()) {
            const correlation = await correlator.correlatePullRequest(prData);
            results.crossPlatformCorrelation = { success: true, correlation };
            core.info('Cross-platform correlation completed');
          }
        } catch (error) {
          results.crossPlatformCorrelation = { success: false, error: error.message };
        }
      }

      return results;

    } catch (error) {
      core.error(`PR processing failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Determine document types based on discussion labels and content
   */
  determineDocumentTypes(discussionData) {
    const labelMappings = this.config.github?.discussionLabels || {};
    const discussionLabels = discussionData.labels || [];
    
    let docTypes = [];
    
    // Map labels to document types
    for (const label of discussionLabels) {
      if (labelMappings[label]) {
        docTypes = docTypes.concat(labelMappings[label]);
      }
    }
    
    // Default to summary if no specific types found
    if (docTypes.length === 0) {
      docTypes = ['summary'];
    }
    
    // Remove duplicates
    return [...new Set(docTypes)];
  }

  /**
   * Generate comprehensive status report
   */
  generateStatusReport() {
    const report = {
      timestamp: new Date().toISOString(),
      overallStatus: 'ready',
      modules: {},
      capabilities: {
        discussionProcessing: true,
        documentGeneration: this.isModuleEnabled('ai'),
        actionItemCreation: this.isModuleEnabled('issues'),
        jiraIntegration: this.isModuleEnabled('jira'),
        pullRequestProcessing: this.isModuleEnabled('pullRequests'),
        crossPlatformIntelligence: false
      },
      configuration: {
        totalModules: Object.keys(this.moduleStatus).length,
        enabledModules: Object.values(this.moduleStatus).filter(m => m.enabled).length,
        readyModules: Object.values(this.moduleStatus).filter(m => m.initialized).length
      }
    };

    // Detailed module status
    for (const [category, status] of Object.entries(this.moduleStatus)) {
      report.modules[category] = {
        enabled: status.enabled,
        initialized: status.initialized,
        error: status.error || null
      };

      if (status.error) {
        report.overallStatus = 'degraded';
      }
    }

    // Cross-platform intelligence capability
    const hasJira = this.isModuleEnabled('jira') && this.moduleStatus.jira?.initialized;
    const hasPR = this.isModuleEnabled('pullRequests') && this.moduleStatus.pullRequests?.initialized;
    report.capabilities.crossPlatformIntelligence = hasJira && hasPR;

    return report;
  }

  /**
   * Log module status for debugging
   */
  logModuleStatus() {
    core.info('=== Chroniclr Module Status ===');
    
    for (const [category, status] of Object.entries(this.moduleStatus)) {
      const statusEmoji = status.initialized ? '✅' : (status.enabled ? '❌' : '⏸️');
      const statusText = status.initialized ? 'Ready' : (status.enabled ? 'Failed' : 'Disabled');
      
      core.info(`${statusEmoji} ${category}: ${statusText}${status.error ? ` (${status.error})` : ''}`);
    }
    
    const enabledCount = Object.values(this.moduleStatus).filter(m => m.enabled).length;
    const readyCount = Object.values(this.moduleStatus).filter(m => m.initialized).length;
    
    core.info(`\nSummary: ${readyCount}/${enabledCount} modules ready`);
  }

  /**
   * Validate configuration for common issues
   */
  validateConfiguration() {
    const issues = [];
    
    // Check for required AI configuration
    if (this.isModuleEnabled('ai') && !this.config.ai?.model) {
      issues.push('AI module enabled but no model specified');
    }
    
    // Check for Jira authentication when enabled
    if (this.isModuleEnabled('jira')) {
      const jiraConfig = this.config.jira;
      if (!jiraConfig.baseUrl || !jiraConfig.defaultProject) {
        issues.push('Jira module enabled but baseUrl or defaultProject missing');
      }
    }
    
    // Check for PR module configuration
    if (this.isModuleEnabled('pullRequests')) {
      const prConfig = this.config.pullRequests;
      const hasEnabledSubModules = Object.values(prConfig.modules || {}).some(m => m.enabled);
      if (!hasEnabledSubModules) {
        issues.push('Pull Request module enabled but no sub-modules enabled');
      }
    }
    
    if (issues.length > 0) {
      core.warning('Configuration issues found:');
      issues.forEach(issue => core.warning(`- ${issue}`));
    }
    
    return issues;
  }
}

module.exports = { ModularController };