import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: '缺少文件' }, { status: 400 });

    const ext = file.name.split('.').pop()?.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    if (ext === 'ppt') {
      // 用 libreoffice 把旧版 ppt 转为 txt
      const tmpFile = path.join(os.tmpdir(), `temp_${Date.now()}.ppt`);
      const outDir = path.join(os.tmpdir(), `temp_${Date.now()}`);
      fs.writeFileSync(tmpFile, buffer);
      try {
        fs.mkdirSync(outDir);
        execSync(`libreoffice --headless --convert-to txt:Text --outdir "${outDir}" "${tmpFile}"`, { timeout: 30000 });
        const txtFile = fs.readdirSync(outDir).find(f => f.endsWith('.txt'));
        if (txtFile) {
          const text = fs.readFileSync(path.join(outDir, txtFile), 'utf-8');
          return NextResponse.json({ text: text.slice(0, 8000) });
        }
        return NextResponse.json({ error: 'PPT解析失败' }, { status: 500 });
      } finally {
        try { fs.unlinkSync(tmpFile); } catch {}
        try { fs.rmSync(outDir, { recursive: true }); } catch {}
      }
    }

    return NextResponse.json({ error: '不支持的格式' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
