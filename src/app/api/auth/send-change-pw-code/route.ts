import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const TOKEN_SECRET = process.env.TOKEN_SECRET || process.env.EMAIL_USER || 'default-secret';
const EMAIL_USER = process.env.EMAIL_USER || '';
const EMAIL_PASS = process.env.EMAIL_PASS || '';

let _supabase: any | null = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
    _supabase = createClient(url, key);
  }
  return _supabase;
}

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function createToken(email: string, code: string): string {
  const expires = Date.now() + 5 * 60 * 1000;
  const data = `${email}:${code}:${expires}`;
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('hex');
  return Buffer.from(`${data}:${sig}`).toString('base64url');
}

async function sendEmailCode(to: string, code: string) {
  const transporter = nodemailer.createTransport({
    service: '163',
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });

  await transporter.sendMail({
    from: `"Pepper" <${EMAIL_USER}>`,
    to,
    subject: '【Pepper】修改密码验证码',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 30px; border: 1px solid #e5e7eb; border-radius: 12px;">
        <h2 style="color: #4f46e5; margin-bottom: 20px;">📄 Pepper 论文助手</h2>
        <p style="font-size: 16px; color: #374151; margin-bottom: 10px;">您好！</p>
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">您正在修改密码，验证码是：</p>
        <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; text-center; margin-bottom: 20px;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #4f46e5;">${code}</span>
        </div>
        <p style="font-size: 14px; color: #6b7280; margin-bottom: 10px;">验证码 <strong>5 分钟</strong>内有效，请勿泄露给他人。</p>
        <p style="font-size: 14px; color: #6b7280;">如果您没有请求此验证码，请忽略此邮件。</p>
      </div>
    `,
    text: `您正在修改密码，验证码是：${code}，5分钟内有效。`,
  });
}

export async function POST(req: NextRequest) {
  try {
    const session = req.cookies.get('pa_session');
    if (!session) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const raw = Buffer.from(session.value, 'base64url').toString();
    const beforeLast = raw.slice(0, raw.lastIndexOf(':'));
    const dest = beforeLast.slice(beforeLast.indexOf(':') + 1);
    const type = raw.startsWith('email:') ? 'email' : 'phone';
    const destination = dest || beforeLast;

    if (!type || !destination) {
      return NextResponse.json({ error: '无效的会话' }, { status: 400 });
    }

    // Get user's email from database
    const supabase = getSupabase();
    const userField = type === 'email' ? 'email' : 'phone';
    const { data: user, error } = await (supabase.from('users') as any)
      .select('email')
      .eq(userField, destination)
      .limit(1)
      .single();

    if (error || !user || !user.email) {
      return NextResponse.json({ error: '未找到用户邮箱，请用邮箱登录后修改' }, { status: 400 });
    }

    const email = user.email;
    const code = generateCode();
    const token = createToken(email, code);

    const response = NextResponse.json({ success: true, message: '验证码已发送' });
    response.cookies.set('pwcode', token, {
      httpOnly: true,
      maxAge: 300,
      path: '/',
      sameSite: 'lax',
    });

    await sendEmailCode(email, code);
    return response;

  } catch (error: any) {
    console.error('Send change pw code error:', error);
    return NextResponse.json({ error: error.message || '发送失败' }, { status: 500 });
  }
}
