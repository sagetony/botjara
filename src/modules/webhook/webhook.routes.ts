import { Router } from 'express';
import { verifyWebhook, handleWebhook } from './webhook.controller';

const router = Router();

// GET /webhook/whatsapp — Meta verification handshake
router.get('/whatsapp', verifyWebhook);

// POST /webhook/whatsapp — Incoming messages from Meta
router.post('/whatsapp', handleWebhook);

export default router;
