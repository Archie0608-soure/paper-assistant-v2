export default function AboutPage() {
  return (
    <div className="min-h-screen select-none animate-aurora">
      {/* Header */}
      <header className="bg-[#7c3aed] sticky top-0 z-50 shadow-md">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-white/80 hover:text-white transition-colors text-sm">
            ← 返回首页
          </a>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center overflow-hidden">
              <img src="https://api.dicebear.com/7.x/micah/svg?seed=Pepper" alt="logo" className="w-full h-full" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Pepper</h1>
              <p className="text-white/70 text-xs">智能论文助手</p>
            </div>
          </div>
          <div className="w-20" />
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Logo Section */}
        <div className="text-center mb-10">
          <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <img src="https://api.dicebear.com/7.x/micah/svg?seed=Pepper" alt="logo" className="w-16 h-16" />
          </div>
          <h2 className="text-3xl font-bold text-slate-800 mb-2">关于 Pepper</h2>
          <p className="text-slate-500">智能论文助手 · 让学术写作更轻松</p>
        </div>

        {/* Features */}
        <div className="bg-white/80 backdrop-blur rounded-2xl p-6 mb-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4">✨ 核心功能</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-purple-50 rounded-xl">
              <h4 className="font-medium text-slate-800 mb-1">📚 论文生成</h4>
              <p className="text-sm text-slate-500">根据选题和大纲，自动生成完整论文内容</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-xl">
              <h4 className="font-medium text-slate-800 mb-1">✍️ AI 创作</h4>
              <p className="text-sm text-slate-500">DeepSeek 驱动，智能续写、润色、改写</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-xl">
              <h4 className="font-medium text-slate-800 mb-1">🔄 降重降AI</h4>
              <p className="text-sm text-slate-500">降低论文重复率，规避AI检测</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-xl">
              <h4 className="font-medium text-slate-800 mb-1">🔍 AIGC 检测</h4>
              <p className="text-sm text-slate-500">检测文本是否为AI生成</p>
            </div>
          </div>
        </div>

        {/* About */}
        <div className="bg-white/80 backdrop-blur rounded-2xl p-6 mb-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4">💡 关于我们</h3>
          <div className="space-y-3 text-slate-600">
            <p>
              Pepper 是一个由 AI 驱动的智能论文助手，致力于帮助学术写作者提升效率。
            </p>
            <p>
              我们使用先进的自然语言处理技术，为用户提供论文生成、润色、改写、降重、AIGC 检测等功能。
            </p>
            <p>
              无论你是正在撰写毕业论文、期刊论文还是课程论文，Pepper 都能为你提供有力的辅助支持。
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="bg-white/80 backdrop-blur rounded-2xl p-6 mb-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4">📊 数据统计</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-purple-600">99+</p>
              <p className="text-sm text-slate-500">训练论文</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-600">5450+</p>
              <p className="text-sm text-slate-500">训练片段</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-600">7B</p>
              <p className="text-sm text-slate-500">模型参数</p>
            </div>
          </div>
        </div>

        {/* Contact */}
        <div className="bg-white/80 backdrop-blur rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4">📧 联系我们</h3>
          <p className="text-slate-600 mb-4">
            如有问题或建议，欢迎通过以下方式联系我们：
          </p>
          <div className="space-y-2 text-slate-600">
            <p>📝 官方网站：<a href="https://www.pepperai.com" className="text-purple-600 hover:underline">www.pepperai.com</a></p>
            <p>💬 客服邮箱：support@pepperai.com</p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-slate-400">
          <p>© 2026 Pepper. All rights reserved.</p>
        </div>
      </main>
    </div>
  );
}
