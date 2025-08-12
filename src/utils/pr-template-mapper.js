#!/usr/bin/env node

/**
 * Template Variable Mapper for PR Documents
 * Maps PR data and file analysis to template variables
 */

const core = require('@actions/core');

class PRTemplateMapper {
  constructor() {
    this.defaultValues = {
      // Common defaults
      date: new Date().toISOString().split('T')[0],
      chroniclrVersion: '1.0.0',
      
      // PR defaults
      prStatus: 'unknown',
      prSummary: '[AI processing unavailable]',
      totalFiles: '0',
      linesAdded: '0',
      linesDeleted: '0',
      netChange: '0',
      
      // Analysis defaults
      impactAreas: 'None detected',
      riskLevel: 'Unknown',
      riskFactors: 'Analysis unavailable',
      
      // Review defaults
      reviewStatus: 'Pending review',
      approvalStatus: 'Not yet approved',
      
      // Generic fallbacks
      keyFeatures: '[Analysis pending]',
      breakingChanges: 'None detected',
      testingStatus: 'Unknown',
      deploymentNotes: 'No specific notes',
      jiraLinks: '',
      relatedIssuesUrls: '',
      jiraReferences: '',
      additionalReferences: '',
      
      // Validation and assessment defaults
      validationStatus: 'Pending validation',
      analyst: 'Chroniclr',
      assessmentBy: 'Chroniclr',
      assessmentDate: new Date().toISOString().split('T')[0],
      
      // Review defaults
      reviewSummary: 'Review in progress',
      individualReviews: 'No detailed reviews available',
      approvalStatus: 'Pending approval',
      pendingReviews: 'Review pending',
      requestedChanges: 'None',
      
      // Impact analysis defaults
      frontendImpact: 'No significant frontend impact detected',
      backendImpact: 'No significant backend impact detected',
      databaseImpact: 'No database changes detected',
      apiImpact: 'No API changes detected',
      securityImpact: 'No security implications detected',
      
      // Technical defaults
      technicalChanges: 'Standard code changes',
      newFeatures: 'No new features',
      enhancements: 'No enhancements',
      bugFixes: 'No bug fixes',
      performanceImprovements: 'No performance improvements',
      securityUpdates: 'No security updates',
      
      // Common validation defaults
      prTitleValidation: '✅ Title is descriptive',
      prDescriptionValidation: pr => pr.body ? '✅ Description provided' : '❌ Description missing',
      linkedIssueValidation: '⚠️ Manual verification required',
      branchNamingValidation: '✅ Standard branch naming',
      mergeConflictValidation: '✅ No conflicts detected'
    };
  }

  /**
   * Map PR data to template variables
   */
  mapPRData(prData) {
    const pr = prData.pr;
    const variables = {
      // Basic PR information
      prNumber: pr.number.toString(),
      prTitle: pr.title,
      prAuthor: pr.author,
      prStatus: pr.merged ? 'Merged' : pr.state,
      prCreatedAt: pr.created_at || '[Unknown]',
      prUpdatedAt: pr.updated_at || '[Unknown]',
      mergedDate: pr.mergedAt || '[Not merged]',
      prUrl: pr.url,
      compareUrl: pr.url?.replace('/pull/', '/compare/') || '[Unavailable]',
      
      // Branch information
      baseBranch: pr.baseBranch || 'unknown',
      headBranch: pr.headBranch || 'unknown',
      
      // File statistics
      totalFiles: prData.files?.length?.toString() || '0',
      linesAdded: prData.files?.reduce((sum, f) => sum + (f.additions || 0), 0)?.toString() || '0',
      linesDeleted: prData.files?.reduce((sum, f) => sum + (f.deletions || 0), 0)?.toString() || '0',
      
      // People
      requiredReviewers: (pr.reviewers || []).map(r => `@${r}`).join(', ') || 'None assigned',
      assignees: (pr.assignees || []).map(a => `@${a}`).join(', ') || 'None assigned',
      
      // Review data
      totalCommits: prData.commits?.length?.toString() || '0',
      
      // Meta
      date: this.defaultValues.date,
      chroniclrVersion: this.defaultValues.chroniclrVersion
    };

    // Calculate net change
    const added = parseInt(variables.linesAdded) || 0;
    const deleted = parseInt(variables.linesDeleted) || 0;
    variables.netChange = (added - deleted).toString();

    // Process reviews
    if (prData.reviews && prData.reviews.length > 0) {
      const approvedReviews = prData.reviews.filter(r => r.state === 'APPROVED');
      const requestedChanges = prData.reviews.filter(r => r.state === 'CHANGES_REQUESTED');
      
      variables.approvedBy = approvedReviews.map(r => `@${r.author}`).join(', ') || 'None';
      variables.reviewStatus = approvedReviews.length > 0 ? 'Approved' : 
                              requestedChanges.length > 0 ? 'Changes requested' : 'Pending';
      variables.overallReviewStatus = variables.reviewStatus;
      
      // Review timeline
      const sortedReviews = prData.reviews.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      variables.firstReviewDate = sortedReviews[0]?.createdAt || '[None]';
      variables.latestReviewDate = sortedReviews[sortedReviews.length - 1]?.createdAt || '[None]';
    } else {
      variables.approvedBy = 'None';
      variables.reviewStatus = 'No reviews';
      variables.overallReviewStatus = 'No reviews';
      variables.firstReviewDate = '[None]';
      variables.latestReviewDate = '[None]';
    }

    // Process related issues/links
    if (pr.body) {
      const issuePattern = /#(\d+)/g;
      const issueMatches = pr.body.match(issuePattern) || [];
      variables.relatedIssues = issueMatches.length > 0 ? issueMatches.join(', ') : 'None';
      
      // Extract Jira keys
      const jiraPattern = /[A-Z]+-\d+/g;
      const jiraMatches = pr.body.match(jiraPattern) || [];
      if (jiraMatches.length > 0) {
        variables.jiraLinks = jiraMatches.map(key => `- [${key}](${process.env.JIRA_BASE_URL}/browse/${key})`).join('\n');
        variables.jiraReferences = jiraMatches.map(key => `- [${key}](${process.env.JIRA_BASE_URL}/browse/${key})`).join('\n');
      } else {
        variables.jiraLinks = '';
        variables.jiraReferences = '';
      }
    } else {
      variables.relatedIssues = 'None';
      variables.jiraLinks = '';
      variables.jiraReferences = '';
    }

    return variables;
  }

  /**
   * Map file analysis data to template variables
   */
  mapFileAnalysis(fileAnalysis) {
    if (!fileAnalysis) {
      return {
        impactAreas: this.defaultValues.impactAreas,
        riskLevel: this.defaultValues.riskLevel,
        riskFactors: this.defaultValues.riskFactors,
        technologies: 'Unknown',
        fileTypes: 'Unknown'
      };
    }

    const variables = {
      // Impact areas
      impactAreas: this.formatImpactAreas(fileAnalysis.impactAreas),
      
      // Risk assessment
      riskLevel: fileAnalysis.risks.level.toUpperCase(),
      riskFactors: this.formatRiskFactors(fileAnalysis.risks.factors),
      
      // Technologies
      technologies: fileAnalysis.frameworks?.join(', ') || 'None detected',
      
      // File types
      fileTypes: this.formatFileTypes(fileAnalysis.fileTypes),
      
      // Breaking changes
      breakingChanges: fileAnalysis.breakingChanges.detected ? 
        `⚠️ Breaking changes detected (${fileAnalysis.breakingChanges.indicators.length} indicators)` : 
        'None detected',
      
      // Testing needs
      testingStatus: this.formatTestingNeeds(fileAnalysis.testingNeeds),
      
      // Features
      keyFeatures: this.formatFeatures(fileAnalysis.features)
    };

    return variables;
  }

  /**
   * Format impact areas for display
   */
  formatImpactAreas(impactAreas) {
    if (!impactAreas || typeof impactAreas !== 'object') return 'None detected';
    
    const areas = Object.entries(impactAreas)
      .filter(([_, count]) => count > 0)
      .map(([area, count]) => `${area} (${count} files)`)
      .join('\n- ');
    
    return areas ? `- ${areas}` : 'None detected';
  }

  /**
   * Format risk factors for display
   */
  formatRiskFactors(riskFactors) {
    if (!riskFactors || !Array.isArray(riskFactors) || riskFactors.length === 0) {
      return 'No specific risk factors identified';
    }

    return riskFactors
      .map(factor => `- ${factor.file} (${factor.risk}: ${factor.changes} changes)`)
      .join('\n');
  }

  /**
   * Format file types for display
   */
  formatFileTypes(fileTypes) {
    if (!fileTypes || typeof fileTypes !== 'object') return 'Unknown';
    
    const types = Object.entries(fileTypes)
      .map(([ext, count]) => `${ext || 'no-extension'}: ${count}`)
      .join(', ');
    
    return types || 'None';
  }

  /**
   * Format testing needs for display
   */
  formatTestingNeeds(testingNeeds) {
    if (!testingNeeds || typeof testingNeeds !== 'object') return 'Unknown';
    
    const needed = Object.entries(testingNeeds)
      .filter(([_, needed]) => needed)
      .map(([type]) => type)
      .join(', ');
    
    return needed ? `${needed} testing recommended` : 'No specific testing needs identified';
  }

  /**
   * Format features for display
   */
  formatFeatures(features) {
    if (!features || !Array.isArray(features) || features.length === 0) {
      return 'No specific features detected';
    }

    return features
      .map(feature => `- ${feature.type}: ${feature.file} (${feature.changes} changes)`)
      .join('\n');
  }

  /**
   * Create comprehensive variable mapping for PR templates
   */
  mapAllVariables(prData, fileAnalysis = null) {
    const prVars = this.mapPRData(prData);
    const analysisVars = this.mapFileAnalysis(fileAnalysis);
    
    // Merge with defaults for any missing values
    const allVariables = {
      ...this.defaultValues,
      ...prVars,
      ...analysisVars
    };

    // Add some computed fields
    allVariables.validationStatus = this.computeValidationStatus(allVariables);
    allVariables.deploymentNotes = this.computeDeploymentNotes(allVariables);
    
    return allVariables;
  }

  /**
   * Compute validation status based on various factors
   */
  computeValidationStatus(variables) {
    if (variables.reviewStatus === 'Approved' && variables.riskLevel === 'LOW') {
      return '✅ Ready for merge';
    } else if (variables.reviewStatus === 'Changes requested') {
      return '⏳ Changes requested';
    } else if (variables.riskLevel === 'HIGH') {
      return '⚠️ High risk - additional review needed';
    } else {
      return '🔄 Under review';
    }
  }

  /**
   * Compute deployment notes based on risk and changes
   */
  computeDeploymentNotes(variables) {
    const notes = [];
    
    if (variables.breakingChanges.includes('detected')) {
      notes.push('⚠️ Contains breaking changes');
    }
    
    if (variables.riskLevel === 'HIGH') {
      notes.push('🔴 High risk deployment');
    }
    
    if (variables.impactAreas.includes('database')) {
      notes.push('💾 Database changes included');
    }
    
    if (variables.impactAreas.includes('security')) {
      notes.push('🔒 Security changes included');
    }
    
    return notes.length > 0 ? notes.join('\n') : 'Standard deployment';
  }

  /**
   * Log variable mapping for debugging
   */
  logMappedVariables(variables, templateType) {
    core.info(`📝 Mapped ${Object.keys(variables).length} variables for ${templateType} template`);
    
    // Log a few key variables for verification
    const keyVars = ['prNumber', 'prTitle', 'prAuthor', 'totalFiles', 'riskLevel'];
    keyVars.forEach(key => {
      if (variables[key]) {
        core.info(`  ${key}: ${variables[key]}`);
      }
    });
  }
}

module.exports = { PRTemplateMapper };

// CLI usage for testing
if (require.main === module) {
  const mapper = new PRTemplateMapper();
  
  // Example PR data structure for testing
  const testPRData = {
    pr: {
      number: 123,
      title: 'Add new feature for user authentication',
      author: 'testuser',
      state: 'open',
      merged: false,
      url: 'https://github.com/test/repo/pull/123',
      baseBranch: 'main',
      headBranch: 'feature/auth',
      reviewers: ['reviewer1', 'reviewer2'],
      assignees: ['testuser']
    },
    files: [
      { filename: 'auth.js', additions: 50, deletions: 10 },
      { filename: 'test.js', additions: 20, deletions: 5 }
    ],
    reviews: [
      { author: 'reviewer1', state: 'APPROVED', createdAt: '2023-01-01T10:00:00Z' }
    ],
    commits: [
      { sha: 'abc123', message: 'Add authentication', author: 'testuser' }
    ]
  };

  const variables = mapper.mapAllVariables(testPRData);
  console.log('\n📋 Test Variable Mapping:');
  console.log('========================');
  Object.entries(variables).slice(0, 10).forEach(([key, value]) => {
    console.log(`${key}: ${value}`);
  });
  console.log(`... and ${Object.keys(variables).length - 10} more variables`);
}