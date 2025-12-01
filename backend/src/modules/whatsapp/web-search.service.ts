import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
}

export interface WebSearchResponse {
  query: string;
  results: SearchResult[];
  totalResults: number;
}

@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);
  private httpClient: AxiosInstance;

  constructor(private configService: ConfigService) {
    this.httpClient = axios.create({
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WizeApp-Bot/1.0)",
      },
    });
  }

  /**
   * Search the web using DuckDuckGo Instant Answer API (free)
   */
  async searchWeb(
    query: string,
    maxResults: number = 5,
  ): Promise<WebSearchResponse> {
    try {
      this.logger.log(`Searching web for: "${query}"`);

      // Use DuckDuckGo Instant Answer API (free, no API key required)
      const response = await this.httpClient.get(
        `https://api.duckduckgo.com/`,
        {
          params: {
            q: query,
            format: "json",
            no_html: "1",
            skip_disambig: "1",
          },
        },
      );

      const data = response.data;
      const results: SearchResult[] = [];

      // Extract instant answer if available
      if (data.AbstractText && data.AbstractSource) {
        results.push({
          title: data.Heading || "Instant Answer",
          url: data.AbstractURL || data.AbstractSource,
          snippet: data.AbstractText,
        });
      }

      // Extract related topics
      if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics.slice(
          0,
          maxResults - results.length,
        )) {
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Result || "Related Topic",
              url: topic.FirstURL,
              snippet: topic.Text,
            });
          }
        }
      }

      // If no results from DuckDuckGo, try a fallback search
      if (results.length === 0) {
        const fallbackResults = await this.fallbackSearch(query, maxResults);
        results.push(...fallbackResults);
      }

      return {
        query,
        results,
        totalResults: results.length,
      };
    } catch (error) {
      this.logger.error(`Web search failed: ${error.message}`);

      // Try fallback search
      try {
        const fallbackResults = await this.fallbackSearch(query, maxResults);
        return {
          query,
          results: fallbackResults,
          totalResults: fallbackResults.length,
        };
      } catch (fallbackError) {
        this.logger.error(
          `Fallback search also failed: ${fallbackError.message}`,
        );
        return {
          query,
          results: [],
          totalResults: 0,
        };
      }
    }
  }

  /**
   * Fallback search using Wikipedia API
   */
  private async fallbackSearch(
    query: string,
    maxResults: number,
  ): Promise<SearchResult[]> {
    try {
      this.logger.log(`Using Wikipedia fallback search for: "${query}"`);

      // Search Wikipedia
      const searchResponse = await this.httpClient.get(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`,
      );

      if (searchResponse.data && searchResponse.data.extract) {
        return [
          {
            title: searchResponse.data.title || query,
            url:
              searchResponse.data.content_urls?.desktop?.page ||
              `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`,
            snippet: searchResponse.data.extract,
            publishedDate: searchResponse.data.timestamp,
          },
        ];
      }

      return [];
    } catch (error) {
      this.logger.warn(`Wikipedia fallback search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Format search results into a readable context for the AI
   */
  formatSearchResults(searchResponse: WebSearchResponse): string {
    if (searchResponse.results.length === 0) {
      return `RECHERCHE WEB: Aucun résultat trouvé pour "${searchResponse.query}".`;
    }

    const formattedResults = searchResponse.results
      .slice(0, 3) // Limit to top 3 results to avoid token overload
      .map((result, index) => {
        return `**Résultat ${index + 1}: ${result.title}**
Source: ${result.url}
${result.snippet}`;
      })
      .join("\n\n---\n\n");

    return `RECHERCHE WEB pour "${searchResponse.query}":

${formattedResults}

Utilise ces informations récentes pour enrichir ta réponse si elles sont pertinentes à la question.`;
  }

  /**
   * Determine if a query needs web search
   */
  shouldSearchWeb(query: string, knowledgeBaseContext: string): boolean {
    // Don't search if we have good knowledge base content
    if (knowledgeBaseContext && knowledgeBaseContext.length > 100) {
      return false;
    }

    // Search for current events, news, recent information
    const searchIndicators = [
      "actualité",
      "actualités",
      "news",
      "récent",
      "récente",
      "aujourd'hui",
      "maintenant",
      "prix",
      "coût",
      "tarif",
      "combien",
      "où acheter",
      "disponible",
      "sortie",
      "nouveau",
      "nouvelle",
      "dernière version",
      "mise à jour",
      "2024",
      "2025",
      "cette année",
      "ce mois",
      "météo",
      "temps qu'il fait",
      "température",
      "bourse",
      "action",
      "crypto",
      "bitcoin",
    ];

    const lowerQuery = query.toLowerCase();
    return searchIndicators.some((indicator) => lowerQuery.includes(indicator));
  }
}
