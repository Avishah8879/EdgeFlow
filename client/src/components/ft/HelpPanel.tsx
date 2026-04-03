import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Search, HelpCircle, Command, Keyboard, Book, 
  ExternalLink, Info, Terminal, Zap, Database,
  Globe, Shield, FileText, MessageSquare
} from 'lucide-react';
import { commands, type CommandCategory } from '@/lib/commandRegistry';

interface ShortcutItem {
  keys: string[];
  description: string;
  category: string;
}

const keyboardShortcuts: ShortcutItem[] = [
  // Global
  { keys: ['Ctrl', 'K'], description: 'Open command palette', category: 'Global' },
  { keys: ['Esc'], description: 'Close active window or dialog', category: 'Global' },
  { keys: ['F11'], description: 'Toggle fullscreen', category: 'Global' },
  
  // Navigation
  { keys: ['Tab'], description: 'Navigate between windows', category: 'Navigation' },
  { keys: ['Shift', 'Tab'], description: 'Navigate backwards', category: 'Navigation' },
  { keys: ['Alt', '1-9'], description: 'Switch to window by number', category: 'Navigation' },
  
  // Window Management
  { keys: ['Ctrl', 'N'], description: 'New window', category: 'Windows' },
  { keys: ['Ctrl', 'W'], description: 'Close active window', category: 'Windows' },
  { keys: ['Ctrl', 'M'], description: 'Minimize active window', category: 'Windows' },
  { keys: ['Ctrl', 'Shift', 'M'], description: 'Maximize active window', category: 'Windows' },
  
  // Data
  { keys: ['F5'], description: 'Refresh data', category: 'Data' },
  { keys: ['Ctrl', 'Shift', 'R'], description: 'Reset to default windows', category: 'Data' },
  { keys: ['Ctrl', 'S'], description: 'Save layout', category: 'Data' },
  
  // Charts
  { keys: ['←', '→'], description: 'Pan chart left/right', category: 'Charts' },
  { keys: ['+', '-'], description: 'Zoom in/out', category: 'Charts' },
  { keys: ['Space'], description: 'Reset chart view', category: 'Charts' },
  { keys: ['D'], description: 'Toggle to daily view', category: 'Charts' },
  { keys: ['W'], description: 'Toggle to weekly view', category: 'Charts' },
  { keys: ['M'], description: 'Toggle to monthly view', category: 'Charts' },
];

const gettingStartedContent = [
  {
    title: 'Welcome to Financial Terminal',
    icon: Terminal,
    content: `The Financial Terminal is a professional-grade trading interface inspired by Bloomberg Terminal. 
    It provides real-time market data, advanced charting, news feeds, and powerful analysis tools.`,
  },
  {
    title: 'Quick Start',
    icon: Zap,
    content: `1. Add symbols to your watchlist for real-time quotes
2. Open charts to analyze price movements
3. Use the command palette (Ctrl+K) to access all features
4. Customize your layout by dragging and resizing windows
5. Your layout is automatically saved`,
  },
  {
    title: 'Core Features',
    icon: Info,
    content: `- Real-time stock quotes and market data
- Interactive charts with technical indicators
- Customizable watchlists
- Financial calculator with NPV, IRR, and more
- Notes editor with markdown support
- Fully customizable window layout`,
  },
];

const apiInfoContent = [
  {
    title: 'Alpha Vantage API',
    description: 'Primary data provider for stock quotes, charts, and market data',
    limits: 'Free tier: 5 requests/min, 500 requests/day',
    setup: 'Get your API key at alphavantage.co and add it in Settings',
  },
  {
    title: 'Data Refresh Rates',
    description: 'How often different data types are updated',
    limits: 'Quotes: 5-10 seconds, Charts: 1 minute, News: 5 minutes',
    setup: 'Configure refresh rates in Settings → Display',
  },
  {
    title: 'Rate Limiting',
    description: 'Automatic request throttling to prevent API limits',
    limits: 'Requests are queued and cached to maximize efficiency',
    setup: 'The terminal automatically manages rate limits',
  },
];

export function HelpPanel() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CommandCategory | 'All'>('All');

  const filteredCommands = commands.filter(cmd => {
    const matchesSearch = searchQuery === '' || 
      cmd.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.keywords.some(k => k.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = selectedCategory === 'All' || cmd.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const categories: Array<CommandCategory | 'All'> = [
    'All', 'Market Data', 'Analysis', 'News', 'Tools', 'Account', 'System', 'Research'
  ];

  const filteredShortcuts = keyboardShortcuts.filter(shortcut =>
    searchQuery === '' ||
    shortcut.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    shortcut.keys.some(k => k.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const shortcutCategories = Array.from(new Set(keyboardShortcuts.map(s => s.category)));

  return (
    <div className="h-full bg-card p-2">
      <div className="flex items-center gap-2 mb-2">
        <HelpCircle className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-bold text-primary">Help & Documentation</h2>
      </div>

      <Tabs defaultValue="commands" className="h-[calc(100%-32px)]">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="commands" data-testid="tab-commands">Commands</TabsTrigger>
          <TabsTrigger value="shortcuts" data-testid="tab-shortcuts">Shortcuts</TabsTrigger>
          <TabsTrigger value="start" data-testid="tab-start">Getting Started</TabsTrigger>
          <TabsTrigger value="api" data-testid="tab-api">API Info</TabsTrigger>
          <TabsTrigger value="resources" data-testid="tab-resources">Resources</TabsTrigger>
        </TabsList>

        <div className="mt-2">
          <div className="relative mb-2">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search help topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 bg-background"
              data-testid="input-search-help"
            />
          </div>

          <ScrollArea className="h-[calc(100%-120px)]">
            <TabsContent value="commands">
              <div className="space-y-4">
                <div className="flex gap-2 flex-wrap mb-4">
                  {categories.map(cat => (
                    <Badge
                      key={cat}
                      variant={selectedCategory === cat ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => setSelectedCategory(cat)}
                      data-testid={`filter-${cat.toLowerCase()}`}
                    >
                      {cat}
                    </Badge>
                  ))}
                </div>

                {filteredCommands.length === 0 ? (
                  <Card className="p-8 text-center bg-card/50 border-primary/20">
                    <Command className="w-12 h-12 mx-auto mb-2 text-primary opacity-50" />
                    <p className="text-muted-foreground">No commands found</p>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {filteredCommands.map(cmd => (
                      <Card
                        key={cmd.id}
                        className="p-3 bg-card/50 border-primary/20 hover-elevate"
                        data-testid={`command-${cmd.id}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex gap-3">
                            <cmd.icon className="w-5 h-5 text-primary mt-0.5" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="text-sm font-medium">{cmd.title}</h4>
                                {cmd.shortcut && (
                                  <Badge variant="outline" className="text-xs">
                                    {cmd.shortcut}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {cmd.description}
                              </p>
                              {cmd.aliases && cmd.aliases.length > 0 && (
                                <div className="flex gap-1 mt-1">
                                  <span className="text-xs text-primary/70">Aliases:</span>
                                  {cmd.aliases.map(alias => (
                                    <Badge key={alias} variant="outline" className="text-xs h-5">
                                      {alias}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {cmd.category}
                          </Badge>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="shortcuts">
              <div className="space-y-4">
                {shortcutCategories.map(category => (
                  <div key={category}>
                    <h3 className="text-sm font-bold text-primary mb-2">{category}</h3>
                    <div className="space-y-1">
                      {filteredShortcuts
                        .filter(s => s.category === category)
                        .map((shortcut, idx) => (
                          <Card
                            key={idx}
                            className="p-2 bg-card/50 border-primary/20"
                            data-testid={`shortcut-${idx}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm">{shortcut.description}</span>
                              <div className="flex gap-1">
                                {shortcut.keys.map((key, i) => (
                                  <span key={i}>
                                    <Badge variant="outline" className="text-xs font-mono">
                                      {key}
                                    </Badge>
                                    {i < shortcut.keys.length - 1 && (
                                      <span className="text-xs mx-1">+</span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </Card>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="start">
              <div className="space-y-4">
                {gettingStartedContent.map((section, idx) => (
                  <Card key={idx} className="p-4 bg-card/50 border-primary/20">
                    <div className="flex gap-3">
                      <section.icon className="w-5 h-5 text-primary mt-1" />
                      <div>
                        <h3 className="text-sm font-bold mb-2">{section.title}</h3>
                        <p className="text-sm text-muted-foreground whitespace-pre-line">
                          {section.content}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}

                <Card className="p-4 bg-sidebar/20 border-primary/10">
                  <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
                    <Book className="w-4 h-4" />
                    Pro Tips
                  </h3>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Use Ctrl+K to quickly access any feature</li>
                    <li>• Drag window headers to rearrange your layout</li>
                    <li>• Double-click window headers to maximize</li>
                    <li>• Your layout is automatically saved</li>
                    <li>• Use Tab to navigate between windows</li>
                  </ul>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="api">
              <div className="space-y-4">
                {apiInfoContent.map((api, idx) => (
                  <Card key={idx} className="p-4 bg-card/50 border-primary/20">
                    <div className="flex items-start gap-3">
                      <Database className="w-5 h-5 text-primary mt-1" />
                      <div className="flex-1">
                        <h3 className="text-sm font-bold mb-2">{api.title}</h3>
                        <p className="text-xs text-muted-foreground mb-2">{api.description}</p>
                        <div className="space-y-1">
                          <div className="flex gap-2">
                            <Badge variant="outline" className="text-xs">Limits</Badge>
                            <span className="text-xs">{api.limits}</span>
                          </div>
                          <div className="flex gap-2">
                            <Badge variant="outline" className="text-xs">Setup</Badge>
                            <span className="text-xs">{api.setup}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}

                <Card className="p-4 bg-sidebar/20 border-primary/10">
                  <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Data Security
                  </h3>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• API keys are stored locally and encrypted</li>
                    <li>• All data requests use HTTPS</li>
                    <li>• Cached data expires automatically</li>
                    <li>• No personal data is transmitted</li>
                  </ul>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="resources">
              <div className="space-y-4">
                <Card className="p-4 bg-card/50 border-primary/20">
                  <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    External Resources
                  </h3>
                  <div className="space-y-2">
                    <a
                      href="https://www.alphavantage.co/documentation/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-2 rounded hover-elevate"
                      data-testid="link-alphavantage"
                    >
                      <span className="text-sm">Alpha Vantage API Documentation</span>
                      <ExternalLink className="w-4 h-4 text-primary" />
                    </a>
                    <a
                      href="https://finance.yahoo.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-2 rounded hover-elevate"
                      data-testid="link-yahoo"
                    >
                      <span className="text-sm">Yahoo Finance</span>
                      <ExternalLink className="w-4 h-4 text-primary" />
                    </a>
                    <a
                      href="https://www.tradingview.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-2 rounded hover-elevate"
                      data-testid="link-tradingview"
                    >
                      <span className="text-sm">TradingView Charts</span>
                      <ExternalLink className="w-4 h-4 text-primary" />
                    </a>
                  </div>
                </Card>

                <Card className="p-4 bg-card/50 border-primary/20">
                  <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Documentation
                  </h3>
                  <div className="space-y-2">
                    <div className="p-2">
                      <h4 className="text-xs font-medium mb-1">Technical Indicators</h4>
                      <p className="text-xs text-muted-foreground">
                        Learn about MA, EMA, RSI, MACD, and other indicators
                      </p>
                    </div>
                    <div className="p-2">
                      <h4 className="text-xs font-medium mb-1">Chart Patterns</h4>
                      <p className="text-xs text-muted-foreground">
                        Understanding candlestick patterns and trends
                      </p>
                    </div>
                    <div className="p-2">
                      <h4 className="text-xs font-medium mb-1">Market Analysis</h4>
                      <p className="text-xs text-muted-foreground">
                        Fundamental vs technical analysis basics
                      </p>
                    </div>
                  </div>
                </Card>

                <Card className="p-4 bg-card/50 border-primary/20">
                  <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Support
                  </h3>
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      For bug reports and feature requests, use the Bug Report window
                      (Command: BUG)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      For live chat support, use the Chat window
                      (Command: CHAT)
                    </p>
                  </div>
                </Card>
              </div>
            </TabsContent>
          </ScrollArea>
        </div>
      </Tabs>
    </div>
  );
}