import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import Groq from 'groq-sdk';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const ALLOWED_WHISPER_LANGUAGES = [
  'auto', 'en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'ru', 'zh', 'ja',
  'ko', 'ar', 'tr', 'vi', 'th', 'id', 'ms', 'hi', 'bn', 'ta', 'te', 'ur',
  'sw', 'uk', 'cs', 'ro', 'hu', 'el', 'bg', 'sr', 'hr', 'sk', 'sl', 'lt',
  'lv', 'et', 'fi', 'da', 'no', 'sv', 'is', 'he', 'fa', 'af',
];

export interface AudioTranscriptionResult {
  success: boolean;
  text?: string;
  language?: string;
  duration?: number;
  confidence?: number;
  error?: string;
  provider: 'groq-whisper' | 'whisper-cpp' | 'whisper-node' | 'none';
}

@Injectable()
export class AudioTranscriptionService {
  private readonly logger = new Logger(AudioTranscriptionService.name);
  private readonly tempDir: string;
  private groqClient: Groq | null = null;
  private whisperAvailable = false;
  private whisperModelPath: string;

  constructor(private configService: ConfigService) {
    this.tempDir = path.join(process.cwd(), 'temp', 'audio');
    this.whisperModelPath = this.configService.get('WHISPER_MODEL_PATH', './models/ggml-base.bin');

    // Initialize Groq client if API key is available
    const groqApiKey = this.configService.get('GROQ_API_KEY');
    if (groqApiKey) {
      this.groqClient = new Groq({ apiKey: groqApiKey });
      this.logger.log('Groq Whisper API initialized');
    } else {
      this.logger.warn('GROQ_API_KEY not set - Groq Whisper transcription disabled');
    }

    // Ensure temp directory exists
    this.ensureTempDirectory();

    // Check local whisper availability as fallback
    this.checkWhisperAvailability();
  }

  /**
   * Transcrire un buffer audio en texte
   * Priorité: 1. Groq Whisper API, 2. Whisper.cpp local, 3. whisper-node
   */
  async transcribeAudio(
    audioBuffer: Buffer,
    options?: {
      language?: string;
      filename?: string;
      mimetype?: string;
    }
  ): Promise<AudioTranscriptionResult> {
    const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB (Groq/Whisper limit)
    if (audioBuffer.length > MAX_AUDIO_SIZE) {
      return {
        success: false,
        error: `Audio file too large (${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB). Maximum is 25MB.`,
        provider: 'none',
      };
    }

    let tempFilePath: string | null = null;

    try {
      // Sauvegarder temporairement l'audio
      tempFilePath = await this.saveAudioToTemp(audioBuffer, options?.mimetype);

      this.logger.log(`Transcribing audio file: ${tempFilePath} (${audioBuffer.length} bytes)`);

      // 1. Essayer Groq Whisper API d'abord (gratuit et rapide)
      if (this.groqClient) {
        const groqResult = await this.transcribeWithGroq(tempFilePath, options?.language);
        if (groqResult.success) {
          return groqResult;
        }
        this.logger.warn('Groq Whisper failed, trying local Whisper...');
      }

      // 2. Essayer whisper.cpp local
      if (this.whisperAvailable) {
        const wavFilePath = await this.convertToWav(tempFilePath);
        try {
          const result = await this.transcribeWithWhisperCpp(wavFilePath, options?.language);
          if (result.success) {
            return result;
          }
        } finally {
          if (wavFilePath !== tempFilePath) {
            await this.cleanupTempFiles([wavFilePath]);
          }
        }
        this.logger.warn('Whisper.cpp failed, trying whisper-node...');
      }

      // 3. Fallback: essayer whisper-node
      const nodeResult = await this.transcribeWithWhisperNode(tempFilePath, options?.language);
      if (nodeResult.success) {
        return nodeResult;
      }

      // Aucun service disponible
      return {
        success: false,
        error: 'No transcription service available. Set GROQ_API_KEY or install whisper.cpp.',
        provider: 'none'
      };

    } catch (error) {
      this.logger.error(`Audio transcription failed: ${error.message}`);

      return {
        success: false,
        error: `Transcription failed: ${error.message}`,
        provider: 'none'
      };
    } finally {
      // Nettoyer les fichiers temporaires
      await this.cleanupTempFiles([tempFilePath]);
    }
  }

  /**
   * Transcrire avec Groq Whisper API (gratuit et rapide)
   */
  private async transcribeWithGroq(
    audioPath: string,
    language?: string
  ): Promise<AudioTranscriptionResult> {
    if (!this.groqClient) {
      return {
        success: false,
        error: 'Groq client not initialized',
        provider: 'groq-whisper'
      };
    }

    try {
      this.logger.log('Transcribing with Groq Whisper API...');

      // Lire le fichier audio
      const audioFile = fsSync.createReadStream(audioPath);

      // Appeler l'API Groq Whisper
      const transcription = await this.groqClient.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-large-v3-turbo', // Modèle rapide et précis
        language: language || undefined, // Auto-detect si non spécifié
        response_format: 'verbose_json',
      });

      const text = transcription.text?.trim();

      if (!text) {
        return {
          success: false,
          error: 'No text returned from Groq Whisper',
          provider: 'groq-whisper'
        };
      }

      this.logger.log(`Groq Whisper transcription successful: "${text.substring(0, 100)}..."`);

      return {
        success: true,
        text,
        language: (transcription as unknown as Record<string, unknown>).language as string || language,
        duration: (transcription as unknown as Record<string, unknown>).duration as number,
        confidence: 0.95, // Groq Whisper est très précis
        provider: 'groq-whisper'
      };

    } catch (error) {
      this.logger.error(`Groq Whisper transcription failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        provider: 'groq-whisper'
      };
    }
  }

  /**
   * Transcrire avec Whisper.cpp (solution native optimisée)
   */
  private async transcribeWithWhisperCpp(
    audioPath: string,
    language?: string
  ): Promise<AudioTranscriptionResult> {
    try {
      const whisperCmd = this.configService.get('WHISPER_CPP_PATH', 'whisper');
      const modelPath = this.whisperModelPath;

      const args = ['-m', modelPath, '-f', audioPath, '--output-txt'];

      if (language && ALLOWED_WHISPER_LANGUAGES.includes(language)) {
        args.push('-l', language);
      }

      args.push('--threads', '4', '--best-of', '5', '--beam-size', '5');

      this.logger.debug(`Running whisper.cpp command: ${whisperCmd} ${args.join(' ')}`);

      const { stdout } = await execFileAsync(whisperCmd, args, {
        timeout: 60000,
        maxBuffer: 1024 * 1024
      });

      const outputTxtPath = audioPath.replace(/\.[^/.]+$/, '') + '.txt';

      let transcribedText = '';
      try {
        transcribedText = await fs.readFile(outputTxtPath, 'utf-8');
        await fs.unlink(outputTxtPath).catch(() => {});
      } catch {
        transcribedText = this.parseWhisperOutput(stdout);
      }

      return {
        success: true,
        text: transcribedText.trim(),
        provider: 'whisper-cpp',
        confidence: 0.9
      };

    } catch (error) {
      this.logger.warn(`Whisper.cpp transcription failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        provider: 'whisper-cpp'
      };
    }
  }

  /**
   * Transcrire avec whisper-node (fallback JavaScript)
   */
  private async transcribeWithWhisperNode(
    audioPath: string,
    language?: string
  ): Promise<AudioTranscriptionResult> {
    try {
      const whisper = require('whisper-node');

      const options = {
        modelName: 'base.en',
        whisperOptions: {
          language: language || 'auto',
          gen_file_txt: false,
          gen_file_subtitle: false,
          gen_file_vtt: false,
          word_timestamps: false
        }
      };

      this.logger.log('Transcribing with whisper-node...');

      const transcript = await whisper(audioPath, options);
      const text = transcript.map((item: any) => item.speech).join(' ').trim();

      return {
        success: true,
        text,
        provider: 'whisper-node',
        confidence: 0.85
      };

    } catch (error) {
      this.logger.warn(`whisper-node transcription failed: ${error.message}`);
      return {
        success: false,
        error: `whisper-node not available: ${error.message}`,
        provider: 'whisper-node'
      };
    }
  }

  /**
   * Parser la sortie de whisper.cpp
   */
  private parseWhisperOutput(output: string): string {
    const lines = output.split('\n');
    const textLines = lines
      .filter(line => line.includes(']'))
      .map(line => {
        const match = line.match(/\]\s*(.+)$/);
        return match ? match[1].trim() : '';
      })
      .filter(text => text.length > 0);

    return textLines.join(' ');
  }

  /**
   * Convertir l'audio en WAV pour whisper local
   */
  private async convertToWav(inputPath: string): Promise<string> {
    const outputPath = inputPath.replace(/\.[^/.]+$/, '') + '.wav';

    try {
      await execFileAsync('ffmpeg', ['-i', inputPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', outputPath, '-y'], { timeout: 30000 });

      this.logger.debug(`Audio converted to WAV: ${outputPath}`);
      return outputPath;
    } catch (ffmpegError) {
      this.logger.warn(`FFmpeg conversion failed: ${ffmpegError.message}`);
      return inputPath;
    }
  }

  /**
   * Vérifier si whisper.cpp est disponible
   */
  private async checkWhisperAvailability(): Promise<void> {
    try {
      const whisperCmd = this.configService.get('WHISPER_CPP_PATH', 'whisper');
      await execAsync(`${whisperCmd} --help`, { timeout: 5000 });

      try {
        await fs.access(this.whisperModelPath);
        this.whisperAvailable = true;
        this.logger.log('Whisper.cpp is available and ready');
      } catch {
        this.logger.warn(`Whisper model not found at: ${this.whisperModelPath}`);
        this.whisperAvailable = false;
      }
    } catch {
      this.logger.warn('Whisper.cpp not available');
      this.whisperAvailable = false;
    }
  }

  /**
   * Vérifier si le service de transcription est disponible
   */
  isTranscriptionAvailable(): boolean {
    return !!this.groqClient || this.whisperAvailable || this.isWhisperNodeAvailable();
  }

  /**
   * Vérifier si whisper-node est disponible
   */
  private isWhisperNodeAvailable(): boolean {
    try {
      require.resolve('whisper-node');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Obtenir le status des services de transcription
   */
  async getTranscriptionStatus(): Promise<{
    groqWhisper: boolean;
    whisperCpp: boolean;
    whisperNode: boolean;
    ffmpeg: boolean;
    recommended: string;
  }> {
    const status = {
      groqWhisper: !!this.groqClient,
      whisperCpp: this.whisperAvailable,
      whisperNode: this.isWhisperNodeAvailable(),
      ffmpeg: false,
      recommended: 'none'
    };

    try {
      await execAsync('ffmpeg -version', { timeout: 3000 });
      status.ffmpeg = true;
    } catch {
      status.ffmpeg = false;
    }

    if (status.groqWhisper) {
      status.recommended = 'Groq Whisper API (optimal, gratuit)';
    } else if (status.whisperCpp) {
      status.recommended = 'whisper.cpp (local)';
    } else if (status.whisperNode) {
      status.recommended = 'whisper-node';
    } else {
      status.recommended = 'Set GROQ_API_KEY for best results';
    }

    return status;
  }

  /**
   * Sauvegarder l'audio dans un fichier temporaire
   */
  private async saveAudioToTemp(
    audioBuffer: Buffer,
    mimetype?: string
  ): Promise<string> {
    await this.ensureTempDirectory();

    const hash = crypto.createHash('md5').update(audioBuffer).digest('hex');
    const extension = this.getAudioExtension(mimetype);
    const filename = `audio_${hash}_${Date.now()}${extension}`;
    const filepath = path.join(this.tempDir, filename);

    await fs.writeFile(filepath, audioBuffer);

    this.logger.debug(`Audio saved to temp file: ${filepath} (${audioBuffer.length} bytes)`);
    return filepath;
  }

  /**
   * Obtenir l'extension de fichier basée sur le mimetype
   */
  private getAudioExtension(mimetype?: string): string {
    if (!mimetype) return '.ogg';

    const mimeMap: Record<string, string> = {
      'audio/ogg': '.ogg',
      'audio/mpeg': '.mp3',
      'audio/mp4': '.m4a',
      'audio/wav': '.wav',
      'audio/webm': '.webm',
      'audio/flac': '.flac',
      'audio/x-m4a': '.m4a',
      'audio/opus': '.opus',
      'audio/ogg; codecs=opus': '.ogg'
    };

    return mimeMap[mimetype.toLowerCase()] || '.ogg';
  }

  /**
   * S'assurer que le répertoire temporaire existe
   */
  private async ensureTempDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      this.logger.warn(`Failed to create temp directory: ${error.message}`);
    }
  }

  /**
   * Nettoyer les fichiers temporaires
   */
  private async cleanupTempFiles(filePaths: (string | null)[]): Promise<void> {
    for (const filepath of filePaths) {
      if (filepath) {
        try {
          await fs.unlink(filepath);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }
}
