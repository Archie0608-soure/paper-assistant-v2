"use client";
import { useState, useRef, useCallback } from "react";
import { Scale, Upload, Download, Loader2, CheckCircle, AlertCircle } from "lucide-react";

const PLATFORMS = [
  { id: "zhiwang", label: "知网" },
  { id: "weipu", label: "维普" },
  { id: "gezida", label: "格子达" },
  { id: "daya", label: "大雅" },
  { id: "turnitin", label: "Turnitin" },
];

type Step = "idle" | "submitting" | "processing" | "done" | "error";

export default function ReduceDocxPage() {
  const [file, setFile] = useState<File | null>(null);
  const [platform, setPlatform] = useState("zhiwang");
  const [lang, setLang] = useState<"chinese" | "english">("chinese");
  const [step, setStep] = useState<Step>("idle");
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState("");
  const [downloadData, setDownloadData] = useState<{ docId: string; url: string; name: string } | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setStep("idle");
    setError("");
    setDownloadData(null);
    setCost(null);
    e.target.value = "";
  };

  const handleStart = async () => {
    if (!file) return;
    setStep("submitting");
    setProgress(3);
    setStatusMsg("正在提交文档...");
    setError("");

    try {
      // Step 1: /cost - 上传文件，计算费用，拿到 doc_id
      const fd = new FormData();
      fd.append("file", file);
      fd.append("lang", lang);
      fd.append("platform", platform);

      const costRes = await fetch("/api/ai/reduce-docx/cost", {
        method: "POST",
        body: fd,
      });
      const costData = await costRes.json();
      if (!costRes.ok) throw new Error(costData.error || "提交文档失败");
      const { sessionId } = costData;
      setCost(costData.cost ?? null);
      setProgress(5);
      setStatusMsg("文档已提交，正在启动处理...");

      // Step 2: /start - 用 sessionId 启动（服务器从内存拿文件，只上传一次到 SpeedAI）
      const startRes = await fetch("/api/ai/reduce-docx/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, lang, platform }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error || "启动处理失败");
      const { docId } = startData; // 拿到真正的 SpeedAI docId
      setProgress(8);

      // Step 3: SSE 订阅进度（后端代理 SpeedAI WebSocket）
      setStep("processing");
      setStatusMsg("已提交，等待处理...");
      subscribeProgress(docId);

    } catch (err: any) {
      setStep("error");
      setError(err.message || "提交失败，请稍后重试");
    }
  };

  const subscribeProgress = (docId: string) => {
    const url = `/api/ai/reduce-docx/progress?doc_id=${encodeURIComponent(docId)}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        const t = msg.type;

        if (t === "connected") {
          setStatusMsg("已连接服务器，等待处理...");
          return;
        }

        if (t === "ping" || t === "pong") return;

        if (t === "progress") {
          const p = Math.round((msg.progress || 0) * 0.8 + 10);
          setProgress(Math.min(p, 90));
          setStatusMsg(msg.stage || `处理中... ${Math.round(msg.progress || 0)}%`);
        }

        if (t === "stage") {
          setStatusMsg(msg.stage || "处理中...");
        }

        if (t === "paragraph") {
          if (msg.status === "processed") {
            setStatusMsg(`已处理段落 ${msg.index}...`);
          } else if (msg.status === "skipped") {
            setStatusMsg(`段落 ${msg.index} 跳过`);
          }
        }

        if (t === "need_pay") {
          es.close();
          setStep("error");
          setError("点数不足，请充值后重试");
        }

        if (t === "error") {
          es.close();
          setStep("error");
          setError(msg.error || "处理失败");
        }

        if (t === "completed") {
          es.close();
          eventSourceRef.current = null;
          setProgress(85);
          setStatusMsg("处理完成，正在下载文件...");

          // Step 4: 下载文件
          downloadFile(docId)
            .then(({ url, name }) => {
              setDownloadData({ docId, url, name });
              setStep("done");
              setProgress(100);
              setStatusMsg("处理完成！");
            })
            .catch((err: any) => {
              setStep("error");
              setError(err.message || "文件下载失败");
            });
        }

      } catch (parseErr) {
        console.error("SSE消息解析失败:", parseErr);
      }
    };

    es.onerror = () => {
      // SSE 断开，切换为轮询 fallback
      es.close();
      eventSourceRef.current = null;
      setStatusMsg("连接中断，切换为轮询模式...");
      pollFallback(docId);
    };
  };

  // Fallback: 前端直接轮询 SpeedAI（不经过我们服务器）
  const pollFallback = async (docId: string) => {
    const apiKey = (window as any).__SPEEDAI_API_KEY__ || "sk-pPYJHnLpQq51mjzHrmSKJ43q";
    const maxPolls = 120;
    for (let i = 0; i < maxPolls; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const fd = new FormData();
        fd.append("user_doc_id", docId);
        const res = await fetch(`https://api3.speedai.chat/v1/docx/status`, {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        const p = Math.round(10 + (i / maxPolls) * 75);
        setProgress(Math.min(p, 85));
        setStatusMsg(`处理中... ${data.progress || Math.round((i / maxPolls) * 100)}%`);

        if (data.status === "completed") {
          setProgress(85);
          setStatusMsg("处理完成，正在下载...");
          const { url, name } = await downloadFile(docId);
          setDownloadData({ docId, url, name });
          setStep("done");
          setProgress(100);
          setStatusMsg("处理完成！");
          return;
        }
        if (data.status === "error") throw new Error(data.error || "处理失败");
        if (data.status === "need_pay") throw new Error("点数不足");
      } catch (e: any) {
        if (e.message.includes("点数") || e.message.includes("失败")) {
          setStep("error");
          setError(e.message);
          return;
        }
      }
    }
    setStep("error");
    setError("处理超时，请稍后重试");
  };

  const downloadFile = async (docId: string): Promise<{ url: string; name: string }> => {
    if (!file) throw new Error("文件丢失");
    const outName = file.name.replace(/\.(docx|doc)$/i, "_降AI.docx");
    const fd = new FormData();
    fd.append("user_doc_id", docId);
    fd.append("file_name", outName);

    const res = await fetch("/api/ai/reduce-docx/download", {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "下载失败");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    return { url, name: outName };
  };

  const handleDownload = () => {
    if (!downloadData) return;
    const a = document.createElement("a");
    a.href = downloadData.url;
    a.download = downloadData.name;
    a.click();
  };

  const progressBarColor =
    step === "error" ? "bg-red-500" : step === "done" ? "bg-green-500" : "bg-orange-500";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <Scale className="w-6 h-6 text-orange-500" />
          <span className="font-bold text-slate-900">Word文档降重降AI（官方SpeedAI引擎）</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* 上传区 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-base font-semibold text-slate-800 mb-4">上传论文</h2>
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl cursor-pointer hover:from-orange-600 hover:to-red-700 transition-all font-medium shadow-sm">
              <Upload className="w-5 h-5" />
              {file ? file.name : "选择.docx文件"}
              <input type="file" accept=".docx" className="hidden" onChange={handleFileUpload} />
            </label>
            {file && (
              <span className="text-sm text-slate-500">{(file.size / 1024).toFixed(1)} KB</span>
            )}
          </div>
          {file && (
            <p className="mt-3 text-xs text-slate-400">
              文件将在 24 小时后自动从 SpeedAI 服务器删除，请及时下载
            </p>
          )}
        </div>

        {/* 设置 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">语言</h3>
              <div className="grid grid-cols-2 gap-2">
                {[{ id: "chinese", label: "中文" }, { id: "english", label: "英文" }].map(l => (
                  <button key={l.id} onClick={() => setLang(l.id as any)}
                    className={"py-2 rounded-lg text-sm font-medium border-2 transition " +
                      (lang === l.id ? "border-orange-500 bg-orange-50 text-orange-700" : "border-slate-200 text-slate-600 hover:border-slate-300")}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">目标平台</h3>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map(p => (
                  <button key={p.id} onClick={() => setPlatform(p.id)}
                    className={"px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition " +
                      (platform === p.id ? "border-orange-500 bg-orange-50 text-orange-700" : "border-slate-200 text-slate-600 hover:border-slate-300")}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 进度 */}
        {step !== "idle" && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {step === "done" ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : step === "error" ? (
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  ) : (
                    <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
                  )}
                  <span className="text-sm font-semibold text-slate-700">
                    {step === "submitting" ? "提交中" : step === "processing" ? "处理中" : step === "done" ? "完成" : "失败"}
                  </span>
                </div>
                <span className="text-sm text-slate-500">{progress}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all duration-500 ${progressBarColor}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <p className="text-sm text-slate-600">{statusMsg}</p>
            {cost !== null && step !== "error" && (
              <p className="mt-2 text-xs text-slate-400">
                预估费用：约 <span className="font-medium text-orange-500">{cost}</span> 点金币
              </p>
            )}
            {error && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
            {step === "done" && downloadData && (
              <button
                onClick={handleDownload}
                className="mt-4 w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold text-sm hover:from-green-600 hover:to-emerald-700 transition-all flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                下载降AI后的Word文档
              </button>
            )}
            {step === "error" && (
              <button
                onClick={handleStart}
                className="mt-4 w-full py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-bold text-sm hover:from-orange-600 hover:to-red-700 transition-all"
              >
                重新处理
              </button>
            )}
          </div>
        )}

        {/* 开始按钮 */}
        {file && step === "idle" && (
          <button
            onClick={handleStart}
            className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-2xl font-bold text-base hover:from-orange-600 hover:to-red-700 transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <Scale className="w-5 h-5" />
            开始处理（官方SpeedAI引擎）
          </button>
        )}

        {/* 提示 */}
        <div className="bg-slate-50 rounded-2xl p-5 text-sm text-slate-500 space-y-1">
          <p className="font-medium text-slate-700">💡 使用提示</p>
          <p>• 使用 SpeedAI 官方引擎，格式完整保留，不丢失Word样式</p>
          <p>• 降重+降AI同步处理，支持上传检测报告做精准过滤</p>
          <p>• 实时显示处理进度，处理完成后直接下载 .docx 文件</p>
          <p>• 文档将在 24 小时后自动从 SpeedAI 服务器删除</p>
        </div>
      </main>
    </div>
  );
}
