/**
 * JSON-LD Schema Generators for Tiphub
 * Structured data for SEO, GEO, and AEO optimization
 */

import { SEO_CONFIG } from './seo-config';

// Type definitions for JSON-LD schemas
export interface BreadcrumbItem {
  name: string;
  url?: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface HowToStep {
  name: string;
  text: string;
}

/**
 * Organization Schema - Global (appears on all pages)
 * Establishes brand authority and identity
 */
export function generateOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Tiphub',
    url: SEO_CONFIG.siteUrl,
    logo: `${SEO_CONFIG.siteUrl}/favicon.svg`,
    description: 'AI-powered stock analysis platform & TradingView alternative for Indian investors. Free AI sentiment analysis, expert screener with pine script-like expressions, and strategy bots.',
    foundingDate: '2024',
    knowsAbout: [
      'Tiphub Stock Analysis',
      'Stock Screener',
      'Strategy Bots',
      'Pine Script Alternative',
      'TradingView Alternative',
      'AI Trading',
      'Technical Analysis',
      'NSE',
      'Indian Stock Market',
      'Sentiment Analysis',
      'Algorithmic Trading'
    ],
    sameAs: [
      // Add social media URLs when available
    ],
  };
}

/**
 * WebSite Schema - Global (appears on all pages)
 * Enables sitelinks search box in Google
 */
export function generateWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Tiphub - AI Stock Analysis',
    url: SEO_CONFIG.siteUrl,
    description: 'Free AI-powered stock analysis for Indian investors',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SEO_CONFIG.siteUrl}/stocks/{search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * BreadcrumbList Schema - For hierarchical pages
 * Improves SERP display with breadcrumb trail
 */
export function generateBreadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      ...(item.url && { item: item.url.startsWith('http') ? item.url : `${SEO_CONFIG.siteUrl}${item.url}` }),
    })),
  };
}

/**
 * Stock Detail Breadcrumb Helper
 */
export function generateStockBreadcrumbSchema(symbol: string, companyName?: string) {
  return generateBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Stocks', url: '/stocks' },
    { name: companyName || symbol },
  ]);
}

/**
 * FAQPage Schema - For pages with FAQ sections
 * Enables FAQ rich results in Google
 */
export function generateFAQSchema(faqs: FAQItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

/**
 * SoftwareApplication Schema - For tool pages
 * Describes Tiphub as a software application
 */
export function generateSoftwareApplicationSchema(
  name: string,
  description: string,
  features?: string[]
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web Browser',
    description,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'INR',
    },
    ...(features && { featureList: features }),
  };
}

/**
 * HowTo Schema - For instructional content
 * Enables how-to rich results
 */
export function generateHowToSchema(
  name: string,
  description: string,
  steps: HowToStep[]
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name,
    description,
    step: steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text,
    })),
  };
}

/**
 * FinancialProduct Schema - For stock detail pages
 */
export function generateFinancialProductSchema(
  symbol: string,
  companyName: string,
  description?: string
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FinancialProduct',
    name: `${symbol} - ${companyName}`,
    description: description || `Stock analysis and AI sentiment for ${companyName}`,
    provider: {
      '@type': 'Organization',
      name: 'National Stock Exchange of India',
    },
    url: `${SEO_CONFIG.siteUrl}/stocks/${symbol}`,
  };
}

/**
 * ItemList Schema - For list pages (stocks, indices)
 */
export function generateItemListSchema(
  name: string,
  items: Array<{ name: string; url: string; position?: number }>
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: item.position || index + 1,
      name: item.name,
      url: item.url.startsWith('http') ? item.url : `${SEO_CONFIG.siteUrl}${item.url}`,
    })),
  };
}

/**
 * WebPage Schema - Generic page schema
 */
export function generateWebPageSchema(
  name: string,
  description: string,
  url: string
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    description,
    url: url.startsWith('http') ? url : `${SEO_CONFIG.siteUrl}${url}`,
    isPartOf: {
      '@type': 'WebSite',
      name: 'Tiphub',
      url: SEO_CONFIG.siteUrl,
    },
  };
}

// Pre-defined FAQ content for reuse across pages
export const LANDING_FAQS: FAQItem[] = [
  {
    question: 'What is Tiphub?',
    answer: 'Tiphub is a free AI-powered stock analysis platform and TradingView alternative for Indian investors. It provides AI sentiment analysis using FinBERT, an expert screener with pine script-like boolean expressions, and strategy bots with genetic algorithm optimization for 3000+ NSE stocks.',
  },
  {
    question: 'Is Tiphub a good TradingView alternative for India?',
    answer: 'Yes, Tiphub is designed as a free TradingView alternative specifically for Indian NSE stocks. While TradingView uses Pine Script, Tiphub offers pine script-like boolean expressions for screening and AI-powered strategy bots for backtesting - all completely free for Indian investors.',
  },
  {
    question: 'How does AI sentiment analysis work?',
    answer: 'Tiphub uses FinBERT, a financial domain-specific AI model, to analyze news articles and determine market sentiment (Bullish, Bearish, or Neutral) for any stock. The AI processes recent news and provides an overall sentiment score.',
  },
  {
    question: 'Is Tiphub free to use?',
    answer: 'Yes, Tiphub offers a free tier with access to stock analysis, AI sentiment, and basic screener functionality. Premium features include unlimited screener runs and advanced strategy bot backtesting options.',
  },
  {
    question: 'What stocks does Tiphub cover?',
    answer: 'Tiphub covers over 3000 stocks listed on the National Stock Exchange (NSE) of India, including all Nifty 50, Nifty 500, and sectoral index constituents.',
  },
  {
    question: 'What are strategy bots in Tiphub?',
    answer: 'Strategy bots in Tiphub are AI-powered backtesting tools that use genetic algorithms to optimize trading strategies. Unlike Pine Script in TradingView, Tiphub automatically evolves and tests thousands of rule combinations to find optimal entry/exit conditions with metrics like Calmar ratio and max drawdown.',
  },
];

export const SCREENER_FAQS: FAQItem[] = [
  {
    question: 'How do I screen stocks by technical indicators?',
    answer: "Enter a pine script-like boolean expression such as 'rsi_14 < 30 and sma_50 > sma_200' to find stocks matching your criteria. Tiphub screener supports 24+ indicators including SMA, EMA, RSI, MACD, Bollinger Bands, and more.",
  },
  {
    question: 'Is Tiphub screener similar to TradingView Pine Script?',
    answer: "Yes, Tiphub offers pine script-like boolean expressions for stock screening. While TradingView's Pine Script is more complex, Tiphub provides a simpler syntax like 'rsi_14 < 30 and volume > volume_sma_20' that's easier to learn while being equally powerful for NSE stocks.",
  },
  {
    question: 'What indicators are available in the Tiphub screener?',
    answer: 'The Tiphub screener supports SMA (any period), EMA (any period), RSI, MACD (line, signal, histogram), ATR, Supertrend, Bollinger Bands (upper, middle, lower), Volume SMA, 52-week high, and OHLC values - similar to TradingView indicators.',
  },
  {
    question: 'How to find oversold stocks using RSI?',
    answer: "Use the expression 'rsi_14 < 30' to find stocks with RSI below 30, which is traditionally considered oversold. You can combine this with other conditions like 'rsi_14 < 30 and volume > volume_sma_20'.",
  },
  {
    question: 'What is the best screener for momentum stocks?',
    answer: "Try 'sma_50 > sma_200 and rsi_14 > 50 and macd_line > macd_signal' to find stocks in an uptrend with positive momentum. This combines trend, momentum, and MACD confirmation - a strategy commonly used in TradingView and Pine Script.",
  },
];

export const BACKTESTING_FAQS: FAQItem[] = [
  {
    question: 'What are strategy bots in Tiphub?',
    answer: 'Strategy bots are AI-powered trading automation tools that use genetic algorithms to optimize strategies. Unlike Pine Script in TradingView which requires manual coding, Tiphub strategy bots automatically evolve and test thousands of rule combinations to find optimal entry/exit conditions.',
  },
  {
    question: 'Is Tiphub backtesting better than TradingView Pine Script?',
    answer: 'Tiphub offers a different approach - while TradingView requires writing Pine Script code, Tiphub strategy bots use AI genetic algorithms to automatically discover optimal strategies. This makes it easier for beginners while still being powerful for advanced traders on NSE stocks.',
  },
  {
    question: 'What is a genetic algorithm in trading?',
    answer: 'A genetic algorithm is an AI optimization technique inspired by natural selection. Tiphub uses it in strategy bots to evolve trading rules over multiple generations, finding optimal entry/exit conditions that maximize returns while minimizing risk.',
  },
  {
    question: 'How to interpret Calmar ratio?',
    answer: 'Calmar ratio measures risk-adjusted returns by dividing annualized return by maximum drawdown. A ratio above 1 is good, above 2 is excellent. Higher values indicate better risk-adjusted performance for your strategy bot.',
  },
  {
    question: 'What does max drawdown mean?',
    answer: "Maximum drawdown is the largest peak-to-trough decline in your portfolio value. For example, a 20% max drawdown means at some point, your portfolio dropped 20% from its highest point before recovering.",
  },
  {
    question: 'What is TPSL mode in strategy bots?',
    answer: 'TPSL (Take Profit/Stop Loss) mode in Tiphub strategy bots optimizes both the trading strategy and the optimal take-profit and stop-loss percentages. This helps find the best risk management parameters for each strategy.',
  },
];

export const INDICES_FAQS: FAQItem[] = [
  {
    question: 'What is Nifty 50?',
    answer: 'Nifty 50 is the flagship index of the National Stock Exchange (NSE), comprising 50 of the largest and most liquid Indian companies across 13 sectors. It represents about 65% of the free-float market capitalization of stocks listed on NSE. Track Nifty 50 live on Tiphub.',
  },
  {
    question: 'How are index values calculated?',
    answer: 'Indian market indices like Nifty 50 use free-float market capitalization weighted methodology. This means companies with higher market cap have more influence on the index value, adjusted for the freely tradable shares.',
  },
  {
    question: 'Can I track Indian indices on Tiphub like TradingView?',
    answer: 'Yes, Tiphub provides real-time tracking for 57 Indian market indices including Nifty 50, Bank Nifty, Nifty IT, and sectoral indices. While TradingView covers global indices, Tiphub specializes in NSE indices with AI-powered market mood analysis.',
  },
];

// Pre-defined HowTo content
export const SCREENER_HOWTO: HowToStep[] = [
  {
    name: 'Enter your pine script-like screening expression',
    text: "Type a boolean expression using technical indicators in Tiphub's pine script-like syntax. For example: 'rsi_14 < 30 and sma_50 > sma_200' to find oversold stocks in an uptrend.",
  },
  {
    name: 'Run the Tiphub screener',
    text: "Click 'Run Screener' to start the AI-powered scan. The Tiphub screener processes all 3000+ NSE stocks in real-time - faster than TradingView's manual screening.",
  },
  {
    name: 'View streaming results',
    text: 'Watch as matching stocks appear in real-time with all indicator values. Sort and filter results to find the best opportunities on NSE.',
  },
];

export const BACKTESTING_HOWTO: HowToStep[] = [
  {
    name: 'Select a stock for strategy bot',
    text: 'Choose a stock from the dropdown or search by symbol/company name. The Tiphub strategy bot will use 5+ years of historical NSE data.',
  },
  {
    name: 'Choose strategy bot mode',
    text: 'Select Standard mode for basic optimization or Advanced (TPSL) mode to also optimize take-profit and stop-loss levels - no Pine Script coding required.',
  },
  {
    name: 'Run the strategy bot',
    text: 'Click Start to begin the genetic algorithm optimization. Watch real-time progress as the AI strategy bot evolves trading rules over 20 generations.',
  },
  {
    name: 'Analyze strategy bot results',
    text: 'Review the optimized strategy, equity curve, and performance metrics including total returns, win rate, Calmar ratio, and max drawdown - similar to TradingView strategy tester output.',
  },
];
