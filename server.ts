import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Client } from '@notionhq/client';
import path from 'path';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const db = getFirestore(firebaseConfig.firestoreDatabaseId);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.use(express.json());

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
  app.get('/api/config', (req, res) => {
    res.json({
      geminiApiKey: process.env.GEMINI_API_KEY
    });
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
    // 10초 타임아웃 설정
    const timeoutId = setTimeout(() => {
      if (!res.headersSent) {
        res.status(504).json({ success: false, error: '서버 응답 시간이 초과되었습니다. (API 지연)' });
      }
    }, 10000);

    try {
      const { storeName, title, message } = req.body;
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
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error('Notion SOS Error:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: error.message });
      }
    }
  });

  app.post('/api/notion/consulting', async (req, res) => {
    try {
      const { storeName, category, title, content } = req.body;
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
    } catch (error: any) {
      console.error('Notion Consulting Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Admin: Create User Route
  app.post('/api/admin/create-user', async (req, res) => {
    try {
      const { email, password, name, role, storeName, position, adminUid } = req.body;

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
    } catch (error: any) {
      console.error('Create User Error:', error);
      res.status(500).json({ success: false, error: error.message });
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
