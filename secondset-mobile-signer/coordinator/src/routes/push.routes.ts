// coordinator/src/routes/push.routes.ts
//
// Single endpoint: POST /api/v1/push/register
// Mobile app calls this after login to register/update its Expo push token.

import express from 'express';
import { PushNotificationService } from '../services/PushNotificationService';

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { device_id, org_id, push_token, platform } = req.body;

    if (!device_id || !org_id || !push_token) {
      return res.status(400).json({ error: 'device_id, org_id, and push_token are required' });
    }

    if (typeof push_token !== 'string' || !push_token.startsWith('ExponentPushToken[')) {
      return res.status(400).json({ error: 'push_token must be a valid Expo push token' });
    }

    await PushNotificationService.registerToken(device_id, org_id, push_token, platform);
    res.status(200).json({ registered: true });
  } catch (error) {
    console.error('Error registering push token:', error);
    res.status(500).json({ error: 'Failed to register push token' });
  }
});

export default router;
