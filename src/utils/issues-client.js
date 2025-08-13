#!/usr/bin/env node

/**
 * GitHub Issues Client for Chroniclr
 * Handles GitHub Issues discovery, analysis, and correlation with other sources
 */

const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');
const path = require('path');
const { queueGitHubRequest } = require('./rate-limiter');

class IssuesClient {
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
      return config.issues || { enabled: false, modules: {} };
    } catch (error) {
      core.warning(`Failed to load Issues configuration: ${error.message}`);
      return { enabled: false, modules: {} };
    }
  }

  isEnabled() {
    return this.config.enabled;
  }

  isModuleEnabled(moduleName) {
    return this.config.modules?.[moduleName]?.enabled || false;
  }

  /**
   * Discover issues using multiple strategies
   */
  async discoverIssues(searchCriteria) {
    const discoveredIssues = new Map();
    const maxDiscoveries = parseInt(process.env.MAX_DISCOVERIES) || 20;
    const discoveryScope = process.env.DISCOVERY_SCOPE || 'recent';
    
    core.info(`🔍 Starting GitHub Issues discovery`);
    core.info(`📊 Scope: ${discoveryScope}, Max discoveries: ${maxDiscoveries}`);

    try {
      // Strategy 1: Direct issue number discovery
      if (searchCriteria.issueNumbers) {
        await this.discoverByIssueNumbers(searchCriteria.issueNumbers, discoveredIssues);
      }

      // Strategy 2: Keyword-based discovery
      if (searchCriteria.keywords) {
        await this.discoverByKeywords(searchCriteria.keywords, discoveredIssues, discoveryScope);
      }

      // Strategy 3: Label-based discovery
      if (searchCriteria.labels) {
        await this.discoverByLabels(searchCriteria.labels, discoveredIssues, discoveryScope);
      }

      // Strategy 4: Milestone-based discovery
      if (searchCriteria.milestones) {
        await this.discoverByMilestones(searchCriteria.milestones, discoveredIssues, discoveryScope);
      }

      // Strategy 5: Author-based discovery
      if (searchCriteria.authors) {
        await this.discoverByAuthors(searchCriteria.authors, discoveredIssues, discoveryScope);
      }

      // Strategy 6: Cross-reference discovery (find issues that reference other items)
      if (searchCriteria.crossReferences) {
        await this.discoverByCrossReferences(searchCriteria.crossReferences, discoveredIssues);
      }

      // Strategy 7: Related issues discovery (linked/referenced issues)
      await this.discoverRelatedIssues(discoveredIssues);

      // Sort by confidence and apply limits
      const sortedIssues = Array.from(discoveredIssues.values())
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, maxDiscoveries);

      this.logDiscoverySummary(sortedIssues, searchCriteria);
      return sortedIssues.map(issue => issue.number);

    } catch (error) {
      core.error(`❌ Issues discovery failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Discover issues by direct issue numbers
   */
  async discoverByIssueNumbers(issueNumbers, discoveredIssues) {
    const numbers = typeof issueNumbers === 'string' ? 
      issueNumbers.split(',').map(n => parseInt(n.trim())) : issueNumbers;

    core.info(`🎯 Discovering issues by numbers: ${numbers.join(', ')}`);

    for (const issueNumber of numbers) {
      try {
        const issue = await queueGitHubRequest(
          () => this.github.rest.issues.get({
            owner: this.context.repo.owner,
            repo: this.context.repo.repo,
            issue_number: issueNumber
          }),
          'primary',
          'high'
        );

        if (!issue.data.pull_request) { // Ensure it's an issue, not a PR
          this.addDiscoveredIssue(discoveredIssues, issue.data, {
            confidence: 1.0,
            discoveryMethod: 'direct-number',
            source: 'manual'
          });
        }
      } catch (error) {
        core.warning(`Failed to fetch issue #${issueNumber}: ${error.message}`);
      }
    }
  }

  /**
   * Discover issues by keyword search
   */
  async discoverByKeywords(keywords, discoveredIssues, scope) {
    const keywordList = typeof keywords === 'string' ? 
      keywords.split(',').map(k => k.trim()) : keywords;

    core.info(`🔍 Keyword-based discovery: ${keywordList.join(', ')}`);

    for (const keyword of keywordList) {
      try {
        let searchQuery = `repo:${this.context.repo.owner}/${this.context.repo.repo} ${keyword} type:issue`;
        
        // Apply scope filters
        searchQuery = this.applyScopeFilters(searchQuery, scope);

        const results = await queueGitHubRequest(
          () => this.github.rest.search.issuesAndPullRequests({
            q: searchQuery,
            sort: 'updated',
            order: 'desc',
            per_page: 15
          }),
          'search',
          'normal'
        );

        for (const item of results.data.items) {
          if (!item.pull_request) {
            const confidence = this.calculateKeywordConfidence(keyword, item);
            this.addDiscoveredIssue(discoveredIssues, item, {
              confidence,
              discoveryMethod: 'keyword-search',
              source: keyword,
              searchTerm: keyword
            });
          }
        }

        core.info(`  └─ Found ${results.data.items.filter(i => !i.pull_request).length} issues for "${keyword}"`);
      } catch (error) {
        core.warning(`Keyword search failed for "${keyword}": ${error.message}`);
      }
    }
  }

  /**
   * Discover issues by labels
   */
  async discoverByLabels(labels, discoveredIssues, scope) {
    const labelList = typeof labels === 'string' ? 
      labels.split(',').map(l => l.trim()) : labels;

    core.info(`🏷️ Label-based discovery: ${labelList.join(', ')}`);

    for (const label of labelList) {
      try {
        let searchQuery = `repo:${this.context.repo.owner}/${this.context.repo.repo} label:"${label}" type:issue`;
        searchQuery = this.applyScopeFilters(searchQuery, scope);

        const results = await queueGitHubRequest(
          () => this.github.rest.search.issuesAndPullRequests({
            q: searchQuery,
            sort: 'updated',
            order: 'desc',
            per_page: 10
          }),
          'search',
          'normal'
        );

        for (const item of results.data.items) {
          if (!item.pull_request) {
            this.addDiscoveredIssue(discoveredIssues, item, {
              confidence: 0.85, // High confidence for label matches
              discoveryMethod: 'label-search',
              source: label,
              matchedLabel: label
            });
          }
        }

        core.info(`  └─ Found ${results.data.items.filter(i => !i.pull_request).length} issues with label "${label}"`);
      } catch (error) {
        core.warning(`Label search failed for "${label}": ${error.message}`);
      }
    }
  }

  /**
   * Discover issues by milestones
   */
  async discoverByMilestones(milestones, discoveredIssues, scope) {
    const milestoneList = typeof milestones === 'string' ? 
      milestones.split(',').map(m => m.trim()) : milestones;

    core.info(`🎯 Milestone-based discovery: ${milestoneList.join(', ')}`);

    for (const milestone of milestoneList) {
      try {
        let searchQuery = `repo:${this.context.repo.owner}/${this.context.repo.repo} milestone:"${milestone}" type:issue`;
        searchQuery = this.applyScopeFilters(searchQuery, scope);

        const results = await queueGitHubRequest(
          () => this.github.rest.search.issuesAndPullRequests({
            q: searchQuery,
            sort: 'updated',
            order: 'desc',
            per_page: 10
          }),
          'search',
          'normal'
        );

        for (const item of results.data.items) {
          if (!item.pull_request) {
            this.addDiscoveredIssue(discoveredIssues, item, {
              confidence: 0.9, // High confidence for milestone matches
              discoveryMethod: 'milestone-search',
              source: milestone,
              milestone
            });
          }
        }

        core.info(`  └─ Found ${results.data.items.filter(i => !i.pull_request).length} issues in milestone "${milestone}"`);
      } catch (error) {
        core.warning(`Milestone search failed for "${milestone}": ${error.message}`);
      }
    }
  }

  /**
   * Discover issues by authors
   */
  async discoverByAuthors(authors, discoveredIssues, scope) {
    const authorList = typeof authors === 'string' ? 
      authors.split(',').map(a => a.trim()) : authors;

    core.info(`👤 Author-based discovery: ${authorList.join(', ')}`);

    for (const author of authorList) {
      try {
        let searchQuery = `repo:${this.context.repo.owner}/${this.context.repo.repo} author:${author} type:issue`;
        searchQuery = this.applyScopeFilters(searchQuery, scope);

        const results = await queueGitHubRequest(
          () => this.github.rest.search.issuesAndPullRequests({
            q: searchQuery,
            sort: 'updated',
            order: 'desc',
            per_page: 8
          }),
          'search',
          'normal'
        );

        for (const item of results.data.items) {
          if (!item.pull_request) {
            this.addDiscoveredIssue(discoveredIssues, item, {
              confidence: 0.75, // Medium-high confidence for author matches
              discoveryMethod: 'author-search',
              source: author,
              author
            });
          }
        }

        core.info(`  └─ Found ${results.data.items.filter(i => !i.pull_request).length} issues by "${author}"`);
      } catch (error) {
        core.warning(`Author search failed for "${author}": ${error.message}`);
      }
    }
  }

  /**
   * Discover issues by cross-references (issues that mention other items)
   */
  async discoverByCrossReferences(crossReferences, discoveredIssues) {
    core.info(`🔗 Cross-reference discovery`);

    for (const ref of crossReferences) {
      try {
        // Search for issues that mention this reference
        const searchTerms = [
          `#${ref.number}`, // GitHub reference
          ref.title ? ref.title.split(' ').slice(0, 3).join(' ') : null // Title keywords
        ].filter(Boolean);

        for (const term of searchTerms) {
          let searchQuery = `repo:${this.context.repo.owner}/${this.context.repo.repo} "${term}" type:issue`;
          
          const results = await queueGitHubRequest(
            () => this.github.rest.search.issuesAndPullRequests({
              q: searchQuery,
              sort: 'updated',
              order: 'desc',
              per_page: 5
            }),
            'search',
            'normal'
          );

          for (const item of results.data.items) {
            if (!item.pull_request && item.number !== ref.number) {
              this.addDiscoveredIssue(discoveredIssues, item, {
                confidence: 0.7,
                discoveryMethod: 'cross-reference',
                source: `${ref.type}-${ref.number}`,
                referencedItem: ref
              });
            }
          }
        }
      } catch (error) {
        core.warning(`Cross-reference search failed for ${ref.type} #${ref.number}: ${error.message}`);
      }
    }
  }

  /**
   * Discover related issues (issues that reference discovered issues)
   */
  async discoverRelatedIssues(discoveredIssues) {
    core.info(`🔗 Related issues discovery`);

    const currentIssues = Array.from(discoveredIssues.values());
    
    for (const issue of currentIssues) {
      try {
        // Look for issues that reference this issue
        let searchQuery = `repo:${this.context.repo.owner}/${this.context.repo.repo} "#${issue.number}" type:issue`;
        
        const results = await queueGitHubRequest(
          () => this.github.rest.search.issuesAndPullRequests({
            q: searchQuery,
            sort: 'updated',
            order: 'desc',
            per_page: 3
          }),
          'search',
          'normal'
        );

        for (const item of results.data.items) {
          if (!item.pull_request && item.number !== issue.number) {
            this.addDiscoveredIssue(discoveredIssues, item, {
              confidence: 0.65,
              discoveryMethod: 'related-issue',
              source: `issue-${issue.number}`,
              relatedTo: issue.number
            });
          }
        }
      } catch (error) {
        core.warning(`Related issues search failed for #${issue.number}: ${error.message}`);
      }
    }
  }

  /**
   * Add a discovered issue with intelligent deduplication
   */
  addDiscoveredIssue(discoveredIssues, issueData, metadata) {
    const issueNumber = issueData.number;
    
    if (discoveredIssues.has(issueNumber)) {
      // Merge with existing entry, keeping highest confidence
      const existing = discoveredIssues.get(issueNumber);
      existing.confidence = Math.max(existing.confidence, metadata.confidence);
      existing.discoveryMethods = [...new Set([...existing.discoveryMethods, metadata.discoveryMethod])];
      existing.sources = [...new Set([...existing.sources, metadata.source])];
    } else {
      discoveredIssues.set(issueNumber, {
        number: issueNumber,
        title: issueData.title,
        state: issueData.state,
        author: issueData.user.login,
        labels: issueData.labels.map(l => l.name),
        milestone: issueData.milestone?.title,
        assignees: issueData.assignees.map(a => a.login),
        url: issueData.html_url,
        createdAt: issueData.created_at,
        updatedAt: issueData.updated_at,
        confidence: metadata.confidence,
        discoveryMethods: [metadata.discoveryMethod],
        sources: [metadata.source],
        metadata
      });
    }
  }

  /**
   * Calculate confidence score for keyword matches
   */
  calculateKeywordConfidence(keyword, issue) {
    const titleLower = (issue.title || '').toLowerCase();
    const bodyLower = (issue.body || '').toLowerCase();
    const keywordLower = keyword.toLowerCase();
    
    let confidence = 0.3; // Base confidence
    
    // Title matches get highest confidence
    if (titleLower.includes(keywordLower)) {
      confidence = 0.9;
    }
    // Body matches get medium confidence
    else if (bodyLower.includes(keywordLower)) {
      confidence = 0.7;
    }
    
    // Boost confidence for label matches
    if (issue.labels && issue.labels.some(l => l.name.toLowerCase().includes(keywordLower))) {
      confidence = Math.min(confidence + 0.2, 1.0);
    }
    
    return confidence;
  }

  /**
   * Apply scope-based filters to search queries
   */
  applyScopeFilters(query, scope) {
    switch (scope) {
      case 'recent':
        const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        return `${query} updated:>=${twoWeeksAgo}`;
      case 'sprint':
        const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        return `${query} updated:>=${twoMonthsAgo}`;
      case 'milestone':
        // This would need milestone-specific logic
        return query;
      case 'all':
      default:
        return query;
    }
  }

  /**
   * Log comprehensive discovery summary
   */
  logDiscoverySummary(discoveredIssues, searchCriteria) {
    core.info(`\n📋 Issues Discovery Summary:`);
    core.info(`✅ Found: ${discoveredIssues.length} unique issues`);
    
    if (discoveredIssues.length > 0) {
      // Group by discovery method
      const methodStats = {};
      const stateStats = { open: 0, closed: 0 };
      const confidenceStats = { high: 0, medium: 0, low: 0 };
      
      discoveredIssues.forEach(issue => {
        // Method stats
        issue.discoveryMethods.forEach(method => {
          methodStats[method] = (methodStats[method] || 0) + 1;
        });
        
        // State stats
        stateStats[issue.state] = (stateStats[issue.state] || 0) + 1;
        
        // Confidence stats
        if (issue.confidence >= 0.8) confidenceStats.high++;
        else if (issue.confidence >= 0.6) confidenceStats.medium++;
        else confidenceStats.low++;
      });
      
      core.info(`\n📊 Discovery Methods:`);
      Object.entries(methodStats).forEach(([method, count]) => {
        core.info(`  • ${method}: ${count} issues`);
      });
      
      core.info(`\n📊 Issue States:`);
      core.info(`  • Open: ${stateStats.open}`);
      core.info(`  • Closed: ${stateStats.closed}`);
      
      core.info(`\n🎯 Confidence Distribution:`);
      core.info(`  • High (80%+): ${confidenceStats.high}`);
      core.info(`  • Medium (60-79%): ${confidenceStats.medium}`);
      core.info(`  • Low (<60%): ${confidenceStats.low}`);
      
      core.info(`\n📋 Top Issues by Confidence:`);
      discoveredIssues.slice(0, 5).forEach(issue => {
        const confidenceLevel = issue.confidence >= 0.8 ? 'HIGH' : issue.confidence >= 0.6 ? 'MED' : 'LOW';
        core.info(`  • #${issue.number}: ${issue.title.substring(0, 50)}... (${confidenceLevel})`);
        core.info(`    Methods: ${issue.discoveryMethods.join(', ')}, Confidence: ${(issue.confidence * 100).toFixed(0)}%`);
      });
    }
  }

  /**
   * Get detailed issue information including comments and events
   */
  async getDetailedIssueInfo(issueNumber) {
    try {
      const [issue, comments, timeline] = await Promise.all([
        queueGitHubRequest(
          () => this.github.rest.issues.get({
            owner: this.context.repo.owner,
            repo: this.context.repo.repo,
            issue_number: issueNumber
          }),
          'primary',
          'normal'
        ),
        queueGitHubRequest(
          () => this.github.rest.issues.listComments({
            owner: this.context.repo.owner,
            repo: this.context.repo.repo,
            issue_number: issueNumber
          }),
          'primary',
          'normal'
        ),
        queueGitHubRequest(
          () => this.github.rest.issues.listEventsForTimeline({
            owner: this.context.repo.owner,
            repo: this.context.repo.repo,
            issue_number: issueNumber
          }),
          'primary',
          'normal'
        )
      ]);

      return {
        issue: issue.data,
        comments: comments.data,
        timeline: timeline.data
      };
    } catch (error) {
      core.warning(`Failed to get detailed info for issue #${issueNumber}: ${error.message}`);
      return null;
    }
  }
}

module.exports = { IssuesClient };

// CLI support for testing
if (require.main === module) {
  async function testIssuesDiscovery() {
    const issuesClient = new IssuesClient();
    
    const searchCriteria = {
      keywords: ['bug', 'feature'],
      labels: ['enhancement'],
      authors: ['dependabot']
    };

    const results = await issuesClient.discoverIssues(searchCriteria);
    console.log('🔍 Issues Discovery Results:', results);
  }

  if (process.argv[2] === 'test') {
    testIssuesDiscovery().catch(console.error);
  }
}