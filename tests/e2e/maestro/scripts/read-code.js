// Reads the newest 6-digit code emailed to E2E_EMAIL from the mock inbox (runs on the host).
const response = http.get(`${MOCK_URL}/email?to=${encodeURIComponent(E2E_EMAIL)}`);
const mails = json(response.body);
const last = mails[mails.length - 1];
const match = last && /\b(\d{6})\b/.exec(last.text);
if (!match) throw new Error('No verification code received');
output.code = match[1];
