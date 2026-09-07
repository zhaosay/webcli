    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    const DEVICE_NAME_STORAGE = 'webcli-device-name';

    // Terminal status lines (connection lost/reconnected/etc.) show English
    // first, then a translation in the browser's language — only simplified
    // and traditional Chinese are filled in for now, everyone else just gets
    // the English line.
    const UI_LANG = (() => {
      const lang = (navigator.language || 'en').toLowerCase();
      if (!lang.startsWith('zh')) return 'en';
      return /(-|_)(tw|hk|mo)\b|hant/.test(lang) ? 'zh-Hant' : 'zh-Hans';
    })();
    const MESSAGES = {
      reconnected: {
        en: 'reconnected',
        'zh-Hans': '已重新连接',
        'zh-Hant': '已重新連線',
      },
      connectionLost: {
        en: 'connection lost, reconnecting…',
        'zh-Hans': '连接已断开，正在重连…',
        'zh-Hant': '連線已中斷，正在重新連線…',
      },
      longDisconnect: {
        en: 'still retrying — the server may be down, will keep trying',
        'zh-Hans': '长时间连不上，服务端可能已经关闭，仍会继续自动重试',
        'zh-Hant': '長時間連不上，伺服器可能已經關閉，仍會持續自動重試',
      },
      uploaded: {
        en: 'uploaded',
        'zh-Hans': '已上传',
        'zh-Hant': '已上傳',
      },
      uploadFailed: {
        en: 'upload failed',
        'zh-Hans': '上传失败',
        'zh-Hant': '上傳失敗',
      },
      restarting: {
        en: 'still reconnecting — if the server restarted (usually 10-20s), this page will reload automatically once it is back',
        'zh-Hans': '仍在重连——如果服务端正在重启（通常 10~20 秒），恢复后本页会自动刷新',
        'zh-Hant': '仍在重新連線——如果伺服器正在重新啟動（通常 10~20 秒），恢復後本頁會自動重新整理',
      },
      restored: {
        en: 'back online, reloading…',
        'zh-Hans': '已恢复，正在刷新…',
        'zh-Hant': '已恢復，正在重新整理…',
      },
      reloadTimeout: {
        en: 'still not responding after a while — please refresh manually',
        'zh-Hans': '长时间未恢复，请手动刷新页面',
        'zh-Hant': '長時間未恢復，請手動重新整理頁面',
      },
    };
    function t(key) {
      const m = MESSAGES[key];
      if (!m) return key;
      return UI_LANG === 'en' ? m.en : `${m.en} / ${m[UI_LANG]}`;
    }

    if (!token) {
      document.getElementById('gate').style.display = 'flex';
      document.getElementById('gate-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = document.getElementById('token-input').value.trim();
        if (!v) return;
        const url = new URL(location.href);
        url.searchParams.set('token', v);
        location.href = url.toString();
      });
    } else {
      function initApp(secondaryKey) {
      document.getElementById('app').style.display = 'flex';

      const chromeTitle = document.getElementById('chrome-title');
      const applyName = (name) => {
        document.title = name;
        chromeTitle.textContent = name;
      };
      fetch('/api/name').then((r) => r.json()).then(({ name }) => { if (name) applyName(name); }).catch(() => {});

      const versionInfo = document.getElementById('version-info');
      const versionBadge = document.getElementById('version-badge');
      fetch('/api/version').then((r) => r.json()).then(({ version, commit, commitDate, platform, projectRoot }) => {
        const label = `v${version}${commit ? ' · ' + commit : ''}`;
        versionInfo.textContent = label;
        versionBadge.textContent = `v${version}`;
        if (commitDate) versionInfo.title = commitDate;
        renderQuickcmdPresets(platform, projectRoot);
      }).catch(() => {});

      const connBadge = document.getElementById('connections-badge');
      const connCount = document.getElementById('conn-count');
      const connDropdown = document.getElementById('connections-dropdown');
      const settingsBtn = document.getElementById('settings-btn');
      const settingsDropdown = document.getElementById('settings-dropdown');
      const authQuery = `token=${encodeURIComponent(token)}${secondaryKey ? '&key=' + encodeURIComponent(secondaryKey) : ''}`;

      function closeAllDropdowns() {
        connDropdown.classList.remove('show');
        settingsDropdown.classList.remove('show');
        quickcmdPanel.classList.remove('show');
      }

      function formatAgo(ts) {
        const mins = Math.floor(Math.max(0, Date.now() - ts) / 60000);
        if (mins < 1) return '刚刚';
        if (mins < 60) return `${mins} 分钟前`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} 小时前`;
        return `${Math.floor(hours / 24)} 天前`;
      }

      function refreshConnections() {
        fetch(`/api/connections?${authQuery}`).then((r) => r.json()).then(({ connections }) => {
          if (!Array.isArray(connections)) return;
          connCount.textContent = connections.length;
          connDropdown.innerHTML = '';
          connections.forEach((c) => {
            const row = document.createElement('div');
            row.className = 'conn-row';
            const device = document.createElement('div');
            device.className = 'conn-device';
            device.textContent = c.device || '未命名设备';
            const meta = document.createElement('div');
            meta.className = 'conn-meta';
            meta.textContent = `${c.ip || '未知 IP'} · ${formatAgo(c.connectedAt)}`;
            row.appendChild(device);
            row.appendChild(meta);
            connDropdown.appendChild(row);
          });
        }).catch(() => {});
      }
      connBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        const willShow = !connDropdown.classList.contains('show');
        closeAllDropdowns();
        connDropdown.classList.toggle('show', willShow);
        if (willShow) refreshConnections();
      });
      settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willShow = !settingsDropdown.classList.contains('show');
        closeAllDropdowns();
        settingsDropdown.classList.toggle('show', willShow);
      });
      // Without this, clicking update/restart (or anything else in here)
      // bubbles to the document listener below and closes the menu on the
      // same click — hiding the "重启中…" status line right as it appears.
      settingsDropdown.addEventListener('click', (e) => e.stopPropagation());
      document.addEventListener('click', closeAllDropdowns);
      refreshConnections();
      setInterval(refreshConnections, 15000);

      // Stored server-side (not localStorage) so every device that opens this
      // machine's webcli sees the same set of quick commands, not just the
      // browser that created them.
      const quickcmdToggle = document.getElementById('quickcmd-toggle');
      const quickcmdPanel = document.getElementById('quickcmd-panel');
      const quickcmdBar = document.getElementById('quickcmd-bar');
      const quickcmdBtn = document.getElementById('quickcmd-btn');
      const quickcmdModal = document.getElementById('quickcmd-modal');
      const quickcmdForm = document.getElementById('quickcmd-form');
      const quickcmdLabelInput = document.getElementById('quickcmd-label-input');
      const quickcmdCommandInput = document.getElementById('quickcmd-command-input');
      const quickcmdCwdInput = document.getElementById('quickcmd-cwd-input');
      const quickcmdCancelBtn = document.getElementById('quickcmd-cancel');

      function runQuickCommand(item) {
        const session = currentSession();
        if (!session || !session.ws || session.ws.readyState !== WebSocket.OPEN) return;
        // A latched Ctrl/Alt from the mobile key row must not leak into a canned
        // command — drop the modifiers rather than mangling the first character.
        setSticky('ctrl', false);
        setSticky('alt', false);
        const command = item.cwd ? `cd "${item.cwd}" && ${item.command}` : item.command;
        session.ws.send(JSON.stringify({ type: 'input', data: command + '\n' }));
        session.term.focus();
      }
      function renderQuickCommands(list) {
        quickcmdBar.innerHTML = '';
        list.forEach((item) => {
          const chip = document.createElement('div');
          chip.className = 'quickcmd-chip';
          chip.title = item.cwd ? `cd "${item.cwd}" && ${item.command}` : item.command;
          const label = document.createElement('span');
          label.className = 'quickcmd-chip-label';
          label.textContent = item.label;
          const del = document.createElement('button');
          del.type = 'button';
          del.className = 'quickcmd-chip-del';
          del.textContent = '×';
          del.title = '删除';
          del.addEventListener('click', (e) => {
            e.stopPropagation();
            fetch(`/api/quick-commands?${authQuery}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: item.id }),
            }).then((r) => r.json()).then(({ commands }) => renderQuickCommands(commands || [])).catch(() => {});
          });
          chip.appendChild(label);
          chip.appendChild(del);
          chip.addEventListener('click', () => {
            runQuickCommand(item);
            closeAllDropdowns();
          });
          quickcmdBar.appendChild(chip);
        });
      }
      // Only visible on narrow screens (the widget is a plain inline row on
      // desktop) — opens the same dropdown chrome as connections/settings.
      quickcmdToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const willShow = !quickcmdPanel.classList.contains('show');
        closeAllDropdowns();
        quickcmdPanel.classList.toggle('show', willShow);
      });
      quickcmdPanel.addEventListener('click', (e) => e.stopPropagation());
      quickcmdBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllDropdowns();
        quickcmdLabelInput.value = '';
        quickcmdCommandInput.value = '';
        quickcmdCwdInput.value = '';
        quickcmdModal.classList.add('show');
        quickcmdLabelInput.focus();
      });
      quickcmdModal.addEventListener('click', (e) => {
        if (e.target === quickcmdModal) quickcmdModal.classList.remove('show');
      });
      quickcmdCancelBtn.addEventListener('click', () => quickcmdModal.classList.remove('show'));

      // The shell being controlled is whatever OS the *server* runs on, not
      // the browser's — these presets are useless (or outright fail) on the
      // other kind of shell, so pick the set that matches process.platform
      // from /api/version once it resolves (defaults to POSIX meanwhile).
      const QUICKCMD_PRESETS_POSIX = [
        { label: '主目录', command: 'cd ~' },
        { label: '目录列表', command: 'ls -la' },
        { label: '切换root', command: 'sudo -i' },
        { label: '磁盘用量', command: 'df -h' },
        { label: '进程列表', command: 'ps aux' },
      ];
      const QUICKCMD_PRESETS_WIN32 = [
        { label: '主目录', command: 'cd %USERPROFILE%' },
        { label: '目录列表', command: 'dir' },
        { label: '管理员窗口', command: 'powershell Start-Process cmd -Verb RunAs' },
        { label: '磁盘用量', command: 'wmic logicaldisk get Caption,FreeSpace,Size' },
        { label: '进程列表', command: 'tasklist' },
      ];
      // These three need the project directory as cwd (update/restart) and a
      // per-OS open-file-manager command, so they're built at render time
      // instead of living in the static arrays above.
      function buildManagementPresets(platform, projectRoot) {
        const cwd = projectRoot || '';
        if (platform === 'win32') {
          return [
            { label: '更新webcli', command: 'start "" /B update.bat', cwd },
            { label: '重启webcli', command: 'start "" /B restart.bat', cwd },
            { label: '打开目录', command: 'explorer .' },
          ];
        }
        return [
          { label: '更新webcli', command: 'nohup ./update.sh > /tmp/webcli-update.log 2>&1 & disown', cwd },
          { label: '重启webcli', command: 'nohup ./restart.sh --bg > /tmp/webcli-restart.log 2>&1 & disown', cwd },
          { label: '打开目录', command: platform === 'linux' ? 'xdg-open .' : 'open .' },
        ];
      }
      const quickcmdPresetsEl = document.getElementById('quickcmd-presets');
      function renderQuickcmdPresets(platform, projectRoot) {
        const presets = (platform === 'win32' ? QUICKCMD_PRESETS_WIN32 : QUICKCMD_PRESETS_POSIX)
          .concat(buildManagementPresets(platform, projectRoot));
        quickcmdPresetsEl.innerHTML = '';
        presets.forEach((p) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'quickcmd-preset';
          btn.textContent = p.label;
          btn.addEventListener('click', () => {
            quickcmdLabelInput.value = p.label;
            quickcmdCommandInput.value = p.command;
            quickcmdCwdInput.value = p.cwd || '';
            quickcmdCommandInput.focus();
          });
          quickcmdPresetsEl.appendChild(btn);
        });
      }
      renderQuickcmdPresets('darwin', '');
      quickcmdForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const label = quickcmdLabelInput.value.trim();
        const command = quickcmdCommandInput.value.trim();
        const cwd = quickcmdCwdInput.value.trim();
        if (!label || !command) return;
        fetch(`/api/quick-commands?${authQuery}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label, command, cwd }),
        }).then((r) => r.json()).then(({ commands }) => {
          quickcmdModal.classList.remove('show');
          renderQuickCommands(commands || []);
        }).catch(() => quickcmdModal.classList.remove('show'));
      });
      fetch(`/api/quick-commands?${authQuery}`).then((r) => r.json())
        .then(({ commands }) => renderQuickCommands(commands || [])).catch(() => {});

      const THEME_STORAGE = 'webcli-theme';
      const themeButtons = document.querySelectorAll('.theme-switch button');
      function applyTheme(choice) {
        if (choice === 'auto') document.documentElement.removeAttribute('data-theme');
        else document.documentElement.setAttribute('data-theme', choice);
        themeButtons.forEach((b) => b.classList.toggle('active', b.dataset.themeChoice === choice));
      }
      themeButtons.forEach((b) => b.addEventListener('click', () => {
        localStorage.setItem(THEME_STORAGE, b.dataset.themeChoice);
        applyTheme(b.dataset.themeChoice);
      }));
      applyTheme(localStorage.getItem(THEME_STORAGE) || 'auto');

      const serviceActionStatus = document.getElementById('service-action-status');
      const updateBtn = document.getElementById('update-btn');
      const restartBtn = document.getElementById('restart-btn');

      // The server that answers this POST is the one about to be killed and
      // replaced, so there's no live channel back with a "how did it go".
      // Once it responds (meaning the detached script was launched), poll
      // /api/version until a server answers again, then reload so the page
      // picks up whatever changed.
      function waitForServerThenReload() {
        serviceActionStatus.textContent = '重启中，请稍候…';
        let attempts = 0;
        const poll = setInterval(() => {
          attempts += 1;
          fetch('/api/version').then((r) => {
            if (!r.ok) throw new Error('not ready');
            clearInterval(poll);
            serviceActionStatus.textContent = '已恢复，正在刷新…';
            setTimeout(() => location.reload(), 400);
          }).catch(() => {
            if (attempts >= 60) {
              clearInterval(poll);
              serviceActionStatus.textContent = '等待超时，请手动刷新页面确认状态';
            }
          });
        }, 1500);
      }

      function triggerServiceAction(btn, path, label) {
        updateBtn.disabled = true;
        restartBtn.disabled = true;
        serviceActionStatus.textContent = `正在${label}…`;
        fetch(`${path}?${authQuery}`, { method: 'POST' })
          .then((r) => {
            if (!r.ok) throw new Error('request failed');
            // Give the detached script a moment to actually stop the old
            // process before we start polling, or the first few polls would
            // just hit the still-running (soon to be replaced) instance.
            setTimeout(waitForServerThenReload, 1000);
          })
          .catch(() => {
            serviceActionStatus.textContent = '请求失败，请检查终端日志';
            updateBtn.disabled = false;
            restartBtn.disabled = false;
          });
      }
      updateBtn.addEventListener('click', () => triggerServiceAction(updateBtn, '/api/update', '更新代码'));
      restartBtn.addEventListener('click', () => triggerServiceAction(restartBtn, '/api/restart', '重启服务'));

      chromeTitle.addEventListener('click', () => {
        const current = chromeTitle.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = current;
        input.maxLength = 40;
        input.className = 'chrome-title-input';
        chromeTitle.replaceWith(input);
        input.focus();
        input.select();

        const commit = async () => {
          const value = input.value.trim();
          input.replaceWith(chromeTitle);
          if (!value || value === current) {
            applyName(current);
            return;
          }
          try {
            const res = await fetch(`/api/name?token=${encodeURIComponent(token)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: value }),
            });
            const data = await res.json();
            applyName(data.name || current);
          } catch {
            applyName(current);
          }
        };
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') input.blur();
          if (e.key === 'Escape') { input.value = current; input.blur(); }
        });
        input.addEventListener('blur', commit, { once: true });
      });

      const copyLinkBtn = document.getElementById('copy-link-btn');
      const copyLinkLabel = '复制链接';
      const copyLinkCopiedLabel = '已复制';
      copyLinkBtn.title = location.href;
      copyLinkBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(location.href);
        } catch {
          const ta = document.createElement('textarea');
          ta.value = location.href;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        copyLinkBtn.innerHTML = copyLinkCopiedLabel;
        copyLinkBtn.classList.add('copied');
        setTimeout(() => {
          copyLinkBtn.innerHTML = copyLinkLabel;
          copyLinkBtn.classList.remove('copied');
        }, 1500);
      });

      const MAX_SESSIONS = 10;
      const tabsEl = document.getElementById('tabs');
      const panesEl = document.getElementById('panes');
      const emptyStateEl = document.getElementById('empty-state');
      const newTabBtn = document.getElementById('new-tab-btn');

      const sessions = new Map();
      let sessionCounter = 0;
      let activeId = null;

      function updateEmptyState() {
        emptyStateEl.classList.toggle('show', sessions.size === 0);
      }

      function updateNewTabBtn() {
        newTabBtn.disabled = sessions.size >= MAX_SESSIONS;
      }

      function sendResize(session) {
        if (session.ws && session.ws.readyState === WebSocket.OPEN) {
          session.ws.send(JSON.stringify({ type: 'resize', cols: session.term.cols, rows: session.term.rows }));
        }
      }

      function currentSession() {
        return sessions.get(activeId);
      }

      const searchBar = document.getElementById('search-bar');
      const searchInput = document.getElementById('search-input');

      function openSearch() {
        if (!currentSession()) return;
        searchBar.classList.add('show');
        searchInput.focus();
        searchInput.select();
      }
      function closeSearch() {
        searchBar.classList.remove('show');
        const session = currentSession();
        if (session) session.term.focus();
      }
      function runSearch(dir) {
        const session = currentSession();
        if (!session || !searchInput.value) return;
        if (dir === 'prev') session.searchAddon.findPrevious(searchInput.value);
        else session.searchAddon.findNext(searchInput.value);
      }
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); runSearch(e.shiftKey ? 'prev' : 'next'); }
        if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
      });
      document.getElementById('search-next').addEventListener('click', () => runSearch('next'));
      document.getElementById('search-prev').addEventListener('click', () => runSearch('prev'));
      document.getElementById('search-close').addEventListener('click', closeSearch);

      const MOBILE_KEY_SEQ = {
        esc: '\x1b', tab: '\t', 'ctrl-c': '\x03', 'ctrl-d': '\x04', 'ctrl-z': '\x1a', clear: '\x0c',
        up: '\x1b[A', down: '\x1b[B', left: '\x1b[D', right: '\x1b[C',
        home: '\x1b[H', end: '\x1b[F', pgup: '\x1b[5~', pgdn: '\x1b[6~',
        dash: '-', underscore: '_', slash: '/', pipe: '|', tilde: '~', star: '*',
      };

      // Ctrl and Alt latch instead of needing to be held: tap Ctrl, then a
      // letter, and the two are combined. Soft keyboards never emit real
      // keydown events for letters, so the combining happens in term.onData.
      let stickyCtrl = false;
      let stickyAlt = false;

      function setSticky(which, on) {
        if (which === 'ctrl') stickyCtrl = on; else stickyAlt = on;
        document.querySelectorAll('#mobile-keys button[data-sticky]').forEach((b) => {
          b.classList.toggle('sticky-on', b.dataset.sticky === 'ctrl' ? stickyCtrl : stickyAlt);
        });
      }

      /** Applies any latched modifier, then sends the data to the shell. */
      function sendInput(session, data) {
        if (!session || !session.ws || session.ws.readyState !== WebSocket.OPEN) return;
        let out = data;
        // Latch is consumed by the *next* input regardless of its shape —
        // otherwise a paste (length !== 1) skipped the combining logic below
        // but also skipped clearing stickyCtrl, leaving it latched to
        // silently Ctrl-combine the next unrelated keystroke.
        if (stickyCtrl) {
          if (out.length === 1) {
            const c = out.toUpperCase().charCodeAt(0);
            if (c >= 64 && c <= 95) out = String.fromCharCode(c - 64);
            else if (c === 63) out = '\x7f';
          }
          setSticky('ctrl', false);
        }
        if (stickyAlt) {
          if (out.length >= 1) out = '\x1b' + out;
          setSticky('alt', false);
        }
        session.ws.send(JSON.stringify({ type: 'input', data: out }));
      }

      document.getElementById('mobile-keys').addEventListener('pointerdown', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        // never take focus: that would dismiss the on-screen keyboard
        e.preventDefault();
        if (btn.dataset.sticky) {
          setSticky(btn.dataset.sticky, btn.dataset.sticky === 'ctrl' ? !stickyCtrl : !stickyAlt);
          return;
        }
        const session = currentSession();
        if (!session) return;
        const seq = MOBILE_KEY_SEQ[btn.dataset.key];
        if (seq) sendInput(session, seq);
      });

      // Sessions live on the server, so remembering their ids lets a page
      // reload (or a second device opening the same link) pick the running
      // terminals back up instead of silently orphaning them.
      const SIDS_STORAGE = 'webcli-sids';
      function loadSids() {
        try {
          const v = JSON.parse(localStorage.getItem(SIDS_STORAGE) || '[]');
          return Array.isArray(v) ? v.filter((s) => typeof s === 'string') : [];
        } catch { return []; }
      }
      function saveSids() {
        const live = [...sessions.values()].map((s) => s.sid).filter(Boolean);
        try { localStorage.setItem(SIDS_STORAGE, JSON.stringify(live)); } catch {}
      }

      function newSid() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      }

      // A reconnect taking this long could be the server actually restarting
      // (e.g. a quick command like the "重启webcli" one) rather than just a
      // slow network — shown as a heads-up while still trying. Whether it
      // really was a restart is only confirmed later, from the 'hello'
      // message's `existed` flag (see ws.onmessage below): true reloads,
      // false means it was a false alarm and the banner is just hidden.
      const reloadBanner = document.getElementById('reload-banner');
      let reloadBannerTimeout = null;
      function showReloadBanner(text) {
        reloadBanner.textContent = text;
        reloadBanner.classList.add('show');
      }
      function hideReloadBanner() {
        reloadBanner.classList.remove('show');
        if (reloadBannerTimeout) { clearTimeout(reloadBannerTimeout); reloadBannerTimeout = null; }
      }
      function armLongDisconnectBanner() {
        if (reloadBanner.classList.contains('show')) return;
        showReloadBanner(t('restarting'));
        reloadBannerTimeout = setTimeout(() => showReloadBanner(t('reloadTimeout')), 90000);
      }

      function connectWs(session) {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        const keyParam = secondaryKey ? `&key=${encodeURIComponent(secondaryKey)}` : '';
        const deviceName = localStorage.getItem(DEVICE_NAME_STORAGE) || '';
        const deviceParam = deviceName ? `&device=${encodeURIComponent(deviceName)}` : '';
        const dims = `&cols=${session.term.cols}&rows=${session.term.rows}`;
        const ws = new WebSocket(`${proto}://${location.host}/?token=${encodeURIComponent(token)}&sid=${encodeURIComponent(session.sid)}${keyParam}${deviceParam}${dims}`);
        ws.binaryType = 'arraybuffer';
        session.ws = ws;

        const setDot = (state) => { session.dot.className = `tab-dot ${state}`; };

        ws.onopen = () => {
          setDot('connected');
          const wasReconnect = session.reconnectAttempts > 0;
          session.reconnectAttempts = 0;
          // Resolved in the 'hello' handler below, once we know whether the
          // server actually still remembers this session (a plain network
          // blip) or not (the server process itself restarted).
          session.awaitingRestartCheck = wasReconnect;
          if (wasReconnect) session.term.write(`\r\n\x1b[2m[${t('reconnected')}]\x1b[0m\r\n`);
          // Panes stay in layout (hidden via opacity, not display:none) so
          // fit() reports a real size even for an inactive tab — always fit
          // on connect. Gating this on "is this the active tab" broke
          // multi-tab restore: createSession() reassigns activeId to each
          // new tab as it's created, so every tab but the last one would
          // see activeId !== its own id by the time its socket actually
          // opened, and stay stuck at whatever default size it was created
          // with.
          session.fitAddon.fit();
          sendResize(session);
        };
        // Binary frames are terminal bytes; text frames are JSON control
        // messages (tab titles, resume info).
        ws.onmessage = (e) => {
          if (typeof e.data === 'string') {
            let msg;
            try { msg = JSON.parse(e.data); } catch { return; }
            if (msg.type === 'hello') {
              if (msg.resumed) session.term.reset();
              if (session.awaitingRestartCheck) {
                if (msg.existed) {
                  // False alarm — just a slow network, the shell never died.
                  hideReloadBanner();
                } else {
                  // The server has no memory of this session: it restarted
                  // (or crashed and came back) while we were disconnected.
                  // The freshly-created session we just landed in is a
                  // stand-in the client can't do much useful with (new pty,
                  // wrong cwd, empty scrollback) — reload for a clean start.
                  showReloadBanner(t('restored'));
                  setTimeout(() => location.reload(), 600);
                }
              }
              session.awaitingRestartCheck = false;
              if (msg.title) applyAutoTitle(session, msg.title);
              saveSids();
            } else if (msg.type === 'title') {
              applyAutoTitle(session, msg.title);
            }
            return;
          }
          session.term.write(new Uint8Array(e.data));
        };
        ws.onclose = () => {
          setDot('disconnected');
          if (session.closing) return;
          // Print once on the initial drop, not on every failed retry (a
          // failed connection attempt also fires 'close', so without this
          // guard a server that's genuinely down would spam this line every
          // few seconds forever). After enough retries in a row (~35s of
          // backoff), a network blip is a much less likely explanation than
          // the service having actually been stopped, so say so once.
          if (session.reconnectAttempts === 0) {
            session.term.write(`\r\n\x1b[31m[${t('connectionLost')}]\x1b[0m\r\n`);
          } else if (session.reconnectAttempts === 6) {
            session.term.write(`\r\n\x1b[33m[${t('longDisconnect')}]\x1b[0m\r\n`);
            armLongDisconnectBanner();
          }
          const delay = Math.min(1000 * 2 ** session.reconnectAttempts, 10000);
          session.reconnectAttempts += 1;
          session.reconnectTimer = setTimeout(() => {
            if (!session.closing) connectWs(session);
          }, delay);
        };
        ws.onerror = () => {
          setDot('disconnected');
        };
      }

      function activateSession(id) {
        activeId = id;
        panesEl.querySelectorAll('.pane').forEach((p) => p.classList.toggle('active', p.dataset.id === String(id)));
        tabsEl.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.id === String(id)));
        const session = sessions.get(id);
        if (session) {
          session.fitAddon.fit();
          session.term.focus();
          sendResize(session);
        }
      }

      function closeSession(id) {
        const session = sessions.get(id);
        if (!session) return;
        session.closing = true;
        if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
        if (session.ws) {
          // Closing a tab by hand means "kill the shell"; a dropped connection
          // does not, which is what the reconnect grace period is for.
          if (session.ws.readyState === WebSocket.OPEN) {
            session.ws.send(JSON.stringify({ type: 'kill' }));
          }
          session.ws.close();
        }
        session.pane.remove();
        session.tabEl.remove();
        sessions.delete(id);
        saveSids();
        updateEmptyState();
        updateNewTabBtn();
        if (activeId === id) {
          const remaining = [...sessions.keys()];
          activeId = null;
          if (remaining.length) activateSession(remaining[remaining.length - 1]);
        }
      }

      // Tabs are labelled with the foreground process (zsh -> vim -> top) until
      // the user renames one by hand, at which point their name wins.
      function applyAutoTitle(session, title) {
        if (!title || session.renamed) return;
        session.labelEl.textContent = title;
        session.labelEl.title = '双击重命名';
      }

      function createSession(existingSid) {
        if (sessions.size >= MAX_SESSIONS) return;
        const id = ++sessionCounter;

        const pane = document.createElement('div');
        pane.className = 'pane';
        pane.dataset.id = String(id);
        panesEl.appendChild(pane);

        const tabEl = document.createElement('div');
        tabEl.className = 'tab';
        tabEl.dataset.id = String(id);
        tabEl.innerHTML = '<span class="tab-dot"></span><span class="tab-label"></span><button class="tab-close" type="button">&times;</button>';
        const tabLabelEl = tabEl.querySelector('.tab-label');
        tabLabelEl.textContent = `webcli-${id}`;
        tabLabelEl.title = '双击重命名';
        tabLabelEl.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          const current = tabLabelEl.textContent;
          const input = document.createElement('input');
          input.type = 'text';
          input.value = current;
          input.maxLength = 40;
          input.className = 'tab-label-input';
          tabLabelEl.replaceWith(input);
          input.focus();
          input.select();
          input.addEventListener('click', (ev) => ev.stopPropagation());
          const commit = () => {
            const value = input.value.trim();
            input.replaceWith(tabLabelEl);
            tabLabelEl.textContent = value || current;
            // a hand-picked name pins the tab; stop overwriting it with the
            // foreground process name
            const s = sessions.get(id);
            if (s && value) s.renamed = true;
          };
          input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') input.blur();
            if (ev.key === 'Escape') { input.value = current; input.blur(); }
          });
          input.addEventListener('blur', commit, { once: true });
        });
        tabsEl.appendChild(tabEl);

        const term = new Terminal({
          cursorBlink: true,
          scrollback: 5000,
          fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
          theme: {
            background: '#09090b',
            foreground: '#e4e4e7',
            cursor: '#2dd4bf',
            selectionBackground: 'rgba(45, 212, 191, .25)',
          },
        });
        const fitAddon = new FitAddon.FitAddon();
        const searchAddon = new SearchAddon.SearchAddon();
        term.loadAddon(fitAddon);
        term.loadAddon(searchAddon);
        term.open(pane);

        term.attachCustomKeyEventHandler((e) => {
          if (e.type !== 'keydown') return true;
          const mod = e.ctrlKey || e.metaKey;
          if (mod && e.key.toLowerCase() === 'f') {
            e.preventDefault();
            activateSession(id);
            openSearch();
            return false;
          }
          if (e.key === 'Escape' && searchBar.classList.contains('show')) {
            e.preventDefault();
            closeSearch();
            return false;
          }
          return true;
        });

        const session = {
          id, sid: existingSid || newSid(), term, fitAddon, searchAddon, ws: null, pane, tabEl,
          dot: tabEl.querySelector('.tab-dot'), closing: false, reconnectAttempts: 0, reconnectTimer: null,
          labelEl: tabLabelEl, renamed: false,
        };
        sessions.set(id, session);
        saveSids();
        updateEmptyState();
        updateNewTabBtn();

        // Fit before the first connect, not after: connectWs() reads
        // term.cols/rows to size the pty from the very first handshake. Without
        // this, a brand-new session's pty always starts at xterm.js's built-in
        // 80x24 default (not the real pane size) until the post-connect
        // fit()+resize catches up — a window a program that reads its column
        // count once at startup (instead of listening for resize) can fall
        // into permanently, rendering too wide for the rest of the session.
        fitAddon.fit();
        connectWs(session);

        term.onData((data) => sendInput(session, data));

        tabEl.addEventListener('click', (e) => {
          if (e.target.closest('.tab-close')) return;
          activateSession(id);
        });
        tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
          e.stopPropagation();
          // Closing sends {type:'kill'} and actually ends the shell (unlike a
          // dropped connection, which just waits out the reconnect grace
          // period) — worth an "are you sure" before that's irreversible.
          if (confirm(`关闭 "${tabLabelEl.textContent}"？这会结束里面正在跑的程序。`)) {
            closeSession(id);
          }
        });

        activateSession(id);
      }

      newTabBtn.addEventListener('click', () => createSession());

      // Debounced: mobile browsers can fire several resize/visualViewport
      // events in quick succession (address bar show/hide, keyboard open/close),
      // and fit()+resize() on every single one is what turns a single real
      // resize into a visible flicker.
      let resizeDebounce = null;
      const handleViewportResize = () => {
        clearTimeout(resizeDebounce);
        resizeDebounce = setTimeout(() => {
          const session = sessions.get(activeId);
          if (session) {
            session.fitAddon.fit();
            sendResize(session);
          }
        }, 80);
      };
      window.addEventListener('resize', handleViewportResize);
      if (window.visualViewport) {
        // the on-screen keyboard resizes the visible area without firing resize
        window.visualViewport.addEventListener('resize', handleViewportResize);
      }

      // Each open tab here is usually a different physical machine (a
      // separate token/link per webcli instance), so an accidental browser
      // tab close is easy to make and — without this — easy to not notice
      // until the reconnect grace period has already run out. The confirm
      // text itself is ignored by modern browsers (they show their own
      // generic "leave site?" wording), but setting returnValue is what
      // actually makes the prompt appear at all.
      window.addEventListener('beforeunload', (e) => {
        if (sessions.size > 0) {
          e.preventDefault();
          e.returnValue = '';
        }
      });

      // Waking from a locked phone or a dead access point should resume
      // immediately rather than waiting out the backoff.
      const resumeNow = () => {
        for (const session of sessions.values()) {
          if (session.closing) continue;
          if (!session.ws || session.ws.readyState > WebSocket.OPEN) {
            if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
            session.reconnectAttempts = 0;
            connectWs(session);
          }
        }
      };
      window.addEventListener('online', resumeNow);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') resumeNow();
      });

      // ---- share / QR ----
      const qrModal = document.getElementById('qr-modal');
      document.getElementById('qr-btn').addEventListener('click', async () => {
        qrModal.classList.add('show');
        document.getElementById('qr-box').innerHTML = '<p>生成中…</p>';
        try {
          const keyQ = secondaryKey ? `&key=${encodeURIComponent(secondaryKey)}` : '';
          const res = await fetch(`/api/share?token=${encodeURIComponent(token)}${keyQ}`);
          const data = await res.json();
          document.getElementById('qr-box').innerHTML = data.qr;
          document.getElementById('qr-url').textContent = data.url;
        } catch {
          document.getElementById('qr-box').innerHTML = '<p>获取失败</p>';
        }
      });
      document.getElementById('qr-close').addEventListener('click', () => qrModal.classList.remove('show'));
      qrModal.addEventListener('click', (e) => {
        if (e.target === qrModal) qrModal.classList.remove('show');
      });

      // ---- drag & drop upload ----
      (function wireDrop() {
        const hint = document.getElementById('drop-hint');
        let depth = 0;
        panesEl.addEventListener('dragenter', (e) => {
          e.preventDefault();
          if (++depth === 1) hint.classList.add('show');
        });
        panesEl.addEventListener('dragover', (e) => e.preventDefault());
        panesEl.addEventListener('dragleave', () => {
          if (--depth <= 0) { depth = 0; hint.classList.remove('show'); }
        });
        panesEl.addEventListener('drop', async (e) => {
          e.preventDefault();
          depth = 0;
          hint.classList.remove('show');
          for (const file of [...(e.dataTransfer.files || [])]) {
            const session = currentSession();
            try {
              const keyQ = secondaryKey ? `&key=${encodeURIComponent(secondaryKey)}` : '';
              const res = await fetch(`/api/upload?token=${encodeURIComponent(token)}${keyQ}`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/octet-stream',
                  'x-webcli-filename': encodeURIComponent(file.name),
                },
                body: file,
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || 'failed');
              if (session) session.term.write(`\r\n\x1b[36m[${t('uploaded')}] ${data.path}\x1b[0m\r\n`);
            } catch (err) {
              if (session) session.term.write(`\r\n\x1b[31m[${t('uploadFailed')}] ${err.message}\x1b[0m\r\n`);
            }
          }
        });
      })();

      if (location.protocol === 'https:' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      }

      // Reopen whatever is still running server-side; only fall back to a fresh
      // shell when there is nothing to resume.
      (async function restore() {
        let live = [];
        try {
          const keyQ = secondaryKey ? `&key=${encodeURIComponent(secondaryKey)}` : '';
          const res = await fetch(`/api/sessions?token=${encodeURIComponent(token)}${keyQ}`);
          if (res.ok) live = (await res.json()).sessions || [];
        } catch {}
        const known = new Set(loadSids());
        const resumable = live.filter((s) => known.has(s.sid)).sort((a, b) => a.createdAt - b.createdAt);
        if (resumable.length) {
          for (const s of resumable) createSession(s.sid);
        } else {
          createSession();
        }
      })();
      } // end initApp

      function startApp(secondaryKey) {
        if (localStorage.getItem(DEVICE_NAME_STORAGE) !== null) {
          initApp(secondaryKey);
          return;
        }
        const deviceGate = document.getElementById('device-gate');
        deviceGate.style.display = 'flex';
        const finish = (name) => {
          localStorage.setItem(DEVICE_NAME_STORAGE, name);
          deviceGate.style.display = 'none';
          initApp(secondaryKey);
        };
        document.getElementById('device-gate-form').addEventListener('submit', (e) => {
          e.preventDefault();
          finish(document.getElementById('device-input').value.trim().slice(0, 40));
        }, { once: true });
        document.getElementById('device-skip').addEventListener('click', () => finish(''), { once: true });
      }

      const SECONDARY_KEY_STORAGE = 'webcli-secondary-key';
      fetch('/api/auth-status').then((r) => r.json()).then(({ enabled }) => {
        if (!enabled) {
          startApp(null);
          return;
        }
        const stored = sessionStorage.getItem(SECONDARY_KEY_STORAGE);
        if (stored) {
          startApp(stored);
          return;
        }
        document.getElementById('key-gate').style.display = 'flex';
        document.getElementById('key-gate-form').addEventListener('submit', (e) => {
          e.preventDefault();
          const v = document.getElementById('key-input').value.trim();
          if (!v) return;
          sessionStorage.setItem(SECONDARY_KEY_STORAGE, v);
          document.getElementById('key-gate').style.display = 'none';
          startApp(v);
        });
      }).catch(() => startApp(null));
    }
