#!/usr/bin/env node

/**
 * JQL Query Builder for Chroniclr
 * Provides template system and dynamic query generation for Jira data extraction
 */

const core = require('@actions/core');

class JiraQueryBuilder {
  constructor() {
    this.templates = this.initializeTemplates();
  }

  initializeTemplates() {
    return {
      // Sprint-related queries
      currentSprint: {
        jql: "project = '{project}' AND sprint in openSprints()",
        description: "Issues in current active sprint",
        fields: ['key', 'summary', 'status', 'priority', 'assignee', 'storyPoints', 'created', 'updated']
      },

      futureSprints: {
        jql: "project = '{project}' AND sprint in futureSprints()",
        description: "Issues planned for future sprints",
        fields: ['key', 'summary', 'priority', 'assignee', 'storyPoints', 'epic']
      },

      sprintHistory: {
        jql: "project = '{project}' AND sprint in closedSprints() AND sprint = '{sprintId}'",
        description: "Issues from a specific completed sprint",
        fields: ['key', 'summary', 'status', 'priority', 'assignee', 'storyPoints', 'resolutiondate']
      },

      // Epic-related queries
      activeEpics: {
        jql: "project = '{project}' AND type = Epic AND status != Done",
        description: "Active epics in the project",
        fields: ['key', 'summary', 'status', 'priority', 'assignee', 'created', 'description']
      },

      completedEpics: {
        jql: "project = '{project}' AND type = Epic AND status = Done AND updatedDate >= -{days}d",
        description: "Recently completed epics",
        fields: ['key', 'summary', 'priority', 'assignee', 'resolutiondate', 'description']
      },

      epicStories: {
        jql: "project = '{project}' AND 'Epic Link' = '{epicKey}'",
        description: "Stories belonging to a specific epic",
        fields: ['key', 'summary', 'status', 'priority', 'assignee', 'storyPoints']
      },

      // Status-based queries
      blockedIssues: {
        jql: "project = '{project}' AND status = Blocked",
        description: "Currently blocked issues",
        fields: ['key', 'summary', 'priority', 'assignee', 'created', 'description']
      },

      inProgressIssues: {
        jql: "project = '{project}' AND status = 'In Progress'",
        description: "Issues currently being worked on",
        fields: ['key', 'summary', 'priority', 'assignee', 'updated']
      },

      readyForReview: {
        jql: "project = '{project}' AND status = 'Ready for Review'",
        description: "Issues ready for review or testing",
        fields: ['key', 'summary', 'priority', 'assignee', 'updated']
      },

      // Time-based queries
      recentlyCompleted: {
        jql: "project = '{project}' AND status = Done AND updatedDate >= -{days}d",
        description: "Recently completed issues",
        fields: ['key', 'summary', 'priority', 'assignee', 'resolutiondate', 'storyPoints']
      },

      recentlyCreated: {
        jql: "project = '{project}' AND created >= -{days}d",
        description: "Recently created issues",
        fields: ['key', 'summary', 'priority', 'assignee', 'created', 'reporter']
      },

      overdueIssues: {
        jql: "project = '{project}' AND duedate < now() AND status != Done",
        description: "Issues past their due date",
        fields: ['key', 'summary', 'priority', 'assignee', 'duedate', 'status']
      },

      // Priority and assignment queries
      highPriorityOpen: {
        jql: "project = '{project}' AND priority in (Highest, High) AND status != Done",
        description: "High priority open issues",
        fields: ['key', 'summary', 'priority', 'assignee', 'status', 'created']
      },

      unassignedIssues: {
        jql: "project = '{project}' AND assignee is EMPTY AND status != Done",
        description: "Unassigned open issues",
        fields: ['key', 'summary', 'priority', 'status', 'created']
      },

      userWorkload: {
        jql: "project = '{project}' AND assignee = '{username}' AND status != Done",
        description: "Open issues assigned to a specific user",
        fields: ['key', 'summary', 'priority', 'status', 'storyPoints', 'updated']
      },

      // Release and version queries
      releaseReadiness: {
        jql: "project = '{project}' AND fixVersion = '{version}' AND status != Done",
        description: "Outstanding issues for a specific release",
        fields: ['key', 'summary', 'priority', 'assignee', 'status', 'issueType']
      },

      releasedFeatures: {
        jql: "project = '{project}' AND fixVersion = '{version}' AND status = Done",
        description: "Completed features in a release",
        fields: ['key', 'summary', 'priority', 'assignee', 'resolutiondate', 'issueType']
      },

      // Bug tracking queries
      openBugs: {
        jql: "project = '{project}' AND type = Bug AND status != Done",
        description: "Open bug reports",
        fields: ['key', 'summary', 'priority', 'assignee', 'status', 'created', 'reporter']
      },

      recentBugFixes: {
        jql: "project = '{project}' AND type = Bug AND status = Done AND updatedDate >= -{days}d",
        description: "Recently fixed bugs",
        fields: ['key', 'summary', 'priority', 'assignee', 'resolutiondate']
      }
    };
  }

  getTemplate(templateName) {
    const template = this.templates[templateName];
    if (!template) {
      throw new Error(`Unknown query template: ${templateName}`);
    }
    return template;
  }

  listTemplates() {
    return Object.keys(this.templates).map(name => ({
      name,
      description: this.templates[name].description
    }));
  }

  buildQuery(templateName, variables = {}) {
    const template = this.getTemplate(templateName);
    let jql = template.jql;

    // Apply variable substitution
    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`\\{${key}\\}`, 'g');
      jql = jql.replace(pattern, String(value));
    }

    // Check for remaining unsubstituted variables
    const unsubstituted = jql.match(/\{[^}]+\}/g);
    if (unsubstituted) {
      core.warning(`Query contains unsubstituted variables: ${unsubstituted.join(', ')}`);
    }

    return {
      jql,
      fields: template.fields,
      description: template.description
    };
  }

  buildCustomQuery(jqlString, options = {}) {
    const {
      fields = ['key', 'summary', 'status', 'priority', 'assignee'],
      description = 'Custom JQL query'
    } = options;

    return {
      jql: jqlString,
      fields,
      description
    };
  }

  // Sprint-specific query builders
  buildSprintQuery(sprintId, projectKey, includeCompleted = false) {
    const statusClause = includeCompleted ? '' : " AND status != Done";
    const jql = `project = '${projectKey}' AND sprint = ${sprintId}${statusClause}`;
    
    return this.buildCustomQuery(jql, {
      fields: ['key', 'summary', 'status', 'priority', 'assignee', 'storyPoints', 'updated'],
      description: `Issues from sprint ${sprintId}`
    });
  }

  // Epic breakdown query builder
  buildEpicBreakdownQuery(epicKey, projectKey) {
    const jql = `project = '${projectKey}' AND 'Epic Link' = '${epicKey}' ORDER BY priority DESC`;
    
    return this.buildCustomQuery(jql, {
      fields: ['key', 'summary', 'status', 'priority', 'assignee', 'storyPoints', 'created'],
      description: `Stories and tasks for epic ${epicKey}`
    });
  }

  // Team workload query builder
  buildTeamWorkloadQuery(projectKey, teamMembers, sprintId = null) {
    const userList = teamMembers.map(user => `"${user}"`).join(', ');
    let jql = `project = '${projectKey}' AND assignee in (${userList}) AND status != Done`;
    
    if (sprintId) {
      jql += ` AND sprint = ${sprintId}`;
    }
    
    jql += " ORDER BY assignee, priority DESC";

    return this.buildCustomQuery(jql, {
      fields: ['key', 'summary', 'priority', 'assignee', 'status', 'storyPoints', 'updated'],
      description: `Team workload analysis`
    });
  }

  // Velocity calculation query builder
  buildVelocityQuery(projectKey, numberOfSprints = 6) {
    const jql = `project = '${projectKey}' AND sprint in closedSprints() ORDER BY updatedDate DESC`;
    
    return this.buildCustomQuery(jql, {
      fields: ['key', 'summary', 'assignee', 'storyPoints', 'resolutiondate', 'sprint'],
      description: `Velocity data for last ${numberOfSprints} sprints`
    });
  }

  // Risk assessment query builder
  buildRiskAssessmentQuery(projectKey) {
    const riskIndicators = [
      `project = '${projectKey}' AND status = Blocked`,
      `project = '${projectKey}' AND priority in (Highest, High) AND status != Done AND created <= -14d`,
      `project = '${projectKey}' AND duedate < now() AND status != Done`,
      `project = '${projectKey}' AND assignee is EMPTY AND priority in (Highest, High) AND status != Done`
    ];

    return riskIndicators.map((jql, index) => {
      const riskTypes = ['Blocked Issues', 'Aging High Priority', 'Overdue Issues', 'Unassigned Critical'];
      return this.buildCustomQuery(jql, {
        fields: ['key', 'summary', 'priority', 'assignee', 'status', 'created', 'duedate'],
        description: riskTypes[index]
      });
    });
  }

  // Stakeholder summary query builder  
  buildStakeholderSummaryQuery(projectKey, timeframeDays = 14) {
    const queries = {};

    queries.recentProgress = this.buildQuery('recentlyCompleted', {
      project: projectKey,
      days: timeframeDays
    });

    queries.currentWork = this.buildQuery('inProgressIssues', {
      project: projectKey
    });

    queries.upcomingWork = this.buildQuery('futureSprints', {
      project: projectKey
    });

    queries.risks = this.buildQuery('blockedIssues', {
      project: projectKey
    });

    return queries;
  }

  validateQuery(queryObject) {
    const required = ['jql', 'fields', 'description'];
    const missing = required.filter(field => !queryObject[field]);
    
    if (missing.length > 0) {
      throw new Error(`Query validation failed. Missing fields: ${missing.join(', ')}`);
    }

    // Basic JQL syntax validation
    if (!queryObject.jql.toLowerCase().includes('project')) {
      core.warning('Query does not include project filter - results may be unexpectedly broad');
    }

    return true;
  }

  // Utility method to combine multiple queries
  combineQueries(queries, operator = 'OR') {
    if (!Array.isArray(queries) || queries.length === 0) {
      throw new Error('Cannot combine empty query array');
    }

    const combinedJQL = queries.map(q => `(${q.jql})`).join(` ${operator} `);
    const allFields = [...new Set(queries.flatMap(q => q.fields))];
    const descriptions = queries.map(q => q.description).join(' + ');

    return {
      jql: combinedJQL,
      fields: allFields,
      description: `Combined: ${descriptions}`
    };
  }

  // Export query for external use
  exportQuery(templateName, variables = {}, format = 'json') {
    const query = this.buildQuery(templateName, variables);
    
    switch (format) {
      case 'json':
        return JSON.stringify(query, null, 2);
      case 'jql':
        return query.jql;
      case 'csv-fields':
        return query.fields.join(',');
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }
}

module.exports = { JiraQueryBuilder };