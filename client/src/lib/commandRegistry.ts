import {
  FileText, TrendingUp, HelpCircle, CreditCard, FileCode,
  MessageSquare, Monitor, UserCog, Settings, Activity,
  Search, Bell, Edit, Brain, Calculator, BarChart3,
  Link2, Globe, GitGraph, Hash, Files, BookOpen,
  FileSearch, Building, TrendingDown, Bug,
  DollarSign, Clock, Filter, AlertCircle, ArrowUpDown, Shield
} from 'lucide-react';

export type CommandCategory = 
  | 'Market Data'
  | 'Analysis'
  | 'News'
  | 'Tools'
  | 'Account'
  | 'System'
  | 'Research';

export type WindowType =
  | 'chart'
  | 'watchlist'
  | 'monitor'
  | 'search'
  | 'help'
  | 'billing'
  | 'changelog'
  | 'chat'
  | 'account-management'
  | 'security'
  | 'settings'
  | 'time-sales'
  | 'equity-screener'
  | 'ipo-calendar'
  | 'alerts'
  | 'notes'
  | 'pattern-search'
  | 'systematic-patterns'
  | 'most-active'
  | 'calculator'
  | 'compare-securities'
  | 'brokerage'
  | 'top-news'
  | 'relationship-graph'
  | 'black-scholes'
  | 'research-reports'
  | 'trending'
  | 'bug-report'
  | 'corporate-actions'
  | 'shareholding-pattern'
  | 'option-chain'
  | 'portfolio-optimizer'
  | 'options-visualiser'
  | 'order-book-heatmap';

export interface Command {
  id: string;
  title: string;
  description: string;
  shortcut?: string;
  aliases?: string[];
  keywords: string[];
  category: CommandCategory;
  icon: any;
  iconColor?: string;
  action: () => void;
  windowType?: WindowType;
}

// Command action handlers will be injected from terminal.tsx
let commandHandlers: {
  openWindow?: (type: WindowType, title?: string) => void;
} = {};

export function setCommandHandlers(handlers: typeof commandHandlers) {
  commandHandlers = handlers;
}

// Recently used commands tracking
const RECENT_COMMANDS_KEY = 'terminal.recentCommands';
const MAX_RECENT_COMMANDS = 5;

export function getRecentCommands(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_COMMANDS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function addToRecentCommands(commandId: string) {
  const recent = getRecentCommands();
  const filtered = recent.filter(id => id !== commandId);
  const updated = [commandId, ...filtered].slice(0, MAX_RECENT_COMMANDS);
  localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(updated));
}

// Command Registry
export const commands: Command[] = [
  // Market Data Commands
  {
    id: 'quote-monitor',
    title: 'Quick Monitor',
    description: 'Real-time indices and market movers',
    shortcut: 'QM',
    aliases: ['QM', 'QUOTE', 'MONITOR'],
    keywords: ['quote', 'monitor', 'stock', 'price', 'real-time', 'market'],
    category: 'Market Data',
    icon: Monitor,
    iconColor: 'text-primary',
    windowType: 'monitor',
    action: () => {
      commandHandlers.openWindow?.('monitor', 'QUICK MONITOR');
    }
  },
  {
    id: 'option-chain',
    title: 'Option Chain',
    description: 'Live option chain with refresh every 10 seconds',
    shortcut: 'OC',
    aliases: ['OPTION', 'CHAIN', 'OC'],
    keywords: ['options', 'chain', 'derivatives', 'vol', 'oi'],
    category: 'Market Data',
    icon: GitGraph,
    iconColor: 'text-accent',
    windowType: 'option-chain',
    action: () => {
      commandHandlers.openWindow?.('option-chain', 'OPTION CHAIN');
    }
  },
  {
    id: 'options-visualiser',
    title: 'Options Visualiser',
    description: 'GEX, GxOI charts and 3D IV surface visualization',
    shortcut: 'OPV',
    aliases: ['OPV', 'GEX', 'GXOI', 'IVSURF', 'GAMMA'],
    keywords: ['options', 'visualizer', 'gamma', 'exposure', 'gex', 'gxoi', 'surface', '3d', 'iv', 'volatility'],
    category: 'Analysis',
    icon: BarChart3,
    iconColor: 'text-accent',
    windowType: 'options-visualiser',
    action: () => {
      commandHandlers.openWindow?.('options-visualiser', 'OPTIONS VISUALISER');
    }
  },
  {
    id: 'order-book-heatmap',
    title: 'Order Book Heatmap',
    description: 'Real-time 50-level order book depth visualization',
    shortcut: 'OBH',
    aliases: ['OBH', 'DEPTH', 'ORDERBOOK', 'HEATMAP', 'LEVEL2'],
    keywords: ['order', 'book', 'depth', 'heatmap', 'bid', 'ask', 'level2', 'market', 'depth'],
    category: 'Market Data',
    icon: BarChart3,
    iconColor: 'text-primary',
    windowType: 'order-book-heatmap',
    action: () => {
      commandHandlers.openWindow?.('order-book-heatmap', 'ORDER BOOK HEATMAP');
    }
  },
  {
    id: 'chart',
    title: 'Stock Chart',
    description: 'Interactive price charts with technical indicators',
    shortcut: 'CHART',
    aliases: ['CHART', 'GRAPH'],
    keywords: ['chart', 'graph', 'technical', 'analysis', 'candlestick'],
    category: 'Market Data',
    icon: BarChart3,
    iconColor: 'text-secondary',
    windowType: 'chart',
    action: () => {
      commandHandlers.openWindow?.('chart', 'CHART');
    }
  },
  {
    id: 'watchlist',
    title: 'Watchlist',
    description: 'Monitor your favorite symbols',
    shortcut: 'WL',
    aliases: ['WL', 'WATCH'],
    keywords: ['watchlist', 'favorites', 'portfolio', 'symbols'],
    category: 'Market Data',
    icon: Activity,
    iconColor: 'text-primary',
    windowType: 'watchlist',
    action: () => {
      commandHandlers.openWindow?.('watchlist', 'WATCHLIST');
    }
  },
  {
    id: 'time-sales',
    title: 'Time & Sales',
    description: 'Real-time transaction data and order flow',
    shortcut: 'TAS',
    aliases: ['TAS', 'TAPE'],
    keywords: ['time', 'sales', 'transactions', 'tape', 'orders', 'flow'],
    category: 'Market Data',
    icon: Clock,
    iconColor: 'text-secondary',
    windowType: 'time-sales',
    action: () => {
      commandHandlers.openWindow?.('time-sales', 'TIME & SALES');
    }
  },
  {
    id: 'most-active',
    title: 'Most Active Securities',
    description: 'Top volume and most traded securities',
    shortcut: 'MOST',
    aliases: ['MOST', 'ACTIVE', 'VOLUME'],
    keywords: ['most', 'active', 'volume', 'traded', 'top'],
    category: 'Market Data',
    icon: TrendingUp,
    iconColor: 'text-primary',
    windowType: 'most-active',
    action: () => {
      commandHandlers.openWindow?.('most-active', 'MOST ACTIVE');
    }
  },
  // Analysis Commands
  {
    id: 'corporate-actions',
    title: 'Corporate Actions',
    description: 'View dividends, splits, bonuses, and rights issues',
    shortcut: 'CA',
    aliases: ['CA', 'CORP', 'DIVIDEND'],
    keywords: ['corporate', 'actions', 'dividend', 'split', 'bonus', 'rights'],
    category: 'Analysis',
    icon: Bell,
    iconColor: 'text-primary',
    windowType: 'corporate-actions',
    action: () => {
      commandHandlers.openWindow?.('corporate-actions', 'CORPORATE ACTIONS');
    }
  },
  {
    id: 'shareholding-pattern',
    title: 'Shareholding Pattern',
    description: 'Promoter, FII, DII, and public shareholding breakdown',
    shortcut: 'SHP',
    aliases: ['SHP', 'HOLDING', 'PROMOTER'],
    keywords: ['shareholding', 'pattern', 'promoter', 'fii', 'dii', 'public', 'holding'],
    category: 'Analysis',
    icon: Building,
    iconColor: 'text-secondary',
    windowType: 'shareholding-pattern',
    action: () => {
      commandHandlers.openWindow?.('shareholding-pattern', 'SHAREHOLDING PATTERN');
    }
  },
  {
    id: 'equity-screener',
    title: 'Equity Screener',
    description: 'Screen stocks based on fundamental and technical criteria',
    shortcut: 'EQS',
    aliases: ['EQS', 'SCREEN', 'FILTER'],
    keywords: ['equity', 'screener', 'filter', 'scan', 'criteria'],
    category: 'Analysis',
    icon: Filter,
    iconColor: 'text-accent',
    windowType: 'equity-screener',
    action: () => {
      commandHandlers.openWindow?.('equity-screener', 'EQUITY SCREENER');
    }
  },
  {
    id: 'alpha-generation',
    title: 'Alpha Generation',
    description: 'Open EquityPro Alpha Generation Lab in a new tab',
    shortcut: 'ALPHA',
    aliases: ['ALPHA', 'GEN', 'ALPHAGEN'],
    keywords: ['alpha', 'generation', 'strategy', 'diffusion', 'ga'],
    category: 'Analysis',
    icon: Brain,
    iconColor: 'text-primary',
    action: () => {
      window.open('https://your-domain.com/alpha-generation', '_blank');
    }
  },
  {
    id: 'pattern-search',
    title: 'Pattern Search',
    description: 'AI-powered pattern recognition with forward-returns forecast',
    shortcut: 'PAT',
    aliases: ['PAT', 'PATTERN'],
    keywords: ['pattern', 'search', 'ai', 'forecast', 'returns', 'prediction'],
    category: 'Analysis',
    icon: Brain,
    iconColor: 'text-primary',
    windowType: 'pattern-search',
    action: () => {
      commandHandlers.openWindow?.('pattern-search', 'PATTERN SEARCH');
    }
  },
  {
    id: 'systematic-patterns',
    title: 'Systematic Pattern Search',
    description: 'Advanced systematic pattern recognition',
    shortcut: 'RST',
    aliases: ['RST', 'SYSTEMATIC'],
    keywords: ['systematic', 'pattern', 'quantitative', 'algo'],
    category: 'Analysis',
    icon: Hash,
    iconColor: 'text-secondary',
    windowType: 'systematic-patterns',
    action: () => {
      commandHandlers.openWindow?.('systematic-patterns', 'SYSTEMATIC PATTERNS');
    }
  },
  {
    id: 'compare-securities',
    title: 'Historical Comparison',
    description: 'Compare multiple securities historically',
    shortcut: 'HMS',
    aliases: ['HMS', 'COMPARE'],
    keywords: ['compare', 'historical', 'multiple', 'securities', 'versus'],
    category: 'Analysis',
    icon: ArrowUpDown,
    iconColor: 'text-accent',
    windowType: 'compare-securities',
    action: () => {
      commandHandlers.openWindow?.('compare-securities', 'COMPARE SECURITIES');
    }
  },
  {
    id: 'relationship-graph',
    title: 'Graph Relationships',
    description: 'Visualize relationships between securities',
    shortcut: 'GR',
    aliases: ['GR', 'GRAPH', 'RELATION'],
    keywords: ['graph', 'relationship', 'correlation', 'network'],
    category: 'Analysis',
    icon: GitGraph,
    iconColor: 'text-primary',
    windowType: 'relationship-graph',
    action: () => {
      commandHandlers.openWindow?.('relationship-graph', 'RELATIONSHIPS');
    }
  },
  {
    id: 'portfolio-optimizer',
    title: 'Portfolio Optimizer',
    description: 'Black-Litterman optimization with efficient frontier',
    shortcut: 'PO',
    aliases: ['PO', 'OPT', 'PORTFOLIO', 'OPTIMIZE'],
    keywords: ['portfolio', 'optimizer', 'black', 'litterman', 'sharpe', 'efficient', 'frontier', 'allocation'],
    category: 'Analysis',
    icon: TrendingUp,
    iconColor: 'text-accent',
    windowType: 'portfolio-optimizer',
    action: () => {
      commandHandlers.openWindow?.('portfolio-optimizer', 'PORTFOLIO OPTIMIZER');
    }
  },

  // News Commands
  {
    id: 'top-news',
    title: 'Top News',
    description: 'Top news from Reuters today',
    shortcut: 'TOP',
    aliases: ['TOP', 'REUTERS'],
    keywords: ['top', 'news', 'reuters', 'headlines', 'today'],
    category: 'News',
    icon: TrendingUp,
    iconColor: 'text-secondary',
    windowType: 'top-news',
    action: () => {
      commandHandlers.openWindow?.('top-news', 'TOP NEWS');
    }
  },
  {
    id: 'trending',
    title: 'Trending Searches',
    description: 'See what\'s trending in the market',
    shortcut: 'TREND',
    aliases: ['TREND', 'TRENDING'],
    keywords: ['trending', 'popular', 'searches', 'hot'],
    category: 'News',
    icon: TrendingDown,
    iconColor: 'text-primary',
    windowType: 'trending',
    action: () => {
      commandHandlers.openWindow?.('trending', 'TRENDING');
    }
  },

  // Tools Commands
  {
    id: 'calculator',
    title: 'Financial Calculator',
    description: 'Advanced financial calculations',
    shortcut: 'CALC',
    aliases: ['CALC', 'CALCULATOR'],
    keywords: ['calculator', 'financial', 'math', 'compute'],
    category: 'Tools',
    icon: Calculator,
    iconColor: 'text-secondary',
    windowType: 'calculator',
    action: () => {
      commandHandlers.openWindow?.('calculator', 'CALCULATOR');
    }
  },
  {
    id: 'black-scholes',
    title: 'Black-Scholes Calculator',
    description: 'Options pricing with Black-Scholes model',
    shortcut: 'OVME',
    aliases: ['OVME', 'OPTIONS', 'BS'],
    keywords: ['black', 'scholes', 'options', 'pricing', 'model'],
    category: 'Tools',
    icon: DollarSign,
    iconColor: 'text-primary',
    windowType: 'black-scholes',
    action: () => {
      commandHandlers.openWindow?.('black-scholes', 'BLACK-SCHOLES');
    }
  },
  {
    id: 'alerts',
    title: 'Desktop Alerts',
    description: 'Set price and news alerts for securities',
    shortcut: 'AL',
    aliases: ['AL', 'ALERT', 'NOTIFY'],
    keywords: ['alerts', 'notifications', 'desktop', 'price', 'trigger'],
    category: 'Tools',
    icon: Bell,
    iconColor: 'text-secondary',
    windowType: 'alerts',
    action: () => {
      commandHandlers.openWindow?.('alerts', 'ALERTS');
    }
  },
  {
    id: 'notes',
    title: 'Notes Editor',
    description: 'Rich text notes and documentation',
    shortcut: 'NOTE',
    aliases: ['NOTE', 'NOTES', 'MEMO'],
    keywords: ['notes', 'editor', 'text', 'documentation', 'memo'],
    category: 'Tools',
    icon: Edit,
    iconColor: 'text-accent',
    windowType: 'notes',
    action: () => {
      commandHandlers.openWindow?.('notes', 'NOTES');
    }
  },
  {
    id: 'search',
    title: 'Symbol Search',
    description: 'Search for stocks, funds, and other securities',
    shortcut: 'SEARCH',
    aliases: ['SEARCH', 'FIND', 'LOOKUP'],
    keywords: ['search', 'symbol', 'find', 'lookup', 'ticker'],
    category: 'Tools',
    icon: Search,
    iconColor: 'text-primary',
    windowType: 'search',
    action: () => {
      commandHandlers.openWindow?.('search', 'SYMBOL SEARCH');
    }
  },

  // Research Commands
  {
    id: 'ipo-calendar',
    title: 'IPO Calendar',
    description: 'Upcoming and recent IPO listings',
    shortcut: 'IPO',
    aliases: ['IPO', 'CALENDAR'],
    keywords: ['ipo', 'calendar', 'upcoming', 'listing', 'new'],
    category: 'Research',
    icon: AlertCircle,
    iconColor: 'text-primary',
    windowType: 'ipo-calendar',
    action: () => {
      commandHandlers.openWindow?.('ipo-calendar', 'IPO CALENDAR');
    }
  },
  {
    id: 'research-reports',
    title: 'Research Reports',
    description: 'Professional research and analysis reports',
    shortcut: 'RES',
    aliases: ['RES', 'RESEARCH', 'REPORT'],
    keywords: ['research', 'reports', 'analysis', 'professional'],
    category: 'Research',
    icon: FileSearch,
    iconColor: 'text-secondary',
    windowType: 'research-reports',
    action: () => {
      commandHandlers.openWindow?.('research-reports', 'RESEARCH REPORTS');
    }
  },

  // Account Commands
  {
    id: 'account-management',
    title: 'Account Management',
    description: 'Manage your account and profile',
    shortcut: 'ACM',
    aliases: ['ACM', 'ACCOUNT'],
    keywords: ['account', 'management', 'profile', 'user'],
    category: 'Account',
    icon: UserCog,
    iconColor: 'text-accent',
    windowType: 'account-management',
    action: () => {
      commandHandlers.openWindow?.('account-management', 'ACCOUNT MANAGEMENT');
    }
  },
  {
    id: 'security',
    title: 'Security Settings',
    description: 'Manage 2FA and email verification',
    shortcut: 'SEC',
    aliases: ['SEC', 'SECURITY', '2FA'],
    keywords: ['security', '2fa', 'two-factor', 'authentication', 'verify', 'email'],
    category: 'Account',
    icon: Shield,
    iconColor: 'text-green-500',
    windowType: 'security',
    action: () => {
      commandHandlers.openWindow?.('security', 'SECURITY');
    }
  },
  {
    id: 'settings',
    title: 'Settings',
    description: 'Configure user preferences and settings',
    shortcut: 'PDF',
    aliases: ['PDF', 'SETTINGS', 'PREFS'],
    keywords: ['settings', 'preferences', 'configuration', 'options'],
    category: 'Account',
    icon: Settings,
    iconColor: 'text-primary',
    windowType: 'settings',
    action: () => {
      commandHandlers.openWindow?.('settings', 'SETTINGS');
    }
  },
  {
    id: 'billing',
    title: 'Organization Billing',
    description: 'View and manage billing information',
    shortcut: 'ORG',
    aliases: ['ORG', 'BILLING', 'PAYMENT'],
    keywords: ['billing', 'organization', 'payment', 'subscription'],
    category: 'Account',
    icon: CreditCard,
    iconColor: 'text-secondary',
    windowType: 'billing',
    action: () => {
      commandHandlers.openWindow?.('billing', 'BILLING');
    }
  },
  {
    id: 'brokerage',
    title: 'Connect Brokerage',
    description: 'Link your brokerage account',
    shortcut: 'BROK',
    aliases: ['BROK', 'BROKER', 'CONNECT'],
    keywords: ['brokerage', 'connect', 'link', 'trading', 'account'],
    category: 'Account',
    icon: Link2,
    iconColor: 'text-accent',
    windowType: 'brokerage',
    action: () => {
      commandHandlers.openWindow?.('brokerage', 'BROKERAGE');
    }
  },

  // System Commands
  {
    id: 'help',
    title: 'Terminal Help',
    description: 'Documentation and user guide',
    shortcut: 'HELP',
    aliases: ['HELP', 'GUIDE', 'DOCS'],
    keywords: ['help', 'documentation', 'guide', 'tutorial', 'how-to'],
    category: 'System',
    icon: HelpCircle,
    iconColor: 'text-primary',
    windowType: 'help',
    action: () => {
      commandHandlers.openWindow?.('help', 'HELP');
    }
  },
  {
    id: 'changelog',
    title: 'Terminal Changelog',
    description: 'View latest updates and features',
    shortcut: 'CHANGE',
    aliases: ['CHANGE', 'CHANGELOG', 'UPDATES'],
    keywords: ['changelog', 'updates', 'features', 'new', 'release'],
    category: 'System',
    icon: FileCode,
    iconColor: 'text-secondary',
    windowType: 'changelog',
    action: () => {
      commandHandlers.openWindow?.('changelog', 'CHANGELOG');
    }
  },
  {
    id: 'chat',
    title: 'Live Chat',
    description: 'Chat with support or other traders',
    shortcut: 'CHAT',
    aliases: ['CHAT', 'MESSAGE', 'SUPPORT'],
    keywords: ['chat', 'live', 'support', 'message', 'help'],
    category: 'System',
    icon: MessageSquare,
    iconColor: 'text-accent',
    windowType: 'chat',
    action: () => {
      commandHandlers.openWindow?.('chat', 'LIVE CHAT');
    }
  },
  {
    id: 'bug-report',
    title: 'Report Bug',
    description: 'Report bugs and technical issues',
    shortcut: 'ERR',
    aliases: ['ERR', 'BUG', 'ISSUE'],
    keywords: ['bug', 'report', 'error', 'issue', 'support', 'problem'],
    category: 'System',
    icon: Bug,
    iconColor: 'text-destructive',
    windowType: 'bug-report',
    action: () => {
      commandHandlers.openWindow?.('bug-report', 'REPORT BUG');
    }
  },
];

// Get commands by category
export function getCommandsByCategory(category: CommandCategory): Command[] {
  return commands.filter(cmd => cmd.category === category);
}

// Get command by ID
export function getCommandById(id: string): Command | undefined {
  return commands.find(cmd => cmd.id === id);
}

// Execute a command by ID
export function executeCommand(id: string): boolean {
  const command = getCommandById(id);
  if (command) {
    command.action();
    addToRecentCommands(id);
    return true;
  }
  return false;
}

// Search commands
export function searchCommands(query: string): Command[] {
  const lowerQuery = query.toLowerCase();

  const safeCommands = commands.filter(
    (cmd): cmd is Command =>
      Boolean(cmd && cmd.id && cmd.title && cmd.description && Array.isArray(cmd.keywords))
  );

  const aliasMatches = safeCommands.filter(cmd => 
    (cmd.aliases || []).some(alias => alias.toLowerCase() === lowerQuery)
  );

  if (aliasMatches.length > 0) {
    return aliasMatches;
  }

  return safeCommands.filter(cmd => {
    const keywords = Array.isArray(cmd.keywords) ? cmd.keywords : [];
    const aliases = Array.isArray(cmd.aliases) ? cmd.aliases : [];
    const shortcut = cmd.shortcut || '';

    const searchableText = [
      cmd.title,
      cmd.description,
      ...aliases,
      ...keywords,
      shortcut
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return searchableText.includes(lowerQuery);
  });
}

// Get all categories
export function getCategories(): CommandCategory[] {
  return Array.from(new Set(commands.map(cmd => cmd.category)));
}
