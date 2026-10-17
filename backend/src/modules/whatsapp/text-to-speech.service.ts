import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Turns a reply into a voice note. WhatsApp plays OGG/Opus as a proper
 * "push to talk" bubble, and OpenAI can emit that container directly, so no
 * ffmpeg pass is needed.
 */
@Injectable()
export class TextToSpeechService {
  private readonly logger = new Logger(TextToSpeechService.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly defaultVoice: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>("OPENAI_API_KEY", "");
    this.model = this.configService.get<string>("OPENAI_TTS_MODEL", "gpt-4o-mini-tts");
    this.defaultVoice = this.configService.get<string>("OPENAI_TTS_VOICE", "alloy");
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Synthesize `text` and return an OGG/Opus buffer. Long replies are capped:
   * a voice note past a couple of minutes is not something anyone listens to.
   */
  async synthesize(
    text: string,
    options: { voice?: string; speed?: number } = {},
  ): Promise<{ buffer: Buffer; mimetype: string }> {
    if (!this.isConfigured()) {
      throw new Error("OPENAI_API_KEY is not configured — voice replies unavailable");
    }
    const input = String(text || "").trim().slice(0, 4000);
    if (!input) {
      throw new Error("Nothing to synthesize");
    }

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        voice: options.voice || this.defaultVoice,
        input,
        response_format: "opus",
        speed: options.speed ?? 1.0,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`TTS failed (${response.status}): ${detail.slice(0, 200)}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    this.logger.debug?.(`Synthesized ${input.length} chars → ${buffer.length} bytes opus`);
    return { buffer, mimetype: "audio/ogg; codecs=opus" };
  }
}
