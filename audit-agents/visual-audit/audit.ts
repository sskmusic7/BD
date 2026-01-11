#!/usr/bin/env ts-node
/**
 * Visual Audit Agent
 * Audits all images on your site using Google Image Search + Vision API
 * 
 * Usage:
 *   ts-node audit.ts
 *   ts-node audit.ts --config ./config.json
 */

import { VisualAuditor } from './lib/visual-auditor/auditor'
import { SiteImageScanner } from './lib/visual-auditor/site-scanner'
import { readFileSync, writeFileSync } from 'fs'

interface AuditConfig {
  dataDir?: string
  blogPostsPath?: string
  productsPath?: string
  configPath?: string
  customImages?: Array<{
    id: string
    type: string
    title: string
    imageUrl: string
    page?: string
    component?: string
    context?: string
  }>
  outputPath?: string
}

async function runAudit() {
  console.log('\n🔍 VISUAL AUDIT - Image Quality Checker')
  console.log('=========================================\n')

  // Load config
  const configPath = process.argv.find(arg => arg.startsWith('--config'))?.split('=')[1] || './audit-config.json'
  let config: AuditConfig = {}

  try {
    if (require('fs').existsSync(configPath)) {
      config = JSON.parse(readFileSync(configPath, 'utf-8'))
    }
  } catch (error) {
    console.warn(`⚠️  Config file not found: ${configPath}. Using defaults.`)
  }

  // Initialize scanner
  const scanner = new SiteImageScanner(config.dataDir)
  
  // Scan site for images
  console.log('📸 Scanning site for images...')
  const images = scanner.scanEntireSite({
    blogPostsPath: config.blogPostsPath,
    productsPath: config.productsPath,
    configPath: config.configPath,
    customImages: config.customImages as any
  })

  console.log(`   Found ${images.length} images`)
  console.log('   Image counts by type:', scanner.getImageCounts(images))

  // Initialize auditor
  const auditor = new VisualAuditor({
    dataDir: config.dataDir
  })

  // Run audit
  console.log('\n🔍 Running visual audit...')
  const summary = await auditor.runFullAudit(images)

  // Print results
  console.log('\n=========================================')
  console.log('📊 AUDIT SUMMARY')
  console.log('=========================================')
  console.log(`Total Images Audited: ${summary.totalAudited}`)
  console.log(`Needs Correction: ${summary.needsCorrection}`)
  console.log('=========================================\n')

  // Save results
  const outputPath = config.outputPath || './audit-results.json'
  writeFileSync(outputPath, JSON.stringify({
    summary,
    results: summary.results
  }, null, 2))

  console.log(`✅ Results saved to: ${outputPath}`)

  // Show images that need correction
  if (summary.needsCorrection > 0) {
    console.log('\n⚠️  Images needing correction:')
    summary.results
      .filter(r => r.suggestedImage)
      .forEach(r => {
        console.log(`   • ${r.title} (${r.type})`)
        console.log(`     Current: ${r.currentImage.substring(0, 60)}...`)
        console.log(`     Suggested: ${r.suggestedImage?.substring(0, 60)}...`)
      })
  }

  process.exit(summary.needsCorrection > 0 ? 1 : 0)
}

runAudit().catch(err => {
  console.error('Audit failed:', err)
  process.exit(1)
})

