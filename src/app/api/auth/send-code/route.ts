import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

const EMAIL_TRANSPORTER = {
  host: 'smtp.163.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASS || '',
  },
};

const TOKEN_SECRET = process.env.TOKEN_SECRET || process.env.EMAIL_USER || 'default-secret';

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function createToken(email: string, code: string): string {
  const expires = Date.now() + 5 * 60 * 1000; // 5分钟
  const data = `${email}:${code}:${expires}`;
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('hex');
  return Buffer.from(`${data}:${sig}`).toString('base64url');
}

function verifyToken(token: string, email: string, code: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const parts = decoded.split(':');
    if (parts.length !== 4) return false;
    const [e, c, exp, sig] = parts;
    if (e !== email || c !== code) return false;
    if (Date.now() > parseInt(exp)) return false;
    const data = `${e}:${c}:${exp}`;
    const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('hex');
    return sig === expectedSig;
  } catch {
    return false;
  }
}

async function sendEmailCode(to: string, code: string) {
  const transporter = nodemailer.createTransport({
    service: '163',
    auth: {
      user: process.env.EMAIL_USER || '',
      pass: process.env.EMAIL_PASS || '',
    },
  });

  await transporter.sendMail({
    from: `"Pepper" <${EMAIL_TRANSPORTER.auth.user}>`,
    to,
    subject: '【Pepper】您的登录验证码',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 30px; border: 1px solid #e5e7eb; border-radius: 12px;">
        <h2 style="color: #4f46e5; margin-bottom: 20px;">📄 Pepper 论文助手</h2>
        <p style="font-size: 16px; color: #374151; margin-bottom: 10px;">您好！</p>
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">您的登录验证码是：</p>
        <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #4f46e5;">${code}</span>
        </div>
        <p style="font-size: 14px; color: #6b7280; margin-bottom: 10px;">验证码 <strong>5 分钟</strong>内有效，请勿泄露给他人。</p>
        <p style="font-size: 14px; color: #6b7280;">如果您没有请求此验证码，请忽略此邮件。</p>
      </div>
    `,
    text: `您的验证码是：${code}，5分钟内有效。`,
  });
}

export async function POST(req: NextRequest) {
  try {
    const { type, destination } = await req.json();

    if (!type || !destination) {
      return NextResponse.json({ error: '缺少参数' }, { status: 400 });
    }

    if (type !== 'email') {
      return NextResponse.json({ error: '目前只支持邮箱登录' }, { status: 400 });
    }

    const code = generateCode();
    const token = createToken(destination, code);

    const response = NextResponse.json({ success: true, message: '验证码已发送', token });

    // 把签名 token 存在 httpOnly cookie 里，验证时核对
    response.cookies.set('vcode', token, {
      httpOnly: true,
      maxAge: 300, // 5分钟
      path: '/',
      sameSite: 'lax',
    });

    await sendEmailCode(destination, code);
    return response;

  } catch (error: any) {
    console.error('Send code error:', error);
    return NextResponse.json({ error: error.message || '发送失败' }, { status: 500 });
  }
}
