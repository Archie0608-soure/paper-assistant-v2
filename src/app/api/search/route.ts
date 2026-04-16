import { NextRequest, NextResponse } from 'next/server';

const SEARCH_PROMPTS = {
  semantic: (query: string) => `Search for academic papers about: ${query}. Return as JSON array.`,
  openalex: (query: string) => query,
};

// Search Semantic Scholar (disabled - requires API key to avoid rate limits)
async function searchSemanticScholar(query: string, limit: number = 10) {
  return [];
}

// Search OpenAlex - use CORS proxy to avoid server-side network issues
async function searchOpenAlex(query: string, limit: number = 10) {
  try {
    // Use allorigins proxy to avoid CORS/network issues from server
    const proxiedUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${limit}`)}`;
    
    const response = await fetch(proxiedUrl);
    
    if (!response.ok) {
      throw new Error(`OpenAlex error: ${response.status}`);
    }
    
    const data = await response.json();
    return (data.results || []).map((work: any) => ({
      title: work.title,
      authors: work.authorships?.slice(0, 5).map((a: any) => a.author.display_name) || [],
      abstract: work.abstract_inverted_index ? '有摘要' : '无摘要',
      year: work.publication_year,
      citations: work.cited_by_count || 0,
      url: work.doi || `https://openalex.org/works/${work.id}`,
      source: 'OpenAlex',
    }));
  } catch (error) {
    console.error('OpenAlex error:', error);
    return [];
  }
}

// Combined search
export async function searchAcademicPapers(query: string, limit: number = 10) {
  try {
    // Run OpenAlex search (Semantic Scholar requires API key to avoid 429 errors)
    const openalexResults = await searchOpenAlex(query, limit);
    
    // Sort by citations
    openalexResults.sort((a: { citations?: number }, b: { citations?: number }) => (b.citations ?? 0) - (a.citations ?? 0));
    
    return openalexResults.slice(0, limit);
  } catch (error) {
    console.error('Search error:', error);
    return [];
  }
}

// API handler
export async function POST(req: NextRequest) {
  try {
    const { query, limit } = await req.json();
    
    if (!query) {
      return NextResponse.json({ error: '请输入搜索关键词' }, { status: 400 });
    }

    const results = await searchAcademicPapers(query, limit || 10);

    return NextResponse.json({ 
      results,
      total: results.length,
      query,
    });
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json({ error: '搜索失败，请稍后重试' }, { status: 500 });
  }
}
