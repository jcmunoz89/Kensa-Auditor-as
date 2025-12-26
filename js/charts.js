// Charts helpers for Kensa Auditorías
console.log('Charts module loaded');

// --- Tooltip helpers ---
function ensureTooltip() {
    let tip = document.getElementById('kensaTooltip');
    if (!tip) {
        tip = document.createElement('div');
        tip.id = 'kensaTooltip';
        tip.className = 'kensa-tooltip hidden';
        tip.innerHTML = '<div class="ktt-title"></div><div class="ktt-body"></div>';
        document.body.appendChild(tip);
    }
    return tip;
}

function positionTooltip(tip, x, y) {
    const pad = 12;
    const r = tip.getBoundingClientRect();
    let left = x + 14;
    let top = y + 14;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (left + r.width + pad > vw) left = x - r.width - 14;
    if (top + r.height + pad > vh) top = y - r.height - 14;
    tip.style.left = `${Math.max(pad, left)}px`;
    tip.style.top = `${Math.max(pad, top)}px`;
}

function showTooltip(htmlTitle, htmlBody, x, y) {
    const tip = ensureTooltip();
    const titleEl = tip.querySelector('.ktt-title');
    const bodyEl = tip.querySelector('.ktt-body');
    if (titleEl) titleEl.innerHTML = htmlTitle || '';
    if (bodyEl) bodyEl.innerHTML = htmlBody || '';
    tip.classList.remove('hidden');
    positionTooltip(tip, x, y);
}

function hideTooltip() {
    const tip = document.getElementById('kensaTooltip');
    if (tip) tip.classList.add('hidden');
}

window.addEventListener('scroll', hideTooltip, { passive: true });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTooltip(); });

function bindTooltipElements(root) {
    const base = root || document;
    base.querySelectorAll('[data-tt-body]').forEach((el) => {
        el.addEventListener('mousemove', (e) => {
            showTooltip(el.dataset.ttTitle || '', el.dataset.ttBody || '', e.clientX, e.clientY);
        });
        el.addEventListener('mouseleave', hideTooltip);
    });
}

// --- Workshop Ranking Utilities ---
function normalizeWorkshopName(name) {
    return String(name || '')
        .replace(/\u00A0/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .trim();
}

function pickPreferredValuation(claim) {
    if (!claim || !Array.isArray(claim.valuations)) return null;
    const vals = claim.valuations;
    const preferredId = claim?.uiState?.lastValuationId || claim?.activeValuationId || null;
    if (preferredId) {
        const found = vals.find(v => v.id === preferredId);
        if (found) return found;
    }
    return vals[vals.length - 1] || vals[0] || null;
}

function getValuationParts(valuation) {
    if (!valuation) return [];
    if (Array.isArray(valuation.parts)) return valuation.parts;
    if (Array.isArray(valuation.items)) return valuation.items;
    return [];
}

function getAuditForValuation(claim, valuationId) {
    if (!claim || !valuationId) return null;
    return claim.auditByValuation ? claim.auditByValuation[valuationId] || null : null;
}

function parseAuditNumber(val) {
    if (val === null || val === undefined) return 0;
    const raw = String(val).trim().replace(/\s+/g, '');
    if (!raw) return 0;
    if (!raw.includes('.') && !raw.includes(',')) {
        const n = Number(raw.replace(/[^\d-]/g, ''));
        return Number.isFinite(n) ? n : 0;
    }
    const lastDot = raw.lastIndexOf('.');
    const lastComma = raw.lastIndexOf(',');
    const lastSep = Math.max(lastDot, lastComma);
    const hasDot = lastDot !== -1;
    const hasComma = lastComma !== -1;
    const intPartRaw = raw.slice(0, lastSep);
    const decPartRaw = raw.slice(lastSep + 1);
    if ((hasDot !== hasComma) && /^\d{3}$/.test(decPartRaw) && intPartRaw.replace(/[^\d]/g, '').length >= 1) {
        const digitsOnly = raw.replace(/[^\d-]/g, '');
        const n = Number(digitsOnly);
        return Number.isFinite(n) ? n : 0;
    }
    const intPart = intPartRaw.replace(/[^\d-]/g, '');
    const decPart = decPartRaw.replace(/[^\d]/g, '');
    const normalized = decPart ? `${intPart}.${decPart}` : intPart;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
}

function computeImpactCLP(valuation, audit) {
    if (!valuation || !audit || !Array.isArray(audit.lines)) return 0;
    return audit.lines
        .filter(line => !line.excluded)
        .reduce((acc, line) => {
            const orig = parseAuditNumber(line.precioOriginal);
            const des = parseAuditNumber(line.desabolladura);
            const pint = parseAuditNumber(line.pintura);
            const auditado = parseAuditNumber(line.precioAuditado);
            const sug = parseAuditNumber(line.sugerido);
            return acc + ((orig + des + pint) - (auditado + sug));
        }, 0);
}

function computeDeviationPct(subtotal, impactCLP) {
    const base = parseAuditNumber(subtotal);
    if (!base || !Number.isFinite(base) || base === 0) return 0;
    return (impactCLP / base) * 100;
}

function getSubtotalValuacionCLP(valuation) {
    if (!valuation) return 0;
    const econ = valuation.summary || valuation.economics || valuation.costSummary || {};
    const rawSubtotal = econ.subtotalValuation ?? econ.subtotalValoracion ?? econ.subtotal ?? null;
    const subtotal = typeof rawSubtotal === 'number' && Number.isFinite(rawSubtotal)
        ? rawSubtotal
        : Number(String(rawSubtotal || '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(subtotal) && subtotal > 0 ? subtotal : 0;
}

function computeEntityRanking(claims, opts = {}) {
    const {
        metric = 'riesgo',
        topN = 10,
        ufValue = 1,
        getEntityName = () => '',
        labelKey = 'name'
    } = opts;
    const map = new Map();

    (claims || []).forEach((claim) => {
        const nameRaw = getEntityName(claim) || '';
        const name = normalizeWorkshopName(nameRaw || 'Sin nombre');
        if (!name) return;
        const valuation = pickPreferredValuation(claim);
        if (!valuation) return;
        const audit = getAuditForValuation(claim, valuation.id);
        const subtotal = getSubtotalValuacionCLP(valuation);
        const impactCLP = computeImpactCLP(valuation, audit);
        const impactUF = ufValue > 0 ? impactCLP / ufValue : impactCLP;
        const deviationPct = subtotal > 0 ? (impactCLP / subtotal) * 100 : 0;
        const lines = (audit && Array.isArray(audit.lines)) ? audit.lines.filter(l => !l.excluded) : [];
        const resultRaw = (audit && audit.result) ? String(audit.result).toLowerCase() : '';
        let riskScore = 0;
        if (resultRaw.includes('aprobado')) riskScore += 10;
        else if (resultRaw.includes('revisar')) riskScore += 50;
        else if (resultRaw.includes('rechaz')) riskScore += 90;
        lines.forEach(line => {
            if ((line.observacion || '').trim()) {
                riskScore += 5;
            }
        });
        const criticalObs = new Set(['sin cobertura', 'declaración fraudulenta', 'declaracion fraudulenta', 'no corresponde']);
        const hallazgosCriticos = lines.filter(l => criticalObs.has(String(l.observacion || '').toLowerCase())).length;
        let accionesPend = lines.filter(l => (l.observacion || '').trim() && parseAuditNumber(l.sugerido) > 0).length;
        let hasRevisar = false;
        let hasRechazar = false;
        if (resultRaw.includes('revisar')) { accionesPend += 1; hasRevisar = true; }
        if (resultRaw.includes('rechaz')) { accionesPend += 1; hasRechazar = true; }

        const key = name.toLowerCase();
        if (!map.has(key)) {
            map.set(key, {
                [labelKey]: name,
                riskSum: 0,
                riskCount: 0,
                impactoUF: 0,
                ahorroUF: 0,
                desviacionSum: 0,
                desviacionCount: 0,
                hallazgos: 0,
                acciones: 0,
                countClaims: 0,
                extra: { revisar: 0, rechazar: 0 },
                claims: []
            });
        }
        const bucket = map.get(key);
        bucket.riskSum += riskScore;
        bucket.riskCount += 1;
        bucket.impactoUF += impactUF;
        bucket.ahorroUF += impactUF;
        bucket.desviacionSum += deviationPct;
        bucket.desviacionCount += deviationPct !== 0 ? 1 : 0;
        bucket.hallazgos += hallazgosCriticos;
        bucket.acciones += accionesPend;
        if (hasRevisar) bucket.extra.revisar += 1;
        if (hasRechazar) bucket.extra.rechazar += 1;
        bucket.countClaims += 1;
        bucket.claims.push({
            id: claim.id,
            result: audit?.result || '',
            impactUF,
            deviationPct,
            status: claim.status || '',
            date: claim.date || claim.createdAt || '',
            entity: name
        });
    });

    const rows = Array.from(map.values()).map(row => {
        const avgRisk = row.riskCount ? row.riskSum / row.riskCount : 0;
        const avgDev = row.desviacionCount ? row.desviacionSum / row.desviacionCount : 0;
        let value = 0;
        switch (metric) {
            case 'impacto':
                value = row.impactoUF;
                break;
            case 'ahorro':
                value = row.ahorroUF;
                break;
            case 'desviacion':
                value = avgDev;
                break;
            case 'hallazgos':
                value = row.hallazgos;
                break;
            case 'acciones':
                value = row.acciones;
                break;
            case 'riesgo':
            default:
                value = avgRisk;
                break;
        }
        return {
            ...row,
            value
        };
    }).filter(r => Number.isFinite(r.value));

    rows.sort((a, b) => b.value - a.value);
    return topN > 0 ? rows.slice(0, topN) : rows;
}

function computeWorkshopRanking(claims, opts = {}) {
    const metric = opts.metric || 'riesgo';
    const topN = Number(opts.topN) || 10;
    const ufVal = Number(opts.ufValue) || 1;
    return computeEntityRanking(claims, {
        metric,
        topN,
        ufValue: ufVal,
        getEntityName: (c) => c.workshop || c.taller || 'Sin taller',
        labelKey: 'workshop'
    });
}

function computeAdjusterRanking(claims, opts = {}) {
    const metric = opts.metric || 'riesgo';
    const topN = Number(opts.topN) || 10;
    const ufVal = Number(opts.ufValue) || 1;
    return computeEntityRanking(claims, {
        metric,
        topN,
        ufValue: ufVal,
        getEntityName: (c) => c.adjuster || c.liquidator || (c.pdfMapping?.liquidador) || 'Sin liquidador',
        labelKey: 'name'
    });
}

function renderWorkshopRankingChart(container, data, opts = {}) {
    if (!container) return;
    container.innerHTML = '';
    const metricLabel = opts.metricLabel || 'Valor';
    const formatFn = opts.formatFn || ((v) => v.toFixed(1));
    const onBarClick = opts.onBarClick || (() => {});

    if (!data || !data.length) {
        container.innerHTML = '<div class="empty-state">Sin datos para los filtros seleccionados.</div>';
        return;
    }
    const maxVal = Math.max(...data.map(d => Math.abs(d.value)), 1);
    const list = document.createElement('div');
    list.className = 'workshop-ranking';
    data.forEach((row) => {
        const item = document.createElement('div');
        item.className = 'ranking-row';
        const label = document.createElement('div');
        label.className = 'ranking-label';
        const rowLabel = row.workshop || row.name || row.entity || 'Sin nombre';
        label.textContent = rowLabel;
        const barWrap = document.createElement('div');
        barWrap.className = 'ranking-bar-wrap';
        const bar = document.createElement('div');
        bar.className = 'ranking-bar';
        const pct = Math.min(100, (Math.abs(row.value) / maxVal) * 100);
        bar.style.width = `${pct}%`;
        bar.dataset.workshop = rowLabel;
        bar.dataset.value = formatFn(row.value);
        bar.dataset.count = row.countClaims || 0;
        barWrap.appendChild(bar);
        const value = document.createElement('div');
        value.className = 'ranking-value';
        value.textContent = formatFn(row.value);
        item.appendChild(label);
        item.appendChild(barWrap);
        item.appendChild(value);
        item.addEventListener('click', () => onBarClick(row));
        item.addEventListener('mousemove', (e) => {
            const lastClaim = (row.claims || [])[0];
            const lastClaimTxt = lastClaim && lastClaim.id ? `${lastClaim.id} – ${lastClaim.date ? new Date(lastClaim.date).toLocaleDateString('es-CL') : ''}` : 'N/A';
            const riskCounts = (row.claims || []).filter(c => ((c.result || '').toLowerCase().includes('revisar') || (c.result || '').toLowerCase().includes('rechaz'))).length;
            const body = `
                <div class="ktt-row"><span>Métrica</span><b>${formatFn(row.value)}</b></div>
                <div class="ktt-row"><span>Siniestros considerados</span><b>${row.countClaims || 0}</b></div>
                <div class="ktt-row"><span>Revisar/Rechazado</span><b>${riskCounts} / ${row.countClaims || 0}</b></div>
                <div style="margin-top:6px;">Último siniestro: ${lastClaimTxt}</div>
            `;
            showTooltip(rowLabel, body, e.clientX, e.clientY);
        });
        item.addEventListener('mouseleave', hideTooltip);
        list.appendChild(item);
    });
    container.appendChild(list);
}

// --- Chart.js custom tooltip handler ---
function kensaChartTooltip(titlePrefix) {
    return {
        enabled: false,
        external: (context) => {
            const tooltip = context.tooltip;
            if (!tooltip || !tooltip.dataPoints || !tooltip.dataPoints.length) {
                hideTooltip();
                return;
            }
            const point = tooltip.dataPoints[0];
            const chart = context.chart;
            const type = chart?.config?.type || '';
            const label = point.label || point.dataset.label || titlePrefix || '';
            const rawVal = Number(point.raw || 0);
            const canvasRect = chart?.canvas?.getBoundingClientRect?.();
            const clientX = canvasRect ? canvasRect.left + tooltip.caretX : tooltip.caretX;
            const clientY = canvasRect ? canvasRect.top + tooltip.caretY : tooltip.caretY;
            let bodyHtml = '';
            if (type === 'doughnut' || type === 'pie') {
                const ds = chart.data.datasets?.[point.datasetIndex] || {};
                const total = (ds.data || []).reduce((a, b) => a + (Number(b) || 0), 0);
                const pct = total > 0 ? (rawVal / total) * 100 : 0;
                bodyHtml = `
                    <div class="ktt-row"><span>Ítems</span><b>${rawVal}</b></div>
                    <div class="ktt-row"><span>% del total</span><b>${pct.toFixed(1)}%</b></div>
                    <div class="ktt-row"><span>Fuente</span><b>Detalle de repuestos</b></div>
                `;
            } else {
                const val = point.formattedValue || rawVal || '';
                const bodyLines = (tooltip.body || []).flatMap(b => b.lines || []);
                bodyHtml = bodyLines.length
                    ? bodyLines.map(line => `<div>${line}</div>`).join('')
                    : `<div><b>${val}</b></div>`;
            }
            showTooltip(label, bodyHtml, clientX, clientY);
        }
    };
}

// expose globals
window.KensaCharts = window.KensaCharts || {};
window.KensaCharts.ensureTooltip = ensureTooltip;
window.KensaCharts.showTooltip = showTooltip;
window.KensaCharts.hideTooltip = hideTooltip;
window.KensaCharts.bindTooltipElements = bindTooltipElements;
window.KensaCharts.kensaChartTooltip = kensaChartTooltip;
