#!/usr/bin/env node

/**
 * Configuration File Loader for Chroniclr
 * Supports YAML and JSON configuration files to simplify complex workflow runs
 */

const core = require('@actions/core');
const fs = require('fs');
const path = require('path');

class ConfigLoader {
  constructor() {
    this.supportedFormats = ['.yml', '.yaml', '.json'];
    this.configCache = new Map();
  }

  /**
   * Load configuration from file or environment
   */
  async loadConfiguration(configPath = null) {
    try {
      // Try to load from specified path first
      if (configPath) {
        return await this.loadFromFile(configPath);
      }

      // Try common configuration file locations
      const commonPaths = [
        '.chroniclr/config.yml',
        '.chroniclr/config.yaml', 
        '.chroniclr/config.json',
        'chroniclr.config.yml',
        'chroniclr.config.yaml',
        'chroniclr.config.json'
      ];

      for (const commonPath of commonPaths) {
        if (fs.existsSync(commonPath)) {
          core.info(`📄 Found configuration file: ${commonPath}`);
          return await this.loadFromFile(commonPath);
        }
      }

      // Fall back to environment variables
      return this.loadFromEnvironment();
      
    } catch (error) {
      core.warning(`Failed to load configuration: ${error.message}`);
      return this.getDefaultConfiguration();
    }
  }

  /**
   * Load configuration from file
   */
  async loadFromFile(configPath) {
    const absolutePath = path.resolve(configPath);
    
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Configuration file not found: ${absolutePath}`);
    }

    // Check cache first
    const stat = fs.statSync(absolutePath);
    const cacheKey = `${absolutePath}:${stat.mtime.getTime()}`;
    
    if (this.configCache.has(cacheKey)) {
      core.debug(`Using cached configuration for ${configPath}`);
      return this.configCache.get(cacheKey);
    }

    const fileContent = fs.readFileSync(absolutePath, 'utf8');
    const ext = path.extname(absolutePath).toLowerCase();
    
    let config;
    
    switch (ext) {
      case '.json':
        config = JSON.parse(fileContent);
        break;
      case '.yml':
      case '.yaml':
        config = this.parseYAML(fileContent);
        break;
      default:
        throw new Error(`Unsupported configuration format: ${ext}`);
    }

    // Validate configuration
    const validatedConfig = this.validateConfiguration(config);
    
    // Cache the result
    this.configCache.set(cacheKey, validatedConfig);
    
    core.info(`✅ Configuration loaded from ${configPath}`);
    return validatedConfig;
  }

  /**
   * Simple YAML parser (basic support - in production, use a proper YAML library)
   */
  parseYAML(content) {
    // This is a very basic YAML parser for simple configurations
    // In production, you'd want to use a proper YAML library like 'js-yaml'
    
    const lines = content.split('\n');
    const config = {};
    let currentSection = config;
    let indentLevel = 0;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      
      // Count indentation
      const currentIndent = line.length - line.trimStart().length;
      
      if (trimmed.includes(':')) {
        const [key, ...valueParts] = trimmed.split(':');
        const value = valueParts.join(':').trim();
        
        const cleanKey = key.trim();
        
        if (value) {
          // Simple key-value pair
          if (value.startsWith('[') && value.endsWith(']')) {
            // Array value
            currentSection[cleanKey] = value.slice(1, -1).split(',').map(v => v.trim());
          } else if (value === 'true' || value === 'false') {
            // Boolean value
            currentSection[cleanKey] = value === 'true';
          } else if (!isNaN(value) && !isNaN(parseFloat(value))) {
            // Number value
            currentSection[cleanKey] = parseFloat(value);
          } else {
            // String value (remove quotes if present)
            currentSection[cleanKey] = value.replace(/^["']|["']$/g, '');
          }
        } else {
          // Section header
          currentSection[cleanKey] = {};
          currentSection = currentSection[cleanKey];
        }
      }
    }
    
    return config;
  }

  /**
   * Load configuration from environment variables
   */
  loadFromEnvironment() {
    const config = {
      sources: [],
      options: {},
      discovery: {}
    };

    // Map environment variables to config
    const envMappings = {
      SOURCE_MODULES: 'sources',
      PR_NUMBERS: 'prNumbers',
      JIRA_KEYS: 'jiraKeys',
      DISCUSSION_NUMBER: 'discussionNumber',
      ISSUE_NUMBERS: 'issueNumbers',
      DISCOVERY_KEYWORDS: 'discoveryKeywords',
      DISCOVERY_SCOPE: 'discovery.scope',
      MAX_DISCOVERIES: 'discovery.maxDiscoveries',
      BATCH_SIZE: 'options.batchSize',
      DRY_RUN: 'options.dryRun'
    };

    Object.entries(envMappings).forEach(([envVar, configPath]) => {
      const value = process.env[envVar];
      if (value) {
        this.setNestedValue(config, configPath, value);
      }
    });

    // Parse comma-separated values
    if (config.sources && typeof config.sources === 'string') {
      config.sources = config.sources.split(',').map(s => s.trim());
    }

    core.info('📄 Configuration loaded from environment variables');
    return this.validateConfiguration(config);
  }

  /**
   * Set nested object value using dot notation
   */
  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((o, k) => o[k] = o[k] || {}, obj);
    target[lastKey] = value;
  }

  /**
   * Validate and normalize configuration
   */
  validateConfiguration(config) {
    const validated = {
      sources: [],
      discovery: {
        scope: 'recent',
        maxDiscoveries: 20,
        strategies: 'all',
        confidenceThreshold: 0.0
      },
      options: {
        batchSize: 10,
        dryRun: false,
        timeout: 300000
      },
      filters: {
        excludeLabels: [],
        excludeAuthors: [],
        maxPrAgeInDays: 0
      },
      ...config
    };

    // Validate sources
    const validSources = ['discussion', 'jira', 'pr', 'issues'];
    if (validated.sources) {
      validated.sources = validated.sources.filter(source => {
        if (validSources.includes(source)) {
          return true;
        } else {
          core.warning(`⚠️ Invalid source '${source}' ignored. Valid sources: ${validSources.join(', ')}`);
          return false;
        }
      });
    }

    // Validate discovery scope
    const validScopes = ['recent', 'sprint', 'milestone', 'all'];
    if (!validScopes.includes(validated.discovery.scope)) {
      core.warning(`⚠️ Invalid discovery scope '${validated.discovery.scope}'. Using 'recent'`);
      validated.discovery.scope = 'recent';
    }

    // Ensure numeric values
    validated.discovery.maxDiscoveries = parseInt(validated.discovery.maxDiscoveries) || 20;
    validated.options.batchSize = parseInt(validated.options.batchSize) || 10;
    validated.options.timeout = parseInt(validated.options.timeout) || 300000;
    validated.discovery.confidenceThreshold = parseFloat(validated.discovery.confidenceThreshold) || 0.0;

    // Ensure boolean values
    validated.options.dryRun = Boolean(validated.options.dryRun === true || validated.options.dryRun === 'true');

    return validated;
  }

  /**
   * Get default configuration
   */
  getDefaultConfiguration() {
    return {
      sources: ['discussion'],
      discovery: {
        scope: 'recent',
        maxDiscoveries: 20,
        strategies: 'all',
        confidenceThreshold: 0.0
      },
      options: {
        batchSize: 10,
        dryRun: false,
        timeout: 300000
      },
      filters: {
        excludeLabels: [],
        excludeAuthors: [],
        maxPrAgeInDays: 0
      }
    };
  }

  /**
   * Generate sample configuration files
   */
  generateSampleConfigs() {
    const sampleYAML = `# Chroniclr Configuration File
# Save as .chroniclr/config.yml or chroniclr.config.yml

# Data sources to process
sources:
  - discussion
  - jira
  - pr

# Manual inputs (optional)
discussionNumber: 123
prNumbers: [456, 789]
jiraKeys: [PROJ-123, FEAT-456]
issueNumbers: [101, 102]
discoveryKeywords: [auth, security, mobile]

# Discovery settings
discovery:
  scope: recent              # recent, sprint, milestone, all
  maxDiscoveries: 20         # Maximum items to discover
  strategies: all            # all, or comma-separated: title-body,branch,commit
  confidenceThreshold: 0.6   # Minimum confidence for discovered items

# Processing options
options:
  batchSize: 10              # API batch size
  dryRun: false              # Preview mode
  timeout: 300000            # Timeout in milliseconds

# Filtering (optional)
filters:
  excludeLabels: [wip, draft]
  excludeAuthors: [dependabot]
  maxPrAgeInDays: 90         # Only process PRs newer than this

# Advanced settings (optional)
advanced:
  rateLimit:
    github:
      search: 30             # GitHub search API limit per minute
    jira:
      standard: 200          # Jira API limit per minute
  retries:
    maxRetries: 3
    exponentialBackoff: true
`;

    const sampleJSON = {
      "sources": ["discussion", "jira", "pr"],
      "discussionNumber": 123,
      "prNumbers": [456, 789],
      "jiraKeys": ["PROJ-123", "FEAT-456"],
      "discovery": {
        "scope": "recent",
        "maxDiscoveries": 20,
        "strategies": "all",
        "confidenceThreshold": 0.6
      },
      "options": {
        "batchSize": 10,
        "dryRun": false,
        "timeout": 300000
      },
      "filters": {
        "excludeLabels": ["wip", "draft"],
        "excludeAuthors": ["dependabot"],
        "maxPrAgeInDays": 90
      }
    };

    return {
      yaml: sampleYAML,
      json: JSON.stringify(sampleJSON, null, 2)
    };
  }

  /**
   * Create configuration directory and sample files
   */
  createSampleConfiguration(format = 'yaml') {
    const configDir = '.chroniclr';
    
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
      core.info(`📁 Created configuration directory: ${configDir}`);
    }

    const samples = this.generateSampleConfigs();
    
    if (format === 'yaml' || format === 'yml') {
      const configPath = path.join(configDir, 'config.yml');
      fs.writeFileSync(configPath, samples.yaml);
      core.info(`📄 Sample YAML configuration created: ${configPath}`);
      return configPath;
    } else if (format === 'json') {
      const configPath = path.join(configDir, 'config.json');
      fs.writeFileSync(configPath, samples.json);
      core.info(`📄 Sample JSON configuration created: ${configPath}`);
      return configPath;
    } else {
      throw new Error(`Unsupported format: ${format}. Use 'yaml' or 'json'`);
    }
  }

  /**
   * Convert configuration to environment variables for workflow
   */
  configToEnvVars(config) {
    const envVars = {};

    if (config.sources && config.sources.length > 0) {
      envVars.SOURCE_MODULES = config.sources.join(',');
    }

    if (config.discussionNumber) {
      envVars.DISCUSSION_NUMBER = config.discussionNumber.toString();
    }

    if (config.prNumbers && config.prNumbers.length > 0) {
      envVars.PR_NUMBERS = config.prNumbers.join(',');
    }

    if (config.jiraKeys && config.jiraKeys.length > 0) {
      envVars.JIRA_KEYS = config.jiraKeys.join(',');
    }

    if (config.issueNumbers && config.issueNumbers.length > 0) {
      envVars.ISSUE_NUMBERS = config.issueNumbers.join(',');
    }

    if (config.discoveryKeywords && config.discoveryKeywords.length > 0) {
      envVars.DISCOVERY_KEYWORDS = config.discoveryKeywords.join(',');
    }

    if (config.discovery) {
      envVars.DISCOVERY_SCOPE = config.discovery.scope;
      envVars.MAX_DISCOVERIES = config.discovery.maxDiscoveries.toString();
      envVars.DISCOVERY_STRATEGIES = config.discovery.strategies;
      envVars.CONFIDENCE_THRESHOLD = config.discovery.confidenceThreshold.toString();
    }

    if (config.options) {
      envVars.BATCH_SIZE = config.options.batchSize.toString();
      envVars.DRY_RUN = config.options.dryRun.toString();
    }

    return envVars;
  }
}

module.exports = { ConfigLoader };

// CLI support for generating sample configs
if (require.main === module) {
  const action = process.argv[2];
  const format = process.argv[3] || 'yaml';
  
  const loader = new ConfigLoader();
  
  if (action === 'generate') {
    try {
      const configPath = loader.createSampleConfiguration(format);
      console.log(`✅ Sample configuration created: ${configPath}`);
      console.log('\n🎯 Usage examples:');
      console.log(`gh workflow run chroniclr.yml -f config_file="${configPath}"`);
    } catch (error) {
      console.error(`❌ Failed to create configuration: ${error.message}`);
      process.exit(1);
    }
  } else {
    console.log('Usage: node config-loader.js generate [yaml|json]');
    process.exit(1);
  }
}