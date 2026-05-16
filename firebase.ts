import admin from 'firebase-admin';
import { logger } from '../utils/helpers/logger';

let firebaseApp: admin.app.App;

export function initializeFirebase(): admin.app.App {
  try {
    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    };

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });

    logger.info('Firebase initialized successfully');
    return firebaseApp;
  } catch (error) {
    logger.error('Failed to initialize Firebase:', error);
    throw error;
  }
}

export function getFirebaseApp(): admin.app.App {
  if (!firebaseApp) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }
  return firebaseApp;
}

export const firebaseAuth = admin.auth;
export const firebaseMessaging = admin.messaging;

// Send push notification
export async function sendPushNotification(
  deviceToken: string,
  payload: {
    title: string;
    body: string;
    data?: Record<string, string>;
  }
): Promise<void> {
  try {
    const message: admin.messaging.Message = {
      token: deviceToken,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data,
      android: {
        priority: 'high',
        notification: {
          channelId: 'ilm_notifications',
          sound: 'default',
          priority: 'high',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            contentAvailable: true,
          },
        },
      },
    };

    await firebaseMessaging().send(message);
    logger.debug(`Push notification sent to device: ${deviceToken}`);
  } catch (error) {
    logger.error('Failed to send push notification:', error);
  }
}

// Send push notification to multiple devices
export async function sendMulticastNotification(
  deviceTokens: string[],
  payload: {
    title: string;
    body: string;
    data?: Record<string, string>;
  }
): Promise<void> {
  try {
    const message: admin.messaging.MulticastMessage = {
      tokens: deviceTokens,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data,
    };

    const response = await firebaseMessaging().sendEachForMulticast(message);
    logger.debug(`Sent ${response.successCount} notifications successfully`);
    
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          logger.error(`Failed to send notification to token ${deviceTokens[idx]}: ${resp.error}`);
        }
      });
    }
  } catch (error) {
    logger.error('Failed to send multicast notification:', error);
  }
}

export default { initializeFirebase, getFirebaseApp, sendPushNotification, sendMulticastNotification };
