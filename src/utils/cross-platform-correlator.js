#!/usr/bin/env node

/**
 * Cross-Platform Intelligence Correlator for Chroniclr
 * Links GitHub Discussions, Jira Issues, and Pull Requests intelligently
 */

const core = require('@actions/core');
const fs = require('fs');
const path = require('path');

class CrossPlatformCorrelator {
  constructor() {
    this.config = this.loadConfiguration();
  }

  loadConfiguration() {
    try {
      const configPath = path.join(process.cwd(), 'chroniclr.config.json');
      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData);
      return {
        pullRequests: config.pullRequests || { enabled: false, modules: {} },
        jira: config.jira || { enabled: false },
        correlation: config.correlation || { enabled: false }
      };
    } catch (error) {
      core.warning(`Failed to load correlation configuration: ${error.message}`);
      return { pullRequests: { enabled: false }, jira: { enabled: false }, correlation: { enabled: false } };
    }
  }

  isEnabled() {
    return this.config.correlation?.enabled || false;
  }

  isModuleEnabled(module, submodule) {
    return this.config[module]?.modules?.[submodule]?.enabled || false;
  }

  /**
   * Extract all cross-references from various content sources
   */
  extractCrossReferences(content, type = 'discussion') {
    const references = {
      jiraIssues: [],
      githubIssues: [],
      pullRequests: [],
      discussions: [],
      commits: []
    };

    if (!content || typeof content !== 'string') {
      return references;
    }

    // Jira issue pattern: PROJ-123, ABC-456, etc.
    const jiraPattern = /[A-Z]+-\d+/g;
    references.jiraIssues = [...new Set((content.match(jiraPattern) || []))];

    // GitHub issue/PR references: #123, fixes #456, closes #789
    const issuePattern = /#(\d+)/g;
    const issueMatches = content.match(issuePattern) || [];
    references.githubIssues = [...new Set(issueMatches.map(match => match.replace('#', '')))];

    // Pull request URLs: https://github.com/owner/repo/pull/123
    const prUrlPattern = /https:\/\/github\.com\/[^\/]+\/[^\/]+\/pull\/(\d+)/g;
    let prMatch;
    while ((prMatch = prUrlPattern.exec(content)) !== null) {
      references.pullRequests.push(prMatch[1]);
    }

    // Discussion URLs: https://github.com/owner/repo/discussions/123
    const discussionUrlPattern = /https:\/\/github\.com\/[^\/]+\/[^\/]+\/discussions\/(\d+)/g;
    let discussionMatch;
    while ((discussionMatch = discussionUrlPattern.exec(content)) !== null) {
      references.discussions.push(discussionMatch[1]);
    }

    // Commit SHA references: abc123def456 (7+ hex characters)
    const commitPattern = /\b[a-f0-9]{7,40}\b/g;
    references.commits = [...new Set((content.match(commitPattern) || []).slice(0, 10))]; // Limit to 10

    return references;
  }

  /**
   * Correlate a GitHub Discussion with related artifacts
   */
  async correlateDiscussion(discussionData) {
    if (!this.isEnabled()) {
      core.info('Cross-platform correlation disabled');
      return null;
    }

    try {
      core.info(`Correlating discussion #${discussionData.number}...`);

      const correlation = {
        discussion: {
          number: discussionData.number,
          title: discussionData.title,
          url: discussionData.url
        },
        references: {},
        relatedArtifacts: {
          jiraIssues: [],
          pullRequests: [],
          githubIssues: [],
          commits: []
        },
        timeline: [],
        stakeholders: new Set(),
        completionStatus: {
          discussionPhase: true,
          implementationPhase: false,
          deliveryPhase: false
        }
      };

      // Extract references from discussion content
      const discussionContent = `${discussionData.title} ${discussionData.body || ''}`;
      correlation.references = this.extractCrossReferences(discussionContent, 'discussion');

      // Add discussion participants as stakeholders
      if (discussionData.author) {
        correlation.stakeholders.add(discussionData.author);
      }

      // Timeline entry for discussion creation
      correlation.timeline.push({
        date: discussionData.createdAt || new Date().toISOString(),
        type: 'discussion_created',
        title: discussionData.title,
        actor: discussionData.author,
        url: discussionData.url
      });

      // If Jira integration is enabled, try to find related epics/issues
      if (this.config.jira.enabled && correlation.references.jiraIssues.length > 0) {
        await this.enrichWithJiraData(correlation);
      }

      // Convert stakeholders Set to Array for serialization
      correlation.stakeholders = Array.from(correlation.stakeholders);

      core.info(`Found ${correlation.references.jiraIssues.length} Jira references, ${correlation.references.githubIssues.length} GitHub issue references`);
      
      return correlation;

    } catch (error) {
      core.error(`Failed to correlate discussion: ${error.message}`);
      return null;
    }
  }

  /**
   * Correlate a Pull Request with related artifacts
   */
  async correlatePullRequest(prData) {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      core.info(`Correlating PR #${prData.pr.number}...`);

      const correlation = {
        pullRequest: {
          number: prData.pr.number,
          title: prData.pr.title,
          url: prData.pr.url,
          merged: prData.pr.merged,
          author: prData.pr.author
        },
        references: {},
        relatedArtifacts: {
          jiraIssues: [],
          discussions: [],
          githubIssues: [],
          commits: prData.commits || []
        },
        timeline: [],
        stakeholders: new Set(),
        completionStatus: {
          discussionPhase: false,
          implementationPhase: true,
          deliveryPhase: prData.pr.merged
        }
      };

      // Extract references from PR content
      const prContent = `${prData.pr.title} ${prData.pr.body || ''}`;
      correlation.references = this.extractCrossReferences(prContent, 'pullRequest');

      // Add PR participants as stakeholders
      [prData.pr.author, ...prData.pr.assignees, ...prData.pr.reviewers].forEach(user => {
        if (user) correlation.stakeholders.add(user);
      });

      // Add reviewers and commenters
      if (prData.reviews) {
        prData.reviews.forEach(review => {
          if (review.author) correlation.stakeholders.add(review.author);
        });
      }

      // Timeline entries
      correlation.timeline.push({
        date: prData.pr.createdAt || new Date().toISOString(),
        type: 'pr_opened',
        title: prData.pr.title,
        actor: prData.pr.author,
        url: prData.pr.url
      });

      if (prData.pr.merged && prData.pr.mergedAt) {
        correlation.timeline.push({
          date: prData.pr.mergedAt,
          type: 'pr_merged',
          title: prData.pr.title,
          actor: prData.pr.author,
          url: prData.pr.url
        });
      }

      correlation.stakeholders = Array.from(correlation.stakeholders);

      return correlation;

    } catch (error) {
      core.error(`Failed to correlate PR: ${error.message}`);
      return null;
    }
  }

  /**
   * Enrich correlation data with Jira information
   */
  async enrichWithJiraData(correlation) {
    try {
      if (!this.config.jira.enabled) {
        return;
      }

      const { JiraClient } = require('./jira-client');
      const jiraClient = new JiraClient();
      
      if (!jiraClient.isEnabled()) {
        return;
      }

      // Fetch details for each referenced Jira issue
      for (const jiraKey of correlation.references.jiraIssues) {
        try {
          const issueDetails = await jiraClient.getIssueDetails(jiraKey);
          if (issueDetails) {
            const enrichedIssue = {
              key: jiraKey,
              summary: issueDetails.fields.summary,
              status: issueDetails.fields.status?.name,
              assignee: issueDetails.fields.assignee?.displayName,
              epic: issueDetails.fields.parent?.key || null,
              url: `${jiraClient.config.baseUrl}/browse/${jiraKey}`
            };

            correlation.relatedArtifacts.jiraIssues.push(enrichedIssue);

            // Add timeline entry
            correlation.timeline.push({
              date: issueDetails.fields.created,
              type: 'jira_issue_referenced',
              title: `${jiraKey}: ${issueDetails.fields.summary}`,
              actor: issueDetails.fields.reporter?.displayName,
              url: enrichedIssue.url
            });

            // Add assignee as stakeholder
            if (issueDetails.fields.assignee?.displayName) {
              correlation.stakeholders.add(issueDetails.fields.assignee.displayName);
            }
          }
        } catch (error) {
          core.warning(`Could not fetch Jira issue ${jiraKey}: ${error.message}`);
        }
      }

    } catch (error) {
      core.warning(`Failed to enrich with Jira data: ${error.message}`);
    }
  }

  /**
   * Create a complete project intelligence correlation
   */
  async correlateCompleteProject(discussionData = null, prData = null, jiraData = null) {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      core.info('Creating complete project intelligence correlation...');

      const completeCorrelation = {
        correlationId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString(),
        artifacts: {},
        crossReferences: {},
        unifiedTimeline: [],
        allStakeholders: new Set(),
        projectPhases: {
          planning: false,
          implementation: false,
          delivery: false
        },
        summary: {
          totalArtifacts: 0,
          totalStakeholders: 0,
          phaseCompletion: 0
        }
      };

      // Correlate individual artifacts
      if (discussionData) {
        const discussionCorrelation = await this.correlateDiscussion(discussionData);
        if (discussionCorrelation) {
          completeCorrelation.artifacts.discussion = discussionCorrelation;
          completeCorrelation.unifiedTimeline.push(...discussionCorrelation.timeline);
          discussionCorrelation.stakeholders.forEach(s => completeCorrelation.allStakeholders.add(s));
          completeCorrelation.projectPhases.planning = true;
        }
      }

      if (prData) {
        const prCorrelation = await this.correlatePullRequest(prData);
        if (prCorrelation) {
          completeCorrelation.artifacts.pullRequest = prCorrelation;
          completeCorrelation.unifiedTimeline.push(...prCorrelation.timeline);
          prCorrelation.stakeholders.forEach(s => completeCorrelation.allStakeholders.add(s));
          completeCorrelation.projectPhases.implementation = true;
          if (prData.pr.merged) {
            completeCorrelation.projectPhases.delivery = true;
          }
        }
      }

      // Sort unified timeline by date
      completeCorrelation.unifiedTimeline.sort((a, b) => new Date(a.date) - new Date(b.date));

      // Convert stakeholders Set to Array
      completeCorrelation.allStakeholders = Array.from(completeCorrelation.allStakeholders);

      // Calculate summary metrics
      completeCorrelation.summary.totalArtifacts = Object.keys(completeCorrelation.artifacts).length;
      completeCorrelation.summary.totalStakeholders = completeCorrelation.allStakeholders.length;
      completeCorrelation.summary.phaseCompletion = Object.values(completeCorrelation.projectPhases).filter(Boolean).length;

      // Cross-reference analysis
      completeCorrelation.crossReferences = this.analyzeCrossReferences(completeCorrelation);

      core.info(`Complete correlation created with ${completeCorrelation.summary.totalArtifacts} artifacts and ${completeCorrelation.summary.totalStakeholders} stakeholders`);

      return completeCorrelation;

    } catch (error) {
      core.error(`Failed to create complete project correlation: ${error.message}`);
      return null;
    }
  }

  /**
   * Analyze cross-references between artifacts
   */
  analyzeCrossReferences(completeCorrelation) {
    const analysis = {
      discussionToPr: [],
      prToDiscussion: [],
      jiraToGithub: [],
      githubToJira: [],
      orphanedReferences: []
    };

    const discussion = completeCorrelation.artifacts.discussion;
    const pr = completeCorrelation.artifacts.pullRequest;

    // Analyze Discussion → PR connections
    if (discussion && pr) {
      // Check if PR references discussion
      if (pr.references.discussions.includes(discussion.discussion.number.toString())) {
        analysis.discussionToPr.push({
          discussionNumber: discussion.discussion.number,
          prNumber: pr.pullRequest.number,
          connectionType: 'direct_reference'
        });
      }

      // Check for common Jira issues
      const commonJiraIssues = discussion.references.jiraIssues.filter(jira =>
        pr.references.jiraIssues.includes(jira)
      );

      if (commonJiraIssues.length > 0) {
        analysis.jiraToGithub.push({
          jiraIssues: commonJiraIssues,
          discussionNumber: discussion.discussion.number,
          prNumber: pr.pullRequest.number,
          connectionType: 'shared_jira_references'
        });
      }
    }

    return analysis;
  }

  /**
   * Generate human-readable correlation summary
   */
  generateCorrelationSummary(correlation) {
    if (!correlation) return 'No correlation data available';

    const summary = [];

    // Project phase status
    const phases = correlation.projectPhases;
    const phaseStatus = [];
    if (phases.planning) phaseStatus.push('📋 Planning');
    if (phases.implementation) phaseStatus.push('⚡ Implementation');
    if (phases.delivery) phaseStatus.push('🚀 Delivery');
    
    summary.push(`**Project Phases**: ${phaseStatus.join(' → ')}`);

    // Artifact summary
    const artifacts = Object.keys(correlation.artifacts);
    if (artifacts.length > 0) {
      summary.push(`**Connected Artifacts**: ${artifacts.join(', ')}`);
    }

    // Stakeholder count
    if (correlation.allStakeholders.length > 0) {
      summary.push(`**Stakeholders**: ${correlation.allStakeholders.length} (${correlation.allStakeholders.slice(0, 3).join(', ')}${correlation.allStakeholders.length > 3 ? '...' : ''})`);
    }

    // Cross-references
    if (correlation.crossReferences) {
      const refs = correlation.crossReferences;
      const refCount = refs.discussionToPr.length + refs.jiraToGithub.length;
      if (refCount > 0) {
        summary.push(`**Cross-References**: ${refCount} connections found`);
      }
    }

    // Timeline highlights
    if (correlation.unifiedTimeline.length > 0) {
      const firstEvent = correlation.unifiedTimeline[0];
      const lastEvent = correlation.unifiedTimeline[correlation.unifiedTimeline.length - 1];
      summary.push(`**Timeline**: ${firstEvent.type} → ${lastEvent.type}`);
    }

    return summary.join('\n');
  }

  /**
   * Check if correlation should be enabled based on available data
   */
  shouldCorrelate(discussionData, prData) {
    // Enable if any cross-references are found or if multiple data sources exist
    const hasMultipleSources = [discussionData, prData].filter(Boolean).length > 1;
    
    if (hasMultipleSources) return true;

    // Check for cross-references in single source
    if (discussionData) {
      const refs = this.extractCrossReferences(`${discussionData.title} ${discussionData.body || ''}`);
      return refs.jiraIssues.length > 0 || refs.githubIssues.length > 0;
    }

    if (prData) {
      const refs = this.extractCrossReferences(`${prData.pr.title} ${prData.pr.body || ''}`);
      return refs.jiraIssues.length > 0 || refs.discussions.length > 0;
    }

    return false;
  }
}

module.exports = { CrossPlatformCorrelator };