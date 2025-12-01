import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface AudioTranscriptionResult {
  success: boolean;
  text?: string;
  language?: string;
  duration?: number;
  confidence?: number;
  error?: string;
  provider: 'whisper-cpp' | 'whisper-node' | 'vosk' | 'none';
}

@Injectable()
export class AudioTranscriptionService {
  private readonly logger = new Logger(AudioTranscriptionService.name);
  private readonly tempDir: string;
  private whisperAvailable = false;
  private whisperModelPath: string;

  constructor(private configService: ConfigService) {
    this.tempDir = path.join(process.cwd(), 'temp', 'audio');
    this.whisperModelPath = this.configService.get('WHISPER_MODEL_PATH', './models/ggml-base.bin');
    
    // Ensure temp directory exists
    this.ensureTempDirectory();
    
    // Check whisper availability
    this.checkWhisperAvailability();
  }

  /**
   * Transcrire un buffer audio en texte avec Whisper.cpp
   */
  async transcribeAudio(
    audioBuffer: Buffer,
    options?: {
      language?: string;
      filename?: string;
      mimetype?: string;
    }
  ): Promise<AudioTranscriptionResult> {
    let tempFilePath: string | null = null;
    let wavFilePath: string | null = null;

    try {
      // Sauvegarder temporairement l'audio
      tempFilePath = await this.saveAudioToTemp(audioBuffer, options?.mimetype);
      
      // Convertir en WAV si nécessaire (Whisper.cpp préfère WAV)
      wavFilePath = await this.convertToWav(tempFilePath);
      
      this.logger.log(`Transcribing audio file with Whisper.cpp: ${wavFilePath}`);

      // Essayer whisper.cpp d'abord
      if (this.whisperAvailable) {
        const result = await this.transcribeWithWhisperCpp(wavFilePath, options?.language);
        if (result.success) {
          return result;
        }
        this.logger.warn('Whisper.cpp failed, trying Node.js Whisper...');
      }

      // Fallback: essayer whisper-node
      const nodeResult = await this.transcribeWithWhisperNode(wavFilePath, options?.language);
      if (nodeResult.success) {
        return nodeResult;
      }

      // Fallback: analyse basique
      return {
        success: false,
        error: 'No transcription service available. Install whisper.cpp or whisper-node.',
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
      await this.cleanupTempFiles([tempFilePath, wavFilePath]);
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
      // Commande whisper.cpp
      const whisperCmd = this.configService.get('WHISPER_CPP_PATH', 'whisper');
      const modelPath = this.whisperModelPath;
      
      let cmd = `${whisperCmd} -m "${modelPath}" -f "${audioPath}" --output-txt`;
      
      // Spécifier la langue si fournie
      if (language) {
        cmd += ` -l ${language}`;
      }
      
      // Options additionnelles pour améliorer la qualité
      cmd += ' --threads 4 --best-of 5 --beam-size 5';

      this.logger.debug(`Running whisper.cpp command: ${cmd}`);
      
      const { stdout, stderr } = await execAsync(cmd, { 
        timeout: 60000, // 60 secondes max
        maxBuffer: 1024 * 1024 // 1MB buffer
      });

      // Lire le fichier de sortie .txt
      const outputTxtPath = audioPath.replace(/\.[^/.]+$/, '') + '.txt';
      
      let transcribedText = '';
      try {
        transcribedText = await fs.readFile(outputTxtPath, 'utf-8');
        // Nettoyer le fichier de sortie
        await fs.unlink(outputTxtPath).catch(() => {});
      } catch {
        // Si pas de fichier .txt, essayer de parser stdout
        transcribedText = this.parseWhisperOutput(stdout);
      }

      const result: AudioTranscriptionResult = {
        success: true,
        text: transcribedText.trim(),
        provider: 'whisper-cpp',
        confidence: 0.9 // Whisper est généralement très précis
      };

      this.logger.log(`Whisper.cpp transcription successful: "${result.text?.substring(0, 100)}..."`);
      return result;

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
      // Essayer d'importer whisper-node dynamiquement
      const whisper = require('whisper-node');
      
      const options = {
        modelName: 'base.en', // Modèle par défaut
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
      
      // whisper-node retourne un array d'objets avec timestamps
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
    // Whisper.cpp output format: [timestamp] text
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
   * Convertir l'audio en WAV pour whisper
   */
  private async convertToWav(inputPath: string): Promise<string> {
    const outputPath = inputPath.replace(/\.[^/.]+$/, '') + '.wav';
    
    try {
      // Essayer avec ffmpeg d'abord
      const ffmpegCmd = `ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${outputPath}" -y`;
      await execAsync(ffmpegCmd, { timeout: 30000 });
      
      this.logger.debug(`Audio converted to WAV: ${outputPath}`);
      return outputPath;
    } catch (ffmpegError) {
      this.logger.warn(`FFmpeg conversion failed, trying with sox: ${ffmpegError.message}`);
      
      try {
        // Fallback: essayer avec sox
        const soxCmd = `sox "${inputPath}" -r 16000 -c 1 "${outputPath}"`;
        await execAsync(soxCmd, { timeout: 30000 });
        return outputPath;
      } catch (soxError) {
        this.logger.warn(`Sox conversion failed, using original file: ${soxError.message}`);
        // Si la conversion échoue, utiliser le fichier original
        return inputPath;
      }
    }
  }

  /**
   * Vérifier si whisper.cpp est disponible
   */
  private async checkWhisperAvailability(): Promise<void> {
    try {
      const whisperCmd = this.configService.get('WHISPER_CPP_PATH', 'whisper');
      await execAsync(`${whisperCmd} --help`, { timeout: 5000 });
      
      // Vérifier si le modèle existe
      try {
        await fs.access(this.whisperModelPath);
        this.whisperAvailable = true;
        this.logger.log('Whisper.cpp is available and ready');
      } catch {
        this.logger.warn(`Whisper model not found at: ${this.whisperModelPath}`);
        this.logger.log('Download models with: ./scripts/download-whisper-models.sh');
        this.whisperAvailable = false;
      }
    } catch (error) {
      this.logger.warn('Whisper.cpp not available, will use fallbacks');
      this.whisperAvailable = false;
    }
  }

  /**
   * Vérifier si le service de transcription est disponible
   */
  isTranscriptionAvailable(): boolean {
    return this.whisperAvailable || this.isWhisperNodeAvailable();
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
    whisperCpp: boolean;
    whisperNode: boolean;
    ffmpeg: boolean;
    modelPath: string;
    recommended: string;
  }> {
    const status = {
      whisperCpp: this.whisperAvailable,
      whisperNode: this.isWhisperNodeAvailable(),
      ffmpeg: false,
      modelPath: this.whisperModelPath,
      recommended: 'none'
    };

    // Vérifier FFmpeg
    try {
      await execAsync('ffmpeg -version', { timeout: 3000 });
      status.ffmpeg = true;
    } catch {
      status.ffmpeg = false;
    }

    // Déterminer la recommandation
    if (status.whisperCpp) {
      status.recommended = 'whisper.cpp (optimal)';
    } else if (status.whisperNode) {
      status.recommended = 'whisper-node (good)';
    } else {
      status.recommended = 'install whisper.cpp for best results';
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

    // Générer un nom de fichier unique
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
    if (!mimetype) return '.ogg'; // Default pour WhatsApp

    const mimeMap: Record<string, string> = {
      'audio/ogg': '.ogg',
      'audio/mpeg': '.mp3',
      'audio/mp4': '.m4a',
      'audio/wav': '.wav',
      'audio/webm': '.webm',
      'audio/flac': '.flac',
      'audio/x-m4a': '.m4a'
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
        } catch (error) {
          this.logger.debug(`Failed to cleanup temp file ${filepath}: ${error.message}`);
        }
      }
    }
  }

  /**
   * Nettoyer les fichiers temporaires anciens
   */
  async cleanupOldTempFiles(olderThanHours: number = 24): Promise<void> {
    try {
      const files = await fs.readdir(this.tempDir);
      const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);

      for (const file of files) {
        const filepath = path.join(this.tempDir, file);
        const stats = await fs.stat(filepath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          await fs.unlink(filepath);
          this.logger.debug(`Cleaned up old temp file: ${file}`);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to cleanup temp files: ${error.message}`);
    }
  }
}