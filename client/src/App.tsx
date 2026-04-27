import { Switch, Route, useLocation } from "wouter";
import { queryClient, prefetchTickerOptions } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PageVisibilityProvider } from "@/contexts/PageVisibilityContext";
import { TrackingProvider } from "@/contexts/TrackingContext";
import { GlobalSEO, JsonLd } from "@/components/SEO";
import { generateOrganizationSchema, generateWebSiteSchema } from "@/lib/json-ld";
import { useAdminUpdates } from "@/hooks/use-admin-updates";
import { initNavigationTracker } from "@/lib/navigation-tracker";
import { AppShell } from "@/components/layout";
import { ScrollToTop } from "@/components/ScrollToTop";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PrivacyConsentBanner } from "@/components/PrivacyConsentBanner";

// ── Pages loaded immediately ───────────────────────────────────────────────
import Landing from "@/pages/Landing";
import NotFound from "@/pages/not-found";
import AuthCallback from "@/pages/AuthCallback";

// ── Equity Pro core pages (lazy) ───────────────────────────────────────────
const Home = lazy(() => import("@/pages/Home"));
const StockDetail = lazy(() => import("@/pages/StockDetail"));
const Stocks = lazy(() => import("@/pages/Stocks"));
const Screener = lazy(() => import("@/pages/Screener"));
const StrategyBacktesting = lazy(() => import("@/pages/StrategyBacktesting"));
const Indices = lazy(() => import("@/pages/Indices"));
const IndexDetail = lazy(() => import("@/pages/IndexDetail"));
const TipTease = lazy(() => import("@/pages/TipTease"));
const Developers = lazy(() => import("@/pages/Developers"));
const SavedResults = lazy(() => import("@/pages/SavedResults"));
const SavedScreenerDetail = lazy(() => import("@/pages/SavedScreenerDetail"));
const SavedBacktestDetail = lazy(() => import("@/pages/SavedBacktestDetail"));
const SharedResult = lazy(() => import("@/pages/SharedResult"));
const Profile = lazy(() => import("@/pages/Profile"));
const Blog = lazy(() => import("@/pages/Blog"));
const AdvancedStrategies = lazy(() => import("@/pages/AdvancedStrategies"));
const MarketReports = lazy(() => import("@/pages/MarketReports"));
const SteelSectorOutlook = lazy(() => import("@/pages/market-reports/SteelSectorOutlook"));
const GasSectorOutlook = lazy(() => import("@/pages/market-reports/GasSectorOutlook"));
const HealthcareSector = lazy(() => import("@/pages/market-reports/HealthcareSector"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));

// ── Auth pages (deferred — placeholders for now) ───────────────────────────
const EquityProLogin = lazy(() => import("@/pages/EquityProLogin"));
const EquityProSignup = lazy(() => import("@/pages/EquityProSignup"));
const EquityProForgotPassword = lazy(() => import("@/pages/EquityProForgotPassword"));
const OAuthSetup = lazy(() => import("@/pages/OAuthSetup"));

// ── FinTerminal pages (lazy) ───────────────────────────────────────────────
const AdvancedChart = lazy(() => import("@/pages/ft/AdvancedChart"));
const Watchlist = lazy(() => import("@/pages/ft/Watchlist"));
const Monitor = lazy(() => import("@/pages/ft/Monitor"));
const NewsPage = lazy(() => import("@/pages/ft/NewsPage"));
const MostActive = lazy(() => import("@/pages/ft/MostActive"));
const WorldIndices = lazy(() => import("@/pages/ft/WorldIndices"));
const FiiDii = lazy(() => import("@/pages/ft/FiiDii"));
const OptionChain = lazy(() => import("@/pages/ft/OptionChain"));
const OptionsVisualizer = lazy(() => import("@/pages/ft/OptionsVisualizer"));
const OrderBook = lazy(() => import("@/pages/ft/OrderBook"));
const BlackScholes = lazy(() => import("@/pages/ft/BlackScholes"));
const EquityScreener = lazy(() => import("@/pages/ft/EquityScreener"));
const PatternSearch = lazy(() => import("@/pages/ft/PatternSearch"));
const SystematicPatterns = lazy(() => import("@/pages/ft/SystematicPatterns"));
const Compare = lazy(() => import("@/pages/ft/Compare"));
const PairTrading = lazy(() => import("@/pages/ft/PairTrading"));
const PortfolioOptimizer = lazy(() => import("@/pages/ft/PortfolioOptimizer"));
const FinancialCalculatorPage = lazy(() => import("@/pages/ft/FinancialCalculatorPage"));
const ResearchReports = lazy(() => import("@/pages/ft/ResearchReports"));
const IpoPage = lazy(() => import("@/pages/ft/IpoPage"));
const TimeSales = lazy(() => import("@/pages/ft/TimeSales"));
const CorporateActions = lazy(() => import("@/pages/ft/CorporateActions"));
const FinancialResultsPage = lazy(() => import("@/pages/ft/FinancialResultsPage"));
const Forum = lazy(() => import("@/pages/ft/Forum"));
const Notes = lazy(() => import("@/pages/ft/Notes"));
const Changelog = lazy(() => import("@/pages/ft/Changelog"));
const Help = lazy(() => import("@/pages/ft/Help"));
const Seasonality = lazy(() => import("@/pages/Seasonality"));
const FyersTokenUpdate = lazy(() => import("@/pages/FyersTokenUpdate"));

// ── Admin pages (lazy) ────────────────────────────────────────────────────
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("@/pages/admin/AdminUsers"));
const AdminAnalytics = lazy(() => import("@/pages/admin/AdminAnalytics"));
const AdminAuditLogs = lazy(() => import("@/pages/admin/AdminAuditLogs"));
const AdminNotifications = lazy(() => import("@/pages/admin/AdminNotifications"));
const AdminSettings = lazy(() => import("@/pages/admin/AdminSettings"));
const AdminSecurity = lazy(() => import("@/pages/admin/AdminSecurity"));
const AdminRateLimits = lazy(() => import("@/pages/admin/AdminRateLimits"));
const AdminFeatureFlags = lazy(() => import("@/pages/admin/AdminFeatureFlags"));
const AdminEmailSettings = lazy(() => import("@/pages/admin/AdminEmailSettings"));
const AdminApiKeys = lazy(() => import("@/pages/admin/AdminApiKeys"));
const AdminPlatforms = lazy(() => import("@/pages/admin/AdminPlatforms"));
const AdminCoinTransactions = lazy(() => import("@/pages/admin/AdminCoinTransactions"));
const Pricing = lazy(() => import("@/pages/Pricing"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

function AdminUpdatesListener() {
  useAdminUpdates();
  return null;
}

// Paths that render WITHOUT the AppShell (no sidebar/topbar)
const BARE_PATHS = new Set([
  "/", "/login", "/signup", "/forgot-password",
  "/auth/callback", "/auth/oauth-setup", "/privacy",
  "/fyers-token", "/pricing",
]);

function AppRoutes() {
  const [location] = useLocation();
  return (
    <Suspense fallback={<PageLoader />}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        >
      <Switch>
        {/* ── Public/bare routes ──────────────────────────── */}
        <Route path="/" component={Landing} />
        <Route path="/login" component={EquityProLogin} />
        <Route path="/signup" component={EquityProSignup} />
        <Route path="/forgot-password" component={EquityProForgotPassword} />
        <Route path="/auth/callback" component={AuthCallback} />
        <Route path="/auth/oauth-setup" component={OAuthSetup} />
        <Route path="/fyers-token" component={FyersTokenUpdate} />
        <Route path="/privacy" component={PrivacyPolicy} />
        <Route path="/shared/screener/:token" component={SharedResult} />
        <Route path="/shared/backtest/:token" component={SharedResult} />

        {/* ── Equity Pro core pages ────────────────────────── */}
        <Route path="/home" component={Home} />
        <Route path="/stocks" component={Stocks} />
        <Route path="/stocks/:ticker" component={StockDetail} />
        <Route path="/screener" component={Screener} />
        <Route path="/alpha-generation" component={StrategyBacktesting} />
        <Route path="/indices" component={Indices} />
        <Route path="/index/:symbol" component={IndexDetail} />
        <Route path="/tip-tease" component={TipTease} />
        <Route path="/developers" component={Developers} />
        <Route path="/saved-results" component={SavedResults} />
        <Route path="/saved-results/screener/:id" component={SavedScreenerDetail} />
        <Route path="/saved-results/backtest/:id" component={SavedBacktestDetail} />
        <Route path="/profile" component={Profile} />
        <Route path="/blog" component={Blog} />
        <Route path="/blog/advanced-strategies" component={AdvancedStrategies} />
        <Route path="/market-reports" component={MarketReports} />
        <Route path="/market-reports/steel-sector-outlook" component={SteelSectorOutlook} />
        <Route path="/market-reports/gas-sector-outlook" component={GasSectorOutlook} />
        <Route path="/market-reports/healthcare-sector-outlook" component={HealthcareSector} />

        {/* ── FinTerminal pages ─────────────────────────────── */}
        <Route path="/chart/:symbol?" component={AdvancedChart} />
        <Route path="/watchlist" component={Watchlist} />
        <Route path="/monitor" component={Monitor} />
        <Route path="/news" component={NewsPage} />
        <Route path="/most-active" component={MostActive} />
        <Route path="/world-indices" component={WorldIndices} />
        <Route path="/fii-dii" component={FiiDii} />
        <Route path="/options/:symbol?" component={OptionChain} />
        <Route path="/options-visualizer/:symbol?" component={OptionsVisualizer} />
        <Route path="/order-book/:symbol?" component={OrderBook} />
        <Route path="/black-scholes" component={BlackScholes} />
        <Route path="/equity-screener" component={EquityScreener} />
        <Route path="/pattern-search" component={PatternSearch} />
        <Route path="/systematic-patterns" component={SystematicPatterns} />
        <Route path="/seasonality" component={Seasonality} />
        <Route path="/compare" component={Compare} />
        <Route path="/pair-trading" component={PairTrading} />
        <Route path="/portfolio-optimizer" component={PortfolioOptimizer} />
        <Route path="/calculator" component={FinancialCalculatorPage} />
        <Route path="/research-reports" component={ResearchReports} />
        <Route path="/ipos" component={IpoPage} />
        <Route path="/time-sales/:symbol?" component={TimeSales} />
        <Route path="/corporate-actions/:symbol?" component={CorporateActions} />
        <Route path="/financial-results/:symbol?" component={FinancialResultsPage} />
        <Route path="/forum" component={Forum} />
        <Route path="/notes" component={Notes} />
        <Route path="/changelog" component={Changelog} />
        <Route path="/help" component={Help} />

        {/* ── Admin routes ──────────────────────────────────── */}
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/users" component={AdminUsers} />
        <Route path="/admin/analytics" component={AdminAnalytics} />
        <Route path="/admin/audit" component={AdminAuditLogs} />
        <Route path="/admin/notifications" component={AdminNotifications} />
        <Route path="/admin/settings" component={AdminSettings} />
        <Route path="/admin/security" component={AdminSecurity} />
        <Route path="/admin/rate-limits" component={AdminRateLimits} />
        <Route path="/admin/feature-flags" component={AdminFeatureFlags} />
        <Route path="/admin/email-settings" component={AdminEmailSettings} />
        <Route path="/admin/api-keys" component={AdminApiKeys} />
        <Route path="/admin/platforms" component={AdminPlatforms} />
        <Route path="/admin/coins" component={AdminCoinTransactions} />
        <Route path="/pricing" component={Pricing} />

        {/* ── 404 ───────────────────────────────────────────── */}
        <Route component={NotFound} />
      </Switch>
        </motion.div>
      </AnimatePresence>
    </Suspense>
  );
}

function Router() {
  const [location] = useLocation();
  const isBare = BARE_PATHS.has(location) || location.startsWith("/shared/");
  const isAdmin = location.startsWith("/admin");

  if (isBare) {
    return <AppRoutes />;
  }

  if (isAdmin) {
    // Admin pages use their own AdminLayout internally — render without AppShell
    return <AppRoutes />;
  }

  return (
    <AppShell>
      <AppRoutes />
    </AppShell>
  );
}

function App() {
  useEffect(() => {
    initNavigationTracker();
  }, []);

  useEffect(() => {
    const scheduleIdleTask = window.requestIdleCallback || ((cb: () => void) => setTimeout(cb, 1));
    const idleHandle = scheduleIdleTask(() => {
      prefetchTickerOptions();
    });
    return () => {
      if (window.cancelIdleCallback) {
        window.cancelIdleCallback(idleHandle as number);
      }
    };
  }, []);

  return (
    <HelmetProvider>
      <AuthProvider>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange={false}
        >
          <QueryClientProvider client={queryClient}>
            <PageVisibilityProvider>
              <TrackingProvider>
                <TooltipProvider>
                  <GlobalSEO />
                  <JsonLd data={[generateOrganizationSchema(), generateWebSiteSchema()]} />
                  <AdminUpdatesListener />
                  <ImpersonationBanner />
                  <NotificationBanner />
                  <ScrollToTop>
                    <Router />
                  </ScrollToTop>
                  <Toaster />
                  <PrivacyConsentBanner />
                </TooltipProvider>
              </TrackingProvider>
            </PageVisibilityProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </AuthProvider>
    </HelmetProvider>
  );
}

export default App;
