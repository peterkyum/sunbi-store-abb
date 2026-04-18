import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Client } from '@notionhq/client';
import path from 'path';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Firebase config from environment variables (fallback to legacy values for existing deploys)
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'project-9fdce7b4-62aa-44a6-a0b';
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'ai-studio-120f43ec-e63f-4a37-bbfb-38cf4cf34cab';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: FIREBASE_PROJECT_ID,
  });
}

const db = getFirestore(FIRESTORE_DATABASE_ID);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.use(express.json());

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  // CORS — restrict to known origins in production
  const ALLOWED_ORIGINS = [
    'https://sunbi-store-abb.vercel.app',
    'https://sunbi-hub.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
  ];
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  // TODO: Add rate limiting with express-rate-limit when added to dependencies
  // e.g. app.use('/api/', rateLimit({ windowMs: 60_000, max: 60 }));

  // Notion API Setup
  let notionClient: Client | null = null;
  function getNotionClient() {
    if (!notionClient) {
      const key = process.env.NOTION_API_KEY?.trim();
      if (!key) {
        throw new Error('NOTION_API_KEY 환경변수가 설정되지 않았습니다.');
      }
      notionClient = new Client({ auth: key });
    }
    return notionClient;
  }

  // API Routes

  // Server-side AI proxy — keeps GEMINI_API_KEY secret on the server
  app.post('/api/ai/generate', async (req, res) => {
    try {
      const { contents, systemInstruction } = req.body;

      if (!contents || !Array.isArray(contents) || contents.length === 0) {
        return res.status(400).json({ success: false, error: 'contents 배열이 필요합니다.' });
      }

      const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
      if (!geminiApiKey) {
        return res.status(500).json({ success: false, error: 'GEMINI_API_KEY가 설정되지 않았습니다.' });
      }

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
      const body: Record<string, unknown> = { contents };
      if (systemInstruction) {
        body.system_instruction = { parts: [{ text: systemInstruction }] };
      }

      const geminiRes = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        return res.status(geminiRes.status).json({ success: false, error: errText });
      }

      const data = await geminiRes.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      res.json({ success: true, text });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('AI Generate Error:', message);
      res.status(500).json({ success: false, error: message });
    }
  });

  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok',
      hasSlackSos: !!process.env.SLACK_WEBHOOK_URL_SOS,
      hasSlackConsulting: !!process.env.SLACK_WEBHOOK_URL_CONSULTING,
      hasGenericSlack: !!process.env.SLACK_WEBHOOK_URL,
      hasNotionSos: !!process.env.NOTION_DATABASE_ID_SOS,
      hasNotionConsulting: !!process.env.NOTION_DATABASE_ID_CONSULTING
    });
  });

  app.post('/api/notion/sos', async (req, res) => {
    // Input validation
    const { storeName, title, message } = req.body || {};
    if (!storeName || typeof storeName !== 'string' || storeName.trim().length === 0) {
      return res.status(400).json({ success: false, error: '가맹점명(storeName)이 필요합니다.' });
    }
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ success: false, error: '제목(title)이 필요합니다.' });
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ success: false, error: '내용(message)이 필요합니다.' });
    }

    // 10초 타임아웃 설정
    const timeoutId = setTimeout(() => {
      if (!res.headersSent) {
        res.status(504).json({ success: false, error: '서버 응답 시간이 초과되었습니다. (API 지연)' });
      }
    }, 10000);

    try {
      const databaseId = process.env.NOTION_DATABASE_ID_SOS?.trim();
      
      if (databaseId) {
        try {
          const notion = getNotionClient();
          await notion.pages.create({
            parent: { database_id: databaseId },
            properties: {
              '가맹점명': {
                title: [
                  { text: { content: storeName || '알 수 없음' } }
                ]
              },
              '내용': {
                rich_text: [
                  { text: { content: `[${title || '제목 없음'}]\n\n${message || '내용 없음'}` } }
                ]
              },
              '상태': {
                select: { name: '긴급' }
              }
            }
          });
        } catch (notionError) {
          console.error('Notion Sync Error:', notionError);
        }
      } else {
        console.log('NOTION_DATABASE_ID_SOS is not set. Skipping Notion sync.');
      }

      // Send Slack Notification if webhook URL is configured
      const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL_SOS?.trim() || process.env.SLACK_WEBHOOK_URL_CONSULTING?.trim();
      if (slackWebhookUrl) {
        console.log('Attempting to send Slack SOS notification...');
        try {
          const controller = new AbortController();
          const slackTimeout = setTimeout(() => controller.abort(), 5000); // 5초 타임아웃으로 증가
          
          const slackRes = await fetch(slackWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: `🚨 *[SV 1:1 문의 접수]* 🚨\n*가맹점명:* ${storeName || '알 수 없음'}\n*제목:* ${title || '제목 없음'}\n*내용:* ${message || '내용 없음'}`
            }),
            signal: controller.signal
          });
          clearTimeout(slackTimeout);
          
          if (!slackRes.ok) {
            console.error('Slack Webhook failed with status:', slackRes.status, await slackRes.text());
          } else {
            console.log('Slack SOS notification sent successfully.');
          }
        } catch (slackError) {
          console.error('Slack Webhook Error:', slackError);
          // Don't fail the whole request if Slack fails
        }
      } else {
        console.log('SLACK_WEBHOOK_URL_SOS is not set. Skipping Slack notification.');
      }

      clearTimeout(timeoutId);
      if (!res.headersSent) {
        res.json({ success: true });
      }
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      console.error('Notion SOS Error:', error);
      if (!res.headersSent) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: errorMessage });
      }
    }
  });

  app.post('/api/notion/consulting', async (req, res) => {
    // Input validation
    const { storeName, category, title, content } = req.body || {};
    if (!storeName || typeof storeName !== 'string' || storeName.trim().length === 0) {
      return res.status(400).json({ success: false, error: '가맹점명(storeName)이 필요합니다.' });
    }
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ success: false, error: '제목(title)이 필요합니다.' });
    }

    try {
      const databaseId = process.env.NOTION_DATABASE_ID_CONSULTING?.trim();
      
      if (databaseId) {
        try {
          const notion = getNotionClient();
          await notion.pages.create({
            parent: { database_id: databaseId },
            properties: {
              '제목': {
                title: [
                  { text: { content: title || '제목 없음' } }
                ]
              },
              '가맹점명': {
                rich_text: [
                  { text: { content: storeName || '알 수 없음' } }
                ]
              },
              '카테고리': {
                select: { name: category || '기타' }
              },
              '내용': {
                rich_text: [
                  { text: { content: content || '내용 없음' } }
                ]
              },
              '상태': {
                select: { name: '대기중' }
              }
            }
          });
        } catch (notionError) {
          console.error('Notion Consulting Sync Error:', notionError);
        }
      } else {
        console.log('NOTION_DATABASE_ID_CONSULTING is not set. Skipping Notion sync.');
      }

      // Send Slack Notification if webhook URL is configured
      const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL_CONSULTING?.trim() || process.env.SLACK_WEBHOOK_URL_SOS?.trim();
      if (slackWebhookUrl) {
        console.log('Attempting to send Slack Consulting notification...');
        try {
          const controller = new AbortController();
          const slackTimeout = setTimeout(() => controller.abort(), 5000); // 5초 타임아웃으로 증가
          
          const slackRes = await fetch(slackWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: `📝 *[1:1 문의 접수]*\n*지점명:* ${storeName || '알 수 없음'}\n*구분:* ${category || '기타'}\n*제목:* ${title || '제목 없음'}\n*내용:* ${content || '내용 없음'}`
            }),
            signal: controller.signal
          });
          clearTimeout(slackTimeout);

          if (!slackRes.ok) {
            console.error('Slack Webhook failed with status:', slackRes.status, await slackRes.text());
          } else {
            console.log('Slack Consulting notification sent successfully.');
          }
        } catch (slackError) {
          console.error('Slack Webhook Error:', slackError);
          // Don't fail the whole request if Slack fails
        }
      } else {
        console.log('SLACK_WEBHOOK_URL_CONSULTING is not set. Skipping Slack notification.');
      }

      res.json({ success: true });
    } catch (error: unknown) {
      console.error('Notion Consulting Error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: errorMessage });
    }
  });

  // Admin: Create User Route
  app.post('/api/admin/create-user', async (req, res) => {
    try {
      const { email, password, name, role, storeName, position, adminUid } = req.body;

      // TODO: Replace adminUid body param with Firebase Auth token verification.
      // Currently trusting client-supplied adminUid — should verify via
      // admin.auth().verifyIdToken(req.headers.authorization) instead.
      if (!adminUid || typeof adminUid !== 'string' || adminUid.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'adminUid가 필요합니다.' });
      }

      if (!email || typeof email !== 'string' || email.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'email이 필요합니다.' });
      }

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'name이 필요합니다.' });
      }

      // Basic security check: verify the requester is actually an admin in Firestore
      const adminDoc = await db.collection('users').doc(adminUid).get();
      if (!adminDoc.exists || adminDoc.data()?.role !== 'manager') {
        return res.status(403).json({ success: false, error: '권한이 없습니다.' });
      }

      // Create user in Firebase Auth
      const userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: name,
      });

      // Create user profile in Firestore
      const profile = {
        uid: userRecord.uid,
        email,
        name,
        role,
        storeName: storeName || (role === 'owner' ? '' : '본사'),
        position: position || (role === 'owner' ? '점주' : '직원'),
      };

      await db.collection('users').doc(userRecord.uid).set(profile);

      res.json({ success: true, uid: userRecord.uid });
    } catch (error: unknown) {
      console.error('Create User Error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: errorMessage });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
