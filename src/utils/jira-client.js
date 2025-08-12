#!/usr/bin/env node

/**
 * Jira API Client for Chroniclr
 * Provides authenticated access to Jira REST API for data extraction
 */

const core = require('@actions/core');
const fs = require('fs');
const path = require('path');

class JiraClient {
  constructor() {
    this.config = this.loadConfiguration();
    this.cache = new Map();
    this.rateLimiter = this.initializeRateLimiter();
  }

  loadConfiguration() {
    try {
      const configPath = path.join(process.cwd(), 'chroniclr.config.json');
      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData);
      
      if (!config.jira || !config.jira.enabled) {
        return null;
      }

      // Validate required configuration
      if (!config.jira.baseUrl || !config.jira.defaultProject) {
        core.warning('Jira integration enabled but missing baseUrl or defaultProject');
        return null;
      }

      return config.jira;
    } catch (error) {
      core.warning(`Failed to load Jira configuration: ${error.message}`);
      return null;
    }
  }

  initializeRateLimiter() {
    if (!this.config) return null;

    const { requestsPerMinute = 100 } = this.config.rateLimiting || {};
    const intervalMs = 60000 / requestsPerMinute;

    return {
      requestsPerMinute,
      intervalMs,
      lastRequestTime: 0,
      queue: []
    };
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async enforceRateLimit() {
    if (!this.rateLimiter) return;

    const now = Date.now();
    const timeSinceLastRequest = now - this.rateLimiter.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimiter.intervalMs) {
      const waitTime = this.rateLimiter.intervalMs - timeSinceLastRequest;
      core.info(`Rate limiting: waiting ${waitTime}ms`);
      await this.sleep(waitTime);
    }
    
    this.rateLimiter.lastRequestTime = Date.now();
  }

  getAuthHeaders() {
    if (!this.config) return {};

    const apiToken = process.env[this.config.authentication.apiTokenSecret] || process.env.JIRA_API_TOKEN;
    const userEmail = this.config.authentication.userEmail || process.env.JIRA_USER_EMAIL;

    if (!apiToken || !userEmail) {
      throw new Error('Jira authentication credentials not found. Set JIRA_API_TOKEN and JIRA_USER_EMAIL environment variables.');
    }

    const auth = Buffer.from(`${userEmail}:${apiToken}`).toString('base64');
    
    return {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
  }

  getCacheKey(endpoint, params = {}) {
    const paramString = JSON.stringify(params);
    return `${endpoint}:${paramString}`;
  }

  getCachedData(cacheKey) {
    if (!this.config?.caching?.enabled) return null;
    
    const cached = this.cache.get(cacheKey);
    if (!cached) return null;

    const ttlMs = (this.config.caching.ttlMinutes || 15) * 60 * 1000;
    const isExpired = Date.now() - cached.timestamp > ttlMs;
    
    if (isExpired) {
      this.cache.delete(cacheKey);
      return null;
    }

    core.info(`Using cached data for ${cacheKey}`);
    return cached.data;
  }

  setCachedData(cacheKey, data) {
    if (!this.config?.caching?.enabled) return;
    
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });
  }

  async makeRequest(endpoint, params = {}) {
    if (!this.config) {
      throw new Error('Jira integration not configured or disabled');
    }

    const cacheKey = this.getCacheKey(endpoint, params);
    const cachedData = this.getCachedData(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    await this.enforceRateLimit();

    const url = `${this.config.baseUrl}/rest/api/2/${endpoint}`;
    const queryString = new URLSearchParams(params).toString();
    const fullUrl = queryString ? `${url}?${queryString}` : url;

    const { retryAttempts = 3, backoffMultiplier = 2 } = this.config.rateLimiting || {};
    
    for (let attempt = 0; attempt < retryAttempts; attempt++) {
      try {
        core.info(`Making Jira API request: ${endpoint} (attempt ${attempt + 1}/${retryAttempts})`);
        
        const response = await fetch(fullUrl, {
          method: 'GET',
          headers: this.getAuthHeaders()
        });

        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after') || Math.pow(backoffMultiplier, attempt) * 1000;
          core.warning(`Rate limited by Jira API. Retrying after ${retryAfter}ms`);
          await this.sleep(parseInt(retryAfter));
          continue;
        }

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Jira API error: ${response.status} ${response.statusText} - ${errorBody}`);
        }

        const data = await response.json();
        this.setCachedData(cacheKey, data);
        return data;

      } catch (error) {
        if (attempt === retryAttempts - 1) {
          throw error;
        }
        
        const waitTime = Math.pow(backoffMultiplier, attempt) * 1000;
        core.warning(`Request failed: ${error.message}. Retrying in ${waitTime}ms...`);
        await this.sleep(waitTime);
      }
    }
  }

  buildJQL(queryTemplate, variables = {}) {
    if (!queryTemplate) return '';

    let jql = queryTemplate;
    
    // Replace standard variables
    const defaultVariables = {
      project: this.config.defaultProject,
      days: 30,
      ...variables
    };

    for (const [key, value] of Object.entries(defaultVariables)) {
      const pattern = new RegExp(`\\{${key}\\}`, 'g');
      jql = jql.replace(pattern, value);
    }

    return jql;
  }

  async searchIssues(jqlQuery, options = {}) {
    const {
      fields = ['key', 'summary', 'status', 'priority', 'assignee', 'created', 'updated', 'description'],
      maxResults = 100,
      startAt = 0
    } = options;

    const params = {
      jql: jqlQuery,
      fields: fields.join(','),
      maxResults,
      startAt
    };

    return this.makeRequest('search', params);
  }

  async getCurrentSprintIssues(projectKey = null) {
    const project = projectKey || this.config.defaultProject;
    const jqlTemplate = this.config.queries.currentSprint;
    const jql = this.buildJQL(jqlTemplate, { project });
    
    core.info(`Fetching current sprint issues for project: ${project}`);
    return this.searchIssues(jql);
  }

  async getCompletedEpics(days = 30, projectKey = null) {
    const project = projectKey || this.config.defaultProject;
    const jqlTemplate = this.config.queries.completedEpic;
    const jql = this.buildJQL(jqlTemplate, { project, days });
    
    core.info(`Fetching completed epics from last ${days} days for project: ${project}`);
    return this.searchIssues(jql);
  }

  async getBlockedIssues(projectKey = null) {
    const project = projectKey || this.config.defaultProject;
    const jqlTemplate = this.config.queries.blockedIssues;
    const jql = this.buildJQL(jqlTemplate, { project });
    
    core.info(`Fetching blocked issues for project: ${project}`);
    return this.searchIssues(jql);
  }

  async getRecentlyCompletedIssues(days = 7, projectKey = null) {
    const project = projectKey || this.config.defaultProject;
    const jqlTemplate = this.config.queries.recentlyCompleted;
    const jql = this.buildJQL(jqlTemplate, { project, days });
    
    core.info(`Fetching recently completed issues from last ${days} days for project: ${project}`);
    return this.searchIssues(jql);
  }

  async getUpcomingWork(projectKey = null) {
    const project = projectKey || this.config.defaultProject;
    const jqlTemplate = this.config.queries.upcomingWork;
    const jql = this.buildJQL(jqlTemplate, { project });
    
    core.info(`Fetching upcoming work for project: ${project}`);
    return this.searchIssues(jql);
  }

  async getIssueDetails(issueKey) {
    core.info(`Fetching details for issue: ${issueKey}`);
    return this.makeRequest(`issue/${issueKey}`);
  }

  async getProject(projectKey = null) {
    const project = projectKey || this.config.defaultProject;
    core.info(`Fetching project details: ${project}`);
    return this.makeRequest(`project/${project}`);
  }

  async getProjectVersions(projectKey = null) {
    const project = projectKey || this.config.defaultProject;
    core.info(`Fetching versions for project: ${project}`);
    return this.makeRequest(`project/${project}/versions`);
  }

  async getIssueComments(issueKey) {
    core.info(`Fetching comments for issue: ${issueKey}`);
    const response = await this.makeRequest(`issue/${issueKey}/comment`);
    return response.comments || [];
  }

  formatIssueForDocumentation(issue) {
    if (!issue || !issue.fields) return null;

    return {
      key: issue.key,
      summary: issue.fields.summary || 'No summary',
      status: issue.fields.status?.name || 'Unknown',
      priority: issue.fields.priority?.name || 'Unknown',
      assignee: issue.fields.assignee?.displayName || 'Unassigned',
      created: issue.fields.created,
      updated: issue.fields.updated,
      description: issue.fields.description || 'No description',
      issueType: issue.fields.issuetype?.name || 'Unknown',
      storyPoints: issue.fields.customfield_10016 || null // Common story points field
    };
  }

  async getEnrichedProjectData(options = {}) {
    if (!this.config) {
      core.info('Jira integration disabled, skipping data enrichment');
      return null;
    }

    const {
      includeCurrentSprint = true,
      includeCompletedEpics = true,
      includeBlockedIssues = true,
      includeRecentWork = true,
      recentWorkDays = 7,
      epicHistoryDays = 30
    } = options;

    try {
      const enrichmentData = {};

      if (includeCurrentSprint) {
        const sprintData = await this.getCurrentSprintIssues();
        enrichmentData.currentSprint = {
          total: sprintData.total,
          issues: sprintData.issues.map(issue => this.formatIssueForDocumentation(issue))
        };
      }

      if (includeCompletedEpics) {
        const epicData = await this.getCompletedEpics(epicHistoryDays);
        enrichmentData.completedEpics = {
          total: epicData.total,
          epics: epicData.issues.map(issue => this.formatIssueForDocumentation(issue))
        };
      }

      if (includeBlockedIssues) {
        const blockedData = await this.getBlockedIssues();
        enrichmentData.blockedIssues = {
          total: blockedData.total,
          issues: blockedData.issues.map(issue => this.formatIssueForDocumentation(issue))
        };
      }

      if (includeRecentWork) {
        const recentData = await this.getRecentlyCompletedIssues(recentWorkDays);
        enrichmentData.recentlyCompleted = {
          total: recentData.total,
          issues: recentData.issues.map(issue => this.formatIssueForDocumentation(issue))
        };
      }

      // Add project metadata
      const projectData = await this.getProject();
      enrichmentData.project = {
        key: projectData.key,
        name: projectData.name,
        description: projectData.description
      };

      core.info(`Jira data enrichment completed for project: ${projectData.name}`);
      return enrichmentData;

    } catch (error) {
      core.error(`Failed to fetch Jira enrichment data: ${error.message}`);
      return null;
    }
  }

  isEnabled() {
    return this.config && this.config.enabled;
  }

  getStatus() {
    if (!this.config) {
      return { enabled: false, reason: 'Configuration not loaded or Jira disabled' };
    }

    try {
      this.getAuthHeaders();
      return { 
        enabled: true, 
        baseUrl: this.config.baseUrl, 
        project: this.config.defaultProject,
        cacheSize: this.cache.size
      };
    } catch (error) {
      return { enabled: false, reason: error.message };
    }
  }
}

module.exports = { JiraClient };