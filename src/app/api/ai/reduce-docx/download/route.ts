// /api/ai/reduce-docx/download - 下载处理后的 DOCX 文件
import { NextRequest, NextResponse } from 'next/server';
import https from 'https';

const SPEEDAI_HOST = 'api3.speedai.chat';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const userDocId = formData.get('user_doc_id') as string;
    const fileName = formData.get('file_name') as string || 'processed.docx';

    if (!userDocId) return NextResponse.json({ error: '缺少 user_doc_id' }, { status: 400 });

    // 调用 SpeedAI /v1/download
    const body = JSON.stringify({ user_doc_id: userDocId, file_name: fileName.replace(/\.docx$/, '') });

    const result = await new Promise<Buffer>((resolve, reject) => {
      const options: https.RequestOptions = {
        hostname: SPEEDAI_HOST,
        path: '/v1/download',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 60000,
      };
      const req = https.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          // Check if it's error JSON
          if (buf.length < 2000) {
            try {
              const j = JSON.parse(buf.toString());
              if (j.error) { reject(new Error(j.error)); return; }
            } catch {}
          }
          resolve(buf);
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('下载超时')); });
      req.write(body); req.end();
    });

    return new NextResponse(new Uint8Array(result), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Content-Length': String(result.length),
      },
    });

  } catch (err: any) {
    console.error('[/reduce-docx/download] ERROR:', err.message);
    return NextResponse.json({ error: err.message || '下载失败' }, { status: 500 });
  }
}
