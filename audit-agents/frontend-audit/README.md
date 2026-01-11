# Front-End Audit Agent

A comprehensive browser-based testing tool using Playwright to audit your website for JavaScript errors, console errors, failed network requests, and page load issues.

## Features

- ✅ Real browser testing (uses Chromium via Playwright)
- ✅ Detects JavaScript errors
- ✅ Captures console errors
- ✅ Monitors failed network requests
- ✅ Checks for 404 errors and application errors
- ✅ Measures page load times
- ✅ Configurable page list
- ✅ Headless or visible browser mode

## Installation

```bash
npm install playwright
npx playwright install chromium
```

## Usage

### Basic Usage

```bash
# Test local development server
node audit.js

# Test production site
BASE_URL=https://example.com node audit.js

# Run in headless mode
HEADLESS=true node audit.js
```

### Custom Pages Configuration

Create a `pages-config.json` file:

```json
{
  "pages": [
    { "path": "/", "name": "Home" },
    { "path": "/about", "name": "About" },
    { "path": "/products", "name": "Products" }
  ],
  "dynamicPages": [
    { "path": "/products/1", "name": "Product Detail 1" }
  ]
}
```

Then run:

```bash
PAGES_CONFIG=./pages-config.json node audit.js
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:3000` | Base URL to test |
| `HEADLESS` | `false` | Run in headless mode (`true`/`false`) |
| `PAGES_CONFIG` | - | Path to custom pages config JSON |

## What It Tests

- **HTTP Status Codes**: Ensures pages return 200 OK
- **JavaScript Errors**: Catches runtime JS errors
- **Console Errors**: Captures console.error() calls
- **Failed Requests**: Monitors network request failures
- **Application Errors**: Detects error messages displayed on pages
- **404 Errors**: Checks for "not found" pages
- **Load Times**: Measures how long pages take to load

## Output

The script provides:
- Real-time progress updates
- Detailed error messages
- Summary report with pass/fail counts
- Exit code 0 for success, 1 for failures (useful for CI/CD)

## Example Output

```
🔍 FRONTEND AUDIT - Real Browser Testing
=========================================
📍 Target: http://localhost:3000
🖥️  Mode: Visible Browser
📄 Pages to test: 3
=========================================

🔍 Testing: Home (/)
   ✅ PASSED (1234ms)

🔍 Testing: About (/about)
   ❌ FAILED: JavaScript errors
      → TypeError: Cannot read property 'x' of undefined

=========================================
📊 AUDIT SUMMARY
=========================================
✅ Passed: 2
❌ Failed: 1
⚠️  Warnings: 0
=========================================
```

## Integration with CI/CD

```yaml
# GitHub Actions example
- name: Run Frontend Audit
  run: |
    npm install playwright
    npx playwright install chromium
    HEADLESS=true BASE_URL=${{ secrets.SITE_URL }} node audit.js
```

## Customization

Edit `audit.js` to:
- Adjust timeout values (currently 30 seconds)
- Change viewport size (currently 1280x720)
- Modify error detection logic
- Add custom checks

## Troubleshooting

**Browser not found**: Run `npx playwright install chromium`

**Timeout errors**: Increase timeout in `page.goto()` options

**Too many false positives**: Adjust error detection selectors in the code

