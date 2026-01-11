/**
 * Google Gemini API Client
 * For generating content using AI
 */

import { GoogleGenerativeAI } from '@google/generative-ai'

export interface GeminiConfig {
  apiKey: string
  model?: string
}

export class GeminiClient {
  private genAI: GoogleGenerativeAI
  private model: string

  constructor(config: GeminiConfig) {
    this.genAI = new GoogleGenerativeAI(config.apiKey)
    this.model = config.model || 'gemini-2.0-flash-exp'
  }

  /**
   * Generate text content using Gemini
   */
  async generateText(prompt: string): Promise<string> {
    try {
      const model = this.genAI.getGenerativeModel({ model: this.model })
      const result = await model.generateContent(prompt)
      const response = result.response
      return response.text()
    } catch (error) {
      console.error('Gemini API error:', error)
      throw new Error(`Failed to generate content: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

