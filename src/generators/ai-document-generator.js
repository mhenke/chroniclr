#!/usr/bin/env node

/**
 * Simple AI Document Generator for GitHub Actions
 * GitHub Actions + AI + Hard Data from Sources
 */

const core = require('@actions/core');
const fs = require('fs').promises;
const path = require('path');
const { PullRequestClient } = require('../utils/pr-client');
const { IssuesClient } = require('../utils/issues-client');
const { JiraClient } = require('../utils/jira-client');

class AIDocumentGenerator {
  constructor() {
    this.baseURL = 'https://models.github.ai/inference';
    this.apiKey = process.env.GITHUB_TOKEN;
    this.model = 'gpt-4o';

    // Initialize data source clients
    this.prClient = new PullRequestClient();
    this.issuesClient = new IssuesClient();
    this.jiraClient = null;

    core.info(`AI Generator initialized with model: ${this.model}`);
  }

  getJiraClient() {
    if (!this.jiraClient) {
      this.jiraClient = new JiraClient();
    }
    return this.jiraClient;
  }

  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async generateCompletion(prompt) {
    const maxRetries = 3;
    const baseDelayMs = 2000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        core.info(
          `Making AI API request... (attempt ${attempt + 1}/${maxRetries + 1})`
        );

        const response = await fetch(`${this.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              {
                role: 'system',
                content:
                  'You are a professional documentation generator. Create well-structured, comprehensive documents based on the provided data sources.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            max_tokens: 4000,
            temperature: 0.3,
          }),
        });

        if (!response.ok) {
          const errorMessage = `AI API request failed: ${response.status} ${response.statusText}`;
          core.error(`❌ ${errorMessage}`);
          throw new Error(errorMessage);
        }

        const data = await response.json();
        if (data.choices && data.choices.length > 0) {
          core.info('✅ AI response received successfully');
          return data.choices[0].message.content;
        }

        throw new Error('No AI response content received');
      } catch (error) {
        core.error(`AI API request error: ${error.message}`);
        if (attempt === maxRetries) {
          throw error;
        }
        await this.sleep(baseDelayMs * Math.pow(2, attempt));
      }
    }

    throw new Error('AI API failed after all retry attempts');
  }

  async collectDataFromSources() {
    const sourceModules = (process.env.SOURCE_MODULES || 'discussion')
      .split(',')
      .map((s) => s.trim());

    const collectedData = {
      discussion: null,
      prs: [],
      issues: [],
      jiraIssues: [],
      sources: sourceModules,
    };

    // Collect Discussion Data
    if (sourceModules.includes('discussion') && process.env.DISCUSSION_NUMBER) {
      collectedData.discussion = {
        number: process.env.DISCUSSION_NUMBER,
        title: process.env.DISCUSSION_TITLE || 'Discussion',
        body: process.env.DISCUSSION_BODY || '',
        author: process.env.DISCUSSION_AUTHOR || 'unknown',
        url: process.env.DISCUSSION_URL || '',
        commentsCount: parseInt(process.env.DISCUSSION_COMMENTS_COUNT) || 0,
      };
      core.info(
        `✅ Collected discussion data: #${collectedData.discussion.number}`
      );
    }

    // Collect PR Data
    if (sourceModules.includes('pr') && process.env.PR_NUMBERS) {
      const prNumbers = process.env.PR_NUMBERS.split(',')
        .map((n) => n.trim())
        .filter((n) => n);
      collectedData.prs = await this.prClient.fetchPullRequests(prNumbers);
      core.info(`✅ Collected ${collectedData.prs.length} PRs`);
    }

    // Collect Issues Data
    if (sourceModules.includes('issues') && process.env.ISSUE_NUMBERS) {
      const issueNumbers = process.env.ISSUE_NUMBERS.split(',')
        .map((n) => n.trim())
        .filter((n) => n);
      collectedData.issues = await this.issuesClient.fetchIssues(issueNumbers);
      core.info(`✅ Collected ${collectedData.issues.length} issues`);
    }

    // Collect Jira Data
    if (sourceModules.includes('jira') && process.env.JIRA_KEYS) {
      const jiraClient = this.getJiraClient();
      const jiraKeys = process.env.JIRA_KEYS.split(',')
        .map((k) => k.trim())
        .filter((k) => k);
      collectedData.jiraIssues = await jiraClient.fetchJiraIssues(jiraKeys);
      core.info(`✅ Collected ${collectedData.jiraIssues.length} Jira issues`);
    }

    return collectedData;
  }

  createAIPrompt(docType, data, template) {
    let prompt = `Generate a comprehensive ${docType} document using the following data sources. Include EXACT DETAILS and hard data from the sources:\n\n`;

    // Add discussion content with full details
    if (data.discussion) {
      prompt += `## Discussion Data\n`;
      prompt += `- **Number**: #${data.discussion.number}\n`;
      prompt += `- **Title**: ${data.discussion.title}\n`;
      prompt += `- **Author**: @${data.discussion.author}\n`;
      prompt += `- **URL**: ${data.discussion.url}\n`;
      prompt += `- **Comments**: ${data.discussion.commentsCount}\n`;
      prompt += `\n**Full Content**:\n${data.discussion.body}\n\n`;
    }

    // Add PR content with detailed file changes
    if (data.prs.length > 0) {
      prompt += `## Pull Requests (${data.prs.length})\n`;
      data.prs.forEach((pr) => {
        prompt += `### PR #${pr.number}: ${pr.title}\n`;
        prompt += `- **Author**: @${pr.author}\n`;
        prompt += `- **Status**: ${pr.state}${pr.merged ? ' (MERGED)' : ''}\n`;
        prompt += `- **URL**: ${pr.url}\n`;
        prompt += `- **Files Changed**: ${pr.files.length}\n`;
        if (pr.files.length > 0) {
          const totalAdditions = pr.files.reduce(
            (sum, file) => sum + file.additions,
            0
          );
          const totalDeletions = pr.files.reduce(
            (sum, file) => sum + file.deletions,
            0
          );
          prompt += `- **Lines**: +${totalAdditions}, -${totalDeletions}\n`;
          prompt += `- **Key Files**: ${pr.files
            .slice(0, 5)
            .map((f) => f.filename)
            .join(', ')}\n`;
        }
        if (pr.jiraKeys.length > 0) {
          prompt += `- **Jira Keys**: ${pr.jiraKeys.join(', ')}\n`;
        }
        if (pr.body) {
          prompt += `\n**Description**: ${pr.body}\n`;
        }
        prompt += `\n`;
      });
      prompt += `\n`;
    }

    // Add issues content with full metadata
    if (data.issues.length > 0) {
      prompt += `## GitHub Issues (${data.issues.length})\n`;
      data.issues.forEach((issue) => {
        prompt += `### Issue #${issue.number}: ${issue.title}\n`;
        prompt += `- **Author**: @${issue.author}\n`;
        prompt += `- **Status**: ${issue.state.toUpperCase()}\n`;
        prompt += `- **URL**: ${issue.url}\n`;
        prompt += `- **Created**: ${issue.createdAt}\n`;
        if (issue.closedAt) {
          prompt += `- **Closed**: ${issue.closedAt}\n`;
        }
        if (issue.labels.length > 0) {
          prompt += `- **Labels**: ${issue.labels
            .map((l) => l.name)
            .join(', ')}\n`;
        }
        if (issue.assignees.length > 0) {
          prompt += `- **Assignees**: ${issue.assignees
            .map((a) => '@' + a)
            .join(', ')}\n`;
        }
        if (issue.milestone) {
          prompt += `- **Milestone**: ${issue.milestone.title}\n`;
        }
        if (issue.body) {
          prompt += `\n**Description**: ${issue.body}\n`;
        }
        prompt += `\n`;
      });
      prompt += `\n`;
    }

    // Add Jira content with full project data
    if (data.jiraIssues.length > 0) {
      prompt += `## Jira Issues (${data.jiraIssues.length})\n`;
      data.jiraIssues.forEach((issue) => {
        prompt += `### ${issue.key}: ${issue.summary}\n`;
        prompt += `- **Type**: ${issue.issueType}\n`;
        prompt += `- **Status**: ${issue.status}\n`;
        prompt += `- **Priority**: ${issue.priority}\n`;
        prompt += `- **Assignee**: ${issue.assignee}\n`;
        prompt += `- **Reporter**: ${issue.reporter}\n`;
        prompt += `- **Project**: ${issue.project}\n`;
        prompt += `- **URL**: ${issue.url}\n`;
        prompt += `- **Created**: ${issue.created}\n`;
        if (issue.resolved) {
          prompt += `- **Resolved**: ${issue.resolved}\n`;
        }
        if (issue.components.length > 0) {
          prompt += `- **Components**: ${issue.components.join(', ')}\n`;
        }
        if (issue.fixVersions.length > 0) {
          prompt += `- **Fix Versions**: ${issue.fixVersions.join(', ')}\n`;
        }
        if (issue.labels.length > 0) {
          prompt += `- **Labels**: ${issue.labels.join(', ')}\n`;
        }
        if (issue.description) {
          prompt += `\n**Description**: ${issue.description}\n`;
        }
        prompt += `\n`;
      });
      prompt += `\n`;
    }

    prompt += `## INSTRUCTIONS\n`;
    prompt += `Create a comprehensive ${docType} document that:\n`;
    prompt += `1. **Uses ALL hard data** - Include exact numbers, dates, names, URLs, and statistics from above\n`;
    prompt += `2. **Synthesizes with AI** - Provide intelligent analysis, insights, and professional formatting\n`;
    prompt += `3. **Follows template structure** - Use the template format below as a guide\n`;
    prompt += `4. **Links to sources** - Reference specific PRs, issues, discussions, and Jira tickets\n`;
    prompt += `5. **Provides actionable content** - Extract decisions, action items, and next steps from the data\n`;
    prompt += `6. **Replace ALL placeholders** - Use actual dates (${
      new Date().toISOString().split('T')[0]
    }), real status values, and concrete information. Do NOT leave [Insert...] or [TBD] placeholders.\n`;
    if (docType === 'meeting-notes') {
      prompt += `7. **Previous Meeting Notes** - Only include a reference to previous meeting notes if you can verify they exist. Otherwise, omit this reference entirely.\n`;
    }
    prompt += `\n`;

    prompt += `Template Structure:\n${template}`;

    return prompt;
  }

  async loadTemplate(docType) {
    const templatePath = path.join(
      process.cwd(),
      'src',
      'templates',
      `${docType}.md`
    );
    try {
      const template = await fs.readFile(templatePath, 'utf8');
      return template;
    } catch (error) {
      core.warning(`Template not found for ${docType}, using basic template`);
      return `# {title}\n\n**Date:** {date}\n**Type:** ${docType}\n\n## Content\n\n{content}\n\n---\n*This document was automatically generated by Chroniclr*`;
    }
  }

  async generateDocument() {
    try {
      const docTypesString = process.env.DOC_TYPE || 'summary';
      const docTypes = docTypesString
        .split(' ')
        .map((type) => type.trim())
        .filter((type) => type);

      core.info(
        `Processing ${docTypes.length} document types: ${docTypes.join(', ')}`
      );

      // Collect data from all enabled sources
      const data = await this.collectDataFromSources();

      // Generate each document individually (simple approach)
      const results = [];
      for (const docType of docTypes) {
        try {
          core.info(`Generating ${docType} document...`);

          // Load template
          const template = await this.loadTemplate(docType);

          // Create AI prompt
          const prompt = this.createAIPrompt(docType, data, template);

          // Generate content with AI
          const aiContent = await this.generateCompletion(prompt);

          // Save document
          const result = await this.saveDocument(docType, data, aiContent);
          if (result) {
            results.push(result);
          }
        } catch (error) {
          core.error(`Failed to generate ${docType}: ${error.message}`);
          // Continue with other documents
        }
      }

      if (results.length === 0) {
        throw new Error('No documents were generated successfully');
      }

      core.info(
        `✅ Successfully generated ${results.length}/${docTypes.length} documents`
      );
      return results;
    } catch (error) {
      core.error(`Document generation failed: ${error.message}`);
      throw error;
    }
  }

  extractTopicFromTitle(title) {
    if (!title) return 'general';

    // Extract meaningful keywords, skip common words
    const skipWords = [
      'the',
      'and',
      'for',
      'with',
      'fix',
      'add',
      'update',
      'improve',
      'bug',
      'issue',
    ];
    const words = title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !skipWords.includes(word))
      .slice(0, 3);

    if (words.length === 0) {
      return (
        title
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .split(/\s+/)
          .slice(0, 3)
          .join('-') || 'general'
      );
    }

    return words.join('-').substring(0, 20);
  }

  async generateAITopic(data) {
    // Simple topic extraction without AI to avoid rate limits
    if (data.discussion) {
      return this.extractTopicFromTitle(data.discussion.title);
    } else if (data.prs.length > 0) {
      return this.extractTopicFromTitle(data.prs[0].title);
    } else if (data.issues.length > 0) {
      return this.extractTopicFromTitle(data.issues[0].title);
    } else if (data.jiraIssues.length > 0) {
      return this.extractTopicFromTitle(data.jiraIssues[0].summary);
    }
    return 'general';
  }

  async determineSourceFolder(data) {
    const today = new Date().toISOString().split('T')[0];
    const topic = await this.generateAITopic(data);

    // Check if folder exists and add version number if needed
    const baseFolder = `${today}-${topic}`;
    const basePath = path.join(process.cwd(), 'generated');

    let folderName = baseFolder;
    let version = 2;

    const fs = require('fs');
    while (fs.existsSync(path.join(basePath, folderName))) {
      folderName = `${baseFolder}-${version}`;
      version++;
    }

    return folderName;
  }

  generateFileName(docType, data) {
    if (data.discussion) {
      return `${docType}-${data.discussion.number}.md`;
    } else if (data.prs.length > 0) {
      return `${docType}-pr-${data.prs.map((pr) => pr.number).join('-')}.md`;
    } else if (data.issues.length > 0) {
      return `${docType}-issues-${data.issues
        .map((i) => i.number)
        .join('-')}.md`;
    } else if (data.jiraIssues.length > 0) {
      return `${docType}-jira-${data.jiraIssues
        .map((j) => j.key)
        .join('-')}.md`;
    } else {
      const timestamp = Date.now();
      return `${docType}-${timestamp}.md`;
    }
  }

  /**
   * Check if there are previous meeting notes in the generated folder
   */
  async findPreviousMeetingNotes(data) {
    try {
      const generatedPath = path.join(process.cwd(), 'generated');

      // Get all folders in generated directory
      const folders = await fs.readdir(generatedPath, { withFileTypes: true });
      const dateFolders = folders
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .filter((name) => name.match(/^\d{4}-\d{2}-\d{2}-/))
        .sort()
        .reverse(); // Most recent first

      // Look for meeting notes files in previous folders
      for (const folder of dateFolders) {
        const folderPath = path.join(generatedPath, folder);
        try {
          const files = await fs.readdir(folderPath);
          const meetingNotesFiles = files.filter(
            (file) => file.startsWith('meeting-notes-') && file.endsWith('.md')
          );

          if (meetingNotesFiles.length > 0) {
            // Return the path to the most recent meeting notes file
            const relativePath = `generated/${folder}/${meetingNotesFiles[0]}`;
            return relativePath;
          }
        } catch (error) {
          // Skip folders we can't read
          continue;
        }
      }

      return null; // No previous meeting notes found
    } catch (error) {
      core.warning(
        `Failed to check for previous meeting notes: ${error.message}`
      );
      return null;
    }
  }

  /**
   * Post-process AI-generated content to replace any remaining placeholder text
   */
  async postProcessContent(content, data, docType) {
    const currentDate = new Date().toISOString().split('T')[0];
    const currentDateTime = new Date().toISOString();
    const currentTime =
      new Date().toLocaleTimeString('en-US', {
        hour12: false,
        timeZone: 'UTC',
        hour: '2-digit',
        minute: '2-digit',
      }) + ' UTC';

    // Replace common placeholder patterns that AI might generate
    let processedContent = content
      // Date placeholders
      .replace(/\[Insert Current Date\]/g, currentDate)
      .replace(/\[Insert Date\]/g, currentDate)
      .replace(/\[Current Date\]/g, currentDate)
      .replace(/\[Date\]/g, currentDate)
      .replace(/\{date\}/g, currentDate)
      .replace(/\{currentDate\}/g, currentDate)
      .replace(/\{lastUpdated\}/g, currentDate)

      // Time placeholders
      .replace(/\[Insert Current Time\]/g, currentTime)
      .replace(/\[Current Time\]/g, currentTime)
      .replace(/\{time\}/g, currentTime)

      // Status placeholders
      .replace(/\[Insert Status\]/g, 'Active')
      .replace(/\[Status\]/g, 'Active')
      .replace(/\{status\}/g, 'Active')

      // Title placeholders
      .replace(
        /\{title\}/g,
        data.discussion?.title || 'Generated Documentation'
      )

      // Discussion-specific placeholders
      .replace(/\{discussionNumber\}/g, data.discussion?.number || '')
      .replace(/\{discussionUrl\}/g, data.discussion?.url || '')

      // Generic placeholders that might appear
      .replace(/\[Insert.*?\]/g, 'TBD')
      .replace(/\[TBD\]/g, 'TBD')
      .replace(/\[TODO\]/g, 'TBD');

    // Handle previous meeting notes logic for meeting notes documents
    if (docType === 'meeting-notes') {
      const previousNotesPath = await this.findPreviousMeetingNotes(data);

      if (previousNotesPath) {
        // Replace the placeholder with actual link
        processedContent = processedContent.replace(
          /\{previousMeetingNotes\}/g,
          previousNotesPath
        );
        // Also handle cases where AI might generate the link directly
        processedContent = processedContent.replace(
          /\[Previous Meeting Notes\]\([^)]*\)/g,
          `[Previous Meeting Notes](${previousNotesPath})`
        );
      } else {
        // Remove the previous meeting notes line entirely
        processedContent = processedContent.replace(
          /^\s*-\s*\[Previous Meeting Notes\].*$/gm,
          ''
        );
        // Remove the placeholder as well
        processedContent = processedContent.replace(
          /\{previousMeetingNotes\}/g,
          ''
        );
        // Clean up any empty lines that might be left
        processedContent = processedContent.replace(/\n\n\n+/g, '\n\n');
      }
    }

    return processedContent;
  }

  async saveDocument(docType, data, content) {
    try {
      const baseOutputDir = path.join(process.cwd(), 'generated');
      const sourceFolder = await this.determineSourceFolder(data);
      const outputDir = path.join(baseOutputDir, sourceFolder);
      await fs.mkdir(outputDir, { recursive: true });

      const fileName = this.generateFileName(docType, data);
      const filePath = path.join(outputDir, fileName);

      // Post-process the content to replace any remaining placeholders
      const processedContent = await this.postProcessContent(
        content,
        data,
        docType
      );

      await fs.writeFile(filePath, processedContent, 'utf8');

      core.info(`✅ Generated document: ${fileName}`);
      return { filePath, fileName, content };
    } catch (error) {
      core.error(`Failed to save ${docType} document: ${error.message}`);
      return null;
    }
  }
}

// CLI execution
if (require.main === module) {
  const generator = new AIDocumentGenerator();
  generator.generateDocument().catch((error) => {
    core.setFailed(error.message);
    process.exit(1);
  });
}

module.exports = { AIDocumentGenerator };
