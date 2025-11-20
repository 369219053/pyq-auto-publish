-- 创建堆雪球好友列表表
CREATE TABLE IF NOT EXISTS duixueqiu_friends (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  friend_name VARCHAR(100) NOT NULL,
  friend_remark VARCHAR(100),
  is_selected BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_duixueqiu_friends_user_id ON duixueqiu_friends(user_id);
CREATE INDEX idx_duixueqiu_friends_is_selected ON duixueqiu_friends(user_id, is_selected);

-- 添加唯一约束(同一用户不能有重复的好友名称)
CREATE UNIQUE INDEX idx_duixueqiu_friends_unique ON duixueqiu_friends(user_id, friend_name);

-- 添加注释
COMMENT ON TABLE duixueqiu_friends IS '堆雪球好友列表';
COMMENT ON COLUMN duixueqiu_friends.user_id IS '用户ID';
COMMENT ON COLUMN duixueqiu_friends.friend_name IS '好友昵称';
COMMENT ON COLUMN duixueqiu_friends.friend_remark IS '好友备注';
COMMENT ON COLUMN duixueqiu_friends.is_selected IS '是否选中(用于批量发送)';

