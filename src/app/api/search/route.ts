import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/apiAuth';

interface Paper {
  title: string;
  authors: string[];
  abstract: string;
  year: number | null;
  citations: number;
  url: string;
  source: string;
}

// ─── 1. OpenAlex ────────────────────────────────────────────────
async function searchOpenAlex(query: string, limit: number = 20): Promise<Paper[]> {
  try {
    const res = await fetch(
      `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${limit}&sort=cited_by_count:desc`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map((w: any) => ({
      title: w.title || '无标题',
      authors: (w.authorships || []).slice(0, 5).map((a: any) => a.author?.display_name).filter(Boolean),
      abstract: w.abstract_inverted_index ? '有摘要' : '无摘要',
      year: w.publication_year || null,
      citations: w.cited_by_count || 0,
      url: w.doi ? `https://doi.org/${w.doi}` : `https://openalex.org/works/${w.id}`,
      source: 'OpenAlex',
    }));
  } catch (e) {
    console.error('OpenAlex error:', e);
    return [];
  }
}

// ─── 2. arXiv ───────────────────────────────────────────────────
async function searchArxiv(query: string, limit: number = 20): Promise<Paper[]> {
  try {
    // arXiv requires at least 3 chars, use full query
    const searchTerm = query.length < 3 ? query + ' artificial intelligence' : query;
    const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(searchTerm)}&max_results=${limit}&sortBy=relevance`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return [];
    const text = await res.text();
    const entries = text.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
    return entries.map((entry: string) => {
      const title = (entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').replace(/\s+/g, ' ').trim();
      const authors: string[] = (entry.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/g) || [])
        .map((a: string) => a.match(/<name>([\s\S]*?)<\/name>/)?.[1])
        .filter((v): v is string => Boolean(v))
        .slice(0, 5);
      const published = entry.match(/<published>([\s\S]*?)<\/published>/)?.[1] || '';
      const year = published ? parseInt(published) : null;
      const summary = (entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] || '').replace(/\s+/g, ' ').trim();
      const abs = summary.length > 50 ? summary.slice(0, 120) + '...' : summary || '无摘要';
      const pdfLink = entry.match(/<link title="pdf" href="([^"]+)"/)?.[1] || '';
      const id = entry.match(/<id>([\s\S]*?)<\/id>/)?.[1] || '';
      return { title, authors, abstract: abs, year, citations: 0, url: pdfLink || id || '#', source: 'arXiv' };
    });
  } catch (e) {
    console.error('arXiv error:', e);
    return [];
  }
}

// ─── 3. CrossRef ───────────────────────────────────────────────
async function searchCrossRef(query: string, limit: number = 20): Promise<Paper[]> {
  try {
    const url = `https://api.crossref.org/works?query.title=${encodeURIComponent(query)}&rows=${limit}&select=DOI,title,author,published-print,container-title,abstract,cited-by-count&sort=cited-by-count:desc`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'PepperAI/1.0 (mailto:pepperai@163.com)' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.message?.items || []).map((item: any) => {
      const authors = (item.author || []).slice(0, 5).map((a: any) => `${a.given || ''} ${a.family || ''}`).filter(Boolean);
      const year = item['published-print']?.['date-parts']?.[0]?.[0] || item['published-online']?.['date-parts']?.[0]?.[0] || null;
      const abstract_ = item.abstract?.replace(/<[^>]+>/g, '').slice(0, 150) || '无摘要';
      return {
        title: item.title?.[0] || '无标题',
        authors,
        abstract: abstract_.length > 10 ? abstract_ + '...' : abstract_,
        year,
        citations: item['cited-by-count'] || 0,
        url: item.DOI ? `https://doi.org/${item.DOI}` : '#',
        source: 'CrossRef',
      };
    });
  } catch (e) {
    console.error('CrossRef error:', e);
    return [];
  }
}

// ─── 4. PubMed ─────────────────────────────────────────────────
async function searchPubMed(query: string, limit: number = 10): Promise<Paper[]> {
  try {
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${limit}&retmode=json&sort=relevance`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
    const searchData = await searchRes.json();
    const ids = (searchData.esearchresult?.idlist || []).slice(0, limit);
    if (ids.length === 0) return [];
    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`;
    const fetchRes = await fetch(fetchUrl, { signal: AbortSignal.timeout(8000) });
    const fetchData = await fetchRes.json();
    return ids.map((id: string) => {
      const doc = fetchData.result?.[id];
      if (!doc) return null;
      const authors = (doc.authors || []).slice(0, 5).map((a: any) => a.name).filter(Boolean);
      const year = doc.pubdate ? parseInt(doc.pubdate) : null;
      const title = doc.title || '无标题';
      const eloc = doc.elocationid || '';
      return { title, authors, abstract: doc.enabs || '无摘要', year, citations: 0, url: `https://pubmed.ncbi.nlm.nih.gov/${id}/${eloc}`, source: 'PubMed' };
    }).filter(Boolean);
  } catch (e) {
    console.error('PubMed error:', e);
    return [];
  }
}

// ─── 5. DOAJ ───────────────────────────────────────────────────
async function searchDOAJ(query: string, limit: number = 10): Promise<Paper[]> {
  try {
    const url = `https://doaj.org/api/v2/search/articles/${encodeURIComponent(query)}?pageSize=${limit}&fields=title,authors,abstract,datePublished,citationCount`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map((item: any) => {
      const authors = (item.authors || []).slice(0, 5).map((a: any) => a.name).filter(Boolean);
      return {
        title: item.title || '无标题',
        authors,
        abstract: (item.abstract || '无摘要').slice(0, 150) + (item.abstract?.length > 150 ? '...' : ''),
        year: item.datePublished ? parseInt(item.datePublished) : null,
        citations: item.citationCount || 0,
        url: item.link || '#',
        source: 'DOAJ',
      };
    });
  } catch (e) {
    console.error('DOAJ error:', e);
    return [];
  }
}

// ─── 6. Europe PMC ─────────────────────────────────────────────
async function searchEuropePMC(query: string, limit: number = 10): Promise<Paper[]> {
  try {
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&resulttype=core&format=json&pageSize=${limit}&sort=citedbycount:desc`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.resultList?.result || []).map((r: any) => ({
      title: r.title || '无标题',
      authors: (r.authorList?.author || []).slice(0, 5).map((a: any) => a.firstName ? `${a.firstName} ${a.lastName}` : a.fullName).filter(Boolean),
      abstract: (r.abstractText || '无摘要').slice(0, 150) + (r.abstractText?.length > 150 ? '...' : ''),
      year: r.pubYear ? parseInt(r.pubYear) : null,
      citations: r.citedByCount || 0,
      url: r.fullTextUrlList?.fullTextUrl?.find((f: any) => f.documentStyle === 'pdf')?.url || r.pubmedId ? `https://pubmed.ncbi.nlm.nih.gov/${r.pubmedId}/` : '#',
      source: 'Europe PMC',
    }));
  } catch (e) {
    console.error('Europe PMC error:', e);
    return [];
  }
}

// ─── Combined search ────────────────────────────────────────────
export async function searchAcademicPapers(query: string, limit: number = 100): Promise<Paper[]> {
  const [openalex, arxiv, crossref, pubmed, doaj, europePMC] = await Promise.allSettled([
    searchOpenAlex(query, Math.ceil(limit * 0.40)),
    searchArxiv(query, Math.ceil(limit * 0.20)),
    searchCrossRef(query, Math.ceil(limit * 0.25)),
    searchPubMed(query, Math.ceil(limit * 0.08)),
    searchDOAJ(query, Math.ceil(limit * 0.04)),
    searchEuropePMC(query, Math.ceil(limit * 0.03)),
  ]);

  const all: Paper[] = [
    ...(openalex.status === 'fulfilled' ? openalex.value : []),
    ...(arxiv.status === 'fulfilled' ? arxiv.value : []),
    ...(crossref.status === 'fulfilled' ? crossref.value : []),
    ...(pubmed.status === 'fulfilled' ? pubmed.value : []),
    ...(doaj.status === 'fulfilled' ? doaj.value : []),
    ...(europePMC.status === 'fulfilled' ? europePMC.value : []),
  ];

  // Deduplicate by title
  const seen = new Set<string>();
  const deduped = all.filter(p => {
    const key = p.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by citations desc, then by source quality
  const sourceOrder: Record<string, number> = {
    OpenAlex: 7, EuropePMC: 6, CrossRef: 5, PubMed: 4, DOAJ: 3, arXiv: 2,
  };
  deduped.sort((a, b) => (b.citations ?? 0) - (a.citations ?? 0)
    || (sourceOrder[b.source] || 0) - (sourceOrder[a.source] || 0));

  return deduped.slice(0, limit);
}

// ─── API handler ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const check = verifySession(req);
  if (!check.ok) return check.response;
  try {
    const { query, limit } = await req.json();
    if (!query) {
      return NextResponse.json({ error: '请输入搜索关键词' }, { status: 400 });
    }

    const results = await searchAcademicPapers(query, Math.min(limit || 100, 150));

    return NextResponse.json({
      results,
      total: results.length,
      query,
      sources: ['OpenAlex', 'arXiv', 'CrossRef', 'PubMed', 'DOAJ', 'Europe PMC'],
    });
  } catch (error: any) {
    console.error('Search API error:', error);
    return NextResponse.json({ error: '搜索失败，请稍后重试' }, { status: 500 });
  }
}
