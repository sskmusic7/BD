/**
 * Site-Wide Image Scanner
 * Scans the entire site to find all images across all pages and components
 * 
 * Customize this for your specific site structure
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export interface SiteImage {
  id: string
  type: 'homepage' | 'blog' | 'excursion' | 'activity' | 'package' | 'testimonial' | 'page' | 'viator' | 'custom'
  title: string
  imageUrl: string
  page?: string
  component?: string
  context?: string
}

export class SiteImageScanner {
  private dataDir?: string

  constructor(dataDir?: string) {
    this.dataDir = dataDir
  }

  /**
   * Scan images from a JSON data file (e.g., blog posts, products)
   * Customize this method for your data structure
   */
  scanFromJSON(filePath: string, type: SiteImage['type'], titleField: string = 'title', imageField: string = 'image'): SiteImage[] {
    const images: SiteImage[] = []
    const fullPath = this.dataDir ? join(this.dataDir, filePath) : filePath

    if (!existsSync(fullPath)) {
      return images
    }

    try {
      const fileContent = readFileSync(fullPath, 'utf-8')
      const items = JSON.parse(fileContent)
      
      if (Array.isArray(items)) {
        items.forEach((item: any, index: number) => {
          const imageUrl = item[imageField] || item.imageUrl || item.coverImage
          if (imageUrl) {
            images.push({
              id: `${type}-${item.id || index}`,
              type,
              title: item[titleField] || item.title || `Item ${index + 1}`,
              imageUrl,
              page: `/${type}`,
              component: type.charAt(0).toUpperCase() + type.slice(1),
              context: `${type} item`
            })
          }
        })
      }
    } catch (error) {
      console.error(`Failed to scan ${filePath}:`, error)
    }

    return images
  }

  /**
   * Scan images from a configuration file
   */
  scanFromConfig(configPath: string): SiteImage[] {
    const images: SiteImage[] = []
    const fullPath = this.dataDir ? join(this.dataDir, configPath) : configPath

    if (!existsSync(fullPath)) {
      return images
    }

    try {
      const config = JSON.parse(readFileSync(fullPath, 'utf-8'))
      
      // Homepage images
      if (config.homepage) {
        if (config.homepage.hero?.backgroundImage) {
          images.push({
            id: 'hero-background',
            type: 'homepage',
            title: 'Homepage Hero Background',
            imageUrl: config.homepage.hero.backgroundImage,
            page: '/',
            component: 'Hero',
            context: 'Homepage hero background'
          })
        }
      }

      // Testimonials
      if (config.testimonials && Array.isArray(config.testimonials)) {
        config.testimonials.forEach((testimonial: any, index: number) => {
          if (testimonial.image) {
            images.push({
              id: `testimonial-${index}`,
              type: 'testimonial',
              title: `Testimonial: ${testimonial.name || `User ${index + 1}`}`,
              imageUrl: testimonial.image,
              page: '/',
              component: 'Testimonials',
              context: 'Customer testimonial'
            })
          }
        })
      }

      // Packages/Products
      if (config.packages && Array.isArray(config.packages)) {
        config.packages.forEach((pkg: any) => {
          if (pkg.image) {
            images.push({
              id: `package-${pkg.id || pkg.name}`,
              type: 'package',
              title: `Package: ${pkg.name || pkg.title}`,
              imageUrl: pkg.image,
              page: '/packages',
              component: 'PackageCard',
              context: 'Package deal'
            })
          }
        })
      }

      // Pages
      if (config.pages) {
        Object.keys(config.pages).forEach(pagePath => {
          const page = config.pages[pagePath]
          if (page.heroImage) {
            images.push({
              id: `${pagePath}-hero`,
              type: 'page',
              title: `${pagePath} Page Hero`,
              imageUrl: page.heroImage,
              page: `/${pagePath}`,
              component: 'Hero',
              context: `${pagePath} page background`
            })
          }
        })
      }
    } catch (error) {
      console.error(`Failed to scan config ${configPath}:`, error)
    }

    return images
  }

  /**
   * Scan entire site for all images
   * Customize this method to match your site structure
   */
  scanEntireSite(options?: {
    blogPostsPath?: string
    productsPath?: string
    configPath?: string
    customImages?: SiteImage[]
  }): SiteImage[] {
    const allImages: SiteImage[] = []

    // Scan from JSON files
    if (options?.blogPostsPath) {
      allImages.push(...this.scanFromJSON(options.blogPostsPath, 'blog'))
    }

    if (options?.productsPath) {
      allImages.push(...this.scanFromJSON(options.productsPath, 'activity', 'title', 'coverImage'))
    }

    // Scan from config
    if (options?.configPath) {
      allImages.push(...this.scanFromConfig(options.configPath))
    }

    // Add custom images
    if (options?.customImages) {
      allImages.push(...options.customImages)
    }

    // Remove duplicates (same URL)
    const uniqueImages = Array.from(
      new Map(allImages.map(img => [img.imageUrl, img])).values()
    )

    return uniqueImages
  }

  /**
   * Get count of images by type
   */
  getImageCounts(images: SiteImage[]): Record<string, number> {
    const counts: Record<string, number> = {}
    
    images.forEach(img => {
      counts[img.type] = (counts[img.type] || 0) + 1
    })
    
    return counts
  }
}

