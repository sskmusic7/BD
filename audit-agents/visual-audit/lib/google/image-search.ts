/**
 * Google Image Search Client
 * Uses Custom Search API with Image Search enabled
 */

interface GoogleImageResult {
  title: string
  link: string
  displayLink: string
  snippet: string
  mime: string
  image: {
    contextLink: string
    height: number
    width: number
    byteSize: number
    thumbnailLink: string
    thumbnailHeight: number
    thumbnailWidth: number
  }
}

interface GoogleImageSearchResponse {
  items?: GoogleImageResult[]
  searchInformation?: {
    totalResults: string
  }
}

export class GoogleImageSearchClient {
  private apiKey: string
  private searchEngineId: string

  constructor(apiKey: string, searchEngineId: string) {
    this.apiKey = apiKey
    this.searchEngineId = searchEngineId
  }

  /**
   * Search Google Images for a specific query
   */
  async searchImages(query: string, numResults: number = 10): Promise<GoogleImageResult[]> {
    try {
      const url = new URL('https://www.googleapis.com/customsearch/v1')
      url.searchParams.set('key', this.apiKey)
      url.searchParams.set('cx', this.searchEngineId)
      url.searchParams.set('q', query)
      url.searchParams.set('searchType', 'image')
      url.searchParams.set('num', Math.min(numResults, 10).toString())
      url.searchParams.set('safe', 'active')
      url.searchParams.set('imgType', 'photo')
      url.searchParams.set('imgSize', 'large')

      const response = await fetch(url.toString())
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('Google Image Search API error:', errorText)
        throw new Error(`Google Image Search API error: ${response.status} ${response.statusText}`)
      }

      const data: GoogleImageSearchResponse = await response.json()
      
      return data.items || []
    } catch (error) {
      console.error('Failed to search Google Images:', error)
      return []
    }
  }
}

