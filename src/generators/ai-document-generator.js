#!/usr/bin/env node

/**
 * AI Document Generator using GitHub Models API
 * Replaces Claude Code with built-in GitHub AI models
 */

const core = require('@actions/core');
const fs = require('fs').promises;
const path = require('path');
const { globalRequestQueue } = require('../utils/request-queue');

class AIDocumentGenerator {
  constructor() {
    this.baseURL = 'https://models.github.ai/inference';
    this.apiKey = process.env.GITHUB_TOKEN;
    this.model = 'gpt-4o';

    // Log configuration for debugging
    core.info(`AI Generator initialized with model: ${this.model}`);
    core.info(`API endpoint: ${this.baseURL}/chat/completions`);
  }

  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async handleRateLimitAndRetry(
    response,
    retryCount,
    maxRetries,
    baseDelayMs,
    prompt
  ) {
    const status = response.status;

    // Retry on 429 (rate limit) and 5xx server errors
    if (status === 429 || status >= 500) {
      if (retryCount < maxRetries) {
        // Derive delay from Retry-After header or exponential backoff
        let delayMs = baseDelayMs * Math.pow(2, retryCount);
        const retryAfter = response.headers?.get?.('retry-after');
        if (retryAfter) {
          const asNumber = Number(retryAfter);
          if (!Number.isNaN(asNumber)) {
            delayMs = Math.max(delayMs, asNumber * 1000);
          } else {
            const asDate = Date.parse(retryAfter);
            if (!Number.isNaN(asDate)) {
              const delta = asDate - Date.now();
              if (delta > 0) delayMs = Math.max(delayMs, delta);
            }
          }
        }

        core.warning(
          `Rate limit/Server error ${status}. Waiting ${delayMs}ms before retry ${
            retryCount + 1
          }/${maxRetries}...`
        );
        await this.sleep(delayMs);
        // Signal to retry by returning true
        return true;
      }

      core.error(`Max retries reached for status ${status}.`);
      return false;
    }

    // No retry handling for other statuses
    return false;
  }

  async generateCompletion(prompt) {
    const maxRetries = 3;
    const baseDelayMs = 1000; // Start with 1 second

    // Queue the request to prevent concurrent API calls
    return globalRequestQueue.add(async () => {
      let attempt = 0;
      while (attempt <= maxRetries) {
        try {
          core.info(
            `Making AI API request... (attempt ${attempt + 1}/${
              maxRetries + 1
            })`
          );
          const queueStatus = globalRequestQueue.getStatus();
          core.info(
            `Queue status: ${queueStatus.queueLength} pending, ${queueStatus.activeRequests} active`
          );

          const requestBody = {
            model: this.model,
            messages: [
              {
                role: 'system',
                content:
                  'You are a professional documentation generator. Create well-structured, comprehensive documents based on GitHub discussion content.',
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
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
            },
            body: JSON.stringify(requestBody),
          });

          core.info(`API response status: ${response.status}`);

          if (!response.ok) {
            const errorText = await response.text();
            core.error(
              `API request failed: ${response.status} ${response.statusText}`
            );
            core.error(`Response body: ${errorText}`);

            // Use helper for rate limiting and retry logic
            const shouldRetry = await this.handleRateLimitAndRetry(
              response,
              attempt,
              maxRetries,
              baseDelayMs,
              prompt
            );
            if (shouldRetry) {
              attempt++;
              continue;
            }

            throw new Error(
              `API request failed: ${response.status} ${response.statusText}`
            );
          }

          const data = await response.json();
          core.info('AI response received successfully');

          if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            core.error('Invalid API response structure');
            core.error(`Response: ${JSON.stringify(data, null, 2)}`);
            throw new Error('Invalid API response structure');
          }

          return data.choices[0].message.content;
        } catch (error) {
          core.error(`AI API call failed: ${error.message}`);

          // Only use fallback after all retries exhausted
          if (attempt >= maxRetries) {
            core.error(
              `All ${
                maxRetries + 1
              } attempts failed. Using fallback document generation.`
            );
            return this.generateFallbackDocument(prompt);
          }

          // If this is a network error and we haven't exhausted retries, try again
          if (
            attempt < maxRetries &&
            (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND')
          ) {
            const delayMs = baseDelayMs * Math.pow(2, attempt);
            core.warning(
              `Network error. Retrying in ${delayMs}ms... (${
                attempt + 1
              }/${maxRetries})`
            );
            await this.sleep(delayMs);
            attempt++;
            continue;
          }

          throw error;
        }
      }
    });
  }

  generateFallbackDocument(prompt) {
    core.warning('Using fallback document generation (no AI processing)');

    // Extract basic info from prompt for a structured fallback
    const lines = prompt.split('\n');
    const titleLine = lines.find((line) => line.includes('Title:'));
    const title = titleLine
      ? titleLine.replace('Title:', '').trim()
      : 'Generated Document';

    return `# ${title}

## Overview
This document was generated from a GitHub discussion but AI processing is currently unavailable.

## Summary
Please refer to the original discussion for full details.

## Next Steps
- Review the source discussion
- Update this document with proper structure
- Contact administrators about AI service issues

---
*This document was generated by Chroniclr with fallback processing*`;
  }

  async loadTemplate(templateType) {
    const templatePath = path.join(
      __dirname,
      '..',
      'templates',
      `${templateType}.md`
    );
    try {
      return await fs.readFile(templatePath, 'utf8');
    } catch (error) {
      core.warning(`Template not found: ${templatePath}`);
      return this.getDefaultTemplate(templateType);
    }
  }

  getDefaultTemplate(templateType) {
    const templates = {
      summary: `# {title}

## Overview
{overview}

## Key Points
{keyPoints}

## Action Items
{actionItems}

## Participants
{participants}

---
*This document was automatically generated by Chroniclr from GitHub discussion #{discussionNumber}*`,

      'initiative-brief': `# Initiative: {title}

## Problem Statement
{problemStatement}

## Proposed Solution
{proposedSolution}

## Timeline
{timeline}

## Resources Required
{resources}

## Success Criteria
{successCriteria}

---
*This document was automatically generated by Chroniclr from GitHub discussion #{discussionNumber}*`,

      'meeting-notes': `# Meeting Notes: {title}

**Date:** {date}
**Attendees:** {participants}

## Agenda
{agenda}

## Discussion Points
{discussionPoints}

## Decisions Made
{decisions}

## Action Items
{actionItems}

## Next Steps
{nextSteps}

---
*This document was automatically generated by Chroniclr from GitHub discussion #{discussionNumber}*`,

      changelog: `# Changelog Entry

## Version {version}
**Release Date:** {date}

### Added
{addedFeatures}

### Changed
{changedFeatures}

### Fixed
{fixedIssues}

---
*This document was automatically generated by Chroniclr from GitHub discussion #{discussionNumber}*`,
    };

    return templates[templateType] || templates['summary'];
  }

  async generateDocument(docType, discussionData) {
    const template = await this.loadTemplate(docType);

    // Log if we have comments in the content
    const hasComments = discussionData.body.includes(
      '--- DISCUSSION COMMENTS ---'
    );
    const commentsCount = hasComments
      ? (discussionData.body.match(/\*\*Comment \d+ by @/g) || []).length
      : 0;

    // Fetch reaction/engagement data if available
    let engagementData = null;
    if (discussionData.owner && discussionData.repo) {
      try {
        const { GitHubReactionsClient } = require('../utils/github-reactions');
        const reactionsClient = new GitHubReactionsClient();
        engagementData = await reactionsClient.getDiscussionEngagementData(
          discussionData.owner,
          discussionData.repo,
          discussionData.number
        );
        core.info(
          `- Engagement data: ${engagementData.summary.totalEngagement} reactions, ${engagementData.summary.participationLevel} participation`
        );
      } catch (error) {
        core.warning(`Could not fetch engagement data: ${error.message}`);
      }
    }

    core.info(`Processing discussion for ${docType} generation:`);
    core.info(
      `- Main discussion content: ${
        discussionData.body.split('--- DISCUSSION COMMENTS ---')[0].length
      } characters`
    );
    core.info(`- Comments included: ${hasComments ? 'Yes' : 'No'}`);
    core.info(`- Number of comments: ${commentsCount}`);

    // Build engagement context for AI prompt
    let engagementContext = '';
    if (engagementData && engagementData.summary.totalEngagement > 0) {
      engagementContext = `

Community Engagement Analysis:
- Total Reactions: ${engagementData.summary.totalEngagement}
- Participation Level: ${engagementData.summary.participationLevel}  
- Overall Sentiment: ${engagementData.summary.overallSentiment}
- Main Discussion Reactions: ${engagementData.mainDiscussion.totalReactions} (${
        engagementData.mainDiscussion.positive
      } positive, ${engagementData.mainDiscussion.negative} negative)

High-Engagement Comments (prioritize these):
${engagementData.summary.topComments
  .map(
    (comment) =>
      `- @${comment.author}: ${comment.body}... (${comment.totalReactions} reactions, sentiment: ${comment.sentiment})`
  )
  .join('\n')}

${
  engagementData.summary.controversialContent.length > 0
    ? `
Controversial Points (mixed reactions - highlight for discussion):
${engagementData.summary.controversialContent
  .map(
    (item) =>
      `- ${item.type}: ${
        item.body ? item.body.substring(0, 100) : 'Main discussion'
      }... (${item.positive} 👍 vs ${item.negative} 👎)`
  )
  .join('\n')}`
    : ''
}
`;
    }

    const prompt = `
Based on the following GitHub discussion (including all comments and community engagement), generate a ${docType} document using this template structure:

Template:
${template}

Discussion Details:
- Title: ${discussionData.title}
- Author: ${discussionData.author}
- URL: ${discussionData.url}
- Full Discussion Content (main post + all comments):
${discussionData.body}${engagementContext}

Instructions:
1. Analyze BOTH the main discussion post AND all comments for comprehensive information
2. Extract key insights, decisions, and action items from the entire conversation thread
3. Identify stakeholders mentioned in comments and their contributions
4. Synthesize information from multiple participants into cohesive sections
5. Prioritize information based on frequency of mention, importance, AND community engagement (reactions)
6. Give extra weight to highly-reacted content and controversial points that need attention
7. Fill in template variables with comprehensive content from the full discussion
8. Maintain professional tone while capturing diverse viewpoints from comments
9. Include specific details, action items, timelines, and technical specifications mentioned
10. Replace {discussionNumber} with ${discussionData.number}
11. Return only the final document content, no explanations

Key areas to focus on when processing comments:
- Technical implementation details and code suggestions
- User feedback and feature requests (especially highly-reacted ones)
- Progress updates and status reports
- Decisions made and rationale provided  
- Action items with assigned owners and deadlines
- Concerns raised and mitigation strategies (especially controversial points)
- Alternative approaches and recommendations
- Community consensus indicators from reaction patterns

CRITICAL: For action items, use this specific format for GitHub issue creation:
- [ ] @username: Task description (Due: Aug 10)
- [ ] @assignee: Another task description (Due: Aug 15)

Ensure all action items follow this format exactly so they can be automatically converted to GitHub issues with proper assignments and due dates.

Generate the comprehensive ${docType} document now:
`;

    try {
      core.info(`Generating ${docType} document with AI...`);
      const generatedContent = await this.generateCompletion(prompt);

      // Validate that we got actual generated content, not just copied input
      if (generatedContent.includes(discussionData.body.substring(0, 100))) {
        core.warning(
          'Generated content appears to be copied input - AI processing may have failed'
        );
      }

      return generatedContent;
    } catch (error) {
      core.error(`Failed to generate ${docType}: ${error.message}`);

      // Return a basic structured document instead of failing completely
      const template = await this.loadTemplate(docType);
      return template
        .replace(/\{title\}/g, discussionData.title)
        .replace(/\{discussionNumber\}/g, discussionData.number)
        .replace(/\{.*?\}/g, '[AI processing unavailable]');
    }
  }

  async saveDocument(docType, content, discussionNumber) {
    const outputDir = path.join(process.cwd(), 'docs');
    await fs.mkdir(outputDir, { recursive: true });

    const filename = `${docType}-${discussionNumber}.md`;
    const filepath = path.join(outputDir, filename);

    await fs.writeFile(filepath, content, 'utf8');
    core.info(`Generated: ${filepath}`);

    return filepath;
  }
}

async function main() {
  try {
    const docType = process.env.DOC_TYPE || core.getInput('doc-type');
    const discussionNumber =
      process.env.DISCUSSION_NUMBER || core.getInput('discussion-number');
    const discussionTitle =
      process.env.DISCUSSION_TITLE || core.getInput('discussion-title');
    const discussionBody =
      process.env.DISCUSSION_BODY || core.getInput('discussion-body');
    const discussionAuthor =
      process.env.DISCUSSION_AUTHOR || core.getInput('discussion-author');
    const discussionUrl =
      process.env.DISCUSSION_URL || core.getInput('discussion-url');

    if (!docType || !discussionNumber || !discussionTitle || !discussionBody) {
      core.setFailed('Missing required parameters');
      return;
    }

    const generator = new AIDocumentGenerator();

    // Extract owner/repo from GitHub repository environment or URL
    const gitHubRepository = process.env.GITHUB_REPOSITORY;
    let owner, repo;
    if (gitHubRepository) {
      [owner, repo] = gitHubRepository.split('/');
    } else if (discussionUrl) {
      // Parse from URL like https://github.com/owner/repo/discussions/123
      const urlMatch = discussionUrl.match(
        /github\.com\/([^\/]+)\/([^\/]+)\/discussions/
      );
      if (urlMatch) {
        [, owner, repo] = urlMatch;
      }
    }

    const discussionData = {
      number: discussionNumber,
      title: discussionTitle,
      body: discussionBody,
      author: discussionAuthor,
      url: discussionUrl,
      owner,
      repo,
    };

    core.info(
      `Generating ${docType} document for discussion #${discussionNumber}`
    );

    const content = await generator.generateDocument(docType, discussionData);
    const filepath = await generator.saveDocument(
      docType,
      content,
      discussionNumber
    );

    core.setOutput('filepath', filepath);
    core.setOutput('generated', 'true');
  } catch (error) {
    core.setFailed(`Document generation failed: ${error.message}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { AIDocumentGenerator };
