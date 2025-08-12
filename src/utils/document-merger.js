#!/usr/bin/env node

/**
 * Document Merger for Chroniclr
 * Smart merging algorithm that preserves manually edited sections
 */

const fs = require('fs');
const path = require('path');

class DocumentMerger {
  constructor() {
    this.aiSectionMarkers = {
      start: '<!-- AI_GENERATED_START -->',
      end: '<!-- AI_GENERATED_END -->',
      timestamp: '<!-- AI_TIMESTAMP: {timestamp} -->',
      version: '<!-- AI_VERSION: {version} -->'
    };
    
    this.manualSectionMarkers = {
      start: '<!-- MANUAL_EDIT_START -->',
      end: '<!-- MANUAL_EDIT_END -->',
      timestamp: '<!-- MANUAL_TIMESTAMP: {timestamp} -->',
      author: '<!-- MANUAL_AUTHOR: {author} -->'
    };

    this.preservePatterns = [
      /<!--\s*PRESERVE_START\s*-->[\s\S]*?<!--\s*PRESERVE_END\s*-->/g,
      /<!--\s*MANUAL_EDIT_START\s*-->[\s\S]*?<!--\s*MANUAL_EDIT_END\s*-->/g,
      /<!--\s*CUSTOM_CONTENT\s*-->[\s\S]*?<!--\s*END_CUSTOM_CONTENT\s*-->/g
    ];
  }

  /**
   * Merge new AI-generated content with existing document while preserving manual edits
   */
  mergeDocument(filePath, newContent, options = {}) {
    try {
      const existingContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
      const mergedContent = this.performMerge(existingContent, newContent, options);
      
      return {
        success: true,
        mergedContent,
        changes: this.detectChanges(existingContent, mergedContent),
        preservedSections: this.extractPreservedSections(existingContent)
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        originalContent: existingContent,
        newContent
      };
    }
  }

  /**
   * Perform the actual merge operation
   */
  performMerge(existingContent, newContent, options = {}) {
    // If no existing content, add markers to new content
    if (!existingContent.trim()) {
      return this.wrapAIContent(newContent, options);
    }

    // Extract preserved sections from existing content
    const preservedSections = this.extractPreservedSections(existingContent);
    
    // Extract AI sections from existing content
    const existingAISections = this.extractAISections(existingContent);
    
    // Wrap new content with AI markers
    const wrappedNewContent = this.wrapAIContent(newContent, options);
    
    // Decide merge strategy based on content structure
    if (this.hasStructuredSections(existingContent)) {
      return this.mergeStructuredDocument(existingContent, wrappedNewContent, preservedSections, options);
    } else {
      return this.mergeUnstructuredDocument(existingContent, wrappedNewContent, preservedSections, options);
    }
  }

  /**
   * Merge documents with clear section structure
   */
  mergeStructuredDocument(existingContent, newContent, preservedSections, options = {}) {
    const sections = this.parseDocumentSections(existingContent);
    const newSections = this.parseDocumentSections(newContent);
    
    const mergedSections = [];
    
    // Process each section
    const allSectionHeaders = [...new Set([
      ...Object.keys(sections),
      ...Object.keys(newSections)
    ])];

    for (const header of allSectionHeaders) {
      const existing = sections[header];
      const newSection = newSections[header];
      
      if (existing && this.isManuallyEdited(existing.content)) {
        // Preserve manually edited sections
        mergedSections.push({
          header,
          content: existing.content,
          source: 'manual'
        });
      } else if (newSection) {
        // Use new AI content for sections that haven't been manually edited
        mergedSections.push({
          header,
          content: newSection.content,
          source: 'ai'
        });
      } else if (existing) {
        // Keep existing content if no new version
        mergedSections.push({
          header,
          content: existing.content,
          source: 'existing'
        });
      }
    }

    // Re-insert preserved sections at the end
    preservedSections.forEach(section => {
      mergedSections.push({
        header: null,
        content: section,
        source: 'preserved'
      });
    });

    return this.reconstructDocument(mergedSections, options);
  }

  /**
   * Merge documents without clear structure
   */
  mergeUnstructuredDocument(existingContent, newContent, preservedSections, options = {}) {
    // For unstructured documents, preserve any manually marked sections
    // and replace AI sections with new content or append if no AI sections exist
    
    let mergedContent = existingContent;
    
    // Replace AI sections with new content
    const aiSectionRegex = new RegExp(
      `${this.escapeRegex(this.aiSectionMarkers.start)}[\\s\\S]*?${this.escapeRegex(this.aiSectionMarkers.end)}`,
      'g'
    );
    
    // Reset regex for re-use
    aiSectionRegex.lastIndex = 0;
    
    if (aiSectionRegex.test(existingContent)) {
      // Replace existing AI sections
      aiSectionRegex.lastIndex = 0;
      mergedContent = mergedContent.replace(aiSectionRegex, newContent.trim());
    } else {
      // Append new content if no existing AI sections
      mergedContent = mergedContent.trim() + '\n\n' + newContent.trim();
    }
    
    return mergedContent;
  }

  /**
   * Wrap AI-generated content with appropriate markers
   */
  wrapAIContent(content, options = {}) {
    const timestamp = new Date().toISOString();
    const version = options.version || '1.0.0';
    
    const timestampMarker = this.aiSectionMarkers.timestamp.replace('{timestamp}', timestamp);
    const versionMarker = this.aiSectionMarkers.version.replace('{version}', version);
    
    return [
      this.aiSectionMarkers.start,
      timestampMarker,
      versionMarker,
      '',
      content.trim(),
      '',
      this.aiSectionMarkers.end
    ].join('\n');
  }

  /**
   * Extract sections that should be preserved during merge
   */
  extractPreservedSections(content) {
    const preservedSections = [];
    
    this.preservePatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        preservedSections.push(...matches);
      }
    });
    
    return preservedSections;
  }

  /**
   * Extract AI-generated sections from content
   */
  extractAISections(content) {
    const aiSectionRegex = new RegExp(
      `${this.escapeRegex(this.aiSectionMarkers.start)}[\\s\\S]*?${this.escapeRegex(this.aiSectionMarkers.end)}`,
      'g'
    );
    
    const matches = content.match(aiSectionRegex);
    return matches || [];
  }

  /**
   * Check if content has been manually edited
   */
  isManuallyEdited(content) {
    return this.manualSectionMarkers.start && content.includes(this.manualSectionMarkers.start) ||
           content.includes('<!-- MANUAL_EDIT') ||
           content.includes('<!-- PRESERVE_START') ||
           content.includes('<!-- CUSTOM_CONTENT');
  }

  /**
   * Check if document has structured sections (headers)
   */
  hasStructuredSections(content) {
    const headerRegex = /^#{1,6}\s+.+$/gm;
    const headers = content.match(headerRegex);
    return headers && headers.length >= 2;
  }

  /**
   * Parse document into sections based on headers
   */
  parseDocumentSections(content) {
    const sections = {};
    const lines = content.split('\n');
    
    let currentHeader = null;
    let currentContent = [];
    
    for (const line of lines) {
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      
      if (headerMatch) {
        // Save previous section
        if (currentHeader) {
          sections[currentHeader] = {
            content: currentContent.join('\n').trim(),
            level: currentHeader.level
          };
        }
        
        // Start new section
        currentHeader = {
          text: headerMatch[2],
          level: headerMatch[1].length,
          full: line
        };
        currentContent = [line];
      } else {
        currentContent.push(line);
      }
    }
    
    // Save final section
    if (currentHeader) {
      sections[currentHeader.text] = {
        content: currentContent.join('\n').trim(),
        level: currentHeader.level
      };
    }
    
    return sections;
  }

  /**
   * Reconstruct document from merged sections
   */
  reconstructDocument(sections, options = {}) {
    return sections
      .filter(section => section.content.trim())
      .map(section => section.content)
      .join('\n\n');
  }

  /**
   * Detect what changes were made during merge
   */
  detectChanges(originalContent, mergedContent) {
    const changes = {
      aiSectionsReplaced: 0,
      manualSectionsPreserved: 0,
      newContentAdded: 0,
      linesChanged: 0
    };

    // Count AI sections replaced
    const originalAI = this.extractAISections(originalContent);
    const mergedAI = this.extractAISections(mergedContent);
    changes.aiSectionsReplaced = Math.abs(mergedAI.length - originalAI.length);

    // Count preserved sections
    const preservedSections = this.extractPreservedSections(originalContent);
    changes.manualSectionsPreserved = preservedSections.length;

    // Count line changes
    const originalLines = originalContent.split('\n').length;
    const mergedLines = mergedContent.split('\n').length;
    changes.linesChanged = Math.abs(mergedLines - originalLines);

    // Detect new content
    if (mergedContent.length > originalContent.length * 1.1) {
      changes.newContentAdded = 1;
    }

    return changes;
  }

  /**
   * Create manual edit markers for a section
   */
  createManualEditMarkers(content, author = 'user', options = {}) {
    const timestamp = new Date().toISOString();
    const authorMarker = this.manualSectionMarkers.author.replace('{author}', author);
    const timestampMarker = this.manualSectionMarkers.timestamp.replace('{timestamp}', timestamp);
    
    return [
      this.manualSectionMarkers.start,
      authorMarker,
      timestampMarker,
      '',
      content.trim(),
      '',
      this.manualSectionMarkers.end
    ].join('\n');
  }

  /**
   * Add preserve markers around content
   */
  createPreserveMarkers(content, label = '') {
    const labelComment = label ? `<!-- PRESERVE_LABEL: ${label} -->` : '';
    
    return [
      '<!-- PRESERVE_START -->',
      labelComment,
      content.trim(),
      '<!-- PRESERVE_END -->'
    ].filter(line => line).join('\n');
  }

  /**
   * Generate merge report
   */
  generateMergeReport(originalPath, mergeResult) {
    const report = {
      filePath: originalPath,
      timestamp: new Date().toISOString(),
      success: mergeResult.success,
      changes: mergeResult.changes || {},
      preservedSections: (mergeResult.preservedSections || []).length,
      error: mergeResult.error || null,
      recommendations: []
    };

    // Add recommendations based on merge results
    if (mergeResult.success) {
      if (mergeResult.changes.manualSectionsPreserved > 0) {
        report.recommendations.push('Manual edits were preserved - review for consistency');
      }
      if (mergeResult.changes.aiSectionsReplaced > 0) {
        report.recommendations.push('AI sections were updated - validate new content');
      }
      if (mergeResult.changes.linesChanged > 50) {
        report.recommendations.push('Significant changes detected - full review recommended');
      }
    } else {
      report.recommendations.push('Merge failed - manual intervention required');
    }

    return report;
  }

  /**
   * Escape special regex characters
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Validate document markers
   */
  validateMarkers(content) {
    const issues = [];
    
    // Check for unmatched AI markers
    const aiStarts = (content.match(new RegExp(this.escapeRegex(this.aiSectionMarkers.start), 'g')) || []).length;
    const aiEnds = (content.match(new RegExp(this.escapeRegex(this.aiSectionMarkers.end), 'g')) || []).length;
    
    if (aiStarts !== aiEnds) {
      issues.push(`Unmatched AI markers: ${aiStarts} starts, ${aiEnds} ends`);
    }
    
    // Check for unmatched manual markers
    const manualStarts = (content.match(new RegExp(this.escapeRegex(this.manualSectionMarkers.start), 'g')) || []).length;
    const manualEnds = (content.match(new RegExp(this.escapeRegex(this.manualSectionMarkers.end), 'g')) || []).length;
    
    if (manualStarts !== manualEnds) {
      issues.push(`Unmatched manual markers: ${manualStarts} starts, ${manualEnds} ends`);
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }
}

module.exports = { DocumentMerger };