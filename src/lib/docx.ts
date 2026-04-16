'use client';

import { downloadZip } from 'client-zip';

interface Chapter {
  number: number;
  title: string;
  written: boolean;
  content_generated?: string;
}

function toChinese(num: number): string {
  const chars = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  if (num <= 10) return chars[num];
  if (num < 20) return '十' + chars[num - 10];
  if (num < 100) return chars[Math.floor(num / 10)] + '十' + (num % 10 ? chars[num % 10] : '');
  return String(num);
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildBody(title: string, major: string, studentName: string, chapters: Chapter[]): string {
  const items: string[] = [];
  const written = chapters.filter(c => c.written && c.content_generated);

  items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="2000"/></w:pPr><w:r><w:rPr><w:sz w:val="72"/></w:rPr><w:t>${esc(title || '毕业论文')}</w:t></w:r></w:p>`);
  items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="1200"/></w:pPr></w:p>`);
  items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="600"/></w:pPr><w:r><w:rPr><w:sz w:val="28"/></w:rPr><w:t>专    业：${esc(major || '___________')}</w:t></w:r></w:p>`);
  items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="600"/></w:pPr><w:r><w:rPr><w:sz w:val="28"/></w:rPr><w:t>学生姓名：${esc(studentName || '___________')}</w:t></w:r></w:p>`);
  items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="600"/></w:pPr><w:r><w:rPr><w:sz w:val="28"/></w:rPr><w:t>指导教师：___________</w:t></w:r></w:p>`);
  items.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);

  items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="400"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>声    明</w:t></w:r></w:p>`);
  items.push(`<w:p><w:pPr><w:spacing w:line="360"/><w:ind w:firstLine="640"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>本论文是我在导师指导下进行的研究工作及取得的研究成果。尽我所知，除了文中特别加以标注和致谢的地方外，论文中不包含其他人已经发表或撰写过的研究成果，也不包含为获得或其他教育机构的学位或证书而使用过的材料。</w:t></w:r></w:p>`);
  items.push(`<w:p><w:pPr><w:spacing w:line="400"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>作者签名：___________    日期：_____年_____月_____日</w:t></w:r></w:p>`);
  items.push(`<w:p><w:pPr><w:spacing w:line="300"/></w:pPr></w:p>`);
  items.push(`<w:p><w:pPr><w:spacing w:line="400"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>导师签名：___________    日期：_____年_____月_____日</w:t></w:r></w:p>`);
  items.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);

  items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="400"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>摘    要</w:t></w:r></w:p>`);
  items.push(`<w:p><w:pPr><w:spacing w:line="360"/><w:ind w:firstLine="640"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/><w:color w:val="999999"/></w:rPr><w:t>[请在此填写中文摘要]</w:t></w:r></w:p>`);
  items.push(`<w:p><w:pPr><w:spacing w:line="300"/><w:ind w:firstLine="640"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>关键词：</w:t></w:r><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>[关键词1]  [关键词2]  [关键词3]</w:t></w:r></w:p>`);
  items.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);

  items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="400"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>目    录</w:t></w:r></w:p>`);
  for (const ch of written) {
    const ct = ch.number > 1 ? `第${toChinese(ch.number)}章 ${ch.title}` : ch.title;
    items.push(`<w:p><w:pPr><w:spacing w:line="400"/><w:ind w:firstLine="640"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>${esc(ct)}</w:t></w:r></w:p>`);
  }
  items.push(`<w:p><w:pPr><w:spacing w:line="400"/><w:ind w:firstLine="640"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>参考文献</w:t></w:r></w:p>`);
  items.push(`<w:p><w:pPr><w:spacing w:line="400"/><w:ind w:firstLine="640"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>致    谢</w:t></w:r></w:p>`);
  items.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);

  for (const ch of written) {
    const ct = ch.number > 1 ? `第${toChinese(ch.number)}章 ${ch.title}` : ch.title;
    items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="400"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>${esc(ct)}</w:t></w:r></w:p>`);
    const lines = (ch.content_generated || '').split('\n').filter((l: string) => l.trim());
    for (const line of lines) {
      items.push(`<w:p><w:pPr><w:spacing w:line="360"/><w:ind w:firstLine="640"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>${esc(line.trim())}</w:t></w:r></w:p>`);
    }
    items.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
  }

  items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="400"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>参考文献</w:t></w:r></w:p>`);
  items.push(`<w:p><w:pPr><w:spacing w:line="360"/><w:ind w:firstLine="640"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/><w:color w:val="999999"/></w:rPr><w:t>[1] 请按GB/T 7714格式添加引用文献</w:t></w:r></w:p>`);
  items.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);

  items.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="400"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>致    谢</w:t></w:r></w:p>`);
  items.push(`<w:p><w:pPr><w:spacing w:line="360"/><w:ind w:firstLine="640"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>感谢指导教师的悉心指导，感谢同学们的帮助，感谢家人的支持。</w:t></w:r></w:p>`);

  return items.join('');
}

export async function exportToDocx(title: string, major: string, studentName: string, chapters: Chapter[]) {
  const body = buildBody(title, major, studentName, chapters);

  const files = [
    {
      name: '[Content_Types].xml',
      input: `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/footer.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`,
    },
    {
      name: '_rels/.rels',
      input: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    },
    {
      name: 'word/_rels/document.xml.rels',
      input: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer.xml"/>
</Relationships>`,
    },
    {
      name: 'word/document.xml',
      input: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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
</w:document>`,
    },
    {
      name: 'word/styles.xml',
      input: `<?xml version="1.0" encoding="UTF-8"?>
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
</w:styles>`,
    },
    {
      name: 'word/settings.xml',
      input: `<?xml version="1.0" encoding="UTF-8"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:defaultTabStop w:val="720"/>
</w:settings>`,
    },
    {
      name: 'word/footer.xml',
      input: `<?xml version="1.0" encoding="UTF-8"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr><w:jc w:val="center"/></w:pPr>
    <w:r><w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:instrText>PAGE</w:instrText></w:r>
    <w:r><w:fldChar w:fldCharType="separate"/></w:r>
    <w:r><w:t>1</w:t></w:r>
    <w:r><w:fldChar w:fldCharType="end"/></w:r>
  </w:p>
</w:ftr>`,
    },
  ];

  const response = await downloadZip(files);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (title || '毕业论文').replace(/[^\w\u4e00-\u9fa5]/g, '_') + '.docx';
  a.click();
  URL.revokeObjectURL(url);
}
