// ============================================
// AA MD Bot — Truecaller Login (owner only)
// .tclogin <+923001234567>  → sends OTP
// .tcotp   <6-digit-otp>    → saves installationId
// ============================================

import * as truecallerjs from 'truecallerjs';

const FOOTER = '\n\n> 🌍 *AA MD Bot* • 👨‍💻 *Ahsan Ali Wadani*';

// Temporary store: pending login sessions
// { senderJid: { phone, loginData } }
const _pending = new Map();

export const tcloginPlugin = {
  command:     'tclogin',
  alias:       ['truecallerlogin', 'tcauth'],
  description: 'Login to Truecaller — sends OTP to your number',
  category:    'owner',
  superOwnerOnly: true,
  usage:       '.tclogin <+923001234567>',

  async execute({ text, reply, react, senderJid }) {
    const phone = (text || '').trim();

    if (!phone || !/^\+\d{7,15}$/.test(phone)) {
      return reply(
        `📱 *Truecaller Login*\n\n` +
        `*Usage:* .tclogin <+country_code_number>\n\n` +
        `*Example:*\n` +
        `▸ \`.tclogin +923001234567\`\n\n` +
        `_An OTP will be sent to that number. Then use:_\n` +
        `▸ \`.tcotp 123456\`` +
        FOOTER
      );
    }

    await react('⏳');

    // Helper: attempt login once, return { data } or { error }
    async function tryLogin() {
      try {
        const data = await truecallerjs.login(phone);
        return { data };
      } catch (e) {
        return { error: e };
      }
    }

    // Try once, retry once on network errors
    let attempt = await tryLogin();
    if (attempt.error) {
      const code = attempt.error.code || '';
      const isNetwork = ['ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENOTFOUND','EAI_AGAIN'].includes(code);
      if (isNetwork) {
        // Wait 2s then retry
        await new Promise(r => setTimeout(r, 2000));
        attempt = await tryLogin();
      }
    }

    if (attempt.error) {
      await react('❌');
      const err = attempt.error;
      const code = err.code || '';
      const status = err.response?.status;

      let msg;
      if (['ECONNRESET','ECONNREFUSED'].includes(code)) {
        msg =
          `❌ *Truecaller Server Blocked*\n\n` +
          `Truecaller's server is refusing connection from this server's IP address.\n\n` +
          `*Possible fixes:*\n` +
          `▸ Try again in a few minutes\n` +
          `▸ Use a VPN/proxy if available\n` +
          `▸ This is a known limitation on cloud servers`;
      } else if (['ETIMEDOUT','ENOTFOUND','EAI_AGAIN'].includes(code)) {
        msg =
          `❌ *Network Timeout*\n\n` +
          `Could not reach Truecaller servers.\n` +
          `Please check connectivity and try again.`;
      } else if (status === 429) {
        msg = `❌ *Rate Limited*\n\n_Too many requests. Wait a few minutes and try again._`;
      } else if (status >= 400 && status < 500) {
        msg = `❌ *Request Rejected (${status})*\n\n_Truecaller rejected the request. Try a different phone number._`;
      } else {
        msg = `❌ *Error:* _${String(err.message).slice(0, 200)}_`;
      }

      return reply(msg + FOOTER);
    }

    const loginData = attempt.data;

    if (!loginData?.requestId) {
      await react('❌');
      return reply(`❌ *Login Failed*\n\n_Could not send OTP. Try a different number._` + FOOTER);
    }

    _pending.set(senderJid, { phone, loginData });

    // Auto-clear after 5 minutes
    setTimeout(() => _pending.delete(senderJid), 5 * 60 * 1000);

    await react('✅');
    return reply(
      `✅ *OTP Sent!*\n\n` +
      `📱 *Number:* ${phone}\n` +
      `🕐 *Expires:* 5 minutes\n\n` +
      `Now enter the OTP you received:\n` +
      `▸ \`.tcotp 123456\`` +
      FOOTER
    );
  },
};

export const tcotpPlugin = {
  command:     'tcotp',
  alias:       ['tcverify', 'truecallerotp'],
  description: 'Verify Truecaller OTP — saves installationId',
  category:    'owner',
  superOwnerOnly: true,
  usage:       '.tcotp <6-digit-otp>',

  async execute({ text, reply, react, senderJid }) {
    const otp = (text || '').trim();

    if (!otp || !/^\d{4,8}$/.test(otp)) {
      return reply(
        `🔢 *Enter OTP*\n\n` +
        `*Usage:* .tcotp <otp>\n\n` +
        `_First run_ \`.tclogin +yourNumber\` _to get OTP._` +
        FOOTER
      );
    }

    const session = _pending.get(senderJid);
    if (!session) {
      return reply(
        `⚠️ *No Pending Login*\n\n` +
        `_Run_ \`.tclogin +yourNumber\` _first._` +
        FOOTER
      );
    }

    await react('⏳');

    try {
      const { phone, loginData } = session;
      const verifyRes = await truecallerjs.verifyOtp(phone, loginData, otp);

      if (!verifyRes?.installationId) {
        await react('❌');
        return reply(
          `❌ *OTP Verification Failed*\n\n` +
          `_Wrong OTP or expired. Run_ \`.tclogin +yourNumber\` _again._` +
          FOOTER
        );
      }

      _pending.delete(senderJid);

      // Save to process.env in memory (works until bot restart)
      process.env.TRUECALLER_INSTALLATION_ID = verifyRes.installationId;

      await react('✅');
      return reply(
        `✅ *Truecaller Connected!*\n\n` +
        `🔑 *Installation ID saved!*\n\n` +
        `📋 *Your ID (save this):*\n` +
        `\`${verifyRes.installationId}\`\n\n` +
        `⚠️ *Important:* Add this to your \`.env\` file:\n` +
        `\`TRUECALLER_INSTALLATION_ID=${verifyRes.installationId}\`\n\n` +
        `_Now .simowner will use Truecaller for real name lookups!_` +
        FOOTER
      );
    } catch (err) {
      await react('❌');
      const code = err.code || '';
      let msg;
      if (['ECONNRESET','ECONNREFUSED'].includes(code)) {
        msg = `❌ *Truecaller Server Blocked*\n\n_Truecaller is refusing connections from this server. Try again later._`;
      } else if (['ETIMEDOUT','ENOTFOUND'].includes(code)) {
        msg = `❌ *Network Timeout*\n\n_Could not reach Truecaller. Check connectivity and retry._`;
      } else {
        msg = `❌ *Error:* _${String(err.message).slice(0, 200)}_`;
      }
      return reply(msg + FOOTER);
    }
  },
};

// Export as array so pluginLoader registers both commands
export default [tcloginPlugin, tcotpPlugin];
