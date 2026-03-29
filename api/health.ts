import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.json({
    status: 'ok',
    hasSlackSos: !!process.env.SLACK_WEBHOOK_URL_SOS,
    hasSlackConsulting: !!process.env.SLACK_WEBHOOK_URL_CONSULTING,
    hasGenericSlack: !!process.env.SLACK_WEBHOOK_URL,
    hasNotionSos: !!process.env.NOTION_DATABASE_ID_SOS,
    hasNotionConsulting: !!process.env.NOTION_DATABASE_ID_CONSULTING,
  });
}
