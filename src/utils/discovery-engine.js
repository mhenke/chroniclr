#!/usr/bin/env node

/**
 * Enhanced Discovery Engine for Chroniclr
 * Provides intelligent discovery and correlation across existing sources:
 * - GitHub Discussions
 * - GitHub Issues  
 * - GitHub Pull Requests
 * - Jira Issues
 */

const core = require('@actions/core');
const { queueGitHubRequest } = require('./rate-limiter');
const { PullRequestClient } = require('./pr-client');

class DiscoveryEngine {
  constructor(github, options = {}) {
    this.github = github;
    this.context = options.context || {};
    this.config = {
      maxDiscoveries: parseInt(process.env.MAX_DISCOVERIES) || 20,
      discoveryScope: process.env.DISCOVERY_SCOPE || 'recent',
      confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.6,
      enableSemanticLinking: true,
      ...options
    };
    
    this.prClient = new PullRequestClient();
    this.discoveryResults = new Map();
  }

  /**
   * Main discovery orchestrator - finds related content across all sources
   */
  async discoverRelatedContent(seedData) {
    core.info('🔍 Starting comprehensive discovery across all sources...');
    
    const discoveries = {
      discussions: [],
      issues: [],
      pullRequests: [], 
      jiraIssues: [],
      correlations: [],
      summary: {}
    };

    // Extract seed identifiers and keywords
    const seedInfo = this.extractSeedInformation(seedData);
    core.info(`🌱 Seed information: ${JSON.stringify(seedInfo, null, 2)}`);

    try {
      // Phase 1: Direct identifier discovery
      if (seedInfo.identifiers.length > 0) {
        await this.discoverByIdentifiers(seedInfo.identifiers, discoveries);
      }

      // Phase 2: Keyword and semantic discovery
      if (seedInfo.keywords.length > 0) {
        await this.discoverByKeywords(seedInfo.keywords, discoveries);
      }

      // Phase 3: Cross-reference discovery (find items that reference discovered items)
      await this.discoverCrossReferences(discoveries);

      // Phase 4: Semantic correlation and linking
      if (this.config.enableSemanticLinking) {
        await this.performSemanticCorrelation(discoveries);
      }

      // Phase 5: Generate discovery summary
      discoveries.summary = this.generateDiscoverySummary(discoveries);

      core.info(`✅ Discovery complete: ${discoveries.summary.totalItems} items found`);
      return discoveries;

    } catch (error) {
      core.error(`❌ Discovery failed: ${error.message}`);
      return discoveries; // Return partial results
    }
  }

  /**
   * Extract seed information from various input types
   */
  extractSeedInformation(seedData) {
    const seedInfo = {
      identifiers: [],
      keywords: [],
      titles: [],
      authors: [],
      dates: []
    };

    // Discussion seed data
    if (seedData.discussionNumber) {
      seedInfo.identifiers.push(`discussion-${seedData.discussionNumber}`);
    }
    if (seedData.discussionTitle) {
      seedInfo.titles.push(seedData.discussionTitle);
      seedInfo.keywords.push(...this.extractKeywords(seedData.discussionTitle));
    }
    if (seedData.discussionAuthor) {
      seedInfo.authors.push(seedData.discussionAuthor);
    }

    // PR seed data
    if (seedData.prNumbers) {
      const prNums = seedData.prNumbers.split(',').map(n => n.trim());
      seedInfo.identifiers.push(...prNums.map(n => `pr-${n}`));
    }

    // Jira seed data
    if (seedData.jiraKeys) {
      const jiraKeys = seedData.jiraKeys.split(',').map(k => k.trim());
      seedInfo.identifiers.push(...jiraKeys);
      // Extract project codes for keyword searching
      jiraKeys.forEach(key => {
        const projectCode = key.split('-')[0];
        if (projectCode) {
          seedInfo.keywords.push(projectCode.toLowerCase());
        }
      });
    }

    // Issues seed data  
    if (seedData.issueNumbers) {
      const issueNums = seedData.issueNumbers.split(',').map(n => n.trim());
      seedInfo.identifiers.push(...issueNums.map(n => `issue-${n}`));
    }

    return seedInfo;
  }

  /**
   * Discover content by direct identifier matching
   */
  async discoverByIdentifiers(identifiers, discoveries) {
    core.info(`🎯 Phase 1: Direct identifier discovery (${identifiers.length} identifiers)`);

    for (const identifier of identifiers) {
      try {
        if (identifier.startsWith('discussion-')) {
          const num = identifier.replace('discussion-', '');
          await this.discoverDiscussionById(num, discoveries);
        } else if (identifier.startsWith('pr-')) {
          const num = identifier.replace('pr-', '');
          await this.discoverPullRequestById(num, discoveries);
        } else if (identifier.startsWith('issue-')) {
          const num = identifier.replace('issue-', '');
          await this.discoverIssueById(num, discoveries);
        } else if (identifier.match(/^[A-Z]+-\d+$/)) {
          // Jira key format
          await this.discoverByJiraKey(identifier, discoveries);
        }
      } catch (error) {
        core.warning(`Failed to discover by identifier ${identifier}: ${error.message}`);
      }
    }
  }

  /**
   * Discover content by keyword and semantic matching
   */
  async discoverByKeywords(keywords, discoveries) {
    core.info(`🔍 Phase 2: Keyword discovery (${keywords.length} keywords)`);

    const searchTerms = keywords.slice(0, 5); // Limit to prevent API exhaustion
    
    for (const keyword of searchTerms) {
      try {
        // Search discussions
        await this.searchDiscussions(keyword, discoveries);
        
        // Search issues
        await this.searchIssues(keyword, discoveries);
        
        // Search PRs (using existing PR client)
        await this.searchPullRequests(keyword, discoveries);
        
        // Early exit if we have enough discoveries
        const totalFound = discoveries.discussions.length + 
                          discoveries.issues.length + 
                          discoveries.pullRequests.length;
        
        if (totalFound >= this.config.maxDiscoveries) {
          core.info(`⚠️ Reached discovery limit (${this.config.maxDiscoveries}), stopping keyword search`);
          break;
        }
        
      } catch (error) {
        core.warning(`Failed keyword discovery for "${keyword}": ${error.message}`);
      }
    }
  }

  /**
   * Discover cross-references between found items
   */
  async discoverCrossReferences(discoveries) {
    core.info('🔗 Phase 3: Cross-reference discovery');

    const allItems = [
      ...discoveries.discussions.map(d => ({ type: 'discussion', ...d })),
      ...discoveries.issues.map(i => ({ type: 'issue', ...i })),
      ...discoveries.pullRequests.map(p => ({ type: 'pr', ...p }))
    ];

    for (const item of allItems) {
      try {
        // Look for references to this item in other content
        await this.findReferencesToItem(item, discoveries);
      } catch (error) {
        core.warning(`Failed cross-reference discovery for ${item.type} ${item.number}: ${error.message}`);
      }
    }
  }

  /**
   * Search GitHub Discussions
   */
  async searchDiscussions(keyword, discoveries) {
    const searchQuery = `repo:${this.context.repo?.owner}/${this.context.repo?.repo} ${keyword} in:title,body type:discussion`;
    
    try {
      const results = await queueGitHubRequest(
        () => this.github.rest.search.issuesAndPullRequests({
          q: this.applyDateFilters(searchQuery),
          sort: 'updated',
          order: 'desc',
          per_page: 10
        }),
        'search',
        'normal'
      );

      for (const item of results.data.items) {
        if (!item.pull_request && this.isDiscussion(item)) {
          const confidence = this.calculateContentConfidence(keyword, item.title, item.body);
          if (confidence >= this.config.confidenceThreshold) {
            discoveries.discussions.push({
              number: item.number,
              title: item.title,
              author: item.user.login,
              url: item.html_url,
              confidence,
              discoveryMethod: 'keyword-search',
              keyword
            });
          }
        }
      }
    } catch (error) {
      core.warning(`Discussion search failed for "${keyword}": ${error.message}`);
    }
  }

  /**
   * Search GitHub Issues
   */
  async searchIssues(keyword, discoveries) {
    const searchQuery = `repo:${this.context.repo?.owner}/${this.context.repo?.repo} ${keyword} in:title,body,comments type:issue`;
    
    try {
      const results = await queueGitHubRequest(
        () => this.github.rest.search.issuesAndPullRequests({
          q: this.applyDateFilters(searchQuery),
          sort: 'updated', 
          order: 'desc',
          per_page: 10
        }),
        'search',
        'normal'
      );

      for (const item of results.data.items) {
        if (!item.pull_request) {
          const confidence = this.calculateContentConfidence(keyword, item.title, item.body);
          if (confidence >= this.config.confidenceThreshold) {
            discoveries.issues.push({
              number: item.number,
              title: item.title,
              author: item.user.login,
              state: item.state,
              labels: item.labels.map(l => l.name),
              url: item.html_url,
              confidence,
              discoveryMethod: 'keyword-search',
              keyword
            });
          }
        }
      }
    } catch (error) {
      core.warning(`Issue search failed for "${keyword}": ${error.message}`);
    }
  }

  /**
   * Search Pull Requests using existing PR client
   */
  async searchPullRequests(keyword, discoveries) {
    try {
      // Use the existing PR client's search capabilities
      const prNumbers = await this.prClient.findPRsFromJiraKeys([keyword]);
      
      for (const prNumber of prNumbers) {
        try {
          const prData = await this.discoverPullRequestById(prNumber, discoveries);
          if (prData) {
            prData.discoveryMethod = 'keyword-search';
            prData.keyword = keyword;
          }
        } catch (error) {
          core.warning(`Failed to get PR details for #${prNumber}: ${error.message}`);
        }
      }
    } catch (error) {
      core.warning(`PR search failed for "${keyword}": ${error.message}`);
    }
  }

  /**
   * Discover specific Discussion by ID
   */
  async discoverDiscussionById(discussionNumber, discoveries) {
    try {
      const discussion = await queueGitHubRequest(
        () => this.github.rest.teams.getDiscussionInOrg({
          org: this.context.repo?.owner,
          team_slug: this.context.repo?.repo,
          discussion_number: parseInt(discussionNumber)
        }),
        'primary',
        'normal'
      );

      discoveries.discussions.push({
        number: discussion.data.number,
        title: discussion.data.title,
        author: discussion.data.author.login,
        url: discussion.data.html_url,
        confidence: 1.0,
        discoveryMethod: 'direct-id'
      });

      return discussion.data;
    } catch (error) {
      core.warning(`Failed to fetch discussion #${discussionNumber}: ${error.message}`);
      return null;
    }
  }

  /**
   * Discover specific Issue by ID
   */
  async discoverIssueById(issueNumber, discoveries) {
    try {
      const issue = await queueGitHubRequest(
        () => this.github.rest.issues.get({
          owner: this.context.repo?.owner,
          repo: this.context.repo?.repo,
          issue_number: parseInt(issueNumber)
        }),
        'primary',
        'normal'
      );

      if (!issue.data.pull_request) {
        discoveries.issues.push({
          number: issue.data.number,
          title: issue.data.title,
          author: issue.data.user.login,
          state: issue.data.state,
          labels: issue.data.labels.map(l => l.name),
          url: issue.data.html_url,
          confidence: 1.0,
          discoveryMethod: 'direct-id'
        });

        return issue.data;
      }
    } catch (error) {
      core.warning(`Failed to fetch issue #${issueNumber}: ${error.message}`);
      return null;
    }
  }

  /**
   * Discover specific Pull Request by ID
   */
  async discoverPullRequestById(prNumber, discoveries) {
    try {
      const pr = await queueGitHubRequest(
        () => this.github.rest.pulls.get({
          owner: this.context.repo?.owner,
          repo: this.context.repo?.repo,
          pull_number: parseInt(prNumber)
        }),
        'primary',
        'normal'
      );

      const prData = {
        number: pr.data.number,
        title: pr.data.title,
        author: pr.data.user.login,
        state: pr.data.state,
        url: pr.data.html_url,
        confidence: 1.0,
        discoveryMethod: 'direct-id'
      };

      discoveries.pullRequests.push(prData);
      return prData;
    } catch (error) {
      core.warning(`Failed to fetch PR #${prNumber}: ${error.message}`);
      return null;
    }
  }

  /**
   * Discover content by Jira key using existing PR client
   */
  async discoverByJiraKey(jiraKey, discoveries) {
    try {
      // Use existing PR client Jira discovery
      const prNumbers = await this.prClient.findPRsFromJiraKeys([jiraKey]);
      
      for (const prNumber of prNumbers) {
        await this.discoverPullRequestById(prNumber, discoveries);
      }

      // Also search for the Jira key in discussions and issues
      await this.searchDiscussions(jiraKey, discoveries);
      await this.searchIssues(jiraKey, discoveries);

      // Add to Jira discoveries
      discoveries.jiraIssues.push({
        key: jiraKey,
        linkedPRs: prNumbers,
        discoveryMethod: 'jira-key-search'
      });

    } catch (error) {
      core.warning(`Failed Jira key discovery for ${jiraKey}: ${error.message}`);
    }
  }

  /**
   * Find references to a specific item in other content
   */
  async findReferencesToItem(item, discoveries) {
    const searchTerms = [
      `#${item.number}`, // GitHub-style reference
      item.title.split(' ').slice(0, 3).join(' ') // First few words of title
    ];

    for (const term of searchTerms) {
      try {
        // Search for references in other types
        if (item.type !== 'discussion') {
          await this.searchDiscussions(term, discoveries);
        }
        if (item.type !== 'issue') {
          await this.searchIssues(term, discoveries);
        }
        if (item.type !== 'pr') {
          await this.searchPullRequests(term, discoveries);
        }
      } catch (error) {
        core.warning(`Cross-reference search failed for "${term}": ${error.message}`);
      }
    }
  }

  /**
   * Perform semantic correlation between discovered items
   */
  async performSemanticCorrelation(discoveries) {
    core.info('🧠 Phase 4: Semantic correlation');

    const correlations = [];
    const allItems = [
      ...discoveries.discussions.map(d => ({ ...d, type: 'discussion' })),
      ...discoveries.issues.map(i => ({ ...i, type: 'issue' })),
      ...discoveries.pullRequests.map(p => ({ ...p, type: 'pr' }))
    ];

    // Find semantic relationships
    for (let i = 0; i < allItems.length; i++) {
      for (let j = i + 1; j < allItems.length; j++) {
        const item1 = allItems[i];
        const item2 = allItems[j];
        
        const similarity = this.calculateSemanticSimilarity(item1, item2);
        
        if (similarity > 0.7) {
          correlations.push({
            item1: { type: item1.type, number: item1.number, title: item1.title },
            item2: { type: item2.type, number: item2.number, title: item2.title },
            similarity,
            relationshipType: this.determineRelationshipType(item1, item2),
            confidence: similarity
          });
        }
      }
    }

    discoveries.correlations = correlations;
    core.info(`🔗 Found ${correlations.length} semantic correlations`);
  }

  /**
   * Generate comprehensive discovery summary
   */
  generateDiscoverySummary(discoveries) {
    const summary = {
      totalItems: discoveries.discussions.length + discoveries.issues.length + 
                 discoveries.pullRequests.length + discoveries.jiraIssues.length,
      breakdown: {
        discussions: discoveries.discussions.length,
        issues: discoveries.issues.length,
        pullRequests: discoveries.pullRequests.length,
        jiraIssues: discoveries.jiraIssues.length,
        correlations: discoveries.correlations.length
      },
      confidenceDistribution: {
        high: 0,
        medium: 0,
        low: 0
      },
      discoveryMethods: {},
      topAuthors: {},
      timespan: this.calculateTimespan(discoveries)
    };

    // Analyze all discovered items
    const allItems = [
      ...discoveries.discussions,
      ...discoveries.issues,
      ...discoveries.pullRequests
    ];

    allItems.forEach(item => {
      // Confidence distribution
      if (item.confidence >= 0.8) summary.confidenceDistribution.high++;
      else if (item.confidence >= 0.6) summary.confidenceDistribution.medium++;
      else summary.confidenceDistribution.low++;

      // Discovery methods
      summary.discoveryMethods[item.discoveryMethod] = 
        (summary.discoveryMethods[item.discoveryMethod] || 0) + 1;

      // Top authors
      if (item.author) {
        summary.topAuthors[item.author] = (summary.topAuthors[item.author] || 0) + 1;
      }
    });

    return summary;
  }

  /**
   * Helper methods
   */
  extractKeywords(text) {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);

    // Common technical keywords that are useful for discovery
    const technicalKeywords = [
      'api', 'auth', 'security', 'mobile', 'web', 'database', 'ui', 'ux',
      'bug', 'feature', 'fix', 'update', 'upgrade', 'migration', 'deploy',
      'test', 'performance', 'optimization', 'refactor', 'integration'
    ];

    return words.filter(word => 
      technicalKeywords.includes(word) || 
      word.match(/^[a-z]{4,}$/) // 4+ letter words
    ).slice(0, 10); // Limit keywords
  }

  calculateContentConfidence(keyword, title, body) {
    const titleLower = (title || '').toLowerCase();
    const bodyLower = (body || '').toLowerCase();
    const keywordLower = keyword.toLowerCase();

    let confidence = 0.3; // Base confidence

    if (titleLower.includes(keywordLower)) {
      confidence = 0.9;
    } else if (bodyLower.includes(keywordLower)) {
      confidence = 0.7;
    }

    return confidence;
  }

  calculateSemanticSimilarity(item1, item2) {
    // Simple similarity calculation based on title words
    const words1 = new Set((item1.title || '').toLowerCase().split(/\s+/));
    const words2 = new Set((item2.title || '').toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  determineRelationshipType(item1, item2) {
    if (item1.author === item2.author) return 'same-author';
    if (item1.type === 'issue' && item2.type === 'pr') return 'issue-pr-link';
    if (item1.type === 'discussion' && item2.type === 'issue') return 'discussion-issue-link';
    return 'semantic-similarity';
  }

  isDiscussion(item) {
    // Simple heuristic to identify discussions vs issues
    return item.comments_url && !item.assignee;
  }

  applyDateFilters(query) {
    if (this.config.discoveryScope === 'recent') {
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];
      return `${query} updated:>=${twoWeeksAgo}`;
    }
    return query;
  }

  calculateTimespan(discoveries) {
    // This would analyze the creation dates of discovered items
    // Simplified for now
    return {
      earliest: 'N/A',
      latest: 'N/A',
      span: 'N/A'
    };
  }
}

module.exports = { DiscoveryEngine };

// CLI support for testing
if (require.main === module) {
  const { github } = require('@actions/github');
  
  async function testDiscovery() {
    const octokit = github.getOctokit(process.env.GITHUB_TOKEN);
    const engine = new DiscoveryEngine(octokit, {
      context: {
        repo: {
          owner: 'test-owner',
          repo: 'test-repo'
        }
      }
    });

    const seedData = {
      discussionTitle: 'User Authentication Improvements',
      jiraKeys: 'AUTH-123',
      prNumbers: '456'
    };

    const results = await engine.discoverRelatedContent(seedData);
    console.log('🔍 Discovery Results:');
    console.log(JSON.stringify(results.summary, null, 2));
  }

  if (process.argv[2] === 'test') {
    testDiscovery().catch(console.error);
  }
}