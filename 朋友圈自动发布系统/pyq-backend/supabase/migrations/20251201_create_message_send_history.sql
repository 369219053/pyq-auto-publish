-- 创建消息发送历史表
-- 用于防止重复发送相同消息给好友
-- 创建时间: 2025-12-01

CREATE TABLE IF NOT EXISTS message_send_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  friend_id BIGINT NOT NULL,  -- 匹配duixueqiu_friends.id的类型
  friend_name TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('text', 'video', 'link', 'combined')),
  message_content_hash TEXT NOT NULL,  -- SHA-256哈希值,用于快速比对
  message_content JSONB NOT NULL,  -- 完整的消息内容
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  task_id TEXT,  -- 关联的任务ID(可选)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建复合索引,用于快速查询是否已发送过相同消息
CREATE INDEX IF NOT EXISTS idx_message_send_history_lookup 
ON message_send_history(user_id, friend_id, message_content_hash);

-- 创建时间索引,用于按时间查询
CREATE INDEX IF NOT EXISTS idx_message_send_history_sent_at 
ON message_send_history(sent_at DESC);

-- 创建用户索引,用于按用户查询
CREATE INDEX IF NOT EXISTS idx_message_send_history_user_id 
ON message_send_history(user_id);

-- 添加表注释
COMMENT ON TABLE message_send_history IS '消息发送历史记录表,用于防止重复发送相同消息';
COMMENT ON COLUMN message_send_history.message_content_hash IS '消息内容的SHA-256哈希值,用于快速比对';
COMMENT ON COLUMN message_send_history.message_type IS '消息类型: text(文字), video(视频号), link(链接), combined(组合)';
COMMENT ON COLUMN message_send_history.friend_id IS '好友ID,关联duixueqiu_friends.id';

