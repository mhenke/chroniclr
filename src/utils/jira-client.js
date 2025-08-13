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
        if (error.response?.status === 404) {
          core.error(
            `❌ Jira issue ${jiraKey} not found. Please verify the key exists and is accessible.`
          );
        } else if (
          error.response?.status === 401 ||
          error.response?.status === 403
        ) {
          core.error(
            `❌ Access denied to Jira issue ${jiraKey}. Check authentication credentials and permissions.`
          );
        } else {
          core.error(
            `❌ Failed to fetch Jira issue ${jiraKey}: ${error.message}`
          );
        }
        // Continue processing other Jira issues instead of failing completely
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
}

module.exports = { JiraClient };
