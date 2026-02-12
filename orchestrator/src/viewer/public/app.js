const TABS = [
    {id: 'overview', label: 'Overview'},
    {id: 'messages', label: 'Messages'},
    {id: 'transcript', label: 'Transcript'},
    {id: 'judge', label: 'Judge'},
    {id: 'logs', label: 'Logs'},
];

const state = {
    view: 'overview',
    turn: null,
    agent: '',
    selectedRun: '',
    runsRoot: '',
    runs: [],
    runData: null,
};

const tabsEl = document.getElementById('tabs');
const contentEl = document.getElementById('content');
const runPathEl = document.getElementById('run-path');
const runSelectEl = document.getElementById('run-select');

init().catch(error => {
    contentEl.innerHTML = `<div class="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-rose-200">Failed to load viewer: ${escapeHtml(String(error))}</div>`;
});

async function init() {
    restoreFromQuery();
    renderTabs();

    const runsResponse = await fetch('/api/runs');
    if (!runsResponse.ok) {
        const body = await runsResponse.json().catch(() => ({error: 'Unknown error'}));
        throw new Error(body.error || `HTTP ${runsResponse.status}`);
    }

    const runsPayload = await runsResponse.json();
    state.runsRoot = runsPayload.runs_root;
    state.runs = Array.isArray(runsPayload.runs) ? runsPayload.runs : [];

    if (state.runs.length === 0) {
        runSelectEl.innerHTML = '';
        runSelectEl.disabled = true;
        runPathEl.textContent = state.runsRoot;
        contentEl.innerHTML = emptyState(`No runs found in ${state.runsRoot}`);
        syncQuery();
        return;
    }

    const selected = state.runs.find(run => run.folder_name === state.selectedRun) || state.runs[0];
    state.selectedRun = selected.folder_name;

    renderRunSelector();
    await loadSelectedRun();
    renderView();
    syncQuery();

    runSelectEl.addEventListener('change', async event => {
        const target = event.target;
        if (!(target instanceof HTMLSelectElement)) {
            return;
        }

        state.selectedRun = target.value;
        state.turn = null;
        await loadSelectedRun();
        renderView();
        syncQuery();
    });
}

function restoreFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    const turn = params.get('turn');
    const agent = params.get('agent');
    const run = params.get('run');

    if (view && TABS.some(tab => tab.id === view)) {
        state.view = view;
    }
    if (turn) {
        const parsed = Number(turn);
        if (Number.isFinite(parsed) && parsed > 0) {
            state.turn = parsed;
        }
    }
    if (run) {
        state.selectedRun = run;
    }
    if (agent) {
        state.agent = agent;
    }
}

function syncQuery() {
    const params = new URLSearchParams(window.location.search);
    params.set('view', state.view);

    if (state.selectedRun) {
        params.set('run', state.selectedRun);
    } else {
        params.delete('run');
    }

    if (state.view === 'messages' && state.turn) {
        params.set('turn', String(state.turn));
    } else {
        params.delete('turn');
    }

    if (state.view === 'messages' && state.agent) {
        params.set('agent', state.agent);
    } else {
        params.delete('agent');
    }

    const query = params.toString();
    const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState(null, '', nextUrl);
}

function renderTabs() {
    tabsEl.innerHTML = '';

    for (const tab of TABS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = tab.label;
        button.className =
            tab.id === state.view
                ? 'rounded-full border border-cyan-300/40 bg-cyan-400/20 px-4 py-2 text-sm font-medium text-cyan-100'
                : 'rounded-full border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-300 hover:border-slate-500 hover:text-white';

        button.addEventListener('click', () => {
            state.view = tab.id;
            renderTabs();
            renderView();
            syncQuery();
        });

        tabsEl.appendChild(button);
    }
}

function renderRunSelector() {
    runSelectEl.disabled = false;
    runSelectEl.innerHTML = state.runs
        .map(run => {
            const endedAt = run.ended_at ? ` • ${run.ended_at}` : '';
            return `<option value="${escapeHtml(run.folder_name)}">${escapeHtml(run.folder_name)}${escapeHtml(endedAt)}</option>`;
        })
        .join('');

    runSelectEl.value = state.selectedRun;
}

async function loadSelectedRun() {
    const response = await fetch(`/api/run?run=${encodeURIComponent(state.selectedRun)}`);
    if (!response.ok) {
        const body = await response.json().catch(() => ({error: 'Unknown error'}));
        throw new Error(body.error || `HTTP ${response.status}`);
    }

    state.runData = await response.json();
    runPathEl.textContent = `${state.runsRoot} / ${state.selectedRun}`;

    const agentIds = getAgentIds(state.runData.messages);
    if (state.agent && !agentIds.includes(state.agent)) {
        state.agent = '';
    }

    if (!state.turn && state.runData.messages.length > 0) {
        state.turn = state.runData.messages[0].turn;
    }
}

function renderView() {
    if (!state.runData) {
        return;
    }

    if (state.view === 'overview') {
        renderOverview();
    } else if (state.view === 'messages') {
        renderMessages();
    } else if (state.view === 'transcript') {
        renderTranscript();
    } else if (state.view === 'judge') {
        renderJudge();
    } else {
        renderLogs();
    }
}

function renderOverview() {
    const run = state.runData.run || {};
    const agents = Array.isArray(run.agents) ? run.agents.length : 0;

    contentEl.innerHTML = `
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            ${statCard('Run ID', escapeHtml(run.run_id || '-'))}
            ${statCard('Stop Reason', escapeHtml(run.stop_reason || '-'))}
            ${statCard('Total Turns', String(run.total_turns || 0))}
            ${statCard('Agents', String(agents))}
        </div>
        <div class="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">Run Metadata</h2>
            <pre class="max-h-[60vh] overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs text-slate-200">${escapeHtml(JSON.stringify(run, null, 2))}</pre>
        </div>
    `;
}

function renderMessages() {
    const messages = state.runData.messages;
    const agentIds = getAgentIds(messages);
    const filteredMessages = state.agent
        ? messages.filter(message => message.speaker === state.agent)
        : messages;

    if (messages.length === 0) {
        contentEl.innerHTML = emptyState('No message files found in this run directory.');
        return;
    }

    if (filteredMessages.length === 0) {
        contentEl.innerHTML = emptyState('No messages for selected agent filter.');
        return;
    }

    const selected =
        filteredMessages.find(message => message.turn === state.turn) || filteredMessages[0];
    state.turn = selected.turn;

    const filterOptions = ['<option value="">All agents</option>']
        .concat(
            agentIds.map(
                agentId =>
                    `<option value="${escapeHtml(agentId)}" ${agentId === state.agent ? 'selected' : ''}>${escapeHtml(agentId)}</option>`
            )
        )
        .join('');

    const itemsHtml = filteredMessages
        .map(message => {
            const active = message.turn === selected.turn;
            return `
                <button
                    data-turn="${message.turn}"
                    class="message-item w-full rounded-lg border px-3 py-2 text-left transition ${
                        active
                            ? 'border-cyan-300/50 bg-cyan-400/20 text-cyan-50'
                            : 'border-slate-700 bg-slate-900/60 text-slate-200 hover:border-slate-500'
                    }"
                >
                    <div class="font-mono text-xs">${padTurn(message.turn)}</div>
                    <div class="text-sm font-medium">${escapeHtml(message.speaker)}</div>
                </button>
            `;
        })
        .join('');

    contentEl.innerHTML = `
        <div class="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
            <aside class="max-h-[70vh] space-y-2 overflow-auto pr-1">
                <label class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400" for="agent-filter">Filter by agent</label>
                <select id="agent-filter" class="mb-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-100 outline-none ring-cyan-400/50 focus:ring">
                    ${filterOptions}
                </select>
                ${itemsHtml}
            </aside>
            <section class="space-y-3">
                <div class="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-300">
                    <div><span class="font-semibold text-slate-200">Turn:</span> ${padTurn(selected.turn)}</div>
                    <div><span class="font-semibold text-slate-200">Speaker:</span> ${escapeHtml(selected.speaker)}</div>
                    <div><span class="font-semibold text-slate-200">Client:</span> ${escapeHtml(selected.client_id)}</div>
                    <div><span class="font-semibold text-slate-200">Created:</span> ${escapeHtml(selected.created_at)}</div>
                </div>
                <article class="prose prose-slate max-w-none prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-code:font-mono max-h-[70vh] overflow-auto rounded-lg border border-slate-800 bg-white p-5 text-slate-900">${selected.html}</article>
            </section>
        </div>
    `;

    for (const button of contentEl.querySelectorAll('.message-item')) {
        button.addEventListener('click', () => {
            const turn = Number(button.getAttribute('data-turn'));
            state.turn = turn;
            renderMessages();
            syncQuery();
        });
    }

    const filterSelect = contentEl.querySelector('#agent-filter');
    if (filterSelect instanceof HTMLSelectElement) {
        filterSelect.addEventListener('change', event => {
            const target = event.target;
            if (!(target instanceof HTMLSelectElement)) {
                return;
            }

            state.agent = target.value;
            state.turn = null;
            renderMessages();
            syncQuery();
        });
    }
}

function getAgentIds(messages) {
    const ids = new Set();
    for (const message of messages) {
        ids.add(message.speaker);
    }
    return Array.from(ids).sort((a, b) => a.localeCompare(b));
}

function renderTranscript() {
    const transcript = state.runData.transcript;
    if (!transcript.markdown.trim()) {
        contentEl.innerHTML = emptyState('transcript.md is empty.');
        return;
    }

    contentEl.innerHTML = `
        <article class="prose prose-slate max-w-none prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-code:font-mono max-h-[75vh] overflow-auto rounded-lg border border-slate-800 bg-white p-6 text-slate-900">${transcript.html}</article>
    `;
}

function renderJudge() {
    const records = state.runData.judge;
    if (records.length === 0) {
        contentEl.innerHTML = emptyState('No judge records were found for this run.');
        return;
    }

    const cards = records
        .map(record => {
            const scores = Object.entries(record.scores || {})
                .map(
                    ([agent, score]) =>
                        `<span class="rounded bg-slate-800 px-2 py-1 text-xs">${escapeHtml(agent)}: ${score}</span>`
                )
                .join(' ');

            const summaryBlock = record.summary
                ? `<details class="mt-3 rounded border border-slate-700 bg-slate-950/60 p-3">
                        <summary class="cursor-pointer text-sm font-medium text-slate-100">Round Summary</summary>
                        <pre class="mt-3 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs text-slate-300">${escapeHtml(record.summary.rolling_summary)}</pre>
                   </details>`
                : '';

            return `
                <article class="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                    <div class="mb-2 flex items-center justify-between gap-3">
                        <h3 class="font-semibold text-slate-100">Turn ${padTurn(record.turn)}</h3>
                        <span class="rounded-full px-2 py-1 text-xs ${
                            record.should_stop
                                ? 'bg-amber-500/20 text-amber-100'
                                : 'bg-emerald-500/20 text-emerald-100'
                        }">${record.should_stop ? 'Stop' : 'Continue'}</span>
                    </div>
                    <p class="mb-3 text-xs text-slate-400">${escapeHtml(record.created_at)}</p>
                    <div class="mb-3 flex flex-wrap gap-2">${scores}</div>
                    <p class="text-sm leading-6 text-slate-200">${escapeHtml(record.reason)}</p>
                    ${summaryBlock}
                </article>
            `;
        })
        .join('');

    contentEl.innerHTML = `<div class="space-y-4">${cards}</div>`;
}

function renderLogs() {
    const logs = state.runData.logs;
    if (logs.length === 0) {
        contentEl.innerHTML = emptyState('No logs.jsonl entries found.');
        return;
    }

    const rows = logs
        .map(log => {
            const detail = log.error || (log.data ? JSON.stringify(log.data) : '');
            return `
                <tr class="border-b border-slate-800/80">
                    <td class="px-3 py-2 font-mono text-xs text-slate-400">${escapeHtml(log.timestamp)}</td>
                    <td class="px-3 py-2 text-xs uppercase text-slate-200">${escapeHtml(log.level)}</td>
                    <td class="px-3 py-2 text-xs text-slate-200">${escapeHtml(log.category)}</td>
                    <td class="px-3 py-2 text-xs text-slate-200">${escapeHtml(log.event)}</td>
                    <td class="px-3 py-2 font-mono text-xs text-slate-300">${escapeHtml(detail)}</td>
                </tr>
            `;
        })
        .join('');

    contentEl.innerHTML = `
        <div class="max-h-[75vh] overflow-auto rounded-xl border border-slate-800">
            <table class="min-w-full border-collapse">
                <thead class="sticky top-0 bg-slate-900">
                    <tr class="border-b border-slate-700">
                        <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-300">Timestamp</th>
                        <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-300">Level</th>
                        <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-300">Category</th>
                        <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-300">Event</th>
                        <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-300">Data</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function padTurn(turn) {
    return String(turn).padStart(4, '0');
}

function statCard(label, value) {
    return `
        <div class="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <p class="mb-1 text-xs uppercase tracking-wide text-slate-400">${label}</p>
            <p class="text-lg font-semibold text-slate-100">${value}</p>
        </div>
    `;
}

function emptyState(message) {
    return `<div class="rounded-xl border border-slate-700 bg-slate-900/50 p-5 text-slate-300">${escapeHtml(message)}</div>`;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
