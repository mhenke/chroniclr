#!/usr/bin/env node

/**
 * Intelligent Document Update System
 * 
 * Features:
 * - Detects outdated documentation based on code changes
 * - Tracks document versions and modification timestamps
 * - Provides smart update suggestions with conflict resolution
 * - Updates documents automatically or via PR creation
 */

const core = require('@actions/core');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { AIDocumentGenerator } = require('../generators/ai-document-generator');
const { FileAnalyzer } = require('./file-analyzer');
const { PRTemplateMapper } = require('./pr-template-mapper');

class DocumentUpdateManager {
  constructor(config = {}) {
    this.config = config;
    this.generator = new AIDocumentGenerator();
    this.fileAnalyzer = new FileAnalyzer();
    this.templateMapper = new PRTemplateMapper();
    this.documentsDir = config.outputDir || 'docs';
    this.metadataFile = path.join(this.documentsDir, '.document-metadata.json');
    this.documentRegistry = {};
  }

  /**
   * Initialize the document update system
   */
  async initialize() {
    core.info('Initializing document update manager');
    await this.loadDocumentRegistry();
    return this;
  }

  /**
   * Load the document registry from metadata file or create if not exists
   */
  async loadDocumentRegistry() {
    try {
      const data = await fs.readFile(this.metadataFile, 'utf8');
      this.documentRegistry = JSON.parse(data);
      core.info(`Loaded document registry with ${Object.keys(this.documentRegistry).length} documents`);
    } catch (error) {
      core.info('Document registry not found, creating new one');
      this.documentRegistry = {};
      await this.saveDocumentRegistry();
    }
  }

  /**
   * Save the document registry to metadata file
   */
  async saveDocumentRegistry() {
    await fs.mkdir(this.documentsDir, { recursive: true });
    await fs.writeFile(this.metadataFile, JSON.stringify(this.documentRegistry, null, 2), 'utf8');
    core.info('Document registry saved');
  }

  /**
   * Calculate document hash for change detection
   */
  calculateDocumentHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Register a new document or update existing document metadata
   */
  async registerDocument(documentPath, metadata = {}) {
    try {
      const relativePath = path.relative(process.cwd(), documentPath);
      const content = await fs.readFile(documentPath, 'utf8');
      const stats = await fs.stat(documentPath);
      const now = new Date().toISOString();
      
      const existingDoc = this.documentRegistry[relativePath];
      const newVersion = (existingDoc?.version || 0) + 1;
      
      // Enhanced document metadata
      this.documentRegistry[relativePath] = {
        lastUpdated: stats.mtime.toISOString(),
        hash: this.calculateDocumentHash(content),
        version: newVersion,
        size: stats.size,
        sources: metadata.sources || [],
        references: metadata.references || [],
        topics: metadata.topics || [],
        
        // Enhanced metadata
        created: existingDoc?.created || now,
        lastAnalyzed: now,
        updateHistory: [
          ...(existingDoc?.updateHistory || []).slice(-9), // Keep last 10 entries
          {
            version: newVersion,
            timestamp: now,
            trigger: metadata.trigger || 'manual',
            changes: {
              linesAdded: metadata.linesAdded || 0,
              linesDeleted: metadata.linesDeleted || 0,
              sectionsModified: metadata.sectionsModified || []
            }
          }
        ],
        
        // Document relationships
        dependencies: metadata.dependencies || [],
        dependents: metadata.dependents || [],
        relatedFiles: metadata.relatedFiles || [],
        
        // Quality metrics
        quality: {
          completeness: metadata.completeness || this.assessCompleteness(content),
          freshness: this.calculateFreshness(stats.mtime),
          accuracy: metadata.accuracy || 'unknown'
        },
        
        // Automation settings
        automation: {
          autoUpdate: metadata.autoUpdate !== false,
          preserveMarkers: this.extractPreserveMarkers(content),
          lastAutoUpdate: metadata.trigger === 'auto' ? now : existingDoc?.automation?.lastAutoUpdate,
          updateFrequency: metadata.updateFrequency || 'monthly'
        },
        
        ...metadata
      };
      
      await this.saveDocumentRegistry();
      core.info(`Registered document: ${relativePath} (v${this.documentRegistry[relativePath].version}) - ${metadata.trigger || 'manual'} update`);
      return this.documentRegistry[relativePath];
    } catch (error) {
      core.error(`Failed to register document ${documentPath}: ${error.message}`);
      return null;
    }
  }

  /**
   * Scan workspace for all documentation files
   */
  async scanDocuments(directories = ['docs', '.github']) {
    const documentFiles = [];
    
    for (const dir of directories) {
      try {
        const files = await this.findMarkdownFiles(dir);
        documentFiles.push(...files);
      } catch (error) {
        core.warning(`Failed to scan ${dir}: ${error.message}`);
      }
    }
    
    core.info(`Found ${documentFiles.length} documentation files`);
    return documentFiles;
  }

  /**
   * Find all markdown files in a directory recursively
   */
  async findMarkdownFiles(directory) {
    const result = [];
    
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            const subDirFiles = await this.findMarkdownFiles(fullPath);
            result.push(...subDirFiles);
          }
        } else if (entry.name.endsWith('.md')) {
          result.push(fullPath);
        }
      }
    } catch (error) {
      core.debug(`Error searching directory ${directory}: ${error.message}`);
    }
    
    return result;
  }

  /**
   * Check if a document needs updating
   */
  async checkDocumentStatus(documentPath) {
    try {
      const relativePath = path.relative(process.cwd(), documentPath);
      const content = await fs.readFile(documentPath, 'utf8');
      const currentHash = this.calculateDocumentHash(content);
      const registeredDoc = this.documentRegistry[relativePath];
      
      if (!registeredDoc) {
        return { exists: false, needsUpdate: true, registered: false };
      }
      
      const hasChanged = currentHash !== registeredDoc.hash;
      const isOutdated = this.isDocumentOutdated(registeredDoc);
      
      return {
        exists: true,
        registered: true,
        hasChanged,
        needsUpdate: isOutdated,
        lastUpdated: registeredDoc.lastUpdated,
        version: registeredDoc.version
      };
    } catch (error) {
      core.warning(`Error checking document status for ${documentPath}: ${error.message}`);
      return { exists: false, needsUpdate: true, error: error.message };
    }
  }

  /**
   * Check if a document is outdated based on custom rules
   */
  isDocumentOutdated(documentMeta) {
    if (!documentMeta.lastUpdated) return true;
    
    // Document is outdated if last update was more than 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const lastUpdated = new Date(documentMeta.lastUpdated);
    return lastUpdated < thirtyDaysAgo;
  }

  /**
   * Identify documents that need updates based on code changes
   */
  async identifyDocumentsToUpdate(prData) {
    const analysis = this.fileAnalyzer.analyzeChanges(prData.files, prData);
    const documentFiles = await this.scanDocuments();
    
    // Use the file analyzer to identify related docs
    const relatedDocs = this.fileAnalyzer.identifyRelatedDocs(
      analysis, 
      documentFiles.map(file => path.relative(process.cwd(), file))
    );

    // Check status of identified documents
    const documentsToUpdate = [];
    
    for (const docPath of relatedDocs.existing) {
      const fullPath = path.join(process.cwd(), docPath);
      const status = await this.checkDocumentStatus(fullPath);
      
      if (status.needsUpdate || status.hasChanged) {
        documentsToUpdate.push({
          path: docPath,
          status,
          documentationNeeds: this.extractDocumentationNeeds(docPath, analysis)
        });
      }
    }
    
    return {
      documentsToUpdate,
      suggestedDocuments: relatedDocs.recommended.filter(
        doc => !relatedDocs.existing.includes(doc)
      ),
      analysis
    };
  }

  /**
   * Extract specific documentation needs for a document type
   */
  extractDocumentationNeeds(docPath, analysis) {
    const filename = path.basename(docPath).toLowerCase();
    
    if (filename.includes('api') || filename.includes('endpoint')) {
      return { type: 'api', needed: analysis.documentationNeeds.api };
    } else if (filename.includes('readme') || filename.includes('guide')) {
      return { type: 'userGuide', needed: analysis.documentationNeeds.userGuide };
    } else if (filename.includes('architecture') || filename.includes('technical')) {
      return { type: 'technical', needed: analysis.documentationNeeds.technical };
    } else if (filename.includes('migration') || filename.includes('changelog')) {
      return { type: 'migration', needed: analysis.documentationNeeds.migration };
    } else if (filename.includes('security')) {
      return { type: 'security', needed: analysis.documentationNeeds.security };
    } else {
      return { type: 'general', needed: true };
    }
  }

  /**
   * Update a document with new content while preserving manual changes
   */
  async updateDocument(documentPath, newContent, metadata = {}) {
    try {
      const fullPath = path.resolve(process.cwd(), documentPath);
      let existingContent = '';
      let isNew = false;
      
      try {
        existingContent = await fs.readFile(fullPath, 'utf8');
      } catch (error) {
        // File doesn't exist, create it
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        isNew = true;
      }
      
      let finalContent = newContent;
      let mergeAnalysis = null;
      
      // If the document exists, perform smart merge
      if (existingContent && !metadata.forceOverwrite) {
        finalContent = await this.smartMergeContent(existingContent, newContent);
        mergeAnalysis = this.lastMergeAnalysis;
      }
      
      // Calculate content statistics
      const contentStats = this.calculateContentStats(existingContent, finalContent);
      
      // Write updated content
      await fs.writeFile(fullPath, finalContent, 'utf8');
      
      // Register the updated document with enhanced metadata
      const enhancedMetadata = {
        ...metadata,
        trigger: metadata.trigger || 'manual',
        linesAdded: contentStats.linesAdded,
        linesDeleted: contentStats.linesDeleted,
        sectionsModified: mergeAnalysis?.updated || [],
        mergeConflicts: mergeAnalysis?.conflicts || [],
        preservedSections: mergeAnalysis?.preserved || []
      };
      
      await this.registerDocument(fullPath, enhancedMetadata);
      
      return {
        path: documentPath,
        updated: true,
        isNew,
        stats: contentStats,
        mergeAnalysis,
        version: this.documentRegistry[path.relative(process.cwd(), fullPath)]?.version
      };
    } catch (error) {
      core.error(`Failed to update document ${documentPath}: ${error.message}`);
      return {
        path: documentPath,
        updated: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate statistics about content changes
   */
  calculateContentStats(oldContent, newContent) {
    const oldLines = oldContent ? oldContent.split('\n') : [];
    const newLines = newContent.split('\n');
    
    // Simple line-based diff
    const stats = {
      oldLineCount: oldLines.length,
      newLineCount: newLines.length,
      linesAdded: 0,
      linesDeleted: 0,
      linesChanged: 0,
      charactersAdded: Math.max(0, newContent.length - (oldContent?.length || 0)),
      charactersDeleted: Math.max(0, (oldContent?.length || 0) - newContent.length)
    };
    
    if (oldContent) {
      // Calculate line differences
      const lineDiff = newLines.length - oldLines.length;
      if (lineDiff > 0) {
        stats.linesAdded = lineDiff;
      } else if (lineDiff < 0) {
        stats.linesDeleted = Math.abs(lineDiff);
      }
      
      // Estimate changed lines by comparing common lines
      const commonLines = Math.min(oldLines.length, newLines.length);
      let changedLines = 0;
      
      for (let i = 0; i < commonLines; i++) {
        if (oldLines[i] !== newLines[i]) {
          changedLines++;
        }
      }
      
      stats.linesChanged = changedLines;
    } else {
      stats.linesAdded = newLines.length;
    }
    
    return stats;
  }

  /**
   * Smart merge of existing and new content preserving manual edits
   */
  async smartMergeContent(existingContent, newContent) {
    core.info('Starting smart merge with enhanced conflict resolution');
    
    // Split content into sections using markdown headings
    const existingSections = this.splitContentIntoSections(existingContent);
    const newSections = this.splitContentIntoSections(newContent);
    
    // Preserve frontmatter/header if exists
    const preservedHeader = this.extractFrontmatter(existingContent);
    
    // Build merged content
    let mergedContent = preservedHeader || '';
    const mergeLog = [];
    
    // Track sections for conflict analysis
    const sectionAnalysis = {
      preserved: [],
      updated: [],
      added: [],
      conflicts: []
    };
    
    // Process each section in new content
    for (const [title, newSection] of Object.entries(newSections)) {
      if (existingSections[title]) {
        const existingSection = existingSections[title];
        
        // Enhanced conflict detection
        const conflict = this.detectSectionConflict(existingSection, newSection, title);
        
        if (conflict.hasConflict) {
          // Handle conflict based on type and severity
          const resolution = await this.resolveConflict(conflict, existingSection, newSection, title);
          mergedContent += resolution.content;
          mergeLog.push(resolution.log);
          
          if (resolution.type === 'preserve') {
            sectionAnalysis.preserved.push(title);
          } else if (resolution.type === 'merge') {
            sectionAnalysis.conflicts.push({
              section: title,
              type: conflict.type,
              resolution: resolution.strategy
            });
          } else {
            sectionAnalysis.updated.push(title);
          }
        } else {
          // No conflict - use new content
          mergedContent += newSection;
          sectionAnalysis.updated.push(title);
          core.info(`Updated section: ${title} (no conflicts)`);
        }
      } else {
        // Section only in new content, add it
        mergedContent += newSection;
        sectionAnalysis.added.push(title);
        core.info(`Added new section: ${title}`);
      }
    }
    
    // Add sections that are in existing but not in new content (custom sections)
    for (const [title, section] of Object.entries(existingSections)) {
      if (!newSections[title]) {
        // Check if this is a user-created custom section
        if (this.isCustomSection(section, title)) {
          mergedContent += section;
          sectionAnalysis.preserved.push(title);
          core.info(`Preserved custom section: ${title}`);
        } else {
          // Potentially outdated auto-generated section
          core.warning(`Removed potentially outdated section: ${title}`);
        }
      }
    }
    
    // Store merge analysis for reporting
    this.lastMergeAnalysis = sectionAnalysis;
    
    return mergedContent;
  }

  /**
   * Detect conflicts between existing and new section content
   */
  detectSectionConflict(existingSection, newSection, title) {
    const conflict = {
      hasConflict: false,
      type: 'none',
      severity: 'low',
      reasons: []
    };
    
    // Check for manual edit markers FIRST - this should take precedence
    if (this.hasManualEdits(existingSection)) {
      conflict.hasConflict = true;
      conflict.type = 'manual_edits';
      conflict.severity = 'high';
      conflict.reasons.push('Section contains manual edit markers');
      // Return immediately - manual edits take precedence over all other conflicts
      return conflict;
    }
    
    // Check for significant content differences
    const existingWords = existingSection.split(/\s+/).length;
    const newWords = newSection.split(/\s+/).length;
    const wordDifference = Math.abs(existingWords - newWords);
    
    if (wordDifference > existingWords * 0.3) {
      conflict.hasConflict = true;
      conflict.type = 'significant_changes';
      conflict.severity = wordDifference > existingWords * 0.6 ? 'high' : 'medium';
      conflict.reasons.push(`Significant size difference: ${wordDifference} words`);
    }
    
    // Check for custom formatting or structure
    const hasCustomFormatting = this.detectCustomFormatting(existingSection);
    if (hasCustomFormatting) {
      conflict.hasConflict = true;
      if (conflict.type === 'none') conflict.type = 'custom_formatting';
      conflict.severity = Math.max(conflict.severity === 'high' ? 3 : conflict.severity === 'medium' ? 2 : 1, 2) === 3 ? 'high' : 'medium';
      conflict.reasons.push('Custom formatting detected');
    }
    
    // Check for code blocks with modifications
    const existingCodeBlocks = (existingSection.match(/```[\s\S]*?```/g) || []).length;
    const newCodeBlocks = (newSection.match(/```[\s\S]*?```/g) || []).length;
    
    if (existingCodeBlocks !== newCodeBlocks) {
      conflict.hasConflict = true;
      if (conflict.type === 'none') conflict.type = 'code_changes';
      conflict.severity = 'medium';
      conflict.reasons.push('Code block count differs');
    }
    
    return conflict;
  }

  /**
   * Resolve detected conflicts using various strategies
   */
  async resolveConflict(conflict, existingSection, newSection, title) {
    const resolution = {
      content: '',
      type: 'unknown',
      strategy: 'none',
      log: ''
    };
    
    switch (conflict.type) {
      case 'manual_edits':
        // Always preserve manually edited content
        resolution.content = existingSection;
        resolution.type = 'preserve';
        resolution.strategy = 'preserve_manual';
        resolution.log = `Preserved manually edited section: ${title}`;
        core.info(resolution.log);
        break;
        
      case 'significant_changes':
        if (conflict.severity === 'high') {
          // Create a merged version with conflict markers
          resolution.content = this.createConflictMarkers(existingSection, newSection, title);
          resolution.type = 'merge';
          resolution.strategy = 'conflict_markers';
          resolution.log = `Created conflict markers for section: ${title}`;
          core.warning(resolution.log);
        } else {
          // Use new content but add a comment about changes
          resolution.content = this.addUpdateComment(newSection, `Updated from previous version with ${conflict.reasons.join(', ')}`);
          resolution.type = 'update';
          resolution.strategy = 'update_with_comment';
          resolution.log = `Updated section with comment: ${title}`;
          core.info(resolution.log);
        }
        break;
        
      case 'custom_formatting':
        // Try to merge formatting with new content
        resolution.content = this.mergeFormatting(existingSection, newSection);
        resolution.type = 'merge';
        resolution.strategy = 'merge_formatting';
        resolution.log = `Merged formatting for section: ${title}`;
        core.info(resolution.log);
        break;
        
      case 'code_changes':
        // Preserve existing code blocks but update surrounding text
        resolution.content = this.mergeCodeSections(existingSection, newSection);
        resolution.type = 'merge';
        resolution.strategy = 'merge_code';
        resolution.log = `Merged code sections for: ${title}`;
        core.info(resolution.log);
        break;
        
      default:
        // Default to new content
        resolution.content = newSection;
        resolution.type = 'update';
        resolution.strategy = 'default_update';
        resolution.log = `Updated section: ${title}`;
        break;
    }
    
    return resolution;
  }

  /**
   * Detect custom formatting in content
   */
  detectCustomFormatting(content) {
    // Look for patterns indicating custom formatting
    const customPatterns = [
      /\|.*\|.*\|/, // Custom tables
      /^>\s+.*$/m,  // Custom blockquotes
      /<.*>/,       // HTML tags
      /^\s*[-*+]\s.*(?:\n\s*[-*+]\s.*){3,}/m, // Custom lists with indentation
    ];
    
    return customPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Check if a section appears to be custom/user-created
   */
  isCustomSection(section, title) {
    // Check for manual edit markers
    if (this.hasManualEdits(section)) return true;
    
    // Check for custom section titles
    const customSectionPatterns = [
      /notes?/i,
      /todo/i,
      /custom/i,
      /manual/i,
      /additional/i
    ];
    
    return customSectionPatterns.some(pattern => pattern.test(title));
  }

  /**
   * Create conflict markers for sections with conflicts
   */
  createConflictMarkers(existingSection, newSection, title) {
    return `
<!-- MERGE CONFLICT in section: ${title} -->
<<<<<<< EXISTING (preserved)
${existingSection.trim()}
=======
${newSection.trim()}
>>>>>>> NEW (generated)
<!-- END MERGE CONFLICT -->

`;
  }

  /**
   * Add an update comment to content
   */
  addUpdateComment(content, comment) {
    return `<!-- Updated: ${comment} (${new Date().toISOString()}) -->
${content}`;
  }

  /**
   * Merge formatting between existing and new content
   */
  mergeFormatting(existingContent, newContent) {
    // Simple implementation - preserve structure but update content
    // This could be enhanced with more sophisticated formatting analysis
    
    // Try to preserve custom tables, lists, and formatting
    const existingTables = existingContent.match(/\|.*\|.*\|\n[\|\-\s:]*\n(?:\|.*\|.*\|\n)*/g) || [];
    const newContentWithTables = newContent;
    
    if (existingTables.length > 0) {
      // Try to preserve existing table formatting
      let mergedContent = newContentWithTables;
      existingTables.forEach((table, index) => {
        // Basic table preservation - could be enhanced
        const tableHeader = table.split('\n')[0];
        if (!newContentWithTables.includes(tableHeader)) {
          mergedContent += `\n\n${table}\n`;
        }
      });
      return mergedContent;
    }
    
    return newContent;
  }

  /**
   * Merge code sections preserving existing code blocks
   */
  mergeCodeSections(existingContent, newContent) {
    // Extract code blocks from existing content
    const existingCodeBlocks = existingContent.match(/```[\s\S]*?```/g) || [];
    
    if (existingCodeBlocks.length === 0) {
      return newContent;
    }
    
    // Simple preservation strategy - add existing code blocks that aren't in new content
    let mergedContent = newContent;
    
    existingCodeBlocks.forEach(codeBlock => {
      // Check if similar code block exists in new content
      const codeContent = codeBlock.replace(/```\w*\n?/, '').replace(/\n?```$/, '').trim();
      
      if (!newContent.includes(codeContent.substring(0, 50))) {
        mergedContent += `\n\n<!-- Preserved from previous version -->\n${codeBlock}\n`;
      }
    });
    
    return mergedContent;
  }

  /**
   * Split markdown content into sections based on headings
   */
  splitContentIntoSections(content) {
    const sections = {};
    const headingRegex = /^(#+)\s+(.+)$/gm;
    let lastIndex = 0;
    let lastTitle = 'header';
    
    // Add header section (content before first heading)
    const firstHeadingMatch = content.match(headingRegex);
    if (firstHeadingMatch && firstHeadingMatch.index > 0) {
      sections[lastTitle] = content.substring(0, firstHeadingMatch.index);
      lastIndex = firstHeadingMatch.index;
    } else if (!firstHeadingMatch) {
      // No headings at all, treat entire content as one section
      sections[lastTitle] = content;
      return sections;
    }
    
    // Create regex that can be executed multiple times
    const execHeadingRegex = new RegExp(headingRegex);
    let match;
    
    // Reset lastIndex of regex to start from beginning
    execHeadingRegex.lastIndex = 0;
    
    // Find all headings and their content
    while ((match = execHeadingRegex.exec(content)) !== null) {
      const [fullMatch, level, title] = match;
      const normalizedTitle = title.trim();
      
      if (lastIndex > 0) {
        // Add previous section content
        sections[lastTitle] = content.substring(lastIndex, match.index);
      }
      
      lastTitle = normalizedTitle;
      lastIndex = match.index;
    }
    
    // Add the last section
    if (lastIndex < content.length) {
      sections[lastTitle] = content.substring(lastIndex);
    }
    
    return sections;
  }

  /**
   * Extract frontmatter/header from markdown content
   */
  extractFrontmatter(content) {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
    const match = content.match(frontmatterRegex);
    return match ? match[0] : '';
  }

  /**
   * Check if a section has manual edits
   * This looks for special markers or patterns indicating manual changes
   */
  hasManualEdits(section) {
    // Look for manual edit markers
    const manualEditMarkers = [
      '<!-- manual-edit -->',
      '<!-- do not update -->',
      '<!-- preserve -->',
      '<!-- custom content -->'
    ];
    
    for (const marker of manualEditMarkers) {
      if (section.includes(marker)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Extract preserve markers from document content
   */
  extractPreserveMarkers(content) {
    const markers = [];
    const preserveRegex = /<!--\s*(manual-edit|preserve|do not update|custom content)\s*-->/gi;
    let match;
    
    while ((match = preserveRegex.exec(content)) !== null) {
      markers.push({
        marker: match[1].toLowerCase(),
        position: match.index,
        context: content.substring(Math.max(0, match.index - 50), match.index + 100)
      });
    }
    
    return markers;
  }

  /**
   * Assess document completeness based on content analysis
   */
  assessCompleteness(content) {
    let score = 0;
    let maxScore = 0;
    
    // Check for common documentation sections
    const sections = {
      'title|heading': /^#\s+.+$/m,
      'description|overview': /(description|overview|summary|introduction)/i,
      'usage|examples': /(usage|example|how to|getting started)/i,
      'api|reference': /(api|reference|methods|functions)/i,
      'installation|setup': /(installation|setup|install|configuration)/i
    };
    
    for (const [section, pattern] of Object.entries(sections)) {
      maxScore++;
      if (pattern.test(content)) {
        score++;
      }
    }
    
    // Check content length (basic indicator)
    if (content.length > 500) score += 0.5;
    maxScore += 0.5;
    
    // Check for code examples
    if (/```[\s\S]*?```/.test(content)) score += 0.5;
    maxScore += 0.5;
    
    return Math.round((score / maxScore) * 100);
  }

  /**
   * Calculate document freshness score based on last modification
   */
  calculateFreshness(lastModified) {
    const now = new Date();
    const modified = new Date(lastModified);
    const daysDiff = Math.floor((now - modified) / (1000 * 60 * 60 * 24));
    
    if (daysDiff <= 7) return 100; // Fresh
    if (daysDiff <= 30) return 80;  // Recent
    if (daysDiff <= 90) return 60;  // Moderate
    if (daysDiff <= 180) return 40; // Aging
    return 20; // Stale
  }

  /**
   * Create a comprehensive document update report
   */
  generateUpdateReport(updateResults, analysis = null) {
    const timestamp = new Date().toISOString();
    const successful = updateResults.filter(r => r.updated);
    const failed = updateResults.filter(r => !r.updated);
    const newDocs = updateResults.filter(r => r.isNew);
    
    // Calculate totals
    const totalStats = successful.reduce((acc, result) => {
      if (result.stats) {
        acc.linesAdded += result.stats.linesAdded || 0;
        acc.linesDeleted += result.stats.linesDeleted || 0;
        acc.linesChanged += result.stats.linesChanged || 0;
        acc.charactersAdded += result.stats.charactersAdded || 0;
      }
      return acc;
    }, { linesAdded: 0, linesDeleted: 0, linesChanged: 0, charactersAdded: 0 });
    
    // Collect merge analysis
    const mergeStats = {
      totalConflicts: 0,
      preservedSections: 0,
      updatedSections: 0,
      addedSections: 0
    };
    
    successful.forEach(result => {
      if (result.mergeAnalysis) {
        mergeStats.totalConflicts += result.mergeAnalysis.conflicts?.length || 0;
        mergeStats.preservedSections += result.mergeAnalysis.preserved?.length || 0;
        mergeStats.updatedSections += result.mergeAnalysis.updated?.length || 0;
        mergeStats.addedSections += result.mergeAnalysis.added?.length || 0;
      }
    });

    const report = [
      '# Document Update Report',
      '',
      `Generated on: ${timestamp}`,
      `Report ID: ${crypto.createHash('sha256').update(timestamp).digest('hex').substring(0, 8)}`,
      '',
      '## Executive Summary',
      '',
      `- **Total documents processed**: ${updateResults.length}`,
      `- **Successfully updated**: ${successful.length}`,
      `- **New documents created**: ${newDocs.length}`,
      `- **Update failures**: ${failed.length}`,
      `- **Success rate**: ${updateResults.length > 0 ? Math.round((successful.length / updateResults.length) * 100) : 0}%`,
      '',
      '### Content Changes',
      '',
      `- **Lines added**: ${totalStats.linesAdded.toLocaleString()}`,
      `- **Lines deleted**: ${totalStats.linesDeleted.toLocaleString()}`,
      `- **Lines modified**: ${totalStats.linesChanged.toLocaleString()}`,
      `- **Characters added**: ${totalStats.charactersAdded.toLocaleString()}`,
      '',
      '### Merge Statistics',
      '',
      `- **Merge conflicts resolved**: ${mergeStats.totalConflicts}`,
      `- **Sections preserved**: ${mergeStats.preservedSections}`,
      `- **Sections updated**: ${mergeStats.updatedSections}`,
      `- **New sections added**: ${mergeStats.addedSections}`,
      ''
    ];

    // Add source analysis if provided
    if (analysis) {
      report.push('## Change Analysis');
      report.push('');
      report.push(`- **Files analyzed**: ${analysis.summary?.totalFiles || 0}`);
      report.push(`- **Risk level**: ${analysis.risks?.level || 'unknown'}`);
      report.push(`- **Breaking changes**: ${analysis.breakingChanges?.detected ? 'Yes' : 'No'}`);
      
      if (analysis.impactAreas && Object.keys(analysis.impactAreas).length > 0) {
        report.push('- **Impact areas**:');
        Object.entries(analysis.impactAreas).forEach(([area, count]) => {
          if (count > 0) report.push(`  - ${area}: ${count} files`);
        });
      }
      report.push('');
    }
    
    // Document details
    report.push('## Document Details');
    report.push('');
    
    if (successful.length > 0) {
      report.push('### ✅ Successfully Updated');
      report.push('');
      
      successful.forEach(result => {
        report.push(`#### ${result.path}`);
        
        if (result.isNew) {
          report.push('- **Status**: New document created');
        } else {
          report.push(`- **Status**: Updated to version ${result.version || 'unknown'}`);
        }
        
        if (result.stats) {
          report.push(`- **Changes**: +${result.stats.linesAdded}/-${result.stats.linesDeleted} lines, ${result.stats.linesChanged} modified`);
        }
        
        if (result.mergeAnalysis) {
          const { conflicts, preserved, updated, added } = result.mergeAnalysis;
          
          if (conflicts && conflicts.length > 0) {
            report.push(`- **Merge conflicts**: ${conflicts.length} resolved`);
            conflicts.forEach(conflict => {
              report.push(`  - ${conflict.section}: ${conflict.type} (${conflict.resolution})`);
            });
          }
          
          if (preserved && preserved.length > 0) {
            report.push(`- **Preserved sections**: ${preserved.join(', ')}`);
          }
          
          if (updated && updated.length > 0) {
            report.push(`- **Updated sections**: ${updated.join(', ')}`);
          }
          
          if (added && added.length > 0) {
            report.push(`- **New sections**: ${added.join(', ')}`);
          }
        }
        
        report.push('');
      });
    }
    
    if (failed.length > 0) {
      report.push('### ❌ Failed Updates');
      report.push('');
      
      failed.forEach(result => {
        report.push(`#### ${result.path}`);
        report.push(`- **Error**: ${result.error}`);
        report.push('- **Recommendation**: Review file permissions and content structure');
        report.push('');
      });
    }
    
    if (newDocs.length > 0) {
      report.push('### 📄 New Documents Created');
      report.push('');
      
      newDocs.forEach(result => {
        report.push(`- **${result.path}** (${result.stats?.linesAdded || 0} lines)`);
      });
      
      report.push('');
    }
    
    // Recommendations
    report.push('## Recommendations');
    report.push('');
    
    if (mergeStats.totalConflicts > 0) {
      report.push('- Review merge conflicts and resolve any remaining issues');
    }
    
    if (failed.length > 0) {
      report.push('- Address failed updates before next documentation cycle');
    }
    
    if (analysis?.risks?.level === 'high') {
      report.push('- High-risk changes detected - consider additional review and testing');
    }
    
    if (mergeStats.preservedSections > mergeStats.updatedSections * 2) {
      report.push('- Many sections were preserved - consider reviewing for outdated content');
    }
    
    report.push('');
    report.push('---');
    report.push('*Report generated by Chroniclr Document Update System*');
    
    return report.join('\n');
  }

  /**
   * Batch update documents from PR analysis
   */
  async updateDocumentsFromPR(prData, options = {}) {
    const { documentsToUpdate, suggestedDocuments, analysis } = await this.identifyDocumentsToUpdate(prData);
    
    core.info(`Found ${documentsToUpdate.length} documents to update and ${suggestedDocuments.length} suggested new documents`);
    
    // Update existing documents
    const updateResults = [];
    
    for (const doc of documentsToUpdate) {
      try {
        // Load document template based on document type
        const documentType = this.getDocumentType(doc.path);
        const template = await this.generator.loadTemplate(documentType);
        
        // Map PR data to template variables
        const variables = this.templateMapper.mapAllVariables(prData, analysis);
        
        // Process template with variables
        const processedTemplate = this.templateMapper.substituteVariables(template, variables);
        
        // Update document with new content
        const result = await this.updateDocument(doc.path, processedTemplate, {
          sources: ['pr'],
          references: [`PR #${prData.number}`],
          topics: Object.keys(doc.documentationNeeds || {})
        });
        
        updateResults.push(result);
      } catch (error) {
        core.error(`Failed to update ${doc.path}: ${error.message}`);
        updateResults.push({
          path: doc.path,
          updated: false,
          error: error.message
        });
      }
    }
    
    // Generate update report
    const reportContent = this.generateUpdateReport(updateResults);
    const reportPath = path.join(this.documentsDir, `document-update-report-${Date.now()}.md`);
    
    await fs.writeFile(reportPath, reportContent, 'utf8');
    
    return {
      updated: updateResults,
      report: reportPath,
      suggestedDocuments
    };
  }

  /**
   * Determine document type from file path
   */
  getDocumentType(filePath) {
    const filename = path.basename(filePath, '.md').toLowerCase();
    
    // Map known document names to template types
    const typeMapping = {
      'readme': 'summary',
      'api': 'api-reference',
      'architecture': 'technical-guide',
      'changelog': 'changelog',
      'security': 'security-policy'
    };
    
    // Check for direct matches
    for (const [key, value] of Object.entries(typeMapping)) {
      if (filename.includes(key)) {
        return value;
      }
    }
    
    // Default to summary template
    return 'summary';
  }
}

module.exports = { DocumentUpdateManager };
