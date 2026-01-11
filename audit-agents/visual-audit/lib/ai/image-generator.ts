/**
 * AI Image Generator
 * Supports multiple image generation backends
 */

import { GeminiClient } from '../gemini/client'

export interface GeneratedImage {
  url: string
  source: 'imagen' | 'gemini' | 'unsplash' | 'fallback'
  prompt: string
  metadata?: {
    model?: string
    seed?: number
    guidanceScale?: number
  }
}

export class ImageGenerator {
  /**
   * Generate image using Vertex AI Imagen API
   */
  async generateWithImagen(prompt: string): Promise<GeneratedImage | null> {
    try {
      const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID
      const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
      const accessToken = process.env.GOOGLE_CLOUD_ACCESS_TOKEN

      if (!projectId && !accessToken) {
        console.warn('Imagen API: Missing GOOGLE_CLOUD_PROJECT_ID or GOOGLE_CLOUD_ACCESS_TOKEN')
        return null
      }

      const apiUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/imagegeneration@006:predict`
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : '',
        },
        body: JSON.stringify({
          instances: [{
            prompt: prompt
          }],
          parameters: {
            sampleCount: 1,
            aspectRatio: '16:9',
            negativePrompt: 'blurry, low quality, distorted, watermark, text'
          }
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Imagen API error:', errorText)
        return null
      }

      const data = await response.json()
      
      if (data.predictions && data.predictions.length > 0) {
        return {
          url: data.predictions[0].bytesBase64Encoded 
            ? `data:image/png;base64,${data.predictions[0].bytesBase64Encoded}`
            : data.predictions[0].imageUri || '',
          source: 'imagen',
          prompt,
          metadata: {
            model: 'imagegeneration@006'
          }
        }
      }

      return null
    } catch (error) {
      console.error('Failed to generate image with Imagen:', error)
      return null
    }
  }

  /**
   * Generate image with full fallback chain
   */
  async generateWithFullFallback(
    prompt: string,
    keywords: string[],
    googleImageUrl?: string,
    unsplashImageUrl?: string,
    context?: string
  ): Promise<GeneratedImage> {
    if (googleImageUrl) {
      return {
        url: googleImageUrl,
        source: 'unsplash',
        prompt,
      }
    }

    if (unsplashImageUrl) {
      return {
        url: unsplashImageUrl,
        source: 'unsplash',
        prompt,
      }
    }

    const aiResult = await this.generateWithImagen(prompt)
    if (aiResult) {
      return aiResult
    }

    return {
      url: `https://images.unsplash.com/photo-1520975916090-3105956dac38?w=1200&h=800&fit=crop&q=80`,
      source: 'fallback',
      prompt,
    }
  }
}

