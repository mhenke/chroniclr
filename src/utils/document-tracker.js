#!/usr/bin/env node

/**
 * Document Tracker for Chroniclr
 * Tracks document versions, modification history, and dependencies
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class DocumentTracker {
  constructor() {
    this.metadataDir = path.join(process.cwd(), '.chroniclr');
    this.metadataFile = path.join(this.metadataDir, 'metadata.json');
    this.ensureMetadataDir();
  }

  /**
   * Ensure metadata directory exists
   */
  ensureMetadataDir() {
    if (!fs.existsSync(this.metadataDir)) {
      fs.mkdirSync(this.metadataDir, { recursive: true });
    }
  }

  /**
   * Load document metadata
   */
  loadMetadata() {
    try {
      if (fs.existsSync(this.metadataFile)) {
        const data = fs.readFileSync(this.metadataFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.warn(`Failed to load metadata: ${error.message}`);
    }
    
    return {
      version: '1.0.0',
      documents: {},
      lastUpdate: new Date().toISOString()
    };
  }

  /**
   * Save document metadata
   */
  saveMetadata(metadata) {
    try {
      metadata.lastUpdate = new Date().toISOString();
      fs.writeFileSync(this.metadataFile, JSON.stringify(metadata, null, 2));
      return true;
    } catch (error) {
      console.error(`Failed to save metadata: ${error.message}`);
      return false;
    }
  }

  /**
   * Track a document's creation or update
   */
  trackDocument(filePath, options = {}) {
    const metadata = this.loadMetadata();
    const normalizedPath = path.resolve(filePath);
    const relativePath = path.relative(process.cwd(), normalizedPath);
    
    const documentId = this.generateDocumentId(relativePath);
    const fileStats = this.getFileStats(normalizedPath);
    const contentHash = this.generateContentHash(normalizedPath);
    
    // Get existing document info or create new
    const existingDoc = metadata.documents[documentId] || {};
    
    const documentInfo = {
      id: documentId,
      path: relativePath,
      type: options.type || this.inferDocumentType(relativePath),
      source: options.source || 'manual', // 'ai', 'manual', 'mixed'
      createdAt: existingDoc.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: this.incrementVersion(existingDoc.version || '1.0.0'),
      contentHash,
      size: fileStats.size,
      dependencies: options.dependencies || existingDoc.dependencies || [],
      aiSections: options.aiSections || existingDoc.aiSections || [],
      manualSections: options.manualSections || existingDoc.manualSections || [],
      lastAiUpdate: options.source === 'ai' ? new Date().toISOString() : existingDoc.lastAiUpdate,
      lastManualUpdate: options.source === 'manual' ? new Date().toISOString() : existingDoc.lastManualUpdate,
      updateHistory: [
        ...(existingDoc.updateHistory || []),
        {
          timestamp: new Date().toISOString(),
          version: this.incrementVersion(existingDoc.version || '1.0.0'),
          source: options.source || 'manual',
          contentHash,
          changes: options.changes || 'Document updated'
        }
      ]
    };

    // Keep only last 10 history entries
    if (documentInfo.updateHistory.length > 10) {
      documentInfo.updateHistory = documentInfo.updateHistory.slice(-10);
    }

    metadata.documents[documentId] = documentInfo;
    this.saveMetadata(metadata);

    return documentInfo;
  }

  /**
   * Get document information by file path
   */
  getDocumentInfo(filePath) {
    const metadata = this.loadMetadata();
    const normalizedPath = path.resolve(filePath);
    const relativePath = path.relative(process.cwd(), normalizedPath);
    const documentId = this.generateDocumentId(relativePath);
    
    return metadata.documents[documentId] || null;
  }

  /**
   * Check if document is outdated based on dependencies
   */
  isDocumentOutdated(filePath, codeChangesSince = null) {
    const docInfo = this.getDocumentInfo(filePath);
    if (!docInfo) {
      return { outdated: false, reason: 'not_tracked' };
    }

    // Check file system changes
    const normalizedPath = path.resolve(filePath);
    if (!fs.existsSync(normalizedPath)) {
      return { outdated: true, reason: 'file_missing' };
    }

    const currentHash = this.generateContentHash(normalizedPath);
    if (currentHash !== docInfo.contentHash) {
      return { outdated: true, reason: 'content_modified_externally' };
    }

    // Check dependency changes
    if (docInfo.dependencies && docInfo.dependencies.length > 0) {
      for (const dependency of docInfo.dependencies) {
        const depPath = path.resolve(dependency);
        if (fs.existsSync(depPath)) {
          const depStats = fs.statSync(depPath);
          const lastAiUpdate = new Date(docInfo.lastAiUpdate || docInfo.updatedAt);
          
          if (depStats.mtime > lastAiUpdate) {
            return { 
              outdated: true, 
              reason: 'dependency_changed',
              dependency: dependency,
              dependencyModified: depStats.mtime.toISOString()
            };
          }
        }
      }
    }

    // Check if document should be updated based on AI update frequency
    const lastUpdate = new Date(docInfo.lastAiUpdate || docInfo.updatedAt);
    const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSinceUpdate > 30 && docInfo.source !== 'manual') {
      return { 
        outdated: true, 
        reason: 'stale_ai_content',
        daysSinceUpdate: Math.floor(daysSinceUpdate)
      };
    }

    return { outdated: false, reason: 'up_to_date' };
  }

  /**
   * Get all tracked documents
   */
  getAllDocuments() {
    const metadata = this.loadMetadata();
    return Object.values(metadata.documents);
  }

  /**
   * Get documents that need updates
   */
  getOutdatedDocuments() {
    const allDocs = this.getAllDocuments();
    const outdatedDocs = [];

    for (const doc of allDocs) {
      const status = this.isDocumentOutdated(doc.path);
      if (status.outdated) {
        outdatedDocs.push({
          ...doc,
          outdatedReason: status
        });
      }
    }

    return outdatedDocs;
  }

  /**
   * Add dependency to a document
   */
  addDependency(filePath, dependencyPath) {
    const metadata = this.loadMetadata();
    const normalizedPath = path.resolve(filePath);
    const relativePath = path.relative(process.cwd(), normalizedPath);
    const documentId = this.generateDocumentId(relativePath);
    
    const docInfo = metadata.documents[documentId];
    if (docInfo) {
      const relativeDependency = path.relative(process.cwd(), path.resolve(dependencyPath));
      if (!docInfo.dependencies.includes(relativeDependency)) {
        docInfo.dependencies.push(relativeDependency);
        this.saveMetadata(metadata);
      }
    }
  }

  /**
   * Generate unique document ID
   */
  generateDocumentId(filePath) {
    return crypto.createHash('md5').update(filePath).digest('hex').substring(0, 12);
  }

  /**
   * Generate content hash for file
   */
  generateContentHash(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return crypto.createHash('sha256').update(content).digest('hex');
    } catch (error) {
      return null;
    }
  }

  /**
   * Get file statistics
   */
  getFileStats(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return {
        size: stats.size,
        mtime: stats.mtime.toISOString(),
        ctime: stats.ctime.toISOString()
      };
    } catch (error) {
      return { size: 0, mtime: null, ctime: null };
    }
  }

  /**
   * Infer document type from file path
   */
  inferDocumentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath, ext).toLowerCase();
    
    if (ext === '.md') {
      if (basename.includes('readme')) return 'readme';
      if (basename.includes('api')) return 'api-documentation';
      if (basename.includes('changelog')) return 'changelog';
      if (basename.includes('migration')) return 'migration-guide';
      if (basename.includes('security')) return 'security-documentation';
      return 'markdown-documentation';
    }
    
    return 'unknown';
  }

  /**
   * Increment version number (semantic versioning)
   */
  incrementVersion(currentVersion, type = 'patch') {
    const parts = currentVersion.split('.').map(n => parseInt(n, 10));
    
    switch (type) {
      case 'major':
        return `${parts[0] + 1}.0.0`;
      case 'minor':
        return `${parts[0]}.${parts[1] + 1}.0`;
      case 'patch':
      default:
        return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    }
  }

  /**
   * Generate tracking report
   */
  generateTrackingReport() {
    const metadata = this.loadMetadata();
    const documents = Object.values(metadata.documents);
    const outdatedDocs = this.getOutdatedDocuments();
    
    const report = {
      summary: {
        totalDocuments: documents.length,
        outdatedDocuments: outdatedDocs.length,
        aiGenerated: documents.filter(d => d.source === 'ai').length,
        manualDocuments: documents.filter(d => d.source === 'manual').length,
        mixedDocuments: documents.filter(d => d.source === 'mixed').length,
        lastUpdate: metadata.lastUpdate
      },
      outdatedDocuments: outdatedDocs.map(doc => ({
        path: doc.path,
        type: doc.type,
        version: doc.version,
        lastUpdate: doc.updatedAt,
        reason: doc.outdatedReason.reason,
        details: doc.outdatedReason
      })),
      documentTypes: this.groupByType(documents),
      updateFrequency: this.calculateUpdateFrequency(documents)
    };

    return report;
  }

  /**
   * Group documents by type
   */
  groupByType(documents) {
    const types = {};
    documents.forEach(doc => {
      const type = doc.type || 'unknown';
      types[type] = (types[type] || 0) + 1;
    });
    return types;
  }

  /**
   * Calculate update frequency statistics
   */
  calculateUpdateFrequency(documents) {
    const now = Date.now();
    const frequencies = {
      daily: 0,
      weekly: 0,
      monthly: 0,
      older: 0
    };

    documents.forEach(doc => {
      const lastUpdate = new Date(doc.updatedAt).getTime();
      const daysSince = (now - lastUpdate) / (1000 * 60 * 60 * 24);
      
      if (daysSince <= 1) frequencies.daily++;
      else if (daysSince <= 7) frequencies.weekly++;
      else if (daysSince <= 30) frequencies.monthly++;
      else frequencies.older++;
    });

    return frequencies;
  }
}

module.exports = { DocumentTracker };