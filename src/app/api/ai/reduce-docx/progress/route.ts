// /api/ai/reduce-docx/progress - SSE 代理：后端用 ws 连 SpeedAI WS，转发消息给前端
import { NextRequest, NextResponse } from 'next/server';
import WebSocket from 'ws';

const SPEEDAI_API_KEY = process.env.SPEEDAI_API_KEY || 'sk-pPYJHnLpQq51mjzHrmSKJ43q';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const docId = searchParams.get('doc_id');

  if (!docId) {
    return new NextResponse('Missing doc_id', { status: 400 });
  }

  const encoder = new TextEncoder();
  const wsUrl = `wss://api3.speedai.chat/v1/docx/progress?token=${encodeURIComponent(SPEEDAI_API_KEY)}&doc_id=${encodeURIComponent(docId)}&snapshot_chunk_size=50`;

  const stream = new ReadableStream({
    start(controller) {
      const enqueue = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      let closed = false;
      const cleanup = () => {
        if (closed) return;
        closed = true;
        try { ws.close(); } catch {}
        try { controller.close(); } catch {}
      };

      const ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        enqueue({ type: 'connected', doc_id: docId });
      });

      ws.on('message', (data: WebSocket.RawData) => {
        try {
          const text = data.toString();
          const msg = JSON.parse(text);
          enqueue(msg);

          if (msg.type === 'completed' || msg.type === 'error' || msg.type === 'need_pay') {
            cleanup();
          }
        } catch {}
      });

      ws.on('error', () => {
        enqueue({ type: 'error', error: 'WebSocket 连接失败' });
        cleanup();
      });

      ws.on('close', () => {
        cleanup();
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
