import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || 'project-9fdce7b4-62aa-44a6-a0b',
  });
}

const db = getFirestore(
  process.env.FIRESTORE_DATABASE_ID || 'ai-studio-120f43ec-e63f-4a37-bbfb-38cf4cf34cab'
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { email, password, name, role, storeName, position, adminUid } = req.body;

    const adminDoc = await db.collection('users').doc(adminUid).get();
    if (!adminDoc.exists || adminDoc.data()?.role !== 'manager') {
      return res.status(403).json({ success: false, error: '권한이 없습니다.' });
    }

    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
    });

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
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
}
