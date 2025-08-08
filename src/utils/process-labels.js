#!/usr/bin/env node

/**
 * Process GitHub discussion labels and determine document types
 * Maps labels from chroniclr.config.json to document generation types
 */

const core = require('@actions/core');
const fs = require('fs');
const path = require('path');

function loadConfig() {
  try {
    const configPath = path.join(process.cwd(), 'chroniclr.config.json');
    const configData = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    throw new Error(`Failed to load config: ${error.message}`);
  }
}

function mapLabelsToDocTypes(labels, config) {
  const labelMapping = config.github?.discussionLabels || {};
  const documentTypes = new Set();
  
  // Parse labels if they come as a JSON string
  let parsedLabels = labels;
  if (typeof labels === 'string') {
    try {
      parsedLabels = JSON.parse(labels);
    } catch (e) {
      // If not JSON, treat as comma-separated string
      parsedLabels = labels.split(',').map(l => l.trim());
    }
  }
  
  // Extract label names if they're objects
  const labelNames = Array.isArray(parsedLabels) 
    ? parsedLabels.map(label => typeof label === 'object' ? label.name : label)
    : [];
  
  // Map each label to document types
  labelNames.forEach(labelName => {
    if (labelMapping[labelName]) {
      labelMapping[labelName].forEach(docType => {
        documentTypes.add(docType);
      });
    }
  });
  
  // Default to summary if no labels match
  if (documentTypes.size === 0) {
    documentTypes.add('summary');
  }
  
  return Array.from(documentTypes);
}

function main() {
  try {
    const config = loadConfig();
    const labels = process.env.DISCUSSION_LABELS || '[]';
    
    const documentTypes = mapLabelsToDocTypes(labels, config);
    
    core.info(`Mapped labels to document types: ${documentTypes.join(', ')}`);
    core.setOutput('document_types', documentTypes.join(' '));
    core.setOutput('types_json', JSON.stringify(documentTypes));
    
  } catch (error) {
    core.setFailed(`Label processing error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { mapLabelsToDocTypes, loadConfig };