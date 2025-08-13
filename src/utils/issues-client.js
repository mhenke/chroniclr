#!/usr/bin/env node

/**
 * Simplified GitHub Issues Client
 * Handles basic issue data fetching for documentation generation
 */

const core = require('@actions/core');
const github = require('@actions/github');

class IssuesClient {
  constructor() {
    this.github = github.getOctokit(process.env.GITHUB_TOKEN);
    this.context = github.context;
  }

  /**
   * Fetch issues by issue numbers
   */
  async fetchIssues(issueNumbers) {
    if (!issueNumbers || !issueNumbers.length) {
      return [];
    }

    const issues = [];

    for (const issueNumber of issueNumbers) {
      try {
        core.info(`Fetching Issue #${issueNumber}`);

        const { data: issue } = await this.github.rest.issues.get({
          owner: this.context.repo.owner,
          repo: this.context.repo.repo,
          issue_number: parseInt(issueNumber),
        });

        // Skip pull requests (GitHub API returns PRs as issues)
        if (issue.pull_request) {
          core.info(`Skipping PR #${issueNumber} (not an issue)`);
          continue;
        }

        issues.push({
          number: issue.number,
          title: issue.title,
          body: issue.body || '',
          author: issue.user.login,
          state: issue.state,
          createdAt: issue.created_at,
          updatedAt: issue.updated_at,
          closedAt: issue.closed_at,
          url: issue.html_url,
          labels: issue.labels.map((label) => ({
            name: label.name,
            color: label.color,
            description: label.description,
          })),
          assignees: issue.assignees.map((assignee) => assignee.login),
          milestone: issue.milestone
            ? {
                title: issue.milestone.title,
                description: issue.milestone.description,
                state: issue.milestone.state,
                dueOn: issue.milestone.due_on,
              }
            : null,
          commentsCount: issue.comments,
        });

        core.info(`✅ Fetched Issue #${issueNumber}: "${issue.title}"`);
      } catch (error) {
        if (error.status === 404) {
          core.error(
            `❌ Issue #${issueNumber} not found. Please verify the issue number exists in this repository.`
          );
        } else if (error.status === 403) {
          core.error(
            `❌ Access denied to Issue #${issueNumber}. Check repository permissions.`
          );
        } else {
          core.error(
            `❌ Failed to fetch Issue #${issueNumber}: ${error.message}`
          );
        }
        // Continue processing other issues instead of failing completely
      }
    }

    return issues;
  }

  /**
   * Generate issues summary data for templates
   */
  generateIssuesSummary(issues) {
    if (!issues.length) {
      return {
        totalIssues: 0,
        openIssues: 0,
        closedIssues: 0,
        authors: [],
        labels: [],
        milestones: [],
      };
    }

    const openIssues = issues.filter((issue) => issue.state === 'open');
    const closedIssues = issues.filter((issue) => issue.state === 'closed');
    const allAuthors = [...new Set(issues.map((issue) => issue.author))];
    const allLabels = [
      ...new Set(
        issues.flatMap((issue) => issue.labels.map((label) => label.name))
      ),
    ];
    const allMilestones = [
      ...new Set(issues.map((issue) => issue.milestone?.title).filter(Boolean)),
    ];

    // Group issues by label for analysis
    const issuesByLabel = {};
    issues.forEach((issue) => {
      issue.labels.forEach((label) => {
        if (!issuesByLabel[label.name]) {
          issuesByLabel[label.name] = [];
        }
        issuesByLabel[label.name].push(issue);
      });
    });

    // Group issues by milestone
    const issuesByMilestone = {};
    issues.forEach((issue) => {
      const milestone = issue.milestone?.title || 'No Milestone';
      if (!issuesByMilestone[milestone]) {
        issuesByMilestone[milestone] = [];
      }
      issuesByMilestone[milestone].push(issue);
    });

    return {
      totalIssues: issues.length,
      openIssues: openIssues.length,
      closedIssues: closedIssues.length,
      authors: allAuthors,
      labels: allLabels,
      milestones: allMilestones,
      issuesByLabel: issuesByLabel,
      issuesByMilestone: issuesByMilestone,
      issues: issues.map((issue) => ({
        number: issue.number,
        title: issue.title,
        author: issue.author,
        state: issue.state,
        url: issue.url,
        labels: issue.labels.map((label) => label.name),
        milestone: issue.milestone?.title,
        assignees: issue.assignees,
      })),
    };
  }
}

module.exports = { IssuesClient };
