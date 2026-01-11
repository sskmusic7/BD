/**
 * Visual Auditor
 * Audits images across the site and matches them with Google Image Search results
 * Post-processing: Google Image Search → Unsplash → AI Generation
 */

import { GoogleImageSearchClient } from '../google/image-search'
import { GoogleVisionClient } from '../google/vision'
import { UnsplashClient } from '../unsplash/client'
import { ImageGenerator } from '../ai/image-generator'
import { SiteImageScanner, SiteImage } from './site-scanner'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'

interface ImageAuditResult {
  id: string
  type: 'blog' | 'excursion' | 'activity' | 'homepage' | 'package' | 'testimonial' | 'page' | 'viator' | 'custom'
  title: string
  currentImage: string
  page?: string
  component?: string
  context?: string
  suggestedImage?: string
  suggestedImageSource?: 'google' | 'unsplash' | 'ai-generated'
  alternatives?: {
    google?: string
    unsplash?: string
    aiGenerated?: string
  }
  matchScore?: number
  keywords: string[]
  issue?: string
  labels?: string[]
  postProcessingStatus?: {
    googleChecked: boolean
    unsplashChecked: boolean
    aiGenerated: boolean
    finalSource: 'google' | 'unsplash' | 'ai-generated' | 'none'
  }
}

interface AuditSummary {
  totalAudited: number
  needsCorrection: number
  corrected: number
  results: ImageAuditResult[]
}

export class VisualAuditor {
  private imageSearchClient: GoogleImageSearchClient
  private visionClient: GoogleVisionClient | null
  private unsplashClient: UnsplashClient
  private imageGenerator: ImageGenerator
  private dataDir?: string

  constructor(options?: {
    dataDir?: string
    googleSearchApiKey?: string
    googleSearchEngineId?: string
    googleVisionApiKey?: string
    unsplashAccessKey?: string
  }) {
    // Initialize clients with environment variables or provided options
    const googleSearchApiKey = options?.googleSearchApiKey || process.env.GOOGLE_SEARCH_API_KEY
    const googleSearchEngineId = options?.googleSearchEngineId || process.env.GOOGLE_SEARCH_ENGINE_ID
    const googleVisionApiKey = options?.googleVisionApiKey || process.env.GOOGLE_VISION_API_KEY || process.env.GOOGLE_SEARCH_API_KEY
    const unsplashAccessKey = options?.unsplashAccessKey || process.env.UNSPLASH_ACCESS_KEY

    if (!googleSearchApiKey || !googleSearchEngineId) {
      throw new Error('GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID are required')
    }

    this.imageSearchClient = new GoogleImageSearchClient(googleSearchApiKey, googleSearchEngineId)
    this.visionClient = googleVisionApiKey ? new GoogleVisionClient(googleVisionApiKey) : null
    this.unsplashClient = new UnsplashClient(unsplashAccessKey || 'dummy-key')
    this.imageGenerator = new ImageGenerator()
    this.dataDir = options?.dataDir
  }

  /**
   * Extract keywords from content for image matching
   */
  private extractKeywords(title: string, content?: string, category?: string): string[] {
    const keywords: string[] = []
    
    // Add title words
    keywords.push(...title.toLowerCase().split(/\s+/).filter(word => word.length > 3))
    
    // Add category
    if (category) {
      keywords.push(category.toLowerCase())
    }
    
    // Extract key phrases from content
    if (content) {
      const contentLower = content.toLowerCase()
      
      // Add location-specific keywords (customize for your site)
      if (contentLower.includes('beach')) keywords.push('beach', 'ocean', 'water')
      if (contentLower.includes('mountain')) keywords.push('mountain', 'landscape', 'nature')
      if (contentLower.includes('city')) keywords.push('city', 'urban', 'skyline')
      // Add more keyword extraction logic as needed
    }
    
    // Remove duplicates and return
    return Array.from(new Set(keywords))
  }

  /**
   * Post-process image alternatives (3-tier system)
   */
  private async postProcessImageAlternatives(
    keywords: string[],
    title: string,
    googleImageUrl?: string
  ): Promise<{
    unsplash?: string
    aiGenerated?: string
    finalSource: 'google' | 'unsplash' | 'ai-generated' | 'none'
  }> {
    const alternatives: {
      unsplash?: string
      aiGenerated?: string
      finalSource: 'google' | 'unsplash' | 'ai-generated' | 'none'
    } = {
      finalSource: googleImageUrl ? 'google' : 'none'
    }

    // Tier 2: Check Unsplash
    try {
      const unsplashQuery = `${title} ${keywords.slice(0, 3).join(' ')}`
      const unsplashResults = await this.unsplashClient.searchPhotos(unsplashQuery, 3)
      
      if (unsplashResults.length > 0) {
        alternatives.unsplash = unsplashResults[0].regularUrl
        
        if (!googleImageUrl) {
          alternatives.finalSource = 'unsplash'
        }
      }
    } catch (error) {
      console.warn('Unsplash search failed:', error)
    }

    // Tier 3: AI Generation (only if no good alternatives found)
    if (!googleImageUrl && !alternatives.unsplash) {
      try {
        const prompt = `${title}, ${keywords.slice(0, 5).join(', ')}`
        
        const aiResult = await this.imageGenerator.generateWithFullFallback(
          prompt,
          keywords,
          googleImageUrl,
          alternatives.unsplash,
          title
        )
        
        if (aiResult && aiResult.source !== 'fallback') {
          alternatives.aiGenerated = aiResult.url
          alternatives.finalSource = 'ai-generated'
        }
      } catch (error) {
        console.warn('AI image generation failed:', error)
      }
    }

    return alternatives
  }

  /**
   * Audit a single image with post-processing
   */
  async auditImage(
    id: string,
    type: 'blog' | 'excursion' | 'activity' | 'homepage' | 'package' | 'testimonial' | 'page' | 'viator' | 'custom',
    title: string,
    currentImage: string,
    content?: string,
    category?: string,
    page?: string,
    component?: string,
    context?: string
  ): Promise<ImageAuditResult> {
    // Extract keywords for search
    const keywords = this.extractKeywords(title, content, category)
    const searchQuery = `${title} ${keywords.slice(0, 3).join(' ')}`
    
    // Tier 1: Get Google Image Search results
    const searchResults = await this.imageSearchClient.searchImages(searchQuery, 5)
    const googleImageUrl = searchResults.length > 0 ? searchResults[0]?.link : undefined

    // Analyze current image labels (if Vision API available)
    let currentLabels: string[] = []
    let matchScore = 0
    
    if (this.visionClient && currentImage) {
      try {
        currentLabels = await this.visionClient.analyzeImageLabels(currentImage)
        
        // Compare with top search result
        if (googleImageUrl) {
          const searchResultLabels = await this.visionClient.analyzeImageLabels(googleImageUrl)
          
          // Calculate match score
          const commonLabels = currentLabels.filter(l => 
            searchResultLabels.some(sl => sl.toLowerCase() === l.toLowerCase())
          )
          matchScore = commonLabels.length / Math.max(currentLabels.length, searchResultLabels.length, 1)
        }
      } catch (error) {
        console.warn('Vision API analysis failed, using basic matching:', error)
      }
    }

    // Determine if correction is needed (match score < 0.5 means poor match)
    const needsCorrection = matchScore < 0.5 || searchResults.length === 0

    // Post-processing: Get alternatives from Unsplash and AI
    const alternatives = needsCorrection 
      ? await this.postProcessImageAlternatives(keywords, title, googleImageUrl)
      : { finalSource: 'none' as const }

    // Determine best suggested image
    let suggestedImage: string | undefined
    let suggestedImageSource: 'google' | 'unsplash' | 'ai-generated' | undefined

    if (needsCorrection) {
      if (googleImageUrl) {
        suggestedImage = googleImageUrl
        suggestedImageSource = 'google'
      } else if (alternatives.unsplash) {
        suggestedImage = alternatives.unsplash
        suggestedImageSource = 'unsplash'
      } else if (alternatives.aiGenerated) {
        suggestedImage = alternatives.aiGenerated
        suggestedImageSource = 'ai-generated'
      }
    }
    
    return {
      id,
      type,
      title,
      currentImage,
      page,
      component,
      context,
      suggestedImage,
      suggestedImageSource,
      alternatives: needsCorrection ? alternatives : undefined,
      matchScore,
      keywords,
      issue: needsCorrection ? `Poor match (score: ${matchScore.toFixed(2)})` : undefined,
      labels: currentLabels.length > 0 ? currentLabels : undefined,
      postProcessingStatus: {
        googleChecked: true,
        unsplashChecked: needsCorrection,
        aiGenerated: !!alternatives.aiGenerated,
        finalSource: alternatives.finalSource
      }
    }
  }

  /**
   * Audit a list of images
   */
  async auditImages(images: SiteImage[]): Promise<ImageAuditResult[]> {
    const results: ImageAuditResult[] = []
    
    for (const image of images) {
      const result = await this.auditImage(
        image.id,
        image.type as any,
        image.title,
        image.imageUrl,
        image.context,
        image.component,
        image.page,
        image.component,
        image.context
      )
      results.push(result)
      
      // Rate limiting: wait between requests
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    return results
  }

  /**
   * Run full visual audit
   */
  async runFullAudit(images: SiteImage[]): Promise<AuditSummary> {
    console.log(`Starting visual audit for ${images.length} images...`)
    
    const results = await this.auditImages(images)
    const needsCorrection = results.filter(r => r.suggestedImage).length
    
    return {
      totalAudited: results.length,
      needsCorrection,
      corrected: 0,
      results
    }
  }
}

