#!/usr/bin/env node

/**
 * Summary Generator for Chroniclr
 * Generates project summary documents from GitHub discussions
 */

const fs = require('fs').promises;
const path = require('path');

class SummaryGenerator {
  constructor(config = {}) {
    this.config = config;
    this.templatePath = config.templatePath || 'src/templates/summary.md';
    this.outputDir = config.outputDir || 'docs';
  }

  /**
   * Parse GitHub discussion URL to extract owner, repo, and discussion number
   * @param {string} url - GitHub discussion URL
   * @returns {object} Parsed URL components
   */
  parseDiscussionUrl(url) {
    const urlPattern = /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/discussions\/(\d+)/;
    const match = url.match(urlPattern);
    
    if (!match) {
      throw new Error('Invalid GitHub discussion URL format. Expected: https://github.com/owner/repo/discussions/number');
    }

    return {
      owner: match[1],
      repo: match[2],
      discussionNumber: match[3],
      repositoryUrl: `https://github.com/${match[1]}/${match[2]}`
    };
  }

  /**
   * Analyze discussion content to extract key information
   * @param {object} discussion - Discussion data
   * @returns {object} Analyzed content for template substitution
   */
  analyzeDiscussion(discussion) {
    const analysisDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Extract objectives from discussion body
    const objectives = this.extractObjectives(discussion.body);
    
    // Extract stakeholders from discussion participants
    const stakeholders = this.extractStakeholders(discussion);
    
    // Extract recent updates from comments
    const recentUpdates = this.extractRecentUpdates(discussion);
    
    // Extract action items
    const actionItems = this.extractActionItems(discussion.body);
    
    // Determine project status and progress
    const { status, progress, currentPhase, nextMilestone } = this.analyzeProgress(discussion);

    return {
      title: discussion.title,
      date: analysisDate,
      status: status,
      lastUpdated: new Date(discussion.updated_at).toLocaleDateString('en-US'),
      summary: this.generateProjectSummary(discussion),
      objectives: objectives,
      progress: progress,
      currentPhase: currentPhase,
      nextMilestone: nextMilestone,
      stakeholders: stakeholders,
      recentUpdates: recentUpdates,
      actionItems: actionItems,
      discussionUrl: discussion.html_url,
      repositoryUrl: discussion.repositoryUrl,
      discussionNumber: discussion.number
    };
  }

  /**
   * Extract objectives from discussion body
   */
  extractObjectives(body) {
    // Look for objectives, goals, requirements sections
    const objectivePatterns = [
      /(?:## |### )?(?:Objectives?|Goals?|Requirements?)[:\n]([^#]*?)(?=##|###|$)/gi,
      /(?:## |### )?(?:What we want|What we need)[:\n]([^#]*?)(?=##|###|$)/gi
    ];

    let objectives = '';
    for (const pattern of objectivePatterns) {
      const match = body.match(pattern);
      if (match) {
        objectives = match[0].replace(/(?:## |### )?(?:Objectives?|Goals?|Requirements?|What we want|What we need)[:\n]/i, '').trim();
        break;
      }
    }

    return objectives || 'Project objectives are being defined based on ongoing discussions.';
  }

  /**
   * Extract stakeholders from discussion
   */
  extractStakeholders(discussion) {
    const stakeholders = new Set();
    
    // Add discussion author
    stakeholders.add(`- **${discussion.user.login}** (Discussion Author)`);
    
    // Add commenters (if comments exist)
    if (discussion.comments) {
      discussion.comments.forEach(comment => {
        stakeholders.add(`- **${comment.user.login}** (Contributor)`);
      });
    }

    return Array.from(stakeholders).join('\n');
  }

  /**
   * Extract recent updates from discussion content
   */
  extractRecentUpdates(discussion) {
    const updates = [];
    const recentDate = new Date(discussion.updated_at).toLocaleDateString('en-US');
    
    updates.push(`- **${recentDate}**: Discussion updated with latest information`);
    
    // Look for update patterns in body
    const updatePatterns = [
      /(?:## |### )?(?:Updates?|Recent Changes?|Latest)[:\n]([^#]*?)(?=##|###|$)/gi,
      /(?:## |### )?(?:Status Update)[:\n]([^#]*?)(?=##|###|$)/gi
    ];

    for (const pattern of updatePatterns) {
      const match = discussion.body.match(pattern);
      if (match) {
        const updateContent = match[0].replace(/(?:## |### )?(?:Updates?|Recent Changes?|Latest|Status Update)[:\n]/i, '').trim();
        updates.push(`- ${updateContent}`);
      }
    }

    return updates.join('\n') || `- **${recentDate}**: Discussion initiated by ${discussion.user.login}`;
  }

  /**
   * Extract action items from discussion body
   */
  extractActionItems(body) {
    const actionItems = [];
    
    // Look for task lists, action items, todos
    const taskPatterns = [
      /- \[[ x]\] (.+)/gi,  // GitHub task lists
      /(?:## |### )?(?:Action Items?|Tasks?|TODOs?)[:\n]([^#]*?)(?=##|###|$)/gi
    ];

    for (const pattern of taskPatterns) {
      const matches = body.matchAll(pattern);
      for (const match of matches) {
        actionItems.push(`- ${match[1] || match[0]}`);
      }
    }

    return actionItems.join('\n') || '- Review discussion content and provide feedback\n- Identify next steps and milestones';
  }

  /**
   * Analyze discussion progress and status
   */
  analyzeProgress(discussion) {
    // Simple heuristic based on discussion age and activity
    const createdDate = new Date(discussion.created_at);
    const updatedDate = new Date(discussion.updated_at);
    const daysSinceCreated = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysSinceUpdated = Math.floor((Date.now() - updatedDate.getTime()) / (1000 * 60 * 60 * 24));

    let status, progress, currentPhase, nextMilestone;

    if (daysSinceUpdated <= 7) {
      status = 'Active';
      progress = 25;
      currentPhase = 'Planning';
      nextMilestone = 'Requirements finalization';
    } else if (daysSinceUpdated <= 30) {
      status = 'In Progress';
      progress = 50;
      currentPhase = 'Development';
      nextMilestone = 'Implementation review';
    } else {
      status = 'Stalled';
      progress = 15;
      currentPhase = 'Initial Discussion';
      nextMilestone = 'Stakeholder alignment';
    }

    return { status, progress, currentPhase, nextMilestone };
  }

  /**
   * Generate project summary from discussion content
   */
  generateProjectSummary(discussion) {
    const bodyPreview = discussion.body.substring(0, 300).replace(/\n/g, ' ').trim();
    return `${bodyPreview}${discussion.body.length > 300 ? '...' : ''}\n\nThis project discussion involves ${discussion.user.login} and aims to address key requirements and objectives as outlined in the discussion thread.`;
  }

  /**
   * Load and process template with variable substitution
   */
  async loadTemplate() {
    try {
      const templateContent = await fs.readFile(this.templatePath, 'utf8');
      return templateContent;
    } catch (error) {
      throw new Error(`Failed to load template from ${this.templatePath}: ${error.message}`);
    }
  }

  /**
   * Replace template variables with actual values
   */
  replaceTemplateVariables(template, variables) {
    let result = template;
    
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{${key}}`;
      result = result.replace(new RegExp(placeholder, 'g'), value || '');
    });

    return result;
  }

  /**
   * Generate summary document from discussion data
   */
  async generateDocument(discussionUrl, discussionData = null) {
    try {
      // Parse URL to extract components
      const urlComponents = this.parseDiscussionUrl(discussionUrl);
      
      // For demo purposes, create mock discussion data if not provided
      const discussion = discussionData || {
        number: urlComponents.discussionNumber,
        title: 'VS Code Extension Development Discussion',
        body: `# Project Overview\n\nThis discussion focuses on developing a new VS Code extension to improve developer productivity.\n\n## Objectives\n- Create a user-friendly extension interface\n- Implement core functionality for code analysis\n- Ensure compatibility with existing VS Code features\n\n## Current Status\nWe are in the initial planning phase, gathering requirements and defining the scope.\n\n## Action Items\n- [ ] Define detailed requirements\n- [ ] Create wireframes for UI components\n- [ ] Set up development environment\n- [ ] Begin prototype development`,
        user: { login: 'microsoft-developer' },
        created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
        updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
        html_url: discussionUrl,
        repositoryUrl: urlComponents.repositoryUrl
      };

      // Analyze discussion content
      const analysisResult = this.analyzeDiscussion(discussion);
      
      // Load template
      const template = await this.loadTemplate();
      
      // Replace template variables
      const generatedDocument = this.replaceTemplateVariables(template, analysisResult);
      
      // Ensure output directory exists
      await fs.mkdir(this.outputDir, { recursive: true });
      
      // Generate filename
      const filename = `summary-${urlComponents.discussionNumber}.md`;
      const outputPath = path.join(this.outputDir, filename);
      
      // Write generated document
      await fs.writeFile(outputPath, generatedDocument, 'utf8');
      
      return {
        success: true,
        outputPath: outputPath,
        filename: filename,
        discussion: analysisResult
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = SummaryGenerator;

// CLI usage
if (require.main === module) {
  async function main() {
    const discussionUrl = process.argv[2];
    
    if (!discussionUrl) {
      console.error('Usage: node summary-generator.js <discussion-url>');
      process.exit(1);
    }
    
    const generator = new SummaryGenerator();
    const result = await generator.generateDocument(discussionUrl);
    
    if (result.success) {
      console.log(`✅ Summary generated successfully!`);
      console.log(`📁 Output: ${result.outputPath}`);
      console.log(`🔗 Original Discussion: ${discussionUrl}`);
    } else {
      console.error(`❌ Failed to generate summary: ${result.error}`);
      process.exit(1);
    }
  }
  
  main().catch(console.error);
}