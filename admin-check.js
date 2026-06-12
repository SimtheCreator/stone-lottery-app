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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let body;
  try {
    body = getRequestBody(req.body);
  } catch (error) {
    console.error('Invalid admin check request body', error);
    return res.status(400).json({ error: 'Invalid request body' });
  }

  try {
    const resetPassword = getRequiredEnv('RESET_PASSWORD');

    if (body.password !== resetPassword) {
      return res.status(401).json({ error: 'Invalid admin password' });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Admin check error', error);
    return res.status(500).json({ error: 'Server error' });
  }
}
