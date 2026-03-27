'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ArrowUpDown, Settings, ChevronDown, CheckCircle, Clock } from 'lucide-react'
import { useAccount, useBalance } from 'wagmi'
import { parseUnits } from 'viem'
import { TOKENS, toChainTokenAddress } from '@/lib/constants'
import { supabase } from '@/lib/supabase'
import { cn, formatTokenAmount, parseInputAmount, shortenAddress } from '@/lib/utils'
import { useSwap } from '@/hooks/useSwap'
import { usePools } from '@/hooks/usePools'

type Token = {
  address: string
  symbol: string
  name: string
  decimals: number
  supportsPermit?: boolean
}

const ETH_TOKEN: Token = {
  address: TOKENS.ETH.address,
  symbol: TOKENS.ETH.symbol,
  name: TOKENS.ETH.name,
  decimals: TOKENS.ETH.decimals,
  supportsPermit: false,
}
const ETH_ADDRESS_LOWER = TOKENS.ETH.address.toLowerCase()
const WETH_ADDRESS_LOWER = TOKENS.ETH.wrappedAddress.toLowerCase()
const LEGACY_WETH_ADDRESS_LOWER = '0xfff9976782d46cc05630d1f6ebab18b2324d6b14'
const WRAPPED_ETH_ALIASES = new Set<string>([
  WETH_ADDRESS_LOWER,
  LEGACY_WETH_ADDRESS_LOWER,
])

const FALLBACK_TOKEN_LIST: Token[] = [
  ETH_TOKEN,
  ...Object.values(TOKENS)
  .filter((token) => !('isNative' in token && token.isNative))
  .map((token) => ({
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    supportsPermit: false,
  })),
]

export default function SwapInterface() {
  const { address, isConnected } = useAccount()
  const [tokenList, setTokenList] = useState<Token[]>(FALLBACK_TOKEN_LIST)
  const [fromToken, setFromToken] = useState<Token>(FALLBACK_TOKEN_LIST[0])
  const [toToken, setToToken] = useState<Token>(FALLBACK_TOKEN_LIST[1] ?? FALLBACK_TOKEN_LIST[0])
  const [fromAmount, setFromAmount] = useState('')
  const [toAmount, setToAmount] = useState('')
  const [slippage, setSlippage] = useState(0.5)
  const [showSettings, setShowSettings] = useState(false)
  const [needsApproval, setNeedsApproval] = useState(false)
  const [isQuoting, setIsQuoting] = useState(false)
  const [isSimulated, setIsSimulated] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)

  // 使用自定义交换 hooks
  const {
    executeSwap,
    approveToken,
    getQuote,
    useTokenAllowance,
    isPending,
    isConfirming,
    isConfirmed,
    hash,
  } = useSwap()
  const { pools, loading: poolsLoading, error: poolsError } = usePools();
  const toComparableAddress = useCallback((tokenAddress: string) => {
    const normalized = tokenAddress.toLowerCase()
    if (normalized === ETH_ADDRESS_LOWER || WRAPPED_ETH_ALIASES.has(normalized)) {
      return WETH_ADDRESS_LOWER
    }
    return toChainTokenAddress(tokenAddress).toLowerCase()
  }, [])
  const isEthLikeAddress = useCallback((tokenAddress: string) => {
    const normalized = tokenAddress.toLowerCase()
    return normalized === ETH_ADDRESS_LOWER || WRAPPED_ETH_ALIASES.has(normalized)
  }, [])

  const expandAddressAlias = useCallback((tokenAddress: string) => {
    const normalized = tokenAddress.toLowerCase()
    if (normalized === ETH_ADDRESS_LOWER || WRAPPED_ETH_ALIASES.has(normalized)) {
      return [ETH_ADDRESS_LOWER, ...Array.from(WRAPPED_ETH_ALIASES)]
    }
    return [normalized]
  }, [])

  useEffect(() => {
    // console.log('pools', pools)
  }, [pools])

  useEffect(() => {
    if (isEthLikeAddress(fromToken.address) && fromToken.address.toLowerCase() !== ETH_ADDRESS_LOWER) {
      setFromToken(ETH_TOKEN)
    }
    if (isEthLikeAddress(toToken.address) && toToken.address.toLowerCase() !== ETH_ADDRESS_LOWER) {
      setToToken(ETH_TOKEN)
    }
  }, [fromToken.address, toToken.address, isEthLikeAddress])

  const poolAdjacency = useMemo(() => {
    const adjacency = new Map<string, Set<string>>()

    const addEdge = (a: string, b: string) => {
      const keyA = a.toLowerCase()
      const keyB = b.toLowerCase()
      if (!adjacency.has(keyA)) adjacency.set(keyA, new Set())
      adjacency.get(keyA)!.add(keyB)
    }

    for (const pool of pools) {
      addEdge(pool.token0, pool.token1)
      addEdge(pool.token1, pool.token0)
    }
    return adjacency
  }, [pools])

  const getLinkedTokenOptions = useCallback(
    (baseTokenAddress: string, fallbackExcludeAddress?: string) => {
      const baseAliases = expandAddressAlias(baseTokenAddress)
      const linked = new Set<string>()
      for (const alias of baseAliases) {
        for (const next of poolAdjacency.get(alias) ?? []) {
          linked.add(next)
          for (const nextAlias of expandAddressAlias(next)) {
            linked.add(nextAlias)
          }
        }
      }

      const excludeComparable = fallbackExcludeAddress
        ? toComparableAddress(fallbackExcludeAddress)
        : undefined

      if (!linked || linked.size === 0) {
        return tokenList.filter(
          (token) => toComparableAddress(token.address) !== excludeComparable
        )
      }

      return tokenList.filter((token) => {
        if (toComparableAddress(token.address) === excludeComparable) return false
        return expandAddressAlias(token.address).some((alias) => linked.has(alias))
      })
    },
    [poolAdjacency, tokenList, expandAddressAlias, toComparableAddress]
  )

  const toTokenOptions = useMemo(() => {
    return getLinkedTokenOptions(fromToken.address, fromToken.address)
  }, [fromToken.address, getLinkedTokenOptions])

  const fromTokenOptions = useMemo(() => {
    return getLinkedTokenOptions(toToken.address, toToken.address)
  }, [toToken.address, getLinkedTokenOptions])

  const activePairPools = useMemo(() => {
    const from = toComparableAddress(fromToken.address)
    const to = toComparableAddress(toToken.address)
    return pools.filter((pool) => {
      const p0 = toComparableAddress(pool.token0)
      const p1 = toComparableAddress(pool.token1)
      return (p0 === from && p1 === to) || (p0 === to && p1 === from)
    })
  }, [pools, fromToken.address, toToken.address, toComparableAddress])

  const selectedIndexPath = useMemo<number[]>(() => {
    if (activePairPools.length === 0) return []
    const sorted = [...activePairPools].sort((a, b) => {
      const liqA = Number(a.liquidity || '0')
      const liqB = Number(b.liquidity || '0')
      return liqB - liqA
    })
    return [sorted[0].index]
  }, [activePairPools])

  // 优先使用 Supabase tokens 表；失败时回退到前端内置列表。
  useEffect(() => {
    const loadTokens = async () => {
      try {
        const { data, error } = await supabase
          .from('tokens')
          .select('address, symbol, name, decimals, supports_permit')
          .order('symbol', { ascending: true })

        if (error) {
          throw error
        }

        const fetchedTokens = (data ?? [])
          .filter(
            (token) =>
              !!token.address &&
              !!token.symbol &&
              !!token.name &&
              typeof token.decimals === 'number' &&
              !WRAPPED_ETH_ALIASES.has(token.address.toLowerCase()) &&
              token.symbol.toUpperCase() !== 'WETH'
          )
          .map((token) => ({
            address: token.address,
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            supportsPermit: Boolean(token.supports_permit),
          }))

        const mergedTokenMap = new Map<string, Token>()
        for (const token of fetchedTokens) {
          mergedTokenMap.set(token.address.toLowerCase(), token)
        }
        mergedTokenMap.set(ETH_TOKEN.address.toLowerCase(), ETH_TOKEN)

        const mergedTokens = Array.from(mergedTokenMap.values()).sort((a, b) => {
          if (a.address.toLowerCase() === ETH_TOKEN.address.toLowerCase()) return -1
          if (b.address.toLowerCase() === ETH_TOKEN.address.toLowerCase()) return 1
          return a.symbol.localeCompare(b.symbol)
        })

        if (mergedTokens.length === 0) return

        setTokenList(mergedTokens)
        setFromToken((prev) => {
          return (
            mergedTokens.find(
              (token) => token.address.toLowerCase() === prev.address.toLowerCase()
            ) ?? mergedTokens[0]
          )
        })
        setToToken((prev) => {
          return (
            mergedTokens.find(
              (token) => token.address.toLowerCase() === prev.address.toLowerCase()
            ) ?? mergedTokens[1] ?? mergedTokens[0]
          )
        })
      } catch (error) {
        console.error('加载 Supabase 代币列表失败，回退到前端默认列表:', error)
      }
    }

    loadTokens()
  }, [])

  // 获取代币余额
  const { data: fromTokenBalance } = useBalance({
    address: address,
    token: isEthLikeAddress(fromToken.address)
      ? undefined
      : toChainTokenAddress(fromToken.address) as `0x${string}`,
    query: {
      enabled: Boolean(address && isConnected && !isEthLikeAddress(fromToken.address)),
    },
  })

  const { data: toTokenBalance } = useBalance({
    address: address,
    token: isEthLikeAddress(toToken.address)
      ? undefined
      : toChainTokenAddress(toToken.address) as `0x${string}`,
    query: {
      enabled: Boolean(address && isConnected && !isEthLikeAddress(toToken.address)),
    },
  })

  const { data: nativeBalance } = useBalance({
    address,
    query: {
      enabled: Boolean(address && isConnected),
    },
  })

  const displayedFromBalance = isEthLikeAddress(fromToken.address)
    ? nativeBalance
    : fromTokenBalance
  const displayedToBalance = isEthLikeAddress(toToken.address)
    ? nativeBalance
    : toTokenBalance

  // 检查授权（原生 ETH 不需要 allowance）
  const { data: allowance, refetch: refetchAllowance } = useTokenAllowance(
    isEthLikeAddress(fromToken.address) ? '' : fromToken.address
  )

  // 检查是否需要授权
  useEffect(() => {
    if (isEthLikeAddress(fromToken.address)) {
      setNeedsApproval(false)
      return
    }

    if (fromToken.supportsPermit) {
      setNeedsApproval(false)
      return
    }

    if (!fromAmount || parseFloat(fromAmount) <= 0) {
      setNeedsApproval(false)
      return
    }

    // 非 permit 代币在 allowance 未就绪时，保守地要求先授权，避免直接发起失败交易。
    if (allowance == null) {
      setNeedsApproval(true)
      return
    }

    if (fromAmount) {
      try {
        const amountWei = parseUnits(fromAmount, fromToken.decimals)
        setNeedsApproval(allowance < amountWei)
      } catch {
        setNeedsApproval(true)
      }
    } else {
      setNeedsApproval(false)
    }
  }, [allowance, fromAmount, fromToken.address, fromToken.decimals, fromToken.supportsPermit, isEthLikeAddress])

  // 自动获取价格预估
  const updateQuote = useCallback(async () => {
    if (!fromAmount || parseFloat(fromAmount) === 0) {
      setToAmount('')
      setQuoteError(null)
      return
    }

    setIsQuoting(true)
    setQuoteError(null)
    try {
      const quote = await getQuote({
        tokenIn: fromToken.address,
        tokenOut: toToken.address,
        amountIn: fromAmount,
        slippage,
        indexPath: selectedIndexPath,
        tokenInDecimals: fromToken.decimals,
        tokenOutDecimals: toToken.decimals,
      })

      if (quote) {
        setToAmount(quote.amountOut)
        setIsSimulated(quote.simulated || false)
        setQuoteError(null)
      } else {
        setToAmount('')
        setQuoteError(null)
      }
    } catch (error) {
      console.error('Quote failed:', error)
      setToAmount('')
      // 提取错误消息
      const errorMessage = error instanceof Error ? error.message : '获取报价失败'
      setQuoteError(errorMessage)
    } finally {
      setIsQuoting(false)
    }
  }, [fromAmount, fromToken.address, toToken.address, fromToken.decimals, toToken.decimals, getQuote, slippage, selectedIndexPath])

  // 当输入参数变化时获取报价 - 修复无限循环
  useEffect(() => {
    if (!fromAmount || parseFloat(fromAmount) === 0) {
      setToAmount('')
      setQuoteError(null)
      return
    }
    
    const timer = setTimeout(() => {
      updateQuote()
    }, 500) // 防抖 500ms
    return () => clearTimeout(timer)
  }, [fromAmount, fromToken.address, toToken.address, slippage, updateQuote]) // 直接使用基础依赖项
  // 1 ETH <==> 2000USDT slippage = 1%
  // 1 ETH 至少兑换出来 2000 * (1 - 0.01) = 1980USDT

  const handleFromAmountChange = (value: string) => {
    const parsed = parseInputAmount(value)
    setFromAmount(parsed)
  }

  const handleSwapTokens = () => {
    setFromToken(toToken)
    setToToken(fromToken)
    setFromAmount(toAmount)
    setToAmount(fromAmount)
    setQuoteError(null) // 交换代币时清除错误
  }

  const handleApprove = async () => {
    if (!fromAmount) return
    
    try {
      await approveToken(fromToken.address, fromAmount, fromToken.decimals)
    } catch (error) {
      console.error('Approval failed:', error)
    }
  }

  const handleSwap = async () => {
    if (!fromAmount || !toAmount || !isConnected) return
    if (needsApproval) {
      setQuoteError('授权不足，请先点击 Approve')
      return
    }
    if (selectedIndexPath.length === 0) {
      setQuoteError('未找到可用池子')
      return
    }
    
    try {
      await executeSwap({
        tokenIn: fromToken.address,
        tokenOut: toToken.address,
        amountIn: fromAmount,
        slippage,
        indexPath: selectedIndexPath,
        tokenInDecimals: fromToken.decimals,
        tokenOutDecimals: toToken.decimals,
        tokenInName: fromToken.name,
        tokenInSupportsPermit: fromToken.supportsPermit,
      })
    } catch (error) {
      console.error('Swap failed:', error)
    }
  }

  const handleMaxAmount = () => {
    if (displayedFromBalance) {
      setFromAmount(displayedFromBalance.formatted)
    }
  }

  // 刷新授权状态
  useEffect(() => {
    if (isConfirmed) {
      refetchAllowance()
    }
  }, [isConfirmed, refetchAllowance])

  // 当 pool 关系或代币列表变化时，自动修正不合法的交易对组合。
  useEffect(() => {
    if (fromToken.address.toLowerCase() === toToken.address.toLowerCase()) {
      const firstValidTo = toTokenOptions.find(
        (token) => token.address.toLowerCase() !== fromToken.address.toLowerCase()
      )
      if (firstValidTo) {
        setToToken(firstValidTo)
      }
      return
    }

    const isCurrentToValid = toTokenOptions.some(
      (token) => token.address.toLowerCase() === toToken.address.toLowerCase()
    )
    if (!isCurrentToValid) {
      const nextTo = toTokenOptions[0]
      if (nextTo) setToToken(nextTo)
    }
  }, [fromToken.address, toToken.address, toTokenOptions])

  useEffect(() => {
    const isCurrentFromValid = fromTokenOptions.some(
      (token) => token.address.toLowerCase() === fromToken.address.toLowerCase()
    )
    if (!isCurrentFromValid) {
      const nextFrom = fromTokenOptions[0]
      if (nextFrom) setFromToken(nextFrom)
    }
  }, [fromToken.address, fromTokenOptions])

  const TokenSelector = ({ 
    selectedToken, 
    onSelect, 
    label,
    options,
  }: { 
    selectedToken: Token
    onSelect: (token: Token) => void
    label: string 
    options: Token[]
  }) => {
    const [isOpen, setIsOpen] = useState(false)

    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center space-x-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground px-3 py-2 rounded-lg transition-colors"
        >
          <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold">{selectedToken.symbol[0]}</span>
          </div>
          <span className="font-medium">{selectedToken.symbol}</span>
          <ChevronDown className="w-4 h-4" />
        </button>

        {isOpen && (
          <div className="absolute top-full mt-1 w-48 bg-background border border-border rounded-lg shadow-lg z-50">
            <div className="p-2">
              <div className="text-sm text-muted-foreground px-2 py-1">{label}</div>
              {options.length === 0 && (
                <div className="px-2 py-2 text-xs text-muted-foreground">
                  暂无可交易池
                </div>
              )}
              {options.map((token) => (
                <button
                  key={token.address}
                  onClick={() => {
                    onSelect(token)
                    setIsOpen(false)
                  }}
                  className={cn(
                    "w-full flex items-center space-x-3 px-2 py-2 rounded hover:bg-accent transition-colors",
                    selectedToken.address === token.address && "bg-accent"
                  )}
                >
                  <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs font-bold">{token.symbol[0]}</span>
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-foreground">{token.symbol}</div>
                    <div className="text-sm text-muted-foreground">{token.name}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // 交易状态显示
  const TransactionStatus = () => {
    if (!hash) return null

    return (
      <div className="mb-6 p-4 bg-primary/10 border border-primary/20 rounded-lg">
        <div className="flex items-center space-x-2">
          {isPending && (
            <>
              <Clock className="w-5 h-5 text-primary animate-spin" />
              <span className="text-primary">等待钱包确认...</span>
            </>
          )}
          {isConfirming && (
            <>
              <Clock className="w-5 h-5 text-primary animate-spin" />
              <span className="text-primary">交易确认中...</span>
            </>
          )}
          {isConfirmed && (
            <>
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              <span className="text-green-700 dark:text-green-300">交易成功！</span>
            </>
          )}
        </div>
        <div className="mt-2 text-sm text-primary">
          交易哈希: {shortenAddress(hash)}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-card border border-border rounded-2xl shadow-lg p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-card-foreground">交换</h2>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
          >
            <Settings className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Transaction Status */}
        <TransactionStatus />

        {/* Wallet Status */}
        {isConnected && address && (
          <div className="mb-4 p-3 bg-primary/10 rounded-lg">
            <div className="text-sm text-primary">
              已连接: {shortenAddress(address)}
            </div>
          </div>
        )}

        {/* Settings Panel */}
        {showSettings && (
          <div className="mb-6 p-4 bg-muted rounded-lg">
            <div className="text-sm font-medium mb-2 text-muted-foreground">滑点容忍度</div>
            <div className="flex space-x-2">
              {[0.1, 0.5, 1.0].map((value) => (
                <button
                  key={value}
                  onClick={() => setSlippage(value)}
                  className={cn(
                    "px-3 py-1 rounded text-sm transition-colors",
                    slippage === value 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-background border border-border hover:bg-accent"
                  )}
                >
                  {value}%
                </button>
              ))}
            </div>
          </div>
        )}

        {/* From Token */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">从</span>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">
                余额: {displayedFromBalance ? formatTokenAmount(displayedFromBalance.formatted) : '0'}
              </span>
              {displayedFromBalance && parseFloat(displayedFromBalance.formatted) > 0 && (
                <button
                  onClick={handleMaxAmount}
                  className="text-xs text-primary hover:text-primary/80 font-medium"
                >
                  最大
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <input
              type="text"
              value={fromAmount}
              onChange={(e) => handleFromAmountChange(e.target.value)}
              placeholder="0"
              className="text-2xl font-medium bg-transparent outline-none flex-1 text-foreground placeholder:text-muted-foreground"
            />
            <TokenSelector
              selectedToken={fromToken}
              onSelect={setFromToken}
              label="选择代币"
              options={fromTokenOptions}
            />
          </div>
        </div>

        {/* Swap Arrow */}
        <div className="flex justify-center mb-4">
          <button
            onClick={handleSwapTokens}
            className="p-2 bg-muted hover:bg-accent border border-border rounded-lg transition-colors"
          >
            <ArrowUpDown className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* To Token */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">到</span>
            <span className="text-sm text-muted-foreground">
              余额: {displayedToBalance ? formatTokenAmount(displayedToBalance.formatted) : '0'}
            </span>
          </div>
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div className="text-2xl font-medium text-foreground flex-1">
              {isQuoting ? (
                <div className="flex items-center">
                  <Clock className="w-4 h-4 animate-spin mr-2 text-muted-foreground" />
                  <span className="text-muted-foreground">获取报价中...</span>
                </div>
              ) : quoteError ? (
                <div className="text-sm text-red-600 dark:text-red-400">
                  {quoteError}
                </div>
              ) : (
                toAmount || '0'
              )}
            </div>
            <TokenSelector
              selectedToken={toToken}
              onSelect={setToToken}
              label="选择代币"
              options={toTokenOptions}
            />
          </div>
          {quoteError && (
            <div className="mt-2 text-xs text-red-600 dark:text-red-400">
              ⚠️ {quoteError}
            </div>
          )}
          {/* {isSimulated && (
            <div className="mt-2 text-xs text-yellow-600 dark:text-yellow-400">
              ⚠️ 模拟报价，实际价格可能有差异
            </div>
          )} */}
        </div>

        {/* Action Button */}
        <div className="space-y-3">
          {!isConnected ? (
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-muted-foreground">请先连接钱包</p>
            </div>
          ) : needsApproval ? (
            <button
              onClick={handleApprove}
              disabled={isPending || isConfirming || !fromAmount}
              className="w-full bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              {isPending || isConfirming ? '处理中...' : `授权 ${fromToken.symbol}`}
            </button>
          ) : (
            <button
              onClick={handleSwap}
              disabled={
                isPending ||
                isConfirming ||
                !fromAmount ||
                !toAmount ||
                parseFloat(fromAmount) === 0 ||
                selectedIndexPath.length === 0
              }
              className="w-full bg-primary hover:bg-primary/90 disabled:bg-muted disabled:cursor-not-allowed text-primary-foreground font-medium py-3 px-4 rounded-lg transition-colors"
            >
              {isPending || isConfirming ? '交换中...' : '交换'}
            </button>
          )}

          {/* Price Info */}
          {fromAmount && toAmount && parseFloat(fromAmount) > 0 && parseFloat(toAmount) > 0 && (
            <div className="text-xs text-muted-foreground text-center">
              1 {fromToken.symbol} ≈ {(parseFloat(toAmount) / parseFloat(fromAmount)).toFixed(6)} {toToken.symbol}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}