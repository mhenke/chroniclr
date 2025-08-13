#!/usr/bin/env node

/**
 * Simplified GitHub Pull Request Client
 * Handles basic PR data fetching for documentation generation
 */

const core = require('@actions/core');
const github = require('@actions/github');

class PullRequestClient {
  constructor() {
    this.github = github.getOctokit(process.env.GITHUB_TOKEN);
    this.context = github.context;
  }

  /**
   * Fetch pull request data by PR numbers
   */
  async fetchPullRequests(prNumbers) {
    if (!prNumbers || !prNumbers.length) {
      return [];
    }

    const prs = [];

    for (const prNumber of prNumbers) {
      try {
        core.info(`Fetching PR #${prNumber}`);

        const { data: pr } = await this.github.rest.pulls.get({
          owner: this.context.repo.owner,
          repo: this.context.repo.repo,
          pull_number: parseInt(prNumber),
        });

        // Get PR files for change analysis
        const { data: files } = await this.github.rest.pulls.listFiles({
          owner: this.context.repo.owner,
          repo: this.context.repo.repo,
          pull_number: parseInt(prNumber),
        });

        // Extract JIRA keys from PR content
        const jiraKeys = this.extractJiraKeys(pr.title + ' ' + (pr.body || ''));

        prs.push({
          number: pr.number,
          title: pr.title,
          body: pr.body || '',
          author: pr.user.login,
          state: pr.state,
          merged: pr.merged,
          mergedAt: pr.merged_at,
          url: pr.html_url,
          files: files.map((file) => ({
            filename: file.filename,
            status: file.status,
            additions: file.additions,
            deletions: file.deletions,
            changes: file.changes,
          })),
          jiraKeys: jiraKeys,
          labels: pr.labels.map((label) => label.name),
        });

        core.info(`✅ Fetched PR #${prNumber}: "${pr.title}"`);
      } catch (error) {
        if (error.status === 404) {
          core.error(
            `❌ Pull Request #${prNumber} not found. Please verify the PR number exists in this repository.`
          );
        } else if (error.status === 403) {
          core.error(
            `❌ Access denied to PR #${prNumber}. Check repository permissions.`
          );
        } else {
          core.error(`❌ Failed to fetch PR #${prNumber}: ${error.message}`);
        }
        // Continue processing other PRs instead of failing completely
      }
    }

    return prs;
  }

  /**
   * Extract JIRA keys from text content
   */
  extractJiraKeys(text) {
    const jiraKeyPattern = /[A-Z]+-\d+/g;
    const matches = text.match(jiraKeyPattern) || [];
    return [...new Set(matches)]; // Remove duplicates
  }

  /**
   * Generate PR summary data for templates
   */
  generatePRSummary(prs) {
    if (!prs.length) {
      return {
        totalPRs: 0,
        mergedPRs: 0,
        authors: [],
        filesChanged: 0,
        linesAdded: 0,
        linesDeleted: 0,
        jiraKeys: [],
      };
    }

    const mergedPRs = prs.filter((pr) => pr.merged);
    const allAuthors = [...new Set(prs.map((pr) => pr.author))];
    const allJiraKeys = [...new Set(prs.flatMap((pr) => pr.jiraKeys))];

    const totalFiles = prs.reduce((sum, pr) => sum + pr.files.length, 0);
    const totalAdditions = prs.reduce(
      (sum, pr) =>
        sum + pr.files.reduce((fileSum, file) => fileSum + file.additions, 0),
      0
    );
    const totalDeletions = prs.reduce(
      (sum, pr) =>
        sum + pr.files.reduce((fileSum, file) => fileSum + file.deletions, 0),
      0
    );

    return {
      totalPRs: prs.length,
      mergedPRs: mergedPRs.length,
      authors: allAuthors,
      filesChanged: totalFiles,
      linesAdded: totalAdditions,
      linesDeleted: totalDeletions,
      jiraKeys: allJiraKeys,
      prs: prs.map((pr) => ({
        number: pr.number,
        title: pr.title,
        author: pr.author,
        merged: pr.merged,
        url: pr.url,
        jiraKeys: pr.jiraKeys,
      })),
    };
  }
}

module.exports = { PullRequestClient };
