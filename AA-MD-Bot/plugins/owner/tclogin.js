// ============================================================
// AA MD Bot — Truecaller Login  (superOwner only)
//
// Commands:
//  .tclogin  +923001234567   → request OTP (voice → SMS fallback)
//  .tcotp    123456          → verify OTP & save installationId
//  .tcresend                 → resend OTP via alternate method
//  .tcinstall <id>           → set installationId directly (no OTP)
// ============================================================

import axios from 'axios';
import { parsePhoneNumber } from 'awesome-phonenumber';

const FOOTER = '\n\n> 🌍 *AA MD Bot* • 👨‍💻 *Ahsan Ali Wadani*';

// ── Truecaller API constants ────────────────────────────────
const TC_LOGIN_URL  = 'https://account-asia-south1.truecaller.com/v2/sendOnboardingOtp';
const TC_VERIFY_URL = 'https://account-asia-south1.truecaller.com/v1/verifyOnboardingOtp';
const TC_HEADERS    = {
  'content-type':   'application/json; charset=UTF-8',
  'accept-encoding':'gzip',
  'user-agent':     'Truecaller/11.75.5 (Android;10)',
  'clientsecret':   'lvc22mp3l1sfv6ujg83rd17btt',
};

// OTP delivery methods to try (in order)
const OTP_METHODS = ['VOICE', 'SMS', 'MISSED_CALL'];

// Pending sessions: senderJid → { phone, loginData, method, methodIdx }
const _pending = new Map();

// ── Helper: build request body ──────────────────────────────
function _buildBody(pn, method = 'SMS') {
  const deviceId = Array.from({ length: 16 }, () =>
    'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]
  ).join('');

  return {
    countryCode: pn.regionCode,
    dialingCode: pn.countryCode,
    phoneNumber:  pn.number.significant,
    region:       'region-2',
    sequenceNo:   2,
    otpChannel:   method,        // VOICE | SMS | MISSED_CALL
    requestType:  method,        // some API versions use this key
    installationDetails: {
      app: { buildVersion: 5, majorVersion: 11, minorVersion: 7, store: 'GOOGLE_PLAY' },
      device: {
        deviceId,
        language:     'en',
        manufacturer: 'Xiaomi',
        model:        'M2007J17G',
        osName:       'Android',
        osVersion:    '10',
        mobileServices: ['GMS'],
      },
      language: 'en',
    },
  };
}

// ── Helper: call login API ──────────────────────────────────
async function _callLogin(phone, method) {
  const pn = parsePhoneNumber(phone);
  if (!pn?.valid) throw new Error('Invalid phone number format');

  try {
    const res = await axios({
      method:  'POST',
      url:     TC_LOGIN_URL,
      headers: TC_HEADERS,
      data:    _buildBody(pn, method),
      timeout: 15000,
    });
    return { ok: true, data: res.data };
  } catch (err) {
    return {
      ok:     false,
      code:   err.code || '',
      status: err.response?.status,
      msg:    err.message,
    };
  }
}

// ── Helper: call verify API ─────────────────────────────────
async function _callVerify(phone, loginData, otp) {
  const pn = parsePhoneNumber(phone);
  try {
    const res = await axios({
      method:  'POST',
      url:     TC_VERIFY_URL,
      headers: TC_HEADERS,
      data: {
        countryCode: pn.regionCode,
        dialingCode: pn.countryCode,
        phoneNumber:  pn.number.significant,
        requestId:    loginData.requestId,
        token:        otp,
      },
      timeout: 15000,
    });
    return { ok: true, data: res.data };
  } catch (err) {
    return {
      ok:     false,
      code:   err.code || '',
      status: err.response?.status,
      msg:    err.message,
    };
  }
}

// ── Helper: friendly network error message ──────────────────
function _netErrMsg(code, status) {
  if (['ECONNRESET','ECONNREFUSED'].includes(code))
    return `❌ *Server Blocked*\n_Truecaller is refusing connections from this server's IP. Try_ \`.tcinstall\` _to bypass OTP entirely._`;
  if (['ETIMEDOUT','ENOTFOUND','EAI_AGAIN'].includes(code))
    return `❌ *Network Timeout*\n_Could not reach Truecaller. Try again later._`;
  if (status === 429)
    return `❌ *Rate Limited*\n_Too many attempts. Wait a few minutes._`;
  if (status === 401 || status === 403)
    return `❌ *Auth Rejected (${status})*\n_Truecaller rejected this server. Use_ \`.tcinstall\` _instead._`;
  if (status >= 400 && status < 500)
    return `❌ *Request Failed (${status})*\n_Try a different phone number._`;
  return null;
}

// ── .tclogin ────────────────────────────────────────────────
export const tcloginPlugin = {
  command:        'tclogin',
  alias:          ['truecallerlogin', 'tcauth'],
  description:    'Login to Truecaller — requests OTP via voice then SMS',
  category:       'owner',
  superOwnerOnly: true,
  usage:          '.tclogin <+923001234567>',

  async execute({ text, reply, react, senderJid }) {
    const phone = (text || '').trim();

    if (!phone || !/^\+\d{7,15}$/.test(phone)) {
      return reply(
        `📱 *Truecaller Login*\n\n` +
        `*Usage:* \`.tclogin +923001234567\`\n\n` +
        `*Commands:*\n` +
        `▸ \`.tclogin +number\`   — request OTP\n` +
        `▸ \`.tcotp 123456\`      — verify OTP\n` +
        `▸ \`.tcresend\`          — resend via different method\n` +
        `▸ \`.tcinstall <id>\`    — skip OTP, set ID directly\n\n` +
        `💡 _If OTP doesn't arrive, use_ \`.tcresend\` _or_ \`.tcinstall\`` +
        FOOTER
      );
    }

    await react('⏳');

    // Try OTP methods in order: VOICE → SMS → MISSED_CALL
    let succeeded = false;
    let lastErr   = null;

    for (let idx = 0; idx < OTP_METHODS.length; idx++) {
      const method = OTP_METHODS[idx];
      const result = await _callLogin(phone, method);

      if (result.ok && result.data?.requestId) {
        // Save session
        _pending.set(senderJid, {
          phone,
          loginData:  result.data,
          method,
          methodIdx:  idx,
        });
        setTimeout(() => _pending.delete(senderJid), 10 * 60 * 1000); // 10 min

        await react('✅');
        const methodLabel = method === 'VOICE'       ? '📞 Voice Call'
                          : method === 'MISSED_CALL'  ? '📲 Missed Call'
                          :                             '💬 SMS';

        await reply(
          `✅ *OTP Requested via ${methodLabel}*\n\n` +
          `📱 *Number:* ${phone}\n` +
          `🕐 *Expires:* 10 minutes\n\n` +
          `*${method === 'VOICE' ? 'You will receive a CALL — answer it and note the code.' : 'Check your SMS inbox for the OTP.'}*\n\n` +
          `▸ \`.tcotp 123456\` — enter the code\n` +
          `▸ \`.tcresend\` — try different method if nothing arrives\n` +
          `▸ \`.tcinstall <id>\` — skip OTP, paste ID directly` +
          FOOTER
        );
        succeeded = true;
        break;
      }

      lastErr = result;

      // Only retry next method for network errors, not for 4xx
      const isNetworkErr = ['ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENOTFOUND','EAI_AGAIN'].includes(result.code);
      const isClientErr  = result.status >= 400 && result.status < 500 && result.status !== 429;
      if (isClientErr) break; // no point retrying
      if (!isNetworkErr && result.status) break; // server-side rejection
    }

    if (!succeeded) {
      await react('❌');
      const friendlyMsg = lastErr ? _netErrMsg(lastErr.code, lastErr.status) : null;
      return reply(
        (friendlyMsg || `❌ *OTP Request Failed*\n_${lastErr?.msg?.slice(0,200) || 'Unknown error'}_`) +
        `\n\n💡 *Alternative:* Use \`.tcinstall <installationId>\` to set your ID directly without OTP.` +
        FOOTER
      );
    }
  },
};

// ── .tcresend ───────────────────────────────────────────────
export const tcresendPlugin = {
  command:        'tcresend',
  alias:          ['resendotp', 'tcreotp'],
  description:    'Resend Truecaller OTP via a different delivery method',
  category:       'owner',
  superOwnerOnly: true,
  usage:          '.tcresend',

  async execute({ reply, react, senderJid }) {
    const session = _pending.get(senderJid);
    if (!session) {
      return reply(
        `⚠️ *No Pending Login*\n\n` +
        `_Run_ \`.tclogin +yourNumber\` _first._` +
        FOOTER
      );
    }

    await react('⏳');

    const { phone, methodIdx } = session;

    // Try the next method in the list
    const nextIdx   = (methodIdx + 1) % OTP_METHODS.length;
    const nextMethod = OTP_METHODS[nextIdx];

    const result = await _callLogin(phone, nextMethod);

    if (result.ok && result.data?.requestId) {
      _pending.set(senderJid, {
        phone,
        loginData:  result.data,
        method:     nextMethod,
        methodIdx:  nextIdx,
      });
      // reset timer
      setTimeout(() => _pending.delete(senderJid), 10 * 60 * 1000);

      await react('✅');
      const methodLabel = nextMethod === 'VOICE'      ? '📞 Voice Call'
                        : nextMethod === 'MISSED_CALL' ? '📲 Missed Call'
                        :                                '💬 SMS';
      return reply(
        `✅ *OTP Resent via ${methodLabel}*\n\n` +
        `📱 *Number:* ${phone}\n\n` +
        `*${nextMethod === 'VOICE' ? 'Answer the incoming call and note the code.' : 'Check your SMS inbox.'}*\n\n` +
        `▸ \`.tcotp 123456\` — enter the code\n` +
        `▸ \`.tcresend\` — try another method\n` +
        `▸ \`.tcinstall <id>\` — set ID directly` +
        FOOTER
      );
    }

    await react('❌');
    const friendlyMsg = _netErrMsg(result.code, result.status);
    return reply(
      (friendlyMsg || `❌ *Resend Failed*\n_${result.msg?.slice(0,200)}_`) +
      `\n\n💡 *Try:* \`.tcinstall <installationId>\` to bypass OTP completely.` +
      FOOTER
    );
  },
};

// ── .tcotp ──────────────────────────────────────────────────
export const tcotpPlugin = {
  command:        'tcotp',
  alias:          ['tcverify', 'truecallerotp'],
  description:    'Verify Truecaller OTP — saves installationId',
  category:       'owner',
  superOwnerOnly: true,
  usage:          '.tcotp <6-digit-otp>',

  async execute({ text, reply, react, senderJid }) {
    const otp = (text || '').trim();

    if (!otp || !/^\d{4,8}$/.test(otp)) {
      return reply(
        `🔢 *Enter OTP*\n\n` +
        `*Usage:* \`.tcotp <otp>\`\n\n` +
        `_First run_ \`.tclogin +yourNumber\` _to request OTP._` +
        FOOTER
      );
    }

    const session = _pending.get(senderJid);
    if (!session) {
      return reply(
        `⚠️ *No Pending Login*\n\n` +
        `_Run_ \`.tclogin +yourNumber\` _first._\n` +
        `_Or use_ \`.tcinstall <id>\` _to set ID directly._` +
        FOOTER
      );
    }

    await react('⏳');

    const { phone, loginData } = session;
    const result = await _callVerify(phone, loginData, otp);

    if (!result.ok) {
      await react('❌');
      const friendlyMsg = _netErrMsg(result.code, result.status);
      return reply(
        (friendlyMsg || `❌ *Verification Error:* _${result.msg?.slice(0,200)}_`) +
        FOOTER
      );
    }

    const installationId = result.data?.installationId;
    if (!installationId) {
      await react('❌');
      return reply(
        `❌ *OTP Verification Failed*\n\n` +
        `_Wrong OTP or it expired. Try:_\n` +
        `▸ \`.tcresend\` — get a new OTP\n` +
        `▸ \`.tclogin +yourNumber\` — start over\n` +
        `▸ \`.tcinstall <id>\` — bypass OTP` +
        FOOTER
      );
    }

    _pending.delete(senderJid);
    process.env.TRUECALLER_INSTALLATION_ID = installationId;

    await react('✅');
    return reply(
      `✅ *Truecaller Connected!*\n\n` +
      `🔑 *Installation ID saved for this session.*\n\n` +
      `📋 *Your ID (copy & save this!):*\n` +
      `\`${installationId}\`\n\n` +
      `⚠️ *To make it permanent*, add to your \`.env\`:\n` +
      `\`TRUECALLER_INSTALLATION_ID=${installationId}\`\n\n` +
      `_Or run_ \`.tcinstall ${installationId}\` _next time after a restart._\n\n` +
      `✨ _Truecaller lookup is now active!_` +
      FOOTER
    );
  },
};

// ── .tcinstall — Direct bypass, no OTP needed ───────────────
export const tcinstallPlugin = {
  command:        'tcinstall',
  alias:          ['tcsetid', 'truecallerid', 'tcid'],
  description:    'Set Truecaller installationId directly — no OTP required',
  category:       'owner',
  superOwnerOnly: true,
  usage:          '.tcinstall <installationId>',

  async execute({ text, reply, react }) {
    const id = (text || '').trim();

    if (!id) {
      return reply(
        `🔑 *Set Truecaller ID Directly*\n\n` +
        `*Usage:* \`.tcinstall <installationId>\`\n\n` +
        `*What is installationId?*\n` +
        `It's a token generated when you log into Truecaller. ` +
        `If OTP is not being delivered, get this ID from the Truecaller app ` +
        `on your phone (via mitmproxy, Truecaller API logs, or another bot instance that ran .tclogin successfully).\n\n` +
        `*Example:*\n` +
        `\`.tcinstall a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6\`` +
        FOOTER
      );
    }

    if (id.length < 16) {
      return reply(
        `❌ *Invalid ID*\n\n` +
        `_installationId looks too short. It should be at least 16 characters._` +
        FOOTER
      );
    }

    await react('⏳');

    // Save to env
    process.env.TRUECALLER_INSTALLATION_ID = id;

    await react('✅');
    return reply(
      `✅ *Truecaller ID Set!*\n\n` +
      `🔑 *ID:* \`${id}\`\n\n` +
      `_Truecaller lookups are now active for this session._\n\n` +
      `⚠️ *To make permanent*, add to \`.env\`:\n` +
      `\`TRUECALLER_INSTALLATION_ID=${id}\`` +
      FOOTER
    );
  },
};

// Export all four commands
export default [tcloginPlugin, tcresendPlugin, tcotpPlugin, tcinstallPlugin];
