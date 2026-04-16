import { NextRequest, NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import { createClient } from '@supabase/supabase-js';

let _supabase: any = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
    _supabase = createClient(url, key);
  }
  return _supabase;
}

function toChinese(num: number): string {
  const chars = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  if (num <= 10) return chars[num];
  if (num < 20) return '十' + chars[num - 10];
  if (num < 100) return chars[Math.floor(num / 10)] + '十' + (num % 10 ? chars[num % 10] : '');
  return String(num);
}

function buildBody(title: string, major: string, studentName: string, chapters: any): string {
  const items: string[] = [];

  // 一键生成：chapters 是完整文本字符串
  if (typeof chapters === 'string') {
    const fullText = chapters as unknown as string;
    items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="2000"/></w:pPr><w:r><w:rPr><w:sz w:val="72"/></w:rPr><w:t>${title || '毕业论文'}</w:t></w:r></w:p>`);
    items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="1200"/></w:pPr></w:p>`);
    items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="600"/></w:pPr><w:r><w:rPr><w:sz w:val="28"/></w:rPr><w:t>专    业：${major || '___________'}</w:t></w:r></w:p>`);
    items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="600"/></w:pPr><w:r><w:rPr><w:sz w:val="28"/></w:rPr><w:t>学生姓名：${studentName || '___________'}</w:t></w:r></w:p>`);
    items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="600"/></w:pPr><w:r><w:rPr><w:sz w:val="28"/></w:rPr><w:t>指导教师：___________</w:t></w:r></w:p>`);
    items.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
    items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="400"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>摘    要</w:t></w:r></w:p>`);
    items.push(`<w:p><w:pPr><w:spacing w:line="360"/><w:ind w:firstLine="640"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>[请在此填写中文摘要]</w:t></w:r></w:p>`);
    items.push(`<w:p><w:pPr><w:spacing w:line="300"/><w:ind w:firstLine="640"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>关键词：</w:t></w:r><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>[关键词1]  [关键词2]  [关键词3]</w:t></w:r></w:p>`);
    items.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
    const lines = fullText.split('\n').filter(l => l.trim());
    for (const line of lines) {
      items.push(`<w:p><w:pPr><w:spacing w:line="360"/><w:ind w:firstLine="640"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>${line.trim()}</w:t></w:r></w:p>`);
    }
    items.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
    items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="400"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>参考文献</w:t></w:r></w:p>`);
    items.push(`<w:p><w:pPr><w:spacing w:line="360"/><w:ind w:firstLine="640"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>[1] 请按GB/T 7714格式添加引用文献</w:t></w:r></w:p>`);
    items.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
    items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="400"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>致    谢</w:t></w:r></w:p>`);
    items.push(`<w:p><w:pPr><w:spacing w:line="360"/><w:ind w:firstLine="640"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>感谢指导教师的悉心指导，感谢同学们的帮助，感谢家人的支持。</w:t></w:r></w:p>`);
    return items.join('\n');
  }

  // 人机协作：chapters 是数组
  if (!Array.isArray(chapters)) {
    return items.join('\n');
  }

  const written = chapters.filter((c: any) => c.written && c.content_generated);

  // 封面
  items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="2000"/></w:pPr><w:r><w:rPr><w:sz w:val="72"/></w:rPr><w:t>${title || '毕业论文'}</w:t></w:r></w:p>`);
  items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="1200"/></w:pPr></w:p>`);
  items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="600"/></w:pPr><w:r><w:rPr><w:sz w:val="28"/></w:rPr><w:t>专    业：${major || '___________'}</w:t></w:r></w:p>`);
  items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="600"/></w:pPr><w:r><w:rPr><w:sz w:val="28"/></w:rPr><w:t>学生姓名：${studentName || '___________'}</w:t></w:r></w:p>`);
  items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="600"/></w:pPr><w:r><w:rPr><w:sz w:val="28"/></w:rPr><w:t>指导教师：___________</w:t></w:r></w:p>`);
  items.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);

  // 声明
  items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="400"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>声    明</w:t></w:r></w:p>`);
  items.push(`<w:p><w:pPr><w:spacing w:line="360"/><w:ind w:firstLine="640"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>本论文是我在导师指导下进行的研究工作及取得的研究成果。尽我所知，除了文中特别加以标注和致谢的地方外，论文中不包含其他人已经发表或撰写过的研究成果，也不包含为获得或其他教育机构的学位或证书而使用过的材料。</w:t></w:r></w:p>`);
  items.push(`<w:p><w:pPr><w:spacing w:line="400"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>作者签名：___________    日期：_____年_____月_____日</w:t></w:r></w:p>`);
  items.push(`<w:p><w:pPr><w:spacing w:line="300"/></w:pPr></w:p>`);
  items.push(`<w:p><w:pPr><w:spacing w:line="400"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>导师签名：___________    日期：_____年_____月_____日</w:t></w:r></w:p>`);
  items.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);

  // 摘要
  items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="400"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>摘    要</w:t></w:r></w:p>`);
  items.push(`<w:p><w:pPr><w:spacing w:line="360"/><w:ind w:firstLine="640"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>[请在此填写中文摘要]</w:t></w:r></w:p>`);
  items.push(`<w:p><w:pPr><w:spacing w:line="300"/><w:ind w:firstLine="640"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>关键词：</w:t></w:r><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>[关键词1]  [关键词2]  [关键词3]</w:t></w:r></w:p>`);
  items.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);

  // 目录
  items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="400"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>目    录</w:t></w:r></w:p>`);
  for (const ch of written) {
    const ct = ch.number > 1 ? `第${toChinese(ch.number)}章 ${ch.title}` : ch.title;
    items.push(`<w:p><w:pPr><w:spacing w:line="400"/><w:ind w:firstLine="640"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>${ct}</w:t></w:r></w:p>`);
  }
  items.push(`<w:p><w:pPr><w:spacing w:line="400"/><w:ind w:firstLine="640"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>参考文献</w:t></w:r></w:p>`);
  items.push(`<w:p><w:pPr><w:spacing w:line="400"/><w:ind w:firstLine="640"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>致    谢</w:t></w:r></w:p>`);
  items.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);

  // 章节
  for (const ch of written) {
    const ct = ch.number > 1 ? `第${toChinese(ch.number)}章 ${ch.title}` : ch.title;
    items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="400"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>${ct}</w:t></w:r></w:p>`);
    const lines = (ch.content_generated || '').split('\n').filter((l: string) => l.trim());
    for (const line of lines) {
      items.push(`<w:p><w:pPr><w:spacing w:line="360"/><w:ind w:firstLine="640"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>${line.trim()}</w:t></w:r></w:p>`);
    }
    items.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
  }

  // 参考文献
  items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="400"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>参考文献</w:t></w:r></w:p>`);
  items.push(`<w:p><w:pPr><w:spacing w:line="360"/><w:ind w:firstLine="640"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>[1] 请按GB/T 7714格式添加引用文献</w:t></w:r></w:p>`);
  items.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);

  // 致谢
  items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="400"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>致    谢</w:t></w:r></w:p>`);
  items.push(`<w:p><w:pPr><w:spacing w:line="360"/><w:ind w:firstLine="640"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>感谢指导教师的悉心指导，感谢同学们的帮助，感谢家人的支持。</w:t></w:r></w:p>`);

  return items.join('\n');
}

export async function POST(req: NextRequest) {
  try {
    const { paperId, title, major, studentName, chapters } = await req.json();

    let paperTitle = title;
    let paperMajor = major;
    let paperChapters = chapters;

    // 如果提供了 paperId，从数据库加载
    if (paperId) {
      const session = req.cookies.get('pa_session');
      if (!session) {
        return NextResponse.json({ error: '请先登录' }, { status: 401 });
      }

      const raw = Buffer.from(session.value, 'base64url').toString();
    const beforeLast = raw.slice(0, raw.lastIndexOf(':'));
    const dest = beforeLast.slice(beforeLast.indexOf(':') + 1);
    const type = raw.startsWith('email:') ? 'email' : 'phone';
    const destination = dest || beforeLast;
      const userField = type === 'email' ? 'email' : 'phone';

      const supabase = getSupabase();
      const { data: users } = await supabase.from('users').select('id').eq(userField, destination).limit(1);
      if (!users?.length) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

      const { data: paper, error } = await supabase
        .from('papers')
        .select('title, major, chapters')
        .eq('id', paperId)
        .eq('user_id', users[0].id)
        .single();

      if (error || !paper) return NextResponse.json({ error: '论文不存在' }, { status: 404 });

      paperTitle = paper.title || paperTitle;
      paperMajor = paper.major || paperMajor;
      paperChapters = paper.chapters || paperChapters;
    }

    const zip = new AdmZip();

    zip.addFile('[Content_Types].xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/footer.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`, 'utf8'));

    zip.addFile('_rels/.rels', Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`, 'utf8'));

    zip.addFile('word/_rels/document.xml.rels', Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer.xml"/>
</Relationships>`, 'utf8'));

    const body = buildBody(paperTitle || '毕业论文', paperMajor, studentName, paperChapters);
    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:sectPr>
      <w:footerReference w:type="default" r:id="rId3"/>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1684" w:right="1684" w:bottom="1418" w:left="1684"/>
    </w:sectPr>
    ${body}
  </w:body>
</w:document>`;

    zip.addFile('word/document.xml', Buffer.from(docXml, 'utf8'));

    zip.addFile('word/styles.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:eastAsia="宋体" w:ascii="宋体" w:hAnsi="宋体"/>
        <w:sz w:val="24"/>
        <w:szCs w:val="24"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr>
      <w:rFonts w:eastAsia="宋体" w:ascii="宋体" w:hAnsi="宋体"/>
    </w:rPr>
  </w:style>
</w:styles>`, 'utf8'));

    zip.addFile('word/settings.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:defaultTabStop w:val="720"/>
</w:settings>`, 'utf8'));

    zip.addFile('word/footer.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr><w:jc w:val="center"/></w:pPr>
    <w:r><w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:instrText>PAGE</w:instrText></w:r>
    <w:r><w:fldChar w:fldCharType="separate"/></w:r>
    <w:r><w:t>1</w:t></w:r>
    <w:r><w:fldChar w:fldCharType="end"/></w:r>
  </w:p>
</w:ftr>`, 'utf8'));

    const buffer = zip.toBuffer();
    const filename = (paperTitle || '\u7b14\u7f57\u8bba\u6587').replace(/[^\w\u4e00-\u9fa5]/g, '_') + '.docx';
    const filenameEncoded = encodeURIComponent(filename);

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filenameEncoded}"; filename*=UTF-8''${filenameEncoded}`,
      },
    });

  } catch (error: any) {
    console.error('Export error:', error);
    return NextResponse.json({ error: '导出失败: ' + (error?.message || String(error)) }, { status: 500 });
  }
}
