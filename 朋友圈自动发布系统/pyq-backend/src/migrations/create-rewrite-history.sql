-- 创建转写历史表
CREATE TABLE IF NOT EXISTS rewrite_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  article_id UUID,
  original_content TEXT NOT NULL,
  original_images TEXT[],
  rewritten_content TEXT NOT NULL,
  selected_images TEXT[],
  coze_workflow_id VARCHAR(100),
  status VARCHAR(50) DEFAULT 'completed',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_rewrite_history_user_id ON rewrite_history(user_id);
CREATE INDEX IF NOT EXISTS idx_rewrite_history_article_id ON rewrite_history(article_id);
CREATE INDEX IF NOT EXISTS idx_rewrite_history_created_at ON rewrite_history(created_at DESC);

