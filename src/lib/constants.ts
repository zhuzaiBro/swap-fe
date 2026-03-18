// 合约地址配置
export const CONTRACTS = {
  POOL_MANAGER: '0x4D328FF423E081115d62c3Ac7213C4cb36dbDd3C',
  POSITION_MANAGER: '0x34E7f4040d3BF3add26857D23683DFb232883406',
  SWAP_ROUTER: '0xe97cD3FCb30595fAC93679Fd3E54379A3B387337',
  LIQUIDITY_MANAGER: '0x34E7f4040d3BF3add26857D23683DFb232883406', // 使用Position Manager作为流动性管理器
} as const

// 测试代币地址
export const TOKENS = {
  ETH: {
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // 原生ETH的特殊地址
    wrappedAddress: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', // Sepolia WETH 地址
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    isNative: true,
  },
  MNTokenA: {
    address: '0x4798388e3adE569570Df626040F07DF71135C48E',
    symbol: 'MNA',
    name: 'MetaNode Token A',
    decimals: 18,
  },
  MNTokenB: {
    address: '0x5A4eA3a013D42Cfd1B1609d19f6eA998EeE06D30',
    symbol: 'MNB',
    name: 'MetaNode Token B',
    decimals: 18,
  },
  MNTokenC: {
    address: '0x86B5df6FF459854ca91318274E47F4eEE245CF28',
    symbol: 'MNC',
    name: 'MetaNode Token C',
    decimals: 18,
  },
  MNTokenD: {
    address: '0x7af86B1034AC4C925Ef5C3F637D1092310d83F03',
    symbol: 'MND',
    name: 'MetaNode Token D',
    decimals: 18,
  },
} as const

export const ETH_SPECIAL_ADDRESS = TOKENS.ETH.address

export function isNativeTokenAddress(address?: string | null): boolean {
  return !!address && address.toLowerCase() === ETH_SPECIAL_ADDRESS.toLowerCase()
}

export function toChainTokenAddress(address: string): string {
  return isNativeTokenAddress(address) ? TOKENS.ETH.wrappedAddress : address
}

export function getTokenByAddress(address?: string | null) {
  if (!address) return undefined

  return Object.values(TOKENS).find((token) => {
    if (token.address.toLowerCase() === address.toLowerCase()) {
      return true
    }

    return 'wrappedAddress' in token &&
      typeof token.wrappedAddress === 'string' &&
      token.wrappedAddress.toLowerCase() === address.toLowerCase()
  })
}

// 网络配置
export const NETWORK_CONFIG = {
  chainId: 11155111, // Sepolia
  name: 'Sepolia',
  rpcUrl: process.env.SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/EykKv3BK7V4UWchOj2M9l',
  blockExplorer: 'https://sepolia.etherscan.io',
} as const

// 默认滑点配置
export const DEFAULT_SLIPPAGE = 0.5 // 0.5%

// 费率选项
export const FEE_TIERS = [500, 3000, 10000] // 0.05%, 0.3%, 1% 