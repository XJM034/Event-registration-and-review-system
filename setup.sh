#!/bin/bash

# 快速设置脚本
# 用于快速配置开发环境

echo "🚀 体育赛事报名系统 - 快速设置"
echo "================================"
echo ""

# 检查 .env.local 是否存在
if [ -f .env.local ]; then
    echo "⚠️  .env.local 已存在"
    read -p "是否覆盖现有配置？(y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ 已取消"
        exit 1
    fi
fi

# 复制模板
echo "📋 复制环境变量模板..."
cp .env.example .env.local

echo ""
echo "✅ .env.local 已创建"
echo ""
echo "📝 接下来需要配置以下环境变量："
echo ""
echo "1. NEXT_PUBLIC_SUPABASE_URL"
echo "2. NEXT_PUBLIC_SUPABASE_ANON_KEY（或 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY，脚本会自动补齐别名）"
echo "3. SUPABASE_SERVICE_ROLE_KEY"
echo "4. JWT_SECRET"
echo ""
echo "💡 提示："
echo "   - 前往 MemFire 控制台获取 Supabase 配置"
echo "   - 使用以下命令生成 JWT_SECRET："
echo "     node -e \"console.log(require('crypto').randomBytes(64).toString('base64'))\""
echo ""
echo "📖 详细说明请查看 README.md"
echo ""

# 询问是否安装依赖
read -p "是否立即安装依赖？(Y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    echo ""
    echo "📦 安装依赖..."
    pnpm install
    echo ""
    echo "✅ 依赖安装完成"
fi

echo ""
echo "🎉 设置完成！"
echo ""
echo "下一步："
echo "1. 编辑 .env.local 填入真实的环境变量"
echo "2. 运行 pnpm env:sync 将这份配置保存到当前机器"
echo "3. 运行 pnpm dev 启动开发服务器"
echo ""
