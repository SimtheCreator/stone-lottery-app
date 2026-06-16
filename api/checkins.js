import admin from 'firebase-admin';
import { isExpectedParticipant, normalizeParticipantCode } from '../src/participantRoster.js';

const CHECKINS_COLLECTION = 'checkins';

let firestoreDb;

const getRequiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const getRequestBody = (body) => {
  if (!body) return {};
  if (typeof body === 'string') return JSON.parse(body);
  return body;
};

const getDb = () => {
  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(getRequiredEnv('FIREBASE_ADMIN_CONFIG'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }

  if (!firestoreDb) {
    firestoreDb = admin.firestore();
  }

  return firestoreDb;
};

const timestampToIso = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return null;
};

const normalizeCheckin = (document) => {
  const data = document.data();
  return {
    id: document.id,
    name: normalizeParticipantCode(data.name || data.code || document.id),
    participantId: data.participantId || document.id,
    timestamp: timestampToIso(data.timestamp),
    updatedAt: timestampToIso(data.updatedAt),
  };
};

const getAdminPassword = (req) => (
  req.headers['x-admin-password'] || req.query?.password || ''
);

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const db = getDb();

    if (req.method === 'GET') {
      const resetPassword = getRequiredEnv('RESET_PASSWORD');
      if (getAdminPassword(req) !== resetPassword) {
        return res.status(401).json({ error: 'Invalid admin password' });
      }

      const snapshot = await db.collection(CHECKINS_COLLECTION).get();
      const checkins = snapshot.docs
        .map(normalizeCheckin)
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));

      return res.status(200).json({
        ok: true,
        serverNow: new Date().toISOString(),
        checkins,
      });
    }

    let body;
    try {
      body = getRequestBody(req.body);
    } catch (error) {
      console.error('Invalid checkin request body', error);
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const name = normalizeParticipantCode(body.name || body.code);
    if (!isExpectedParticipant(name)) {
      return res.status(400).json({ error: 'Unknown participant' });
    }

    await db.collection(CHECKINS_COLLECTION).doc(name).set({
      name,
      participantId: name,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return res.status(200).json({ ok: true, name });
  } catch (error) {
    console.error('Checkins error', error);
    return res.status(500).json({ error: 'Server error' });
  }
}
