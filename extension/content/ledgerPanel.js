// extension/content/ledgerPanel.js
//
// Sidebar UI for the Conversation State Ledger.
//
// Shows CURRENT STATE, not a chronological summary: what we are trying to do, what
// we are doing now, what is settled, and what to pick up next.
(() => {
    window.CGPT_NAV = window.CGPT_NAV || {};
    const {dom, ledgerState} = window.CGPT_NAV;

    const PANEL_ID = 'cgpt-nav-ledger';

    let open = false;
    let showHistory = false;
    let unsubscribe = null;

    function panelEl() {
        return document.getElementById(PANEL_ID);
    }

    function bodyEl() {
        return dom.$('#cgpt-nav-ledger-body');
    }

    /**
     * Format an ISO timestamp for display in local time.
     * @param {string|null} iso
     * @returns {string}
     */
    function formatStamp(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '—';

        const pad = n => String(n).padStart(2, '0');
        return (
            `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
            `${pad(d.getHours())}:${pad(d.getMinutes())}`
        );
    }

    function makeSection(label, value) {
        const wrap = document.createElement('div');
        wrap.className = 'ledger-section';

        const head = document.createElement('div');
        head.className = 'ledger-label';
        head.textContent = label;
        wrap.appendChild(head);

        if (Array.isArray(value)) {
            if (value.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'ledger-empty';
                empty.textContent = '—';
                wrap.appendChild(empty);
                return wrap;
            }

            const ul = document.createElement('ul');
            ul.className = 'ledger-list';
            for (const item of value) {
                const li = document.createElement('li');
                li.textContent = item;
                ul.appendChild(li);
            }
            wrap.appendChild(ul);
            return wrap;
        }

        const text = document.createElement('div');
        text.className = value ? 'ledger-text' : 'ledger-empty';
        text.textContent = value || '—';
        wrap.appendChild(text);
        return wrap;
    }

    function renderStatus(snapshot) {
        const el = document.createElement('div');
        el.className = `ledger-status ledger-status-${snapshot.status}`;

        const labels = {
            idle: 'Ready',
            interpreting: 'Interpreting…',
            local_only: 'Local only',
            error: 'Error',
        };

        el.textContent = snapshot.statusDetail
            ? `${labels[snapshot.status] || snapshot.status} · ${snapshot.statusDetail}`
            : labels[snapshot.status] || snapshot.status;

        return el;
    }

    function renderResume(snapshot) {
        const {state, checkpoints} = snapshot;
        const latest = checkpoints.length ? checkpoints[checkpoints.length - 1] : null;

        const wrap = document.createElement('div');
        wrap.className = 'ledger-resume';

        const head = document.createElement('div');
        head.className = 'ledger-resume-head';
        head.textContent = latest
            ? `Resume · last checkpoint ${formatStamp(latest.at)}`
            : 'Resume · no checkpoint yet';
        wrap.appendChild(head);

        const next = document.createElement('div');
        next.className = state.next ? 'ledger-resume-next' : 'ledger-empty';
        next.textContent = state.next || 'Nothing recorded yet';
        wrap.appendChild(next);

        return wrap;
    }

    function renderBranches(state) {
        if (!state.branches.length) return null;

        const wrap = document.createElement('div');
        wrap.className = 'ledger-branches';

        const head = document.createElement('div');
        head.className = 'ledger-label';
        head.textContent = 'POSSIBLE BRANCH';
        wrap.appendChild(head);

        const ul = document.createElement('ul');
        ul.className = 'ledger-list';
        for (const b of state.branches) {
            const li = document.createElement('li');
            li.textContent = b;
            ul.appendChild(li);
        }
        wrap.appendChild(ul);

        return wrap;
    }

    function renderHistory(snapshot) {
        const wrap = document.createElement('div');
        wrap.className = 'ledger-history';

        const toggle = document.createElement('button');
        toggle.className = 'ledger-history-toggle';
        toggle.textContent = showHistory
            ? `▾ Checkpoint history (${snapshot.checkpoints.length})`
            : `▸ Checkpoint history (${snapshot.checkpoints.length})`;
        toggle.addEventListener('click', () => {
            showHistory = !showHistory;
            render(ledgerState.getSnapshot());
        });
        wrap.appendChild(toggle);

        if (!showHistory) return wrap;

        const list = document.createElement('div');
        list.className = 'ledger-history-list';

        for (let i = snapshot.checkpoints.length - 1; i >= 0; i--) {
            const cp = snapshot.checkpoints[i];

            const item = document.createElement('div');
            item.className = 'ledger-history-item';

            const stamp = document.createElement('div');
            stamp.className = 'ledger-history-stamp';
            stamp.textContent = `${formatStamp(cp.at)} · ${cp.trigger}`;
            item.appendChild(stamp);

            if (cp.reason) {
                const reason = document.createElement('div');
                reason.className = 'ledger-history-reason';
                reason.textContent = cp.reason;
                item.appendChild(reason);
            }

            const focus = document.createElement('div');
            focus.className = 'ledger-history-focus';
            focus.textContent = cp.state?.current_focus || cp.state?.goal || '—';
            item.appendChild(focus);

            if (cp.state?.next) {
                const nx = document.createElement('div');
                nx.className = 'ledger-history-next';
                nx.textContent = `NEXT: ${cp.state.next}`;
                item.appendChild(nx);
            }

            list.appendChild(item);
        }

        wrap.appendChild(list);
        return wrap;
    }

    /**
     * @param {object} snapshot
     */
    function render(snapshot) {
        const body = bodyEl();
        if (!body || !snapshot) return;

        body.innerHTML = '';

        if (!open) return;

        body.appendChild(renderStatus(snapshot));
        body.appendChild(renderResume(snapshot));

        const {state} = snapshot;

        body.appendChild(makeSection('GOAL', state.goal));
        body.appendChild(makeSection('NOW', state.current_focus));
        body.appendChild(makeSection('CONFIRMED', state.confirmed));
        body.appendChild(makeSection('DECISIONS', state.decisions));
        body.appendChild(makeSection('OPEN', state.open_questions));
        body.appendChild(makeSection('NEXT', state.next));

        if (state.assumptions.length) {
            body.appendChild(makeSection('ASSUMPTIONS', state.assumptions));
        }
        if (state.rejected.length) {
            body.appendChild(makeSection('REJECTED', state.rejected));
        }

        const branches = renderBranches(state);
        if (branches) body.appendChild(branches);

        body.appendChild(renderHistory(snapshot));
    }

    function setOpen(next) {
        open = !!next;

        const chevron = dom.$('#cgpt-nav-ledger-chevron');
        if (chevron) chevron.textContent = open ? '▾' : '▸';

        // Visibility is driven by the `.open` class, matching the prompts section.
        // Clearing an inline style would only fall back to `display: none`.
        panelEl()?.classList.toggle('open', open);

        render(ledgerState.getSnapshot());
    }

    /**
     * Wire the panel that sidebar.js put in the DOM.
     */
    function mount() {
        const panel = panelEl();
        if (!panel || panel.dataset.cgptNavMounted === '1') return;
        panel.dataset.cgptNavMounted = '1';

        panel.querySelector('.ledger-title')?.addEventListener('click', ev => {
            ev.preventDefault();
            ev.stopPropagation();
            setOpen(!open);
        });

        panel.querySelector('.ledger-right')?.addEventListener('click', ev => {
            ev.stopPropagation();
        });

        const checkpointBtn = dom.$('#cgpt-nav-ledger-checkpoint');
        checkpointBtn?.addEventListener('click', async () => {
            checkpointBtn.disabled = true;
            try {
                if (!open) setOpen(true);
                await ledgerState.createManualCheckpoint();
            } finally {
                checkpointBtn.disabled = false;
            }
        });

        const idInput = dom.$('#cgpt-nav-ledger-client-id');
        if (idInput) {
            ledgerState.getInterpreterClientId().then(v => {
                if (v && !idInput.value) idInput.value = v;
            });
            idInput.addEventListener('change', () => {
                ledgerState.setInterpreterClientId(idInput.value);
            });
        }

        if (unsubscribe) unsubscribe();
        unsubscribe = ledgerState.subscribe(render);

        setOpen(open);
    }

    window.CGPT_NAV.ledgerPanel = {
        mount,
        render,
        setOpen,
        formatStamp,
    };
})();
