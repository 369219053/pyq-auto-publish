-- 创建消息发送历史表
-- 用于记录已发送的消息,防止重复发送

CREATE TABLE IF NOT EXISTS message_send_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  friend_id UUID NOT NULL,
  friend_name TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('text', 'video', 'link', 'combined')),
  message_content_hash TEXT NOT NULL,
  message_content JSONB NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  task_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引,用于快速查询是否已发送
CREATE INDEX IF NOT EXISTS idx_message_send_history_lookup 
ON message_send_history(user_id, friend_id, message_content_hash);

-- 创建索引,用于按时间查询
CREATE INDEX IF NOT EXISTS idx_message_send_history_sent_at 
ON message_send_history(sent_at DESC);

-- 创建索引,用于按用户查询
CREATE INDEX IF NOT EXISTS idx_message_send_history_user_id 
ON message_send_history(user_id);

-- 添加注释
COMMENT ON TABLE message_send_history IS '消息发送历史表,记录已发送的消息,防止重复发送';
COMMENT ON COLUMN message_send_history.user_id IS '用户ID';
COMMENT ON COLUMN message_send_history.friend_id IS '好友ID(关联duixueqiu_friends表)';
COMMENT ON COLUMN message_send_history.friend_name IS '好友名称(冗余字段,方便查询)';
COMMENT ON COLUMN message_send_history.message_type IS '消息类型: text(文字), video(视频号), link(链接), combined(组合)';
COMMENT ON COLUMN message_send_history.message_content_hash IS '消息内容哈希值,用于快速比对是否重复';
COMMENT ON COLUMN message_send_history.message_content IS '完整消息内容(JSONB格式)';
COMMENT ON COLUMN message_send_history.sent_at IS '发送时间';
COMMENT ON COLUMN message_send_history.task_id IS '任务ID(可选)';

-- 启用RLS (Row Level Security)
ALTER TABLE message_send_history ENABLE ROW LEVEL SECURITY;

-- 创建RLS策略: 用户只能查看和操作自己的数据
CREATE POLICY "Users can view their own message history"
ON message_send_history
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own message history"
ON message_send_history
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own message history"
ON message_send_history
FOR DELETE
USING (auth.uid() = user_id);

