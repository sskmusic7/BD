/**
 * Unsplash API Client
 * For fetching high-quality images
 */

export interface UnsplashImage {
  id: string
  url: string
  thumbnailUrl: string
  regularUrl: string
  fullUrl: string
  description: string | null
  altDescription: string | null
  photographer: string
  photographerUrl: string
  downloadLocation: string
}

export class UnsplashClient {
  private accessKey: string
  private baseUrl = 'https://api.unsplash.com'

  constructor(accessKey: string) {
    this.accessKey = accessKey
  }

  /**
   * Search for images
   */
  async searchPhotos(
    query: string,
    perPage: number = 10
  ): Promise<UnsplashImage[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/search/photos?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape`,
        {
          headers: {
            Authorization: `Client-ID ${this.accessKey}`,
          },
        }
      )

      if (!response.ok) {
        throw new Error(`Unsplash API error: ${response.statusText}`)
      }

      const data = await response.json()

      return data.results.map((photo: any) => ({
        id: photo.id,
        url: photo.urls.raw,
        thumbnailUrl: photo.urls.thumb,
        regularUrl: photo.urls.regular,
        fullUrl: photo.urls.full,
        description: photo.description,
        altDescription: photo.alt_description,
        photographer: photo.user.name,
        photographerUrl: photo.user.links.html,
        downloadLocation: photo.links.download_location,
      }))
    } catch (error) {
      console.error('Unsplash API error:', error)
      return []
    }
  }
}

