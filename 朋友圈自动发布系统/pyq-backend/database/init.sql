-- 创建用户表
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- 添加注释
COMMENT ON TABLE users IS '用户表';
COMMENT ON COLUMN users.id IS '用户ID';
COMMENT ON COLUMN users.username IS '用户名(登录账号)';
COMMENT ON COLUMN users.name IS '用户姓名';
COMMENT ON COLUMN users.password IS '加密后的密码';
COMMENT ON COLUMN users.created_at IS '创建时间';
COMMENT ON COLUMN users.updated_at IS '更新时间';

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 创建公众号文章表
CREATE TABLE IF NOT EXISTS wechat_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  content TEXT,
  images TEXT[], -- 图片URL数组
  publish_time TIMESTAMP,
  author VARCHAR(100),
  url VARCHAR(1000),
  account_name VARCHAR(100), -- 公众号名称
  account_id VARCHAR(100), -- 公众号ID
  status VARCHAR(50) DEFAULT '待处理', -- 状态: 待处理、改写中、已改写、发布中、已发布、失败
  rewritten_content TEXT, -- 改写后的内容
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_articles_account_id ON wechat_articles(account_id);
CREATE INDEX IF NOT EXISTS idx_articles_publish_time ON wechat_articles(publish_time DESC);
CREATE INDEX IF NOT EXISTS idx_articles_status ON wechat_articles(status);

-- 添加注释
COMMENT ON TABLE wechat_articles IS '公众号文章表';
COMMENT ON COLUMN wechat_articles.id IS '文章ID';
COMMENT ON COLUMN wechat_articles.title IS '文章标题';
COMMENT ON COLUMN wechat_articles.content IS '文章正文(HTML格式)';
COMMENT ON COLUMN wechat_articles.images IS '文章图片URL数组';
COMMENT ON COLUMN wechat_articles.publish_time IS '文章发布时间';
COMMENT ON COLUMN wechat_articles.author IS '文章作者';
COMMENT ON COLUMN wechat_articles.url IS '文章原文链接';
COMMENT ON COLUMN wechat_articles.account_name IS '公众号名称';
COMMENT ON COLUMN wechat_articles.account_id IS '公众号ID';
COMMENT ON COLUMN wechat_articles.status IS '处理状态';
COMMENT ON COLUMN wechat_articles.rewritten_content IS 'AI改写后的内容';
COMMENT ON COLUMN wechat_articles.created_at IS '创建时间';
COMMENT ON COLUMN wechat_articles.updated_at IS '更新时间';

-- 创建更新时间触发器
CREATE TRIGGER update_articles_updated_at BEFORE UPDATE ON wechat_articles
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 创建监控配置表
CREATE TABLE IF NOT EXISTS monitor_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key VARCHAR(100) UNIQUE NOT NULL, -- 配置键名
  config_value TEXT NOT NULL, -- 配置值
  description TEXT, -- 配置说明
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_monitor_config_key ON monitor_config(config_key);

-- 添加注释
COMMENT ON TABLE monitor_config IS '监控配置表';
COMMENT ON COLUMN monitor_config.id IS '配置ID';
COMMENT ON COLUMN monitor_config.config_key IS '配置键名';
COMMENT ON COLUMN monitor_config.config_value IS '配置值';
COMMENT ON COLUMN monitor_config.description IS '配置说明';
COMMENT ON COLUMN monitor_config.created_at IS '创建时间';
COMMENT ON COLUMN monitor_config.updated_at IS '更新时间';

-- 创建更新时间触发器
CREATE TRIGGER update_monitor_config_updated_at BEFORE UPDATE ON monitor_config
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 插入默认监控频率配置(30分钟)
INSERT INTO monitor_config (config_key, config_value, description)
VALUES ('sync_interval_minutes', '30', '自动同步文章的时间间隔(分钟)')
ON CONFLICT (config_key) DO NOTHING;

-- 创建转写历史表
CREATE TABLE IF NOT EXISTS rewrite_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  article_id UUID REFERENCES wechat_articles(id) ON DELETE SET NULL,
  original_content TEXT NOT NULL, -- 原始内容
  original_images TEXT[], -- 原始图片URL数组
  rewritten_content TEXT NOT NULL, -- 转写后的内容
  selected_images TEXT[], -- 用户选择的图片URL数组
  coze_workflow_id VARCHAR(100), -- Coze工作流ID
  status VARCHAR(50) DEFAULT 'completed', -- 状态: processing/completed/failed
  error_message TEXT, -- 错误信息
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_rewrite_history_user_id ON rewrite_history(user_id);
CREATE INDEX IF NOT EXISTS idx_rewrite_history_article_id ON rewrite_history(article_id);
CREATE INDEX IF NOT EXISTS idx_rewrite_history_created_at ON rewrite_history(created_at DESC);

-- 添加注释
COMMENT ON TABLE rewrite_history IS '转写历史表';
COMMENT ON COLUMN rewrite_history.id IS '转写记录ID';
COMMENT ON COLUMN rewrite_history.user_id IS '用户ID';
COMMENT ON COLUMN rewrite_history.article_id IS '关联的文章ID';
COMMENT ON COLUMN rewrite_history.original_content IS '原始文章内容';
COMMENT ON COLUMN rewrite_history.original_images IS '原始图片URL数组';
COMMENT ON COLUMN rewrite_history.rewritten_content IS 'AI转写后的内容';
COMMENT ON COLUMN rewrite_history.selected_images IS '用户选择的图片URL数组';
COMMENT ON COLUMN rewrite_history.coze_workflow_id IS 'Coze工作流ID';
COMMENT ON COLUMN rewrite_history.status IS '转写状态';
COMMENT ON COLUMN rewrite_history.error_message IS '错误信息';
COMMENT ON COLUMN rewrite_history.created_at IS '创建时间';
COMMENT ON COLUMN rewrite_history.updated_at IS '更新时间';

-- 创建更新时间触发器
CREATE TRIGGER update_rewrite_history_updated_at BEFORE UPDATE ON rewrite_history
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

