import type { VercelRequest, VercelResponse } from '@vercel/node'

// sunbi-hub SSO 브릿지 — 허브 JWT 검증 → 로컬 세션 + 사용자 프로필 자동 생성
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
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
    // 1. 허브 토큰으로 사용자 정보 확인
    const userResp = await fetch(`${HUB_URL}/auth/v1/user`, {
      headers: { apikey: HUB_KEY, Authorization: `Bearer ${hub_token}` },
    })
    if (!userResp.ok) return res.status(401).json({ error: 'Invalid hub token' })
    const hubUser = await userResp.json()
    if (!hubUser.email) return res.status(401).json({ error: 'No email' })

    // 2. 허브에서 역할 조회
    const roleResp = await fetch(
      `${HUB_URL}/rest/v1/user_roles?user_id=eq.${hubUser.id}&select=role,name`,
      { headers: { apikey: HUB_KEY, Authorization: `Bearer ${hub_token}` } }
    )
    const roles = await roleResp.json()
    const hubRole = (roles[0]?.role || 'franchise') as string
    const hubName = (roles[0]?.name || hubUser.email.split('@')[0]) as string

    // 허브→매장정보 역할 매핑
    const ROLE_MAP: Record<string, string> = { admin: 'manager', staff: 'manager', distributor: 'owner', franchise: 'owner' }
    const localRole = ROLE_MAP[hubRole] || 'owner'

    // 3. 로컬 Supabase 매직링크 생성
    let linkResp = await fetch(`${LOCAL_URL}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        apikey: LOCAL_SERVICE,
        Authorization: `Bearer ${LOCAL_SERVICE}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'magiclink', email: hubUser.email }),
    })

    if (!linkResp.ok) {
      await fetch(`${LOCAL_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          apikey: LOCAL_SERVICE,
          Authorization: `Bearer ${LOCAL_SERVICE}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: hubUser.email, email_confirm: true, password: crypto.randomUUID() }),
      })
      linkResp = await fetch(`${LOCAL_URL}/auth/v1/admin/generate_link`, {
        method: 'POST',
        headers: {
          apikey: LOCAL_SERVICE,
          Authorization: `Bearer ${LOCAL_SERVICE}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'magiclink', email: hubUser.email }),
      })
    }
    if (!linkResp.ok) return res.status(500).json({ error: 'Link gen failed' })

    const linkData = await linkResp.json()
    const tokenHash = linkData.properties?.hashed_token
    if (!tokenHash) return res.status(500).json({ error: 'No token_hash' })

    // 4. 세션 발급
    const verifyResp = await fetch(`${LOCAL_URL}/auth/v1/verify`, {
      method: 'POST',
      headers: { apikey: LOCAL_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token_hash: tokenHash, type: 'magiclink' }),
    })
    if (!verifyResp.ok) return res.status(500).json({ error: 'Verify failed' })
    const session = await verifyResp.json()

    // 5. users 테이블에 프로필 자동 생성/업데이트
    await fetch(`${LOCAL_URL}/rest/v1/users`, {
      method: 'POST',
      headers: {
        apikey: LOCAL_SERVICE,
        Authorization: `Bearer ${LOCAL_SERVICE}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        uid: session.user?.id,
        email: hubUser.email,
        name: hubName,
        role: localRole,
        store_name: hubName,
        position: hubRole === 'admin' ? '관리자' : hubRole === 'staff' ? '팀원' : '',
      }),
    })

    return res.json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user: session.user,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'SSO failed'
    return res.status(500).json({ error: message })
  }
}
