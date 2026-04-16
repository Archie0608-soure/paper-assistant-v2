import { NextRequest, NextResponse } from 'next/server';
import https from 'https';

const SPEEDAI_API_KEY = process.env.SPEEDAI_API_KEY || 'sk-pPYJHnLpQq51mjzHrmSKJ43q';
const SPEEDAI_HOST = 'api3.speedai.chat';

// 带重试 + 超时的 fetch POST（multipart/form-data）
async function speedaiFetch(endpoint: string, body: FormData, timeoutSec = 600): Promise<any> {
  const retries = [0, 5000, 10000];
  for (let i = 0; i < retries.length; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);
      
      const res = await fetch(`https://${SPEEDAI_HOST}${endpoint}`, {
        method: 'POST',
        body,
        signal: controller.signal as any,
      });
      clearTimeout(timer);
      
      console.log('[reduce-docx]', endpoint, '->', res.status);
      const text = await res.text();
      try { return JSON.parse(text); } catch { return text; }
    } catch (err: any) {
      console.log('[reduce-docx]', endpoint, '失败', i < retries.length - 1 ? '第' + (i + 2) + '次重试' : '', err.message);
      if (i < retries.length - 1) await new Promise(r => setTimeout(r, retries[i + 1]));
      else throw err;
    }
  }
}

// 下载处理后的DOCX
async function downloadDocx(docId: string, fileName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ user_doc_id: docId, file_name: fileName });
    const options: https.RequestOptions = {
      hostname: SPEEDAI_HOST,
      path: '/v1/download',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 60000,
    };
    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        // 如果是JSON错误响应，抛出异常
        if (buf.length < 1000) {
          try {
            const j = JSON.parse(buf.toString());
            if (j.error) throw new Error(j.error);
          } catch (e: any) { if (e.message.includes('error')) { reject(e); return; } }
        }
        resolve(buf);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('下载超时')); });
    req.write(body); req.end();
  });
}

// 方法A（分步）: cost -> start -> 轮询status -> 返回文件
async function processDocxStepwise(
  fileBuffer: Buffer, fileName: string,
  lang: string, platform: string
): Promise<{ docId: string; cost: number }> {
  // Step1: /v1/cost
  const costForm = new FormData();
  costForm.append('file', new Blob([new Uint8Array(fileBuffer)]), fileName);
  costForm.append('FileName', fileName);
  costForm.append('username', SPEEDAI_API_KEY);
  costForm.append('mode', 'deai');
  costForm.append('type_', platform);
  costForm.append('changed_only', String(false));
  costForm.append('skip_english', lang === 'chinese' ? String(true) : String(false));

  console.log('[reduce-docx] Step1: /v1/cost');
  const costData = await speedaiFetch('/v1/cost', costForm);
  if (costData.status !== 'success') throw new Error('cost失败: ' + (costData.error || JSON.stringify(costData)));
  const docId = costData.doc_id;
  const cost = costData.cost;
  console.log('[reduce-docx] doc_id=' + docId + ', cost=' + cost);

  // Step2: /v1/docx/start
  const startForm = new FormData();
  startForm.append('doc_id', docId);
  startForm.append('FileName', fileName);
  startForm.append('username', SPEEDAI_API_KEY);
  startForm.append('mode', 'deai');
  startForm.append('type_', platform);
  startForm.append('changed_only', String(false));
  startForm.append('skip_english', lang === 'chinese' ? String(true) : String(false));

  console.log('[reduce-docx] Step2: /v1/docx/start');
  const startData = await speedaiFetch('/v1/docx/start', startForm);
  if (startData.status !== 'processing') throw new Error('start失败: ' + (startData.error || JSON.stringify(startData)));

  // Step3: 轮询 /v1/docx/status 直到完成
  console.log('[reduce-docx] Step3: 轮询进度...');
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const statusForm = new FormData();
    statusForm.append('user_doc_id', docId);
    const s: any = await speedaiFetch('/v1/docx/status', statusForm, 30);
    console.log('[reduce-docx] 轮询' + (i + 1) + ': status=' + s.status + ', progress=' + (s.progress || 0) + '%');
    if (s.status === 'completed') { console.log('[reduce-docx] 处理完成'); return { docId, cost }; }
    if (s.status === 'error') throw new Error('处理失败: ' + (s.error || s.message));
    if (s.status === 'need_pay') throw new Error('点数不足，请充值');
  }
  throw new Error('处理超时（超过5分钟），请稍后重试');
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const lang = (formData.get('lang') as string) || 'chinese';
    const platform = (formData.get('platform') as string) || 'zhiwang';

    if (!file) return NextResponse.json({ error: '请上传文件' }, { status: 400 });

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const outputName = file.name.replace(/\.(docx|doc)$/i, '_processed.docx');

    console.log('[reduce-docx] 开始: file=' + file.name + ', lang=' + lang + ', platform=' + platform);

    // 方法A（分步）: cost -> start -> 轮询 -> 下载
    const { docId, cost } = await processDocxStepwise(fileBuffer, file.name, lang, platform);

    // 下载处理后的文件
    console.log('[reduce-docx] 下载文件...');
    const outputBuffer = await downloadDocx(docId, outputName);
    console.log('[reduce-docx] 完成: size=' + outputBuffer.length);

    return new NextResponse(new Uint8Array(outputBuffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(outputName)}`,
        'X-Doc-Id': docId,
        'X-Cost': String(cost),
      },
    });

  } catch (err: any) {
    console.error('[reduce-docx] ERROR:', err.message);
    const msg = err.message.includes('timeout') || err.message.includes('abort')
      ? '处理超时，文件太大或网络慢，请稍后重试'
      : err.message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
