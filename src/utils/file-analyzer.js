#!/usr/bin/env node

/**
 * File Change Analysis Engine for Chroniclr
 * Analyzes code changes for intelligent documentation updates
 */

const core = require('@actions/core');
const path = require('path');

class FileAnalyzer {
  constructor() {
    this.patterns = this.initializePatterns();
  }

  initializePatterns() {
    return {
      // Component/Framework Detection
      frameworks: {
        react: /\.(jsx|tsx)$|react|component/i,
        vue: /\.vue$|vue|@vue/i,
        angular: /\.component\.|\.service\.|angular|@angular/i,
        nodejs: /package\.json|server\.|express|fastify/i,
        python: /\.py$|requirements\.txt|setup\.py/i,
        java: /\.java$|pom\.xml|build\.gradle/i,
        dotnet: /\.cs$|\.csproj|\.sln/i
      },

      // Impact Area Detection
      impactAreas: {
        frontend: /src\/.*\.(jsx?|tsx?|vue|html|css|scss|less)$|client|ui|components/i,
        backend: /src\/.*\.(py|java|cs|rb|go|rs)$|server|api|service|controller/i,
        database: /migrations?|schema|\.sql$|models?|entities/i,
        api: /api|endpoint|route|controller|graphql/i,
        tests: /test|spec|__tests__|\.test\.|\.spec\./i,
        documentation: /\.md$|docs?|readme|changelog/i,
        configuration: /config|\.json$|\.ya?ml$|\.toml$|\.ini$|dockerfile/i,
        infrastructure: /terraform|ansible|kubernetes|docker|\.tf$|\.yml$/i,
        security: /auth|security|permission|token|encrypt|ssl|tls/i,
        performance: /cache|optimize|performance|benchmark|metrics/i
      },

      // Breaking Change Indicators
      breakingChanges: [
        /BREAKING\s*CHANGE/i,
        /breaking:/i,
        /major:/i,
        /removed?.*deprecated/i,
        /deleted?.*api/i,
        /changed?.*signature/i,
        /incompatible/i
      ],

      // Feature Detection
      features: {
        newFeature: /feat:|feature:|new.*feature|add.*feature/i,
        bugFix: /fix:|bug:|hotfix:|patch:/i,
        enhancement: /enhance:|improve:|refactor:|optimize:/i,
        security: /security:|sec:|vulnerability|cve-/i,
        performance: /perf:|performance:|optimize:|speed/i,
        documentation: /docs?:|documentation:|readme/i,
        testing: /test:|spec:|coverage/i,
        configuration: /config:|configure:|settings/i
      },

      // Risk Indicators
      risks: {
        highRisk: /core|critical|main|index|app\.|root|base/i,
        mediumRisk: /service|controller|manager|handler/i,
        dataRisk: /migration|schema|model|database/i,
        apiRisk: /endpoint|route|api|graphql/i,
        securityRisk: /auth|security|permission|token|password/i
      }
    };
  }

  /**
   * Analyze file changes comprehensively
   */
  analyzeChanges(files, prData = null) {
    const analysis = {
      summary: {
        totalFiles: files.length,
        totalAdditions: files.reduce((sum, f) => sum + (f.additions || 0), 0),
        totalDeletions: files.reduce((sum, f) => sum + (f.deletions || 0), 0),
        netChanges: 0
      },
      fileTypes: {},
      frameworks: new Set(),
      impactAreas: {},
      features: [],
      risks: {
        level: 'low',
        factors: []
      },
      breakingChanges: {
        detected: false,
        indicators: []
      },
      documentationNeeds: {
        api: false,
        userGuide: false,
        technical: false,
        migration: false,
        security: false
      },
      stakeholderImpact: {
        developers: false,
        users: false,
        operations: false,
        security: false,
        management: false
      },
      testingNeeds: {
        unit: false,
        integration: false,
        e2e: false,
        performance: false,
        security: false
      }
    };

    analysis.summary.netChanges = analysis.summary.totalAdditions - analysis.summary.totalDeletions;

    // Analyze each file
    files.forEach(file => {
      this.analyzeFile(file, analysis);
    });

    // Finalize analysis
    this.finalizeAnalysis(analysis, prData);

    return analysis;
  }

  /**
   * Analyze individual file changes
   */
  analyzeFile(file, analysis) {
    const filename = file.filename;
    const ext = path.extname(filename);
    const content = file.patch || '';

    // Track file types
    analysis.fileTypes[ext] = (analysis.fileTypes[ext] || 0) + 1;

    // Detect frameworks
    Object.entries(this.patterns.frameworks).forEach(([framework, pattern]) => {
      if (pattern.test(filename)) {
        analysis.frameworks.add(framework);
      }
    });

    // Analyze impact areas
    Object.entries(this.patterns.impactAreas).forEach(([area, pattern]) => {
      if (pattern.test(filename)) {
        analysis.impactAreas[area] = (analysis.impactAreas[area] || 0) + 1;
      }
    });

    // Detect breaking changes
    this.patterns.breakingChanges.forEach(pattern => {
      if (pattern.test(content) || pattern.test(filename)) {
        analysis.breakingChanges.detected = true;
        analysis.breakingChanges.indicators.push({
          file: filename,
          type: 'breaking_change',
          pattern: pattern.source
        });
      }
    });

    // Analyze features and changes
    Object.entries(this.patterns.features).forEach(([feature, pattern]) => {
      if (pattern.test(content) || pattern.test(filename)) {
        if (!analysis.features.some(f => f.type === feature && f.file === filename)) {
          analysis.features.push({
            type: feature,
            file: filename,
            changes: file.changes || 0
          });
        }
      }
    });

    // Assess risks
    Object.entries(this.patterns.risks).forEach(([risk, pattern]) => {
      if (pattern.test(filename)) {
        analysis.risks.factors.push({
          file: filename,
          risk: risk,
          changes: file.changes || 0
        });
      }
    });
  }

  /**
   * Finalize analysis with cross-cutting assessments
   */
  finalizeAnalysis(analysis, prData) {
    // Determine overall risk level
    const riskFactors = analysis.risks.factors;
    const highRiskFiles = riskFactors.filter(r => r.risk === 'highRisk').length;
    const totalChanges = analysis.summary.totalAdditions + analysis.summary.totalDeletions;

    if (highRiskFiles > 0 || totalChanges > 1000 || analysis.breakingChanges.detected) {
      analysis.risks.level = 'high';
    } else if (riskFactors.length > 3 || totalChanges > 300) {
      analysis.risks.level = 'medium';
    }

    // Determine documentation needs
    if (analysis.impactAreas.api || analysis.features.some(f => f.type === 'newFeature')) {
      analysis.documentationNeeds.api = true;
    }
    if (analysis.impactAreas.frontend || analysis.features.some(f => f.type === 'newFeature')) {
      analysis.documentationNeeds.userGuide = true;
    }
    if (analysis.impactAreas.backend || analysis.impactAreas.infrastructure) {
      analysis.documentationNeeds.technical = true;
    }
    if (analysis.breakingChanges.detected) {
      analysis.documentationNeeds.migration = true;
    }
    if (analysis.impactAreas.security || analysis.features.some(f => f.type === 'security')) {
      analysis.documentationNeeds.security = true;
    }

    // Determine stakeholder impact
    if (analysis.impactAreas.backend || analysis.impactAreas.api) {
      analysis.stakeholderImpact.developers = true;
    }
    if (analysis.impactAreas.frontend || analysis.features.some(f => f.type === 'newFeature')) {
      analysis.stakeholderImpact.users = true;
    }
    if (analysis.impactAreas.infrastructure || analysis.impactAreas.configuration) {
      analysis.stakeholderImpact.operations = true;
    }
    if (analysis.impactAreas.security || analysis.features.some(f => f.type === 'security')) {
      analysis.stakeholderImpact.security = true;
    }
    if (analysis.breakingChanges.detected || analysis.risks.level === 'high') {
      analysis.stakeholderImpact.management = true;
    }

    // Determine testing needs
    if (analysis.impactAreas.backend || analysis.impactAreas.api) {
      analysis.testingNeeds.unit = true;
      analysis.testingNeeds.integration = true;
    }
    if (analysis.impactAreas.frontend) {
      analysis.testingNeeds.e2e = true;
    }
    if (analysis.features.some(f => f.type === 'performance') || analysis.summary.totalFiles > 20) {
      analysis.testingNeeds.performance = true;
    }
    if (analysis.impactAreas.security || analysis.features.some(f => f.type === 'security')) {
      analysis.testingNeeds.security = true;
    }

    // Convert frameworks Set to Array for serialization
    analysis.frameworks = Array.from(analysis.frameworks);
  }

  /**
   * Generate human-readable analysis summary
   */
  generateSummary(analysis) {
    const summary = [];

    // Overview
    summary.push(`📊 **Change Overview**: ${analysis.summary.totalFiles} files changed (+${analysis.summary.totalAdditions}/-${analysis.summary.totalDeletions})`);

    // Impact areas
    const impactAreas = Object.entries(analysis.impactAreas)
      .filter(([_, count]) => count > 0)
      .map(([area, count]) => `${area} (${count})`)
      .join(', ');
    
    if (impactAreas) {
      summary.push(`🎯 **Impact Areas**: ${impactAreas}`);
    }

    // Frameworks
    if (analysis.frameworks.length > 0) {
      summary.push(`🛠️ **Technologies**: ${analysis.frameworks.join(', ')}`);
    }

    // Risk level
    const riskEmoji = {
      low: '🟢',
      medium: '🟡', 
      high: '🔴'
    }[analysis.risks.level];
    summary.push(`${riskEmoji} **Risk Level**: ${analysis.risks.level.toUpperCase()}`);

    // Breaking changes
    if (analysis.breakingChanges.detected) {
      summary.push(`⚠️ **Breaking Changes Detected**: ${analysis.breakingChanges.indicators.length} indicators`);
    }

    // Documentation needs
    const docNeeds = Object.entries(analysis.documentationNeeds)
      .filter(([_, needed]) => needed)
      .map(([type]) => type)
      .join(', ');
    
    if (docNeeds) {
      summary.push(`📚 **Documentation Updates Needed**: ${docNeeds}`);
    }

    // Stakeholder notifications
    const stakeholders = Object.entries(analysis.stakeholderImpact)
      .filter(([_, impacted]) => impacted)
      .map(([stakeholder]) => stakeholder)
      .join(', ');
    
    if (stakeholders) {
      summary.push(`👥 **Notify Stakeholders**: ${stakeholders}`);
    }

    return summary.join('\n');
  }

  /**
   * Identify related documentation files that need updates
   */
  identifyRelatedDocs(analysis, existingDocs = []) {
    const relatedDocs = [];

    // API documentation
    if (analysis.documentationNeeds.api) {
      relatedDocs.push('API.md', 'api-reference.md', 'endpoints.md');
    }

    // User guides
    if (analysis.documentationNeeds.userGuide) {
      relatedDocs.push('README.md', 'user-guide.md', 'getting-started.md');
    }

    // Technical documentation
    if (analysis.documentationNeeds.technical) {
      relatedDocs.push('ARCHITECTURE.md', 'deployment.md', 'technical-guide.md');
    }

    // Migration guides
    if (analysis.documentationNeeds.migration) {
      relatedDocs.push('MIGRATION.md', 'CHANGELOG.md', 'breaking-changes.md');
    }

    // Security documentation
    if (analysis.documentationNeeds.security) {
      relatedDocs.push('SECURITY.md', 'auth-guide.md', 'security-policy.md');
    }

    // Filter to only existing documents
    const existingRelated = relatedDocs.filter(doc => 
      existingDocs.some(existing => 
        existing.toLowerCase().includes(doc.toLowerCase()) ||
        doc.toLowerCase().includes(existing.toLowerCase())
      )
    );

    return {
      recommended: relatedDocs,
      existing: existingRelated
    };
  }

  /**
   * Generate testing recommendations based on changes
   */
  generateTestingRecommendations(analysis) {
    const recommendations = [];

    if (analysis.testingNeeds.unit) {
      recommendations.push('Add unit tests for modified backend components');
    }
    if (analysis.testingNeeds.integration) {
      recommendations.push('Run integration tests for API changes');
    }
    if (analysis.testingNeeds.e2e) {
      recommendations.push('Execute end-to-end tests for UI modifications');
    }
    if (analysis.testingNeeds.performance) {
      recommendations.push('Conduct performance testing for large changes');
    }
    if (analysis.testingNeeds.security) {
      recommendations.push('Perform security testing for auth/security changes');
    }

    return recommendations;
  }

  /**
   * Predict documentation effort based on change complexity
   */
  estimateDocumentationEffort(analysis) {
    let effort = 0;
    let factors = [];

    // Base effort on file count and changes
    effort += Math.min(analysis.summary.totalFiles * 0.5, 10);
    effort += Math.min((analysis.summary.totalAdditions + analysis.summary.totalDeletions) / 100, 15);

    // Impact area multipliers
    Object.entries(analysis.impactAreas).forEach(([area, count]) => {
      const multipliers = {
        api: 3,
        frontend: 2,
        backend: 2,
        security: 4,
        infrastructure: 2,
        documentation: 1
      };
      
      if (multipliers[area]) {
        effort += count * multipliers[area];
        factors.push(`${area} changes (+${count * multipliers[area]}h)`);
      }
    });

    // Breaking changes add significant effort
    if (analysis.breakingChanges.detected) {
      effort += 8;
      factors.push('breaking changes (+8h)');
    }

    // Risk level adjustments
    const riskMultipliers = { low: 1, medium: 1.5, high: 2 };
    effort *= riskMultipliers[analysis.risks.level];

    return {
      estimatedHours: Math.ceil(effort),
      factors,
      complexity: effort > 20 ? 'high' : effort > 10 ? 'medium' : 'low'
    };
  }
}

module.exports = { FileAnalyzer };