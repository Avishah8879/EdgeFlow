import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Calendar, Tag, TrendingUp, Bug, AlertTriangle, 
  Zap, Shield, Database, Palette, Terminal 
} from 'lucide-react';

interface ChangelogEntry {
  version: string;
  date: string;
  type: 'major' | 'minor' | 'patch';
  features?: string[];
  improvements?: string[];
  bugFixes?: string[];
  breaking?: string[];
}

const changelog: ChangelogEntry[] = [
  {
    version: '2.1.0',
    date: '2025-01-15',
    type: 'minor',
    features: [
      'Added comprehensive Financial Calculator with NPV, IRR, and loan calculations',
      'Implemented rich text Notes Editor with markdown support',
      'Created Settings Panel for complete terminal customization',
      'Built Help Documentation system with command reference',
      'Added this Changelog panel for version tracking',
    ],
    improvements: [
      'Enhanced command palette with better search and categorization',
      'Improved window management with smoother drag and resize',
      'Optimized data caching for better performance',
    ],
    bugFixes: [
      'Fixed Set iteration error in command registry',
      'Resolved window persistence issues in database',
      'Corrected chart rendering glitches on resize',
    ],
  },
  {
    version: '2.0.0',
    date: '2025-01-10',
    type: 'major',
    features: [
      'Complete terminal redesign with Bloomberg-inspired interface',
      'Floating window system with drag and drop',
      'Real-time stock quotes and market data',
      'Interactive candlestick charts with technical indicators',
      'Customizable watchlists with persistence',
      'Integrated news feed from multiple sources',
    ],
    improvements: [
      'Migrated to React 18 with concurrent features',
      'Implemented WebSocket connections for real-time data',
      'Added PostgreSQL database for data persistence',
      'Integrated Alpha Vantage API for market data',
    ],
    breaking: [
      'Removed legacy jQuery-based components',
      'Changed API response format for quotes',
      'Updated database schema for better performance',
    ],
  },
  {
    version: '1.5.2',
    date: '2024-12-20',
    type: 'patch',
    improvements: [
      'Performance optimizations for large datasets',
      'Reduced bundle size by 30%',
      'Improved error handling and logging',
    ],
    bugFixes: [
      'Fixed memory leak in chart component',
      'Resolved timezone issues in timestamps',
      'Corrected calculation errors in percentage changes',
    ],
  },
  {
    version: '1.5.0',
    date: '2024-12-01',
    type: 'minor',
    features: [
      'Added dark mode support',
      'Implemented keyboard shortcuts',
      'Created command palette for quick actions',
      'Added export functionality for data',
    ],
    improvements: [
      'Enhanced mobile responsiveness',
      'Improved accessibility with ARIA labels',
      'Optimized API request batching',
    ],
  },
  {
    version: '1.0.0',
    date: '2024-10-15',
    type: 'major',
    features: [
      'Initial release of Financial Terminal',
      'Basic stock quote functionality',
      'Simple line charts',
      'Watchlist management',
    ],
  },
];

const getVersionIcon = (type: ChangelogEntry['type']) => {
  switch (type) {
    case 'major':
      return TrendingUp;
    case 'minor':
      return Zap;
    case 'patch':
      return Bug;
  }
};

const getVersionColor = (type: ChangelogEntry['type']) => {
  switch (type) {
    case 'major':
      return 'text-primary';
    case 'minor':
      return 'text-secondary';
    case 'patch':
      return 'text-muted-foreground';
  }
};

export function ChangelogPanel() {
  return (
    <div className="h-full bg-card p-2">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-primary flex items-center gap-2">
          <Terminal className="w-4 h-4" />
          Changelog
        </h2>
        <Badge variant="outline" className="text-xs">
          Current: v{changelog[0].version}
        </Badge>
      </div>

      <ScrollArea className="h-[calc(100%-40px)]">
        <div className="space-y-4">
          {changelog.map((entry) => {
            const Icon = getVersionIcon(entry.type);
            const color = getVersionColor(entry.type);
            
            return (
              <Card
                key={entry.version}
                className="p-4 bg-card/50 border-primary/20"
                data-testid={`changelog-${entry.version}`}
              >
                {/* Version Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Icon className={`w-5 h-5 ${color}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold">v{entry.version}</h3>
                        <Badge
                          variant={entry.type === 'major' ? 'default' : 'outline'}
                          className="text-xs"
                        >
                          {entry.type}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Calendar className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.date).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Breaking Changes */}
                {entry.breaking && entry.breaking.length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-destructive" />
                      <h4 className="text-sm font-semibold text-destructive">
                        Breaking Changes
                      </h4>
                    </div>
                    <ul className="space-y-1 ml-6">
                      {entry.breaking.map((item, idx) => (
                        <li
                          key={idx}
                          className="text-xs text-destructive/80 list-disc list-inside"
                        >
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* New Features */}
                {entry.features && entry.features.length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="w-4 h-4 text-primary" />
                      <h4 className="text-sm font-semibold">New Features</h4>
                    </div>
                    <ul className="space-y-1 ml-6">
                      {entry.features.map((feature, idx) => (
                        <li
                          key={idx}
                          className="text-xs text-muted-foreground list-disc list-inside"
                        >
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Improvements */}
                {entry.improvements && entry.improvements.length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-secondary" />
                      <h4 className="text-sm font-semibold">Improvements</h4>
                    </div>
                    <ul className="space-y-1 ml-6">
                      {entry.improvements.map((improvement, idx) => (
                        <li
                          key={idx}
                          className="text-xs text-muted-foreground list-disc list-inside"
                        >
                          {improvement}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Bug Fixes */}
                {entry.bugFixes && entry.bugFixes.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Bug className="w-4 h-4 text-muted-foreground" />
                      <h4 className="text-sm font-semibold">Bug Fixes</h4>
                    </div>
                    <ul className="space-y-1 ml-6">
                      {entry.bugFixes.map((fix, idx) => (
                        <li
                          key={idx}
                          className="text-xs text-muted-foreground list-disc list-inside"
                        >
                          {fix}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            );
          })}

          {/* Footer */}
          <Card className="p-4 bg-sidebar/20 border-primary/10">
            <div className="flex gap-3">
              <Shield className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <h3 className="text-sm font-bold mb-2">Version Information</h3>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>• Major versions indicate breaking changes</p>
                  <p>• Minor versions add new features</p>
                  <p>• Patch versions contain bug fixes and improvements</p>
                  <p>• This terminal follows semantic versioning (semver)</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
