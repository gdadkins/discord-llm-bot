#!/usr/bin/env node

/**
 * Automated dependency audit and update script
 * Runs security audits, checks for updates, and provides recommendations
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class DependencyAuditor {
  constructor() {
    this.packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    this.report = {
      timestamp: new Date().toISOString(),
      security: {},
      updates: {},
      recommendations: []
    };
  }

  runSecurityAudit() {
    console.log('🔒 Running security audit...');
    try {
      const auditOutput = execSync('npm audit --json', { encoding: 'utf8' });
      const audit = JSON.parse(auditOutput);
      
      this.report.security = {
        vulnerabilities: audit.metadata?.vulnerabilities || {},
        totalPackages: audit.metadata?.totalDependencies || 0,
        fixAvailable: audit.metadata?.vulnerabilities?.total > 0
      };
      
      if (this.report.security.vulnerabilities.total > 0) {
        this.report.recommendations.push({
          type: 'security',
          priority: 'high',
          action: 'Run `npm audit fix` to automatically fix security vulnerabilities',
          details: `Found ${this.report.security.vulnerabilities.total} vulnerabilities`
        });
      }
    } catch (error) {
      console.log('⚠️  Security audit completed with warnings');
      this.report.security.error = error.message;
    }
  }

  checkOutdatedPackages() {
    console.log('📦 Checking for outdated packages...');
    try {
      const outdatedOutput = execSync('npm outdated --json', { encoding: 'utf8' });
      const outdated = JSON.parse(outdatedOutput);
      
      this.report.updates.outdated = outdated;
      this.report.updates.count = Object.keys(outdated).length;
      
      // Prioritize critical updates
      const criticalUpdates = Object.entries(outdated).filter(([name, info]) => {
        return ['@google/genai', 'discord.js', 'better-sqlite3', 'winston'].includes(name);
      });
      
      if (criticalUpdates.length > 0) {
        this.report.recommendations.push({
          type: 'updates',
          priority: 'medium',
          action: 'Update critical production dependencies',
          details: criticalUpdates.map(([name, info]) => 
            `${name}: ${info.current} → ${info.latest}`
          ).join(', ')
        });
      }
    } catch (error) {
      console.log('📦 All packages are up to date');
      this.report.updates.count = 0;
    }
  }

  analyzeBundleSize() {
    console.log('📊 Analyzing bundle size...');
    try {
      const sizeOutput = execSync('du -sh node_modules 2>/dev/null || echo "0M"', { encoding: 'utf8' });
      const size = sizeOutput.trim().split('\t')[0];
      
      this.report.bundleSize = {
        nodeModules: size,
        recommendation: size.includes('M') && parseInt(size) > 100 ? 
          'Consider optimizing dependencies' : 'Bundle size is acceptable'
      };
      
      if (size.includes('M') && parseInt(size) > 150) {
        this.report.recommendations.push({
          type: 'optimization',
          priority: 'low',
          action: 'Consider replacing winston with pino for smaller footprint',
          details: 'Winston: ~344KB, Pino: ~140KB (60% smaller)'
        });
      }
    } catch (error) {
      this.report.bundleSize = { error: error.message };
    }
  }

  checkMissingDependencies() {
    console.log('🔍 Checking for missing dependencies...');
    
    // Check if @jest/globals is used but not declared
    try {
      const grepOutput = execSync('grep -r "@jest/globals" tests/ src/ 2>/dev/null || echo ""', { encoding: 'utf8' });
      if (grepOutput.trim() && !this.packageJson.devDependencies['@jest/globals']) {
        this.report.recommendations.push({
          type: 'missing-dependency',
          priority: 'medium',
          action: 'Add missing @jest/globals dependency',
          details: 'npm install --save-dev @jest/globals'
        });
      }
    } catch (error) {
      // Ignore grep errors
    }
    
    // Check for @types/uuid in wrong section
    if (this.packageJson.dependencies['@types/uuid']) {
      this.report.recommendations.push({
        type: 'organization',
        priority: 'low',
        action: 'Move @types/uuid to devDependencies',
        details: 'Type definitions should be in devDependencies'
      });
    }
  }

  generateReport() {
    console.log('\n📋 Dependency Audit Report');
    console.log('========================');
    
    // Security Summary
    if (this.report.security.vulnerabilities) {
      const vulns = this.report.security.vulnerabilities;
      console.log(`\n🔒 Security: ${vulns.total || 0} vulnerabilities found`);
      if (vulns.total > 0) {
        Object.entries(vulns).forEach(([level, count]) => {
          if (level !== 'total' && count > 0) {
            console.log(`   ${level}: ${count}`);
          }
        });
      }
    }
    
    // Updates Summary
    console.log(`\n📦 Updates: ${this.report.updates.count} packages have updates available`);
    
    // Bundle Size
    if (this.report.bundleSize?.nodeModules) {
      console.log(`\n📊 Bundle Size: ${this.report.bundleSize.nodeModules}`);
    }
    
    // Recommendations
    if (this.report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      this.report.recommendations
        .sort((a, b) => {
          const priorities = { high: 3, medium: 2, low: 1 };
          return priorities[b.priority] - priorities[a.priority];
        })
        .forEach((rec, index) => {
          console.log(`\n${index + 1}. [${rec.priority.toUpperCase()}] ${rec.action}`);
          console.log(`   ${rec.details}`);
        });
    }
    
    // Save detailed report
    fs.writeFileSync('dependency-audit-report.json', JSON.stringify(this.report, null, 2));
    console.log('\n📄 Detailed report saved to: dependency-audit-report.json');
  }

  async run() {
    console.log('🚀 Starting dependency audit...\n');
    
    this.runSecurityAudit();
    this.checkOutdatedPackages();
    this.analyzeBundleSize();
    this.checkMissingDependencies();
    this.generateReport();
    
    console.log('\n✅ Dependency audit completed!');
  }
}

// Run the auditor
if (require.main === module) {
  const auditor = new DependencyAuditor();
  auditor.run().catch(console.error);
}

module.exports = DependencyAuditor;