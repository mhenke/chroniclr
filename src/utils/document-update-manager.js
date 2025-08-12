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
      core.info(
        `Loaded document registry with ${
          Object.keys(this.documentRegistry).length
        } documents`
      );
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
    await fs.writeFile(
      this.metadataFile,
      JSON.stringify(this.documentRegistry, null, 2),
      'utf8'
    );
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

      this.documentRegistry[relativePath] = {
        lastUpdated: stats.mtime.toISOString(),
        hash: this.calculateDocumentHash(content),
        version: (this.documentRegistry[relativePath]?.version || 0) + 1,
        size: stats.size,
        sources: metadata.sources || [],
        references: metadata.references || [],
        topics: metadata.topics || [],
        ...metadata,
      };

      await this.saveDocumentRegistry();
      core.info(
        `Registered document: ${relativePath} (v${this.documentRegistry[relativePath].version})`
      );
      return this.documentRegistry[relativePath];
    } catch (error) {
      core.error(
        `Failed to register document ${documentPath}: ${error.message}`
      );
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
        version: registeredDoc.version,
      };
    } catch (error) {
      core.warning(
        `Error checking document status for ${documentPath}: ${error.message}`
      );
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
      documentFiles.map((file) => path.relative(process.cwd(), file))
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
          documentationNeeds: this.extractDocumentationNeeds(docPath, analysis),
        });
      }
    }

    return {
      documentsToUpdate,
      suggestedDocuments: relatedDocs.recommended.filter(
        (doc) => !relatedDocs.existing.includes(doc)
      ),
      analysis,
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
      return {
        type: 'userGuide',
        needed: analysis.documentationNeeds.userGuide,
      };
    } else if (
      filename.includes('architecture') ||
      filename.includes('technical')
    ) {
      return {
        type: 'technical',
        needed: analysis.documentationNeeds.technical,
      };
    } else if (
      filename.includes('migration') ||
      filename.includes('changelog')
    ) {
      return {
        type: 'migration',
        needed: analysis.documentationNeeds.migration,
      };
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

      try {
        existingContent = await fs.readFile(fullPath, 'utf8');
      } catch (error) {
        // File doesn't exist, create it
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
      }

      // If the document exists, perform smart merge
      if (existingContent) {
        newContent = await this.smartMergeContent(existingContent, newContent);
      }

      // Write updated content
      await fs.writeFile(fullPath, newContent, 'utf8');

      // Register the updated document
      await this.registerDocument(fullPath, metadata);

      return {
        path: documentPath,
        updated: true,
        isNew: !existingContent,
      };
    } catch (error) {
      core.error(`Failed to update document ${documentPath}: ${error.message}`);
      return {
        path: documentPath,
        updated: false,
        error: error.message,
      };
    }
  }

  /**
   * Smart merge of existing and new content preserving manual edits
   */
  async smartMergeContent(existingContent, newContent) {
    // Split content into sections using markdown headings
    const existingSections = this.splitContentIntoSections(existingContent);
    const newSections = this.splitContentIntoSections(newContent);

    // Preserve frontmatter/header if exists
    const preservedHeader = this.extractFrontmatter(existingContent);

    // Build merged content
    let mergedContent = preservedHeader || '';

    // Process each section
    for (const [title, newSection] of Object.entries(newSections)) {
      if (existingSections[title]) {
        // Section exists in both - check for manual edits
        if (this.hasManualEdits(existingSections[title])) {
          // Preserve manually edited sections
          mergedContent += existingSections[title];
          core.info(`Preserved manually edited section: ${title}`);
        } else {
          // Use new content for auto-generated sections
          mergedContent += newSection;
          core.info(`Updated auto-generated section: ${title}`);
        }
      } else {
        // Section only in new content, add it
        mergedContent += newSection;
        core.info(`Added new section: ${title}`);
      }
    }

    // Add sections that are in existing but not in new content (custom sections)
    for (const [title, section] of Object.entries(existingSections)) {
      if (!newSections[title]) {
        mergedContent += section;
        core.info(`Preserved custom section: ${title}`);
      }
    }

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
      '<!-- custom content -->',
    ];

    for (const marker of manualEditMarkers) {
      if (section.includes(marker)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Create a document update report
   */
  generateUpdateReport(updateResults) {
    const report = [
      '# Document Update Report',
      '',
      `Generated on: ${new Date().toISOString()}`,
      '',
      '## Summary',
      '',
      `- Total documents processed: ${updateResults.length}`,
      `- Documents updated: ${updateResults.filter((r) => r.updated).length}`,
      `- New documents created: ${updateResults.filter((r) => r.isNew).length}`,
      `- Failed updates: ${updateResults.filter((r) => !r.updated).length}`,
      '',
      '## Details',
      '',
    ];

    // Add details for each document
    for (const result of updateResults) {
      if (result.updated) {
        report.push(`### ✅ ${result.path}`);
        if (result.isNew) {
          report.push('- New document created');
        } else {
          report.push('- Document updated successfully');
        }
      } else {
        report.push(`### ❌ ${result.path}`);
        report.push(`- Update failed: ${result.error}`);
      }
      report.push('');
    }

    return report.join('\n');
  }

  /**
   * Batch update documents from PR analysis
   */
  async updateDocumentsFromPR(prData, options = {}) {
    const { documentsToUpdate, suggestedDocuments, analysis } =
      await this.identifyDocumentsToUpdate(prData);

    core.info(
      `Found ${documentsToUpdate.length} documents to update and ${suggestedDocuments.length} suggested new documents`
    );

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
        const processedTemplate = this.templateMapper.substituteVariables(
          template,
          variables
        );

        // Update document with new content
        const result = await this.updateDocument(doc.path, processedTemplate, {
          sources: ['pr'],
          references: [`PR #${prData.number}`],
          topics: Object.keys(doc.documentationNeeds || {}),
        });

        updateResults.push(result);
      } catch (error) {
        core.error(`Failed to update ${doc.path}: ${error.message}`);
        updateResults.push({
          path: doc.path,
          updated: false,
          error: error.message,
        });
      }
    }

    // Generate update report
    const reportContent = this.generateUpdateReport(updateResults);
    const reportPath = path.join(
      this.documentsDir,
      `document-update-report-${Date.now()}.md`
    );

    await fs.writeFile(reportPath, reportContent, 'utf8');

    return {
      updated: updateResults,
      report: reportPath,
      suggestedDocuments,
    };
  }

  /**
   * Determine document type from file path
   */
  getDocumentType(filePath) {
    const filename = path.basename(filePath, '.md').toLowerCase();

    // Map known document names to template types
    const typeMapping = {
      readme: 'summary',
      api: 'api-reference',
      architecture: 'technical-guide',
      changelog: 'changelog',
      security: 'security-policy',
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
