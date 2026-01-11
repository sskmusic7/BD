# Visual Audit Agent

A comprehensive image auditing tool that uses Google Image Search, Google Vision API, Unsplash, and AI generation to verify that images on your site match their content topics.

## Features

- ✅ **Google Image Search**: Finds matching images for content topics
- ✅ **Google Vision API**: Analyzes image content using OCR and label detection
- ✅ **Unsplash Integration**: Finds high-quality free stock photos
- ✅ **AI Image Generation**: Generates custom images when needed (Vertex AI Imagen)
- ✅ **3-Tier Post-Processing**: Google → Unsplash → AI Generation fallback chain
- ✅ **Match Scoring**: Calculates how well images match their topics
- ✅ **Site-Wide Scanning**: Automatically finds all images across your site
- ✅ **Customizable**: Easy to configure for your site structure

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env` file or set environment variables:

```env
# Required
GOOGLE_SEARCH_API_KEY=your-google-search-api-key
GOOGLE_SEARCH_ENGINE_ID=your-custom-search-engine-id

# Optional (for enhanced analysis)
GOOGLE_VISION_API_KEY=your-google-vision-api-key

# Optional (for Unsplash fallback)
UNSPLASH_ACCESS_KEY=your-unsplash-access-key

# Optional (for AI image generation)
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_CLOUD_ACCESS_TOKEN=your-access-token

# Optional (for Gemini-enhanced prompts)
GEMINI_API_KEY=your-gemini-api-key
```

### 3. Enable Google Custom Search Image Search

1. Go to [Google Custom Search](https://programmablesearchengine.google.com/)
2. Select your search engine
3. Go to **Setup** → **Features** → **Image Search**
4. Enable **"Image Search"**

### 4. Configure Your Site Structure

Create `audit-config.json`:

```json
{
  "dataDir": "./data",
  "blogPostsPath": "generated-blog-posts.json",
  "productsPath": "generated-excursions.json",
  "configPath": "site-images-config.json",
  "customImages": [
    {
      "id": "custom-1",
      "type": "custom",
      "title": "Custom Image",
      "imageUrl": "https://example.com/image.jpg",
      "page": "/custom",
      "component": "CustomComponent",
      "context": "Description"
    }
  ],
  "outputPath": "./audit-results.json"
}
```

## Usage

### Basic Usage

```bash
npm run audit
```

### With Custom Config

```bash
npm run audit:config
```

Or:

```bash
ts-node audit.ts --config=./my-config.json
```

## How It Works

### 1. Image Extraction
Scans your site to find all images from:
- Blog posts (JSON files)
- Products/Excursions (JSON files)
- Site configuration files
- Custom image lists

### 2. Keyword Extraction
Analyzes titles, content, and categories to identify relevant keywords for each image.

### 3. Google Image Search
Searches Google Images using extracted keywords to find matching images.

### 4. Vision API Analysis (Optional)
Uses Google Vision API to detect labels in images (OCR/object detection) and calculate match scores.

### 5. Post-Processing (3-Tier System)
For images that need correction:
- **Tier 1**: Google Image Search (always checked)
- **Tier 2**: Unsplash (checked if Google fails)
- **Tier 3**: AI Generation (only if both fail)

### 6. Results
Generates a JSON report with:
- Current images
- Suggested replacements
- Match scores
- Alternative sources
- Post-processing status

## Understanding Results

### Match Score
- **70-100%**: Excellent match ✅
- **40-70%**: Moderate match ⚠️ (may need correction)
- **0-40%**: Poor match ❌ (needs correction)

### Output Format

```json
{
  "summary": {
    "totalAudited": 50,
    "needsCorrection": 5,
    "corrected": 0,
    "results": [...]
  },
  "results": [
    {
      "id": "blog-1",
      "type": "blog",
      "title": "Blog Post Title",
      "currentImage": "https://example.com/current.jpg",
      "suggestedImage": "https://example.com/suggested.jpg",
      "suggestedImageSource": "google",
      "matchScore": 0.3,
      "keywords": ["beach", "ocean", "vacation"],
      "alternatives": {
        "google": "https://...",
        "unsplash": "https://...",
        "aiGenerated": null
      },
      "postProcessingStatus": {
        "googleChecked": true,
        "unsplashChecked": true,
        "aiGenerated": false,
        "finalSource": "google"
      }
    }
  ]
}
```

## Customization

### Custom Image Scanner

Edit `lib/visual-auditor/site-scanner.ts` to match your site structure:

```typescript
scanEntireSite(options?: {
  blogPostsPath?: string
  productsPath?: string
  configPath?: string
  customImages?: SiteImage[]
}): SiteImage[] {
  // Add your custom scanning logic
}
```

### Custom Keyword Extraction

Edit `lib/visual-auditor/auditor.ts` to customize keyword extraction:

```typescript
private extractKeywords(title: string, content?: string, category?: string): string[] {
  // Add your custom keyword extraction logic
}
```

## API Usage

You can also use the auditor programmatically:

```typescript
import { VisualAuditor } from './lib/visual-auditor/auditor'
import { SiteImageScanner } from './lib/visual-auditor/site-scanner'

const scanner = new SiteImageScanner('./data')
const images = scanner.scanEntireSite({
  blogPostsPath: 'blog-posts.json'
})

const auditor = new VisualAuditor()
const summary = await auditor.runFullAudit(images)

console.log(`Found ${summary.needsCorrection} images needing correction`)
```

## Troubleshooting

### No Image Search Results
- Check: Custom Search Engine has Image Search enabled
- Check: Search engine ID is correct
- Check: API key has permissions for Custom Search API

### Vision API Not Working
- Check: Vision API is enabled in Google Cloud Console
- Check: API key has Vision API permissions
- Note: Vision API is optional; system works without it

### Rate Limiting
- System includes rate limiting (500ms delay between images)
- For bulk audits: Consider running in batches

## License

MIT

