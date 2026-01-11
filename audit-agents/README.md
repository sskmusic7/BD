# Website Audit Agents

A collection of reusable audit tools for testing and validating websites. These agents can be used across multiple projects to ensure quality and consistency.

## 📦 Included Agents

### 1. Front-End Audit Agent
**Location**: `frontend-audit/`

A browser-based testing tool using Playwright to audit your website for:
- JavaScript errors
- Console errors
- Failed network requests
- Page load issues
- 404 errors
- Application errors

**Quick Start**:
```bash
cd frontend-audit
npm install playwright
npx playwright install chromium
BASE_URL=https://example.com node audit.js
```

See [frontend-audit/README.md](./frontend-audit/README.md) for full documentation.

### 2. Visual Audit Agent
**Location**: `visual-audit/`

An image quality auditing tool that uses:
- Google Image Search
- Google Vision API
- Unsplash
- AI Image Generation

To verify that images on your site match their content topics.

**Quick Start**:
```bash
cd visual-audit
npm install
# Set up environment variables (see README)
npm run audit
```

See [visual-audit/README.md](./visual-audit/README.md) for full documentation.

## 🚀 Quick Setup

### For Front-End Audit

1. Navigate to the front-end audit directory:
   ```bash
   cd frontend-audit
   ```

2. Install Playwright:
   ```bash
   npm install playwright
   npx playwright install chromium
   ```

3. Run the audit:
   ```bash
   BASE_URL=https://your-site.com node audit.js
   ```

### For Visual Audit

1. Navigate to the visual audit directory:
   ```bash
   cd visual-audit
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables (see `visual-audit/README.md`)

4. Configure your site structure in `audit-config.json`

5. Run the audit:
   ```bash
   npm run audit
   ```

## 📋 Requirements

### Front-End Audit
- Node.js 14+
- Playwright (installed automatically)

### Visual Audit
- Node.js 14+
- TypeScript
- Google Custom Search API key
- Google Search Engine ID
- (Optional) Google Vision API key
- (Optional) Unsplash API key
- (Optional) Google Cloud credentials for AI generation

## 🔧 Integration

### Copy to Your Project

You can copy either agent to your project:

```bash
# Copy front-end audit
cp -r audit-agents/frontend-audit ./scripts/audit

# Copy visual audit
cp -r audit-agents/visual-audit ./scripts/visual-audit
```

### Use as Standalone Tools

Keep them in a shared location and reference from multiple projects:

```bash
# From any project
BASE_URL=https://project1.com node ../audit-agents/frontend-audit/audit.js
BASE_URL=https://project2.com node ../audit-agents/frontend-audit/audit.js
```

## 📝 Configuration

### Front-End Audit

Configure pages to test via:
- Environment variables
- `PAGES_CONFIG` JSON file
- Direct editing of `audit.js`

### Visual Audit

Configure via:
- `audit-config.json` file
- Environment variables
- Custom scanner implementation

## 🎯 Use Cases

### Front-End Audit
- Pre-deployment testing
- CI/CD pipeline integration
- Regression testing
- Performance monitoring
- Error detection

### Visual Audit
- Content quality assurance
- Image relevance checking
- SEO optimization
- Brand consistency
- Accessibility compliance

## 🔗 CI/CD Integration

### GitHub Actions Example

```yaml
name: Website Audits

on: [push, pull_request]

jobs:
  frontend-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install playwright
      - run: npx playwright install chromium
      - run: |
          cd audit-agents/frontend-audit
          HEADLESS=true BASE_URL=${{ secrets.SITE_URL }} node audit.js

  visual-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: |
          cd audit-agents/visual-audit
          npm install
          npm run audit
        env:
          GOOGLE_SEARCH_API_KEY: ${{ secrets.GOOGLE_SEARCH_API_KEY }}
          GOOGLE_SEARCH_ENGINE_ID: ${{ secrets.GOOGLE_SEARCH_ENGINE_ID }}
```

## 📚 Documentation

- [Front-End Audit README](./frontend-audit/README.md)
- [Visual Audit README](./visual-audit/README.md)

## 🤝 Contributing

These agents are designed to be easily customizable. To adapt them for your needs:

1. **Front-End Audit**: Edit `audit.js` to add custom checks or modify page detection
2. **Visual Audit**: 
   - Customize `site-scanner.ts` for your site structure
   - Modify `auditor.ts` for custom keyword extraction
   - Adjust post-processing logic as needed

## 📄 License

MIT - Feel free to use these tools in your projects!

## 🆘 Support

For issues or questions:
1. Check the individual agent READMEs
2. Review the example configuration files
3. Check environment variable setup
4. Verify API keys and permissions

---

**Note**: These agents were extracted from a production website project and have been generalized for reuse. They may require customization for your specific use case.

