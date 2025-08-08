#!/usr/bin/env node

/**
 * GitHub Issue Creator for Action Items
 * Parses action items from discussions and creates assigned GitHub issues
 */

const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');
const path = require('path');

class ActionItemIssueCreator {
  constructor() {
    this.github = github.getOctokit(process.env.GITHUB_TOKEN);
    this.context = github.context;
  }

  getLabelConfig() {
    try {
      const configPath = path.join(process.cwd(), 'chroniclr.config.json');
      const raw = fs.readFileSync(configPath, 'utf8');
      const cfg = JSON.parse(raw);
      const issuesCfg = cfg.issues || {};
      return {
        defaultLabels: issuesCfg.defaultLabels || [
          'action-item',
          'chroniclr-generated',
          'needs-triage',
        ],
        enablePriorityLabels: issuesCfg.enablePriorityLabels !== false,
        enableHashtagLabels: issuesCfg.enableHashtagLabels !== false,
      };
    } catch (e) {
      return {
        defaultLabels: ['action-item', 'chroniclr-generated', 'needs-triage'],
        enablePriorityLabels: true,
        enableHashtagLabels: true,
      };
    }
  }

  parseHashtagLabels(text) {
    const labels = new Set();
    if (!text || typeof text !== 'string') return [];
    const re = /#([a-z0-9][a-z0-9-_]*)/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      labels.add(m[1]);
    }
    return Array.from(labels);
  }

  /**
   * Parse action items from discussion content
   * Looks for patterns like:
   * - [ ] @username: Task description (Due: Aug 10)
   * - [ ] Task description @username (deadline)
   * - Action Items: @user1, @user2: Description
   */
  parseActionItems(content) {
    const actionItems = [];
    const lines = content.split('\n');

    // Patterns to match action items
    const patterns = [
      // Checkbox format: - [ ] @username: Task description (Due: date)
      /^[-*]\s*\[\s*\]\s*@(\w+):\s*(.+?)(?:\s*\(Due:\s*(.+?)\))?$/i,
      // Alternative: - [ ] Task description @username (Due: date)
      /^[-*]\s*\[\s*\]\s*(.+?)\s*@(\w+)(?:\s*\(Due:\s*(.+?)\))?$/i,
      // Action Items section format: - @username: Description (Due: date)
      /^[-*]\s*@(\w+):\s*(.+?)(?:\s*\(Due:\s*(.+?)\))?$/i,
    ];

    let inActionItemsSection = false;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Check if we're entering an action items section
      if (trimmedLine.toLowerCase().includes('action item')) {
        inActionItemsSection = true;
        continue;
      }

      // Exit action items section on new header or empty line after items
      if (
        trimmedLine.startsWith('#') ||
        (inActionItemsSection && !trimmedLine && actionItems.length > 0)
      ) {
        inActionItemsSection = false;
        continue;
      }

      // Try to match action item patterns
      for (const pattern of patterns) {
        const match = trimmedLine.match(pattern);
        if (match) {
          let assignee, description, dueDate;

          if (match[1] && match[2] && !match[1].includes(' ')) {
            // Pattern 1 & 3: @username: description
            assignee = match[1];
            description = match[2];
            dueDate = match[3];
          } else if (match[2] && !match[2].includes(' ')) {
            // Pattern 2: description @username
            description = match[1];
            assignee = match[2];
            dueDate = match[3];
          }

          if (assignee && description) {
            actionItems.push({
              assignee: assignee.replace('@', ''),
              description: description.trim(),
              dueDate: dueDate ? dueDate.trim() : null,
              originalLine: trimmedLine,
            });
            break;
          }
        }
      }
    }

    return actionItems;
  }

  /**
   * Create GitHub issue for an action item
   */
  async createIssueForActionItem(actionItem, discussionData) {
    try {
      const cfg = this.getLabelConfig();
      const title = `[Action Item] ${actionItem.description}`;
      const body = this.buildVerifiableIssueBody(actionItem, discussionData);

      // Base labels from config
      const labels = [...cfg.defaultLabels];

      // Add hashtag-derived labels if enabled
      if (cfg.enableHashtagLabels) {
        const hashtagLabels = this.parseHashtagLabels(actionItem.description);
        for (const hl of hashtagLabels) labels.push(hl);
      }

      // Add priority label based on due date
      if (cfg.enablePriorityLabels && actionItem.dueDate) {
        const dueDate = new Date(actionItem.dueDate);
        const now = new Date();
        const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

        if (Number.isFinite(daysUntilDue)) {
          if (daysUntilDue <= 3) {
            labels.push('priority-high');
          } else if (daysUntilDue <= 7) {
            labels.push('priority-medium');
          } else {
            labels.push('priority-low');
          }
        }
      }

      // De-duplicate labels
      const uniqueLabels = Array.from(new Set(labels));

      const issueParams = {
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        title,
        body,
        labels: uniqueLabels,
      };

      // Add assignee if the user exists
      if (actionItem.assignee) {
        try {
          // Check if user exists and has access to repo
          await this.github.rest.users.getByUsername({
            username: actionItem.assignee,
          });

          issueParams.assignees = [actionItem.assignee];
          core.info(`Will assign issue to @${actionItem.assignee}`);
        } catch (error) {
          core.warning(
            `User @${actionItem.assignee} not found or cannot be assigned, creating unassigned issue`
          );
        }
      }

      const { data: issue } = await this.github.rest.issues.create(issueParams);

      core.info(`Created issue #${issue.number}: ${title}`);
      return {
        number: issue.number,
        url: issue.html_url,
        title: issue.title,
        assignee: actionItem.assignee,
      };
    } catch (error) {
      core.error(`Failed to create issue for action item: ${error.message}`);
      return null;
    }
  }

  /**
   * Ensure required labels exist in the repository
   */
  async ensureActionItemLabels(labelNames) {
    // Known defaults with colors/descriptions
    const defaults = {
      'action-item': {
        color: 'f29513',
        description: 'Action items from discussions',
      },
      'chroniclr-generated': {
        color: '0e8a16',
        description: 'Generated by Chroniclr',
      },
      'needs-triage': {
        color: 'd4edda',
        description: 'Needs initial review and categorization',
      },
      'priority-high': {
        color: 'd93f0b',
        description: 'High priority (due within 3 days)',
      },
      'priority-medium': {
        color: 'fbca04',
        description: 'Medium priority (due within 1 week)',
      },
      'priority-low': {
        color: '0075ca',
        description: 'Low priority (due later)',
      },
    };

    const toEnsure = Array.from(new Set(labelNames));

    for (const name of toEnsure) {
      const def = defaults[name] || {
        color: 'ededed',
        description: 'General label',
      };
      try {
        await this.github.rest.issues.getLabel({
          owner: this.context.repo.owner,
          repo: this.context.repo.repo,
          name,
        });
      } catch (error) {
        if (error.status === 404) {
          try {
            await this.github.rest.issues.createLabel({
              owner: this.context.repo.owner,
              repo: this.context.repo.repo,
              name,
              color: def.color,
              description: def.description,
            });
            core.info(`Created label: ${name}`);
          } catch (createError) {
            core.warning(
              `Failed to create label ${name}: ${createError.message}`
            );
          }
        }
      }
    }
  }

  /**
   * Get existing issues created by Chroniclr for this discussion
   */
  async getExistingActionItemIssues(discussionNumber) {
    try {
      const { data: issues } = await this.github.rest.issues.listForRepo({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        labels: 'chroniclr-generated,action-item',
        state: 'all', // Include both open and closed issues
      });

      // Filter issues that belong to this specific discussion
      const discussionIssues = issues.filter(
        (issue) =>
          issue.body && issue.body.includes(`discussion #${discussionNumber}`)
      );

      core.info(
        `Found ${discussionIssues.length} existing action item issues for discussion #${discussionNumber}`
      );
      return discussionIssues;
    } catch (error) {
      core.warning(`Failed to fetch existing issues: ${error.message}`);
      return [];
    }
  }

  /**
   * Generate a unique key for an action item to enable deduplication
   */
  getActionItemKey(actionItem) {
    // Use assignee + description as unique identifier (normalized)
    const assignee = (actionItem.assignee || 'unassigned').toLowerCase();
    const description = actionItem.description.toLowerCase().trim();
    return `${assignee}:${description}`;
  }

  /**
   * Check if action item matches an existing issue
   */
  actionItemMatchesIssue(actionItem, issue) {
    if (!issue.body) return false;

    // Extract original action item from issue body
    const originalLineMatch = issue.body.match(
      /\*\*Original Action Item\*\*:\s*(.+)/
    );
    if (!originalLineMatch) return false;

    const originalLine = originalLineMatch[1];
    const actionItemKey = this.getActionItemKey(actionItem);

    // Parse the original line to get assignee and description
    const patterns = [
      /^[-*]\s*\[\s*\]\s*@(\w+):\s*(.+?)(?:\s*\(Due:\s*(.+?)\))?$/i,
      /^[-*]\s*\[\s*\]\s*(.+?)\s*@(\w+)(?:\s*\(Due:\s*(.+?)\))?$/i,
      /^[-*]\s*@(\w+):\s*(.+?)(?:\s*\(Due:\s*(.+?)\))?$/i,
    ];

    for (const pattern of patterns) {
      const match = originalLine.match(pattern);
      if (match) {
        let originalAssignee, originalDescription;

        if (match[1] && match[2] && !match[1].includes(' ')) {
          originalAssignee = match[1];
          originalDescription = match[2];
        } else if (match[2] && !match[2].includes(' ')) {
          originalDescription = match[1];
          originalAssignee = match[2];
        }

        if (originalAssignee && originalDescription) {
          const originalKey = `${originalAssignee.toLowerCase()}:${originalDescription
            .toLowerCase()
            .trim()}`;
          return actionItemKey === originalKey;
        }
      }
    }

    return false;
  }

  /**
   * Update an existing issue if action item details have changed
   */
  async updateIssueForActionItem(actionItem, existingIssue, discussionData) {
    try {
      const newTitle = `[Action Item] ${actionItem.description}`;
      const newBody =
        this.buildVerifiableIssueBody(actionItem, discussionData) +
        `\n*Last updated: ${new Date().toISOString()}*`;

      // Check if update is needed
      const needsUpdate =
        existingIssue.title !== newTitle ||
        existingIssue.body !== newBody ||
        existingIssue.state === 'closed';

      if (needsUpdate) {
        const updateParams = {
          owner: this.context.repo.owner,
          repo: this.context.repo.repo,
          issue_number: existingIssue.number,
          title: newTitle,
          body: newBody,
          state: 'open', // Reopen if it was closed
        };

        // Update assignee if needed
        if (actionItem.assignee) {
          try {
            await this.github.rest.users.getByUsername({
              username: actionItem.assignee,
            });
            updateParams.assignees = [actionItem.assignee];
          } catch (error) {
            core.warning(
              `User @${actionItem.assignee} not found, leaving unassigned`
            );
          }
        }

        await this.github.rest.issues.update(updateParams);
        core.info(
          `Updated existing issue #${existingIssue.number}: ${newTitle}`
        );

        return {
          number: existingIssue.number,
          url: existingIssue.html_url,
          title: newTitle,
          assignee: actionItem.assignee,
          action: 'updated',
        };
      } else {
        core.info(`No changes needed for issue #${existingIssue.number}`);
        return {
          number: existingIssue.number,
          url: existingIssue.html_url,
          title: existingIssue.title,
          assignee: actionItem.assignee,
          action: 'unchanged',
        };
      }
    } catch (error) {
      core.error(
        `Failed to update issue #${existingIssue.number}: ${error.message}`
      );
      return null;
    }
  }

  /**
   * Close issues for action items that no longer exist in the discussion
   */
  async closeRemovedActionItemIssues(
    existingIssues,
    currentActionItems,
    discussionNumber
  ) {
    const closedIssues = [];

    for (const existingIssue of existingIssues) {
      if (existingIssue.state === 'closed') continue; // Skip already closed issues

      // Check if this existing issue matches any current action item
      const stillExists = currentActionItems.some((actionItem) =>
        this.actionItemMatchesIssue(actionItem, existingIssue)
      );

      if (!stillExists) {
        try {
          // Close the issue and add a comment explaining why
          await this.github.rest.issues.update({
            owner: this.context.repo.owner,
            repo: this.context.repo.repo,
            issue_number: existingIssue.number,
            state: 'closed',
            state_reason: 'completed', // Mark as completed rather than not_planned
          });

          await this.github.rest.issues.createComment({
            owner: this.context.repo.owner,
            repo: this.context.repo.repo,
            issue_number: existingIssue.number,
            body: `🤖 **Automatically closed by Chroniclr**\n\nThis action item no longer exists in discussion #${discussionNumber}. The original action item may have been completed, modified, or removed from the discussion.\n\n*If this was closed in error, please reopen the issue.*`,
          });

          closedIssues.push({
            number: existingIssue.number,
            title: existingIssue.title,
            action: 'closed',
          });

          core.info(
            `Closed removed action item issue #${existingIssue.number}`
          );
        } catch (error) {
          core.error(
            `Failed to close issue #${existingIssue.number}: ${error.message}`
          );
        }
      }
    }

    return closedIssues;
  }

  /**
   * Build a verifiable issue body from action item and discussion data
   */
  buildVerifiableIssueBody(actionItem, discussionData) {
    const lines = [];
    lines.push('## Action Item from Discussion');
    lines.push('');
    lines.push(
      `**Source Discussion**: [${discussionData.title}](${discussionData.url})`
    );
    lines.push(`**Original Action Item**: ${actionItem.originalLine}`);
    lines.push('');
    lines.push('### Description');
    lines.push(actionItem.description);
    lines.push('');
    if (actionItem.dueDate) {
      lines.push('### Due Date');
      lines.push(actionItem.dueDate);
      lines.push('');
    }
    lines.push(`### Context`);
    lines.push(
      `This action item was extracted from discussion #${discussionData.number} and automatically converted to a trackable GitHub issue.`
    );
    lines.push('');
    lines.push('---');
    lines.push(
      `*Auto-generated by Chroniclr from discussion #${discussionData.number}*`
    );
    return lines.join('\n');
  }

  /**
   * Process all action items from discussion content with smart deduplication
   */
  async processActionItems(discussionData) {
    try {
      core.info('Processing action items from discussion content...');
      const cfg = this.getLabelConfig();

      // Parse action items from discussion content
      if (!discussionData.body) {
        core.warning(
          'Discussion body is undefined or empty. No action items to process.'
        );
        return;
      }

      const actionItems = this.parseActionItems(discussionData.body);
      core.info(`Found ${actionItems.length} action items in discussion`);

      // Determine labels to ensure
      const ensureSet = new Set(cfg.defaultLabels);
      if (cfg.enablePriorityLabels) {
        ensureSet.add('priority-high');
        ensureSet.add('priority-medium');
        ensureSet.add('priority-low');
      }
      if (cfg.enableHashtagLabels) {
        for (const ai of actionItems) {
          if (ai && ai.description) {
            this.parseHashtagLabels(ai.description).forEach((l) =>
              ensureSet.add(l)
            );
          }
        }
      }

      // Ensure required labels exist
      await this.ensureActionItemLabels(Array.from(ensureSet));

      // Get existing issues for this discussion
      const existingIssues = await this.getExistingActionItemIssues(
        discussionData.number
      );

      const processedIssues = [];
      const createdIssues = [];
      const updatedIssues = [];
      const unchangedIssues = [];
      const failures = [];

      // Process each current action item
      for (const actionItem of actionItems) {
        core.info(
          `Processing: ${actionItem.description} (assigned to: ${
            actionItem.assignee || 'unassigned'
          })`
        );

        // Check if issue already exists for this action item
        const existingIssue = existingIssues.find((issue) =>
          this.actionItemMatchesIssue(actionItem, issue)
        );

        if (existingIssue) {
          const result = await this.updateIssueForActionItem(
            actionItem,
            existingIssue,
            discussionData
          );
          if (result) {
            processedIssues.push(result);
            if (result.action === 'updated') {
              updatedIssues.push(result);
            } else {
              unchangedIssues.push(result);
            }
          }
        } else {
          // Create new issue for action item
          const result = await this.createIssueForActionItem(
            actionItem,
            discussionData
          );
          if (result) {
            processedIssues.push(result);
            createdIssues.push(result);
          } else {
            failures.push(actionItem);
          }
        }
      }

      // Close issues that are no longer relevant
      const closedIssues = await this.closeRemovedActionItemIssues(
        existingIssues,
        actionItems,
        discussionData.number
      );

      core.info(`\n---\n`);
      core.info(
        `Processed Action Items for Discussion #${discussionData.number}:`
      );
      core.info(`Total Found: ${actionItems.length}`);
      core.info(`Issues Created: ${createdIssues.length}`);
      core.info(`Issues Updated: ${updatedIssues.length}`);
      core.info(`Issues Unchanged: ${unchangedIssues.length}`);
      core.info(`Issues Closed: ${closedIssues.length}`);
      core.info(`Failures: ${failures.length}`);

      if (failures.length > 0) {
        core.warning(
          `Some action items could not be processed: ${failures
            .map((ai) => ai.description)
            .join(', ')}`
        );
      }
    } catch (error) {
      core.error(`Failed to process action items: ${error.message}`);
    }
  }
}

async function run() {
  try {
    // Check if the required properties exist
    if (!github.context.issue) {
      core.setFailed(
        'No issue or discussion context found. Are you running from a workflow?'
      );
      return;
    }

    const discussionData = {
      number: github.context.issue.number,
      title: github.context.issue.title,
      url: github.context.issue.html_url,
      body: github.context.issue.body,
    };

    // Log some debug information
    core.info(
      `Processing discussion #${discussionData.number}: ${discussionData.title}`
    );
    core.info(
      `Body content: ${
        discussionData.body
          ? 'Present (length: ' + discussionData.body.length + ')'
          : 'Missing'
      }`
    );

    const creator = new ActionItemIssueCreator();
    await creator.processActionItems(discussionData);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
