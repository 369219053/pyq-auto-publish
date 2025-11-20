-- 创建堆雪球视频号素材库表
CREATE TABLE IF NOT EXISTS duixueqiu_video_materials (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  author_name VARCHAR(200),  -- 发布者名称（如"纪老板私人号"）
  content_desc TEXT,  -- 内容描述（带话题标签）
  material_index INT,  -- 在素材库中的索引位置（用于定位）
  page_number INT DEFAULT 1,  -- 所在页码
  group_name VARCHAR(100) DEFAULT '公共素材分组',  -- 素材分组
  sync_time TIMESTAMP DEFAULT NOW(),  -- 同步时间
  create_time TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, author_name, content_desc)  -- 防止重复
);

-- 创建索引
CREATE INDEX idx_duixueqiu_video_materials_user_id ON duixueqiu_video_materials(user_id);
CREATE INDEX idx_duixueqiu_video_materials_author_name ON duixueqiu_video_materials(author_name);
CREATE INDEX idx_duixueqiu_video_materials_sync_time ON duixueqiu_video_materials(sync_time);

-- 添加注释
COMMENT ON TABLE duixueqiu_video_materials IS '堆雪球视频号素材库';
COMMENT ON COLUMN duixueqiu_video_materials.author_name IS '视频号发布者名称';
COMMENT ON COLUMN duixueqiu_video_materials.content_desc IS '视频号内容描述';
COMMENT ON COLUMN duixueqiu_video_materials.material_index IS '素材在列表中的索引位置';
COMMENT ON COLUMN duixueqiu_video_materials.page_number IS '素材所在页码';
COMMENT ON COLUMN duixueqiu_video_materials.sync_time IS '最后同步时间';

