import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

const TEMPLATES_DIR = path.join(process.cwd(), 'public', 'templates');
const DB_PATH = path.join(process.cwd(), 'data', 'templates.db');

// JSON-based template store (no DB needed)
const TEMPLATE_STORE = path.join(process.cwd(), 'data', 'templates.json');

function getTemplates() {
  if (!fs.existsSync(TEMPLATE_STORE)) return [];
  try {
    return JSON.parse(fs.readFileSync(TEMPLATE_STORE, 'utf8'));
  } catch { return []; }
}

function saveTemplates(templates: any[]) {
  const dir = path.dirname(TEMPLATE_STORE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(TEMPLATE_STORE, JSON.stringify(templates, null, 2));
}

function extractTemplateColors(zip: AdmZip): { primary: string; secondary: string; accent: string; bg: string } {
  const colors = { primary: '2B6CB0', secondary: '1a365d', accent: 'e94560', bg: 'FFFFFF' };
  try {
    const slideFiles = (zip as any).getEntries().filter((e: any) => e.entryName.match(/ppt\/slides\/slide\d+\.xml$/));
    const colorSet = new Set<string>();
    const bgSet = new Set<string>();
    for (const slide of slideFiles.slice(0, 3) as any[]) {
      const content = (slide as any).getData().toString('utf8');
      const matches = content.match(/[0-9A-Fa-f]{6}/g) || [];
      for (const m of matches) {
        if (m !== '000000' && m !== 'FFFFFF' && m !== 'CCCCCC') {
          colorSet.add(m.toUpperCase());
        }
      }
      // Extract background colors
      const bgMatch = content.match(/solidFill[^>]*>[^<]*<srgbClr[^>]*val="([0-9A-Fa-f]{6})"/);
      if (bgMatch) bgSet.add(bgMatch[1].toUpperCase());
    }
    const arr = Array.from(colorSet);
    if (arr.length >= 1) colors.primary = arr[0];
    if (arr.length >= 2) colors.secondary = arr[1];
    if (arr.length >= 3) colors.accent = arr[2];
    const bgArr = Array.from(bgSet);
    if (bgArr.length > 0) colors.bg = bgArr[0];
  } catch {}
  return colors;
}

function extractSlideCount(zip: AdmZip): number {
  try {
    return (zip as any).getEntries().filter((e: any) => e.entryName.match(/ppt\/slides\/slide\d+\.xml$/)).length;
  } catch { return 0; }
}

export async function POST(req: NextRequest) {
  try {
    if (!fs.existsSync(TEMPLATES_DIR)) fs.mkdirSync(TEMPLATES_DIR, { recursive: true });

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const name = (formData.get('name') as string) || file?.name?.replace('.pptx', '') || '未命名模板';
    const category = (formData.get('category') as string) || '学术';
    const description = (formData.get('description') as string) || '';

    if (!file) return NextResponse.json({ error: '请选择文件' }, { status: 400 });
    if (!file.name.endsWith('.pptx')) return NextResponse.json({ error: '只支持PPTX文件' }, { status: 400 });

    // Save file
    const safeName = file.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5.-]/g, '_').replace(/\.pptx$/, '');
    const fileName = `${safeName}_${Date.now()}.pptx`;
    const filePath = path.join(TEMPLATES_DIR, fileName);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    // Extract info
    const zip = new (AdmZip as any)(buffer);
    const colors = extractTemplateColors(zip);
    const slideCount = extractSlideCount(zip);
    const fileSize = buffer.length;

    const template = {
      id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      category,
      description,
      file: `/templates/${fileName}`,
      colors,
      slideCount,
      fileSize,
      createdAt: new Date().toISOString(),
    };

    const templates = getTemplates();
    templates.unshift(template);
    saveTemplates(templates);

    return NextResponse.json({ success: true, template });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const templates = getTemplates();
    if (category && category !== '全部') {
      return NextResponse.json({ templates: templates.filter((t: any) => t.category === category) });
    }
    return NextResponse.json({ templates });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: '缺少ID' }, { status: 400 });

    const templates = getTemplates();
    const idx = templates.findIndex((t: any) => t.id === id);
    if (idx === -1) return NextResponse.json({ error: '模板不存在' }, { status: 404 });

    // Delete file
    const tpl = templates[idx];
    const filePath = path.join(process.cwd(), 'public', tpl.file);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    templates.splice(idx, 1);
    saveTemplates(templates);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
