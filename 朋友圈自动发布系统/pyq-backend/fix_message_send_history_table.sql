-- 修复message_send_history表的friend_id字段类型
-- 问题: friend_id字段是UUID类型,应该是BIGINT类型
-- 解决: 删除旧表,重新创建正确的表

-- 1. 删除旧表
DROP TABLE IF EXISTS message_send_history CASCADE;

-- 2. 创建新表(friend_id改为BIGINT类型)
CREATE TABLE message_send_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  friend_id BIGINT NOT NULL,  -- ✅ 改为BIGINT类型,匹配duixueqiu_friends.id
  friend_name TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('text', 'video', 'link', 'image', 'combined')),
  message_content_hash TEXT NOT NULL,  -- SHA-256哈希值,用于快速比对
  message_content JSONB NOT NULL,  -- 完整的消息内容
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  task_id TEXT,  -- 关联的任务ID(可选)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 创建索引
CREATE INDEX idx_message_send_history_lookup 
ON message_send_history(user_id, friend_id, message_content_hash);

CREATE INDEX idx_message_send_history_sent_at 
ON message_send_history(sent_at DESC);

CREATE INDEX idx_message_send_history_user_id 
ON message_send_history(user_id);

-- 4. 添加表注释
COMMENT ON TABLE message_send_history IS '消息发送历史记录表,用于防止重复发送相同消息';
COMMENT ON COLUMN message_send_history.message_content_hash IS '消息内容的SHA-256哈希值,用于快速比对';
COMMENT ON COLUMN message_send_history.message_type IS '消息类型: text(文字), video(视频号), link(链接), image(图片), combined(组合)';
COMMENT ON COLUMN message_send_history.friend_id IS '好友ID,关联duixueqiu_friends.id';

-- 5. 测试插入一条数据
INSERT INTO message_send_history (user_id, friend_id, friend_name, message_type, message_content_hash, message_content, sent_at)
VALUES (
  '2e748b58-8f94-48ba-8a43-a1b0c93ed3a0',  -- user_id (UUID)
  299620,  -- friend_id (BIGINT)
  '测试好友',
  'text',
  'test_hash_123',
  '{"text": "测试消息"}'::jsonb,
  NOW()
);

-- 6. 查询验证
SELECT * FROM message_send_history LIMIT 1;

