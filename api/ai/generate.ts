import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { contents, systemInstruction } = req.body || {};

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
}
