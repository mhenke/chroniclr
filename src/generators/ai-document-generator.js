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
    try {
      core.info('Making AI API request...');

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
                'Create well-structured documentation from the provided data. Replace all placeholders with actual values.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: 2000,
          temperature: 0.2,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI API failed: ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (error) {
      core.warning(`AI generation failed: ${error.message}`);
      return null; // Will fall back to template
    }
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
      };
      core.info(`✅ Collected discussion #${collectedData.discussion.number}`);
    }

    // Collect PR Data
    if (sourceModules.includes('pr') && process.env.PR_NUMBERS) {
      const prNumbers = process.env.PR_NUMBERS.split(',')
        .map((n) => n.trim())
        .filter((n) => n);
      collectedData.prs = await this.prClient.fetchPullRequests(prNumbers);
      core.info(`✅ Collected ${collectedData.prs.length} PRs`);
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

  async createAIPrompt(docType, data, template) {
    let prompt = `Create a ${docType} document with the following data:\n\n`;

    // Discussion data
    if (data.discussion) {
      prompt += `**Discussion #${data.discussion.number}**: ${data.discussion.title}\n`;
      prompt += `Author: @${data.discussion.author}\n`;
      prompt += `Content: ${data.discussion.body}\n\n`;
    }

    // PR data - simplified
    if (data.prs.length > 0) {
      prompt += `**Pull Requests:**\n`;
      data.prs.forEach((pr) => {
        prompt += `- PR #${pr.number}: ${pr.title} (${pr.state})\n`;
        if (pr.jiraKeys.length > 0) {
          prompt += `  Jira: ${pr.jiraKeys.join(', ')}\n`;
        }
      });
      prompt += `\n`;
    }

    // Jira data - detailed for sprint-status documents
    if (data.jiraIssues.length > 0) {
      prompt += `**Jira Issues:**\n`;
      data.jiraIssues.forEach((issue) => {
        prompt += `- ${issue.key}: ${issue.summary} (${issue.status}, ${issue.priority})\n`;
        prompt += `  Type: ${issue.issueType}, Assignee: ${issue.assignee}\n`;
      });
      prompt += `\n`;

      // For sprint-status documents, include detailed sprint data
      if (docType === 'sprint-status') {
        const jiraClient = this.getJiraClient();
        if (jiraClient.enabled) {
          const sprintData = await jiraClient.generateSprintStatusReport(
            data.jiraIssues,
            data.prs && data.prs.length > 0
              ? this.prClient.generatePRTestingReport(data.prs)
              : null
          );

          prompt += `**Sprint Information:**\n`;
          prompt += `- Sprint: ${sprintData.sprintName}\n`;
          prompt += `- Status: ${sprintData.sprintStatus}\n`;
          prompt += `- Duration: ${sprintData.sprintStartDate} to ${sprintData.sprintEndDate}\n`;
          prompt += `- Goal: ${sprintData.sprintGoal}\n`;
          prompt += `- Progress: ${sprintData.sprintProgress}%\n`;
          prompt += `- Days Remaining: ${sprintData.daysRemaining}\n`;
          prompt += `- Total Issues: ${sprintData.totalJiraIssues}\n\n`;

          prompt += `**Issue Status Breakdown:**\n`;
          Object.entries(sprintData.issuesByStatus).forEach(([status, issues]) => {
            prompt += `- ${status}: ${issues.length} issues\n`;
          });
          prompt += `\n`;
        }
      }
    }

    prompt += `Use this template structure:\n${template}\n\n`;
    
    if (docType === 'release') {
      prompt += `For release documentation:
- Generate a realistic release date (within 1-2 weeks from today)
- Create bullet points for "What is included" based on the Jira issues and PRs
- Write a compelling "Why this matters" statement based on the changes
- Describe the "Impact" considering the scope of changes
- Provide practical "Next steps" for post-release activities
- Use a professional but accessible tone
`;
    }
    
    prompt += `Replace all {placeholders} with actual values from the data above. Use today's date: ${
      new Date().toISOString().split('T')[0]
    }. Do not fabricate any data - only use the real data provided above.`;

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
      
      // Support both comma and space separated document types
      const docTypes = docTypesString
        .split(/[,\s]+/)
        .map((type) => type.trim())
        .filter((type) => type);

      // Validate document types against available templates
      const validTypes = [];
      const invalidTypes = [];
      
      for (const docType of docTypes) {
        try {
          await this.loadTemplate(docType);
          validTypes.push(docType);
        } catch (error) {
          invalidTypes.push(docType);
          core.warning(`⚠️ Skipping invalid document type: ${docType} (template not found)`);
        }
      }

      if (invalidTypes.length > 0) {
        core.warning(`❌ Invalid document types skipped: ${invalidTypes.join(', ')}`);
      }

      if (validTypes.length === 0) {
        throw new Error('No valid document types provided. Available types: summary, sprint-status, pr-report, meeting-notes, initiative-brief, changelog, release');
      }

      core.info(
        `Generating ${validTypes.length} document types: ${validTypes.join(', ')}`
      );

      // Collect data from enabled sources
      const data = await this.collectDataFromSources();

      // Generate documents with AI enhancement and template fallback
      const results = [];
      for (const docType of validTypes) {
        try {
          core.info(`Generating ${docType} document...`);

          const template = await this.loadTemplate(docType);
          let content;

          // Try AI generation first
          try {
            const prompt = await this.createAIPrompt(docType, data, template);
            content = await this.generateCompletion(prompt);
          } catch (error) {
            core.warning(
              `AI generation failed for ${docType}, falling back to template`
            );
            content = null;
          }

          // Fallback to template if AI failed
          if (!content) {
            content = await this.fillTemplate(template, data);
          }

          const result = await this.saveDocument(docType, data, content);
          if (result) {
            results.push(result);
          }
        } catch (error) {
          core.error(`Failed to generate ${docType}: ${error.message}`);
        }
      }

      if (results.length === 0) {
        throw new Error('No documents were generated successfully');
      }

      core.info(`✅ Generated ${results.length}/${validTypes.length} documents`);
      return results;
    } catch (error) {
      core.error(`Document generation failed: ${error.message}`);
      throw error;
    }
  }

  // Simple template filling for fallback
  async fillTemplate(template, data) {
    const currentDate = new Date().toISOString().split('T')[0];
    let content = template;

    // Basic replacements
    content = content
      .replace(
        /\{title\}/g,
        data.discussion?.title || 'Generated Documentation'
      )
      .replace(/\{date\}/g, currentDate)
      .replace(
        /\{time\}/g,
        new Date().toLocaleTimeString('en-US', { timeZone: 'UTC' })
      )
      .replace(/\{lastUpdated\}/g, currentDate)
      .replace(/\{status\}/g, 'Active')
      .replace(/\{discussionNumber\}/g, data.discussion?.number || '')
      .replace(/\{discussionUrl\}/g, data.discussion?.url || '');

    // PR-specific template filling (for pr-report template)
    if (data.prs && data.prs.length > 0) {
      const prTestingData = this.prClient.generatePRTestingReport(data.prs);

      content = content
        .replace(/\{totalPRs\}/g, prTestingData.totalPRs || 0)
        .replace(/\{mergedPRs\}/g, prTestingData.mergedPRs || 0)
        .replace(/\{openPRs\}/g, prTestingData.openPRs || 0)
        .replace(
          /\{authors\}/g,
          prTestingData.authors ? prTestingData.authors.join(', ') : 'None'
        )
        .replace(/\{filesChanged\}/g, prTestingData.filesChanged || 0)
        .replace(/\{linesAdded\}/g, prTestingData.linesAdded || 0)
        .replace(/\{linesDeleted\}/g, prTestingData.linesDeleted || 0)
        .replace(/\{netChange\}/g, prTestingData.netChange || 0)
        .replace(/\{testCoverage\}/g, prTestingData.testCoverage || 0)
        .replace(/\{reviewCoverage\}/g, prTestingData.reviewCoverage || 0)
        .replace(/\{testFilesCount\}/g, prTestingData.testFilesCount || 0)
        .replace(/\{avgFilesPerPR\}/g, prTestingData.avgFilesPerPR || 0)
        .replace(/\{codeChurn\}/g, prTestingData.codeChurn || 0)
        .replace(
          /\{testingNotes\}/g,
          prTestingData.testingNotes || 'No testing information available.'
        )
        .replace(
          /\{prDetails\}/g,
          prTestingData.prDetails
            ? prTestingData.prDetails.join('\n\n')
            : 'No PR details available.'
        )
        .replace(/\{prLinks\}/g, prTestingData.prLinks || 'No PRs referenced.')
        .replace(
          /\{deploymentStatus\}/g,
          prTestingData.deploymentStatus || 'Unknown'
        )
        .replace(
          /\{recommendations\}/g,
          prTestingData.recommendations || 'No specific recommendations.'
        )
        .replace(
          /\{jiraKeys\}/g,
          prTestingData.jiraKeys ? prTestingData.jiraKeys.join(', ') : 'None'
        );
    }

    // Jira-specific replacements
    if (data.jiraIssues && data.jiraIssues.length > 0) {
      const jiraLinks = data.jiraIssues
        .map((issue) => `- [${issue.key}: ${issue.summary}](${issue.url})`)
        .join('\n');

      content = content.replace(/\{jiraDetails\}/g, jiraLinks);

      // Add Jira footer
      const jiraFooter = `**Jira Issues:** ${data.jiraIssues
        .map((issue) => issue.key)
        .join(', ')}`;
      content = content.replace(/\{jiraFooter\}/g, jiraFooter);
    }

    // Sprint status specific replacements (for sprint-status template)
    if (data.jiraIssues && data.jiraIssues.length > 0) {
      const jiraClient = this.getJiraClient();
      if (jiraClient.enabled) {
        const sprintData = await jiraClient.generateSprintStatusReport(
          data.jiraIssues,
          data.prs && data.prs.length > 0
            ? this.prClient.generatePRTestingReport(data.prs)
            : null
        );

        content = content
          .replace(/\{sprintName\}/g, sprintData.sprintName || 'Current Sprint')
          .replace(/\{sprintStatus\}/g, sprintData.sprintStatus || 'Active')
          .replace(/\{sprintStartDate\}/g, sprintData.sprintStartDate || 'TBD')
          .replace(/\{sprintEndDate\}/g, sprintData.sprintEndDate || 'TBD')
          .replace(/\{sprintGoal\}/g, sprintData.sprintGoal || 'No goal set')
          .replace(/\{sprintProgress\}/g, sprintData.sprintProgress || 0)
          .replace(/\{daysRemaining\}/g, sprintData.daysRemaining || 'Unknown')
          .replace(
            /\{ticketStatusTable\}/g,
            sprintData.ticketStatusTable || 'No data'
          )
          .replace(/\{totalJiraIssues\}/g, sprintData.totalJiraIssues || 0)
          .replace(
            /\{jiraIssuesByStatus\}/g,
            sprintData.jiraIssuesByStatus || 'No issues'
          )
          .replace(
            /\{jiraIssuesByPriority\}/g,
            sprintData.jiraIssuesByPriority || 'No priority data'
          )
          .replace(
            /\{jiraIssueDetails\}/g,
            sprintData.jiraIssueDetails || 'No issue details'
          )
          .replace(
            /\{sprintActionItems\}/g,
            sprintData.sprintActionItems || 'No action items'
          )
          .replace(
            /\{sprintRisks\}/g,
            sprintData.sprintRisks || 'No risks identified'
          )
          .replace(/\{jiraBoardUrl\}/g, sprintData.jiraBoardUrl || '#');

        // Show highlighting note only if we're using complete sprint data and have requested issues
        if (!sprintData.usingCompleteSprintData || sprintData.requestedIssues.length === 0) {
          content = content.replace(/> 🎯 \*\*Note:\*\* Issues marked with 🎯 were specifically requested for this report\.\n\n/g, '');
        }
      }
    }

    // Release-specific replacements
    if (docType === 'release') {
      const currentDate = new Date().toISOString().split('T')[0];
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7); // Default to 1 week from now
      
      // Generate release content from available data
      let releaseContent = 'Release content to be determined';
      if (data.jiraIssues && data.jiraIssues.length > 0) {
        releaseContent = data.jiraIssues
          .map(issue => `- ${issue.summary} (${issue.key})`)
          .join('\n');
      } else if (data.prs && data.prs.length > 0) {
        releaseContent = data.prs
          .map(pr => `- ${pr.title} (#${pr.number})`)
          .join('\n');
      }
      
      content = content
        .replace(/\{projectName\}/g, 'Project')
        .replace(/\{releaseDate\}/g, futureDate.toISOString().split('T')[0])
        .replace(/\{releaseTime\}/g, '1:00 PM')
        .replace(/\{timezone\}/g, 'Central time')
        .replace(/\{version\}/g, 'TBD')
        .replace(/\{releaseManager\}/g, 'TBD')
        .replace(/\{contactPerson\}/g, 'the release team')
        .replace(/\{rollbackPlan\}/g, 'Standard rollback procedures apply')
        .replace(/\{releaseContent\}/g, releaseContent)
        .replace(/\{whyMatters\}/g, 'This release provides important updates and improvements')
        .replace(/\{impact\}/g, 'Minimal impact expected during deployment window')
        .replace(/\{nextSteps\}/g, 'Monitor deployment and validate functionality post-release');
    }

    // Replace any remaining placeholders with default values
    content = content
      .replace(/\{jiraDetails\}/g, 'No Jira issues linked.')
      .replace(/\{jiraFooter\}/g, '')
      .replace(/\{[^}]+\}/g, 'TBD'); // Replace any remaining placeholders

    return content;
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
