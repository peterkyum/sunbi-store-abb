import type { VercelRequest, VercelResponse } from '@vercel/node'

// sunbi-hub SSO 브릿지 — 허브 JWT를 검증하고 로컬 Supabase 세션을 발급
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://sunbi-hub.vercel.app')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { hub_token } = req.body || {}
  if (!hub_token) return res.status(400).json({ error: 'Missing hub_token' })

  const HUB_URL = process.env.HUB_SUPABASE_URL
  const HUB_KEY = process.env.HUB_SUPABASE_ANON_KEY
  const LOCAL_URL = process.env.SUPABASE_URL
  const LOCAL_ANON = process.env.SUPABASE_ANON_KEY
  const LOCAL_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!HUB_URL || !HUB_KEY || !LOCAL_URL || !LOCAL_ANON || !LOCAL_SERVICE) {
    return res.status(500).json({ error: 'SSO env vars not configured' })
  }

  try {
    // 1. 허브 토큰으로 사용자 이메일 확인
    const userResp = await fetch(`${HUB_URL}/auth/v1/user`, {
      headers: { apikey: HUB_KEY, Authorization: `Bearer ${hub_token}` },
    })
    if (!userResp.ok) return res.status(401).json({ error: 'Invalid hub token' })
    const hubUser = await userResp.json()
    const email = hubUser.email as string
    if (!email) return res.status(401).json({ error: 'No email in hub token' })

    // 2. 로컬 Supabase에서 매직링크 생성
    let linkResp = await fetch(`${LOCAL_URL}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        apikey: LOCAL_SERVICE,
        Authorization: `Bearer ${LOCAL_SERVICE}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'magiclink', email }),
    })

    // 사용자 미존재 시 자동 생성 후 재시도
    if (!linkResp.ok) {
      await fetch(`${LOCAL_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          apikey: LOCAL_SERVICE,
          Authorization: `Bearer ${LOCAL_SERVICE}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          email_confirm: true,
          password: crypto.randomUUID(),
        }),
      })

      linkResp = await fetch(`${LOCAL_URL}/auth/v1/admin/generate_link`, {
        method: 'POST',
        headers: {
          apikey: LOCAL_SERVICE,
          Authorization: `Bearer ${LOCAL_SERVICE}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'magiclink', email }),
      })
    }

    if (!linkResp.ok) {
      const err = await linkResp.text()
      return res.status(500).json({ error: `Link gen failed: ${err}` })
    }

    const linkData = await linkResp.json()
    const tokenHash = linkData.properties?.hashed_token
    if (!tokenHash) return res.status(500).json({ error: 'No token_hash' })

    // 3. 매직링크 토큰으로 세션 발급
    const verifyResp = await fetch(`${LOCAL_URL}/auth/v1/verify`, {
      method: 'POST',
      headers: {
        apikey: LOCAL_ANON,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token_hash: tokenHash, type: 'magiclink' }),
    })

    if (!verifyResp.ok) {
      const err = await verifyResp.text()
      return res.status(500).json({ error: `Verify failed: ${err}` })
    }

    const session = await verifyResp.json()
    return res.json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user: { id: session.user?.id, email: session.user?.email },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'SSO failed'
    return res.status(500).json({ error: message })
  }
}
