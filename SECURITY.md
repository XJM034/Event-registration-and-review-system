# 🔒 安全配置说明

## 环境变量安全

### 开发环境 (`.env.local`)
- `NEXT_PUBLIC_*` 变量会暴露到前端，这是正常的
- `JWT_SECRET` 仅在开发环境使用，生产环境必须更改

### 生产环境 (`.env.production`)
- 必须使用强随机字符串作为 `JWT_SECRET`
- 更新 `NEXT_PUBLIC_API_URL` 为生产域名
- 确保所有敏感信息都通过环境变量或密钥管理服务设置

## 代码保护措施

### Next.js 配置安全功能
1. **代码混淆**: `swcMinify: true` - 使用 SWC 进行代码压缩和混淆
2. **源码映射**: `productionBrowserSourceMaps: false` - 生产环境禁用源码映射
3. **安全头**: 防止 XSS、点击劫持等攻击
4. **压缩**: `compress: true` - 启用 gzip 压缩

### 安全头配置
- `X-Frame-Options: DENY` - 防止点击劫持
- `X-Content-Type-Options: nosniff` - 防止 MIME 类型嗅探
- `Referrer-Policy: strict-origin-when-cross-origin` - 控制引用信息
- `X-XSS-Protection: 1; mode=block` - XSS 保护

## 部署安全检查清单

### 部署前必须检查
- [ ] 更改 `JWT_SECRET` 为强随机字符串
- [ ] 更新 `NEXT_PUBLIC_API_URL` 为生产域名
- [ ] 确认 `.env.local` 和敏感文件不在版本控制中
- [ ] 运行生产构建测试：`npm run build`

### 验证安全措施
- [ ] 检查生产环境JS文件是否已混淆
- [ ] 确认没有源码映射文件(.map)
- [ ] 验证安全头是否正确设置
- [ ] 测试 JWT 密钥是否不在前端暴露

## 代码审查要点

1. **敏感信息检查**
   - 不要在前端代码中硬编码密钥
   - 使用环境变量管理配置

2. **API 安全**
   - 所有管理员 API 都有权限验证
   - JWT token 正确处理

3. **输入验证**
   - 使用 Zod 进行数据验证
   - 防止 SQL 注入和 XSS

## 生产环境命令

```bash
# 构建生产版本
npm run build

# 启动生产服务器
npm start

# 检查构建结果
ls -la .next/static/chunks/
```

## 应急响应

如发现安全问题：
1. 立即更改所有密钥和密码
2. 检查日志文件查找异常活动
3. 更新到最新版本
4. 重新部署应用程序