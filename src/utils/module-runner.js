#!/usr/bin/env node

/**
 * Standalone Module Runner for Chroniclr
 * Allows running individual modules independently for testing and debugging
 */

const core = require('@actions/core');
const { ModularController } = require('./modular-controller');

class ModuleRunner {
  constructor() {
    this.controller = new ModularController();
  }

  /**
   * Run a specific module independently
   */
  async runModule(moduleName, moduleConfig = {}, inputData = {}) {
    core.info(`Running module: ${moduleName}`);
    
    try {
      switch (moduleName) {
        case 'discussion-processing':
          return await this.runDiscussionProcessing(inputData);
          
        case 'pr-analysis':
          return await this.runPRAnalysis(inputData);
          
        case 'file-analysis':
          return await this.runFileAnalysis(inputData);
          
        case 'jira-enrichment':
          return await this.runJiraEnrichment(inputData);
          
        case 'cross-platform-correlation':
          return await this.runCrossPlatformCorrelation(inputData);
          
        case 'release-notes':
          return await this.runReleaseNotes(inputData);
          
        case 'action-items':
          return await this.runActionItems(inputData);
          
        case 'document-generation':
          return await this.runDocumentGeneration(inputData);
          
        case 'status-check':
          return await this.runStatusCheck();
          
        default:
          throw new Error(`Unknown module: ${moduleName}`);
      }
    } catch (error) {
      core.error(`Module ${moduleName} failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async runDiscussionProcessing(inputData) {
    if (!inputData.discussionData) {
      throw new Error('discussionData required for discussion processing');
    }
    
    return await this.controller.processDiscussion(inputData.discussionData);
  }

  async runPRAnalysis(inputData) {
    if (!this.controller.isModuleEnabled('pullRequests')) {
      return { success: false, reason: 'Pull request module not enabled' };
    }

    if (!inputData.prData) {
      throw new Error('prData required for PR analysis');
    }
    
    const { PullRequestClient } = require('./pr-client');
    const prClient = new PullRequestClient();
    
    if (!prClient.isEnabled()) {
      return { success: false, reason: 'PR client not configured' };
    }
    
    const prData = await prClient.getPullRequestData(inputData.prNumber);
    return { success: true, data: prData };
  }

  async runFileAnalysis(inputData) {
    if (!inputData.files) {
      throw new Error('files array required for file analysis');
    }
    
    const { FileAnalyzer } = require('./file-analyzer');
    const fileAnalyzer = new FileAnalyzer();
    
    const analysis = fileAnalyzer.analyzeChanges(inputData.files, inputData.prData);
    const summary = fileAnalyzer.generateSummary(analysis);
    const effort = fileAnalyzer.estimateDocumentationEffort(analysis);
    
    return {
      success: true,
      analysis,
      summary,
      effortEstimate: effort
    };
  }

  async runJiraEnrichment(inputData) {
    if (!this.controller.isModuleEnabled('jira')) {
      return { success: false, reason: 'Jira module not enabled' };
    }
    
    const { JiraClient } = require('./jira-client');
    const jiraClient = new JiraClient();
    
    if (!jiraClient.isEnabled()) {
      return { success: false, reason: 'Jira client not configured' };
    }
    
    const enrichmentOptions = inputData.options || {};
    const jiraData = await jiraClient.getEnrichedProjectData(enrichmentOptions);
    
    return { success: true, data: jiraData };
  }

  async runCrossPlatformCorrelation(inputData) {
    const { CrossPlatformCorrelator } = require('./cross-platform-correlator');
    const correlator = new CrossPlatformCorrelator();
    
    if (!correlator.isEnabled()) {
      return { success: false, reason: 'Cross-platform correlation not enabled' };
    }
    
    const correlation = await correlator.correlateCompleteProject(
      inputData.discussionData,
      inputData.prData,
      inputData.jiraData
    );
    
    const summary = correlator.generateCorrelationSummary(correlation);
    
    return {
      success: true,
      correlation,
      summary
    };
  }

  async runReleaseNotes(inputData) {
    if (!this.controller.isModuleEnabled('pullRequests')) {
      return { success: false, reason: 'Pull request module not enabled' };
    }
    
    if (!inputData.prNumber) {
      throw new Error('prNumber required for release notes generation');
    }
    
    const { PullRequestClient } = require('./pr-client');
    const prClient = new PullRequestClient();
    
    const result = await prClient.processMergedPR(inputData.prNumber);
    return result;
  }

  async runActionItems(inputData) {
    if (!this.controller.isModuleEnabled('issues')) {
      return { success: false, reason: 'Issues module not enabled' };
    }
    
    if (!inputData.discussionData) {
      throw new Error('discussionData required for action items processing');
    }
    
    const { ActionItemIssueCreator } = require('./issue-creator');
    const issueCreator = new ActionItemIssueCreator();
    
    return await issueCreator.processActionItems(inputData.discussionData);
  }

  async runDocumentGeneration(inputData) {
    if (!this.controller.isModuleEnabled('ai')) {
      return { success: false, reason: 'AI module not enabled' };
    }
    
    if (!inputData.docType || !inputData.discussionData) {
      throw new Error('docType and discussionData required for document generation');
    }
    
    const { AIDocumentGenerator } = require('../generators/ai-document-generator');
    const generator = new AIDocumentGenerator();
    
    const content = await generator.generateDocument(inputData.docType, inputData.discussionData);
    const filepath = await generator.saveDocument(inputData.docType, content, inputData.discussionData.number);
    
    return {
      success: true,
      docType: inputData.docType,
      content,
      filepath
    };
  }

  async runStatusCheck() {
    await this.controller.initializeModules();
    const status = this.controller.generateStatusReport();
    const issues = this.controller.validateConfiguration();
    
    return {
      success: true,
      status,
      configurationIssues: issues
    };
  }

  /**
   * Run multiple modules in sequence
   */
  async runPipeline(pipeline, inputData = {}) {
    core.info(`Running pipeline: ${pipeline.join(' → ')}`);
    
    const results = {};
    let currentData = { ...inputData };
    
    for (const moduleName of pipeline) {
      core.info(`Pipeline step: ${moduleName}`);
      
      const result = await this.runModule(moduleName, {}, currentData);
      results[moduleName] = result;
      
      if (!result.success) {
        core.error(`Pipeline failed at ${moduleName}: ${result.error || result.reason}`);
        return { success: false, failedAt: moduleName, results };
      }
      
      // Pass results to next module
      if (result.data) {
        currentData = { ...currentData, ...result.data };
      }
    }
    
    core.info('Pipeline completed successfully');
    return { success: true, results };
  }

  /**
   * Test module connectivity and dependencies
   */
  async testModuleDependencies() {
    core.info('Testing module dependencies...');
    
    const tests = {
      'ai-module': async () => {
        if (!this.controller.isModuleEnabled('ai')) return { skipped: true };
        const { AIDocumentGenerator } = require('../generators/ai-document-generator');
        new AIDocumentGenerator();
        return { success: true };
      },
      
      'jira-client': async () => {
        if (!this.controller.isModuleEnabled('jira')) return { skipped: true };
        const { JiraClient } = require('./jira-client');
        const client = new JiraClient();
        return { success: client.isEnabled(), status: client.getStatus() };
      },
      
      'pr-client': async () => {
        if (!this.controller.isModuleEnabled('pullRequests')) return { skipped: true };
        const { PullRequestClient } = require('./pr-client');
        const client = new PullRequestClient();
        return { success: client.isEnabled() };
      },
      
      'file-analyzer': async () => {
        const { FileAnalyzer } = require('./file-analyzer');
        new FileAnalyzer();
        return { success: true };
      },
      
      'correlator': async () => {
        const { CrossPlatformCorrelator } = require('./cross-platform-correlator');
        const correlator = new CrossPlatformCorrelator();
        return { success: true, enabled: correlator.isEnabled() };
      },
      
      'issue-creator': async () => {
        const { ActionItemIssueCreator } = require('./issue-creator');
        new ActionItemIssueCreator();
        return { success: true };
      }
    };
    
    const testResults = {};
    
    for (const [testName, testFn] of Object.entries(tests)) {
      try {
        testResults[testName] = await testFn();
      } catch (error) {
        testResults[testName] = { success: false, error: error.message };
      }
    }
    
    return testResults;
  }

  /**
   * Generate example configurations for different use cases
   */
  generateExampleConfigurations() {
    return {
      'minimal': {
        description: 'Basic discussion processing only',
        config: {
          ai: { enabled: true },
          pullRequests: { enabled: false },
          jira: { enabled: false },
          issues: { enabled: false }
        }
      },
      
      'discussion-focused': {
        description: 'Discussion processing with action items',
        config: {
          ai: { enabled: true },
          pullRequests: { enabled: false },
          jira: { enabled: false },
          issues: { enabled: true }
        }
      },
      
      'pr-release-notes': {
        description: 'PR processing for automated release notes',
        config: {
          ai: { enabled: true },
          pullRequests: {
            enabled: true,
            modules: {
              mergedPrProcessing: { enabled: true, autoReleaseNotes: true },
              releaseManagement: { enabled: true, autoUpdateIssues: true }
            }
          }
        }
      },
      
      'jira-integration': {
        description: 'Full Jira integration with project enrichment',
        config: {
          ai: { enabled: true },
          jira: { enabled: true },
          pullRequests: {
            enabled: true,
            modules: {
              jiraIntegration: { enabled: true, extractKeysFromPr: true }
            }
          },
          correlation: { enabled: true }
        }
      },
      
      'complete-intelligence': {
        description: 'Full cross-platform project intelligence',
        config: {
          ai: { enabled: true },
          jira: { enabled: true },
          issues: { enabled: true },
          pullRequests: {
            enabled: true,
            modules: {
              prAnalysis: { enabled: true },
              mergedPrProcessing: { enabled: true, autoReleaseNotes: true },
              fileChangeAnalysis: { enabled: true, riskAssessment: true },
              jiraIntegration: { enabled: true, extractKeysFromPr: true },
              releaseManagement: { enabled: true, autoUpdateIssues: true }
            }
          },
          correlation: { enabled: true }
        }
      }
    };
  }
}

// CLI interface when run directly
async function main() {
  const args = process.argv.slice(2);
  const runner = new ModuleRunner();
  
  if (args.length === 0) {
    console.log('Usage: node module-runner.js <command> [options]');
    console.log('Commands:');
    console.log('  status - Check module status');
    console.log('  test-deps - Test module dependencies');
    console.log('  examples - Show example configurations');
    console.log('  run <module> - Run specific module');
    return;
  }
  
  const command = args[0];
  
  try {
    switch (command) {
      case 'status':
        const result = await runner.runModule('status-check');
        console.log(JSON.stringify(result, null, 2));
        break;
        
      case 'test-deps':
        const testResults = await runner.testModuleDependencies();
        console.log(JSON.stringify(testResults, null, 2));
        break;
        
      case 'examples':
        const examples = runner.generateExampleConfigurations();
        console.log(JSON.stringify(examples, null, 2));
        break;
        
      case 'run':
        if (args.length < 2) {
          console.error('Module name required');
          process.exit(1);
        }
        const moduleResult = await runner.runModule(args[1]);
        console.log(JSON.stringify(moduleResult, null, 2));
        break;
        
      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error(`Command failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { ModuleRunner };