#!/usr/bin/env node

/**
 * GitHub Pull Request Client for Chroniclr
 * Handles PR data extraction, analysis, and release note generation
 */

const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');
const path = require('path');

class PullRequestClient {
  constructor() {
    this.github = github.getOctokit(process.env.GITHUB_TOKEN);
    this.context = github.context;
    this.config = this.loadConfiguration();
  }

  loadConfiguration() {
    try {
      const configPath = path.join(process.cwd(), 'chroniclr.config.json');
      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData);
      return config.pullRequests || { enabled: false, modules: {} };
    } catch (error) {
      core.warning(`Failed to load PR configuration: ${error.message}`);
      return { enabled: false, modules: {} };
    }
  }

  isEnabled() {
    return this.config.enabled;
  }

  isModuleEnabled(moduleName) {
    return this.config.modules?.[moduleName]?.enabled || false;
  }

  getModuleConfig(moduleName) {
    return this.config.modules?.[moduleName] || {};
  }

  /**
   * Get PRs to process based on different selection methods
   */
  async getPullRequestsToProcess() {
    const prList = process.env.PR_LIST;
    
    if (!prList) {
      core.warning('No PR_LIST environment variable found');
      return [];
    }

    const allPRs = [];
    const parts = prList.split(',').map(p => p.trim());
    
    for (const part of parts) {
      if (part.startsWith('from-jira:')) {
        // Extract Jira keys and find related PRs
        const jiraKeys = part.replace('from-jira:', '').split(',').map(k => k.trim());
        const jiraPRs = await this.findPRsFromJiraKeys(jiraKeys);
        allPRs.push(...jiraPRs);
      } else {
        // Direct PR number
        const prNumber = parseInt(part);
        if (!isNaN(prNumber) && !allPRs.includes(prNumber)) {
          allPRs.push(prNumber);
        }
      }
    }
    
    // Remove duplicates and return
    return [...new Set(allPRs)];
  }

  /**
   * Find PRs that reference specific Jira keys using multiple discovery strategies
   */
  async findPRsFromJiraKeys(jiraKeys) {
    const discoveredPRs = new Map(); // PR number -> { number, confidence, sources, title }
    const maxDiscoveries = parseInt(process.env.MAX_DISCOVERIES) || 20;
    const discoveryScope = process.env.DISCOVERY_SCOPE || 'recent';
    
    core.info(`🔍 Starting enhanced Jira discovery for keys: ${jiraKeys.join(', ')}`);
    core.info(`📊 Scope: ${discoveryScope}, Max discoveries: ${maxDiscoveries}`);
    
    for (const jiraKey of jiraKeys) {
      try {
        core.info(`\n🔎 Analyzing Jira key: ${jiraKey}`);
        
        // Strategy 1: Exact key matching in PR titles and bodies
        await this.searchPRsByKeyword(jiraKey, discoveredPRs, 'exact', discoveryScope);
        
        // Strategy 2: Case-insensitive matching
        const lowerKey = jiraKey.toLowerCase();
        if (lowerKey !== jiraKey) {
          await this.searchPRsByKeyword(lowerKey, discoveredPRs, 'case-insensitive', discoveryScope);
        }
        
        // Strategy 3: Branch name analysis
        await this.searchPRsByBranches(jiraKey, discoveredPRs, discoveryScope);
        
        // Strategy 4: Commit message scanning (for merged PRs)
        await this.searchPRsByCommits(jiraKey, discoveredPRs, discoveryScope);
        
        // Early exit if we hit discovery limits
        if (discoveredPRs.size >= maxDiscoveries) {
          core.warning(`⚠️ Reached maximum discovery limit (${maxDiscoveries}). Stopping search.`);
          break;
        }
        
      } catch (error) {
        core.error(`❌ Failed to search for PRs related to ${jiraKey}: ${error.message}`);
        // Continue with other keys
      }
    }
    
    // Sort by confidence and apply final limits
    const sortedPRs = Array.from(discoveredPRs.values())
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxDiscoveries);
    
    // Log discovery summary
    this.logDiscoverySummary(sortedPRs, jiraKeys);
    
    return sortedPRs.map(pr => pr.number);
  }

  /**
   * Search for PRs using keyword matching
   */
  async searchPRsByKeyword(keyword, discoveredPRs, strategy, scope) {
    try {
      let searchQuery = `repo:${this.context.repo.owner}/${this.context.repo.repo} ${keyword} is:pr`;
      
      // Apply scope filters
      if (scope === 'recent') {
        const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        searchQuery += ` updated:>=${twoWeeksAgo}`;
      }
      
      const { data: searchResults } = await this.github.rest.search.issuesAndPullRequests({
        q: searchQuery,
        sort: 'updated',
        order: 'desc',
        per_page: 30 // Get more results for better analysis
      });

      for (const pr of searchResults.items) {
        if (pr.pull_request) {
          this.addDiscoveredPR(discoveredPRs, pr.number, {
            title: pr.title,
            confidence: this.calculateConfidence(keyword, pr.title, pr.body, strategy),
            source: strategy,
            url: pr.html_url
          });
        }
      }
      
      core.info(`  └─ ${strategy}: Found ${searchResults.items.length} potential matches`);
    } catch (error) {
      core.warning(`  └─ ${strategy} search failed: ${error.message}`);
    }
  }

  /**
   * Search for PRs by analyzing branch names
   */
  async searchPRsByBranches(jiraKey, discoveredPRs, scope) {
    try {
      // Search for common branch naming patterns
      const branchPatterns = [
        `feature/${jiraKey}`,
        `feature/${jiraKey.toLowerCase()}`,
        `${jiraKey}-`,
        `${jiraKey.toLowerCase()}-`
      ];
      
      for (const pattern of branchPatterns) {
        const searchQuery = `repo:${this.context.repo.owner}/${this.context.repo.repo} ${pattern} is:pr`;
        
        try {
          const { data: results } = await this.github.rest.search.issuesAndPullRequests({
            q: searchQuery,
            per_page: 10
          });
          
          for (const pr of results.items) {
            if (pr.pull_request) {
              this.addDiscoveredPR(discoveredPRs, pr.number, {
                title: pr.title,
                confidence: 0.8, // High confidence for branch name matches
                source: 'branch-analysis',
                url: pr.html_url
              });
            }
          }
        } catch (error) {
          // Continue with other patterns
          continue;
        }
      }
      
      core.info(`  └─ branch-analysis: Completed branch name scanning`);
    } catch (error) {
      core.warning(`  └─ branch-analysis failed: ${error.message}`);
    }
  }

  /**
   * Search for PRs by scanning commit messages
   */
  async searchPRsByCommits(jiraKey, discoveredPRs, scope) {
    try {
      // This is a simplified implementation - in production, you might want to
      // scan actual commit messages more thoroughly
      const searchQuery = `repo:${this.context.repo.owner}/${this.context.repo.repo} ${jiraKey} type:pr is:merged`;
      
      const { data: results } = await this.github.rest.search.issuesAndPullRequests({
        q: searchQuery,
        per_page: 15
      });
      
      for (const pr of results.items) {
        if (pr.pull_request) {
          this.addDiscoveredPR(discoveredPRs, pr.number, {
            title: pr.title,
            confidence: 0.6, // Medium confidence for commit references
            source: 'commit-analysis',
            url: pr.html_url
          });
        }
      }
      
      core.info(`  └─ commit-analysis: Found ${results.items.length} merged PRs with references`);
    } catch (error) {
      core.warning(`  └─ commit-analysis failed: ${error.message}`);
    }
  }

  /**
   * Add a discovered PR with intelligent deduplication
   */
  addDiscoveredPR(discoveredPRs, prNumber, metadata) {
    if (discoveredPRs.has(prNumber)) {
      // Merge with existing entry, keeping highest confidence
      const existing = discoveredPRs.get(prNumber);
      existing.confidence = Math.max(existing.confidence, metadata.confidence);
      existing.sources = [...new Set([...existing.sources, metadata.source])];
    } else {
      discoveredPRs.set(prNumber, {
        number: prNumber,
        title: metadata.title,
        confidence: metadata.confidence,
        sources: [metadata.source],
        url: metadata.url
      });
    }
  }

  /**
   * Calculate confidence score based on match quality
   */
  calculateConfidence(keyword, title, body, strategy) {
    let confidence = 0.3; // Base confidence
    
    const titleLower = (title || '').toLowerCase();
    const bodyLower = (body || '').toLowerCase();
    const keywordLower = keyword.toLowerCase();
    
    // Title matches get highest confidence
    if (titleLower.includes(keywordLower)) {
      confidence = 0.9;
    }
    // Body matches get medium confidence
    else if (bodyLower.includes(keywordLower)) {
      confidence = 0.7;
    }
    
    // Adjust based on strategy
    switch (strategy) {
      case 'exact':
        confidence += 0.1;
        break;
      case 'case-insensitive':
        confidence -= 0.1;
        break;
    }
    
    return Math.min(confidence, 1.0);
  }

  /**
   * Log comprehensive discovery summary
   */
  logDiscoverySummary(discoveredPRs, jiraKeys) {
    core.info(`\n📋 Discovery Summary:`);
    core.info(`🔍 Searched for: ${jiraKeys.join(', ')}`);
    core.info(`✅ Found: ${discoveredPRs.length} unique PRs`);
    
    if (discoveredPRs.length > 0) {
      core.info(`\n📊 Discovered PRs (by confidence):`);
      discoveredPRs.forEach(pr => {
        const confidenceLevel = pr.confidence >= 0.8 ? 'HIGH' : pr.confidence >= 0.6 ? 'MED' : 'LOW';
        core.info(`  • PR #${pr.number}: ${pr.title.substring(0, 60)}... (${confidenceLevel})`);
        core.info(`    Sources: ${pr.sources.join(', ')}, Confidence: ${(pr.confidence * 100).toFixed(0)}%`);
      });
    }
    
    // Set environment variables for reporting
    process.env.DISCOVERY_REPORT = JSON.stringify({
      searchedKeys: jiraKeys,
      foundPRs: discoveredPRs.length,
      highConfidence: discoveredPRs.filter(pr => pr.confidence >= 0.8).length,
      mediumConfidence: discoveredPRs.filter(pr => pr.confidence >= 0.6 && pr.confidence < 0.8).length,
      lowConfidence: discoveredPRs.filter(pr => pr.confidence < 0.6).length
    });
  }

  /**
   * Extract comprehensive PR data for analysis
   */
  async getPullRequestData(prNumber = null) {
    try {
      const pullNumber = prNumber || this.context.payload.pull_request?.number;
      if (!pullNumber) {
        throw new Error('No pull request number found');
      }

      core.info(`Fetching PR data for #${pullNumber}`);

      // Get basic PR information
      const { data: pr } = await this.github.rest.pulls.get({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        pull_number: pullNumber
      });

      // Get PR comments
      const { data: comments } = await this.github.rest.issues.listComments({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        issue_number: pullNumber
      });

      // Get PR review comments
      const { data: reviewComments } = await this.github.rest.pulls.listReviewComments({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        pull_number: pullNumber
      });

      // Get PR reviews
      const { data: reviews } = await this.github.rest.pulls.listReviews({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        pull_number: pullNumber
      });

      // Get changed files
      const { data: files } = await this.github.rest.pulls.listFiles({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        pull_number: pullNumber
      });

      // Get commits
      const { data: commits } = await this.github.rest.pulls.listCommits({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        pull_number: pullNumber
      });

      return {
        pr: {
          number: pr.number,
          title: pr.title,
          body: pr.body || '',
          state: pr.state,
          merged: pr.merged,
          mergedAt: pr.merged_at,
          author: pr.user.login,
          assignees: pr.assignees.map(a => a.login),
          reviewers: pr.requested_reviewers.map(r => r.login),
          labels: pr.labels.map(l => l.name),
          milestone: pr.milestone?.title,
          baseBranch: pr.base.ref,
          headBranch: pr.head.ref,
          url: pr.html_url
        },
        comments: comments.map(comment => ({
          author: comment.user.login,
          body: comment.body,
          createdAt: comment.created_at
        })),
        reviewComments: reviewComments.map(comment => ({
          author: comment.user.login,
          body: comment.body,
          path: comment.path,
          line: comment.line,
          createdAt: comment.created_at
        })),
        reviews: reviews.map(review => ({
          author: review.user.login,
          state: review.state,
          body: review.body || '',
          createdAt: review.submitted_at
        })),
        files: files.map(file => ({
          filename: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          changes: file.changes,
          patch: file.patch
        })),
        commits: commits.map(commit => ({
          sha: commit.sha,
          message: commit.commit.message,
          author: commit.commit.author.name,
          date: commit.commit.author.date
        }))
      };

    } catch (error) {
      core.error(`Failed to fetch PR data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract Jira issue keys from PR title, body, and branch name
   */
  extractJiraKeys(prData) {
    if (!this.isModuleEnabled('jiraIntegration') || !this.getModuleConfig('jiraIntegration').extractKeysFromPr) {
      return [];
    }

    const jiraKeyPattern = /[A-Z]+-\d+/g;
    const searchStrings = [
      prData.pr.title,
      prData.pr.body,
      prData.pr.headBranch
    ].filter(Boolean);

    const jiraKeys = new Set();
    
    for (const str of searchStrings) {
      const matches = str.match(jiraKeyPattern) || [];
      matches.forEach(key => jiraKeys.add(key));
    }

    return Array.from(jiraKeys);
  }

  /**
   * Analyze file changes for documentation impact
   */
  analyzeFileChanges(prData) {
    if (!this.isModuleEnabled('fileChangeAnalysis')) {
      return null;
    }

    const files = prData.files;
    const analysis = {
      totalFiles: files.length,
      totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
      totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
      fileTypes: {},
      impactAreas: {
        frontend: false,
        backend: false,
        database: false,
        api: false,
        tests: false,
        documentation: false,
        configuration: false
      },
      breakingChanges: false,
      newFeatures: [],
      modifiedComponents: []
    };

    // Analyze file patterns
    files.forEach(file => {
      const ext = path.extname(file.filename);
      analysis.fileTypes[ext] = (analysis.fileTypes[ext] || 0) + 1;

      // Detect impact areas
      const filename = file.filename.toLowerCase();
      if (filename.includes('frontend') || filename.includes('ui') || ext === '.tsx' || ext === '.jsx') {
        analysis.impactAreas.frontend = true;
      }
      if (filename.includes('backend') || filename.includes('api') || ext === '.js' || ext === '.py') {
        analysis.impactAreas.backend = true;
      }
      if (filename.includes('db') || filename.includes('migration') || ext === '.sql') {
        analysis.impactAreas.database = true;
      }
      if (filename.includes('api') || filename.includes('endpoint') || filename.includes('route')) {
        analysis.impactAreas.api = true;
      }
      if (filename.includes('test') || filename.includes('spec')) {
        analysis.impactAreas.tests = true;
      }
      if (ext === '.md' || filename.includes('doc')) {
        analysis.impactAreas.documentation = true;
      }
      if (filename.includes('config') || ext === '.json' || ext === '.yaml' || ext === '.yml') {
        analysis.impactAreas.configuration = true;
      }

      // Look for breaking changes indicators
      if (file.patch && file.patch.includes('BREAKING')) {
        analysis.breakingChanges = true;
      }
    });

    return analysis;
  }

  /**
   * Generate AI-powered PR summary for release notes
   */
  async generatePRSummary(prData, summaryType = 'release') {
    try {
      const jiraKeys = this.extractJiraKeys(prData);
      const fileAnalysis = this.analyzeFileChanges(prData);

      // Build comprehensive context for AI
      let context = `PR Analysis for Release Documentation:

PR Details:
- Title: ${prData.pr.title}
- Author: ${prData.pr.author}
- Status: ${prData.pr.merged ? 'Merged' : prData.pr.state}
- Files Changed: ${prData.files.length}
- Lines Added: ${fileAnalysis?.totalAdditions || 0}
- Lines Removed: ${fileAnalysis?.totalDeletions || 0}

Description:
${prData.pr.body}

`;

      if (jiraKeys.length > 0) {
        context += `Related Jira Issues: ${jiraKeys.join(', ')}\n\n`;
      }

      if (fileAnalysis) {
        context += `Impact Analysis:
- Areas Affected: ${Object.entries(fileAnalysis.impactAreas)
          .filter(([_, affected]) => affected)
          .map(([area]) => area)
          .join(', ')}
- Breaking Changes: ${fileAnalysis.breakingChanges ? 'Yes' : 'No'}

`;
      }

      // Add comments and reviews for context
      if (prData.comments.length > 0) {
        context += `Discussion Highlights:
${prData.comments.slice(0, 3).map(c => `- @${c.author}: ${c.body.substring(0, 100)}...`).join('\n')}

`;
      }

      if (prData.reviews.length > 0) {
        context += `Review Summary:
${prData.reviews.map(r => `- @${r.author} (${r.state}): ${r.body ? r.body.substring(0, 100) + '...' : 'No comment'}`).join('\n')}

`;
      }

      // Use existing AI document generator with specialized prompt
      const { AIDocumentGenerator } = require('../generators/ai-document-generator');
      const generator = new AIDocumentGenerator();

      const prompt = `Generate a ${summaryType === 'release' ? 'concise release note entry' : 'detailed technical summary'} for this merged pull request.

${context}

Requirements:
1. ${summaryType === 'release' ? 'Single line, user-focused description of the change' : 'Technical summary with implementation details'}
2. ${summaryType === 'release' ? 'Focus on user-visible features and fixes' : 'Include file changes, technical implications, and developer impact'}
3. Use clear, professional language
4. ${jiraKeys.length > 0 ? `Reference Jira issues: ${jiraKeys.join(', ')}` : 'No Jira references needed'}
5. ${fileAnalysis?.breakingChanges ? 'Highlight breaking changes prominently' : 'No breaking changes to highlight'}

Format: ${summaryType === 'release' ? 'Single line starting with category (feat:, fix:, docs:, etc.)' : 'Structured markdown with sections'}`;

      const summary = await generator.generateCompletion(prompt);
      
      return {
        summary,
        prNumber: prData.pr.number,
        prTitle: prData.pr.title,
        prUrl: prData.pr.url,
        jiraKeys,
        fileAnalysis,
        summaryType,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      core.error(`Failed to generate PR summary: ${error.message}`);
      
      // Fallback summary
      return {
        summary: `${prData.pr.title} (#${prData.pr.number})`,
        prNumber: prData.pr.number,
        prTitle: prData.pr.title,
        prUrl: prData.pr.url,
        jiraKeys: this.extractJiraKeys(prData),
        fileAnalysis: null,
        summaryType,
        generatedAt: new Date().toISOString(),
        fallback: true
      };
    }
  }

  /**
   * Find or create release tracking issue
   */
  async findOrCreateReleaseIssue(milestone = null) {
    if (!this.isModuleEnabled('releaseManagement') || !this.getModuleConfig('releaseManagement').autoUpdateIssues) {
      return null;
    }

    try {
      const labelName = this.getModuleConfig('releaseManagement').releaseIssueLabel || 'release-notes';
      
      // Search for existing release issue
      const { data: issues } = await this.github.rest.issues.listForRepo({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        labels: labelName,
        state: 'open'
      });

      // Filter by milestone if specified
      const releaseIssues = milestone 
        ? issues.filter(issue => issue.milestone?.title === milestone)
        : issues;

      if (releaseIssues.length > 0) {
        core.info(`Found existing release issue: #${releaseIssues[0].number}`);
        return releaseIssues[0];
      }

      // Create new release issue
      const title = milestone ? `Release Notes: ${milestone}` : 'Release Notes';
      const body = `# Release Notes

This issue tracks changes for the upcoming release.

## Changes
<!-- PR summaries will be added automatically by Chroniclr -->

---
*This issue is automatically maintained by Chroniclr*`;

      const issueParams = {
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        title,
        body,
        labels: [labelName]
      };

      if (milestone) {
        // Try to find milestone
        const { data: milestones } = await this.github.rest.issues.listMilestones({
          owner: this.context.repo.owner,
          repo: this.context.repo.repo
        });
        
        const milestoneObj = milestones.find(m => m.title === milestone);
        if (milestoneObj) {
          issueParams.milestone = milestoneObj.number;
        }
      }

      const { data: newIssue } = await this.github.rest.issues.create(issueParams);
      core.info(`Created new release issue: #${newIssue.number}`);
      
      return newIssue;

    } catch (error) {
      core.error(`Failed to find/create release issue: ${error.message}`);
      return null;
    }
  }

  /**
   * Update release issue with PR summary
   */
  async updateReleaseIssue(releaseIssue, prSummary) {
    if (!releaseIssue) return;

    try {
      const currentBody = releaseIssue.body || '';
      const changesSectionMatch = currentBody.match(/(## Changes\s*\n)(.*?)(\n---|\n##|$)/s);
      
      let changesContent = '';
      if (changesSectionMatch) {
        changesContent = changesSectionMatch[2].trim();
      }

      // Add new PR summary
      const newEntry = `- ${prSummary.summary} ([#${prSummary.prNumber}](${prSummary.prUrl}))`;
      const updatedChanges = changesContent 
        ? `${changesContent}\n${newEntry}`
        : newEntry;

      // Reconstruct the issue body
      const updatedBody = currentBody.replace(
        /(## Changes\s*\n)(.*?)(\n---|\n##|$)/s,
        `$1${updatedChanges}\n$3`
      ) || currentBody.replace(
        /## Changes\s*\n<!-- PR summaries will be added automatically by Chroniclr -->/,
        `## Changes\n${updatedChanges}`
      );

      await this.github.rest.issues.update({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        issue_number: releaseIssue.number,
        body: updatedBody
      });

      core.info(`Updated release issue #${releaseIssue.number} with PR #${prSummary.prNumber}`);

    } catch (error) {
      core.error(`Failed to update release issue: ${error.message}`);
    }
  }

  /**
   * Process merged PR for release documentation
   */
  async processMergedPR(prNumber = null) {
    if (!this.isEnabled()) {
      core.info('PR integration disabled, skipping processing');
      return null;
    }

    try {
      core.info('Processing merged PR for release documentation...');

      // Get comprehensive PR data
      const prData = await this.getPullRequestData(prNumber);
      
      if (!prData.pr.merged) {
        core.warning('PR is not merged, skipping release documentation');
        return null;
      }

      // Generate AI-powered summary
      const summaryFormat = this.getModuleConfig('releaseManagement').changelogFormat || 'compact';
      const prSummary = await this.generatePRSummary(prData, summaryFormat === 'compact' ? 'release' : 'detailed');

      // Find/create release issue and update it
      if (this.isModuleEnabled('releaseManagement') && this.getModuleConfig('releaseManagement').autoUpdateIssues) {
        const releaseIssue = await this.findOrCreateReleaseIssue(prData.pr.milestone);
        if (releaseIssue) {
          await this.updateReleaseIssue(releaseIssue, prSummary);
        }
      }

      core.info(`Successfully processed PR #${prData.pr.number} for release documentation`);
      
      return {
        prData,
        prSummary,
        success: true
      };

    } catch (error) {
      core.error(`Failed to process merged PR: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = { PullRequestClient };