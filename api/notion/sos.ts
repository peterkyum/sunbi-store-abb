import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from '@notionhq/client';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { storeName, title, message } = req.body;
    const databaseId = process.env.NOTION_DATABASE_ID_SOS?.trim();
    const notionKey = process.env.NOTION_API_KEY?.trim();

    if (databaseId && notionKey) {
      try {
        const notion = new Client({ auth: notionKey });
        await notion.pages.create({
          parent: { database_id: databaseId },
          properties: {
            '가맹점명': {
              title: [{ text: { content: storeName || '알 수 없음' } }],
            },
            '내용': {
              rich_text: [
                { text: { content: `[${title || '제목 없음'}]\n\n${message || '내용 없음'}` } },
              ],
            },
            '상태': {
              select: { name: '긴급' },
            },
          },
        });
      } catch (notionError) {
        console.error('Notion Sync Error:', notionError);
      }
    }

    // Telegram notification
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const telegramChatId = process.env.TELEGRAM_CHAT_ID?.trim();
    if (telegramToken && telegramChatId) {
      try {
        const controller = new AbortController();
        const tgTimeout = setTimeout(() => controller.abort(), 5000);

        const divider = '─────────────────';
        const tgText = [
          `🚨 *SOS 긴급 문의* 🚨`,
          divider,
          `🏪 *${storeName || '알 수 없음'}*`,
          `📌 *${title || '제목 없음'}*`,
          divider,
          message || '(상세 내용 없음)',
          divider,
          `🕐 ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
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
      process.env.SLACK_WEBHOOK_URL_SOS?.trim() || process.env.SLACK_WEBHOOK_URL_CONSULTING?.trim();
    if (slackWebhookUrl) {
      try {
        const controller = new AbortController();
        const slackTimeout = setTimeout(() => controller.abort(), 5000);

        await fetch(slackWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `🚨 *[SV 1:1 문의 접수]* 🚨\n*가맹점명:* ${storeName || '알 수 없음'}\n*제목:* ${title || '제목 없음'}\n*내용:* ${message || '내용 없음'}`,
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
    console.error('Notion SOS Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
}
