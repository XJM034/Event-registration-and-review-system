-- 为 divisions 表添加规则字段
-- 在 MemFire SQL Editor 中执行

-- 添加 rules 字段存储组别规则（年龄、性别等）
ALTER TABLE public.divisions
ADD COLUMN IF NOT EXISTS rules jsonb DEFAULT '{}'::jsonb;

-- 添加注释说明
COMMENT ON COLUMN public.divisions.rules IS '组别规则配置，包含年龄限制、性别限制、队员人数限制等。格式：{"gender": "male|female|mixed|none", "minAge": 6, "maxAge": 8, "minPlayers": 5, "maxPlayers": 12}';

-- 示例：为现有组别添加规则（可选）
-- UPDATE public.divisions SET rules = '{"gender": "none", "minAge": 6, "maxAge": 8, "minPlayers": 5, "maxPlayers": 12}'::jsonb WHERE name = 'U8';
-- UPDATE public.divisions SET rules = '{"gender": "male", "minAge": 9, "maxAge": 10, "minPlayers": 7, "maxPlayers": 15}'::jsonb WHERE name = 'U10男子';
