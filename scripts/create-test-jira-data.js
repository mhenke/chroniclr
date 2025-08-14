#!/usr/bin/env node

/**
 * Jira Test Data Creator
 * Run this script locally with your Jira credentials to create test data
 *
 * Usage: JIRA_BASE_URL=... JIRA_USER_EMAIL=... JIRA_API_TOKEN=... JIRA_PROJECT=... node scripts/create-test-jira-data.js
 */

const https = require('https');

class JiraTestDataCreator {
  constructor() {
    this.baseUrl = process.env.JIRA_BASE_URL;
    this.userEmail = process.env.JIRA_USER_EMAIL;
    this.apiToken = process.env.JIRA_API_TOKEN;
    this.project = process.env.JIRA_PROJECT;

    if (!this.baseUrl || !this.userEmail || !this.apiToken || !this.project) {
      console.error('❌ Missing required environment variables:');
      console.error(
        'JIRA_BASE_URL, JIRA_USER_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT'
      );
      process.exit(1);
    }

    this.authHeader = `Basic ${Buffer.from(
      `${this.userEmail}:${this.apiToken}`
    ).toString('base64')}`;

    // Sample GitHub PR URLs for testing
    this.samplePRs = [
      'https://github.com/mhenke/chroniclr/pull/123',
      'https://github.com/mhenke/chroniclr/pull/124',
      'https://github.com/mhenke/chroniclr/pull/125',
      'https://github.com/mhenke/chroniclr/pull/126',
    ];

    // Sample GitHub Issue URLs
    this.sampleIssues = [
      'https://github.com/mhenke/chroniclr/issues/45',
      'https://github.com/mhenke/chroniclr/issues/46',
    ];
  }

  async makeRequest(method, endpoint, data = null) {
    const url = new URL(`${this.baseUrl}/rest/api/3${endpoint}`);

    return new Promise((resolve, reject) => {
      const options = {
        method,
        headers: {
          Authorization: this.authHeader,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      };

      const req = https.request(url, options, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const parsed = body ? JSON.parse(body) : {};
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(
                new Error(
                  `HTTP ${res.statusCode}: ${
                    parsed.errorMessages?.join(', ') || body
                  }`
                )
              );
            }
          } catch (e) {
            reject(new Error(`Parse error: ${body}`));
          }
        });
      });

      req.on('error', reject);

      if (data) {
        req.write(JSON.stringify(data));
      }
      req.end();
    });
  }

  createDescription(text, prLinks = [], issueLinks = []) {
    let content = [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ];

    // Add PR links
    if (prLinks.length > 0) {
      content.push({
        type: 'paragraph',
        content: [{ type: 'text', text: '\nRelated Pull Requests:' }],
      });

      prLinks.forEach((prUrl) => {
        content.push({
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: `• ${prUrl}`,
              marks: [{ type: 'link', attrs: { href: prUrl } }],
            },
          ],
        });
      });
    }

    // Add GitHub issue links
    if (issueLinks.length > 0) {
      content.push({
        type: 'paragraph',
        content: [{ type: 'text', text: '\nRelated GitHub Issues:' }],
      });

      issueLinks.forEach((issueUrl) => {
        content.push({
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: `• ${issueUrl}`,
              marks: [{ type: 'link', attrs: { href: issueUrl } }],
            },
          ],
        });
      });
    }

    return { type: 'doc', version: 1, content };
  }

  async addComment(issueKey, commentText) {
    try {
      const commentData = {
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: commentText }],
            },
          ],
        },
      };

      await this.makeRequest('POST', `/issue/${issueKey}/comment`, commentData);
      console.log(`   💬 Added comment to ${issueKey}`);
    } catch (error) {
      console.error(
        `   ❌ Failed to add comment to ${issueKey}: ${error.message}`
      );
    }
  }

  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async createTestMatrix() {
    console.log('🎯 Creating comprehensive test matrix...\n');

    const testScenarios = [
      // A1: Story with multiple comments and PR links
      {
        id: 'A1',
        summary: '[A1] User Authentication - Full Integration Test',
        description:
          'Implement OAuth 2.0 authentication system with comprehensive testing',
        issueType: 'Story',
        priority: 'High',
        prLinks: [this.samplePRs[0], this.samplePRs[1]],
        issueLinks: [],
        comments: [
          'Initial analysis complete. Starting with JWT token implementation.',
          'PR #123 ready for review - adds basic OAuth flow',
          'PR #124 adds token refresh functionality. Both PRs tested together.',
          'Security review complete. Ready for merge.',
        ],
        targetStatus: 'Done', // Will try to move to Done status
      },

      // A2: Bug with single comment and cross-platform links
      {
        id: 'A2',
        summary: '[A2] Memory Leak - Cross Platform Issue',
        description: 'Memory usage grows during large dataset processing',
        issueType: 'Bug',
        priority: 'High',
        prLinks: [this.samplePRs[2]],
        issueLinks: [this.sampleIssues[0]],
        comments: [
          'Reproduced the issue. Root cause identified in data processing loop. See GitHub issue #45 for detailed analysis and PR #125 for the fix.',
        ],
        targetStatus: 'In Progress', // Will try to move to In Progress
      },

      // B1: Task with multiple PR links only
      {
        id: 'B1',
        summary: '[B1] API Documentation Update - Multiple PRs',
        description:
          'Update API documentation for new authentication endpoints',
        issueType: 'Task',
        priority: 'Medium',
        prLinks: [this.samplePRs[0], this.samplePRs[3]],
        issueLinks: [],
        comments: [],
        targetStatus: 'In Review', // Will try to move to review status
      },

      // B2: Story with single PR link only
      {
        id: 'B2',
        summary: '[B2] Dark Mode Theme - Simple PR Reference',
        description: 'Add dark theme toggle for better UX',
        issueType: 'Story',
        priority: 'Low',
        prLinks: [this.samplePRs[1]],
        issueLinks: [],
        comments: [],
        targetStatus: 'To Do', // Keep in To Do
      },

      // C1: Bug with multiple comments only
      {
        id: 'C1',
        summary: '[C1] Database Performance - Discussion Only',
        description: 'Query performance degradation in user lookup operations',
        issueType: 'Bug',
        priority: 'Medium',
        prLinks: [],
        issueLinks: [],
        comments: [
          'Performance issues started appearing after user base grew beyond 10k.',
          'Initial analysis shows N+1 query problem in user relationships.',
          'Considering database indexing strategies vs query optimization.',
          'Team decision: Implement both indexing AND query optimization for maximum impact.',
        ],
        targetStatus: 'In Progress', // Active discussion = In Progress
      },

      // C2: Task with single comment and GitHub issue
      {
        id: 'C2',
        summary: '[C2] Migration Scripts - Internal Discussion',
        description: 'Create database migration for user preferences',
        issueType: 'Task',
        priority: 'High',
        prLinks: [],
        issueLinks: [this.sampleIssues[1]],
        comments: [
          'Migration strategy discussed in GitHub issue #46. Will use blue-green deployment approach.',
        ],
        targetStatus: 'Done', // Decision made, work complete
      },

      // D1: Baseline story with minimal data
      {
        id: 'D1',
        summary: '[D1] Search Functionality - Baseline Test',
        description: 'Add full-text search capabilities to the platform',
        issueType: 'Story',
        priority: 'Medium',
        prLinks: [],
        issueLinks: [],
        comments: [],
        targetStatus: 'To Do', // Just created, not started
      },

      // D2: Bug with mixed content and error conditions
      {
        id: 'D2',
        summary: '[D2] Cache Invalidation - Error Handling Test',
        description: 'Cache invalidation issues causing stale data',
        issueType: 'Bug',
        priority: 'High',
        prLinks: ['https://github.com/invalid/repo/pull/999'], // Invalid PR for testing
        issueLinks: [],
        comments: [
          'Cache issues reported by multiple users.',
          'Invalid PR link above should be handled gracefully by Chroniclr.',
          'Real fix will come in a separate PR once investigation is complete.',
        ],
        targetStatus: 'In Progress', // Under investigation
      },
    ];

    const createdIssues = [];

    for (const scenario of testScenarios) {
      try {
        // Create the issue
        const issueData = {
          fields: {
            project: { key: this.project },
            summary: scenario.summary,
            description: this.createDescription(
              scenario.description,
              scenario.prLinks,
              scenario.issueLinks
            ),
            issuetype: { name: scenario.issueType },
            // Note: priority field removed - not available on this project's screen
          },
        };

        const created = await this.makeRequest('POST', '/issue', issueData);

        console.log(
          `✅ Created [${scenario.id}] ${created.key}: ${scenario.summary}`
        );
        if (scenario.prLinks.length > 0) {
          console.log(`   🔗 PR Links: ${scenario.prLinks.length}`);
        }
        if (scenario.issueLinks.length > 0) {
          console.log(`   🐛 GitHub Issues: ${scenario.issueLinks.length}`);
        }

        // Add comments if specified
        for (const comment of scenario.comments) {
          await this.addComment(created.key, comment);
          await this.sleep(300); // Avoid rate limiting
        }

        if (scenario.comments.length > 0) {
          console.log(`   💬 Comments: ${scenario.comments.length}`);
        }

        // Transition to target status if specified
        if (scenario.targetStatus && scenario.targetStatus !== 'To Do') {
          await this.sleep(500); // Give time for issue to be fully created
          await this.transitionIssue(created.key, null, scenario.targetStatus);
        }

        createdIssues.push({
          scenario: scenario.id,
          key: created.key,
          summary: scenario.summary,
          type: scenario.issueType,
          url: `${this.baseUrl}/browse/${created.key}`,
          prLinks: scenario.prLinks.length,
          issueLinks: scenario.issueLinks.length,
          comments: scenario.comments.length,
          status: scenario.targetStatus || 'To Do',
        });

        console.log(); // Blank line for readability
        await this.sleep(1000); // Prevent rate limiting between issues
      } catch (error) {
        console.error(
          `❌ Failed to create scenario ${scenario.id}: ${error.message}`
        );
      }
    }

    return createdIssues;
  }

  async getProjectWorkflow() {
    try {
      // Get project details including workflow scheme
      const project = await this.makeRequest('GET', `/project/${this.project}`);

      // Get available statuses for the project
      const statuses = await this.makeRequest(
        'GET',
        `/project/${this.project}/statuses`
      );

      console.log('📋 Available workflow statuses:');
      const availableStatuses = [];

      if (statuses && statuses[0] && statuses[0].statuses) {
        statuses[0].statuses.forEach((status) => {
          console.log(
            `   • ${status.name} (${status.id}) - ${status.statusCategory.name}`
          );
          availableStatuses.push({
            id: status.id,
            name: status.name,
            category: status.statusCategory.name,
          });
        });
      }

      console.log();
      return availableStatuses;
    } catch (error) {
      console.error(`❌ Failed to get workflow info: ${error.message}`);
      return [];
    }
  }

  async transitionIssue(issueKey, transitionId, transitionName) {
    try {
      // Get available transitions for this issue
      const transitions = await this.makeRequest(
        'GET',
        `/issue/${issueKey}/transitions`
      );

      // Find the transition we want
      const targetTransition = transitions.transitions.find(
        (t) =>
          t.id === transitionId ||
          t.name.toLowerCase().includes(transitionName.toLowerCase())
      );

      if (!targetTransition) {
        console.log(
          `   ⚠️  Transition "${transitionName}" not available for ${issueKey}`
        );
        return false;
      }

      // Perform the transition
      const transitionData = {
        transition: {
          id: targetTransition.id,
        },
      };

      await this.makeRequest(
        'POST',
        `/issue/${issueKey}/transitions`,
        transitionData
      );
      console.log(`   🔄 Moved ${issueKey} to "${targetTransition.name}"`);
      return true;
    } catch (error) {
      console.error(`   ❌ Failed to transition ${issueKey}: ${error.message}`);
      return false;
    }
  }

  async getProjectInfo() {
    try {
      const project = await this.makeRequest('GET', `/project/${this.project}`);
      console.log(`📋 Project: ${project.name} (${project.key})`);
      console.log(`🔗 Project URL: ${project.self}\n`);
      return project;
    } catch (error) {
      console.error(`❌ Failed to get project info: ${error.message}`);
      return null;
    }
  }

  async listExistingIssues() {
    try {
      const search = await this.makeRequest(
        'GET',
        `/search?jql=project=${this.project}&maxResults=10`
      );
      if (search.issues && search.issues.length > 0) {
        console.log(`📝 Existing issues in ${this.project}:`);
        search.issues.forEach((issue) => {
          console.log(`   ${issue.key}: ${issue.fields.summary}`);
        });
        console.log();
      }
      return search.issues || [];
    } catch (error) {
      console.error(`❌ Failed to list issues: ${error.message}`);
      return [];
    }
  }

  async run() {
    try {
      console.log('🚀 Chroniclr Jira Test Matrix Creator\n');

      // Get project info
      await this.getProjectInfo();

      // Get workflow information
      await this.getProjectWorkflow();

      // List existing issues
      const existingIssues = await this.listExistingIssues();

      // Create comprehensive test matrix with workflow states
      const newIssues = await this.createTestMatrix();

      console.log('🎉 Test matrix creation complete!\n');

      // Print summaries
      this.printTestSummary(newIssues);
      this.printTestCommands(newIssues);
    } catch (error) {
      console.error(`❌ Script failed: ${error.message}`);
      process.exit(1);
    }
  }

  printTestSummary(issues) {
    console.log('📊 Test Matrix Summary:');
    console.log(`   • Total issues created: ${issues.length}`);
    console.log(
      `   • Issues with PR links: ${issues.filter((i) => i.prLinks > 0).length}`
    );
    console.log(
      `   • Issues with GitHub links: ${
        issues.filter((i) => i.issueLinks > 0).length
      }`
    );
    console.log(
      `   • Issues with comments: ${
        issues.filter((i) => i.comments > 0).length
      }`
    );
    console.log();

    console.log('🎯 Scenario Breakdown:');
    issues.forEach((issue) => {
      const statusEmoji =
        {
          'To Do': '📋',
          'In Progress': '🚧',
          'In Review': '👀',
          Done: '✅',
        }[issue.status] || '❓';

      console.log(
        `   [${issue.scenario}] ${issue.key} ${statusEmoji} ${issue.status} - PRs:${issue.prLinks} Issues:${issue.issueLinks} Comments:${issue.comments}`
      );
    });
    console.log();

    // Status distribution
    const statusCounts = {};
    issues.forEach((issue) => {
      statusCounts[issue.status] = (statusCounts[issue.status] || 0) + 1;
    });

    console.log('📈 Workflow Status Distribution:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      const emoji =
        {
          'To Do': '📋',
          'In Progress': '🚧',
          'In Review': '👀',
          Done: '✅',
        }[status] || '❓';
      console.log(`   ${emoji} ${status}: ${count} issues`);
    });
    console.log();
  }

  printTestCommands(issues) {
    console.log('🧪 Test Commands:');
    console.log();

    // Individual issue tests
    console.log('# Test individual scenarios:');
    issues.forEach((issue) => {
      console.log(
        `gh workflow run chroniclr.yml -f source=jira -f jira_keys=${issue.key}  # ${issue.scenario}`
      );
    });
    console.log();

    // Combined tests by type
    const fullIntegration = issues
      .filter((i) => i.scenario.startsWith('A'))
      .map((i) => i.key);
    const prOnly = issues
      .filter((i) => i.scenario.startsWith('B'))
      .map((i) => i.key);
    const commentsOnly = issues
      .filter((i) => i.scenario.startsWith('C'))
      .map((i) => i.key);
    const edge = issues
      .filter((i) => i.scenario.startsWith('D'))
      .map((i) => i.key);

    console.log('# Test by category:');
    if (fullIntegration.length)
      console.log(
        `gh workflow run chroniclr.yml -f source=jira -f jira_keys=${fullIntegration.join(
          ','
        )}  # Full integration tests`
      );
    if (prOnly.length)
      console.log(
        `gh workflow run chroniclr.yml -f source=jira -f jira_keys=${prOnly.join(
          ','
        )}  # PR-only tests`
      );
    if (commentsOnly.length)
      console.log(
        `gh workflow run chroniclr.yml -f source=jira -f jira_keys=${commentsOnly.join(
          ','
        )}  # Comments-only tests`
      );
    if (edge.length)
      console.log(
        `gh workflow run chroniclr.yml -f source=jira -f jira_keys=${edge.join(
          ','
        )}  # Edge case tests`
      );
    console.log();

    // All at once test
    const allKeys = issues.map((i) => i.key);
    console.log('# Test everything:');
    console.log(
      `gh workflow run chroniclr.yml -f source=jira -f jira_keys=${allKeys.join(
        ','
      )}  # All scenarios`
    );
  }
}

// Run the script
const creator = new JiraTestDataCreator();
creator.run();
