#!/usr/bin/env node

/**
 * Simplified AI Document Generator using GitHub Models API
 * Handles multi-source documentation generation
 */

const core = require('@actions/core');
const fs = require('fs').promises;
const path = require('path');
const { globalRequestQueue } = require('../utils/request-queue');
const { PullRequestClient } = require('../utils/pr-client');
const { IssuesClient } = require('../utils/issues-client');
const { JiraClient } = require('../utils/jira-client');

class AIDocumentGenerator {
  constructor() {
    this.baseURL = 'https://models.github.ai/inference';
    this.apiKey = process.env.GITHUB_TOKEN;
    this.model = 'gpt-4o';
    this.consecutiveAPIFailures = 0; // Track consecutive failures for fallback strategy

    // Fabrication Control Configuration
    this.allowFabricatedContent =
      process.env.ALLOW_FABRICATED_CONTENT !== 'false'; // Default: allow
    this.productionMode = process.env.PRODUCTION_MODE === 'true'; // Default: false

    if (this.productionMode) {
      core.info('🏭 Production Mode: Fabricated content restricted');
      this.allowFabricatedContent = false; // Force disable in production
    }

    core.info(
      `🛡️ Fabricated content ${
        this.allowFabricatedContent ? 'ALLOWED' : 'DISABLED'
      }`
    );

    // Initialize data source clients only if GitHub token is available
    if (this.apiKey) {
      this.prClient = new PullRequestClient();
      this.issuesClient = new IssuesClient();
      this.jiraClient = null; // Initialize lazily when needed
    } else {
      // For testing or cases without GitHub token, create mock clients
      this.prClient = null;
      this.issuesClient = null;
      this.jiraClient = null;
    }

    core.info(`🚀 AI Generator initialized with model: ${this.model}`);
  }

  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async generateCompletion(prompt) {
    const maxRetries = 5; // Increased from 3
    const baseDelayMs = 2000; // Increased from 1000
    const maxDelayMs = 30000; // Maximum delay cap

    return globalRequestQueue.add(async () => {
      let attempt = 0;
      while (attempt <= maxRetries) {
        try {
          core.info(
            `🤖 Making AI API request... (attempt ${attempt + 1}/${
              maxRetries + 1
            })`
          );

          const requestBody = {
            model: this.model,
            messages: [
              {
                role: 'system',
                content:
                  'You are a professional documentation generator. Create well-structured, comprehensive documents based on the provided data sources. Always respond with complete, valid markdown content.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            max_tokens: 4000,
            temperature: 0.3,
          };

          const response = await fetch(`${this.baseURL}/chat/completions`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            if (
              (response.status === 429 || response.status >= 500) &&
              attempt < maxRetries
            ) {
              // Enhanced exponential backoff with jitter
              const exponentialDelay = Math.min(
                baseDelayMs * Math.pow(2, attempt),
                maxDelayMs
              );
              const jitter = Math.random() * 1000; // Add randomness to prevent thundering herd
              const delayMs = exponentialDelay + jitter;

              core.warning(
                `⏱️  Rate limit/Server error ${
                  response.status
                }. Enhanced backoff: waiting ${Math.round(
                  delayMs
                )}ms before retry... (${attempt + 1}/${maxRetries})`
              );

              await this.sleep(delayMs);
              attempt++;
              continue;
            }

            const errorText = await response
              .text()
              .catch(() => 'Unknown error');
            core.error(
              `❌ AI API request failed: ${response.status} ${response.statusText} - ${errorText}`
            );
            return null;
          }

          const data = await response.json();
          if (data.choices && data.choices.length > 0) {
            core.info('✅ AI response received successfully');
            this.consecutiveAPIFailures = 0; // Reset on success
            return data.choices[0].message.content;
          } else {
            core.error('❌ No AI response content received');
            this.consecutiveAPIFailures++;
            return null;
          }
        } catch (error) {
          core.error(`💥 AI API request error: ${error.message}`);
          this.consecutiveAPIFailures++;

          if (attempt < maxRetries) {
            attempt++;
            const retryDelay = baseDelayMs * Math.pow(2, attempt);
            core.info(
              `🔄 Retrying in ${retryDelay}ms... (attempt ${attempt}/${maxRetries})`
            );
            await this.sleep(retryDelay);
            continue;
          }

          core.warning(
            `⚠️  AI generation failed after ${
              maxRetries + 1
            } attempts. Consecutive failures: ${this.consecutiveAPIFailures}`
          );
          return null;
        }
      }
      return null;
    });
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
      return this.getBasicTemplate(docType);
    }
  }

  getBasicTemplate(docType) {
    return `# {title}

**Date:** {date}
**Type:** ${docType}

## Content

{content}

## Summary

{summary}

---
*This document was automatically generated by Chroniclr*`;
  }

  getJiraClient() {
    if (!this.jiraClient) {
      this.jiraClient = new JiraClient();
    }
    return this.jiraClient;
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

      // Also get current sprint if no specific keys provided
      if (jiraKeys.length === 0) {
        collectedData.currentSprint = await jiraClient.getCurrentSprint();
      }

      core.info(`✅ Collected ${collectedData.jiraIssues.length} Jira issues`);
    }

    return collectedData;
  }

  createBundledAIPrompt(docTypes, data, templates) {
    let prompt = `Generate multiple documents and determine a topic folder name from the following data sources:\n\n`;

    // Add all data sources
    if (data.discussion) {
      prompt += `## Discussion Data\n`;
      prompt += `Title: ${data.discussion.title}\n`;
      prompt += `Author: ${data.discussion.author}\n`;
      prompt += `Comments: ${data.discussion.commentsCount || 0}\n`;
      prompt += `Content:\n${data.discussion.body}\n\n`;
    }

    if (data.prs && data.prs.length > 0) {
      prompt += `## Pull Requests (${data.prs.length})\n`;
      data.prs.forEach((pr, index) => {
        prompt += `PR ${index + 1}: ${pr.title} (#${pr.number})\n`;
        prompt += `Status: ${pr.status}, Author: ${pr.author}\n`;
        prompt += `Files: ${pr.files}, +${pr.additions}/-${pr.deletions}\n`;
        prompt += `Description: ${pr.body.substring(0, 200)}...\n\n`;
      });
    }

    if (data.issues && data.issues.length > 0) {
      prompt += `## GitHub Issues (${data.issues.length})\n`;
      data.issues.forEach((issue, index) => {
        prompt += `Issue ${index + 1}: ${issue.title} (#${issue.number})\n`;
        prompt += `Status: ${issue.status}, Labels: ${issue.labels.join(
          ', '
        )}\n\n`;
      });
    }

    if (data.jiraIssues && data.jiraIssues.length > 0) {
      prompt += `## Jira Issues (${data.jiraIssues.length})\n`;
      data.jiraIssues.forEach((issue, index) => {
        prompt += `- ${issue.key}: ${issue.summary}\n`;
      });
      prompt += '\n';
    }

    prompt += `## ⚠️ CRITICAL: Data Integrity Requirements\n`;
    prompt += `- **ATTENDEES/PARTICIPANTS**: Use ONLY actual people from the source data (${data.discussion?.author ? `@${data.discussion.author}` : 'none provided'})\n`;
    prompt += `- **DO NOT fabricate** fake attendees, names, or roles\n`;
    prompt += `- **DO NOT invent** participants not mentioned in the discussions/PRs/issues\n`;
    prompt += `- Use "TBD" or "To be determined" for missing information\n\n`;

    prompt += `Please generate the following ${docTypes.length} documents and provide a suitable topic folder name:\n\n`;

    docTypes.forEach((docType, index) => {
      prompt += `${
        index + 1
      }. **${docType.toUpperCase()}** using this template structure:\n`;
      prompt += `${templates[docType].substring(0, 500)}...\n\n`;
    });

    prompt += `Format your response as JSON:\n`;
    prompt += `{\n`;
    prompt += `  "topic": "topic-folder-name",\n`;
    prompt += `  "documents": {\n`;
    docTypes.forEach((docType, index) => {
      prompt += `    "${docType}": "document content here"${
        index < docTypes.length - 1 ? ',' : ''
      }\n`;
    });
    prompt += `  }\n`;
    prompt += `}\n`;

    return prompt;
  }

  createAIPrompt(docType, data, template) {
    let prompt = `Generate a ${docType} document using the following data sources:\n\n`;

    // Add discussion content
    if (data.discussion) {
      prompt += `## Discussion Data\n`;
      prompt += `Title: ${data.discussion.title}\n`;
      prompt += `Author: ${data.discussion.author}\n`;
      prompt += `Comments: ${data.discussion.commentsCount}\n`;
      prompt += `Content:\n${data.discussion.body}\n\n`;
    }

    // Add PR content
    if (data.prs.length > 0) {
      prompt += `## Pull Requests (${data.prs.length})\n`;
      data.prs.forEach((pr) => {
        prompt += `- PR #${pr.number}: ${pr.title} (${pr.author})\n`;
        prompt += `  Status: ${pr.state}, Merged: ${pr.merged}\n`;
        prompt += `  Files: ${pr.files.length}, Jira: ${pr.jiraKeys.join(
          ', '
        )}\n`;
      });
      prompt += `\n`;
    }

    // Add issues content
    if (data.issues.length > 0) {
      prompt += `## GitHub Issues (${data.issues.length})\n`;
      data.issues.forEach((issue) => {
        prompt += `- Issue #${issue.number}: ${issue.title} (${issue.author})\n`;
        prompt += `  Status: ${issue.state}, Labels: ${issue.labels
          .map((l) => l.name)
          .join(', ')}\n`;
      });
      prompt += `\n`;
    }

    // Add Jira content
    if (data.jiraIssues.length > 0) {
      prompt += `## Jira Issues (${data.jiraIssues.length})\n`;
      data.jiraIssues.forEach((issue) => {
        prompt += `- ${issue.key}: ${issue.summary}\n`;
        prompt += `  Status: ${issue.status}, Type: ${issue.issueType}, Assignee: ${issue.assignee}\n`;
      });
      prompt += `\n`;
    }

    prompt += `## Instructions\n`;
    prompt += `Please create a comprehensive ${docType} document that:\n`;
    prompt += `1. Synthesizes information from all provided sources\n`;
    prompt += `2. Follows the template structure provided\n`;
    prompt += `3. Extracts key insights, decisions, and action items\n`;
    prompt += `4. Creates clear sections and proper markdown formatting\n`;
    prompt += `5. Maintains professional documentation standards\n\n`;
    
    prompt += `## ⚠️ CRITICAL: Data Integrity Requirements\n`;
    prompt += `- **ATTENDEES/PARTICIPANTS**: Use ONLY the actual people mentioned in the source data (${data.discussion?.author ? `@${data.discussion.author}` : 'none provided'})\n`;
    prompt += `- **DO NOT fabricate** fake attendees like @sarah-dev, @alex-pm, @jamie-design, etc.\n`;
    prompt += `- **DO NOT add** role-based participants unless they are explicitly mentioned in the source data\n`;
    prompt += `- **DO NOT invent** people, names, or roles not present in the actual discussions/PRs/issues\n`;
    prompt += `- If insufficient attendee data exists, use "TBD" or "To be determined"\n\n`;

    prompt += `## Template Structure\n${template}\n\n`;
    prompt += `Please replace template variables with appropriate content based on the data above.`;

    return prompt;
  }

  async generateDocument() {
    try {
      const docTypesString = process.env.DOC_TYPE || 'summary';
      const docTypes = docTypesString
        .split(' ')
        .map((type) => type.trim())
        .filter((type) => type);

      core.info(
        `🎯 Processing ${docTypes.length} document types: ${docTypes.join(
          ', '
        )}`
      );

      // Collect data from all enabled sources
      const data = await this.collectDataFromSources();

      let results;

      // Prioritize template-based generation to minimize API calls
      const preferTemplates =
        process.env.PREFER_TEMPLATES === 'true' ||
        this.consecutiveAPIFailures > 2;

      if (preferTemplates) {
        core.info('📝 Using template-based generation to avoid rate limits...');
        results = await this.generateTemplateOnlyDocuments(docTypes, data);
      } else if (docTypes.length > 1) {
        core.info('📦 Using bundled AI generation for multiple documents...');
        results = await this.generateBundledDocuments(docTypes, data);
      } else {
        core.info('🤖 Using single document AI generation...');
        const result = await this.generateSingleDocument(docTypes[0], data);
        results = result ? [result] : [];
      }

      // If AI generation failed completely, fall back to templates
      if (!results || results.length === 0) {
        core.warning(
          '⚠️  AI generation failed completely, using template fallback for all documents'
        );
        results = await this.generateTemplateOnlyDocuments(docTypes, data);
      }

      // Generate comprehensive metadata file
      if (results.length > 0) {
        await this.generateMetadataFile(docTypes, data, results);
      }

      return results;
    } catch (error) {
      core.error(`❌ Document generation failed: ${error.message}`);
      throw error;
    }
  }

  async generateBundledDocuments(docTypes, data) {
    try {
      // Generate the folder name once for all documents in this request
      const sharedTopic = await this.generateAITopic(data);
      core.info(`Using shared topic/folder: ${sharedTopic}`);

      // Load all templates
      const templates = {};
      for (const docType of docTypes) {
        templates[docType] = await this.loadTemplate(docType);
      }

      // Create bundled AI prompt that generates all documents + topic in one call
      const bundledPrompt = await this.createBundledAIPrompt(
        docTypes,
        data,
        templates
      );

      // Single AI API call for all documents and topic
      core.info(
        `Making single AI API call for ${docTypes.length} documents and topic generation...`
      );
      const aiResponse = await this.generateCompletion(bundledPrompt);

      if (!aiResponse) {
        core.warning(
          'Bundled AI generation failed, falling back to individual templates'
        );
        return await this.generateFallbackDocuments(
          docTypes,
          data,
          templates,
          sharedTopic
        );
      }

      // Parse the bundled response
      const parsedResponse = this.parseBundledResponse(aiResponse, docTypes);

      // Use the AI-generated topic if available, otherwise fall back to shared topic
      const finalTopic = parsedResponse.topic || sharedTopic;

      // Save documents and return results
      const results = [];
      for (const docType of docTypes) {
        let content =
          parsedResponse.documents[docType] ||
          this.createFallbackContent(docType, data, templates[docType]);

        // Apply variable replacement to AI-generated content as well
        content = this.replaceTemplateVariables(content, data);

        const result = await this.saveDocument(
          docType,
          data,
          content,
          finalTopic
        );
        if (result) {
          results.push(result);
        }
      }

      return results;
    } catch (error) {
      core.error(`Bundled generation failed: ${error.message}`);
      // Fallback to template generation with shared topic
      core.info('Falling back to template generation with shared topic...');
      const templates = {};
      for (const docType of docTypes) {
        templates[docType] = await this.loadTemplate(docType);
      }
      return await this.generateFallbackDocuments(
        docTypes,
        data,
        templates,
        sharedTopic
      );
    }
  }

  async generateFallbackDocuments(
    docTypes,
    data,
    templates,
    sharedTopic = null
  ) {
    core.info('Using fallback template generation...');
    const results = [];

    // Generate shared topic once if not provided
    const topic = sharedTopic || (await this.generateAITopic(data));
    core.info(
      `Using ${
        sharedTopic ? 'shared' : 'generated'
      } topic for fallback: ${topic}`
    );

    for (const docType of docTypes) {
      try {
        const content = this.createFallbackContent(
          docType,
          data,
          templates[docType]
        );
        const result = await this.saveDocument(docType, data, content, topic);
        if (result) {
          results.push(result);
        }
      } catch (error) {
        core.error(
          `Fallback generation failed for ${docType}: ${error.message}`
        );
      }
    }

    return results;
  }

  async generateTemplateOnlyDocuments(docTypes, data) {
    core.info(
      '📝 Generating documents using template-based approach only (no AI calls)...'
    );
    const results = [];

    // Generate a simple topic without AI
    const topic = this.generateSimpleTopic(data);
    core.info(`Using simple topic: ${topic}`);

    // Load all templates
    const templates = {};
    for (const docType of docTypes) {
      try {
        templates[docType] = await this.loadTemplate(docType);
      } catch (error) {
        core.warning(
          `⚠️  Could not load template for ${docType}: ${error.message}`
        );
        continue;
      }
    }

    // Generate documents using only template replacement (no AI)
    for (const docType of docTypes) {
      try {
        if (!templates[docType]) {
          core.warning(`⚠️  Skipping ${docType} - template not available`);
          continue;
        }

        // Use template with variable replacement only
        let content = templates[docType];
        content = this.replaceTemplateVariables(content, data);

        const result = await this.saveDocument(docType, data, content, topic);
        if (result) {
          results.push(result);
          core.info(`✅ Generated template-based document: ${docType}`);
        }
      } catch (error) {
        core.error(
          `Template-only generation failed for ${docType}: ${error.message}`
        );
      }
    }

    core.info(
      `📊 Successfully generated ${results.length}/${docTypes.length} documents using templates only`
    );
    return results;
  }

  generateSimpleTopic(data) {
    // Generate topic without AI using available data
    if (data.discussion?.title) {
      // Clean and format the discussion title
      return data.discussion.title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 50);
    }

    if (data.prs && data.prs.length > 0) {
      return `pr-updates-${data.prs.length}-items`;
    }

    if (data.issues && data.issues.length > 0) {
      return `issue-updates-${data.issues.length}-items`;
    }

    // Fallback with date
    const date = new Date().toISOString().split('T')[0];
    return `project-update-${date}`;
  }

  async generateSingleDocument(docType, data) {
    try {
      // Load template
      const template = await this.loadTemplate(docType);

      // Create AI prompt
      const prompt = this.createAIPrompt(docType, data, template);

      // Generate content with AI
      core.info(`Generating ${docType} document using AI...`);
      const aiContent = await this.generateCompletion(prompt);

      let finalContent;
      if (aiContent) {
        finalContent = aiContent;
      } else {
        core.warning('AI generation failed, using fallback template');
        finalContent = this.createFallbackContent(docType, data, template);
      }

      // Apply variable replacement to all content (AI-generated or fallback)
      finalContent = this.replaceTemplateVariables(finalContent, data);

      // Save document to AI-organized folder
      const baseOutputDir = path.join(process.cwd(), 'generated');
      const sourceFolder = await this.determineSourceFolder(data);
      const outputDir = path.join(baseOutputDir, sourceFolder);
      await fs.mkdir(outputDir, { recursive: true });

      const fileName = this.generateFileName(docType, data);
      const filePath = path.join(outputDir, fileName);

      await fs.writeFile(filePath, finalContent, 'utf8');

      core.info(`✅ Generated document: ${fileName}`);
      return { filePath, fileName, content: finalContent };
    } catch (error) {
      core.error(
        `Single document generation failed for ${docType}: ${error.message}`
      );
      return null;
    }
  }

  async saveDocument(docType, data, content, topic = null) {
    try {
      const baseOutputDir = path.join(process.cwd(), 'generated');

      let sourceFolder;
      if (topic) {
        // When topic is provided (bundled generation), create consistent folder name
        const today = new Date().toISOString().split('T')[0];
        sourceFolder = `${today}-${topic}`;
      } else {
        // Fallback to the original logic for individual generation
        sourceFolder = await this.determineSourceFolder(data);
      }

      const outputDir = path.join(baseOutputDir, sourceFolder);
      await fs.mkdir(outputDir, { recursive: true });

      const fileName = this.generateFileName(docType, data);
      const filePath = path.join(outputDir, fileName);

      await fs.writeFile(filePath, content, 'utf8');

      core.info(
        `✅ Generated document: ${fileName} in folder: ${sourceFolder}`
      );
      return { filePath, fileName, content };
    } catch (error) {
      core.error(`Failed to save ${docType} document: ${error.message}`);
      return null;
    }
  }

  parseBundledResponse(aiResponse, docTypes) {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(aiResponse);
      if (parsed.topic && parsed.documents) {
        return parsed;
      }
    } catch (error) {
      core.warning(
        'Failed to parse AI response as JSON, attempting text parsing...'
      );
    }

    // Fallback: parse text response
    const result = {
      topic: 'generated-docs',
      documents: {},
    };

    // Extract topic from response
    const topicMatch = aiResponse.match(/topic[":]\s*["']?([^"',\n]+)["']?/i);
    if (topicMatch) {
      result.topic = topicMatch[1]
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .substring(0, 30);
    }

    // Extract documents by looking for document type markers
    docTypes.forEach((docType) => {
      const docTypePattern = new RegExp(
        `${docType}[":]*[^\\n]*\\n([\\s\\S]*?)(?=\\n\\s*(?:${docTypes.join(
          '|'
        )})[":]*|$)`,
        'i'
      );
      const match = aiResponse.match(docTypePattern);
      if (match) {
        result.documents[docType] = match[1].trim();
      } else {
        core.warning(`Could not extract ${docType} from AI response`);
        result.documents[docType] = null;
      }
    });

    return result;
  }

  async generateAITopic(data) {
    // Collect all content for AI analysis
    let content = '';
    if (data.discussion) content += `Discussion: "${data.discussion.title}" `;
    if (data.prs.length > 0)
      content += `PRs: ${data.prs.map((pr) => pr.title).join(', ')} `;
    if (data.issues.length > 0)
      content += `Issues: ${data.issues.map((i) => i.title).join(', ')} `;
    if (data.jiraIssues.length > 0)
      content += `Jira: ${data.jiraIssues.map((j) => j.summary).join(', ')} `;

    if (!content.trim()) return 'general';

    try {
      const topicPrompt = `Analyze this content and extract 1-3 specific theme words (maximum 20 characters total):

${content}

Be specific, not generic. Return ONLY 1-3 words separated by hyphen, lowercase, no special characters.
Examples: "auth-system", "mobile-ui", "bug-fixes", "database-performance", "login-security"
Bad examples: "database", "mobile", "security" (too generic)`;

      const aiTopic = await this.generateCompletion(topicPrompt);
      if (aiTopic) {
        // Clean up AI response
        const cleaned = aiTopic
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '')
          .replace(/^-+|-+$/g, '')
          .substring(0, 20);
        return cleaned || 'general';
      }
    } catch (error) {
      core.warning(`AI topic generation failed: ${error.message}`);
    }

    // Fallback: extract from discussion title or first PR
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
      // If no meaningful words, use first few words
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

  async determineSourceFolder(data) {
    const today = new Date().toISOString().split('T')[0];
    const topic = await this.generateAITopic(data);

    // Check if folder exists and add version number if needed
    const fs = require('fs');
    const path = require('path');
    const baseFolder = `${today}-${topic}`;
    const basePath = path.join(process.cwd(), 'generated');

    let folderName = baseFolder;
    let version = 2;

    while (fs.existsSync(path.join(basePath, folderName))) {
      folderName = `${baseFolder}-${version}`;
      version++;
    }

    return folderName;
  }

  generateFileName(docType, data) {
    const timestamp = Date.now();
    const currentDate = new Date().toISOString().split('T')[0];

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
      return `${docType}-${currentDate}-${timestamp}.md`;
    }
  }

  createFallbackContent(docType, data, template) {
    let content = template;
    const currentDate = new Date().toISOString().split('T')[0];

    // Replace basic variables
    content = content.replace(/{title}/g, this.generateTitle(docType, data));
    content = content.replace(/{date}/g, currentDate);
    content = content.replace(/{content}/g, this.generateBasicContent(data));
    content = content.replace(/{summary}/g, this.generateBasicSummary(data));

    // Apply common variable replacements
    content = this.replaceTemplateVariables(content, data);

    return content;
  }

  replaceTemplateVariables(content, data) {
    const currentDate = new Date().toISOString().split('T')[0];
    const currentDateTime = new Date().toISOString();

    // Initialize content source tracking for auditing
    const contentSources = {
      extracted: [],
      inferred: [],
      generated: [],
    };

    core.info(
      '🔍 Starting template variable replacement with source tracking...'
    );

    // Replace discussion number if available
    if (data.discussion && data.discussion.number) {
      content = content.replace(/{discussionNumber}/g, data.discussion.number);
      contentSources.extracted.push('discussionNumber');
    } else {
      // Create detailed source description for multi-source data
      const sourceDescription = this.generateSourceDescription(data);
      content = content.replace(
        /from GitHub discussion #{discussionNumber}/g,
        sourceDescription
      );
      content = content.replace(
        /from discussion #{discussionNumber}/g,
        sourceDescription
      );
      // Also handle cases where AI might have generated this pattern
      content = content.replace(
        /from GitHub discussion #\d+/g,
        sourceDescription
      );
      content = content.replace(/from discussion #\d+/g, sourceDescription);
    }

    // Replace basic date/time variables
    content = content.replace(/{date}/g, currentDate);
    content = content.replace(/{lastUpdated}/g, currentDate);

    // Release date should be validated - it's not necessarily today
    const releaseDate = this.allowFabricatedContent
      ? `${currentDate} <!-- ⚠️ GENERATED DATE: Validate actual release date -->`
      : '[Release date to be confirmed]';
    content = content.replace(/{releaseDate}/g, releaseDate);

    // Replace meeting-specific time variables
    const currentTime = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'UTC',
    });
    content = content.replace(/{time}/g, `${currentTime} UTC`);

    // Estimate duration based on discussion content length
    const estimatedDuration = this.estimateMeetingDuration(data);
    content = content.replace(/{duration}/g, estimatedDuration);

    // Replace meeting type based on discussion labels or title
    const meetingType = this.determineMeetingType(data);
    content = content.replace(/{meetingType}/g, meetingType);

    // Replace status and progress variables
    content = content.replace(/{status}/g, 'Active');

    // Calculate actual progress percentage or use descriptive status
    const progressValue = this.calculateProgressValue(data);
    content = content.replace(/{progress}/g, progressValue);

    // Replace URL variables
    if (data.discussion) {
      content = content.replace(/{discussionUrl}/g, data.discussion.url || '#');
    } else {
      content = content.replace(/{discussionUrl}/g, '#');
    }

    // Repository URL - construct from GitHub context
    const repoUrl = `https://github.com/${
      process.env.GITHUB_REPOSITORY || 'owner/repo'
    }`;
    content = content.replace(/{repositoryUrl}/g, repoUrl);

    // Replace version and release variables
    content = content.replace(/{version}/g, '1.0.0');
    content = content.replace(
      /{releaseManager}/g,
      data.discussion?.author || 'System'
    );

    // Replace count variables
    content = content.replace(/{prCount}/g, data.prs?.length || 0);
    content = content.replace(
      /{contributorCount}/g,
      this.getUniqueContributors(data).length
    );

    // Replace content variables with basic fallbacks
    content = content.replace(
      /{releaseOverview}/g,
      'Overview will be generated based on the provided content.'
    );
    content = content.replace(
      /{highImpactChanges}/g,
      'High impact changes will be identified from the source materials.'
    );
    content = content.replace(
      /{mergedPullRequests}/g,
      this.generatePRList(data.prs)
    );
    content = content.replace(
      /{contributorRecognition}/g,
      this.generateContributorList(data)
    );

    // Replace changelog variables
    content = content.replace(
      /{addedFeatures}/g,
      'Added features will be extracted from source content.'
    );
    content = content.replace(
      /{changedFeatures}/g,
      'Changed features will be identified from updates.'
    );
    content = content.replace(
      /{deprecatedFeatures}/g,
      'Deprecated features will be noted if mentioned.'
    );
    content = content.replace(
      /{removedFeatures}/g,
      'Removed features will be documented if applicable.'
    );
    content = content.replace(
      /{fixedIssues}/g,
      'Fixed issues will be listed from resolved items.'
    );
    content = content.replace(
      /{securityUpdates}/g,
      'Security updates will be highlighted if present.'
    );
    content = content.replace(
      /{previousVersions}/g,
      'Previous versions will be referenced as available.'
    );

    // Replace meeting-specific variables
    content = content.replace(
      /{attendees}/g,
      this.generateAttendeesSection(data)
    );
    content = content.replace(/{agenda}/g, this.generateAgendaSection(data));
    content = content.replace(
      /{discussionSummary}/g,
      this.generateDiscussionSummary(data)
    );
    content = content.replace(
      /{decisions}/g,
      this.generateDecisionsSection(data)
    );
    content = content.replace(
      /{actionItemsTable}/g,
      this.generateActionItemsTable(data)
    );
    content = content.replace(
      /{nextSteps}/g,
      this.generateNextStepsSection(data)
    );
    content = content.replace(
      /{followupItems}/g,
      this.generateFollowUpItems(data)
    );
    content = content.replace(
      /{resourcesShared}/g,
      this.generateResourcesShared(data)
    );
    content = content.replace(
      /{nextMeetingDate}/g,
      this.generateNextMeetingDate()
    );
    content = content.replace(/{nextAgenda}/g, this.generateNextAgenda(data));
    content = content.replace(
      /{previousMeetingNotes}/g,
      this.generatePreviousMeetingNotesUrl(data)
    );

    // Replace general template variables for summaries and other documents
    content = content.replace(/{summary}/g, this.generateSummarySection(data));
    content = content.replace(
      /{objectives}/g,
      this.generateObjectivesSection(data)
    );
    content = content.replace(
      /{currentPhase}/g,
      this.generateCurrentPhase(data)
    );
    content = content.replace(
      /{nextMilestone}/g,
      this.generateNextMilestone(data)
    );
    content = content.replace(
      /{stakeholders}/g,
      this.generateStakeholdersSection(data)
    );
    content = content.replace(
      /{recentUpdates}/g,
      this.generateRecentUpdatesSection(data)
    );
    content = content.replace(
      /{actionItems}/g,
      this.generateActionItemsSection(data)
    );

    // Replace additional common template variables
    content = content.replace(
      /{title}/g,
      data.discussion?.title || 'Generated Document'
    );
    content = content.replace(
      /{project}/g,
      process.env.GITHUB_REPOSITORY?.split('/')[1] || 'Project'
    );
    content = content.replace(/{updateType}/g, 'Automated Update');
    content = content.replace(/{recipients}/g, 'Project Stakeholders');
    content = content.replace(
      /{progressSummary}/g,
      this.generateProgressSummary(data)
    );
    content = content.replace(
      /{accomplishments}/g,
      this.generateAccomplishments(data)
    );
    content = content.replace(
      /{completedItems}/g,
      this.generateCompletedItems(data)
    );
    content = content.replace(
      /{inProgressItems}/g,
      this.generateInProgressItems(data)
    );
    content = content.replace(
      /{upcomingItems}/g,
      this.generateUpcomingItems(data)
    );
    content = content.replace(
      /{risksBlockers}/g,
      this.generateRisksBlockers(data)
    );
    content = content.replace(
      /{budgetStatus}/g,
      this.generateBudgetStatus(data)
    );
    content = content.replace(
      /{timelineUpdates}/g,
      this.generateTimelineUpdates(data)
    );
    content = content.replace(
      /{decisionsNeeded}/g,
      this.generateDecisionsNeeded(data)
    );
    content = content.replace(
      /{nextUpdateDate}/g,
      this.generateNextUpdateDate()
    );
    content = content.replace(
      /{nextMeetingDate}/g,
      this.generateNextMeetingDate()
    );

    // Replace PR-specific variables
    content = content.replace(
      /{prTitle}/g,
      data.prs?.[0]?.title || 'Pull Request'
    );
    content = content.replace(/{prNumber}/g, data.prs?.[0]?.number || 'N/A');
    content = content.replace(
      /{prAuthor}/g,
      data.prs?.[0]?.author || 'Unknown'
    );
    content = content.replace(
      /{overallReviewStatus}/g,
      this.generateOverallReviewStatus(data)
    );
    content = content.replace(
      /{reviewSummary}/g,
      this.generateReviewSummary(data)
    );
    content = content.replace(
      /{baseBranch}/g,
      data.prs?.[0]?.baseBranch || 'main'
    );
    content = content.replace(
      /{headBranch}/g,
      data.prs?.[0]?.headBranch || 'feature-branch'
    );
    content = content.replace(/{totalFiles}/g, data.prs?.[0]?.files || '0');
    content = content.replace(/{linesAdded}/g, data.prs?.[0]?.additions || '0');
    content = content.replace(
      /{linesDeleted}/g,
      data.prs?.[0]?.deletions || '0'
    );
    content = content.replace(/{totalCommits}/g, data.prs?.[0]?.commits || '0');

    // Replace release and deployment variables with fallbacks
    content = content.replace(
      /{majorFeatures}/g,
      'Major features will be extracted from pull requests and issues.'
    );
    content = content.replace(
      /{enhancements}/g,
      'Enhancements will be identified from the provided content.'
    );
    content = content.replace(
      /{performanceImprovements}/g,
      'Performance improvements will be noted if mentioned in the source materials.'
    );
    content = content.replace(
      /{criticalFixes}/g,
      'Critical fixes will be highlighted from bug-related pull requests.'
    );
    content = content.replace(
      /{generalBugFixes}/g,
      'General bug fixes will be compiled from closed issues and merged PRs.'
    );
    content = content.replace(
      /{apiChanges}/g,
      'API changes will be documented if identified in the code changes.'
    );
    content = content.replace(
      /{breakingChanges}/g,
      'Breaking changes will be highlighted if detected in the release content.'
    );
    content = content.replace(
      /{deploymentNotes}/g,
      'Deployment instructions will be provided based on the release requirements.'
    );
    content = content.replace(
      /{configurationChanges}/g,
      'Configuration changes will be noted if mentioned in the documentation.'
    );
    content = content.replace(
      /{databaseMigrations}/g,
      'Database migration steps will be included if database changes are detected.'
    );

    // Replace metrics and quality variables
    content = content.replace(
      /{testCoverage}/g,
      'Test coverage metrics will be reported if available from CI/CD results.'
    );
    content = content.replace(
      /{qualityMetrics}/g,
      'Code quality metrics will be included from automated analysis tools.'
    );
    content = content.replace(
      /{knownIssues}/g,
      'Known issues will be compiled from open tickets and bug reports.'
    );
    content = content.replace(
      /{upgradeInstructions}/g,
      'Upgrade instructions will be generated based on version compatibility.'
    );
    content = content.replace(
      /{compatibilityNotes}/g,
      'Compatibility information will be documented for different environments.'
    );
    content = content.replace(
      /{migrationChecklist}/g,
      'Migration checklist will be provided for seamless transitions.'
    );

    // Track content source classifications
    this.trackContentSourceClassifications(data, contentSources);

    // Log template variable replacement audit trail
    core.info('📋 Template Variable Replacement Audit:');
    core.info(
      `   🔍 Extracted from source: ${contentSources.extracted.length} variables`
    );
    core.info(
      `   🧠 Inferred from data: ${contentSources.inferred.length} variables`
    );
    core.info(
      `   📝 Generated fallbacks: ${contentSources.generated.length} variables`
    );

    // Store audit information for metadata generation
    if (!this.auditTrail) {
      this.auditTrail = {};
    }
    this.auditTrail.templateVariables = contentSources;

    return content;
  }

  trackContentSourceClassifications(data, contentSources) {
    // Track extracted content based on available data
    if (data.discussion?.body) {
      contentSources.extracted.push(
        'summary',
        'objectives',
        'decisions',
        'actionItems'
      );
    }
    if (data.prs && data.prs.length > 0) {
      contentSources.extracted.push(
        'prTitle',
        'prNumber',
        'prAuthor',
        'recentUpdates',
        'completedItems'
      );
    }
    if (data.issues && data.issues.length > 0) {
      contentSources.extracted.push(
        'recentUpdates',
        'completedItems',
        'inProgressItems'
      );
    }

    // Track inferred content
    contentSources.inferred.push(
      'progress',
      'currentPhase',
      'meetingType',
      'duration'
    );

    // Track generated fallbacks (high-risk fabricated content)
    const generatedVars = ['risksBlockers', 'budgetStatus', 'upcomingItems'];

    // Add additional generated variables based on configuration
    if (this.allowFabricatedContent) {
      generatedVars.push(
        'previousMeetingNotes',
        'duration',
        'releaseDate',
        'decisionsNeeded'
      );
    }

    contentSources.generated.push(...generatedVars);

    // Add stakeholders as extracted if we have real participants
    const uniqueContributors = this.getUniqueContributors(data);
    if (uniqueContributors.length > 0) {
      contentSources.extracted.push('stakeholders');
    } else {
      contentSources.generated.push('stakeholders');
    }
  }

  getUniqueContributors(data) {
    const contributors = new Set();

    if (data.discussion?.author) {
      contributors.add(data.discussion.author);
    }

    if (data.prs) {
      data.prs.forEach((pr) => {
        if (pr.author) contributors.add(pr.author);
      });
    }

    if (data.issues) {
      data.issues.forEach((issue) => {
        if (issue.author) contributors.add(issue.author);
      });
    }

    return Array.from(contributors);
  }

  generatePRList(prs) {
    if (!prs || prs.length === 0) {
      return 'No pull requests processed.';
    }

    return prs
      .map((pr) => `- [#${pr.number}](${pr.url}): ${pr.title} by @${pr.author}`)
      .join('\n');
  }

  generateContributorList(data) {
    const contributors = this.getUniqueContributors(data);
    if (contributors.length === 0) {
      return 'Contributors will be recognized based on participation.';
    }

    return `Special thanks to: ${contributors.map((c) => `@${c}`).join(', ')}`;
  }

  // Meeting-specific helper methods
  estimateMeetingDuration(data) {
    // Add fabrication warning for estimated duration
    if (!this.allowFabricatedContent) {
      return '> 🚫 **FABRICATED DURATION DISABLED**: Actual meeting duration requires manual input.\n\n[Duration to be specified]';
    }

    // Estimate duration based on discussion content length
    const contentLength = data.discussion?.body?.length || 0;
    const commentsCount = data.discussion?.commentsCount || 0;
    const FABRICATION_WARNING =
      '> ⚠️ **ESTIMATED DURATION**: This duration is system-estimated and requires validation.\n\n';

    let duration;
    if (contentLength < 500 && commentsCount < 5) {
      duration = '30 minutes';
    } else if (contentLength < 1500 && commentsCount < 15) {
      duration = '45 minutes';
    } else if (contentLength < 3000 && commentsCount < 30) {
      duration = '1 hour';
    } else {
      duration = '1.5 hours';
    }

    return `${FABRICATION_WARNING}${duration}`;
  }

  determineMeetingType(data) {
    const title = data.discussion?.title?.toLowerCase() || '';
    const labels = data.discussion?.labels || [];

    if (title.includes('standup') || labels.includes('standup')) {
      return 'Daily Standup';
    } else if (
      title.includes('retrospective') ||
      labels.includes('retrospective')
    ) {
      return 'Sprint Retrospective';
    } else if (title.includes('planning') || labels.includes('planning')) {
      return 'Sprint Planning';
    } else if (title.includes('review') || labels.includes('review')) {
      return 'Sprint Review';
    } else if (title.includes('kickoff') || labels.includes('kickoff')) {
      return 'Project Kickoff';
    } else {
      return 'Team Meeting';
    }
  }

  generateAttendeesSection(data) {
    const attendees = new Set();

    if (data.discussion?.author) {
      attendees.add(data.discussion.author);
    }

    // Extract attendees from comments
    if (data.discussion?.comments) {
      data.discussion.comments.forEach((comment) => {
        if (comment.author) {
          attendees.add(comment.author);
        }
      });
    }

    // Add contributors from related PRs and issues
    this.getUniqueContributors(data).forEach((contributor) => {
      attendees.add(contributor);
    });

    if (attendees.size === 0) {
      return '- Meeting attendees will be determined from discussion participants';
    }

    return Array.from(attendees)
      .map((attendee) => `- @${attendee}`)
      .join('\n');
  }

  generateAgendaSection(data) {
    // Try to extract agenda from discussion body
    const body = data.discussion?.body || '';

    // Look for common agenda patterns
    const agendaMatch = body.match(
      /(?:agenda|topics|items):\s*([\s\S]*?)(?:\n\n|$)/i
    );
    if (agendaMatch) {
      return agendaMatch[1].trim();
    }

    // Fallback to discussion title and key topics
    const title = data.discussion?.title || 'Discussion Topics';
    return `1. ${title}\n2. Review action items from previous meeting\n3. Open discussion\n4. Next steps`;
  }

  generateDiscussionSummary(data) {
    if (data.discussion?.body) {
      // Use first paragraph or first 300 characters as summary
      const firstParagraph = data.discussion.body.split('\n\n')[0];
      return firstParagraph.length > 300
        ? firstParagraph.substring(0, 300) + '...'
        : firstParagraph;
    }

    return 'Discussion summary will be generated from the meeting content.';
  }

  generateDecisionsSection(data) {
    // Look for decision keywords in discussion
    const content = data.discussion?.body || '';
    const decisionKeywords =
      /(?:decided|decision|agreed|resolve[d]?|conclusion):\s*([^\n]+)/gi;
    const decisions = [];
    let match;

    while ((match = decisionKeywords.exec(content)) !== null) {
      decisions.push(match[1].trim());
    }

    if (decisions.length > 0) {
      return decisions
        .map((decision, index) => `${index + 1}. ${decision}`)
        .join('\n');
    }

    return '- Key decisions will be documented based on discussion outcomes';
  }

  generateActionItemsTable(data) {
    // Look for action items in discussion
    const content = data.discussion?.body || '';
    const actionPattern = /(?:action|todo|task):\s*([^\n]+)(?:\s*@(\w+))?/gi;
    const actions = [];
    let match;

    while ((match = actionPattern.exec(content)) !== null) {
      const task = match[1].trim();
      const assignee = match[2] || 'TBD';
      const dueDate = 'Next meeting';
      const status = 'Open';

      actions.push(`| ${task} | @${assignee} | ${dueDate} | ${status} |`);
    }

    if (actions.length > 0) {
      return actions.join('\n');
    }

    return '| Action items will be tracked here | Assignee | Due Date | Status |';
  }

  generateNextStepsSection(data) {
    // Extract next steps from discussion
    const content = data.discussion?.body || '';
    const nextStepsMatch = content.match(
      /(?:next steps?|follow.?up):\s*([\s\S]*?)(?:\n\n|$)/i
    );

    if (nextStepsMatch) {
      return nextStepsMatch[1].trim();
    }

    return '- Review and implement discussed solutions\n- Follow up on action items\n- Prepare for next meeting';
  }

  generateFollowUpItems(data) {
    // Look for follow-up mentions
    const content = data.discussion?.body || '';
    const followUpPattern = /follow.?up:\s*([^\n]+)/gi;
    const followUps = [];
    let match;

    while ((match = followUpPattern.exec(content)) !== null) {
      followUps.push(match[1].trim());
    }

    if (followUps.length > 0) {
      return followUps.map((item, index) => `${index + 1}. ${item}`).join('\n');
    }

    return '- Items requiring follow-up will be listed here';
  }

  generateResourcesShared(data) {
    // Look for URLs and resource mentions in discussion
    const content = data.discussion?.body || '';
    const urlPattern = /https?:\/\/[^\s)]+/g;
    const urls = content.match(urlPattern) || [];

    if (urls.length > 0) {
      return urls.map((url) => `- [Resource](${url})`).join('\n');
    }

    return '- Meeting resources and links will be listed here';
  }

  generateNextMeetingDate() {
    // Generate next week's date
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek.toISOString().split('T')[0];
  }

  generateNextAgenda(data) {
    return '- Review action items\n- Continue discussion on open topics\n- New business';
  }

  generatePreviousMeetingNotesUrl(data) {
    // Check if fabricated links are allowed
    if (!this.allowFabricatedContent) {
      return '> 🚫 **FABRICATED LINK DISABLED**: Previous meeting notes require manual linking or enable ALLOW_FABRICATED_CONTENT=true for development.\n\nPrevious meeting notes: [Link to be provided]';
    }

    // Don't fabricate URLs to non-existent files - this creates broken links
    const FABRICATION_WARNING =
      '> ⚠️ **GENERATED LINK**: This link is system-generated and may not exist. Verify before distribution.\n\n';
    const repoUrl = `https://github.com/${
      process.env.GITHUB_REPOSITORY || 'owner/repo'
    }`;
    return `${FABRICATION_WARNING}[Previous Meeting Notes](${repoUrl}/blob/main/generated/meeting-notes/previous-meeting.md)`;
  }

  // General document template helper methods
  generateSummarySection(data) {
    if (data.discussion?.body) {
      // Use first 500 characters as a summary
      const summary =
        data.discussion.body.length > 500
          ? data.discussion.body.substring(0, 500) + '...'
          : data.discussion.body;
      return summary;
    }

    if (data.prs && data.prs.length > 0) {
      return `Summary of ${data.prs.length} pull request${
        data.prs.length > 1 ? 's' : ''
      } and related changes.`;
    }

    if (data.issues && data.issues.length > 0) {
      return `Summary of ${data.issues.length} issue${
        data.issues.length > 1 ? 's' : ''
      } and their resolution status.`;
    }

    return 'Project summary will be generated based on the collected data and analysis.';
  }

  generateObjectivesSection(data) {
    const content = data.discussion?.body || '';

    // Look for objectives, goals, or aims in the content
    const objectivePatterns = [
      /(?:objectives?|goals?|aims?):\s*([\s\S]*?)(?:\n\n|$)/i,
      /(?:we aim to|goal is to|objective is to)\s*([^\n]+)/gi,
    ];

    const objectives = [];

    objectivePatterns.forEach((pattern) => {
      const matches = content.match(pattern);
      if (matches) {
        if (pattern.global) {
          objectives.push(...matches);
        } else {
          objectives.push(matches[1].trim());
        }
      }
    });

    if (objectives.length > 0) {
      return objectives.map((obj, index) => `${index + 1}. ${obj}`).join('\n');
    }

    // Fallback based on discussion title
    const title = data.discussion?.title || 'Project Goals';
    return `1. Complete ${title.toLowerCase()}\n2. Ensure quality and timely delivery\n3. Maintain stakeholder alignment`;
  }

  generateCurrentPhase(data) {
    const content = data.discussion?.body?.toLowerCase() || '';

    if (content.includes('planning') || content.includes('design')) {
      return 'Planning & Design';
    } else if (
      content.includes('development') ||
      content.includes('implement')
    ) {
      return 'Development';
    } else if (content.includes('testing') || content.includes('qa')) {
      return 'Testing & QA';
    } else if (content.includes('review') || content.includes('feedback')) {
      return 'Review & Feedback';
    } else if (content.includes('deploy') || content.includes('release')) {
      return 'Deployment & Release';
    } else {
      return 'In Progress';
    }
  }

  generateNextMilestone(data) {
    const content = data.discussion?.body || '';

    // Look for milestone or deadline mentions
    const milestonePattern = /(?:milestone|deadline|due|target):\s*([^\n]+)/i;
    const match = content.match(milestonePattern);

    if (match) {
      return match[1].trim();
    }

    // Generate next milestone date (2 weeks from now)
    const nextMilestone = new Date();
    nextMilestone.setDate(nextMilestone.getDate() + 14);
    return `Next review - ${nextMilestone.toISOString().split('T')[0]}`;
  }

  generateStakeholdersSection(data) {
    const stakeholders = new Set();

    // Add discussion participants
    if (data.discussion?.author) {
      stakeholders.add(data.discussion.author);
    }

    // Add contributors from PRs and issues
    this.getUniqueContributors(data).forEach((contributor) => {
      stakeholders.add(contributor);
    });

    // If we have real stakeholders, use only those
    if (stakeholders.size > 0) {
      const stakeholderList = Array.from(stakeholders)
        .map((stakeholder) => `- @${stakeholder}`)
        .join('\n');
      return stakeholderList;
    }

    // Only add generic roles if we have NO real stakeholder data
    if (!this.allowFabricatedContent) {
      return '> 🚫 **FABRICATED STAKEHOLDER DATA DISABLED**: Real stakeholder information required.\n\n[Stakeholders to be identified]';
    }

    const FABRICATION_WARNING = '> ⚠️ **GENERATED STAKEHOLDERS**: These roles are system-generated and require validation.\n\n';
    return FABRICATION_WARNING + '- Project Manager\n- Development Team\n- Quality Assurance\n- Product Owner';
  }

  generateRecentUpdatesSection(data) {
    const updates = [];

    // Add discussion-based updates
    if (data.discussion) {
      updates.push(
        `- Discussion #${data.discussion.number}: ${data.discussion.title}`
      );
    }

    // Add PR updates
    if (data.prs && data.prs.length > 0) {
      data.prs.forEach((pr) => {
        updates.push(`- PR #${pr.number}: ${pr.title} (${pr.status})`);
      });
    }

    // Add issue updates
    if (data.issues && data.issues.length > 0) {
      data.issues.forEach((issue) => {
        updates.push(
          `- Issue #${issue.number}: ${issue.title} (${issue.state})`
        );
      });
    }

    if (updates.length === 0) {
      return '- Recent project updates will be listed here\n- Progress on key initiatives\n- Important announcements';
    }

    return updates.join('\n');
  }

  generateActionItemsSection(data) {
    const content = data.discussion?.body || '';

    // Look for action items in various formats
    const actionPatterns = [
      /(?:action items?|tasks?|todos?):\s*([\s\S]*?)(?:\n\n|$)/i,
      /(?:action|todo|task):\s*([^\n]+)/gi,
      /-\s*\[\s*\]\s*([^\n]+)/gi, // Checkbox format
    ];

    const actionItems = [];

    actionPatterns.forEach((pattern) => {
      let match;
      if (pattern.global) {
        while ((match = pattern.exec(content)) !== null) {
          actionItems.push(match[1].trim());
        }
      } else {
        match = content.match(pattern);
        if (match) {
          // Split multiline action items
          const items = match[1].split('\n').filter((item) => item.trim());
          actionItems.push(...items.map((item) => item.trim()));
        }
      }
    });

    if (actionItems.length > 0) {
      return actionItems
        .map((item, index) => `${index + 1}. ${item}`)
        .join('\n');
    }

    return '1. Review and validate current progress\n2. Address any outstanding issues\n3. Plan next phase activities\n4. Update stakeholders on status';
  }

  // Additional stakeholder update template helper methods
  generateProgressSummary(data) {
    const progress = this.calculateProgress(data);

    // Only add % if we have actual progress data
    if (progress > 0) {
      return `Project is currently ${progress}% complete. ${this.generateCurrentPhase(
        data
      )} phase is underway with good momentum.`;
    } else {
      return `Project is in the ${this.generateCurrentPhase(
        data
      )} phase with good momentum.`;
    }
  }

  calculateProgressValue(data) {
    // Check if we have actual completion data
    const completedPRs =
      data.prs?.filter((pr) => pr.status === 'merged').length || 0;
    const totalPRs = data.prs?.length || 0;
    const completedIssues =
      data.issues?.filter((issue) => issue.state === 'closed').length || 0;
    const totalIssues = data.issues?.length || 0;

    // If we have actual PR/issue data, calculate percentage
    if (totalPRs > 0 || totalIssues > 0) {
      const totalItems = totalPRs + totalIssues;
      const completedItems = completedPRs + completedIssues;
      const percentage = Math.round((completedItems / totalItems) * 100);
      return `${percentage}%`;
    }

    // Otherwise, use descriptive status without percentage
    return 'In Progress';
  }

  calculateProgress(data) {
    // Return raw number for calculations
    const completedPRs =
      data.prs?.filter((pr) => pr.status === 'merged').length || 0;
    const totalPRs = data.prs?.length || 0;
    const completedIssues =
      data.issues?.filter((issue) => issue.state === 'closed').length || 0;
    const totalIssues = data.issues?.length || 0;

    if (totalPRs > 0 || totalIssues > 0) {
      const totalItems = totalPRs + totalIssues;
      const completedItems = completedPRs + completedIssues;
      return Math.round((completedItems / totalItems) * 100);
    }

    return 0; // No data available
  }

  generateAccomplishments(data) {
    const accomplishments = [];

    if (data.prs && data.prs.length > 0) {
      const mergedPRs = data.prs.filter((pr) => pr.status === 'merged');
      if (mergedPRs.length > 0) {
        accomplishments.push(
          `✅ Successfully merged ${mergedPRs.length} pull request${
            mergedPRs.length > 1 ? 's' : ''
          }`
        );
      }
    }

    if (data.issues && data.issues.length > 0) {
      const closedIssues = data.issues.filter(
        (issue) => issue.state === 'closed'
      );
      if (closedIssues.length > 0) {
        accomplishments.push(
          `✅ Resolved ${closedIssues.length} issue${
            closedIssues.length > 1 ? 's' : ''
          }`
        );
      }
    }

    if (data.discussion) {
      accomplishments.push(
        `✅ Documented progress and decisions in discussion #${data.discussion.number}`
      );
    }

    return accomplishments.length > 0
      ? accomplishments.join('\n')
      : '✅ Project milestones achieved according to timeline\n✅ Team collaboration and communication maintained';
  }

  generateCompletedItems(data) {
    const completed = [];

    if (data.prs) {
      data.prs
        .filter((pr) => pr.status === 'merged')
        .forEach((pr) => {
          completed.push(`- ✅ ${pr.title} (PR #${pr.number})`);
        });
    }

    if (data.issues) {
      data.issues
        .filter((issue) => issue.state === 'closed')
        .forEach((issue) => {
          completed.push(`- ✅ ${issue.title} (Issue #${issue.number})`);
        });
    }

    return completed.length > 0
      ? completed.join('\n')
      : '- ✅ Core functionality implemented\n- ✅ Initial testing completed\n- ✅ Documentation updated';
  }

  generateInProgressItems(data) {
    const inProgress = [];

    if (data.prs) {
      data.prs
        .filter((pr) => pr.status === 'open')
        .forEach((pr) => {
          inProgress.push(`- 🔄 ${pr.title} (PR #${pr.number})`);
        });
    }

    if (data.issues) {
      data.issues
        .filter((issue) => issue.state === 'open')
        .forEach((issue) => {
          inProgress.push(`- 🔄 ${issue.title} (Issue #${issue.number})`);
        });
    }

    return inProgress.length > 0
      ? inProgress.join('\n')
      : '- 🔄 Feature development in progress\n- 🔄 Code review and testing underway\n- 🔄 Integration with existing systems';
  }

  generateUpcomingItems(data) {
    const FABRICATION_WARNING =
      '> ⚠️ **GENERATED CONTENT**: This information is system-generated and requires validation.\n\n';
    return (
      FABRICATION_WARNING +
      '- 📋 Next sprint planning session\n- 📋 Security audit and review\n- 📋 Performance optimization tasks\n- 📋 User acceptance testing preparation'
    );
  }

  generateRisksBlockers(data) {
    // Check if fabricated risk content is allowed
    if (!this.allowFabricatedContent) {
      return '> 🚫 **FABRICATED RISK DATA DISABLED**: Configure actual risk tracking system or enable ALLOW_FABRICATED_CONTENT=true for development.\n\nRisk assessment requires input from project stakeholders and subject matter experts.';
    }

    const FABRICATION_WARNING =
      '> ⚠️ **GENERATED CONTENT**: This information is system-generated and requires validation.\n\n';
    return (
      FABRICATION_WARNING +
      '- ⚠️  Dependencies on external systems\n- ⚠️  Resource allocation for upcoming milestones\n- ⚠️  Potential integration challenges'
    );
  }

  generateBudgetStatus(data) {
    // Check if fabricated financial content is allowed
    if (!this.allowFabricatedContent) {
      return '> 🚫 **FABRICATED FINANCIAL DATA DISABLED**: Configure actual budget tracking or enable ALLOW_FABRICATED_CONTENT=true for development.\n\nBudget status information requires manual input from finance team.';
    }

    const FABRICATION_WARNING =
      '> 🚨 **FINANCIAL DATA GENERATED**: This financial information is system-generated and requires CFO/finance team validation before use in official reporting.\n\n';
    return (
      FABRICATION_WARNING +
      'Project is currently within budget parameters. No significant deviations from planned expenditure.'
    );
  }

  generateTimelineUpdates(data) {
    // Check if fabricated timeline content is allowed
    if (!this.allowFabricatedContent) {
      return '> 🚫 **FABRICATED TIMELINE DATA DISABLED**: Configure actual project management integration or enable ALLOW_FABRICATED_CONTENT=true for development.\n\nTimeline information requires manual input from project manager.';
    }

    const FABRICATION_WARNING =
      '> ⚠️ **TIMELINE DATA GENERATED**: This schedule information is system-generated and requires project manager validation.\n\n';
    return (
      FABRICATION_WARNING +
      'Project timeline remains on track. Milestones are being achieved according to schedule.'
    );
  }

  generateDecisionsNeeded(data) {
    const content = data.discussion?.body || '';

    // Look for questions or decision points
    const decisionPatterns = [
      /\?(.*)/g, // Questions
      /(?:decide|decision|should we|which option)/gi, // Decision keywords
    ];

    const decisions = [];
    decisionPatterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        decisions.push(match[0].trim());
      }
    });

    return decisions.length > 0
      ? decisions
          .map((decision, index) => `${index + 1}. ${decision}`)
          .join('\n')
      : '> ⚠️ **ACTION ITEMS GENERATED**: These decisions are system-generated and require stakeholder validation.\n\n1. Approve next phase budget allocation\n2. Finalize integration strategy\n3. Set deployment timeline';
  }

  generateNextUpdateDate() {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek.toISOString().split('T')[0];
  }

  // PR Review template helper methods
  generateOverallReviewStatus(data) {
    if (data.prs && data.prs.length > 0) {
      const pr = data.prs[0];
      return pr.status === 'merged'
        ? 'Approved and Merged'
        : pr.status === 'open'
        ? 'Under Review'
        : 'Pending';
    }
    return 'Awaiting Review';
  }

  generateReviewSummary(data) {
    if (data.prs && data.prs.length > 0) {
      const pr = data.prs[0];
      return `Pull request #${pr.number} "${
        pr.title
      }" has been reviewed. The changes introduce ${
        pr.additions || 0
      } additions and ${pr.deletions || 0} deletions across ${
        pr.files || 0
      } files.`;
    }
    return 'Comprehensive review of the proposed changes has been conducted with attention to code quality, security, and performance considerations.';
  }
  generateSourceDescription(data) {
    const sources = [];

    if (data.prs && data.prs.length > 0) {
      const prNumbers = data.prs.map((pr) => `#${pr.number}`).join(', ');
      sources.push(
        `Pull Request${data.prs.length > 1 ? 's' : ''} ${prNumbers}`
      );
    }

    if (data.issues && data.issues.length > 0) {
      const issueNumbers = data.issues
        .map((issue) => `#${issue.number}`)
        .join(', ');
      sources.push(`Issue${data.issues.length > 1 ? 's' : ''} ${issueNumbers}`);
    }

    if (data.jiraIssues && data.jiraIssues.length > 0) {
      const jiraKeys = data.jiraIssues.map((jira) => jira.key).join(', ');
      sources.push(
        `Jira ticket${data.jiraIssues.length > 1 ? 's' : ''} ${jiraKeys}`
      );
    }

    if (sources.length === 0) {
      return 'from available documentation sources';
    } else if (sources.length === 1) {
      return `from ${sources[0]}`;
    } else if (sources.length === 2) {
      return `from ${sources[0]} and ${sources[1]}`;
    } else {
      const lastSource = sources.pop();
      return `from ${sources.join(', ')}, and ${lastSource}`;
    }
  }

  generateTitle(docType, data) {
    if (data.discussion) {
      return data.discussion.title;
    } else {
      const sourceCount =
        data.prs.length + data.issues.length + data.jiraIssues.length;
      return `${
        docType.charAt(0).toUpperCase() + docType.slice(1)
      } - ${sourceCount} Items`;
    }
  }

  generateBasicContent(data) {
    let content = '';

    if (data.discussion) {
      content += `## Discussion\n${data.discussion.body}\n\n`;
    }

    if (data.prs.length > 0) {
      content += `## Pull Requests\n`;
      data.prs.forEach((pr) => {
        content += `- [PR #${pr.number}](${pr.url}): ${pr.title}\n`;
      });
      content += '\n';
    }

    if (data.issues.length > 0) {
      content += `## Issues\n`;
      data.issues.forEach((issue) => {
        content += `- [Issue #${issue.number}](${issue.url}): ${issue.title}\n`;
      });
      content += '\n';
    }

    if (data.jiraIssues.length > 0) {
      content += `## Jira Issues\n`;
      data.jiraIssues.forEach((issue) => {
        content += `- [${issue.key}](${issue.url}): ${issue.summary}\n`;
      });
      content += '\n';
    }

    return content;
  }

  generateBasicSummary(data) {
    const totalItems =
      (data.discussion ? 1 : 0) +
      data.prs.length +
      data.issues.length +
      data.jiraIssues.length;
    return `Processed ${totalItems} items from ${data.sources.join(
      ', '
    )} sources.`;
  }

  async generateMetadataFile(docTypes, data, results) {
    try {
      const currentDate = new Date().toISOString();
      const dateOnly = currentDate.split('T')[0];

      // Determine the output directory from the first result
      const outputDir =
        results.length > 0
          ? path.dirname(results[0].filePath)
          : path.join(process.cwd(), 'generated');
      const metadataPath = path.join(outputDir, 'generation-metadata.md');

      const metadata = `# Documentation Generation Metadata

**Generated on:** ${currentDate}  
**Generated by:** Chroniclr AI Document Generator  
**AI Model:** GPT-4o (GitHub Models API)  

## Source Information

### Data Sources Used
${data.sources
  .map((source) => `- ${source.charAt(0).toUpperCase() + source.slice(1)}`)
  .join('\n')}

### Template Variable Processing Method

**Content Extraction Strategy:**
1. **Primary:** Extract actual content from source data using pattern matching
2. **Secondary:** Use intelligent defaults based on available context
3. **Fallback:** Generate structured placeholder content when no data available

**Traceability Classifications:**
- 🔍 **EXTRACTED** - Content parsed directly from source materials
- 🧠 **INFERRED** - Content derived from available data using algorithms
- 📝 **GENERATED** - Placeholder content when source data insufficient

### Content Source Audit Trail

**Variables with EXTRACTED content (when available):**
- \`{summary}\` - First 500 characters from discussion body
- \`{objectives}\` - Pattern matched from "objectives:", "goals:", "aims:"
- \`{decisions}\` - Keywords: "decided:", "decision:", "agreed:"
- \`{actionItems}\` - Patterns: "action:", "todo:", "task:", checkbox formats
- \`{agenda}\` - Sections: "agenda:", "topics:", "items:"
- \`{stakeholders}\` - Actual participants from discussions/PRs/issues
- \`{recentUpdates}\` - Real PR/issue titles and status
- \`{completedItems}\` - Merged PRs and closed issues
- \`{inProgressItems}\` - Open PRs and issues
- \`{progress}\` - Calculated from completed vs total items

**Variables with INFERRED content:**
- \`{currentPhase}\` - Keyword analysis with fallback
- \`{meetingType}\` - Label and title analysis
- \`{duration}\` - Content length-based estimation

**Variables with GENERATED fallbacks:**
- \`{risksBlockers}\` - Generic project risks when none detected
- \`{budgetStatus}\` - Standard budget message
- \`{upcomingItems}\` - Common next steps when none specified

${
  data.discussion
    ? `### Discussion Details
- **Discussion #${data.discussion.number}:** ${data.discussion.title}
- **Author:** @${data.discussion.author}
- **URL:** ${data.discussion.url}
- **Comments Processed:** ${data.discussion.commentsCount || 0}
- **Body Length:** ${
        data.discussion.body ? data.discussion.body.length : 0
      } characters
`
    : ''
}

${
  data.prs.length > 0
    ? `### Pull Requests (${data.prs.length})
${data.prs
  .map(
    (pr) => `- **PR #${pr.number}:** ${pr.title}
  - Author: @${pr.author}
  - Status: ${pr.status}
  - Files Changed: ${pr.files}
  - Additions: +${pr.additions}, Deletions: -${pr.deletions}
  - URL: ${pr.url}`
  )
  .join('\n')}
`
    : ''
}

${
  data.issues.length > 0
    ? `### GitHub Issues (${data.issues.length})
${data.issues
  .map(
    (issue) => `- **Issue #${issue.number}:** ${issue.title}
  - Status: ${issue.status}
  - Labels: ${issue.labels.join(', ')}
  - URL: ${issue.url}`
  )
  .join('\n')}
`
    : ''
}

${
  data.jiraIssues.length > 0
    ? `### Jira Tickets (${data.jiraIssues.length})
${data.jiraIssues
  .map(
    (jira) => `- **${jira.key}:** ${jira.summary}
  - Status: ${jira.status}
  - Type: ${jira.type}
  - URL: ${jira.url}`
  )
  .join('\n')}
`
    : ''
}

## Generated Documents

### Document Types Requested
${docTypes.map((type) => `- ${type}`).join('\n')}

### Generated Files
${results
  .map(
    (result) => `- **${result.fileName}**
  - Path: \`${path.relative(process.cwd(), result.filePath)}\`
  - Size: ${result.content ? result.content.length : 0} characters`
  )
  .join('\n')}

## Processing Details

- **Generation Method:** ${
        docTypes.length > 1
          ? 'Bundled multi-document generation'
          : 'Single document generation'
      }
- **Template System:** Markdown templates with variable substitution
- **Quality Assurance:** Automatic fallback to structured templates if AI generation fails
- **Total Sources:** ${
        (data.discussion ? 1 : 0) +
        data.prs.length +
        data.issues.length +
        data.jiraIssues.length
      }
- **Processing Time:** ${dateOnly}

## Source Attribution

This documentation was automatically generated from the following sources:

${
  data.discussion
    ? `- GitHub Discussion #${data.discussion.number}: "${data.discussion.title}"`
    : ''
}
${data.prs
  .map((pr) => `- Pull Request #${pr.number}: "${pr.title}"`)
  .join('\n')}
${data.issues
  .map((issue) => `- Issue #${issue.number}: "${issue.title}"`)
  .join('\n')}
${data.jiraIssues
  .map((jira) => `- Jira ${jira.key}: "${jira.summary}"`)
  .join('\n')}

## Workflow Information

- **Environment Variables Used:**
  - DOC_TYPE: ${process.env.DOC_TYPE || 'Not set'}
  - SOURCE_MODULES: ${process.env.SOURCE_MODULES || 'Not set'}
  - PR_NUMBERS: ${process.env.PR_NUMBERS || 'Not set'}
  - ISSUE_NUMBERS: ${process.env.ISSUE_NUMBERS || 'Not set'}
  - JIRA_KEYS: ${process.env.JIRA_KEYS || 'Not set'}
  - DISCUSSION_NUMBER: ${process.env.DISCUSSION_NUMBER || 'Not set'}
  - DISCUSSION_TITLE: ${process.env.DISCUSSION_TITLE || 'Not set'}
  - DISCUSSION_AUTHOR: ${process.env.DISCUSSION_AUTHOR || 'Not set'}
  - DISCUSSION_COMMENTS_COUNT: ${
    process.env.DISCUSSION_COMMENTS_COUNT || 'Not set'
  }
  - DISCUSSION_URL: ${process.env.DISCUSSION_URL || 'Not set'}

- **Collected Data Summary:**
  - Discussion: ${
    data.discussion
      ? `#${data.discussion.number} with ${data.discussion.commentsCount} comments`
      : 'None'
  }
  - PRs: ${data.prs.length}
  - Issues: ${data.issues.length}
  - Jira Tickets: ${data.jiraIssues.length}
  - ISSUE_NUMBERS: ${process.env.ISSUE_NUMBERS || 'Not set'}
  - JIRA_KEYS: ${process.env.JIRA_KEYS || 'Not set'}

${
  this.auditTrail?.templateVariables
    ? `## Template Variable Processing Audit

**Actual Content Extraction Results:**

🔍 **EXTRACTED Variables (${
        this.auditTrail.templateVariables.extracted.length
      }):**
${this.auditTrail.templateVariables.extracted
  .map((v) => `- \`{${v}}\``)
  .join('\n')}

🧠 **INFERRED Variables (${
        this.auditTrail.templateVariables.inferred.length
      }):**
${this.auditTrail.templateVariables.inferred
  .map((v) => `- \`{${v}}\``)
  .join('\n')}

📝 **GENERATED Variables (${
        this.auditTrail.templateVariables.generated.length
      }):**
${this.auditTrail.templateVariables.generated
  .map((v) => `- \`{${v}}\``)
  .join('\n')}

**Content Authenticity Score:** ${Math.round(
        (this.auditTrail.templateVariables.extracted.length /
          (this.auditTrail.templateVariables.extracted.length +
            this.auditTrail.templateVariables.inferred.length +
            this.auditTrail.templateVariables.generated.length)) *
          100
      )}%

${
  this.auditTrail.templateVariables.generated.length > 0
    ? `
## 🚨 FABRICATION AUDIT ALERT

**⚠️ GENERATED CONTENT DETECTED:** This document contains ${
        this.auditTrail.templateVariables.generated.length
      } system-generated variables that may require validation:

${this.auditTrail.templateVariables.generated
  .map((v) => {
    // Identify high-risk variables
    const HIGH_RISK_VARS = [
      'budgetStatus',
      'risksBlockers',
      'decisionsNeeded',
      'upcomingItems',
      'timelineUpdates',
    ];
    const riskLevel = HIGH_RISK_VARS.includes(v)
      ? '🚨 **HIGH RISK**'
      : '⚠️  Medium Risk';
    return `- \`{${v}}\` - ${riskLevel}`;
  })
  .join('\n')}

### Compliance Requirements
- Documents with >30% generated content require manager approval
- Financial/budget content requires CFO/finance team validation
- Timeline claims require project manager confirmation
- Action items require stakeholder validation

### Next Steps
1. Review all flagged generated content above
2. Replace system-generated content with actual project data
3. Obtain required approvals before official distribution
4. Schedule validation meetings for high-risk generated content

**Authenticity Rating:** ${
        this.auditTrail.templateVariables.extracted.length /
          (this.auditTrail.templateVariables.extracted.length +
            this.auditTrail.templateVariables.inferred.length +
            this.auditTrail.templateVariables.generated.length) >
        0.7
          ? '✅ HIGH (>70% extracted)'
          : this.auditTrail.templateVariables.extracted.length /
              (this.auditTrail.templateVariables.extracted.length +
                this.auditTrail.templateVariables.inferred.length +
                this.auditTrail.templateVariables.generated.length) >
            0.5
          ? '⚠️  MEDIUM (50-70% extracted)'
          : '🚨 LOW (<50% extracted) - REQUIRES VALIDATION'
      }
`
    : '✅ **NO FABRICATED CONTENT DETECTED** - All content extracted from source data'
}
      )}% (Percentage of content directly extracted from sources)

`
    : ''
}

---

*This metadata file was automatically generated by Chroniclr to provide transparency and traceability for the documentation generation process.*
`;

      await fs.writeFile(metadataPath, metadata, 'utf8');
      core.info(`✅ Generated metadata file: generation-metadata.md`);

      return metadataPath;
    } catch (error) {
      core.error(`Failed to generate metadata file: ${error.message}`);
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
