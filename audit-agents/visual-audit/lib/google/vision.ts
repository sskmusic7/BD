/**
 * Google Cloud Vision API Client
 * For analyzing image content using OCR and label detection
 */

interface VisionAnnotation {
  description: string
  score: number
  topicality?: number
}

interface VisionResponse {
  responses: Array<{
    labelAnnotations?: VisionAnnotation[]
    textAnnotations?: Array<{
      description: string
      boundingPoly?: any
    }>
    error?: {
      code: number
      message: string
    }
  }>
}

export class GoogleVisionClient {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  /**
   * Analyze an image URL to extract labels (what's in the image)
   */
  async analyzeImageLabels(imageUrl: string): Promise<string[]> {
    try {
      const url = `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [{
            image: {
              source: {
                imageUri: imageUrl
              }
            },
            features: [
              {
                type: 'LABEL_DETECTION',
                maxResults: 10
              }
            ]
          }]
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Google Vision API error:', errorText)
        return []
      }

      const data: VisionResponse = await response.json()
      
      if (data.responses[0]?.error) {
        console.error('Vision API error:', data.responses[0].error)
        return []
      }

      const labels = data.responses[0]?.labelAnnotations || []
      
      return labels
        .filter(label => label.score > 0.7)
        .map(label => label.description)
    } catch (error) {
      console.error('Failed to analyze image with Vision API:', error)
      return []
    }
  }

  /**
   * Extract text from an image using OCR
   */
  async extractTextFromImage(imageUrl: string): Promise<string> {
    try {
      const url = `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [{
            image: {
              source: {
                imageUri: imageUrl
              }
            },
            features: [
              {
                type: 'TEXT_DETECTION',
                maxResults: 1
              }
            ]
          }]
        })
      })

      if (!response.ok) {
        return ''
      }

      const data: VisionResponse = await response.json()
      
      if (data.responses[0]?.error || !data.responses[0]?.textAnnotations) {
        return ''
      }

      return data.responses[0].textAnnotations[0]?.description || ''
    } catch (error) {
      console.error('Failed to extract text with Vision API:', error)
      return ''
    }
  }
}

