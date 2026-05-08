import OpenAI from 'openai';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import logger from '../../utils/logger';
import { ITenant } from '../tenants/tenant.model';
import { downloadMedia } from '../messaging/whatsapp.sender';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const transcribeAudio = async (
  tenant: ITenant,
  mediaId: string
): Promise<string | null> => {
  let tempFilePath: string | null = null;

  try {
    // 1. Get media download URL from WhatsApp
    const mediaInfo = await downloadMedia(tenant, mediaId);
    if (!mediaInfo) return null;

    // 2. Download the audio file
    const response = await axios.get(mediaInfo.url, {
      responseType: 'arraybuffer',
      headers: { Authorization: `Bearer ${tenant.whatsappAccessToken}` },
    });

    // 3. Save to temp file (Whisper requires a file)
    const ext = mediaInfo.mimeType.includes('ogg') ? 'ogg' : 'mp4';
    tempFilePath = path.join('/tmp', `voice_${Date.now()}.${ext}`);
    fs.writeFileSync(tempFilePath, response.data);

    // 4. Transcribe with Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: 'whisper-1',
      language: 'en', // handles Nigerian English, Pidgin well enough
    });

    logger.info(`🎤 Transcription: "${transcription.text.substring(0, 80)}..."`);
    return transcription.text;

  } catch (error) {
    logger.error('❌ Voice transcription failed:', error);
    return null;
  } finally {
    // Always clean up temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
};
