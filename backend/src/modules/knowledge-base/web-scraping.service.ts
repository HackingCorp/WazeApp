import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import axios from 'axios';
import * as puppeteer from 'puppeteer';

export interface ScrapedContent {
  text: string;
  images: Array<{
    url: string;
    alt: string;
    size?: number;
  }>;
  videos: Array<{
    url: string;
    title: string;
    duration?: string;
  }>;
  links: Array<{
    url: string;
    text: string;
  }>;
  metadata: {
    title: string;
    description: string;
    keywords: string[];
    author?: string;
    publishDate?: string;
    wordCount: number;
    language?: string;
  };
}

export interface DeepCrawlResult {
  baseUrl: string;
  pages: Array<{
    url: string;
    content: ScrapedContent;
    crawledAt: string;
  }>;
  totalPagesFound: number;
  totalPagesCrawled: number;
  errors: Array<{
    url: string;
    error: string;
  }>;
}

@Injectable()
export class WebScrapingService {
  private readonly logger = new Logger(WebScrapingService.name);

  async scrapeUrl(url: string, options?: {
    waitForSelector?: string;
    removeSelectors?: string[];
    includeImages?: boolean;
    followLinks?: boolean;
    maxDepth?: number;
  }): Promise<ScrapedContent> {
    try {
      this.logger.log(`Starting to scrape URL: ${url}`);
      
      // Fetch the page
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
        },
        timeout: 30000, // 30 seconds timeout
        maxRedirects: 5,
      });

      const html = response.data;
      const $ = cheerio.load(html);

      // Remove unwanted elements
      if (options?.removeSelectors) {
        options.removeSelectors.forEach(selector => {
          $(selector).remove();
        });
      }

      // Remove common noise elements
      $('script, style, nav, footer, .advertisement, .ads, .popup, .modal').remove();

      // Extract metadata
      const title = $('title').text().trim() || 
                   $('meta[property="og:title"]').attr('content') || 
                   $('h1').first().text().trim() || 
                   'Untitled';

      const description = $('meta[name="description"]').attr('content') || 
                         $('meta[property="og:description"]').attr('content') || 
                         '';

      const keywords = $('meta[name="keywords"]').attr('content')?.split(',').map(k => k.trim()) || [];
      
      const author = $('meta[name="author"]').attr('content') || 
                    $('meta[property="article:author"]').attr('content');

      const publishDate = $('meta[property="article:published_time"]').attr('content') ||
                         $('meta[name="publish-date"]').attr('content') ||
                         $('time[datetime]').attr('datetime');

      // Extract text content with more comprehensive selectors
      const textElements = $('p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, article, section, div[class*="content"], div[class*="text"], span[class*="text"], div[id*="content"]');
      let text = '';
      
      // Also try to get text from common content containers
      const contentContainers = $('main, [role="main"], .main-content, #main-content, .content, #content, .post, .article, .page-content');
      
      // First try content containers
      contentContainers.each((_, container) => {
        const containerText = $(container).text().trim();
        if (containerText && containerText.length > 50) {
          text += containerText + '\n\n';
        }
      });
      
      // If we didn't get much text, try all elements
      if (text.length < 200) {
        textElements.each((_, element) => {
          const elementText = $(element).text().trim();
          if (elementText && elementText.length > 10) { // Reduced minimum length
            text += elementText + '\n\n';
          }
        });
      }
      
      // If still no text, try body content
      if (text.length < 100) {
        const bodyText = $('body').text().trim();
        if (bodyText && bodyText.length > 50) {
          text = bodyText;
        }
      }
      
      // For very dynamic sites (e-commerce, SPAs), try more aggressive extraction
      if (text.length < 50) {
        this.logger.warn(`Low content detected for ${url}, trying aggressive extraction`);
        
        // Try to extract from ANY text-containing elements
        $('*').each((_, element) => {
          const elementText = $(element).text().trim();
          const tagName = (element as any).tagName?.toLowerCase();
          
          // Skip script, style, and navigation elements
          if (!tagName || ['script', 'style', 'nav', 'footer'].includes(tagName)) {
            return;
          }
          
          // Only get direct text (not nested elements)
          const directText = $(element).clone().children().remove().end().text().trim();
          
          if (directText && directText.length > 5 && directText.length < 500) {
            // Avoid duplicates
            if (!text.includes(directText)) {
              text += directText + ' ';
            }
          }
        });
        
        // Try to extract from data attributes and alt tags
        $('[data-title], [data-name], [data-description], [alt]').each((_, element) => {
          const dataTitle = $(element).attr('data-title') || '';
          const dataName = $(element).attr('data-name') || '';
          const dataDesc = $(element).attr('data-description') || '';
          const altText = $(element).attr('alt') || '';
          
          [dataTitle, dataName, dataDesc, altText].forEach(attrText => {
            if (attrText && attrText.length > 3 && attrText.length < 200) {
              if (!text.includes(attrText)) {
                text += attrText + ' ';
              }
            }
          });
        });
      }

      // Clean up text
      text = text.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
      
      const wordCount = text.split(/\s+/).length;
      
      this.logger.log(`Text extraction complete for ${url}: ${text.length} characters, ${wordCount} words`);
      
      // Enhanced detection for JavaScript-heavy sites (Next.js, React, etc.)
      const isJavaScriptSite = html.includes('__next') || 
                             html.includes('React') || 
                             html.includes('_app') ||
                             html.includes('self.__next_f') ||
                             text.includes('Initialisation') ||
                             text.includes('Chargement de l\'application');

      // If content is very low OR it's a JavaScript site, try Puppeteer
      if ((text.length < 200 && wordCount < 10) || isJavaScriptSite) {
        const reason = isJavaScriptSite ? 'JavaScript/Next.js site detected' : 'Very low content extracted';
        this.logger.warn(`${reason} from ${url}. Attempting Puppeteer scraping for dynamic content.`);
        
        try {
          const puppeteerResult = await this.scrapeUrlWithPuppeteer(url, { 
            waitTime: isJavaScriptSite ? 10000 : 5000, // Longer wait for JS sites
            includeImages: options?.includeImages,
            waitForSelector: isJavaScriptSite ? 'h1, [class*="product"], [class*="title"]' : options?.waitForSelector
          });
          
          // If Puppeteer found more content, use it
          if (puppeteerResult.text.length > text.length * 1.5 || isJavaScriptSite) {
            this.logger.log(`Puppeteer extracted better content: ${puppeteerResult.text.length} vs ${text.length} characters`);
            return puppeteerResult;
          }
        } catch (puppeteerError) {
          this.logger.warn(`Puppeteer fallback failed for ${url}: ${puppeteerError.message}`);
          // For JS sites, if Puppeteer fails, try to extract from scripts
          if (isJavaScriptSite) {
            this.logger.log('Attempting to extract data from JavaScript for Next.js site...');
            const jsExtracted = this.extractFromJavaScript($, html);
            if (jsExtracted.length > 0) {
              text = jsExtracted;
              this.logger.log(`JavaScript extraction successful: ${jsExtracted.length} characters`);
            }
          }
        }
      }

      // Extract images
      const images: ScrapedContent['images'] = [];
      if (options?.includeImages !== false) {
        $('img').each((_, img) => {
          const src = $(img).attr('src');
          const alt = $(img).attr('alt') || '';
          
          if (src && !src.startsWith('data:')) {
            let imageUrl = src;
            if (src.startsWith('//')) {
              imageUrl = 'https:' + src;
            } else if (src.startsWith('/')) {
              const urlObj = new URL(url);
              imageUrl = urlObj.origin + src;
            } else if (!src.startsWith('http')) {
              const urlObj = new URL(url);
              imageUrl = new URL(src, urlObj.href).href;
            }
            
            images.push({
              url: imageUrl,
              alt: alt.trim(),
            });
          }
        });
      }

      // Extract videos
      const videos: ScrapedContent['videos'] = [];
      $('video, iframe[src*="youtube"], iframe[src*="vimeo"]').each((_, video) => {
        const src = $(video).attr('src') || $(video).find('source').first().attr('src');
        const title = $(video).attr('title') || $(video).attr('alt') || 'Video';
        
        if (src) {
          videos.push({
            url: src,
            title: title.trim(),
          });
        }
      });

      // Extract links
      const links: ScrapedContent['links'] = [];
      $('a[href]').each((_, link) => {
        const href = $(link).attr('href');
        const linkText = $(link).text().trim();
        
        if (href && linkText && href.startsWith('http')) {
          links.push({
            url: href,
            text: linkText,
          });
        }
      });

      // Detect language (simple heuristic)
      const language = $('html').attr('lang') || 
                      $('meta[http-equiv="content-language"]').attr('content') ||
                      'en';

      const result: ScrapedContent = {
        text,
        images: images.slice(0, 50), // Limit to 50 images
        videos: videos.slice(0, 20), // Limit to 20 videos
        links: links.slice(0, 100), // Limit to 100 links
        metadata: {
          title,
          description,
          keywords,
          author,
          publishDate,
          wordCount,
          language,
        },
      };

      this.logger.log(`Successfully scraped URL: ${url} - ${wordCount} words, ${images.length} images, ${videos.length} videos`);
      return result;

    } catch (error) {
      this.logger.error(`Failed to scrape URL: ${url}`, error);
      
      // Enhanced error handling for protected content
      if (error.response?.status === 400) {
        const errorMessage = `URL ${url} returned HTTP 400 - This may be a protected WhatsApp Business catalog or require authentication. Try accessing the catalog through WhatsApp app or ensure the business has made their catalog publicly accessible.`;
        this.logger.warn(errorMessage);
        throw new Error(errorMessage);
      }
      
      if (error.response?.status === 403) {
        const errorMessage = `URL ${url} is forbidden (403) - Access denied. The content may require authentication or special permissions.`;
        this.logger.warn(errorMessage);
        throw new Error(errorMessage);
      }
      
      if (error.response?.status === 404) {
        const errorMessage = `URL ${url} not found (404) - Please verify the URL is correct.`;
        this.logger.warn(errorMessage);
        throw new Error(errorMessage);
      }
      
      if (error.code === 'ENOTFOUND') {
        const errorMessage = `Cannot resolve domain for ${url} - Please check your internet connection and verify the URL.`;
        this.logger.warn(errorMessage);
        throw new Error(errorMessage);
      }
      
      if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
        const errorMessage = `Timeout while accessing ${url} - The site may be slow or temporarily unavailable.`;
        this.logger.warn(errorMessage);
        throw new Error(errorMessage);
      }
      
      // For WhatsApp URLs specifically
      if (url.includes('wa.me') || url.includes('whatsapp')) {
        const errorMessage = `WhatsApp Business catalog at ${url} may be private or require the WhatsApp app to access. Consider asking the business owner to make their catalog publicly accessible or try accessing through WhatsApp Web.`;
        this.logger.warn(errorMessage);
        throw new Error(errorMessage);
      }
      
      throw new Error(`Failed to scrape URL: ${error.message}`);
    }
  }

  async scrapeUrlWithPuppeteer(url: string, options?: {
    waitForSelector?: string;
    waitTime?: number;
    includeImages?: boolean;
    removeSelectors?: string[];
  }): Promise<ScrapedContent> {
    let browser = null;
    try {
      this.logger.log(`Starting Puppeteer scrape for dynamic site: ${url}`);
      
      browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-ipc-flooding-protection',
          '--disable-renderer-backgrounding',
          '--disable-backgrounding-occluded-windows',
          '--disable-field-trial-config',
          '--disable-hang-monitor',
          '--disable-component-extensions-with-background-pages',
          '--allow-running-insecure-content',
          '--no-zygote'
        ],
        timeout: 60000,
      });

      const page = await browser.newPage();
      
      // Set user agent to avoid blocking
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      // Set viewport
      await page.setViewport({ width: 1366, height: 768 });

      // Navigate to page with extended timeout
      await page.goto(url, { 
        waitUntil: 'networkidle2', 
        timeout: 45000 
      });

      // Wait for dynamic content to load
      if (options?.waitForSelector) {
        await page.waitForSelector(options.waitForSelector, { timeout: 20000 }).catch(() => {
          this.logger.warn(`Selector ${options.waitForSelector} not found, continuing anyway`);
        });
      }

      // Detect if this is a Next.js site and wait appropriately
      const isNextJs = await page.evaluate(() => {
        return (window as any).__NEXT_DATA__ !== undefined || 
               document.querySelector('script[id="__NEXT_DATA__"]') !== null ||
               document.body.innerHTML.includes('__next') ||
               document.body.innerHTML.includes('self.__next_f');
      });

      if (isNextJs) {
        this.logger.log('Next.js site detected, using extended wait strategy');
        
        // First, wait for the initial page load
        await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
        
        // Wait for Next.js hydration with multiple strategies
        await Promise.race([
          // Strategy 1: Wait until loading text disappears AND content appears
          page.waitForFunction(() => {
            const bodyText = document.body.textContent || '';
            const hasContent = bodyText.length > 1000 && 
                              !bodyText.includes('Initialisation') && 
                              !bodyText.includes('Chargement de l\'application') &&
                              !bodyText.includes('Loading');
            
            // Also check for common content indicators
            const hasElements = document.querySelector('h1, h2, h3, .content, main, [role="main"]') !== null;
            const hasImages = document.querySelector('img') !== null;
            
            return hasContent && (hasElements || hasImages);
          }, { timeout: 45000 }),
          
          // Strategy 2: Wait for network idle (no network requests for 2 seconds)
          page.waitForLoadState ? page.waitForLoadState('networkidle') : Promise.resolve(),
          
          // Strategy 3: Fallback timeout
          page.waitForTimeout(30000)
        ]).catch(() => {
          this.logger.warn('Next.js hydration strategies failed, continuing with current content...');
        });
        
        // Additional wait for Next.js sites to ensure all dynamic content loads
        await page.waitForTimeout(options?.waitTime || 15000);
        
        // Try to trigger any lazy-loaded content by scrolling
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight / 2);
        });
        await page.waitForTimeout(2000);
        
        await page.evaluate(() => {
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(2000);
        
      } else {
        // Standard wait for non-Next.js sites
        await page.waitForTimeout(options?.waitTime || 8000);
      }
      
      // Try to wait for common e-commerce elements to load
      await Promise.allSettled([
        page.waitForSelector('img', { timeout: 5000 }),
        page.waitForSelector('[class*="product"], [class*="item"], [class*="price"], [data-product], .product-info, .product-details, .product-title, .product-description, .add-to-cart', { timeout: 5000 }),
        page.waitForSelector('[class*="rating"], [class*="review"], [class*="star"], [class*="availability"], [class*="stock"]', { timeout: 3000 }).catch(() => {}),
        page.waitForFunction(() => document.readyState === 'complete', { timeout: 10000 })
      ]);

      // Remove unwanted elements
      if (options?.removeSelectors?.length) {
        await page.evaluate((selectors) => {
          selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => el.remove());
          });
        }, options.removeSelectors);
      }

      // Remove common noise elements via JavaScript
      await page.evaluate(() => {
        const noisySelectors = [
          'script', 'style', 'nav', 'footer', '.advertisement', 
          '.ads', '.popup', '.modal', '.cookie-banner', '.gdpr-banner',
          '[class*="ad-"]', '[id*="ad-"]', '.social-share', '.related-posts'
        ];
        
        noisySelectors.forEach(selector => {
          document.querySelectorAll(selector).forEach(el => el.remove());
        });
      });

      // Extract content using page.evaluate with e-commerce optimization
      const scrapedData = await page.evaluate(() => {
        // Detect if this is likely an e-commerce site
        const ecommerceIndicators = [
          '.product', '.add-to-cart', '.buy-now', '.price', '.cart',
          '[data-product]', '.product-price', '.add-to-basket', '.purchase',
          '.shop', '.store', '.checkout', '.quantity', '.variant'
        ];
        
        const isEcommerceSite = ecommerceIndicators.some(selector => 
          document.querySelector(selector) !== null
        );
        
        // Adjust wait time for e-commerce sites
        if (isEcommerceSite) {
          console.log('E-commerce site detected, using specialized extraction');
        }
        // Extract metadata
        const title = document.title || 
                     document.querySelector('meta[property="og:title"]')?.getAttribute('content') || 
                     document.querySelector('h1')?.textContent?.trim() || 
                     'Untitled';

        const description = document.querySelector('meta[name="description"]')?.getAttribute('content') || 
                           document.querySelector('meta[property="og:description"]')?.getAttribute('content') || 
                           '';

        const keywords = document.querySelector('meta[name="keywords"]')?.getAttribute('content')?.split(',').map(k => k.trim()) || [];
        const author = document.querySelector('meta[name="author"]')?.getAttribute('content') || 
                      document.querySelector('meta[property="article:author"]')?.getAttribute('content');
        const publishDate = document.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ||
                           document.querySelector('meta[name="publish-date"]')?.getAttribute('content') ||
                           document.querySelector('time[datetime]')?.getAttribute('datetime');

        // Extract text content with comprehensive approach
        let text = '';
        
        // Try main content areas first, prioritizing e-commerce content
        const mainContentSelectors = [
          '.product-details', '.product-info', '.product-content', '[data-product]',
          '.product-description', '.item-description', '.product-summary',
          'main', '[role="main"]', '.main-content', '#main-content', 
          '.content', '#content', '.post', '.article', '.page-content',
          '.entry-content', '.post-content', '.article-content', '.blog-content'
        ];

        for (const selector of mainContentSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            const elementText = element.textContent?.trim();
            if (elementText && elementText.length > 100) {
              text = elementText;
              break;
            }
          }
        }

        // If main content not found, try comprehensive extraction
        if (text.length < 200) {
          const textElements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, article, section, div, span');
          const extractedTexts = new Set();

          textElements.forEach(element => {
            // Get direct text content
            let elementText = '';
            for (const node of element.childNodes) {
              if (node.nodeType === Node.TEXT_NODE) {
                elementText += node.textContent?.trim() + ' ';
              }
            }
            
            if (elementText.trim() && elementText.trim().length > 10 && elementText.trim().length < 500) {
              extractedTexts.add(elementText.trim());
            }
          });

          text = Array.from(extractedTexts).join(' ');
        }

        // Extract product/e-commerce specific content
        const productSelectors = [
          '.product-title', '.product-name', '.product-description', '.product-summary',
          '.price', '.product-price', '.current-price', '.sale-price', '.original-price', 
          '.product-details', '.product-info', '.product-features', '.product-specs',
          '.availability', '.stock-status', '.in-stock', '.out-of-stock',
          '.rating', '.reviews', '.review-count', '.stars', '.product-rating',
          '.brand', '.manufacturer', '.category', '.sku', '.model',
          '[data-product]', '[data-title]', '[data-name]', '[data-description]', '[data-price]',
          '[itemtype*="Product"]', '[itemtype*="product"]', '.productInfo', '.itemDetails'
        ];

        productSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            const elementText = el.textContent?.trim();
            const dataTitle = el.getAttribute('data-title');
            const dataName = el.getAttribute('data-name');
            const dataDesc = el.getAttribute('data-description');

            [elementText, dataTitle, dataName, dataDesc].forEach(txt => {
              if (txt && txt.length > 5 && txt.length < 200 && !text.includes(txt)) {
                text += ' ' + txt;
              }
            });
          });
        });

        // ENHANCED: Extract from Next.js scripts (for sites like E-Market 237)
        if (document.body.innerHTML.includes('__next') || document.body.innerHTML.includes('self.__next_f')) {
          console.log('Extracting from Next.js scripts...');
          
          const scripts = document.querySelectorAll('script');
          scripts.forEach(script => {
            const content = script.textContent || script.innerHTML;
            if (!content) return;
            
            // Pattern for E-Market 237 style data (with escaped quotes)
            const productPattern = /\\"product\\":\{\\"id\\":(\d+),\\"name\\":\\"([^"]+)\\",\\"slug\\":\\"([^"]+)\\",\\"description\\":\\"([^"]*)/;
            const productMatch = content.match(productPattern);
            
            if (productMatch) {
              const [, id, name, slug, description] = productMatch;
              console.log('Found product in Next.js script:', name);
              
              if (name && !text.includes(name)) {
                text += ' ' + name;
              }
              
              // Decode HTML entities and Unicode escapes in description
              if (description) {
                let cleanDesc = description
                  .replace(/\\u003c[^>]*\\u003e/g, '')
                  .replace(/<[^>]*>/g, '')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&amp;/g, '&')
                  .replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => 
                    String.fromCharCode(parseInt(code, 16))
                  );
                
                if (cleanDesc.length > 10 && !text.includes(cleanDesc)) {
                  text += ' ' + cleanDesc;
                }
              }
              
              // Look for additional data in the same context
              const contextStart = content.indexOf(productMatch[0]);
              const contextLength = 2000;
              const context = content.substring(contextStart, contextStart + contextLength);
              
              const priceMatch = context.match(/\\"(?:salePrice|basePrice|price)\\":(\d+)/);
              const currencyMatch = context.match(/\\"currency\\":\\"([^"]+)\\"/);
              const skuMatch = context.match(/\\"sku\\":\\"([^"]+)\\"/);
              const categoryMatch = context.match(/\\"category\\":\{[^}]*\\"name\\":\\"([^"]+)\\"/);
              
              if (priceMatch && currencyMatch) {
                text += ` Prix: ${priceMatch[1]} ${currencyMatch[1]}`;
              }
              
              if (skuMatch) {
                text += ` Référence: ${skuMatch[1]}`;
              }
              
              if (categoryMatch) {
                text += ` Catégorie: ${categoryMatch[1]}`;
              }
            }
            
            // Also look for other Next.js data patterns
            const namePattern = /"name":"([^"]*(?:KIT|PHONE|LAPTOP|TABLET|WATCH)[^"]*)"/gi;
            let nameMatch;
            while ((nameMatch = namePattern.exec(content)) !== null) {
              const productName = nameMatch[1];
              if (productName && productName.length > 5 && !text.includes(productName)) {
                text += ' ' + productName;
              }
            }
          });
        }

        // Extract structured data (JSON-LD for e-commerce)
        const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
        jsonLdScripts.forEach(script => {
          try {
            const data = JSON.parse(script.textContent);
            
            // Handle single object or array
            const items = Array.isArray(data) ? data : [data];
            
            items.forEach(item => {
              if (item['@type'] === 'Product' || item['@type'] === 'CreativeWork') {
                // Extract product information
                if (item.name && !text.includes(item.name)) {
                  text += ' ' + item.name;
                }
                if (item.description && !text.includes(item.description)) {
                  text += ' ' + item.description;
                }
                if (item.brand && item.brand.name) {
                  text += ' Brand: ' + item.brand.name;
                }
                if (item.offers && item.offers.price) {
                  text += ' Price: ' + item.offers.price;
                  if (item.offers.priceCurrency) {
                    text += ' ' + item.offers.priceCurrency;
                  }
                }
                if (item.sku) {
                  text += ' SKU: ' + item.sku;
                }
              }
            });
          } catch (e) {
            // Ignore malformed JSON
          }
        });

        // Extract images
        const images = [];
        document.querySelectorAll('img').forEach(img => {
          const src = img.src;
          const alt = img.alt || '';
          
          if (src && !src.startsWith('data:') && !src.includes('placeholder')) {
            images.push({
              url: src,
              alt: alt.trim()
            });
          }
        });

        // Extract videos
        const videos = [];
        document.querySelectorAll('video').forEach(video => {
          const src = video.src || video.querySelector('source')?.src;
          if (src) {
            videos.push({
              url: src,
              title: video.title || video.getAttribute('data-title') || 'Video'
            });
          }
        });

        // Extract links
        const links = [];
        document.querySelectorAll('a[href]').forEach(link => {
          const href = (link as any).href;
          const linkText = link.textContent?.trim();
          
          if (href && linkText && linkText.length > 0 && linkText.length < 100) {
            links.push({
              url: href,
              text: linkText
            });
          }
        });

        return {
          title,
          description,
          keywords,
          author,
          publishDate,
          text: text.replace(/\s+/g, ' ').trim(),
          images: images.slice(0, 20), // Limit images
          videos,
          links: links.slice(0, 50) // Limit links
        };
      });

      await browser.close();

      const wordCount = scrapedData.text.split(/\s+/).filter(word => word.length > 0).length;
      
      this.logger.log(`Puppeteer extraction complete for ${url}: ${scrapedData.text.length} characters, ${wordCount} words`);
      
      const result: ScrapedContent = {
        text: scrapedData.text,
        images: options?.includeImages !== false ? scrapedData.images : [],
        videos: scrapedData.videos,
        links: scrapedData.links,
        metadata: {
          title: scrapedData.title,
          description: scrapedData.description,
          keywords: scrapedData.keywords,
          author: scrapedData.author,
          publishDate: scrapedData.publishDate,
          wordCount,
          language: 'auto-detect'
        }
      };

      return result;

    } catch (error) {
      if (browser) {
        await browser.close();
      }
      this.logger.error(`Failed to scrape URL with Puppeteer: ${url}`, error);
      
      // Enhanced error handling for Puppeteer scraping
      if (error.message?.includes('net::ERR_HTTP_RESPONSE_CODE_FAILURE') || error.message?.includes('400')) {
        const errorMessage = `URL ${url} returned HTTP 400 with Puppeteer - This may be a protected WhatsApp Business catalog or require authentication. The site may block automated access or require specific cookies/sessions.`;
        this.logger.warn(errorMessage);
        throw new Error(errorMessage);
      }
      
      if (error.message?.includes('net::ERR_BLOCKED_BY_RESPONSE') || error.message?.includes('403')) {
        const errorMessage = `URL ${url} blocked by server (403) - Access denied with Puppeteer. The site may have bot protection or require authentication.`;
        this.logger.warn(errorMessage);
        throw new Error(errorMessage);
      }
      
      if (error.message?.includes('net::ERR_NAME_NOT_RESOLVED') || error.message?.includes('ENOTFOUND')) {
        const errorMessage = `Cannot resolve domain for ${url} with Puppeteer - Please verify the URL is correct.`;
        this.logger.warn(errorMessage);
        throw new Error(errorMessage);
      }
      
      if (error.message?.includes('TimeoutError') || error.message?.includes('timeout')) {
        const errorMessage = `Timeout while accessing ${url} with Puppeteer - The site took too long to load or may be unavailable.`;
        this.logger.warn(errorMessage);
        throw new Error(errorMessage);
      }
      
      // For WhatsApp URLs specifically with Puppeteer
      if (url.includes('wa.me') || url.includes('whatsapp')) {
        const errorMessage = `WhatsApp Business catalog at ${url} cannot be accessed with automated browser (Puppeteer). WhatsApp protects their catalogs and requires manual access through WhatsApp app or web interface. Consider asking the business owner to make their catalog publicly accessible.`;
        this.logger.warn(errorMessage);
        throw new Error(errorMessage);
      }
      
      throw new Error(`Failed to scrape dynamic site: ${error.message}`);
    }
  }

  async generateAISynthesis(content: ScrapedContent): Promise<string> {
    // For now, generate a simple summary
    // Later, this can be enhanced with actual AI integration
    const { text, metadata, images, videos } = content;
    
    let synthesis = `**${metadata.title}**\n\n`;
    
    if (metadata.description) {
      synthesis += `${metadata.description}\n\n`;
    }
    
    synthesis += `**Contenu principal:**\n`;
    
    // Take first 500 words as summary
    const words = text.split(/\s+/).slice(0, 500).join(' ');
    synthesis += `${words}${text.split(/\s+/).length > 500 ? '...' : ''}\n\n`;
    
    synthesis += `**Statistiques:**\n`;
    synthesis += `- Nombre de mots: ${metadata.wordCount}\n`;
    synthesis += `- Images trouvées: ${images.length}\n`;
    synthesis += `- Vidéos trouvées: ${videos.length}\n`;
    
    if (metadata.keywords.length > 0) {
      synthesis += `- Mots-clés: ${metadata.keywords.join(', ')}\n`;
    }
    
    if (metadata.author) {
      synthesis += `- Auteur: ${metadata.author}\n`;
    }
    
    if (metadata.publishDate) {
      synthesis += `- Date de publication: ${new Date(metadata.publishDate).toLocaleDateString()}\n`;
    }
    
    return synthesis;
  }

  async deepCrawl(baseUrl: string, options?: {
    maxPages?: number;
    maxDepth?: number;
    sameDomainOnly?: boolean;
    excludePatterns?: string[];
    includeImages?: boolean;
    delay?: number;
  }): Promise<DeepCrawlResult> {
    const {
      maxPages = 10,
      maxDepth = 2,
      sameDomainOnly = true,
      excludePatterns = ['/admin', '/login', '/api', '.pdf', '.jpg', '.png', '.gif'],
      includeImages = false,
      delay = 1000,
    } = options || {};

    this.logger.log(`Starting deep crawl of ${baseUrl} - max pages: ${maxPages}, max depth: ${maxDepth}`);

    const baseDomain = new URL(baseUrl).hostname;
    const visitedUrls = new Set<string>();
    const urlQueue: Array<{ url: string; depth: number }> = [{ url: baseUrl, depth: 0 }];
    const crawledPages: DeepCrawlResult['pages'] = [];
    const errors: DeepCrawlResult['errors'] = [];
    const foundUrls = new Set<string>();

    while (urlQueue.length > 0 && crawledPages.length < maxPages) {
      const { url: currentUrl, depth } = urlQueue.shift()!;

      // Skip if already visited or too deep
      if (visitedUrls.has(currentUrl) || depth > maxDepth) {
        continue;
      }

      // Skip excluded patterns
      if (excludePatterns.some(pattern => currentUrl.includes(pattern))) {
        continue;
      }

      visitedUrls.add(currentUrl);

      try {
        this.logger.log(`Crawling page ${crawledPages.length + 1}/${maxPages}: ${currentUrl} (depth: ${depth})`);

        // Scrape the current page
        const scrapedContent = await this.scrapeUrl(currentUrl, {
          includeImages,
          removeSelectors: ['nav', 'footer', '.sidebar', '.menu', '.navigation']
        });

        crawledPages.push({
          url: currentUrl,
          content: scrapedContent,
          crawledAt: new Date().toISOString(),
        });

        // Extract and queue new URLs from this page if we haven't reached max depth
        if (depth < maxDepth) {
          const newUrls = this.extractUrlsFromContent(currentUrl, scrapedContent, baseDomain, sameDomainOnly);
          
          for (const newUrl of newUrls) {
            if (!visitedUrls.has(newUrl) && !foundUrls.has(newUrl)) {
              foundUrls.add(newUrl);
              urlQueue.push({ url: newUrl, depth: depth + 1 });
            }
          }
        }

        // Respectful delay between requests
        if (delay > 0 && urlQueue.length > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }

      } catch (error) {
        this.logger.error(`Failed to crawl ${currentUrl}: ${error.message}`);
        errors.push({
          url: currentUrl,
          error: error.message,
        });
      }
    }

    const result: DeepCrawlResult = {
      baseUrl,
      pages: crawledPages,
      totalPagesFound: foundUrls.size + 1, // +1 for the base URL
      totalPagesCrawled: crawledPages.length,
      errors,
    };

    this.logger.log(`Deep crawl completed: ${result.totalPagesCrawled}/${result.totalPagesFound} pages crawled`);
    return result;
  }

  private extractUrlsFromContent(
    currentUrl: string,
    content: ScrapedContent,
    baseDomain: string,
    sameDomainOnly: boolean
  ): string[] {
    const urls: string[] = [];
    const currentUrlObj = new URL(currentUrl);

    // Extract URLs from the links found during scraping
    for (const link of content.links) {
      try {
        let fullUrl = link.url;
        
        // Handle relative URLs
        if (link.url.startsWith('/')) {
          fullUrl = `${currentUrlObj.protocol}//${currentUrlObj.host}${link.url}`;
        } else if (link.url.startsWith('./') || !link.url.startsWith('http')) {
          fullUrl = new URL(link.url, currentUrl).href;
        }

        const urlObj = new URL(fullUrl);
        
        // Apply domain filtering if specified
        if (sameDomainOnly && urlObj.hostname !== baseDomain) {
          continue;
        }

        // Remove fragments and normalize
        urlObj.hash = '';
        const normalizedUrl = urlObj.href;

        // Only include HTTP/HTTPS URLs
        if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
          urls.push(normalizedUrl);
        }
      } catch (error) {
        // Skip invalid URLs
        continue;
      }
    }

    return [...new Set(urls)]; // Remove duplicates
  }

  private extractFromJavaScript($: any, html: string): string {
    this.logger.log('Extracting data from JavaScript/Next.js scripts...');
    
    let extractedText = '';
    
    // Extract from Next.js __next_f data
    const nextDataMatches = html.match(/self\.__next_f\.push\(\[1,"[^"]*?(\{[^}]*?(?:"name"|"title"|"description"|"price")[^}]*?\})[^"]*?"\]\)/g);
    if (nextDataMatches) {
      nextDataMatches.forEach(match => {
        try {
          // Extract JSON-like data from Next.js chunks
          const nameMatch = match.match(/"name":"([^"]+)"/);
          const titleMatch = match.match(/"title":"([^"]+)"/);
          const descMatch = match.match(/"description":"([^"]+)"/);
          const priceMatches = match.match(/"(?:price|basePrice|salePrice|base_price|sale_price)":"?([0-9.]+)"?/g);
          const skuMatch = match.match(/"sku":"([^"]+)"/);
          const categoryMatch = match.match(/"category":\{[^}]*"name":"([^"]+)"/);
          
          if (nameMatch) {
            extractedText += nameMatch[1] + ' ';
            this.logger.log(`Found product name: ${nameMatch[1]}`);
          }
          if (titleMatch) {
            extractedText += titleMatch[1] + ' ';
          }
          if (descMatch) {
            // Clean HTML tags and decode entities
            const cleanDesc = descMatch[1].replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
            extractedText += cleanDesc + ' ';
            this.logger.log(`Found description: ${cleanDesc.substring(0, 100)}...`);
          }
          if (priceMatches) {
            priceMatches.forEach(priceMatch => {
              const price = priceMatch.match(/([0-9.]+)/)[1];
              extractedText += `Prix: ${price} `;
            });
          }
          if (skuMatch) {
            extractedText += `SKU: ${skuMatch[1]} `;
          }
          if (categoryMatch) {
            extractedText += `Catégorie: ${categoryMatch[1]} `;
          }
        } catch (e) {
          // Continue processing other matches
        }
      });
    }

    // Also try to extract from any JSON objects in scripts
    $('script').each((i, script) => {
      const scriptContent = $(script).html();
      if (scriptContent && scriptContent.includes('"name"') && scriptContent.includes('product')) {
        // Look for product-like JSON structures
        const productJsonMatches = scriptContent.match(/\{[^{}]*"name"[^{}]*\}/g);
        if (productJsonMatches) {
          productJsonMatches.forEach(match => {
            try {
              const productData = JSON.parse(match);
              if (productData.name) {
                extractedText += productData.name + ' ';
              }
              if (productData.description) {
                extractedText += productData.description.replace(/<[^>]*>/g, '') + ' ';
              }
              if (productData.price) {
                extractedText += `Prix: ${productData.price} `;
              }
            } catch (e) {
              // Invalid JSON, skip
            }
          });
        }
      }
    });

    const cleanedText = extractedText.replace(/\s+/g, ' ').trim();
    this.logger.log(`JavaScript extraction result: ${cleanedText.length} characters`);
    
    return cleanedText;
  }

  async generateDeepCrawlSynthesis(crawlResult: DeepCrawlResult): Promise<string> {
    const { pages, totalPagesCrawled, errors } = crawlResult;
    
    let synthesis = `**Crawl complet du site: ${crawlResult.baseUrl}**\n\n`;
    synthesis += `**Résumé du crawl:**\n`;
    synthesis += `- Pages explorées: ${totalPagesCrawled}\n`;
    synthesis += `- Pages trouvées au total: ${crawlResult.totalPagesFound}\n`;
    synthesis += `- Erreurs rencontrées: ${errors.length}\n\n`;

    if (errors.length > 0) {
      synthesis += `**Pages en erreur:**\n`;
      errors.forEach(error => {
        synthesis += `- ${error.url}: ${error.error}\n`;
      });
      synthesis += '\n';
    }

    synthesis += `**Contenu agrégé de toutes les pages:**\n\n`;

    // Aggregate statistics
    const totalWords = pages.reduce((sum, page) => sum + page.content.metadata.wordCount, 0);
    const totalImages = pages.reduce((sum, page) => sum + page.content.images.length, 0);
    const totalVideos = pages.reduce((sum, page) => sum + page.content.videos.length, 0);
    const allKeywords = pages.flatMap(page => page.content.metadata.keywords).filter(k => k);
    const uniqueKeywords = [...new Set(allKeywords)];

    synthesis += `**Statistiques globales:**\n`;
    synthesis += `- Nombre total de mots: ${totalWords}\n`;
    synthesis += `- Images trouvées: ${totalImages}\n`;
    synthesis += `- Vidéos trouvées: ${totalVideos}\n`;
    if (uniqueKeywords.length > 0) {
      synthesis += `- Mots-clés uniques: ${uniqueKeywords.slice(0, 20).join(', ')}${uniqueKeywords.length > 20 ? '...' : ''}\n`;
    }
    synthesis += '\n';

    synthesis += `**Détail par page:**\n`;
    pages.forEach((page, index) => {
      synthesis += `\n**${index + 1}. ${page.content.metadata.title || 'Sans titre'}**\n`;
      synthesis += `URL: ${page.url}\n`;
      synthesis += `Mots: ${page.content.metadata.wordCount}\n`;
      
      if (page.content.metadata.description) {
        synthesis += `Description: ${page.content.metadata.description}\n`;
      }

      // Include first 200 words of content
      const firstWords = page.content.text.split(/\s+/).slice(0, 200).join(' ');
      synthesis += `Extrait: ${firstWords}${page.content.metadata.wordCount > 200 ? '...' : ''}\n`;
    });

    return synthesis;
  }
}