/**
 * SEO Configuration for EquityPro
 * AI-Powered Stock Analysis Platform for Indian Investors
 */

export const SEO_CONFIG = {
  siteName: 'EquityPro',
  siteUrl: 'https://your-domain.com',
  defaultTitle: 'EquityPro - AI-Powered Stock Analysis for Indian Investors',
  defaultDescription: 'Free AI stock analysis platform & TradingView alternative. AI sentiment analysis, technical screener with pine script-like expressions, and strategy bots for 3000+ NSE stocks.',
  defaultOgImage: '/favicon.svg',
  twitterHandle: '@equitypro',
  locale: 'en_IN',
  themeColor: '#FF6B47',

  // Primary keywords for SEO, GEO, and AEO
  keywords: [
    'equitypro',
    'AI stock analysis',
    'NSE stock screener',
    'stock screener India',
    'Indian stock market',
    'AI sentiment analysis',
    'stock backtesting',
    'strategy bots',
    'pine script alternative',
    'trading view alternative',
    'TradingView India',
    'technical indicators',
    'Nifty 50',
    'best Indian stocks',
    'AI trading strategies',
    'free stock research',
    'genetic algorithm trading',
    'FinBERT sentiment',
    'RSI screener',
    'MACD analysis'
  ],
} as const;

// Page-specific SEO configurations
export const PAGE_SEO = {
  landing: {
    title: 'EquityPro - AI-Powered Stock Analysis for Indian Investors',
    description: 'Free AI stock analysis platform & TradingView alternative. AI sentiment analysis, technical screener with pine script-like expressions, and strategy bots for 3000+ NSE stocks.',
    keywords: 'equitypro, AI stock analysis, NSE screener, Indian stocks, AI trading, free stock research, pine script alternative, trading view alternative, strategy bots',
  },
  home: {
    title: 'Market Dashboard - AI Market Mood, Gainers & Losers | EquityPro',
    description: 'Real-time Indian stock market dashboard. AI-powered Fear & Greed index, top gainers/losers, trending stocks, and curated screens. Updated every 15 minutes.',
  },
  stocks: {
    title: 'Browse NSE Stocks - Large, Mid & Small Cap | EquityPro',
    description: 'Browse 3000+ NSE stocks by market cap. Filter Large Cap, Mid Cap, Small Cap stocks. View fundamentals, P/E ratios, and market data on hover.',
  },
  stockDetail: {
    title: (symbol: string) => `${symbol} Stock Analysis - AI Sentiment, Price & Technicals | EquityPro`,
    description: (companyName: string, symbol: string, price?: number) =>
      `AI-powered analysis of ${companyName} (${symbol}). ${price ? `Real-time price ₹${price.toLocaleString('en-IN')}, ` : ''}AI sentiment score, 24 technical indicators, fundamentals & analyst recommendations.`,
  },
  screener: {
    title: 'AI Stock Screener - TradingView Alternative for NSE | EquityPro',
    description: 'Free AI stock screener - best TradingView alternative for India. Pine script-like boolean expressions with 24+ indicators: SMA, EMA, RSI, MACD. Real-time streaming.',
  },
  backtesting: {
    title: 'AI Strategy Bots - Backtest Trading Strategies | EquityPro',
    description: 'Build strategy bots with AI genetic algorithm. Pine script alternative for backtesting NSE stocks. Optimize entry/exit rules, get Calmar ratio & win rate. Free.',
  },
  indices: {
    title: 'Indian Market Indices - Nifty 50, Bank Nifty & 55 More | EquityPro',
    description: 'Track 57 Indian market indices. Nifty 50, Bank Nifty, Nifty IT, sectoral & thematic indices. Real-time prices with daily change percentages.',
  },
  sharedScreener: {
    title: (expression: string, count: number) => `Screener: ${count} Stocks Matching ${expression.slice(0, 50)} | EquityPro`,
    description: (expression: string, count: number) =>
      `AI screener found ${count} NSE stocks matching: ${expression.slice(0, 100)}. View results and try your own screens on EquityPro.`,
  },
  sharedBacktest: {
    title: (ticker: string, returns: number) => `${ticker} Backtest: ${returns > 0 ? '+' : ''}${returns.toFixed(1)}% Returns | EquityPro`,
    description: (ticker: string, returns: number, winRate: number) =>
      `AI backtest of ${ticker} strategy: ${returns > 0 ? '+' : ''}${returns.toFixed(1)}% total returns, ${winRate.toFixed(0)}% win rate. Optimize your own strategies on EquityPro.`,
  },
  portfolio: {
    title: 'My Portfolio - Track Your Investments | EquityPro',
    description: 'Track your stock portfolio performance. View holdings, P&L, and get AI-powered insights on your investments.',
  },
  watchlist: {
    title: 'Stock Watchlist - Monitor NSE Stocks | EquityPro',
    description: 'Create and manage your stock watchlist. Get real-time price alerts and AI sentiment updates for your favorite NSE stocks.',
  },
  news: {
    title: 'Market News - AI-Curated Financial News | EquityPro',
    description: 'Stay updated with AI-curated financial news. Get sentiment-analyzed news articles for Indian stock market.',
  },
  learn: {
    title: 'Learn Investing - Educational Resources | EquityPro',
    description: 'Learn stock market investing with our educational resources. Understand technical indicators, trading strategies, and market analysis.',
  },
  savedResults: {
    title: 'Saved Screener & Backtest Results | EquityPro',
    description: 'Access your saved screener filters and backtest results. Review past analyses and share insights with others.',
  },
  blog: {
    title: 'Blog - Trading Strategies & Market Analysis | EquityPro',
    description: 'Insights, guides, and strategies for smarter trading. Learn quantitative approaches to alpha generation, technical analysis, and AI-powered stock research.',
  },
  marketReports: {
    title: 'Market Reports - Sector Analysis & Insights | EquityPro',
    description: 'Weekly sector analysis, performance breakdowns, and key market insights for Indian markets. AI-powered research covering NSE stocks and indices.',
  },
  privacy: {
    title: 'Privacy Policy - EquityPro AI Stock Analysis Platform',
    description: "EquityPro's privacy policy. How we collect, use, and protect your data on our AI-powered stock analysis platform.",
  },
  login: {
    title: 'Sign In - EquityPro AI Stock Analysis',
    description: 'Sign in to access your EquityPro account. Get personalized AI stock analysis and save your screener results.',
  },
  signup: {
    title: 'Create Free Account - EquityPro AI Platform',
    description: 'Create your free EquityPro account. Access AI-powered stock analysis, technical screener, and strategy backtesting.',
  },
  forgotPassword: {
    title: 'Reset Password - EquityPro',
    description: 'Reset your EquityPro account password. Secure password recovery for your stock analysis account.',
  },
  profile: {
    title: 'My Profile - EquityPro Account',
    description: 'Manage your EquityPro account settings, subscription, and preferences.',
  },
  notFound: {
    title: 'Page Not Found - EquityPro',
    description: 'The page you are looking for does not exist. Return to EquityPro homepage for AI-powered stock analysis.',
  },
  admin: {
    title: 'Admin Dashboard - EquityPro',
    description: 'EquityPro administration panel.',
  },
} as const;

// Helper to generate full URL
export function getCanonicalUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${SEO_CONFIG.siteUrl}${cleanPath}`;
}

// Helper to generate OG image URL
export function getOgImageUrl(image?: string): string {
  const imagePath = image || SEO_CONFIG.defaultOgImage;
  if (imagePath.startsWith('http')) return imagePath;
  return `${SEO_CONFIG.siteUrl}${imagePath.startsWith('/') ? imagePath : `/${imagePath}`}`;
}

// Helper to truncate description to SEO-friendly length
export function truncateDescription(description: string, maxLength: number = 155): string {
  if (description.length <= maxLength) return description;
  return description.slice(0, maxLength - 3).trim() + '...';
}
