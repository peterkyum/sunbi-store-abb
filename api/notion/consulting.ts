import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from '@notionhq/client';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

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
    const notionKey = process.env.NOTION_API_KEY?.trim();

    if (databaseId && notionKey) {
      try {
        const notion = new Client({ auth: notionKey });
        await notion.pages.create({
          parent: { database_id: databaseId },
          properties: {
            '제목': {
              title: [{ text: { content: title || '제목 없음' } }],
            },
            '가맹점명': {
              rich_text: [{ text: { content: storeName || '알 수 없음' } }],
            },
            '카테고리': {
              select: { name: category || '기타' },
            },
            '내용': {
              rich_text: [{ text: { content: content || '내용 없음' } }],
            },
            '상태': {
              select: { name: '대기중' },
            },
          },
        });
      } catch (notionError) {
        console.error('Notion Consulting Sync Error:', notionError);
      }
    }

    // Telegram notification
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const telegramChatId = process.env.TELEGRAM_CHAT_ID?.trim();
    if (telegramToken && telegramChatId) {
      try {
        const controller = new AbortController();
        const tgTimeout = setTimeout(() => controller.abort(), 5000);

        const urgencyLabel = (title || '').includes('[매우긴급]') ? '🔴 매우긴급' : (title || '').includes('[긴급]') ? '🟠 긴급' : '🟢 일반';
        const cleanTitle = (title || '제목 없음').replace(/\[긴급\]\s?|\[매우긴급\]\s?/g, '');
        const divider = '─────────────────';
        const tgText = [
          `📝 *1:1 문의 접수*`,
          divider,
          `${storeName || '알 수 없음'} ｜ ${category || '기타'} ｜ ${urgencyLabel}`,
          `*${cleanTitle}*`,
          divider,
          content || '(상세 내용 없음)',
          divider,
          new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
        ].join('\n');

        await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: tgText,
            parse_mode: 'Markdown',
          }),
          signal: controller.signal,
        });
        clearTimeout(tgTimeout);
      } catch (tgError) {
        console.error('Telegram Error:', tgError);
      }
    }

    // Slack notification
    const slackWebhookUrl =
      process.env.SLACK_WEBHOOK_URL_CONSULTING?.trim() || process.env.SLACK_WEBHOOK_URL_SOS?.trim();
    if (slackWebhookUrl) {
      try {
        const controller = new AbortController();
        const slackTimeout = setTimeout(() => controller.abort(), 5000);

        await fetch(slackWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `📝 *[1:1 문의 접수]*\n*지점명:* ${storeName || '알 수 없음'}\n*구분:* ${category || '기타'}\n*제목:* ${title || '제목 없음'}\n*내용:* ${content || '내용 없음'}`,
          }),
          signal: controller.signal,
        });
        clearTimeout(slackTimeout);
      } catch (slackError) {
        console.error('Slack Webhook Error:', slackError);
      }
    }

    res.json({ success: true });
  } catch (error: unknown) {
    console.error('Notion Consulting Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
}
