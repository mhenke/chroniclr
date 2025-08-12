#!/usr/bin/env node

/**
 * Document Update Manager for Chroniclr
 * Manages document metadata, updates, and orchestrates the intelligent update system
 */

const fs = require('fs');
const path = require('path');
const { DocumentTracker } = require('./document-tracker');
const { DocumentMerger } = require('./document-merger');
const { FileAnalyzer } = require('./file-analyzer');

class DocumentUpdateManager {
  constructor(options = {}) {
    this.tracker = new DocumentTracker();
    this.merger = new DocumentMerger();
    this.fileAnalyzer = new FileAnalyzer();
    this.config = this.loadConfig();
    this.outputDir = options.outputDir || this.config.documents?.outputDir || 'docs';
  }

  /**
   * Load configuration
   */
  loadConfig() {
    try {
      const configPath = path.join(process.cwd(), 'chroniclr.config.json');
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
    } catch (error) {
      console.warn(`Failed to load config: ${error.message}`);
    }
    return {};
  }

  /**
   * Analyze repository changes to determine what documentation needs updating
   */
  async analyzeRepositoryChanges(options = {}) {
    const analysis = {
      timestamp: new Date().toISOString(),
      codeChanges: [],
      outdatedDocuments: [],
      updateSuggestions: [],
      riskAssessment: 'low'
    };

    try {
      // Get all tracked documents
      const allDocs = this.tracker.getAllDocuments();
      analysis.totalDocuments = allDocs.length;

      // Check for outdated documents
      analysis.outdatedDocuments = this.tracker.getOutdatedDocuments();

      // If we have file changes to analyze
      if (options.files && options.files.length > 0) {
        analysis.codeChanges = this.fileAnalyzer.analyzeChanges(options.files);
        analysis.updateSuggestions = this.generateUpdateSuggestions(analysis.codeChanges, allDocs);
        analysis.riskAssessment = analysis.codeChanges.risks?.level || 'low';
      }

      // Analyze dependencies for all documents
      for (const doc of allDocs) {
        const status = this.tracker.isDocumentOutdated(doc.path);
        if (status.outdated && !analysis.outdatedDocuments.find(d => d.path === doc.path)) {
          analysis.outdatedDocuments.push({
            ...doc,
            outdatedReason: status
          });
        }
      }

      return analysis;
    } catch (error) {
      return {
        ...analysis,
        error: error.message,
        success: false
      };
    }
  }

  /**
   * Generate update suggestions based on code changes and existing documentation
   */
  generateUpdateSuggestions(codeAnalysis, documents) {
    const suggestions = [];

    // Suggest API documentation updates
    if (codeAnalysis.documentationNeeds?.api) {
      const apiDocs = documents.filter(doc => 
        doc.type === 'api-documentation' || 
        doc.path.toLowerCase().includes('api')
      );
      
      if (apiDocs.length > 0) {
        suggestions.push({
          type: 'api_update',
          priority: 'high',
          documents: apiDocs.map(d => d.path),
          reason: 'API changes detected',
          changes: codeAnalysis.impactAreas?.api || 0
        });
      } else {
        suggestions.push({
          type: 'api_create',
          priority: 'high',
          suggestedPath: path.join(this.outputDir, 'API.md'),
          reason: 'API changes detected but no API documentation found'
        });
      }
    }

    // Suggest user guide updates
    if (codeAnalysis.documentationNeeds?.userGuide) {
      const userDocs = documents.filter(doc => 
        doc.type === 'readme' ||
        doc.path.toLowerCase().includes('user') ||
        doc.path.toLowerCase().includes('guide')
      );
      
      suggestions.push({
        type: 'user_guide_update',
        priority: 'medium',
        documents: userDocs.map(d => d.path),
        reason: 'User-facing changes detected',
        changes: codeAnalysis.impactAreas?.frontend || 0
      });
    }

    // Suggest migration documentation for breaking changes
    if (codeAnalysis.breakingChanges?.detected) {
      suggestions.push({
        type: 'migration_guide',
        priority: 'high',
        suggestedPath: path.join(this.outputDir, 'MIGRATION.md'),
        reason: `${codeAnalysis.breakingChanges.indicators.length} breaking changes detected`,
        breakingChanges: codeAnalysis.breakingChanges.indicators
      });
    }

    // Suggest security documentation updates
    if (codeAnalysis.documentationNeeds?.security) {
      suggestions.push({
        type: 'security_update',
        priority: 'high',
        suggestedPath: path.join(this.outputDir, 'SECURITY.md'),
        reason: 'Security-related changes detected',
        changes: codeAnalysis.impactAreas?.security || 0
      });
    }

    // Suggest changelog updates
    if (codeAnalysis.features && codeAnalysis.features.length > 0) {
      const changelogDocs = documents.filter(doc => 
        doc.path.toLowerCase().includes('changelog') ||
        doc.path.toLowerCase().includes('changes')
      );
      
      suggestions.push({
        type: 'changelog_update',
        priority: 'medium',
        documents: changelogDocs.length > 0 ? changelogDocs.map(d => d.path) : [path.join(this.outputDir, 'CHANGELOG.md')],
        reason: `${codeAnalysis.features.length} feature changes detected`,
        features: codeAnalysis.features
      });
    }

    return suggestions;
  }

  /**
   * Update a specific document with new content
   */
  async updateDocument(filePath, newContent, options = {}) {
    const updateResult = {
      success: false,
      filePath,
      timestamp: new Date().toISOString(),
      changes: {},
      error: null
    };

    try {
      // Get current document info
      const docInfo = this.tracker.getDocumentInfo(filePath);
      
      // Perform merge
      const mergeResult = this.merger.mergeDocument(filePath, newContent, {
        version: docInfo ? this.tracker.incrementVersion(docInfo.version) : '1.0.0',
        source: 'ai',
        ...options
      });

      if (!mergeResult.success) {
        updateResult.error = mergeResult.error;
        return updateResult;
      }

      // Write merged content to file
      const fullPath = path.resolve(filePath);
      const dir = path.dirname(fullPath);
      
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(fullPath, mergeResult.mergedContent, 'utf8');

      // Update tracking information
      const trackingInfo = this.tracker.trackDocument(filePath, {
        source: 'ai',
        type: options.docType,
        changes: 'AI-generated content merged',
        aiSections: this.extractAISectionInfo(mergeResult.mergedContent),
        manualSections: this.extractManualSectionInfo(mergeResult.mergedContent),
        dependencies: options.dependencies
      });

      updateResult.success = true;
      updateResult.changes = mergeResult.changes;
      updateResult.trackingInfo = trackingInfo;
      updateResult.preservedSections = mergeResult.preservedSections?.length || 0;

      return updateResult;

    } catch (error) {
      updateResult.error = error.message;
      return updateResult;
    }
  }

  /**
   * Update multiple documents based on suggestions
   */
  async updateDocuments(suggestions, contentGenerator) {
    const results = [];
    
    for (const suggestion of suggestions) {
      try {
        let documentsToUpdate = [];
        
        if (suggestion.documents) {
          documentsToUpdate = suggestion.documents;
        } else if (suggestion.suggestedPath) {
          documentsToUpdate = [suggestion.suggestedPath];
        }
        
        for (const docPath of documentsToUpdate) {
          // Generate new content based on suggestion type
          let newContent = '';
          
          if (contentGenerator && typeof contentGenerator === 'function') {
            newContent = await contentGenerator(suggestion.type, suggestion);
          } else {
            newContent = this.generateDefaultContent(suggestion);
          }
          
          const result = await this.updateDocument(docPath, newContent, {
            docType: suggestion.type,
            priority: suggestion.priority,
            dependencies: this.inferDependencies(suggestion)
          });
          
          result.suggestionType = suggestion.type;
          result.priority = suggestion.priority;
          result.reason = suggestion.reason;
          
          results.push(result);
        }
        
      } catch (error) {
        results.push({
          success: false,
          suggestionType: suggestion.type,
          error: error.message,
          suggestion
        });
      }
    }
    
    return results;
  }

  /**
   * Generate update report
   */
  generateUpdateReport(analysisResult, updateResults = []) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalDocuments: analysisResult.totalDocuments || 0,
        outdatedDocuments: analysisResult.outdatedDocuments?.length || 0,
        updateSuggestions: analysisResult.updateSuggestions?.length || 0,
        updatesAttempted: updateResults.length,
        updatesSuccessful: updateResults.filter(r => r.success).length,
        updatesFailed: updateResults.filter(r => !r.success).length,
        riskLevel: analysisResult.riskAssessment || 'low'
      },
      outdatedDocuments: analysisResult.outdatedDocuments || [],
      updateSuggestions: analysisResult.updateSuggestions || [],
      updateResults: updateResults,
      recommendations: this.generateRecommendations(analysisResult, updateResults),
      nextSteps: this.generateNextSteps(analysisResult, updateResults)
    };

    return report;
  }

  /**
   * Generate recommendations based on analysis and update results
   */
  generateRecommendations(analysisResult, updateResults) {
    const recommendations = [];

    // High-priority recommendations
    const failedUpdates = updateResults.filter(r => !r.success);
    if (failedUpdates.length > 0) {
      recommendations.push({
        priority: 'high',
        type: 'failed_updates',
        message: `${failedUpdates.length} document updates failed and need manual intervention`,
        actions: ['Review error messages', 'Check file permissions', 'Validate content format']
      });
    }

    const highRiskChanges = analysisResult.riskAssessment === 'high';
    if (highRiskChanges) {
      recommendations.push({
        priority: 'high',
        type: 'risk_assessment',
        message: 'High-risk code changes detected - thorough documentation review required',
        actions: ['Review all updated documents', 'Validate technical accuracy', 'Test documented procedures']
      });
    }

    // Medium-priority recommendations
    const preservedSections = updateResults.reduce((sum, r) => sum + (r.preservedSections || 0), 0);
    if (preservedSections > 0) {
      recommendations.push({
        priority: 'medium',
        type: 'preserved_content',
        message: `${preservedSections} manually edited sections were preserved - review for consistency`,
        actions: ['Check preserved sections for outdated information', 'Ensure consistency with new AI content']
      });
    }

    const missingDocs = analysisResult.updateSuggestions?.filter(s => s.type.includes('_create')) || [];
    if (missingDocs.length > 0) {
      recommendations.push({
        priority: 'medium',
        type: 'missing_documentation',
        message: `${missingDocs.length} new documents should be created based on code changes`,
        actions: ['Create missing documentation files', 'Set up tracking for new documents']
      });
    }

    // Low-priority recommendations
    const trackingReport = this.tracker.generateTrackingReport();
    const oldDocuments = trackingReport.summary.outdatedDocuments;
    if (oldDocuments > 0) {
      recommendations.push({
        priority: 'low',
        type: 'maintenance',
        message: `${oldDocuments} documents haven't been updated recently`,
        actions: ['Review stale documents', 'Consider archiving unused documentation']
      });
    }

    return recommendations;
  }

  /**
   * Generate next steps based on results
   */
  generateNextSteps(analysisResult, updateResults) {
    const nextSteps = [];

    // Immediate actions
    const failedUpdates = updateResults.filter(r => !r.success).length;
    if (failedUpdates > 0) {
      nextSteps.push({
        timeframe: 'immediate',
        action: `Resolve ${failedUpdates} failed document updates`,
        details: 'Check logs and fix issues preventing document updates'
      });
    }

    const highPrioritySuggestions = analysisResult.updateSuggestions?.filter(s => s.priority === 'high') || [];
    if (highPrioritySuggestions.length > 0) {
      nextSteps.push({
        timeframe: 'immediate',
        action: `Address ${highPrioritySuggestions.length} high-priority documentation needs`,
        details: 'Create or update critical documentation identified by analysis'
      });
    }

    // Short-term actions (1-3 days)
    const successfulUpdates = updateResults.filter(r => r.success).length;
    if (successfulUpdates > 0) {
      nextSteps.push({
        timeframe: 'short-term',
        action: `Review and validate ${successfulUpdates} updated documents`,
        details: 'Ensure accuracy and consistency of AI-generated content'
      });
    }

    // Medium-term actions (1-2 weeks)
    const outdatedCount = analysisResult.outdatedDocuments?.length || 0;
    if (outdatedCount > successfulUpdates) {
      nextSteps.push({
        timeframe: 'medium-term',
        action: `Update remaining ${outdatedCount - successfulUpdates} outdated documents`,
        details: 'Plan systematic update of all outdated documentation'
      });
    }

    // Long-term actions (1+ months)
    nextSteps.push({
      timeframe: 'long-term',
      action: 'Set up automated documentation maintenance',
      details: 'Configure regular scans and updates to keep documentation current'
    });

    return nextSteps;
  }

  /**
   * Extract AI section information from content
   */
  extractAISectionInfo(content) {
    const aiSections = [];
    const regex = /<!-- AI_GENERATED_START -->([\s\S]*?)<!-- AI_GENERATED_END -->/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      const sectionContent = match[1];
      const timestampMatch = sectionContent.match(/<!-- AI_TIMESTAMP: (.*?) -->/);
      const versionMatch = sectionContent.match(/<!-- AI_VERSION: (.*?) -->/);
      
      aiSections.push({
        content: sectionContent.trim(),
        timestamp: timestampMatch ? timestampMatch[1] : null,
        version: versionMatch ? versionMatch[1] : null,
        length: sectionContent.length
      });
    }
    
    return aiSections;
  }

  /**
   * Extract manual section information from content
   */
  extractManualSectionInfo(content) {
    const manualSections = [];
    const patterns = [
      /<!-- MANUAL_EDIT_START -->([\s\S]*?)<!-- MANUAL_EDIT_END -->/g,
      /<!-- PRESERVE_START -->([\s\S]*?)<!-- PRESERVE_END -->/g,
      /<!-- CUSTOM_CONTENT -->([\s\S]*?)<!-- END_CUSTOM_CONTENT -->/g
    ];
    
    patterns.forEach(regex => {
      let match;
      while ((match = regex.exec(content)) !== null) {
        manualSections.push({
          content: match[1].trim(),
          type: match[0].includes('MANUAL_EDIT') ? 'manual_edit' : 'preserved',
          length: match[1].length
        });
      }
    });
    
    return manualSections;
  }

  /**
   * Generate default content for suggestion types
   */
  generateDefaultContent(suggestion) {
    const templates = {
      api_update: `# API Documentation\n\n<!-- AI_GENERATED_START -->\n<!-- AI_TIMESTAMP: ${new Date().toISOString()} -->\n\nAPI changes detected. This documentation needs to be updated.\n\nReason: ${suggestion.reason}\nChanges: ${suggestion.changes || 'Unknown'}\n\n<!-- AI_GENERATED_END -->`,
      
      migration_guide: `# Migration Guide\n\n<!-- AI_GENERATED_START -->\n<!-- AI_TIMESTAMP: ${new Date().toISOString()} -->\n\n## Breaking Changes\n\n${(suggestion.breakingChanges || []).map(change => `- ${change.file}: ${change.type}`).join('\n')}\n\n<!-- AI_GENERATED_END -->`,
      
      security_update: `# Security Documentation\n\n<!-- AI_GENERATED_START -->\n<!-- AI_TIMESTAMP: ${new Date().toISOString()} -->\n\nSecurity changes detected. Please review and update security documentation.\n\nReason: ${suggestion.reason}\n\n<!-- AI_GENERATED_END -->`
    };
    
    return templates[suggestion.type] || `# ${suggestion.type}\n\nGenerated content for ${suggestion.reason}`;
  }

  /**
   * Infer dependencies based on suggestion
   */
  inferDependencies(suggestion) {
    const dependencies = [];
    
    if (suggestion.type.includes('api')) {
      dependencies.push('src/**/*.js', 'src/**/*.ts', 'routes/**/*');
    }
    
    if (suggestion.type.includes('security')) {
      dependencies.push('**/auth*', '**/security*', '**/middleware*');
    }
    
    return dependencies;
  }

  /**
   * Save update report to file
   */
  saveUpdateReport(report, filename = null) {
    try {
      const reportsDir = path.join(this.outputDir, 'reports');
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const reportFile = filename || `update-report-${timestamp}.json`;
      const reportPath = path.join(reportsDir, reportFile);
      
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      
      return {
        success: true,
        reportPath
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = { DocumentUpdateManager };