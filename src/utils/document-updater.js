#!/usr/bin/env node

/**
 * Intelligent Document Update System for Chroniclr
 * Handles smart updating of existing documents when new information is available
 */

const core = require('@actions/core');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class DocumentUpdater {
  constructor() {
    this.updateStrategies = {
      'append': this.appendStrategy.bind(this),
      'merge': this.mergeStrategy.bind(this),
      'replace': this.replaceStrategy.bind(this),
      'smart': this.smartStrategy.bind(this),
      'version': this.versionStrategy.bind(this)
    };
    
    this.conflictHandlers = {
      'preserve_original': this.preserveOriginal.bind(this),
      'prefer_new': this.preferNew.bind(this),
      'merge_sections': this.mergeSections.bind(this),
      'create_conflict_markers': this.createConflictMarkers.bind(this)
    };
  }

  /**
   * Update a document intelligently based on content analysis
   */
  async updateDocument(filePath, newContent, options = {}) {
    const defaultOptions = {
      strategy: 'smart',
      conflictHandling: 'merge_sections',
      backupOriginal: true,
      preserveMetadata: true,
      generateDiff: true,
      maxVersions: 5
    };
    
    const config = { ...defaultOptions, ...options };
    
    try {
      // Check if document exists
      const documentExists = fs.existsSync(filePath);
      
      if (!documentExists) {
        core.info(`📄 Creating new document: ${filePath}`);
        await this.createNewDocument(filePath, newContent, config);
        return {
          action: 'created',
          filePath,
          changes: ['new document created'],
          backupPath: null
        };
      }

      // Read existing document
      const existingContent = fs.readFileSync(filePath, 'utf8');
      
      // Create backup if requested
      let backupPath = null;
      if (config.backupOriginal) {
        backupPath = await this.createBackup(filePath, existingContent);
      }

      // Analyze content differences
      const analysis = await this.analyzeContentDifferences(existingContent, newContent);
      
      // Determine update strategy
      const strategy = config.strategy === 'smart' ? 
        this.selectSmartStrategy(analysis) : 
        config.strategy;
      
      core.info(`🔍 Using update strategy: ${strategy}`);
      core.info(`📊 Content analysis: ${analysis.similarityPercentage}% similarity, ${analysis.conflictCount} conflicts`);

      // Apply update strategy
      const updatedContent = await this.applyUpdateStrategy(
        strategy, 
        existingContent, 
        newContent, 
        analysis, 
        config
      );

      // Generate diff report
      let diffReport = null;
      if (config.generateDiff) {
        diffReport = this.generateDiffReport(existingContent, updatedContent);
      }

      // Write updated content
      fs.writeFileSync(filePath, updatedContent);

      // Create version if requested
      if (config.maxVersions > 0) {
        await this.createVersionedCopy(filePath, updatedContent, config.maxVersions);
      }

      return {
        action: 'updated',
        strategy,
        filePath,
        backupPath,
        changes: analysis.changes,
        conflicts: analysis.conflicts,
        similarityPercentage: analysis.similarityPercentage,
        diffReport
      };

    } catch (error) {
      core.error(`❌ Failed to update document ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Analyze differences between existing and new content
   */
  async analyzeContentDifferences(existingContent, newContent) {
    const existingLines = existingContent.split('\n');
    const newLines = newContent.split('\n');
    
    // Extract sections from both documents
    const existingSections = this.extractSections(existingContent);
    const newSections = this.extractSections(newContent);
    
    // Calculate similarity
    const similarity = this.calculateSimilarity(existingContent, newContent);
    
    // Identify conflicts and changes
    const conflicts = this.identifyConflicts(existingSections, newSections);
    const changes = this.identifyChanges(existingSections, newSections);
    
    // Analyze metadata
    const existingMetadata = this.extractMetadata(existingContent);
    const newMetadata = this.extractMetadata(newContent);
    
    return {
      similarityPercentage: Math.round(similarity * 100),
      conflictCount: conflicts.length,
      changeCount: changes.length,
      existingSections,
      newSections,
      conflicts,
      changes,
      existingMetadata,
      newMetadata,
      structuralChanges: this.detectStructuralChanges(existingSections, newSections)
    };
  }

  /**
   * Select the best update strategy based on content analysis
   */
  selectSmartStrategy(analysis) {
    // If very similar content, use merge strategy
    if (analysis.similarityPercentage > 85) {
      return 'merge';
    }
    
    // If many conflicts, use version strategy
    if (analysis.conflictCount > 5) {
      return 'version';
    }
    
    // If structural changes, use replace strategy
    if (analysis.structuralChanges.length > 3) {
      return 'replace';
    }
    
    // If mostly additions, use append strategy
    if (analysis.changes.filter(c => c.type === 'addition').length > 
        analysis.changes.filter(c => c.type === 'modification').length) {
      return 'append';
    }
    
    // Default to merge
    return 'merge';
  }

  /**
   * Append strategy - add new content to existing document
   */
  async appendStrategy(existingContent, newContent, analysis, config) {
    const timestamp = new Date().toISOString();
    const separator = '\n\n---\n\n## Update ' + timestamp + '\n\n';
    
    // Extract only genuinely new sections
    const newSections = analysis.newSections.filter(newSection => {
      return !analysis.existingSections.some(existingSection => 
        this.sectionsAreSimilar(existingSection, newSection)
      );
    });
    
    if (newSections.length === 0) {
      core.info('📄 No new content to append');
      return existingContent;
    }
    
    const newContentToAppend = newSections.map(section => section.content).join('\n\n');
    return existingContent + separator + newContentToAppend + '\n\n*Updated via Chroniclr automated system*';
  }

  /**
   * Merge strategy - intelligently merge sections
   */
  async mergeStrategy(existingContent, newContent, analysis, config) {
    let mergedSections = [...analysis.existingSections];
    
    // Process each new section
    for (const newSection of analysis.newSections) {
      const existingIndex = mergedSections.findIndex(existing => 
        existing.header === newSection.header
      );
      
      if (existingIndex >= 0) {
        // Merge existing section with new content
        const merged = await this.mergeSectionContent(
          mergedSections[existingIndex], 
          newSection, 
          config
        );
        mergedSections[existingIndex] = merged;
      } else {
        // Add new section
        mergedSections.push(newSection);
      }
    }
    
    // Reconstruct document
    return this.reconstructDocument(mergedSections, analysis.newMetadata);
  }

  /**
   * Replace strategy - replace entire document with new content
   */
  async replaceStrategy(existingContent, newContent, analysis, config) {
    if (config.preserveMetadata) {
      // Preserve original metadata but use new content
      const preservedMetadata = analysis.existingMetadata;
      const newContentWithMetadata = this.injectMetadata(newContent, preservedMetadata);
      return newContentWithMetadata + '\n\n*Document replaced via Chroniclr - original backed up*';
    }
    
    return newContent + '\n\n*Document replaced via Chroniclr*';
  }

  /**
   * Version strategy - create a new version while preserving the original
   */
  async versionStrategy(existingContent, newContent, analysis, config) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const version = `v${timestamp}`;
    
    // Create version header
    const versionHeader = `# Document Version: ${version}\n\n` +
      `**Previous Version Preserved:** Yes  \n` +
      `**Update Reason:** Significant changes detected (${analysis.conflictCount} conflicts)  \n` +
      `**Similarity:** ${analysis.similarityPercentage}%  \n\n` +
      `---\n\n`;
    
    return versionHeader + newContent + '\n\n*New version created via Chroniclr*';
  }

  /**
   * Smart strategy - combination of multiple strategies based on section analysis
   */
  async smartStrategy(existingContent, newContent, analysis, config) {
    core.info('🧠 Applying smart strategy with section-by-section analysis');
    
    let result = existingContent;
    
    // Handle high-confidence new sections (append them)
    const newSections = analysis.newSections.filter(section => 
      !analysis.existingSections.some(existing => existing.header === section.header)
    );
    
    if (newSections.length > 0) {
      core.info(`📝 Adding ${newSections.length} new sections`);
      result = await this.appendStrategy(result, '', { newSections }, config);
    }
    
    // Handle conflicting sections (merge with conflict markers)
    for (const conflict of analysis.conflicts) {
      result = await this.resolveConflictInContent(result, conflict, config);
    }
    
    return result;
  }

  /**
   * Extract sections from markdown content
   */
  extractSections(content) {
    const sections = [];
    const lines = content.split('\n');
    let currentSection = null;
    
    for (const line of lines) {
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      
      if (headerMatch) {
        // Save previous section
        if (currentSection) {
          sections.push(currentSection);
        }
        
        // Start new section
        currentSection = {
          level: headerMatch[1].length,
          header: headerMatch[2].trim(),
          content: line + '\n',
          lineStart: sections.reduce((sum, s) => sum + s.content.split('\n').length, 0)
        };
      } else if (currentSection) {
        currentSection.content += line + '\n';
      } else {
        // Content before first header (metadata/frontmatter)
        if (sections.length === 0) {
          sections.push({
            level: 0,
            header: '__frontmatter__',
            content: line + '\n',
            lineStart: 0
          });
        } else {
          sections[0].content += line + '\n';
        }
      }
    }
    
    // Add last section
    if (currentSection) {
      sections.push(currentSection);
    }
    
    return sections;
  }

  /**
   * Calculate content similarity using a simple algorithm
   */
  calculateSimilarity(content1, content2) {
    const words1 = new Set(content1.toLowerCase().match(/\w+/g) || []);
    const words2 = new Set(content2.toLowerCase().match(/\w+/g) || []);
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Create backup of original document
   */
  async createBackup(filePath, content) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.backup.${timestamp}`;
    
    fs.writeFileSync(backupPath, content);
    core.info(`💾 Backup created: ${backupPath}`);
    
    return backupPath;
  }

  /**
   * Generate a diff report between two documents
   */
  generateDiffReport(oldContent, newContent) {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    
    const additions = [];
    const deletions = [];
    const modifications = [];
    
    // Simple diff algorithm (for production, use a proper diff library)
    for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];
      
      if (oldLine && !newLine) {
        deletions.push({ line: i + 1, content: oldLine });
      } else if (!oldLine && newLine) {
        additions.push({ line: i + 1, content: newLine });
      } else if (oldLine && newLine && oldLine !== newLine) {
        modifications.push({ 
          line: i + 1, 
          old: oldLine, 
          new: newLine 
        });
      }
    }
    
    return {
      additions,
      deletions,
      modifications,
      summary: {
        linesAdded: additions.length,
        linesDeleted: deletions.length,
        linesModified: modifications.length
      }
    };
  }

  /**
   * Create versioned copy of document
   */
  async createVersionedCopy(filePath, content, maxVersions) {
    const dir = path.dirname(filePath);
    const name = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);
    
    const versionsDir = path.join(dir, 'versions');
    if (!fs.existsSync(versionsDir)) {
      fs.mkdirSync(versionsDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const versionPath = path.join(versionsDir, `${name}.${timestamp}${ext}`);
    
    fs.writeFileSync(versionPath, content);
    
    // Clean up old versions
    await this.cleanupOldVersions(versionsDir, name, ext, maxVersions);
    
    core.info(`📚 Version created: ${versionPath}`);
  }

  /**
   * Extract metadata from document
   */
  extractMetadata(content) {
    const metadata = {};
    const lines = content.split('\n').slice(0, 20); // Check first 20 lines
    
    for (const line of lines) {
      const metadataMatch = line.match(/^\*\*(.+?):\*\*\s*(.+)$/);
      if (metadataMatch) {
        metadata[metadataMatch[1].toLowerCase()] = metadataMatch[2].trim();
      }
    }
    
    return metadata;
  }

  /**
   * Identify conflicts between sections
   */
  identifyConflicts(existingSections, newSections) {
    const conflicts = [];
    
    for (const newSection of newSections) {
      const existingSection = existingSections.find(s => s.header === newSection.header);
      
      if (existingSection && existingSection.content !== newSection.content) {
        const similarity = this.calculateSimilarity(existingSection.content, newSection.content);
        
        if (similarity < 0.8) { // Less than 80% similar = conflict
          conflicts.push({
            section: newSection.header,
            type: 'content_conflict',
            similarity,
            existing: existingSection.content,
            new: newSection.content
          });
        }
      }
    }
    
    return conflicts;
  }

  /**
   * Identify changes between sections
   */
  identifyChanges(existingSections, newSections) {
    const changes = [];
    
    // New sections
    newSections.forEach(newSection => {
      const exists = existingSections.find(s => s.header === newSection.header);
      if (!exists) {
        changes.push({
          type: 'addition',
          section: newSection.header,
          content: newSection.content
        });
      }
    });
    
    // Modified sections
    existingSections.forEach(existingSection => {
      const newSection = newSections.find(s => s.header === existingSection.header);
      if (newSection && newSection.content !== existingSection.content) {
        changes.push({
          type: 'modification',
          section: existingSection.header,
          oldContent: existingSection.content,
          newContent: newSection.content
        });
      }
    });
    
    // Removed sections
    existingSections.forEach(existingSection => {
      const stillExists = newSections.find(s => s.header === existingSection.header);
      if (!stillExists) {
        changes.push({
          type: 'removal',
          section: existingSection.header,
          content: existingSection.content
        });
      }
    });
    
    return changes;
  }

  /**
   * Detect structural changes in document
   */
  detectStructuralChanges(existingSections, newSections) {
    const changes = [];
    
    // Check section order changes
    const existingHeaders = existingSections.map(s => s.header);
    const newHeaders = newSections.map(s => s.header);
    
    if (JSON.stringify(existingHeaders) !== JSON.stringify(newHeaders)) {
      changes.push({
        type: 'section_reordering',
        old: existingHeaders,
        new: newHeaders
      });
    }
    
    // Check header level changes
    existingSections.forEach(existing => {
      const newSection = newSections.find(s => s.header === existing.header);
      if (newSection && newSection.level !== existing.level) {
        changes.push({
          type: 'header_level_change',
          section: existing.header,
          oldLevel: existing.level,
          newLevel: newSection.level
        });
      }
    });
    
    return changes;
  }

  /**
   * Clean up old versions to maintain maxVersions limit
   */
  async cleanupOldVersions(versionsDir, baseName, extension, maxVersions) {
    try {
      const files = fs.readdirSync(versionsDir)
        .filter(file => file.startsWith(baseName) && file.endsWith(extension))
        .map(file => ({
          name: file,
          path: path.join(versionsDir, file),
          stat: fs.statSync(path.join(versionsDir, file))
        }))
        .sort((a, b) => b.stat.mtime - a.stat.mtime); // Sort by modification time, newest first
      
      // Remove excess versions
      if (files.length > maxVersions) {
        const filesToDelete = files.slice(maxVersions);
        filesToDelete.forEach(file => {
          fs.unlinkSync(file.path);
          core.info(`🗑️ Cleaned up old version: ${file.name}`);
        });
      }
    } catch (error) {
      core.warning(`Failed to cleanup old versions: ${error.message}`);
    }
  }

  // Helper methods
  sectionsAreSimilar(section1, section2) {
    return this.calculateSimilarity(section1.content, section2.content) > 0.85;
  }

  async createNewDocument(filePath, content, config) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content);
  }

  reconstructDocument(sections, metadata) {
    return sections.map(section => section.content).join('\n');
  }

  async mergeSectionContent(existing, newSection, config) {
    // Simple merge - in production, implement more sophisticated merging
    return {
      ...existing,
      content: existing.content + '\n\n*Merged content:*\n\n' + newSection.content
    };
  }

  injectMetadata(content, metadata) {
    const metadataLines = Object.entries(metadata)
      .map(([key, value]) => `**${key}:** ${value}`)
      .join('  \n');
    
    return metadataLines + '\n\n' + content;
  }

  async resolveConflictInContent(content, conflict, config) {
    // Add conflict markers
    const conflictMarker = `\n\n<!-- CONFLICT: ${conflict.section} -->\n` +
      `<!-- Similarity: ${Math.round(conflict.similarity * 100)}% -->\n` +
      `<!-- Resolution needed -->\n\n`;
    
    return content + conflictMarker;
  }
}

module.exports = { DocumentUpdater };

// CLI support
if (require.main === module) {
  const action = process.argv[2];
  const filePath = process.argv[3];
  const newContentPath = process.argv[4];
  
  if (action === 'update' && filePath && newContentPath) {
    const updater = new DocumentUpdater();
    const newContent = fs.readFileSync(newContentPath, 'utf8');
    
    updater.updateDocument(filePath, newContent, { strategy: 'smart' })
      .then(result => {
        console.log('✅ Document updated successfully');
        console.log(JSON.stringify(result, null, 2));
      })
      .catch(error => {
        console.error('❌ Update failed:', error.message);
        process.exit(1);
      });
  } else {
    console.log('Usage: node document-updater.js update <existing-file> <new-content-file>');
    process.exit(1);
  }
}