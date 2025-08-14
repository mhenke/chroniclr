#!/usr/bin/env node

/**
 * Simplified Jira API Client
 * Handles basic Jira data fetching using GitHub Secrets
 */

const core = require('@actions/core');

class JiraClient {
  constructor() {
    this.baseUrl = process.env.JIRA_BASE_URL;
    this.userEmail = process.env.JIRA_USER_EMAIL;
    this.apiToken = process.env.JIRA_API_TOKEN;
    this.project = process.env.JIRA_PROJECT;

    // Validate required environment variables
    if (!this.baseUrl || !this.userEmail || !this.apiToken || !this.project) {
      this.enabled = false;
      return;
    }

    this.enabled = true;
    this.authHeader = this.createAuthHeader();
  }

  createAuthHeader() {
    const auth = Buffer.from(`${this.userEmail}:${this.apiToken}`).toString(
      'base64'
    );
    return `Basic ${auth}`;
  }

  /**
   * Fetch Jira issues by keys
   */
  async fetchJiraIssues(jiraKeys) {
    if (!this.enabled || !jiraKeys || !jiraKeys.length) {
      return [];
    }

    const issues = [];

    for (const jiraKey of jiraKeys) {
      try {
        core.info(`Fetching Jira issue: ${jiraKey}`);

        const response = await fetch(
          `${this.baseUrl}/rest/api/3/issue/${jiraKey}`,
          {
            headers: {
              Authorization: this.authHeader,
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          core.error(
            `Failed to fetch ${jiraKey}: ${response.status} ${response.statusText}`
          );
          continue;
        }

        const issue = await response.json();

        issues.push({
          key: issue.key,
          summary: issue.fields.summary,
          description: issue.fields.description || '',
          status: issue.fields.status.name,
          issueType: issue.fields.issuetype.name,
          priority: issue.fields.priority?.name || 'None',
          assignee: issue.fields.assignee?.displayName || 'Unassigned',
          reporter: issue.fields.reporter?.displayName || 'Unknown',
          created: issue.fields.created,
          updated: issue.fields.updated,
          resolved: issue.fields.resolutiondate,
          project: issue.fields.project.key,
          url: `${this.baseUrl}/browse/${issue.key}`,
          labels: issue.fields.labels || [],
          components: issue.fields.components?.map((comp) => comp.name) || [],
          fixVersions: issue.fields.fixVersions?.map((ver) => ver.name) || [],
        });

        core.info(
          `✅ Fetched Jira issue: ${jiraKey} - "${issue.fields.summary}"`
        );
      } catch (error) {
        const baseUrl = this.baseUrl || 'JIRA_BASE_URL_NOT_SET';
        const project = this.project || 'JIRA_PROJECT_NOT_SET';
        
        if (error.message.includes('404')) {
          core.error(
            `❌ Jira issue ${jiraKey} not found. Possible causes:
            • Issue key doesn't exist in ${project} project
            • Issue may have been deleted or moved
            • Check URL: ${baseUrl}/browse/${jiraKey}
            • Verify project key in JIRA_PROJECT secret: ${project}
            • Create test data using: node scripts/create-test-jira-data.js`
          );
        } else if (error.message.includes('401')) {
          core.error(
            `❌ Authentication failed for Jira issue ${jiraKey}:
            • Check JIRA_API_TOKEN secret is valid and not expired
            • Verify JIRA_USER_EMAIL matches token owner
            • API tokens can be managed at: ${baseUrl}/secure/ViewProfile.jspa?selectedTab=com.atlassian.pats.pats-plugin:jira-user-personal-access-tokens`
          );
        } else if (error.message.includes('403')) {
          core.error(
            `❌ Access denied to Jira issue ${jiraKey}:
            • User ${this.userEmail || 'EMAIL_NOT_SET'} lacks permission to view issue
            • Issue may be restricted to specific users/groups
            • Verify you can access: ${baseUrl}/browse/${jiraKey}
            • Check project permissions in ${project}`
          );
        } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
          core.error(
            `❌ Cannot connect to Jira server for ${jiraKey}:
            • Check JIRA_BASE_URL: ${baseUrl}
            • Verify Jira instance is accessible
            • Network connectivity issues
            • URL should be format: https://yourcompany.atlassian.net`
          );
        } else {
          core.error(
            `❌ Failed to fetch Jira issue ${jiraKey}:
            • Error: ${error.message}
            • URL: ${baseUrl}/rest/api/3/issue/${jiraKey}
            • Project: ${project}
            • User: ${this.userEmail || 'EMAIL_NOT_SET'}
            • Double-check all JIRA_* secrets are configured correctly`
          );
        }
        // Continue processing other Jira issues instead of failing completely
      }
    }

    // Log configuration summary for debugging
    if (jiraKeys && jiraKeys.length > 0) {
      const successCount = issues.length;
      const failureCount = jiraKeys.length - successCount;
      
      if (failureCount > 0) {
        core.warning(`
📋 Jira Integration Summary:
• Successfully fetched: ${successCount}/${jiraKeys.length} issues
• Failed: ${failureCount} issues
• Jira Instance: ${this.baseUrl || 'NOT_SET'}
• Project: ${this.project || 'NOT_SET'}
• User: ${this.userEmail || 'NOT_SET'}

🔧 Troubleshooting:
${failureCount === jiraKeys.length ? '• No issues found - create test data with: node scripts/create-test-jira-data.js' : '• Some issues missing - verify issue keys exist in Jira'}
• Check secrets configuration in GitHub repository settings
• Test Jira connectivity manually: ${this.baseUrl}/browse/${jiraKeys[0]}
        `);
      } else {
        core.info(`✅ Successfully fetched all ${successCount} Jira issues from ${this.project}`);
      }
    }

    return issues;
  }

  /**
   * Get current sprint data for the project
   */
  async getCurrentSprint() {
    if (!this.enabled) {
      return null;
    }

    try {
      core.info(`Fetching current sprint for project: ${this.project}`);

      // First, get the board for the project
      const boardResponse = await fetch(
        `${this.baseUrl}/rest/agile/1.0/board?projectKeyOrId=${this.project}`,
        {
          headers: {
            Authorization: this.authHeader,
            Accept: 'application/json',
          },
        }
      );

      if (!boardResponse.ok) {
        core.warning('Could not fetch board information for current sprint');
        return null;
      }

      const boardData = await boardResponse.json();
      if (!boardData.values || boardData.values.length === 0) {
        core.warning('No boards found for project');
        return null;
      }

      const boardId = boardData.values[0].id;

      // Get active sprints for the board
      const sprintResponse = await fetch(
        `${this.baseUrl}/rest/agile/1.0/board/${boardId}/sprint?state=active`,
        {
          headers: {
            Authorization: this.authHeader,
            Accept: 'application/json',
          },
        }
      );

      if (!sprintResponse.ok) {
        core.warning('Could not fetch active sprints');
        return null;
      }

      const sprintData = await sprintResponse.json();
      if (!sprintData.values || sprintData.values.length === 0) {
        core.info('No active sprints found');
        return null;
      }

      const sprint = sprintData.values[0];
      return {
        id: sprint.id,
        name: sprint.name,
        state: sprint.state,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        goal: sprint.goal || '',
        boardId: boardId,
      };
    } catch (error) {
      core.error(`Failed to fetch current sprint: ${error.message}`);
      return null;
    }
  }

  /**
   * Generate Jira summary data for templates
   */
  generateJiraSummary(issues, sprint = null) {
    if (!issues.length && !sprint) {
      return {
        totalIssues: 0,
        issuesByStatus: {},
        issuesByType: {},
        sprint: null,
      };
    }

    // Group issues by status
    const issuesByStatus = {};
    issues.forEach((issue) => {
      if (!issuesByStatus[issue.status]) {
        issuesByStatus[issue.status] = [];
      }
      issuesByStatus[issue.status].push(issue);
    });

    // Group issues by type
    const issuesByType = {};
    issues.forEach((issue) => {
      if (!issuesByType[issue.issueType]) {
        issuesByType[issue.issueType] = [];
      }
      issuesByType[issue.issueType].push(issue);
    });

    const allAssignees = [
      ...new Set(
        issues.map((issue) => issue.assignee).filter((a) => a !== 'Unassigned')
      ),
    ];
    const allComponents = [
      ...new Set(issues.flatMap((issue) => issue.components)),
    ];

    return {
      totalIssues: issues.length,
      issuesByStatus: issuesByStatus,
      issuesByType: issuesByType,
      assignees: allAssignees,
      components: allComponents,
      sprint: sprint,
      issues: issues.map((issue) => ({
        key: issue.key,
        summary: issue.summary,
        status: issue.status,
        issueType: issue.issueType,
        assignee: issue.assignee,
        url: issue.url,
      })),
    };
  }

  /**
   * Generate detailed sprint status report data
   */
  generateSprintStatusReport(issues, prData = null) {
    const summary = this.generateJiraSummary(issues);
    const sprintData = summary.sprint || {};

    // Calculate sprint progress
    const sprintProgress = this.calculateSprintProgress(summary.issuesByStatus);
    const daysRemaining = this.calculateDaysRemaining(sprintData.endDate);

    // Create status table
    const ticketStatusTable = this.createStatusTable(
      summary.issuesByStatus,
      summary.totalIssues
    );

    // Group issues by status for detailed breakdown
    const jiraIssuesByStatus = this.formatIssuesByStatus(
      summary.issuesByStatus
    );
    const jiraIssuesByPriority = this.formatIssuesByPriority(issues);
    const jiraIssueDetails = this.formatIssueDetails(issues);

    return {
      ...summary,
      sprintName: sprintData.name || 'Current Sprint',
      sprintStatus: sprintData.state || 'Active',
      sprintStartDate: sprintData.startDate || 'TBD',
      sprintEndDate: sprintData.endDate || 'TBD',
      sprintGoal: sprintData.goal || 'Sprint goal not set',
      sprintProgress: sprintProgress,
      daysRemaining: daysRemaining,
      ticketStatusTable: ticketStatusTable,
      totalJiraIssues: summary.totalIssues,
      jiraIssuesByStatus: jiraIssuesByStatus,
      jiraIssuesByPriority: jiraIssuesByPriority,
      jiraIssueDetails: jiraIssueDetails,
      sprintActionItems: this.generateSprintActionItems(
        summary.issuesByStatus,
        prData
      ),
      sprintRisks: this.generateSprintRisks(
        summary.issuesByStatus,
        daysRemaining
      ),
      jiraBoardUrl:
        sprintData.boardUrl || `${this.baseUrl}/browse/${this.project}`,
      jiraDetails: issues
        .map((issue) => `- [${issue.key}: ${issue.summary}](${issue.url})`)
        .join('\n'),
    };
  }

  /**
   * Calculate sprint progress percentage
   */
  calculateSprintProgress(issuesByStatus) {
    const doneIssues =
      (issuesByStatus['Done'] || []).length +
      (issuesByStatus['Closed'] || []).length;
    const totalIssues = Object.values(issuesByStatus).reduce(
      (sum, issues) => sum + issues.length,
      0
    );

    if (totalIssues === 0) return 0;
    return Math.round((doneIssues / totalIssues) * 100);
  }

  /**
   * Calculate days remaining in sprint
   */
  calculateDaysRemaining(endDate) {
    if (!endDate) return 'Unknown';

    const end = new Date(endDate);
    const now = new Date();
    const diffTime = end - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'Sprint ended';
    if (diffDays === 0) return 'Last day';
    return `${diffDays} days`;
  }

  /**
   * Create ticket status table
   */
  createStatusTable(issuesByStatus, totalIssues) {
    if (totalIssues === 0) return 'No issues found';

    const statusRows = [];
    Object.entries(issuesByStatus).forEach(([status, issues]) => {
      const count = issues.length;
      const percentage = Math.round((count / totalIssues) * 100);
      statusRows.push(`| ${status} | ${count} | ${percentage}% |`);
    });

    return statusRows.join('\n');
  }

  /**
   * Format issues by status for detailed breakdown
   */
  formatIssuesByStatus(issuesByStatus) {
    const sections = [];
    Object.entries(issuesByStatus).forEach(([status, issues]) => {
      sections.push(`**${status}** (${issues.length})`);
      issues.forEach((issue) => {
        sections.push(`- [${issue.key}](${issue.url}): ${issue.summary}`);
      });
      sections.push('');
    });
    return sections.join('\n');
  }

  /**
   * Format issues by priority (mock - would need priority data from API)
   */
  formatIssuesByPriority(issues) {
    const priorityGroups = {
      High: [],
      Medium: [],
      Low: [],
      Unknown: [],
    };

    issues.forEach((issue) => {
      const priority = issue.priority || 'Unknown';
      if (priorityGroups[priority]) {
        priorityGroups[priority].push(issue);
      } else {
        priorityGroups['Unknown'].push(issue);
      }
    });

    const sections = [];
    Object.entries(priorityGroups).forEach(([priority, priorityIssues]) => {
      if (priorityIssues.length > 0) {
        sections.push(`**${priority}** (${priorityIssues.length})`);
        priorityIssues.forEach((issue) => {
          sections.push(`- [${issue.key}](${issue.url}): ${issue.summary}`);
        });
        sections.push('');
      }
    });

    return sections.join('\n') || 'No priority information available.';
  }

  /**
   * Format detailed issue information
   */
  formatIssueDetails(issues) {
    return issues
      .map((issue) => {
        return `### ${issue.key}: ${issue.summary}
- **Status:** ${issue.status}
- **Type:** ${issue.issueType}
- **Assignee:** ${issue.assignee}
- **URL:** ${issue.url}`;
      })
      .join('\n\n');
  }

  /**
   * Generate sprint action items based on current state
   */
  generateSprintActionItems(issuesByStatus, prData) {
    const actionItems = [];

    // Check for blocked or in-progress items
    const inProgress = (issuesByStatus['In Progress'] || []).length;
    const todo = (issuesByStatus['To Do'] || []).length;
    const done = (issuesByStatus['Done'] || []).length;

    if (todo > inProgress) {
      actionItems.push(
        '🚀 **Start more work** - More tickets in To Do than In Progress'
      );
    }

    if (inProgress > 5) {
      actionItems.push(
        '⚠️ **Focus on completion** - High number of items in progress'
      );
    }

    if (prData && prData.openPRs > 0) {
      actionItems.push(
        `📋 **Review PRs** - ${prData.openPRs} PRs awaiting review/merge`
      );
    }

    if (actionItems.length === 0) {
      actionItems.push(
        '✅ **Sprint on track** - No critical action items identified'
      );
    }

    return actionItems.join('\n\n');
  }

  /**
   * Generate sprint risks based on current state
   */
  generateSprintRisks(issuesByStatus, daysRemaining) {
    const risks = [];

    const todo = (issuesByStatus['To Do'] || []).length;
    const inProgress = (issuesByStatus['In Progress'] || []).length;
    const totalRemaining = todo + inProgress;

    if (daysRemaining !== 'Unknown' && daysRemaining !== 'Sprint ended') {
      const daysNum = parseInt(daysRemaining);
      if (daysNum <= 2 && totalRemaining > 3) {
        risks.push(
          '🔴 **Sprint at risk** - High number of incomplete items with limited time'
        );
      } else if (daysNum <= 5 && totalRemaining > 10) {
        risks.push('🟡 **Sprint capacity concern** - May need to reduce scope');
      }
    }

    if (inProgress === 0 && todo > 0) {
      risks.push('⚠️ **No active work** - All tickets in To Do status');
    }

    if (risks.length === 0) {
      risks.push('🟢 **No major risks identified** - Sprint appears on track');
    }

    return risks.join('\n\n');
  }
}

module.exports = { JiraClient };
