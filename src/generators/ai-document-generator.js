#!/usr/bin/env node

/**
 * Simple AI Document Generator for GitHub Actions
 * Generates documentation from discussions, PRs, issues, and Jira
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
    this.jiraClient = null; // Lazy load when needed

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


  extractRateLimitHeaders(response) {
    const headers = {};
    const rateLimitHeaders = [
      'x-ratelimit-limit',
      'x-ratelimit-remaining', 
      'x-ratelimit-reset',
      'x-ratelimit-used',
      'x-ratelimit-resource',
      'retry-after'
    ];

    rateLimitHeaders.forEach(header => {
      const value = response.headers.get(header);
      if (value) {
        headers[header] = value;
      }
    });

    return Object.keys(headers).length > 0 ? headers : null;
  }

  identifyRateLimitType(response) {
    const url = response.url || '';
    const retryAfter = response.headers.get('retry-after');
    
    if (url.includes('models.github.ai')) {
      let waitTime = '';
      if (retryAfter) {
        const minutes = Math.ceil(parseInt(retryAfter) / 60);
        waitTime = ` (wait ~${minutes} minutes)`;
      }
      return `GitHub Models API${waitTime}`;
    }
    
    return 'Unknown API endpoint';
  }

  async generateCompletion(prompt) {
    const maxRetries = 3;
    const baseDelayMs = 2000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        core.info(`Making AI API request... (attempt ${attempt + 1}/${maxRetries + 1})`);

        const response = await fetch(`${this.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              {
                role: 'system',
                content: 'You are a professional documentation generator. Create well-structured, comprehensive documents based on the provided data sources.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            max_tokens: 4000,
            temperature: 0.3
          })
        });

        if (!response.ok) {
          if (response.status === 429) {
            const limitType = this.identifyRateLimitType(response);
            core.error(`🚨 Rate limit hit: ${limitType}`);
            
            const retryAfter = response.headers.get('retry-after');
            if (retryAfter) {
              const waitSeconds = parseInt(retryAfter);
              const waitMinutes = Math.ceil(waitSeconds / 60);
              core.error(`⏰ Must wait ${waitSeconds} seconds (~${waitMinutes} minutes) before next request`);
              core.error(`💡 Falling back to template-only generation to avoid long wait`);
              return null; // Don't retry - wait time is too long
            }
            
            if (attempt < maxRetries) {
              const delayMs = baseDelayMs * Math.pow(2, attempt);
              core.warning(`⏳ Retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`);
              await this.sleep(delayMs);
              continue;
            } else {
              core.error(`❌ Max retries exceeded`);
            }
          }
          
          core.error(`AI API request failed: ${response.status} ${response.statusText}`);
          return null;
        }

        const data = await response.json();
        if (data.choices && data.choices.length > 0) {
          core.info('AI response received successfully');
          return data.choices[0].message.content;
        }
        return null;

      } catch (error) {
        core.error(`AI API request error: ${error.message}`);
        if (attempt === maxRetries) {
          return null;
        }
        await this.sleep(baseDelayMs * Math.pow(2, attempt));
      }
    }
    return null;
  }

  async loadTemplate(docType) {
    const templatePath = path.join(process.cwd(), 'src', 'templates', `${docType}.md`);
    
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

  async collectDataFromSources() {
    const sourceModules = (process.env.SOURCE_MODULES || 'discussion').split(',').map(s => s.trim());
    const collectedData = {
      discussion: null,
      prs: [],
      issues: [],
      jiraIssues: [],
      sources: sourceModules
    };

    // Collect Discussion Data
    if (sourceModules.includes('discussion') && process.env.DISCUSSION_NUMBER) {
      collectedData.discussion = {
        number: process.env.DISCUSSION_NUMBER,
        title: process.env.DISCUSSION_TITLE || 'Discussion',
        body: process.env.DISCUSSION_BODY || '',
        author: process.env.DISCUSSION_AUTHOR || 'unknown',
        url: process.env.DISCUSSION_URL || '',
        commentsCount: parseInt(process.env.DISCUSSION_COMMENTS_COUNT) || 0
      };
      core.info(`✅ Collected discussion data: #${collectedData.discussion.number}`);
    }

    // Collect PR Data
    if (sourceModules.includes('pr') && process.env.PR_NUMBERS) {
      const prNumbers = process.env.PR_NUMBERS.split(',').map(n => n.trim()).filter(n => n);
      collectedData.prs = await this.prClient.fetchPullRequests(prNumbers);
      core.info(`✅ Collected ${collectedData.prs.length} PRs`);
    }

    // Collect Issues Data
    if (sourceModules.includes('issues') && process.env.ISSUE_NUMBERS) {
      const issueNumbers = process.env.ISSUE_NUMBERS.split(',').map(n => n.trim()).filter(n => n);
      collectedData.issues = await this.issuesClient.fetchIssues(issueNumbers);
      core.info(`✅ Collected ${collectedData.issues.length} issues`);
    }

    // Collect Jira Data
    if (sourceModules.includes('jira') && process.env.JIRA_KEYS) {
      const jiraClient = this.getJiraClient();
      const jiraKeys = process.env.JIRA_KEYS.split(',').map(k => k.trim()).filter(k => k);
      collectedData.jiraIssues = await jiraClient.fetchJiraIssues(jiraKeys);
      core.info(`✅ Collected ${collectedData.jiraIssues.length} Jira issues`);
    }

    return collectedData;
  }

  createAIPrompt(docType, data, template) {
    let prompt = `Generate a ${docType} document using the following data sources:\n\n`;

    // Add discussion content
    if (data.discussion) {
      prompt += `## Discussion Data\n`;
      prompt += `Title: ${data.discussion.title}\n`;
      prompt += `Author: ${data.discussion.author}\n`;
      prompt += `Content:\n${data.discussion.body}\n\n`;
    }

    // Add PR content
    if (data.prs.length > 0) {
      prompt += `## Pull Requests (${data.prs.length})\n`;
      data.prs.forEach(pr => {
        prompt += `- PR #${pr.number}: ${pr.title} (${pr.author})\n`;
        prompt += `  Status: ${pr.state}, Files: ${pr.files || 0}\n`;
      });
      prompt += `\n`;
    }

    // Add issues content
    if (data.issues.length > 0) {
      prompt += `## GitHub Issues (${data.issues.length})\n`;
      data.issues.forEach(issue => {
        prompt += `- Issue #${issue.number}: ${issue.title} (${issue.author})\n`;
        prompt += `  Status: ${issue.state}\n`;
      });
      prompt += `\n`;
    }

    // Add Jira content
    if (data.jiraIssues.length > 0) {
      prompt += `## Jira Issues (${data.jiraIssues.length})\n`;
      data.jiraIssues.forEach(issue => {
        prompt += `- ${issue.key}: ${issue.summary}\n`;
        prompt += `  Status: ${issue.status}\n`;
      });
      prompt += `\n`;
    }

    prompt += `Please create a comprehensive ${docType} document that synthesizes information from all provided sources. Follow the template structure and create clear, professional documentation.\n\n`;
    prompt += `Template Structure:\n${template}`;

    return prompt;
  }

  async generateDocument() {
    try {
      const docTypesString = process.env.DOC_TYPE || 'summary';
      const docTypes = docTypesString.split(' ').map(type => type.trim()).filter(type => type);
      
      core.info(`Processing ${docTypes.length} document types: ${docTypes.join(', ')}`);
      
      
      // Collect data from all enabled sources
      const data = await this.collectDataFromSources();
      
      // Use batched generation for multiple documents to reduce API calls
      if (docTypes.length > 1) {
        core.info('Using batched generation to avoid rate limits...');
        return await this.generateBatchedDocuments(docTypes, data);
      } else {
        // Single document generation
        const result = await this.generateSingleDocument(docTypes[0], data);
        return result ? [result] : [];
      }
      
    } catch (error) {
      core.error(`Document generation failed: ${error.message}`);
      throw error;
    }
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

      // Save document
      return await this.saveDocument(docType, data, finalContent);

    } catch (error) {
      core.error(`Single document generation failed for ${docType}: ${error.message}`);
      return null;
    }
  }

  async generateBatchedDocuments(docTypes, data) {
    try {
      core.info(`Generating ${docTypes.length} documents in a single AI request...`);
      
      // Load all templates
      const templates = {};
      for (const docType of docTypes) {
        templates[docType] = await this.loadTemplate(docType);
      }
      
      // Create batched AI prompt
      const prompt = this.createBatchedAIPrompt(docTypes, data, templates);
      
      // Generate all content with single AI call
      const aiContent = await this.generateCompletion(prompt);
      
      if (!aiContent) {
        core.warning('Batched AI generation failed, falling back to individual templates');
        return await this.generateFallbackDocuments(docTypes, data, templates);
      }
      
      // Parse the batched response
      const parsedDocuments = this.parseBatchedResponse(aiContent, docTypes);
      
      // Save each document
      const results = [];
      for (const docType of docTypes) {
        const content = parsedDocuments[docType] || this.createFallbackContent(docType, data, templates[docType]);
        const result = await this.saveDocument(docType, data, content);
        if (result) {
          results.push(result);
        }
      }
      
      return results;
      
    } catch (error) {
      core.error(`Batched generation failed: ${error.message}`);
      core.info('Falling back to individual template generation...');
      
      // Fallback to template-only generation
      const templates = {};
      for (const docType of docTypes) {
        templates[docType] = await this.loadTemplate(docType);
      }
      return await this.generateFallbackDocuments(docTypes, data, templates);
    }
  }

  async generateAITopic(data) {
    // Collect content for topic generation
    let content = '';
    if (data.discussion) content += `Discussion: "${data.discussion.title}" `;
    if (data.prs.length > 0) content += `PRs: ${data.prs.map(pr => pr.title).join(', ')} `;
    if (data.issues.length > 0) content += `Issues: ${data.issues.map(i => i.title).join(', ')} `;
    if (data.jiraIssues.length > 0) content += `Jira: ${data.jiraIssues.map(j => j.summary).join(', ')} `;

    if (!content.trim()) return 'general';

    // Simple topic extraction without AI to avoid rate limits
    return this.extractTopicFromTitle(data.discussion?.title || data.prs[0]?.title || 'general');
  }

  extractTopicFromTitle(title) {
    if (!title) return 'general';
    
    // Extract meaningful keywords, skip common words
    const skipWords = ['the', 'and', 'for', 'with', 'fix', 'add', 'update', 'improve', 'bug', 'issue'];
    const words = title.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2 && !skipWords.includes(word))
      .slice(0, 3);
    
    if (words.length === 0) {
      return title.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .slice(0, 3)
        .join('-') || 'general';
    }
    
    return words.join('-').substring(0, 20);
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
      return `${docType}-pr-${data.prs.map(pr => pr.number).join('-')}.md`;
    } else if (data.issues.length > 0) {
      return `${docType}-issues-${data.issues.map(i => i.number).join('-')}.md`;
    } else if (data.jiraIssues.length > 0) {
      return `${docType}-jira-${data.jiraIssues.map(j => j.key).join('-')}.md`;
    } else {
      const timestamp = Date.now();
      return `${docType}-${timestamp}.md`;
    }
  }

  createFallbackContent(docType, data, template) {
    const currentDate = new Date().toISOString().split('T')[0];
    
    // Simple variable replacement
    let content = template;
    content = content.replace(/{title}/g, data.discussion?.title || `${docType} Document`);
    content = content.replace(/{date}/g, currentDate);
    content = content.replace(/{content}/g, this.generateBasicContent(data));
    content = content.replace(/{summary}/g, this.generateBasicSummary(data));
    
    return content;
  }

  generateBasicContent(data) {
    let content = '';
    
    if (data.discussion) {
      content += `## Discussion\n${data.discussion.body}\n\n`;
    }
    
    if (data.prs.length > 0) {
      content += `## Pull Requests\n`;
      data.prs.forEach(pr => {
        content += `- [PR #${pr.number}](${pr.url}): ${pr.title}\n`;
      });
      content += '\n';
    }
    
    if (data.issues.length > 0) {
      content += `## Issues\n`;
      data.issues.forEach(issue => {
        content += `- [Issue #${issue.number}](${issue.url}): ${issue.title}\n`;
      });
      content += '\n';
    }
    
    if (data.jiraIssues.length > 0) {
      content += `## Jira Issues\n`;
      data.jiraIssues.forEach(issue => {
        content += `- [${issue.key}](${issue.url}): ${issue.summary}\n`;
      });
      content += '\n';
    }
    
    return content;
  }

  generateBasicSummary(data) {
    const totalItems = (data.discussion ? 1 : 0) + data.prs.length + data.issues.length + data.jiraIssues.length;
    return `Processed ${totalItems} items from ${data.sources.join(', ')} sources.`;
  }

  createBatchedAIPrompt(docTypes, data, templates) {
    let prompt = `Generate ${docTypes.length} different document types in a single response using the following data sources:\n\n`;
    
    // Add data sources
    if (data.discussion) {
      prompt += `## Discussion Data\n`;
      prompt += `Title: ${data.discussion.title}\n`;
      prompt += `Author: ${data.discussion.author}\n`;
      prompt += `Content:\n${data.discussion.body}\n\n`;
    }
    
    if (data.prs.length > 0) {
      prompt += `## Pull Requests (${data.prs.length})\n`;
      data.prs.forEach(pr => {
        prompt += `- PR #${pr.number}: ${pr.title} (${pr.author})\n`;
      });
      prompt += `\n`;
    }
    
    if (data.issues.length > 0) {
      prompt += `## GitHub Issues (${data.issues.length})\n`;
      data.issues.forEach(issue => {
        prompt += `- Issue #${issue.number}: ${issue.title} (${issue.author})\n`;
      });
      prompt += `\n`;
    }
    
    if (data.jiraIssues.length > 0) {
      prompt += `## Jira Issues (${data.jiraIssues.length})\n`;
      data.jiraIssues.forEach(issue => {
        prompt += `- ${issue.key}: ${issue.summary}\n`;
      });
      prompt += `\n`;
    }
    
    prompt += `Please generate the following ${docTypes.length} documents. Use the format:\n\n`;
    prompt += `=== DOCUMENT_TYPE_NAME ===\n[content]\n=== END_DOCUMENT_TYPE_NAME ===\n\n`;
    
    docTypes.forEach(docType => {
      prompt += `Required document: ${docType}\n`;
      prompt += `Template structure for ${docType}:\n${templates[docType]}\n\n`;
    });
    
    return prompt;
  }

  parseBatchedResponse(aiContent, docTypes) {
    const documents = {};
    
    docTypes.forEach(docType => {
      const startMarker = `=== ${docType.toUpperCase()} ===`;
      const endMarker = `=== END_${docType.toUpperCase()} ===`;
      
      const startIndex = aiContent.indexOf(startMarker);
      const endIndex = aiContent.indexOf(endMarker);
      
      if (startIndex !== -1 && endIndex !== -1) {
        const content = aiContent.substring(startIndex + startMarker.length, endIndex).trim();
        documents[docType] = content;
        core.info(`✅ Parsed ${docType} document from batched response`);
      } else {
        core.warning(`❌ Could not parse ${docType} from batched response`);
      }
    });
    
    return documents;
  }

  async generateFallbackDocuments(docTypes, data, templates) {
    const results = [];
    
    for (const docType of docTypes) {
      core.info(`Generating fallback ${docType} document using template...`);
      const content = this.createFallbackContent(docType, data, templates[docType]);
      const result = await this.saveDocument(docType, data, content);
      if (result) {
        results.push(result);
      }
    }
    
    return results;
  }

  async saveDocument(docType, data, content) {
    try {
      const baseOutputDir = path.join(process.cwd(), 'generated');
      const sourceFolder = await this.determineSourceFolder(data);
      const outputDir = path.join(baseOutputDir, sourceFolder);
      await fs.mkdir(outputDir, { recursive: true });
      
      const fileName = this.generateFileName(docType, data);
      const filePath = path.join(outputDir, fileName);
      
      await fs.writeFile(filePath, content, 'utf8');
      
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
  generator.generateDocument().catch(error => {
    core.setFailed(error.message);
    process.exit(1);
  });
}

module.exports = { AIDocumentGenerator };