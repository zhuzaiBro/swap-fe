# MetaNodeSwap DEX 前端

基于 Next.js 和 Tailwind CSS 构建的去中心化交易所前端，类似于 Uniswap 的用户界面

## 功能特性

- 🔄 **代币交换**: 类似 Uniswap 的交换界面
- 💧 **流动性池**: 查看和管理流动性池
- 📊 **头寸管理**: 管理您的流动性头寸
- 🎨 **现代化UI**: 基于 Tailwind CSS 的响应式设计
- 🔗 **Web3 集成**: 支持 MetaMask 等钱包连接

## 技术栈

- **框架**: Next.js 15 with App Router
- **样式**: Tailwind CSS 4
- **Web3**: Wagmi + Viem + RainbowKit
- **包管理器**: Bun
- **语言**: TypeScript
- **图标**: Lucide React

## 快速开始

### 安装依赖

```bash
bun install
```

### 启动开发服务器

```bash
bun dev
```

在浏览器中打开 [http://localhost:3000](http://localhost:3000) 查看应用。

### 构建生产版本

```bash
bun run build
bun start
```

## 项目结构

```
src/
├── app/                 # Next.js App Router 页面
│   ├── layout.tsx      # 根布局
│   ├── page.tsx        # 主页（交换界面）
│   ├── pools/          # 流动性池页面
│   └── positions/      # 头寸管理页面
├── components/         # React 组件
│   ├── layout/         # 布局组件
│   └── swap/           # 交换相关组件
└── lib/                # 工具函数和配置
    ├── constants.ts    # 合约地址和配置
    └── utils.ts        # 工具函数
```

## 合约信息

- **网络**: Sepolia 测试网
- **PoolManager**: `0xddC12b3F9F7C91C79DA7433D8d212FB78d609f7B`
- **PositionManager**: `0xbe766Bf20eFfe431829C5d5a2744865974A0B610`
- **SwapRouter**: `0xD2c220143F5784b3bD84ae12747d97C8A36CeCB2`

## 测试代币

- **MNA**: `0x4798388e3adE569570Df626040F07DF71135C48E`
- **MNB**: `0x5A4eA3a013D42Cfd1B1609d19f6eA998EeE06D30`
- **MNC**: `0x86B5df6FF459854ca91318274E47F4eEE245CF28`
- **MND**: `0x7af86B1034AC4C925Ef5C3F637D1092310d83F03`

## 开发说明

这是一个教学项目，旨在展示如何构建类似 Uniswap 的 DEX 前端界面。当前版本包含：

1. **交换界面**: 完整的代币交换UI，包含代币选择、数量输入、滑点设置等
2. **流动性池**: 展示所有可用的交易池信息
3. **头寸管理**: 管理用户的流动性头寸

### 待实现功能

- [ ] 钱包连接集成
- [ ] 合约交互逻辑
- [ ] 实时价格获取
- [ ] 交易历史
- [ ] 流动性添加/移除功能

## 许可证

MIT
