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

  /**
   * Generate detailed PR testing report data
   */
  generatePRTestingReport(prs) {
    const summary = this.generatePRSummary(prs);

    // Calculate testing metrics
    const testCoverage = this.calculateTestCoverage(prs);
    const reviewCoverage = this.calculateReviewCoverage(prs);
    const testFiles = this.getTestFilesAnalysis(prs);

    return {
      ...summary,
      openPRs: summary.totalPRs - summary.mergedPRs,
      netChange: summary.linesAdded - summary.linesDeleted,
      avgFilesPerPR:
        summary.totalPRs > 0
          ? Math.round(summary.filesChanged / summary.totalPRs)
          : 0,
      codeChurn: summary.linesAdded + summary.linesDeleted,
      testCoverage,
      reviewCoverage,
      testFilesCount: testFiles.count,
      testingNotes: testFiles.notes,
      prDetails: prs.map((pr) => this.formatPRDetails(pr)),
      prLinks: prs
        .map((pr) => `- [PR #${pr.number}: ${pr.title}](${pr.url})`)
        .join('\n'),
      deploymentStatus: this.analyzeDeploymentStatus(prs),
      recommendations: this.generateRecommendations(
        prs,
        testCoverage,
        reviewCoverage
      ),
    };
  }

  /**
   * Calculate test coverage percentage based on PRs with test files
   */
  calculateTestCoverage(prs) {
    const totalPRs = prs.length;
    if (totalPRs === 0) return 0;

    const prsWithTests = prs.filter((pr) =>
      pr.files.some((f) => this.isTestFile(f.filename))
    ).length;

    return Math.round((prsWithTests / totalPRs) * 100);
  }

  /**
   * Calculate review coverage (assuming merged PRs have been reviewed)
   */
  calculateReviewCoverage(prs) {
    const totalPRs = prs.length;
    if (totalPRs === 0) return 0;

    const reviewedPRs = prs.filter(
      (pr) => pr.merged || pr.state === 'closed'
    ).length;
    return Math.round((reviewedPRs / totalPRs) * 100);
  }

  /**
   * Analyze test files in the PR set
   */
  getTestFilesAnalysis(prs) {
    const testFiles = [];
    const testPatterns = [];

    prs.forEach((pr) => {
      pr.files.forEach((file) => {
        if (this.isTestFile(file.filename)) {
          testFiles.push({
            pr: pr.number,
            file: file.filename,
            additions: file.additions,
            deletions: file.deletions,
          });
        }
      });
    });

    const notes =
      testFiles.length > 0
        ? `Found ${testFiles.length} test files modified across ${prs.length} PRs. ` +
          `Test patterns include: ${this.getTestPatterns(testFiles).join(', ')}`
        : 'No test files were modified in the analyzed PRs.';

    return {
      count: testFiles.length,
      notes: notes,
      files: testFiles,
    };
  }

  /**
   * Check if a filename represents a test file
   */
  isTestFile(filename) {
    const testPatterns = [
      /\.test\./i,
      /\.spec\./i,
      /test\//i,
      /tests\//i,
      /__tests__\//i,
      /\.test$/i,
      /\.spec$/i,
    ];

    return testPatterns.some((pattern) => pattern.test(filename));
  }

  /**
   * Extract test patterns from test files
   */
  getTestPatterns(testFiles) {
    const patterns = new Set();

    testFiles.forEach((file) => {
      if (file.file.includes('.test.')) patterns.add('*.test.*');
      if (file.file.includes('.spec.')) patterns.add('*.spec.*');
      if (file.file.includes('test/')) patterns.add('test/');
      if (file.file.includes('tests/')) patterns.add('tests/');
      if (file.file.includes('__tests__/')) patterns.add('__tests__/');
    });

    return Array.from(patterns);
  }

  /**
   * Format individual PR details for the report
   */
  formatPRDetails(pr) {
    const testFilesCount = pr.files.filter((f) =>
      this.isTestFile(f.filename)
    ).length;
    const totalAdditions = pr.files.reduce((sum, f) => sum + f.additions, 0);
    const totalDeletions = pr.files.reduce((sum, f) => sum + f.deletions, 0);

    return `### PR #${pr.number}: ${pr.title}
- **Author:** ${pr.author}
- **Status:** ${
      pr.merged ? '✅ Merged' : pr.state === 'open' ? '🟡 Open' : '❌ Closed'
    }
- **Files Changed:** ${pr.files.length}
- **Test Files:** ${testFilesCount}
- **Lines Added:** +${totalAdditions}
- **Lines Deleted:** -${totalDeletions}
- **Jira Keys:** ${pr.jiraKeys.length > 0 ? pr.jiraKeys.join(', ') : 'None'}
- **URL:** ${pr.url}
`;
  }

  /**
   * Analyze deployment status based on PR states
   */
  analyzeDeploymentStatus(prs) {
    const mergedCount = prs.filter((pr) => pr.merged).length;
    const openCount = prs.filter((pr) => pr.state === 'open').length;
    const totalCount = prs.length;

    if (mergedCount === totalCount) {
      return '🟢 **All PRs merged** - Ready for deployment';
    } else if (openCount === totalCount) {
      return '🟡 **All PRs pending** - In development/review phase';
    } else {
      return `🔄 **Mixed status** - ${mergedCount} merged, ${openCount} pending, ${
        totalCount - mergedCount - openCount
      } closed`;
    }
  }

  /**
   * Generate recommendations based on analysis
   */
  generateRecommendations(prs, testCoverage, reviewCoverage) {
    const recommendations = [];

    if (testCoverage < 50) {
      recommendations.push(
        '📋 **Increase test coverage** - Less than 50% of PRs include test modifications'
      );
    }

    if (reviewCoverage < 80) {
      recommendations.push(
        '👀 **Improve review process** - Some PRs may need additional review'
      );
    }

    const avgFilesPerPR =
      prs.length > 0
        ? prs.reduce((sum, pr) => sum + pr.files.length, 0) / prs.length
        : 0;

    if (avgFilesPerPR > 10) {
      recommendations.push(
        '✂️ **Consider smaller PRs** - Average of ' +
          Math.round(avgFilesPerPR) +
          ' files per PR may be too large'
      );
    }

    const prsWithoutJira = prs.filter((pr) => pr.jiraKeys.length === 0).length;
    if (prsWithoutJira > 0) {
      recommendations.push(
        `🎫 **Link Jira tickets** - ${prsWithoutJira} PRs missing Jira issue references`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        '✅ **Good practices observed** - PRs follow recommended patterns'
      );
    }

    return recommendations.join('\n\n');
  }
}

module.exports = { PullRequestClient };
