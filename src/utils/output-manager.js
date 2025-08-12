#!/usr/bin/env node

/**
 * Output Manager for Chroniclr
 * Handles intelligent folder creation and document organization with AI-generated names
 */

const core = require('@actions/core');
const fs = require('fs');
const path = require('path');
const { queueGitHubRequest } = require('./rate-limiter');

class OutputManager {
  constructor(options = {}) {
    this.baseOutputDir = options.baseOutputDir || '_output';
    this.github = options.github;
    this.config = {
      folderNameMaxLength: 50,
      enableTimestamp: true,
      enableAIGeneration: true,
      fallbackPattern: 'chroniclr-{timestamp}',
      reservedNames: ['docs', 'src', 'node_modules', '.git', 'tests', 'test'],
      ...options
    };
    
    this.currentSession = null;
  }

  /**
   * Initialize a new output session with intelligent folder naming
   */
  async initializeSession(context) {
    try {
      const sessionContext = this.extractSessionContext(context);
      const folderName = await this.generateIntelligentFolderName(sessionContext);
      const outputDir = path.join(this.baseOutputDir, folderName);
      
      // Create the output directory
      this.ensureDirectoryExists(outputDir);
      
      // Create session metadata
      const sessionMetadata = {
        sessionId: this.generateSessionId(),
        timestamp: new Date().toISOString(),
        folderName,
        outputDir,
        context: sessionContext,
        generatedFiles: [],
        sources: sessionContext.sources || [],
        summary: null
      };
      
      // Save session metadata
      const metadataPath = path.join(outputDir, '.chroniclr-session.json');
      fs.writeFileSync(metadataPath, JSON.stringify(sessionMetadata, null, 2));
      
      this.currentSession = sessionMetadata;
      
      core.info(`📁 Output session initialized:`);
      core.info(`  Folder: ${folderName}`);
      core.info(`  Path: ${outputDir}`);
      core.info(`  Session ID: ${sessionMetadata.sessionId}`);
      
      return sessionMetadata;
      
    } catch (error) {
      core.error(`Failed to initialize output session: ${error.message}`);
      // Fall back to simple timestamp-based folder
      return this.createFallbackSession();
    }
  }

  /**
   * Extract context information for folder naming
   */
  extractSessionContext(context) {
    const sessionContext = {
      timestamp: new Date().toISOString(),
      sources: [],
      identifiers: [],
      topics: [],
      participants: [],
      type: 'documentation'
    };

    // Extract from discussion
    if (context.discussionNumber && context.discussionTitle) {
      sessionContext.identifiers.push(`discussion-${context.discussionNumber}`);
      sessionContext.topics.push(...this.extractTopicsFromText(context.discussionTitle));
      if (context.discussionAuthor) {
        sessionContext.participants.push(context.discussionAuthor);
      }
      sessionContext.sources.push('discussion');
    }

    // Extract from PR numbers
    if (context.prNumbers) {
      const prNums = context.prNumbers.split(',').map(n => n.trim());
      sessionContext.identifiers.push(...prNums.map(n => `pr-${n}`));
      sessionContext.sources.push('pr');
    }

    // Extract from Jira keys
    if (context.jiraKeys) {
      const jiraKeys = context.jiraKeys.split(',').map(k => k.trim());
      sessionContext.identifiers.push(...jiraKeys);
      sessionContext.topics.push(...jiraKeys.map(k => k.split('-')[0])); // Project codes
      sessionContext.sources.push('jira');
    }

    // Determine session type
    if (sessionContext.sources.includes('pr')) {
      sessionContext.type = sessionContext.sources.length > 1 ? 'release-analysis' : 'pr-analysis';
    } else if (sessionContext.sources.includes('jira')) {
      sessionContext.type = sessionContext.sources.length > 1 ? 'cross-platform' : 'jira-report';
    } else {
      sessionContext.type = 'documentation';
    }

    return sessionContext;
  }

  /**
   * Generate intelligent folder name using AI and context analysis
   */
  async generateIntelligentFolderName(context) {
    let folderName;
    
    if (this.config.enableAIGeneration && this.github) {
      try {
        folderName = await this.generateAIFolderName(context);
      } catch (error) {
        core.warning(`AI folder name generation failed: ${error.message}`);
        folderName = this.generateContextualFolderName(context);
      }
    } else {
      folderName = this.generateContextualFolderName(context);
    }

    // Ensure folder name is valid and unique
    folderName = this.sanitizeFolderName(folderName);
    folderName = await this.ensureUniqueFolderName(folderName);

    return folderName;
  }

  /**
   * Generate folder name using GitHub Models AI
   */
  async generateAIFolderName(context) {
    const prompt = this.buildAIPrompt(context);
    
    core.info('🤖 Generating AI folder name...');
    
    const response = await queueGitHubRequest(
      async () => {
        return await fetch('https://models.inference.ai.azure.com/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messages: [
              {
                role: 'system',
                content: 'You are a helpful assistant that generates concise, descriptive folder names for documentation projects. Return only the folder name, no explanations.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            model: 'gpt-4o',
            max_tokens: 50,
            temperature: 0.7
          })
        });
      },
      'primary',
      'normal'
    );

    if (!response.ok) {
      throw new Error(`AI API request failed: ${response.status}`);
    }

    const data = await response.json();
    const aiSuggestion = data.choices[0]?.message?.content?.trim();
    
    if (aiSuggestion && aiSuggestion.length > 0) {
      core.info(`🎯 AI suggested folder name: ${aiSuggestion}`);
      return aiSuggestion;
    }
    
    throw new Error('No AI suggestion received');
  }

  /**
   * Build AI prompt for folder name generation
   */
  buildAIPrompt(context) {
    let prompt = `Generate a concise, descriptive folder name for a documentation generation session with these details:\n\n`;
    
    prompt += `Session Type: ${context.type}\n`;
    prompt += `Data Sources: ${context.sources.join(', ')}\n`;
    
    if (context.identifiers.length > 0) {
      prompt += `Key Identifiers: ${context.identifiers.slice(0, 3).join(', ')}\n`;
    }
    
    if (context.topics.length > 0) {
      prompt += `Topics/Projects: ${context.topics.slice(0, 3).join(', ')}\n`;
    }
    
    if (context.participants.length > 0) {
      prompt += `Main Participants: ${context.participants.slice(0, 2).join(', ')}\n`;
    }
    
    prompt += `\nRequirements:\n`;
    prompt += `- Use kebab-case (lowercase with hyphens)\n`;
    prompt += `- 15-40 characters long\n`;
    prompt += `- Be descriptive but concise\n`;
    prompt += `- Include relevant project/topic keywords\n`;
    prompt += `- Avoid generic terms like "docs" or "report"\n`;
    prompt += `- Make it clearly identifiable for future reference\n\n`;
    prompt += `Examples of good folder names:\n`;
    prompt += `- "user-auth-security-improvements"\n`;
    prompt += `- "mobile-ui-sprint-retrospective"\n`;
    prompt += `- "api-v2-migration-planning"\n`;
    prompt += `- "billing-system-bug-fixes"\n\n`;
    prompt += `Generate ONE folder name only:`;

    return prompt;
  }

  /**
   * Generate contextual folder name using rules-based approach
   */
  generateContextualFolderName(context) {
    const parts = [];
    
    // Add type-based prefix
    const typeMap = {
      'pr-analysis': 'pr-review',
      'release-analysis': 'release',
      'jira-report': 'jira',
      'cross-platform': 'multi-source',
      'documentation': 'docs'
    };
    parts.push(typeMap[context.type] || 'docs');

    // Add main topic/project
    if (context.topics.length > 0) {
      const mainTopic = context.topics[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      if (mainTopic.length > 0) {
        parts.push(mainTopic);
      }
    }

    // Add identifier if meaningful
    if (context.identifiers.length > 0) {
      const mainId = context.identifiers[0];
      if (mainId.includes('discussion-')) {
        parts.push(`disc-${mainId.split('-')[1]}`);
      } else if (mainId.includes('pr-')) {
        parts.push(`pr-${mainId.split('-')[1]}`);
      } else if (mainId.match(/^[A-Z]+-\d+$/)) {
        // Jira key format
        parts.push(mainId.toLowerCase());
      }
    }

    // Add date for uniqueness
    if (this.config.enableTimestamp) {
      const date = new Date();
      const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
      parts.push(dateStr);
    }

    return parts.join('-');
  }

  /**
   * Extract topics from text using simple keyword extraction
   */
  extractTopicsFromText(text) {
    const topics = [];
    const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
    
    // Common project/feature keywords
    const projectKeywords = [
      'auth', 'security', 'mobile', 'web', 'api', 'backend', 'frontend',
      'ui', 'ux', 'database', 'migration', 'billing', 'payment', 'user',
      'admin', 'dashboard', 'analytics', 'search', 'notification', 'email',
      'integration', 'automation', 'testing', 'deployment', 'performance',
      'monitoring', 'logging', 'cache', 'storage', 'sync', 'export',
      'import', 'report', 'chart', 'graph', 'workflow', 'approval'
    ];
    
    words.forEach(word => {
      if (projectKeywords.includes(word) && !topics.includes(word)) {
        topics.push(word);
      }
    });
    
    return topics.slice(0, 3); // Limit to 3 topics
  }

  /**
   * Sanitize folder name to be filesystem-safe
   */
  sanitizeFolderName(name) {
    let sanitized = name
      .toLowerCase()
      .replace(/[^a-z0-9\-_\s]/g, '') // Remove special chars except hyphens, underscores, spaces
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens

    // Ensure it doesn't exceed max length
    if (sanitized.length > this.config.folderNameMaxLength) {
      sanitized = sanitized.substring(0, this.config.folderNameMaxLength);
      sanitized = sanitized.replace(/-[^-]*$/, ''); // Remove partial word at end
    }

    // Ensure it's not a reserved name
    if (this.config.reservedNames.includes(sanitized)) {
      sanitized = `chroniclr-${sanitized}`;
    }

    // Ensure it's not empty
    if (sanitized.length === 0) {
      sanitized = 'chroniclr-output';
    }

    return sanitized;
  }

  /**
   * Ensure folder name is unique by adding counter if needed
   */
  async ensureUniqueFolderName(baseName) {
    let folderName = baseName;
    let counter = 1;
    
    while (fs.existsSync(path.join(this.baseOutputDir, folderName))) {
      folderName = `${baseName}-${counter}`;
      counter++;
      
      // Safety check to prevent infinite loop
      if (counter > 100) {
        folderName = `${baseName}-${Date.now()}`;
        break;
      }
    }
    
    return folderName;
  }

  /**
   * Create fallback session with timestamp-based naming
   */
  createFallbackSession() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const folderName = `chroniclr-${timestamp}`;
    const outputDir = path.join(this.baseOutputDir, folderName);
    
    this.ensureDirectoryExists(outputDir);
    
    const sessionMetadata = {
      sessionId: this.generateSessionId(),
      timestamp: new Date().toISOString(),
      folderName,
      outputDir,
      context: { type: 'fallback' },
      generatedFiles: [],
      sources: [],
      summary: null
    };
    
    this.currentSession = sessionMetadata;
    
    core.info(`📁 Fallback output session created: ${folderName}`);
    return sessionMetadata;
  }

  /**
   * Register a generated file with the current session
   */
  registerGeneratedFile(filePath, documentType, metadata = {}) {
    if (!this.currentSession) {
      core.warning('No active session - cannot register file');
      return;
    }

    const fileInfo = {
      filePath,
      documentType,
      timestamp: new Date().toISOString(),
      size: this.getFileSize(filePath),
      metadata
    };

    this.currentSession.generatedFiles.push(fileInfo);
    
    // Update session metadata file
    this.updateSessionMetadata();
    
    core.info(`📄 Registered file: ${path.basename(filePath)} (${documentType})`);
  }

  /**
   * Get the output path for a specific document type
   */
  getOutputPath(documentType, filename = null) {
    if (!this.currentSession) {
      throw new Error('No active output session');
    }

    if (!filename) {
      filename = `${documentType}-${this.currentSession.sessionId.slice(0, 8)}.md`;
    }

    return path.join(this.currentSession.outputDir, filename);
  }

  /**
   * Finalize the session with a summary
   */
  async finalizeSession(summary = {}) {
    if (!this.currentSession) {
      core.warning('No active session to finalize');
      return;
    }

    this.currentSession.summary = {
      completedAt: new Date().toISOString(),
      totalFiles: this.currentSession.generatedFiles.length,
      documentTypes: [...new Set(this.currentSession.generatedFiles.map(f => f.documentType))],
      totalSize: this.currentSession.generatedFiles.reduce((sum, f) => sum + (f.size || 0), 0),
      ...summary
    };

    // Generate session README
    await this.generateSessionReadme();
    
    // Update final metadata
    this.updateSessionMetadata();
    
    core.info(`\n✅ Session finalized:`);
    core.info(`  📁 Folder: ${this.currentSession.folderName}`);
    core.info(`  📄 Files: ${this.currentSession.summary.totalFiles}`);
    core.info(`  📊 Types: ${this.currentSession.summary.documentTypes.join(', ')}`);
    core.info(`  💾 Size: ${this.formatFileSize(this.currentSession.summary.totalSize)}`);
    
    const sessionInfo = { ...this.currentSession };
    this.currentSession = null;
    
    return sessionInfo;
  }

  /**
   * Generate a README file for the session
   */
  async generateSessionReadme() {
    const session = this.currentSession;
    const readmePath = path.join(session.outputDir, 'README.md');
    
    const readme = `# Chroniclr Documentation Session

**Generated:** ${session.timestamp}  
**Session ID:** ${session.sessionId}  
**Session Type:** ${session.context.type}  
**Data Sources:** ${session.sources.join(', ') || 'None'}

## Session Summary

- **Total Files:** ${session.generatedFiles.length}
- **Document Types:** ${session.summary?.documentTypes?.join(', ') || 'In progress...'}
- **Total Size:** ${session.summary ? this.formatFileSize(session.summary.totalSize) : 'Calculating...'}

## Generated Files

${session.generatedFiles.map(file => {
  const filename = path.basename(file.filePath);
  const size = file.size ? this.formatFileSize(file.size) : 'Unknown';
  return `- **${filename}** (${file.documentType}) - ${size}`;
}).join('\n')}

## Context Information

${session.context.identifiers && session.context.identifiers.length > 0 ? 
  `**Identifiers:** ${session.context.identifiers.join(', ')}\n` : ''}
${session.context.topics && session.context.topics.length > 0 ? 
  `**Topics:** ${session.context.topics.join(', ')}\n` : ''}
${session.context.participants && session.context.participants.length > 0 ? 
  `**Participants:** ${session.context.participants.join(', ')}\n` : ''}

## Usage

These documents were automatically generated by Chroniclr. Each file contains structured information extracted and analyzed from the specified data sources.

For questions or issues with this documentation, refer to the original sources or contact the documentation team.

---
*Generated by Chroniclr v${this.getChronicrlVersion()}*
`;

    fs.writeFileSync(readmePath, readme);
    this.registerGeneratedFile(readmePath, 'session-readme');
  }

  /**
   * Helper methods
   */
  ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      core.info(`📁 Created directory: ${dirPath}`);
    }
  }

  generateSessionId() {
    return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  }

  getFileSize(filePath) {
    try {
      return fs.statSync(filePath).size;
    } catch (error) {
      return 0;
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  updateSessionMetadata() {
    if (!this.currentSession) return;
    
    const metadataPath = path.join(this.currentSession.outputDir, '.chroniclr-session.json');
    fs.writeFileSync(metadataPath, JSON.stringify(this.currentSession, null, 2));
  }

  getChronicrlVersion() {
    try {
      const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
      return packageJson.version || '1.0.0';
    } catch (error) {
      return '1.0.0';
    }
  }

  /**
   * Get information about the current session
   */
  getCurrentSession() {
    return this.currentSession;
  }

  /**
   * List all previous sessions
   */
  listPreviousSessions() {
    try {
      if (!fs.existsSync(this.baseOutputDir)) {
        return [];
      }

      const sessions = [];
      const dirs = fs.readdirSync(this.baseOutputDir);
      
      for (const dir of dirs) {
        const metadataPath = path.join(this.baseOutputDir, dir, '.chroniclr-session.json');
        if (fs.existsSync(metadataPath)) {
          try {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            sessions.push({
              folderName: dir,
              ...metadata
            });
          } catch (error) {
            // Skip invalid metadata files
            continue;
          }
        }
      }
      
      return sessions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
      core.warning(`Failed to list previous sessions: ${error.message}`);
      return [];
    }
  }
}

module.exports = { OutputManager };

// CLI support
if (require.main === module) {
  const action = process.argv[2];
  
  if (action === 'list') {
    const outputManager = new OutputManager();
    const sessions = outputManager.listPreviousSessions();
    
    if (sessions.length === 0) {
      console.log('No previous sessions found.');
    } else {
      console.log('\n📋 Previous Chroniclr Sessions:');
      sessions.forEach((session, index) => {
        console.log(`\n${index + 1}. ${session.folderName}`);
        console.log(`   📅 ${new Date(session.timestamp).toLocaleString()}`);
        console.log(`   📄 ${session.generatedFiles?.length || 0} files`);
        console.log(`   🔗 ${session.sources?.join(', ') || 'No sources'}`);
      });
    }
  } else {
    console.log('Usage: node output-manager.js list');
  }
}