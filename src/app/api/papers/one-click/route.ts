import { NextRequest, NextResponse } from 'next/server';
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

async function getReferenceDocs(docIds: string[], userId: string): Promise<{filename: string; content: string}[]> {
  if (!docIds?.length) return [];
  const supabase = getSupabase();
  const { data } = await supabase.from('reference_docs').select('filename, content').in('id', docIds).eq('user_id', userId);
  return (data || []) as {filename: string; content: string}[];
}

function formatReferences(refs: {filename: string; content: string}[]): string {
  if (!refs.length) return '';
  return '\n\n【用户上传的参考文献】：\n' + refs.map((r, i) =>
    `【文献${i+1} - ${r.filename}】：\n${r.content.slice(0, 8000)}`
  ).join('\n\n') + '\n【重要】：请结合以上用户上传的参考文献内容来生成论文，确保论文内容与参考资料相符。';
}

// 学历对应的参考字数
const WORD_COUNT_MAP: Record<string, number> = {
  bachelor: 8000,   // 本科
  master: 15000,    // 硕士
  doctoral: 30000,  // 博士
};

// 每千字金币数
const COINS_PER_THOUSAND_WORDS = 60;

// 统计字数（中文按字符数，英文按空格分词后总词数）
function countWords(text: string): number {
  if (!text) return 0;
  // 中文按字符计数，英文按空格/标点分词
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  // 英文词数：去除中文后按空格/标点分词统计
  const withoutChinese = text.replace(/[\u4e00-\u9fff]/g, '');
  const englishWords = (withoutChinese.split(/[\s\n\r,.!?;:，。！？；：、()（）\[\]【】"'']+/).filter(w => w.length > 0).length);
  // 中文字符数 + 英文词数 = 总字数（中文每个字算1字，英文每个词算1字）
  return chineseChars + englishWords;
}

// 清洗论文内容：去除AI输出的干扰字符和乱码
function cleanChapterContent(text: string): string {
  if (!text) return text;
  return text
    // 统一中文引号
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    // 去除首尾空白
    .trim();
}

// 一键生成主函数（后台运行）
async function runOneClickGeneration(paperId: string, params: {
  title: string;
  degree: string;
  targetWords: number;
  major?: string;
  userId?: string;
  estimatedCost?: number;
  referenceDocIds?: string[];
}) {
  const supabase = getSupabase();
  const { title, degree, targetWords, major, referenceDocIds } = params;

  const updateProgress = async (progress: number, status: string = 'generating', content?: string) => {
    const update: any = { progress, status };
    if (content !== undefined) update.chapters = content;
    await supabase.from('papers').update(update).eq('id', paperId);
  };

  try {
    await updateProgress(5);

    // 获取参考文献
    const refs = referenceDocIds?.length ? await getReferenceDocs(referenceDocIds, params.userId || '') : [];
    const refSection = formatReferences(refs);

    // Step 1: 生成大纲
    const outlinePrompt = `你是一个专业的学术论文写作助手。请为以下论文标题生成一个完整的论文大纲。

标题：${title}
学历层次：${degree === 'bachelor' ? '本科' : degree === 'master' ? '硕士' : '博士'}论文
专业：${major || '通用'}${refSection}

要求：
1. 包含以下标准章节：摘要、绪论/引言、理论基础/文献综述、研究方法、问题分析/数据收集、模型构建/实证分析、结论与展望
2. 每个章节给出30-50字的简要说明
3. 严格按照以下JSON数组格式输出，不要输出任何其他内容：
[{"title":"章节标题","desc":"章节说明"},{"title":"章节标题","desc":"章节说明"},...]`;

    const outlineResult = await callSiliconFlow(outlinePrompt);
    await updateProgress(20);

    // Step 2: 解析大纲
    let outline: any[] = [];
    try {
      const match = outlineResult.match(/\[\s*\{[\s\S]*?\}\s*\]/);
      if (match) {
        outline = JSON.parse(match[0]);
      }
    } catch { /* skip */ }

    if (!outline.length) {
      // fallback 简单大纲
      outline = [
        { title: '摘要', desc: '简要概括研究背景、目的、方法、结论' },
        { title: '绪论', desc: '研究背景与意义，国内外研究现状' },
        { title: '理论基础', desc: '相关理论与技术概述' },
        { title: '研究方法', desc: '研究设计、数据来源、分析方法' },
        { title: '实证分析', desc: '数据处理、模型构建、结果分析' },
        { title: '结论与展望', desc: '研究结论、局限性、未来方向' },
      ];
    }

    await updateProgress(25, 'generating', JSON.stringify(outline));

    // Step 3: 逐章生成内容
    const totalChapters = outline.length;
    // 保存每个章节的生成内容（结构化）
    const chapterContents: any[] = [];

    for (let i = 0; i < totalChapters; i++) {
      const chapter = outline[i];
      const chapterWords = Math.floor(targetWords / totalChapters);
      const progressBase = 25 + Math.floor((i / totalChapters) * 65);

      const chapterPrompt = `你是一个专业的学术论文写作助手。请根据以下大纲，为"${chapter.title}"章节生成完整的学术论文内容。

${refSection}

章节标题：${chapter.title}
章节说明：${chapter.desc}
目标字数：约${chapterWords}字
论文标题：${title}

要求：
1. 学术论文风格，语言严谨规范
2. 内容充实，有理有据
3. 如有数据或案例，请合理假设
4. 直接输出正文，不要输出章节标题（已在正文中包含）
5. 字数达标，不要过于简短`;

      const chapterContentRaw = await callSiliconFlow(chapterPrompt);
      const chapterContent = cleanChapterContent(chapterContentRaw);
      chapterContents.push({
        number: i + 1,
        title: chapter.title,
        content: chapterContent,
        written: true,
        content_generated: chapterContent,
      });

      await updateProgress(progressBase, 'generating', JSON.stringify(outline));
    }

    // Step 4: 完成 - 保存结构化章节数组
    await updateProgress(100, 'completed', JSON.stringify(chapterContents));

    // 平衡结算：按实际生成字数计费，多退少补
    if (params.userId && params.estimatedCost !== undefined) {
      const fullText = chapterContents.map((c: any) => c.content_generated || '').join('\n');
      const actualWords = countWords(fullText);
      // 实际字数最多按预估字数的2倍计算，防止AI生成失控导致天价账单
      const cappedActualWords = Math.min(actualWords, (params.targetWords || 10000) * 2);
      const actualCost = Math.round(cappedActualWords / 1000) * COINS_PER_THOUSAND_WORDS;
      const diff = actualCost - params.estimatedCost;
      if (diff !== 0) {
        // 获取当前余额
        const { data: userRow } = await supabase.from('users').select('balance').eq('id', params.userId).single();
        if (!userRow) {
          console.log('字数结算: 用户不存在，跳过');
        } else if (diff > 0) {
          // 少扣了，需要补扣（余额必须够，不允许欠费）
          if ((userRow.balance || 0) < diff) {
            // 余额不足，只记录欠费日志，不扣费（余额不能为负）
            console.log(`字数结算: 余额不足! 实际${actualWords}字, 应付${actualCost}金币, 已扣${params.estimatedCost}, 还需补扣${diff}金币, 当前余额${userRow.balance}金币 —— 跳过补扣`);
          } else {
            // 余额足够，正常补扣
            await supabase.from('users').update({ balance: userRow.balance - diff }).eq('id', params.userId);
            await supabase.from('transactions').insert({
              user_id: params.userId,
              type: 'expense',
              amount: -diff,
              description: '论文生成字数结算补扣',
            });
            console.log(`字数结算: 实际${actualWords}字(上限${cappedActualWords}字), 应付${actualCost}金币, 已扣${params.estimatedCost}, 补扣${diff}金币`);
          }
        } else {
          // 多扣了，退钱（直接加余额）
          const refund = -diff;
          await supabase.from('users').update({ balance: (userRow.balance || 0) + refund }).eq('id', params.userId);
          await supabase.from('transactions').insert({
            user_id: params.userId,
            type: 'recharge',
            amount: refund,
            description: '论文生成字数结算退款',
          });
          console.log(`字数结算: 实际${actualWords}字(上限${cappedActualWords}字), 应付${actualCost}金币, 已扣${params.estimatedCost}, 退款${refund}金币`);
        }
      }
    }
    console.log(`论文生成完成: ${paperId}`);

  } catch (error: any) {
    console.error('一键生成失败:', error);
    await supabase.from('papers').update({ status: 'failed', progress: 0 }).eq('id', paperId);
  }
}

// SiliconFlow DeepSeek V3.2 调用
async function callSiliconFlow(prompt: string): Promise<string> {
  const apiKey = process.env.SILICONFLOW_API_KEY || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('未配置 API Key');

  const usingSiliconFlow = !!process.env.SILICONFLOW_API_KEY;
  const apiUrl = usingSiliconFlow
    ? 'https://api.siliconflow.cn/v1/chat/completions'
    : 'https://api.deepseek.com/v1/chat/completions';
  const model = usingSiliconFlow ? 'deepseek-ai/DeepSeek-V3.2' : 'deepseek-chat';

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// POST: 启动一键生成
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
    const userField = type === 'email' ? 'email' : 'phone';

    const { title, degree, targetWords, major, referenceDocIds } = await req.json();

    if (!title?.trim()) {
      return NextResponse.json({ error: '请输入论文标题' }, { status: 400 });
    }
    if (!degree) {
      return NextResponse.json({ error: '请选择学历层次' }, { status: 400 });
    }

    const supabase = getSupabase();

    // 查找用户
    const { data: users } = await supabase.from('users')
      .select('id, balance')
      .eq(userField, destination)
      .limit(1);

    if (!users || users.length === 0) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    const userId = users[0].id;
    const rawWords = targetWords || WORD_COUNT_MAP[degree] || 10000;
    const words = Math.min(Math.max(Number(rawWords), 1000), 100000); // 限制在1千~10万字

    // 按字数计费：每千字60金币（四舍五入）
    const estimatedCost = Math.round(words / 1000) * COINS_PER_THOUSAND_WORDS;
    if ((users[0].balance ?? 0) < estimatedCost) {
      return NextResponse.json({ error: `余额不足，一键生成约需${estimatedCost}金币（${words}字 × ${COINS_PER_THOUSAND_WORDS}币/千字）` }, { status: 402 });
    }

    // 创建论文记录
    const { data: paper, error: insertErr } = await supabase.from('papers')
      .insert({
        user_id: userId,
        title,
        major: major || '',
        paper_type: degree,
        outline: '[]',
        chapters: '[]',
        selected_papers: null,
        status: 'generating',
        progress: 0,
        degree,
        target_words: words,
      })
      .select('id')
      .single();

    if (insertErr) throw insertErr;

    // 扣金币（乐观锁）
    const deductResult = await supabase.from('users')
      .update({ balance: users[0].balance - estimatedCost })
      .eq('id', userId)
      .eq('balance', users[0].balance);
    console.log('[one-click] 扣款结果:', JSON.stringify(deductResult), '原余额:', users[0].balance, '应扣:', estimatedCost);
    if (deductResult.count !== 1) {
      const { data: fresh } = await supabase.from('users').select('balance').eq('id', userId).maybeSingle();
      const currentBalance = fresh?.balance ?? 0;
      if (currentBalance < estimatedCost) {
        // 回滚论文记录
        await supabase.from('papers').delete().eq('id', paper.id);
        return NextResponse.json({ error: `金币不足（当前余额${currentBalance}，需要${estimatedCost}）` }, { status: 402 });
      }
      await supabase.from('users').update({ balance: currentBalance - estimatedCost }).eq('id', userId).eq('balance', currentBalance);
    }
    // 记录交易
    await supabase.from('transactions').insert({
      user_id: userId,
      type: 'expense',
      amount: -estimatedCost,
      description: '一键论文生成',
    });

    // 立即返回，不等待生成完成
    // 使用 fire-and-forget 模式（Netlify Functions 会保持运行一段时间）
    runOneClickGeneration(paper.id, { title, degree, targetWords: words, major, userId, estimatedCost, referenceDocIds }).catch(console.error);

    return NextResponse.json({
      success: true,
      paperId: paper.id,
      message: `论文生成已启动（预计扣费约${estimatedCost}金币），请到"我的论文"查看进度`,
    });

  } catch (error: any) {
    console.error('一键生成启动失败:', error);
    return NextResponse.json({ error: error.message || '启动失败' }, { status: 500 });
  }
}
