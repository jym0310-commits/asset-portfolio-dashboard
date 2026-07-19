const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// 자체 도메인 인증 전이라, Resend가 기본 제공하는 발신 주소를 사용합니다.
// 나중에 도메인을 인증하면 이 값을 "포트폴리오노트 <noreply@내도메인.com>" 형태로 바꾸면 됩니다.
const FROM_ADDRESS = process.env.EMAIL_FROM || '포트폴리오노트 <onboarding@resend.dev>';

// 앱이 실제로 서비스되는 주소 (재설정 링크를 만들 때 사용). 배포 환경에선 반드시 설정해야 합니다.
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:4000';

async function sendPasswordResetEmail(toEmail, resetToken) {
  if (!resend) {
    throw new Error('.env 파일에 RESEND_API_KEY가 설정되어 있지 않습니다.');
  }

  const resetUrl = `${APP_BASE_URL}/reset-password.html?token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(toEmail)}`;

  await resend.emails.send({
    from: FROM_ADDRESS,
    to: toEmail,
    subject: '[포트폴리오노트] 비밀번호 재설정 안내',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; line-height: 1.6;">
        <h2>비밀번호 재설정</h2>
        <p>비밀번호 재설정을 요청하셨습니다. 아래 버튼을 눌러 새 비밀번호를 설정해주세요.</p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}" style="background:#6d28d9;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;">
            비밀번호 재설정하기
          </a>
        </p>
        <p style="color:#888;font-size:13px;">이 링크는 1시간 동안만 유효합니다.</p>
        <p style="color:#888;font-size:13px;">본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.</p>
      </div>
    `,
  });
}

module.exports = { sendPasswordResetEmail };