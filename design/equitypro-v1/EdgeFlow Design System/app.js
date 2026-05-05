/* EquityPro — shared shell + theme toggle + nav active state */
(function () {
  const STORAGE_KEY = 'equitypro-theme';
  const apply = (m) => document.documentElement.classList.toggle('dark', m === 'dark');
  apply(localStorage.getItem(STORAGE_KEY) || 'light');

  const TOPBAR = `
<header class="topbar">
  <div class="container topbar-inner">
    <a href="index.html" class="brand-lockup">
      <img class="brand-mark" src="assets/shield.png" alt="EquityPro" />
      <span>EquityPro</span>
    </a>
    <nav class="nav-primary">
      <a href="dashboard.html" data-match="dashboard">Dashboard</a>

      <div class="nav-drop" data-match-group="markets">
        <button class="nav-drop-btn" data-match="markets">Markets
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="nav-drop-menu">
          <a href="stocks.html" data-match="stocks"><b>Stocks</b><span>NSE / BSE quote browser</span></a>
          <a href="stock-detail.html" data-match="stock-detail"><b>Stock detail</b><span>Single-quote deep dive</span></a>
          <a href="indices.html" data-match="indices"><b>Indices</b><span>Nifty, Sensex, sector indices</span></a>
          <a href="news.html" data-match="news"><b>News &amp; insights</b><span>Market-moving stories</span></a>
          <a href="market-reports.html" data-match="market-reports"><b>Market reports</b><span>Daily &amp; weekly research</span></a>
        </div>
      </div>

      <div class="nav-drop" data-match-group="research">
        <button class="nav-drop-btn" data-match="research">Research
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="nav-drop-menu">
          <a href="screener.html" data-match="screener"><b>Expert Screener</b><span>Visual rule builder</span></a>
          <a href="backtesting.html" data-match="backtesting"><b>Backtesting · QGA</b><span>Strategy lab</span></a>
          <a href="advanced-strategies.html" data-match="advanced-strategies"><b>Advanced strategies</b><span>Multi-leg playbook</span></a>
          <a href="seasonality.html" data-match="seasonality"><b>Seasonality</b><span>Calendar &amp; periodicity</span></a>
          <a href="saved-results.html" data-match="saved"><b>Saved work</b><span>Screens · backtests · lists</span></a>
        </div>
      </div>

      <div class="nav-drop" data-match-group="terminal">
        <button class="nav-drop-btn" data-match="terminal">Terminal
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="nav-drop-menu nav-drop-wide">
          <div>
            <h5>Charts &amp; quotes</h5>
            <a href="ft-advanced-chart.html"><b>Advanced chart</b></a>
            <a href="ft-time-sales.html"><b>Time &amp; sales</b></a>
            <a href="ft-order-book.html"><b>Order book</b></a>
            <a href="ft-compare.html"><b>Compare</b></a>
            <a href="ft-most-active.html"><b>Most active</b></a>
            <a href="ft-world-indices.html"><b>World indices</b></a>
          </div>
          <div>
            <h5>Options &amp; derivatives</h5>
            <a href="ft-option-chain.html"><b>Option chain</b></a>
            <a href="ft-options-visualizer.html"><b>Options visualizer</b></a>
            <a href="ft-black-scholes.html"><b>Black-Scholes</b></a>
            <a href="ft-fii-dii.html"><b>FII / DII flows</b></a>
            <a href="ft-corporate-actions.html"><b>Corporate actions</b></a>
          </div>
          <div>
            <h5>Strategies</h5>
            <a href="pair-trading.html" data-match="pair-trading"><b>Pair trading</b></a>
            <a href="ft-pattern-search.html"><b>Pattern search</b></a>
            <a href="ft-systematic-patterns.html"><b>Systematic patterns</b></a>
            <a href="ft-portfolio-optimizer.html"><b>Portfolio optimizer</b></a>
            <a href="ft-equity-screener.html"><b>Equity screener</b></a>
            <a href="ft-monitor.html"><b>Monitor</b></a>
          </div>
          <div>
            <h5>Workspace</h5>
            <a href="ft-watchlist.html"><b>Watchlist</b></a>
            <a href="ft-notes.html"><b>Notes</b></a>
            <a href="ft-research-reports.html"><b>Research reports</b></a>
            <a href="ft-financial-results.html"><b>Financial results</b></a>
            <a href="ft-financial-calculator.html"><b>Calculators</b></a>
            <a href="ft-ipo.html"><b>IPO calendar</b></a>
            <a href="ft-news.html"><b>News</b></a>
            <a href="ft-forum.html"><b>Forum</b></a>
            <a href="ft-help.html"><b>Help</b></a>
          </div>
        </div>
      </div>

      <div class="nav-drop" data-match-group="account">
        <button class="nav-drop-btn" data-match="account">Account
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="nav-drop-menu">
          <a href="profile.html" data-match="profile"><b>Profile &amp; settings</b><span>Account · prefs · billing</span></a>
          <a href="watchlist.html" data-match="watchlist"><b>My watchlists</b><span>Your tracked symbols</span></a>
          <a href="portfolio.html" data-match="portfolio"><b>Portfolio</b><span>Holdings &amp; P&amp;L</span></a>
          <a href="oauth-setup.html" data-match="oauth"><b>Broker OAuth</b><span>Fyers · Zerodha · Upstox</span></a>
          <a href="tip-tease.html" data-match="tip-tease"><b>Tip Tease</b><span>AI co-pilot chat</span></a>
          <a href="developers.html" data-match="developers"><b>Developers · API</b><span>Keys, docs, webhooks</span></a>
          <a href="pricing.html" data-match="pricing"><b>Pricing</b><span>Plans &amp; coin packs</span></a>
        </div>
      </div>

      <div class="nav-drop" data-match-group="admin">
        <button class="nav-drop-btn" data-match="admin">Admin
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="nav-drop-menu">
          <a href="admin.html" data-match="admin"><b>Admin overview</b><span>KPI · users · health</span></a>
          <a href="admin-analytics.html"><b>Analytics</b><span>Cohorts · funnels</span></a>
          <a href="admin-users.html"><b>Users</b><span>Accounts &amp; roles</span></a>
          <a href="admin-feature-flags.html"><b>Feature flags</b></a>
          <a href="admin-audit-logs.html"><b>Audit logs</b></a>
          <a href="admin-coin-packs.html"><b>Coin packs</b></a>
          <a href="admin-email-settings.html"><b>Email settings</b></a>
          <a href="admin-api-keys.html"><b>API keys</b></a>
          <a href="all-pages.html"><b>All pages →</b><span>Design system index</span></a>
        </div>
      </div>
    </nav>
    <div class="topbar-spacer"></div>
    <div class="topbar-search">
      <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
      <input placeholder="Search 3,000+ stocks, indices…" />
      <kbd>⌘K</kbd>
    </div>
    <div class="topbar-actions">
      <button class="theme-toggle" data-theme-toggle title="Toggle theme" aria-label="Toggle theme">
        <svg class="icon-moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        <svg class="icon-sun"  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
      </button>
      <a href="login.html" class="btn btn-ghost btn-sm">Sign in</a>
      <a href="signup.html" class="btn btn-primary btn-sm">Open account</a>
    </div>
  </div>
</header>`;

  const FOOTER = `
<footer class="footer">
  <div class="container">
    <div class="footer-grid">
      <div>
        <a href="index.html" class="brand-lockup">
          <img class="brand-mark" src="assets/shield.png" alt="EquityPro" />
          <span>EquityPro</span>
        </a>
        <p class="footer-tag">Technical precision · Fundamental insight · Quantitative rigor · Integrated solutions for the Indian capital markets.</p>
      </div>
      <div><h4>Platform</h4><ul>
        <li><a href="dashboard.html">Dashboard</a></li>
        <li><a href="stocks.html">Stocks</a></li>
        <li><a href="indices.html">Indices</a></li>
        <li><a href="screener.html">Screener</a></li>
        <li><a href="backtesting.html">Backtesting</a></li>
      </ul></div>
      <div><h4>Insights</h4><ul>
        <li><a href="news.html">News</a></li>
        <li><a href="#">Market reports</a></li>
        <li><a href="#">Blog</a></li>
        <li><a href="#">Learn</a></li>
      </ul></div>
      <div><h4>Company</h4><ul>
        <li><a href="#">About</a></li>
        <li><a href="pricing.html">Pricing</a></li>
        <li><a href="#">Careers</a></li>
        <li><a href="#">Contact</a></li>
      </ul></div>
      <div><h4>Legal</h4><ul>
        <li><a href="#">Privacy</a></li>
        <li><a href="#">Terms</a></li>
        <li><a href="#">Disclaimer</a></li>
        <li><a href="#">SEBI registration</a></li>
      </ul></div>
    </div>
    <div class="footer-bottom">
      <span>© 2026 EquityPro Capital Markets Pvt. Ltd. · Not investment advice.</span>
      <span>Made in Mumbai · Built for Indian markets</span>
    </div>
  </div>
</footer>`;

  function mount() {
    const tSlot = document.querySelector('[data-shell-topbar]');
    const fSlot = document.querySelector('[data-shell-footer]');
    if (tSlot) tSlot.outerHTML = TOPBAR;
    if (fSlot) fSlot.outerHTML = FOOTER;

    const page = document.body.dataset.page;
    if (page) {
      document.querySelectorAll('.nav-primary a, .nav-drop-btn').forEach((a) => {
        if (a.dataset.match === page) a.classList.add('active');
      });
      // also activate parent group btn when a child page matches
      document.querySelectorAll('.nav-drop').forEach((d) => {
        const childMatch = d.querySelector(`a[data-match="${page}"]`);
        if (childMatch) {
          const btn = d.querySelector('.nav-drop-btn');
          if (btn) btn.classList.add('active');
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    localStorage.setItem(STORAGE_KEY, next);
    apply(next);
  });
})();
