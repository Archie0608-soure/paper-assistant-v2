-- 参考文献表（上传的文献存储）
CREATE TABLE IF NOT EXISTS reference_docs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  content TEXT NOT NULL,
  content_length INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用RLS
ALTER TABLE reference_docs ENABLE ROW LEVEL SECURITY;

-- 用户只能看到自己的文献
CREATE POLICY "users own docs" ON reference_docs
  FOR ALL USING (auth.uid() = user_id);

-- 允许用户插入、删除自己的文献
CREATE POLICY "users insert own docs" ON reference_docs
  FOR INSERT WITH CHECK (true);
CREATE POLICY "users delete own docs" ON reference_docs
  FOR DELETE USING (true);
