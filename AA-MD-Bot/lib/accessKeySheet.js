import crypto from 'crypto';

// The spreadsheet may be overridden for another deployment. Share it with the
// service-account email in GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON as an Editor.
const DEFAULT_SPREADSHEET_ID = '1XzGGgLiMqFvvhXmx-SzYMf5xD8ohe5aVgmhPpfca6hE';
const SHEET_NAME = 'Access Keys';
const HEADERS = [
  'Access Key ID', 'Access Key', 'WhatsApp Number', 'Status', 'Type',
  'Created At', 'Activated At', 'Last Used At', 'Deleted At', 'Created By',
  'Connection ID', 'Last Event', 'Updated At',
];

let tokenCache = { value: '', expiresAt: 0 };
let setupPromise = null;
let warnedApiKeyOnly = false;

function spreadsheetId() {
  return process.env.ACCESS_KEY_SHEET_ID?.trim() || DEFAULT_SPREADSHEET_ID;
}

function serviceAccount() {
  const encoded = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  const raw = encoded ? Buffer.from(encoded, 'base64').toString('utf8') : process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const credentials = JSON.parse(raw);
    return credentials.client_email && credentials.private_key ? credentials : null;
  } catch {
    console.error('[ACCESS SHEET] GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON is not valid JSON');
    return null;
  }
}

function base64url(value) {
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
}

async function accessToken() {
  if (tokenCache.value && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value;
  const credentials = serviceAccount();
  if (!credentials) return null;
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64url({ alg: 'RS256', typ: 'JWT' });
  const claims = base64url({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: issuedAt,
    exp: issuedAt + 3600,
  });
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  signer.end();
  const assertion = `${header}.${claims}.${signer.sign(credentials.private_key, 'base64url')}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) throw new Error(body.error_description || 'Google OAuth token request failed');
  tokenCache = { value: body.access_token, expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000 };
  return tokenCache.value;
}

async function googleRequest(path, options = {}) {
  const token = await accessToken();
  if (!token) return null;
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId()}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || `Google Sheets request failed (${response.status})`);
  return body;
}

async function ensureSheet() {
  if (setupPromise) return setupPromise;
  setupPromise = (async () => {
    const metadata = await googleRequest('?fields=sheets.properties');
    if (!metadata) return false;
    const exists = metadata.sheets?.some(sheet => sheet.properties?.title === SHEET_NAME);
    if (!exists) {
      await googleRequest(':batchUpdate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] }),
      });
    }
    const headerRange = encodeURIComponent(`'${SHEET_NAME}'!A1:M1`);
    await googleRequest(`/values/${headerRange}?valueInputOption=RAW`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [HEADERS] }),
    });
    return true;
  })().catch(error => {
    setupPromise = null;
    throw error;
  });
  return setupPromise;
}

function formatTime(value) {
  return value ? new Date(Number(value)).toISOString() : '';
}

function rowFor(record, event) {
  return [
    record.id || '', record.plainKey || '', record.assignedPhone ? `+${record.assignedPhone}` : '', record.status || 'deleted',
    record.expiresAt ? 'Expires' : 'Lifetime', formatTime(record.createdAt), formatTime(record.activatedAt),
    formatTime(record.lastUsedAt), formatTime(record.deletedAt), record.createdBy || '', record.connectionId || '', event, new Date().toISOString(),
  ];
}

/**
 * Upserts one access-key row. The sheet is an operational mirror/audit view;
 * MongoDB remains the source of truth for authorization and verification.
 */
export async function syncAccessKeyToSheet(record, event) {
  if (!serviceAccount()) {
    if (process.env.GOOGLE_SHEETS_API_KEY?.trim() && !warnedApiKeyOnly) {
      warnedApiKeyOnly = true;
      console.error('[ACCESS SHEET] GOOGLE_SHEETS_API_KEY cannot write rows. Configure GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON and share the sheet with that service account.');
    }
    return false;
  }
  await ensureSheet();
  const lookupRange = encodeURIComponent(`'${SHEET_NAME}'!A2:A`);
  const existing = await googleRequest(`/values/${lookupRange}`);
  const index = (existing.values || []).findIndex(row => row[0] === record.id);
  const row = index + 2;
  const targetRange = encodeURIComponent(`'${SHEET_NAME}'!A${row}:M${row}`);
  const method = index >= 0 ? 'PUT' : 'POST';
  const path = index >= 0
    ? `/values/${targetRange}?valueInputOption=RAW`
    : `/values/${encodeURIComponent(`'${SHEET_NAME}'!A:M`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  await googleRequest(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [rowFor(record, event)] }),
  });
  return true;
}

export function isAccessKeySheetConfigured() {
  return !!serviceAccount();
}

export function getAccessKeySheetConfiguration() {
  return {
    spreadsheetId: spreadsheetId(),
    writeEnabled: isAccessKeySheetConfigured(),
    // An API key identifies the calling project, not a Google user/service
    // account. It can be used for public reads but cannot write spreadsheet
    // rows, so it is deliberately not treated as write authorization.
    apiKeySet: !!process.env.GOOGLE_SHEETS_API_KEY?.trim(),
  };
}
