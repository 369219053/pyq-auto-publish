-- 为follow_circle_tasks表添加content_type字段
ALTER TABLE follow_circle_tasks 
ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) DEFAULT 'text';

-- 添加注释
COMMENT ON COLUMN follow_circle_tasks.content_type IS '内容类型: text(文本), image(图文), link(链接)';

