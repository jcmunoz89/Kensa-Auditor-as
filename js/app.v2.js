// Local storage helpers for external valuations
const VALUATION_STORAGE_KEY = 'kensaExternalValuations';
const CLAIMS_STORAGE_KEY = 'kensaAuditorias_claims';
const CLIENTES_STORAGE_KEY = 'kensaAud_clientes';
const USUARIOS_STORAGE_KEY = 'kensaAud_usuarios';
const UF_VALUE = 36000; // Valor UF referencial para cálculos de ahorro

// Paginado para sección Siniestros
let claimsState = [];
let claimsPageSize = 8;
let claimsCurrentPage = 1;
let selectedClaimIds = new Set();
let claimDetailDirty = false;
let claimDetailActiveTab = 'photos';
let claimDetailActiveValuationId = null;
let currentAuditClaim = null;
let isClaimDetailView = false;
let syncAuditModelFn = null;
let ensureAuditDataFn = null;
let claimDetailDirtyBound = false;
let claimsFilterWorkshop = '';
let dashboardFilterStart = '';
let dashboardFilterEnd = '';
let dashboardFilterAdjuster = '';
let dashboardFilterValuator = '';
let dashboardFilterWorkshop = '';
let dashboardFilterCity = '';
let dashboardFiltersOpen = false;
let dashboardRankingMetric = 'riesgo';
let dashboardRankingTop = 10;
let dashboardAdjusterRankingMetric = 'desviacion';
let dashboardAdjusterRankingTop = 10;
let dashboardResultsPageSize = 5;
let dashboardResultsPage = 1;

// Estado Clientes
let clientesState = [];
let clientesPageSize = 8;
let clientesCurrentPage = 1;
let clienteEnEdicionId = null;
let clientesSearchText = '';
let clientesFilterEstado = 'TODOS';
let clienteLogoTemp = null;
let clienteLogoAuditorTemp = null;
let bitacoraActiveFilter = null;
let analysisToastTimers = [];
let photoViewerState = null;
let photoViewerRefs = null;
function showAnalysisToast() {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    // Reiniciar timers previos y preparar overlay + contenedor limpio
    if (analysisToastTimers.length) {
        analysisToastTimers.forEach(t => clearTimeout(t));
        analysisToastTimers = [];
    }
    container.innerHTML = '<div class="toast-backdrop"></div>';
    container.style.pointerEvents = 'auto';

    const toast = document.createElement('div');
    toast.className = 'toast-analysis toast-analysis--enter';
    toast.innerHTML = `
        <div class="toast-analysis__header">
            <span class="toast-analysis__title">Procesando siniestro</span>
            <span class="toast-analysis__badge">IA Smart Scanner</span>
        </div>
        <div class="toast-analysis__status" id="toastAnalysisStatus">
            Analizando datos
        </div>
        <div class="toast-analysis__bars">
            <div class="toast-bar"><div class="toast-bar__fill" id="toastBarFill1"></div></div>
            <div class="toast-bar"><div class="toast-bar__fill" id="toastBarFill2"></div></div>
            <div class="toast-bar"><div class="toast-bar__fill" id="toastBarFill3"></div></div>
        </div>
        <div class="toast-analysis__hint">
            No cierres esta ventana, estamos preparando la auditoría.
        </div>
    `;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('toast-analysis--visible'));

    const statusEl = toast.querySelector('#toastAnalysisStatus');
    const bar1 = toast.querySelector('#toastBarFill1');
    const bar2 = toast.querySelector('#toastBarFill2');
    const bar3 = toast.querySelector('#toastBarFill3');

    if (statusEl) statusEl.textContent = 'Analizando datos';
    if (bar1) { bar1.style.transition = 'width 3s ease-out'; bar1.style.width = '100%'; }
    if (bar2) { bar2.style.transition = 'width 5s ease-out'; bar2.style.width = '70%'; }
    if (bar3) { bar3.style.transition = 'width 7s ease-out'; bar3.style.width = '40%'; }

    analysisToastTimers.push(setTimeout(() => {
        if (statusEl) statusEl.textContent = 'Verificando variables';
        if (bar2) { bar2.style.transition = 'width 2s ease-out'; bar2.style.width = '100%'; }
    }, 3000));

    analysisToastTimers.push(setTimeout(() => {
        if (statusEl) statusEl.textContent = 'Análisis completo';
        if (bar3) { bar3.style.transition = 'width 2s ease-out'; bar3.style.width = '100%'; }
    }, 5000));

    analysisToastTimers.push(setTimeout(hideAnalysisToast, 7000));
}

function hideAnalysisToast() {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = container.querySelector('.toast-analysis');
    if (analysisToastTimers.length) {
        analysisToastTimers.forEach(t => clearTimeout(t));
        analysisToastTimers = [];
    }
    if (toast) toast.classList.add('toast-analysis--exit');
    setTimeout(() => {
        container.innerHTML = '';
        container.style.pointerEvents = 'none';
    }, 200);
}

// Estado Usuarios
let usuariosState = [];
let usuariosPageSize = 8;
let usuariosCurrentPage = 1;
let usuarioEnEdicionId = null;
let usuariosSearchText = '';
let usuariosFilterRol = 'TODOS';
let usuariosFilterEstado = 'TODOS';

function buildValuationSignature(claimNumber, summary) {
    if (!summary) return '';
    return JSON.stringify({
        claimNumber,
        carroceria: summary.bodyworkValue ?? summary.carroceria ?? null,
        mecatronica: summary.mechatronicsValue ?? summary.mecatronica ?? null,
        valorRepuestos: summary.partsValueNet ?? summary.valorRepuestos ?? null,
        valorManoObra: summary.laborValueNet ?? summary.valorManoObra ?? null,
        subtotalValoracion: summary.subtotalValuation ?? summary.subtotalValoracion ?? null
    });
}

function formatDateTime(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');

    return `${day}-${month}-${year} ${hours}:${minutes}`;
}

function formatDateTimeSplit(value) {
    const base = formatDateTime(value);
    if (base === '-') return { date: '-', time: '' };
    const [datePart, timePart] = base.split(' ');
    return { date: datePart || '-', time: timePart || '' };
}

function loadClaimsFromStorage() {
    try {
        const raw = localStorage.getItem(CLAIMS_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                claimsState = parsed;
                return;
            }
        }
    } catch (err) {
        console.warn('No se pudieron cargar siniestros desde localStorage:', err);
    }

    if (window.MOCK_DATA && Array.isArray(MOCK_DATA.claims)) {
        claimsState = [...MOCK_DATA.claims];
        saveClaimsToStorage();
    } else {
        claimsState = [];
    }
}

function saveClaimsToStorage() {
    try {
        localStorage.setItem(CLAIMS_STORAGE_KEY, JSON.stringify(claimsState));
    } catch (err) {
        console.warn('No se pudieron guardar siniestros en localStorage:', err);
    }
}

const debouncedSaveClaimsToStorage = (() => {
    let t = null;
    return () => {
        if (t) clearTimeout(t);
        t = setTimeout(() => {
            if (currentAuditClaim && claimDetailDirty) {
                touchClaimUpdatedAt(currentAuditClaim);
            }
            saveClaimsToStorage();
            t = null;
        }, 250);
    };
})();

const fmtCLP = (n) => {
    const num = Number(n);
    if (!Number.isFinite(num)) return '$0';
    return `$${num.toLocaleString('es-CL')}`;
};

const fmtHH = (n) => {
    const num = Number(n);
    if (!Number.isFinite(num)) return '0,0';
    return num.toLocaleString('es-CL', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
};

// Parser tolerante para montos de auditoría (miles con punto/coma y decimales)
function parseAuditNumber(val) {
    if (val === null || val === undefined) return 0;
    const raw = String(val).trim().replace(/\s+/g, '');
    if (!raw) return 0;

    // Si no hay separadores, intentamos directo
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

    // Si hay un solo tipo de separador y va seguido de 3 dígitos, lo tratamos como miles (ej: 350.000)
    if ((hasDot !== hasComma) && /^\d{3}$/.test(decPartRaw) && intPartRaw.replace(/[^\d]/g, '').length >= 1) {
        const digitsOnly = raw.replace(/[^\d-]/g, '');
        const n = Number(digitsOnly);
        return Number.isFinite(n) ? n : 0;
    }

    // Caso decimal: conservar solo el último separador como decimal y limpiar el resto
    const intPart = intPartRaw.replace(/[^\d-]/g, '');
    const decPart = decPartRaw.replace(/[^\d]/g, '');
    const normalized = decPart ? `${intPart}.${decPart}` : intPart;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
}

function touchClaimUpdatedAt(claim, iso) {
    if (!claim) return;
    claim.updatedAt = iso || new Date().toISOString();
}

function parseDateValue(val) {
    if (!val) return null;
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeWorkshopName(name) {
    return String(name || '')
        .replace(/\u00A0/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .trim();
}

function workshopKey(name) {
    return normalizeWorkshopName(name).toLowerCase();
}

function getWorkshopsFromClaims(claims) {
    const map = new Map();
    (claims || []).forEach((c) => {
        const raw = c.workshop || c.taller || '';
        const display = normalizeWorkshopName(raw);
        if (!display || display === '-') return;
        const key = workshopKey(display);
        if (!map.has(key)) {
            map.set(key, display);
        }
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'es'));
}

function getCurrentUserSafe() {
    try {
        const raw = localStorage.getItem('kensaAud_currentUser');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.id) {
                return {
                    id: parsed.id,
                    name: parsed.name || parsed.fullName || 'Usuario',
                    role: parsed.role || parsed.rol || ''
                };
            }
        }
    } catch (err) {
        console.warn('No se pudo obtener usuario actual, usando anon.', err);
    }
    return { id: 'anon', name: 'Usuario', role: '' };
}

function addBitacoraEvent(claim, { type, message, meta }) {
    if (!claim) return;
    const user = getCurrentUserSafe();
    claim.bitacora = claim.bitacora || [];
    const last = claim.bitacora[0];
    if (type === 'view' && last && last.type === 'view' && last.user?.id === user.id) {
        const lastTs = new Date(last.ts).getTime();
        if (!Number.isNaN(lastTs) && (Date.now() - lastTs) < 5000) {
            return;
        }
    }
    claim.bitacora.unshift({
        id: `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        ts: new Date().toISOString(),
        user,
        type,
        message,
        meta: meta || {}
    });
    if (type !== 'view') {
        touchClaimUpdatedAt(claim);
    }
    saveClaimsToStorage();
}

function renderBitacora(claim) {
    const list = document.getElementById('bitacoraList');
    if (!list) return;
    const items = claim?.bitacora || [];
    let filtered = items;
    if (bitacoraActiveFilter === 'status') {
        filtered = items.filter(evt => evt.type === 'status');
    } else if (bitacoraActiveFilter === 'view') {
        filtered = items.filter(evt => evt.type === 'view');
    } else if (bitacoraActiveFilter === 'comment') {
        filtered = items.filter(evt => evt.type === 'comment' || evt.type === 'photo');
    }
    if (!items.length) {
        list.innerHTML = '<div class="bitacora-empty">Sin registros aún.</div>';
        return;
    }
    list.innerHTML = filtered.map(evt => `
        <div class="bitacora-item" data-type="${evt.type}">
            <div class="bitacora-meta">
                <span class="bitacora-user">${escapeHtml(evt.user?.name || 'Usuario')}</span>
                <span class="bitacora-time">${formatDateTime(evt.ts)}</span>
            </div>
            <div class="bitacora-message">${escapeHtml(evt.message || '')}</div>
        </div>
    `).join('');
}

function commitClaimDetailEdits(claimId, opts = {}) {
    const claim = claimsState.find(c => c.id === claimId);
    const contentAreaEl = document.getElementById('content-area') || document.getElementById('contentArea') || contentArea;
    if (!claim || !contentAreaEl) {
        return { changed: false };
    }

    // Forzar commit del input activo
    const activeEl = document.activeElement;
    if (activeEl && contentAreaEl.contains(activeEl)) {
        const tag = activeEl.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
            activeEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (typeof activeEl.blur === 'function') {
            activeEl.blur();
        }
    }

    const activeTab = claimDetailActiveTab || 'photos';
    if (activeTab !== 'auditar') {
        return { changed: false };
    }

    const auditValSelect = document.getElementById('auditValuationSelect');
    const valId = auditValSelect ? auditValSelect.value : claimDetailActiveValuationId;
    if (!valId) return { changed: false };
    const valuation = (claim.valuations || []).find(v => v.id === valId);
    if (!valuation) return { changed: false };

    if (typeof ensureAuditDataFn !== 'function') return { changed: false };
    const audit = ensureAuditDataFn(valId, valuation);
    let mutated = false;

    const resultSelect = document.getElementById('auditResultSelect');
    if (resultSelect && audit.result !== resultSelect.value) {
        audit.result = resultSelect.value || '';
        mutated = true;
    }

    const settleEl = document.getElementById('auditSettlementComment');
    if (settleEl && audit.settlementComment !== settleEl.value) {
        audit.settlementComment = settleEl.value || '';
        mutated = true;
    }
    const techEl = document.getElementById('auditTechnicalComment');
    if (techEl && audit.technicalComment !== techEl.value) {
        audit.technicalComment = techEl.value || '';
        mutated = true;
    }

    const paintSelect = document.getElementById('auditPaintSelect');
    if (paintSelect && audit.pinturaTipo !== paintSelect.value) {
        audit.pinturaTipo = paintSelect.value || 'BICAPA';
        mutated = true;
    }

    const checklistEl = document.getElementById('auditChecklist');
    if (checklistEl) {
        checklistEl.querySelectorAll('input[type="checkbox"]').forEach((chk) => {
            const key = chk.getAttribute('name') || chk.dataset.key || chk.value;
            if (key) {
                const prev = !!audit.checklist[key];
                const next = !!chk.checked;
                if (prev !== next) mutated = true;
                audit.checklist[key] = next;
            }
        });
    }

    const tbody = document.getElementById('auditLinesBody');
    if (tbody && Array.isArray(audit.lines)) {
        const rows = Array.from(tbody.querySelectorAll('tr'));
        rows.forEach((tr) => {
            const lineId = tr.dataset.lineId || tr.dataset.lineid;
            if (!lineId) return;
            const line = audit.lines.find(l => String(l.id) === String(lineId));
            if (!line) return;
            const getNum = (field) => {
                const el = tr.querySelector(`[data-field="${field}"]`);
                if (!el) return null;
                const val = parseAuditNumber(el.value);
                return Number.isFinite(val) ? val : null;
            };
            const getText = (field) => {
                const el = tr.querySelector(`[data-field="${field}"]`);
                return el ? el.value || '' : '';
            };
            const precioVal = getNum('precioAuditado');
            const desVal = getNum('desabolladura');
            const pintVal = getNum('pintura');
            const sugVal = getNum('sugerido');
            const obsVal = getText('observacion');
            const obsRepVal = getText('observacionRepuestos');
            const mecVal = getNum('mecanica');
            const dymVal = getNum('dym');

            if (precioVal !== null && precioVal !== line.precioAuditado) { line.precioAuditado = precioVal; mutated = true; }
            if (desVal !== null && desVal !== line.desabolladura) { line.desabolladura = desVal; mutated = true; }
            if (pintVal !== null && pintVal !== line.pintura) { line.pintura = pintVal; mutated = true; }
            if (sugVal !== null && sugVal !== line.sugerido) { line.sugerido = sugVal; mutated = true; }
            if (obsVal !== undefined && obsVal !== line.observacion) { line.observacion = obsVal; mutated = true; }
            if (obsRepVal !== undefined && obsRepVal !== line.observacionRepuestos) { line.observacionRepuestos = obsRepVal; mutated = true; }
            if (mecVal !== null && mecVal !== line.mecanica) { line.mecanica = mecVal; mutated = true; }
            if (dymVal !== null && dymVal !== line.dym) { line.dym = dymVal; mutated = true; }
        });
    }

    if (mutated) {
        touchClaimUpdatedAt(claim);
    }
    return { changed: mutated };
}

function getClientForClaim(claim) {
    if (!claim) return null;
    if (!clientesState || !clientesState.length) return null;
    if (claim.clientId) {
        const found = clientesState.find(c => c.id === claim.clientId);
        if (found) return found;
    }
    return clientesState[0] || null;
}

function getClientRates(client) {
    if (!client) return { hhMO: 0, hhPinBicapa: 0, hhPinTricapa: 0, paintMode: 'BICAPA' };
    const toNum = (v) => {
        const n = Number(String(v ?? '').replace(',', '.'));
        return Number.isFinite(n) ? n : 0;
    };
    const paintModeRaw = (client.paintMode || client.paintmode || client.pinturaTipo || client.paintType || 'BICAPA').toString().toUpperCase();
    return {
        hhMO: toNum(client.hhMo),
        hhPinBicapa: toNum(client.hhPinBicapa),
        hhPinTricapa: toNum(client.hhPinTricapa),
        paintMode: paintModeRaw === 'TRICAPA' ? 'TRICAPA' : 'BICAPA'
    };
}

let kensaQrDataUrlCache = null;
async function getKensaQrDataUrl() {
    if (kensaQrDataUrlCache) return kensaQrDataUrlCache;
    try {
        const resp = await fetch('https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=https://www.kensa.cl/', { cache: 'force-cache' });
        if (!resp.ok) throw new Error('QR fetch failed');
        const blob = await resp.blob();
        const reader = new FileReader();
        const done = new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result);
        });
        reader.readAsDataURL(blob);
        kensaQrDataUrlCache = await done;
        return kensaQrDataUrlCache;
    } catch (err) {
        console.warn('No se pudo obtener QR de Kensa', err);
        kensaQrDataUrlCache = null;
        return null;
    }
}

function buildBudgetModel({ claim, valuation, audit, rates }) {
    const hhMO = rates.hhMO || 0;
    const hhPinSel = rates.paintMode === 'TRICAPA' ? rates.hhPinTricapa : rates.hhPinBicapa;
    const hhPin = hhPinSel || 0;
    const workRows = [];
    let totalMecHH = 0, totalDymHH = 0, totalRepHH = 0, totalPintHH = 0;
    let totalMecCLP = 0, totalDymCLP = 0, totalRepCLP = 0, totalPintCLP = 0;

    (audit.lines || []).forEach((line) => {
        const pieza = line.repuestoTrabajo || '';
        const accion = line.accion || '';
        const mecCLP = Number(line.mecanica) || 0;
        const dymCLP = Number(line.desabolladura) || 0;
        const repCLP = Number(line.sugerido) || 0;
        const pintCLP = Number(line.pintura) || 0;

        const mecHH = hhMO > 0 ? mecCLP / hhMO : 0;
        const dymHH = hhMO > 0 ? dymCLP / hhMO : 0;
        const repHH = hhMO > 0 ? repCLP / hhMO : 0;
        const pintHH = hhPin > 0 ? pintCLP / hhPin : 0;

        totalMecHH += mecHH;
        totalDymHH += dymHH;
        totalRepHH += repHH;
        totalPintHH += pintHH;

        totalMecCLP += mecCLP;
        totalDymCLP += dymCLP;
        totalRepCLP += repCLP;
        totalPintCLP += pintCLP;

        workRows.push({
            pieza,
            accion,
            mecHH,
            dymHH,
            repHH,
            pintHH,
            totalCLP: mecCLP + dymCLP + repCLP + pintCLP
        });
    });

    let repuestosTotal = 0;
    const repuestoRows = [];
    const parts = (valuation && valuation.parts) || [];
    parts.forEach((item, idx) => {
        const accion = item.action || item.accion || '';
        if (!accion || !accion.toLowerCase().includes('cambiar')) return;
        const unidades = Number(item.qty ?? item.unidades ?? 1) || 1;
        const costo = Number(item.totalPrice ?? item.unitPrice ?? item.precio ?? 0) || Number(item.precioAuditado ?? 0) || 0;
        const dto = Number(item.dto ?? item.descuento ?? 0) || 0;
        const total = unidades * costo * (1 - dto / 100);
        repuestoRows.push({
            detalle: item.partName ?? item.nombre ?? '',
            codigo: item.ref || item.code || item.codigo || 's/i',
            unidades,
            costo,
            descuento: dto,
            total
        });
        repuestosTotal += total;
    });

    const totalRepararCLP = totalMecCLP + totalDymCLP + totalRepCLP;
    const totalPintarCLP = totalPintCLP;
    const totalNeto = totalRepararCLP + totalPintarCLP + repuestosTotal;
    const iva = totalNeto * 0.19;
    const totalConIva = totalNeto + iva;

    return {
        workRows,
        repuestoRows,
        totals: {
            mecHH: totalMecHH,
            dymHH: totalDymHH,
            repHH: totalRepHH,
            pintHH: totalPintHH,
            totalRepararCLP,
            totalPintarCLP,
            repuestosTotal,
            totalNeto,
            iva,
            totalConIva
        }
    };
}

function renderBudgetHtml({ claim, audit, valuation, client, rates, model }) {
    const root = document.createElement('div');
    root.className = 'budget-page';

    const claimNumber = claim.claimNumber || claim.id;
    const paintMode = rates.paintMode || 'BICAPA';
    const hhPinSel = paintMode === 'TRICAPA' ? rates.hhPinTricapa : rates.hhPinBicapa;
    const auditorLogo = (client && client.logoAuditor) ? client.logoAuditor : 'Imagenes/Logo Kensa fondo blanco.png';
    const qrDataUrl = claim.__kensaQrDataUrl || null;

    root.innerHTML = `
        <div class="budget-header">
            <div class="budget-title">
                <img src="${auditorLogo}" alt="Logo Auditor" class="budget-logo">
                ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR Kensa" class="budget-qr">` : ''}
            </div>
            <div class="budget-claim">SINIESTRO: ${claimNumber}<div class="budget-plate">${claim.plate || '-'}</div></div>
        </div>
        <div class="budget-header-line">
            <span class="budget-header-line__model">${(claim.model || '-').toUpperCase()}</span>
        </div>

        <div class="budget-info">
            <div class="budget-info-left">
                <div class="budget-info-row"><span class="label">Liquidador</span><span class="value">${claim.adjuster || claim.liquidator || '-'}</span></div>
                <div class="budget-info-row"><span class="label">Taller</span><span class="value">${claim.workshop || '-'}</span></div>
                <div class="budget-info-row"><span class="label">Tarifa pintura</span><span class="value">${paintMode} (${fmtCLP(hhPinSel || 0)}/hh)</span></div>
                <div class="budget-info-row"><span class="label">Cliente</span><span class="value">${client?.nombre || client?.name || '-'}</span></div>
            </div>
            <div class="budget-info-right">
                <div class="budget-info-row"><span class="label">Marca</span><span class="value bold">${claim.brand || '-'}</span></div>
                <div class="budget-info-row"><span class="label">Modelo</span><span class="value bold">${claim.model || '-'}</span></div>
                <div class="budget-info-row"><span class="label">Patente</span><span class="value">${claim.plate || '-'}</span></div>
                <div class="budget-info-row"><span class="label">Color</span><span class="value">${claim.color || '-'}</span></div>
                <div class="budget-info-row"><span class="label">Año</span><span class="value">${claim.year || '-'}</span></div>
                <div class="budget-info-row"><span class="label">Chasis</span><span class="value">${claim.chassis || claim.vin || '-'}</span></div>
            </div>
        </div>

        <div class="budget-section-title">Desgloce de trabajo</div>
        <table class="budget-table">
            <thead>
                <tr>
                    <th>PIEZA AFECTADA</th>
                    <th>ACCIÓN</th>
                    <th class="hh">MECÁNICA (HH)</th>
                    <th class="hh">DYM (HH)</th>
                    <th class="hh">REPARAR (HH)</th>
                    <th class="hh">PINTAR (HH)</th>
                    <th class="num">TOTAL</th>
                </tr>
            </thead>
            <tbody>
                ${model.workRows.map(r => `
                    <tr>
                        <td>${r.pieza || ''}</td>
                        <td>${r.accion || ''}</td>
                        <td class="hh">${fmtHH(r.mecHH)}</td>
                        <td class="hh">${fmtHH(r.dymHH)}</td>
                        <td class="hh">${fmtHH(r.repHH)}</td>
                        <td class="hh">${fmtHH(r.pintHH)}</td>
                        <td class="num">${fmtCLP(r.totalCLP)}</td>
                    </tr>
                `).join('') || '<tr><td colspan="7" style="text-align:center;">Sin líneas activas</td></tr>'}
            </tbody>
        </table>

        <div class="budget-section-title" style="margin-top:14px;">Repuestos</div>
        <table class="budget-table">
            <thead>
                <tr>
                    <th>Detalle</th>
                    <th>Código</th>
                    <th class="num">Unidades</th>
                    <th class="num">Costo</th>
                    <th class="num">Descuento %</th>
                    <th class="num">Total</th>
                </tr>
            </thead>
            <tbody>
                ${model.repuestoRows.map(r => `
                    <tr>
                        <td>${r.detalle || ''}</td>
                        <td>${r.codigo || 's/i'}</td>
                        <td class="num">${r.unidades}</td>
                        <td class="num">${fmtCLP(r.costo)}</td>
                        <td class="num">${r.descuento || 0}%</td>
                        <td class="num">${fmtCLP(r.total)}</td>
                    </tr>
                `).join('') || '<tr><td colspan="6" style="text-align:center;">Sin repuestos</td></tr>'}
            </tbody>
        </table>

        <div class="budget-totals">
            <div class="total-row"><span>Total reparar</span><span>${fmtCLP(model.totals.totalRepararCLP)}</span></div>
            <div class="total-row"><span>Total pintar</span><span>${fmtCLP(model.totals.totalPintarCLP)}</span></div>
            <div class="total-row"><span>Total repuestos</span><span>${fmtCLP(model.totals.repuestosTotal)}</span></div>
            <div class="total-row"><span>Total neto</span><span>${fmtCLP(model.totals.totalNeto)}</span></div>
            <div class="total-row"><strong>IVA</strong><strong>${fmtCLP(model.totals.iva)}</strong></div>
            <div class="total-row"><strong>Total + IVA</strong><strong>${fmtCLP(model.totals.totalConIva)}</strong></div>
        </div>

        <div class="budget-footer">
            <div class="budget-footer__bar">Kensa</div>
        </div>
    `;

    return root;
}

function createBudgetPageShell({ claim, client, rates, qrDataUrl, claimNumber, paintMode, hhPinSel, auditorLogo }) {
    const page = document.createElement('div');
    page.className = 'budget-page';
    page.innerHTML = `
        <div class="budget-header">
            <div class="budget-title">
                <img src="${auditorLogo}" alt="Logo Auditor" class="budget-logo">
                ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR Kensa" class="budget-qr">` : ''}
            </div>
            <div class="budget-claim">SINIESTRO: ${claimNumber}<div class="budget-plate">${claim.plate || '-'}</div></div>
        </div>
        <div class="budget-header-line">
            <span class="budget-header-line__model">${(claim.model || '-').toUpperCase()}</span>
        </div>

        <div class="budget-info">
            <div class="budget-info-left">
                <div class="budget-info-row"><span class="label">Liquidador</span><span class="value">${claim.adjuster || claim.liquidator || '-'}</span></div>
                <div class="budget-info-row"><span class="label">Taller</span><span class="value">${claim.workshop || '-'}</span></div>
                <div class="budget-info-row"><span class="label">Tarifa pintura</span><span class="value">${paintMode} (${fmtCLP(hhPinSel || 0)}/hh)</span></div>
                <div class="budget-info-row"><span class="label">Cliente</span><span class="value">${client?.nombre || client?.name || '-'}</span></div>
            </div>
            <div class="budget-info-right">
                <div class="budget-info-row"><span class="label">Marca</span><span class="value bold">${claim.brand || '-'}</span></div>
                <div class="budget-info-row"><span class="label">Modelo</span><span class="value bold">${claim.model || '-'}</span></div>
                <div class="budget-info-row"><span class="label">Patente</span><span class="value">${claim.plate || '-'}</span></div>
                <div class="budget-info-row"><span class="label">Color</span><span class="value">${claim.color || '-'}</span></div>
                <div class="budget-info-row"><span class="label">Año</span><span class="value">${claim.year || '-'}</span></div>
                <div class="budget-info-row"><span class="label">Chasis</span><span class="value">${claim.chassis || claim.vin || '-'}</span></div>
            </div>
        </div>

        <div class="budget-content"></div>

        <div class="budget-footer">
            <div class="budget-footer__bar">Kensa</div>
        </div>
    `;
    const contentEl = page.querySelector('.budget-content');
    return { page, contentEl };
}

function getBudgetSafeBottomY(pageEl) {
    const footer = pageEl.querySelector('.budget-footer');
    const mmToPx = (mm) => (mm * 96) / 25.4;
    const safeOffset = mmToPx(10); // 10mm de espacio respecto al inicio del pie de página
    if (!footer) return pageEl.getBoundingClientRect().bottom - safeOffset;
    const footerRect = footer.getBoundingClientRect();
    return footerRect.top - safeOffset;
}

function appendPagedTableSection({ pages, makeNewPage, sectionTitle, theadHtml, rows, makeRowHtml }) {
    const dataRows = (Array.isArray(rows) && rows.length > 0) ? rows : [{ __isEmpty: true }];
    let i = 0;

    while (i < dataRows.length) {
        let current = pages[pages.length - 1];
        if (!current) current = makeNewPage();
        const content = current.contentEl || current.page;

        let section = content.querySelector(`[data-section="${sectionTitle}"]`);
        if (!section) {
            const extraMargin = sectionTitle === 'Repuestos' ? ' style="margin-top:14px;"' : '';
            section = document.createElement('div');
            section.dataset.section = sectionTitle;
            section.innerHTML = `
                <div class="budget-section-title"${extraMargin}>${sectionTitle}</div>
                <table class="budget-table">
                    <thead>${theadHtml}</thead>
                    <tbody></tbody>
                </table>
            `;
            content.appendChild(section);
        }

        const tbody = section.querySelector('tbody');
        const safeBottomY = getBudgetSafeBottomY(current.page);
        let addedAny = false;

        while (i < dataRows.length) {
            const tr = document.createElement('tr');
            const rowHtml = makeRowHtml(dataRows[i]);
            tr.innerHTML = rowHtml.replace(/^<tr>|<\/tr>$/g, '');
            tbody.appendChild(tr);

            const trRect = tr.getBoundingClientRect();
            if (trRect.bottom > safeBottomY) {
                tbody.removeChild(tr);
                if (!addedAny) {
                    tbody.appendChild(tr);
                    i++;
                }
                break;
            } else {
                addedAny = true;
                i++;
            }
        }

        if (i < dataRows.length) {
            makeNewPage();
        }
    }
}

function renderBudgetPagesHtml({ claim, audit, valuation, client, rates, model }) {
    const root = document.createElement('div');
    root.id = 'budgetExportRoot';
    root.style.position = 'fixed';
    root.style.left = '-99999px';
    root.style.top = '0';
    root.style.width = '0';
    root.style.height = '0';
    root.style.pointerEvents = 'none';
    root.style.overflow = 'hidden';
    document.body.appendChild(root);

    const claimNumber = claim.claimNumber || claim.id;
    const paintMode = rates.paintMode || 'BICAPA';
    const hhPinSel = paintMode === 'TRICAPA' ? rates.hhPinTricapa : rates.hhPinBicapa;
    const auditorLogo = (client && client.logoAuditor) ? client.logoAuditor : 'Imagenes/Logo Kensa fondo blanco.png';
    const qrDataUrl = claim.__kensaQrDataUrl || null;

    const pages = [];
    const makeNewPage = () => {
        const entry = createBudgetPageShell({ claim, client, rates, qrDataUrl, claimNumber, paintMode, hhPinSel, auditorLogo });
        root.appendChild(entry.page);
        const wrapped = { page: entry.page, contentEl: entry.contentEl || entry.page };
        pages.push(wrapped);
        return wrapped;
    };

    makeNewPage();

    appendPagedTableSection({
        pages,
        makeNewPage,
        sectionTitle: 'Desgloce de trabajo',
        theadHtml: `
            <tr>
                <th>PIEZA AFECTADA</th>
                <th>ACCIÓN</th>
                <th class="hh">MECÁNICA (HH)</th>
                <th class="hh">DYM (HH)</th>
                <th class="hh">REPARAR (HH)</th>
                <th class="hh">PINTAR (HH)</th>
                <th class="num">TOTAL</th>
            </tr>
        `,
        rows: model?.workRows || [],
        makeRowHtml: (r) => {
            if (r && r.__isEmpty) {
                return '<tr><td colspan="7" style="text-align:center;">Sin líneas activas</td></tr>';
            }
            return `
                <tr>
                    <td>${r.pieza || ''}</td>
                    <td>${r.accion || ''}</td>
                    <td class="hh">${fmtHH(r.mecHH)}</td>
                    <td class="hh">${fmtHH(r.dymHH)}</td>
                    <td class="hh">${fmtHH(r.repHH)}</td>
                    <td class="hh">${fmtHH(r.pintHH)}</td>
                    <td class="num">${fmtCLP(r.totalCLP)}</td>
                </tr>
            `;
        }
    });

    appendPagedTableSection({
        pages,
        makeNewPage,
        sectionTitle: 'Repuestos',
        theadHtml: `
            <tr>
                <th>Detalle</th>
                <th>Código</th>
                <th class="num">Unidades</th>
                <th class="num">Costo</th>
                <th class="num">Descuento %</th>
                <th class="num">Total</th>
            </tr>
        `,
        rows: model?.repuestoRows || [],
        makeRowHtml: (r) => {
            if (r && r.__isEmpty) {
                return '<tr><td colspan="6" style="text-align:center;">Sin repuestos</td></tr>';
            }
            return `
                <tr>
                    <td>${r.detalle || ''}</td>
                    <td>${r.codigo || 's/i'}</td>
                    <td class="num">${r.unidades}</td>
                    <td class="num">${fmtCLP(r.costo)}</td>
                    <td class="num">${r.descuento || 0}%</td>
                    <td class="num">${fmtCLP(r.total)}</td>
                </tr>
            `;
        }
    });

    const totalsMarkup = `
        <div class="budget-totals">
            <div class="total-row"><span>Total reparar</span><span>${fmtCLP(model?.totals?.totalRepararCLP || 0)}</span></div>
            <div class="total-row"><span>Total pintar</span><span>${fmtCLP(model?.totals?.totalPintarCLP || 0)}</span></div>
            <div class="total-row"><span>Total repuestos</span><span>${fmtCLP(model?.totals?.repuestosTotal || 0)}</span></div>
            <div class="total-row"><span>Total neto</span><span>${fmtCLP(model?.totals?.totalNeto || 0)}</span></div>
            <div class="total-row"><strong>IVA</strong><strong>${fmtCLP(model?.totals?.iva || 0)}</strong></div>
            <div class="total-row"><strong>Total + IVA</strong><strong>${fmtCLP(model?.totals?.totalConIva || 0)}</strong></div>
        </div>
    `;
    const totalsEl = document.createElement('div');
    totalsEl.innerHTML = totalsMarkup.trim();
    const totalsNode = totalsEl.firstElementChild;

    if (totalsNode) {
        let targetPage = pages[pages.length - 1] || makeNewPage();
        const safeBottom = getBudgetSafeBottomY(targetPage.page);
        targetPage.contentEl.appendChild(totalsNode);
        if (totalsNode.getBoundingClientRect().bottom > safeBottom) {
            targetPage.contentEl.removeChild(totalsNode);
            targetPage = makeNewPage();
            targetPage.contentEl.appendChild(totalsNode);
        }
    }

    return root;
}

async function exportBudgetPagesToPdf(pagesWrapper, fileName) {
    const pages = Array.from(pagesWrapper.querySelectorAll('.budget-page'));
    if (!pages.length) return;
    const pdf = new window.jspdf.jsPDF('p', 'pt', 'a4');

    for (let idx = 0; idx < pages.length; idx++) {
        const canvas = await html2canvas(pages[idx], {
            scale: 2,
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#ffffff',
            logging: false
        });
        const img = canvas.toDataURL('image/png');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const imgWidth = pageWidth;
        const imgHeight = canvas.height * imgWidth / canvas.width;
        if (idx > 0) pdf.addPage();
        pdf.addImage(img, 'PNG', 0, 0, imgWidth, imgHeight);
    }

    pdf.save(fileName);
}

async function exportNodeToPdfPaged(node, fileName) {
    if (!node) return;
    const canvas = await html2canvas(node, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false
    });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new window.jspdf.jsPDF('p', 'pt', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = canvas.height * imgWidth / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > pageHeight * 0.1) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
    }

    pdf.save(fileName);
}
    function loadClientesFromStorage() {
        try {
            const raw = localStorage.getItem(CLIENTES_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                clientesState = parsed;
                return;
            }
        }
    } catch (err) {
        console.warn('No se pudieron cargar clientes desde localStorage:', err);
    }

    if (Array.isArray(window.CLIENTES_SEED)) {
        clientesState = [...window.CLIENTES_SEED];
        saveClientesToStorage();
    } else {
        clientesState = [];
    }
}

function saveClientesToStorage() {
    try {
        localStorage.setItem(CLIENTES_STORAGE_KEY, JSON.stringify(clientesState));
    } catch (err) {
        console.warn('No se pudieron guardar clientes en localStorage:', err);
    }
}

function loadUsuariosFromStorage() {
    try {
        const raw = localStorage.getItem(USUARIOS_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                usuariosState = parsed;
                return;
            }
        }
    } catch (err) {
        console.warn('No se pudieron cargar usuarios desde localStorage:', err);
    }

    if (Array.isArray(window.USUARIOS_SEED)) {
        usuariosState = [...window.USUARIOS_SEED];
        saveUsuariosToStorage();
    } else {
        usuariosState = [];
    }
}

function saveUsuariosToStorage() {
    try {
        localStorage.setItem(USUARIOS_STORAGE_KEY, JSON.stringify(usuariosState));
    } catch (err) {
        console.warn('No se pudieron guardar usuarios en localStorage:', err);
    }
}

// Agregar siniestro al origen de datos usado por la vista Siniestros
function addClaimFromForm(formData) {
    if (!Array.isArray(claimsState)) {
        claimsState = [];
    }

    const now = new Date().toISOString();
    const createdAt = formData.createdAt || now;
    const updatedAt = formData.updatedAt || now;

    const newClaim = {
        id: formData.id,
        brand: formData.brand,
        model: formData.model,
        year: formData.year,
        plate: formData.plate,
        workshop: formData.workshop,
        status: formData.status || 'Ingresado',
        sla: typeof formData.sla === 'number' ? formData.sla : 80,
        adjuster: formData.adjuster || 'Sin asignar',
        date: (formData.date || createdAt).slice(0, 10),
        createdAt,
        updatedAt,
        description: formData.description || 'Siniestro ingresado desde la plataforma.',
        type: formData.type || 'Presencial',
        cost: 0,
        photos: [],
        repairItems: [],
        pdfMapping: formData.pdfMapping || null
    };

    const applyExtra = (key, value) => {
        if (value !== undefined && value !== null && value !== '') {
            newClaim[key] = value;
        }
    };

    applyExtra('vehicleType', formData.vehicleType || formData.tipoVehiculo);
    applyExtra('tipoVehiculo', formData.tipoVehiculo || formData.vehicleType);
    applyExtra('coverage', formData.coverage || formData.cobertura);
    applyExtra('cobertura', formData.cobertura || formData.coverage);
    applyExtra('vin', formData.vin || formData.chassis);
    applyExtra('valuedBy', formData.valuedBy || formData.valoradoPor);
    const paintVal = formData.paintType || formData.pinturaTipo || formData.paintMode;
    applyExtra('paintType', paintVal);
    applyExtra('pinturaTipo', paintVal);
    applyExtra('noticeNumber', formData.noticeNumber || formData.numeroAviso || formData.aviso);
    applyExtra('numeroAviso', formData.numeroAviso || formData.noticeNumber);
    applyExtra('deductible', formData.deductible ?? formData.deducible);
    applyExtra('deducible', formData.deducible ?? formData.deductible);
    applyExtra('lossType', formData.lossType ?? formData.perdida);
    applyExtra('perdida', formData.perdida ?? formData.lossType);
    applyExtra('workshopCity', formData.workshopCity ?? formData.ciudadTaller);
    applyExtra('ciudadTaller', formData.ciudadTaller ?? formData.workshopCity);
    applyExtra('materials', formData.materials ?? formData.materiales);
    applyExtra('materiales', formData.materiales ?? formData.materials);
    applyExtra('paintTotal', formData.paintTotal ?? formData.totalPintura);
    applyExtra('totalPintura', formData.totalPintura ?? formData.paintTotal);
    applyExtra('totalAmount', formData.totalAmount ?? formData.total);
    applyExtra('total', formData.total ?? formData.totalAmount);

    const matCLP = parseMoneyCLPStrict(formData.materiales ?? formData.materials);
    const totPaintCLP = parseMoneyCLPStrict(formData.totalPintura ?? formData.paintTotal);
    const dedCLP = parseMoneyCLPStrict(formData.deducible ?? formData.deductible);
    const lossPct = parsePercentStrict(formData.perdida ?? formData.lossType);

    const setIfExists = (obj, key, val) => {
        if (val == null) return;
        if (key in obj && obj[key] == null) {
            obj[key] = val;
        }
    };

    setIfExists(newClaim, 'materialesCLP', matCLP);
    setIfExists(newClaim, 'totalPinturaCLP', totPaintCLP);
    setIfExists(newClaim, 'deducibleCLP', dedCLP);
    setIfExists(newClaim, 'perdidaPct', lossPct);

    claimsState.unshift(newClaim);
    saveClaimsToStorage();

    return newClaim;
}

function loadValuationForClaim(claimId) {
    const raw = localStorage.getItem(VALUATION_STORAGE_KEY);
    if (!raw) return null;
    try {
        const map = JSON.parse(raw);
        return map[claimId] || null;
    } catch (e) {
        console.error('Error parsing valuations map', e);
        return null;
    }
}

function saveValuationForClaim(claimId, valuation) {
    const raw = localStorage.getItem(VALUATION_STORAGE_KEY);
    let map = {};
    if (raw) {
        try {
            map = JSON.parse(raw) || {};
        } catch (e) {
            console.error('Error parsing valuations map, resetting', e);
            map = {};
        }
    }
    map[claimId] = valuation;
    localStorage.setItem(VALUATION_STORAGE_KEY, JSON.stringify(map));

    const claim = claimsState.find(c => c.id === claimId);
    if (claim) {
        const summary = valuation?.economics || valuation?.summary || {};
        const parts = valuation?.items || valuation?.parts || [];
        claim.valuations = claim.valuations || [];
        const signature = buildValuationSignature(claim.id, summary);
        const existingValuation = claim.valuations.find(v => v.signature === signature);
        if (existingValuation) {
            existingValuation.summary = summary;
            existingValuation.parts = parts;
            if (valuation?.document) {
                existingValuation.document = valuation.document;
            }
        } else {
            const label = claim.valuations.length === 0 ? 'OR' : `AR${claim.valuations.length}`;
            claim.valuations.push({
                id: `${claim.id}-${label}`,
                label,
                signature,
                summary,
                parts,
                createdAt: new Date().toISOString(),
                document: valuation?.document
            });
        }
        claim.updatedAt = new Date().toISOString();
        saveClaimsToStorage();
    }
}

// Very basic parser to extract valuation data from PDF text (improved with line-level parsing and logs)
function parseValuationFromText(pdfText, fileName) {
    const emptyValuation = () => ({
        economics: {
            bodyworkValue: null,
            mechatronicsValue: null,
            materialsValue: null,
            paintTotal: null,
            partsValueNet: null,
            laborValueNet: null,
            subtotalValuation: null,
            deductible: null,
            totalWithTax: null,
            lossPercentage: null
        },
        items: [],
        document: {
            fileName,
            uploadedAt: new Date().toISOString()
        }
    });

    try {
        const text = (pdfText || '').toString(); // preservar saltos de línea
        const normalized = text.replace(/\s+/g, ' ');
        const moneyToNumber = (str) => {
            if (!str) return null;
            let cleaned = String(str).trim().replace(/[^\d,]/g, '');
            if (!cleaned) return null;
            const parts = cleaned.split(',');
            const allDigits = parts.join('');
            if (!/^\d+$/.test(allDigits)) return null;
            const n = parseFloat(allDigits);
            return Number.isNaN(n) ? null : n;
        };

        const getBodyworkAndMechatronicsValues = (linesArr) => {
            const sectionIndex = linesArr.findIndex(line =>
                /Mano de obra carrocer[ií]a y mecatr[oó]nica/i.test(line)
            );
            if (sectionIndex === -1) {
                console.warn('No se encontró sección "Mano de obra carrocería y mecatrónica"');
                return { bodyworkRaw: null, mechatronicsRaw: null };
            }

            let endIndex = linesArr.findIndex((line, idx) =>
                idx > sectionIndex && /Valores pintura/i.test(line)
            );
            if (endIndex === -1) {
                endIndex = Math.min(linesArr.length, sectionIndex + 8);
            }

            const moneyRegex = /\$\s*([\d\.\,]+)/g;
            const found = [];

            for (let i = sectionIndex; i <= endIndex; i++) {
                const line = linesArr[i];
                if (!line) continue;
                let match;
                while ((match = moneyRegex.exec(line)) !== null) {
                    found.push(match[0]);
                }
            }

            if (found.length === 0) {
                console.warn('No se encontraron montos $ en el recuadro de Carrocería/Mecatrónica');
                return { bodyworkRaw: null, mechatronicsRaw: null };
            }

            console.log('Montos Carrocería/Mecatrónica detectados:', found);

            return {
                bodyworkRaw: found[0] || null,
                mechatronicsRaw: found[1] || null
            };
        };

        const moneyAfter = (label) => {
            const regex = new RegExp(label + '\\s*\\$?\\s*([\\d\\.\\,]+)', 'i');
            const match = normalized.match(regex);
            return match ? moneyToNumber(match[1]) : null;
        };

        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        const findMoneyNearLabel = (labels, maxLookahead = 2) => {
            const labelRegexes = labels.map(l => l instanceof RegExp ? l : new RegExp(l, 'i'));
            let fallback = null;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                for (const rx of labelRegexes) {
                    if (!rx.test(line)) continue;
                    const candidates = [line, ...lines.slice(i + 1, i + 1 + maxLookahead)];
                    for (const candidate of candidates) {
                        const moneyMatch = candidate.match(/\$?\s*([\d\.\,]+)/);
                        if (!moneyMatch) continue;
                        const rawFull = moneyMatch[0];
                        const digits = moneyMatch[1] || '';
                        const hasDollar = /\$/.test(rawFull);
                        const hasComma = rawFull.includes(',');
                        const hasThousands = digits.replace(/[^\d]/g, '').length >= 4;
                        if (hasDollar || hasComma || hasThousands) {
                            return rawFull;
                        }
                        if (!fallback) fallback = rawFull;
                    }
                }
            }
            return fallback;
        };

        const findPercentNearLabel = (labels, maxLookahead = 2) => {
            const labelRegexes = labels.map(l => l instanceof RegExp ? l : new RegExp(l, 'i'));
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                for (const rx of labelRegexes) {
                    if (!rx.test(line)) continue;
                    const candidates = [line, ...lines.slice(i + 1, i + 1 + maxLookahead)];
                    for (const candidate of candidates) {
                        const pctMatch = candidate.match(/(\d+(?:[.,]\d+)?)\s*%/);
                        if (pctMatch) return pctMatch[1];
                    }
                }
            }
            return null;
        };

        const getPaintBlockValues = (linesArr) => {
            const idx = linesArr.findIndex(line =>
                /Valores\s+pintura/i.test(line) ||
                /Valores\s+de\s+pintura/i.test(line) ||
                /^Pintura$/i.test(line)
            );
            if (idx === -1) return { materialsRaw: null, paintTotalRaw: null };

            const moneyRegex = /\$?\s*([\d\.\,]+)/g;
            const found = [];
            for (let i = idx; i < Math.min(linesArr.length, idx + 6); i++) {
                const currentLine = linesArr[i];
                let match;
                while ((match = moneyRegex.exec(currentLine)) !== null) {
                    found.push(match[0]);
                }
            }
            const withDollar = found.filter(v => v.includes('$'));
            if (withDollar.length >= 2) {
                return { materialsRaw: withDollar[0], paintTotalRaw: withDollar[1] };
            }
            const withComma = found.filter(v => v.includes(','));
            if (withComma.length >= 2) {
                return { materialsRaw: withComma[0], paintTotalRaw: withComma[1] };
            }
            return {
                materialsRaw: found[0] || null,
                paintTotalRaw: found[1] || null
            };
        };

        const getAmountBelowLabel = (linesArr, labelRegex, maxLookahead = 3) => {
            const idx = linesArr.findIndex(line => labelRegex.test(line));
            if (idx === -1) return null;
            for (let i = idx + 1; i <= idx + maxLookahead && i < linesArr.length; i++) {
                const line = linesArr[i];
                const match = line.match(/\$\s*([\d\.\,]+)/);
                if (match) {
                    return match[0]; // devolver string crudo con $
                }
            }
            return null;
        };

        const getSummaryValuesFromBlock = (linesArr) => {
            const headerIndex = linesArr.findIndex(line =>
                /Valor de Repuestos/i.test(line) &&
                /Valor de Mano de Obra/i.test(line) &&
                /Subtotal Valoraci[oó]n/i.test(line)
            );

            if (headerIndex === -1) {
                console.warn('No se encontró la línea de encabezado de resumen (Valor de Repuestos / Mano de Obra / Subtotal).');
                return { partsRaw: null, laborRaw: null, subtotalRaw: null };
            }

            const valuesLine = linesArr[headerIndex + 1] || '';
            const moneyRegex = /\$\s*([\d\.,]+)/g;
            const found = [];
            let match;

            while ((match = moneyRegex.exec(valuesLine)) !== null) {
                found.push(match[0]);
            }

            if (found.length < 3) {
                console.warn('No se encontraron los 3 montos esperados en la línea de resumen:', valuesLine, '-> encontrados:', found);
            }

            const partsRaw = found[0] || null;
            const laborRaw = found[1] || null;
            const subtotalRaw = found[2] || null;

            console.log('Resumen bruto detectado desde bloque:', { valuesLine, found });

            return { partsRaw, laborRaw, subtotalRaw };
        };

        const { bodyworkRaw, mechatronicsRaw } = getBodyworkAndMechatronicsValues(lines);
        const { partsRaw, laborRaw, subtotalRaw } = getSummaryValuesFromBlock(lines);
        const { materialsRaw: paintMaterialsRaw, paintTotalRaw } = getPaintBlockValues(lines);

        const bodyworkValue = moneyToNumber(bodyworkRaw);
        const mechatronicsValue = moneyToNumber(mechatronicsRaw);
        const partsValueNet = moneyToNumber(partsRaw);
        const laborValueNet = moneyToNumber(laborRaw);
        const subtotalValuation = moneyToNumber(subtotalRaw);
        const materialsValue = moneyToNumber(paintMaterialsRaw) ??
            moneyToNumber(findMoneyNearLabel([/Materiales/i], 3));
        const paintTotal = moneyToNumber(paintTotalRaw) ??
            moneyToNumber(findMoneyNearLabel([/Total\s+Pintura/i, /Total\s+de\s+Pintura/i, /Pintura\s+Total/i], 3));
        let deductible = moneyAfter('Valor deducible');
        if (deductible == null) {
            deductible = moneyToNumber(findMoneyNearLabel([/Valor\s+deducible/i, /Deducible/i], 3));
        }
        const totalWithTax = moneyAfter('Total reparaci[oó]n') || moneyAfter('Total reparación');

        let lossPercentage = null;
        const lossMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*%\s*Perdida/i) || normalized.match(/p[eé]rdida[^\d]*(\d+(?:[.,]\d+)?)[ ]*%/i);
        if (lossMatch) {
            lossPercentage = parseFloat(lossMatch[1].replace(',', '.'));
        } else {
            const lossNear = findPercentNearLabel([/P[eé]rdida/i, /P[eé]rdida\s+total/i], 3);
            if (lossNear != null) {
                const parsed = parseFloat(lossNear.replace(',', '.'));
                lossPercentage = Number.isNaN(parsed) ? null : parsed;
            }
        }

        if (partsValueNet == null) console.warn('No se pudo encontrar "Valor de Repuestos" en el texto.');
        if (laborValueNet == null) console.warn('No se pudo encontrar "Valor de Mano de Obra" en el texto.');
        if (subtotalValuation == null) console.warn('No se pudo encontrar "Subtotal Valoración" en el texto.');
        if (deductible == null) console.warn('No se pudo encontrar "Valor deducible" en el texto.');
        if (totalWithTax == null) console.warn('No se pudo encontrar "Total reparación" en el texto.');

        const rawLines = lines;
        // Mantener líneas sin unir para el bloque de ítems
        const headerIndex = rawLines.findIndex(line =>
            /Und/i.test(line) &&
            /Nombre\s+de\s+Repuesto/i.test(line) &&
            /Acci[oó]n/i.test(line)
        );
        let endIndex = rawLines.findIndex((line, idx) =>
            idx > headerIndex && /Versi[oó]n de los hechos/i.test(line)
        );
        if (endIndex === -1) endIndex = rawLines.length;

        const tableLines = headerIndex !== -1 ? rawLines.slice(headerIndex + 1, endIndex) : [];
        console.log('Líneas detectadas como tabla de repuestos:', tableLines);

        const buildItemBlocks = (linesArr) => {
            const blocks = [];
            let current = [];

            const isQtyLine = (line) => /^\d+$/.test(line.trim());
            const isFooterLine = (line) =>
                /^Powered by/i.test(line) || /^----- PAGE/i.test(line);

            for (const rawLine of linesArr) {
                const line = rawLine.trim();
                if (!line) continue;

                if (isFooterLine(line)) {
                    if (current.length) {
                        blocks.push(current.join(' '));
                        current = [];
                    }
                    continue;
                }

                if (isQtyLine(line)) {
                    if (current.length) {
                        blocks.push(current.join(' '));
                        current = [];
                    }
                    current.push(line);
                } else {
                    current.push(line);
                }
            }

            if (current.length) {
                blocks.push(current.join(' '));
            }

            return blocks;
        };

        const parseItemLine = (line, index) => {
            let cleanLine = line.replace(/\s+/g, ' ').trim();
            cleanLine = cleanLine.replace(/\bRef\.\b/gi, ' Ref ');

            const parts = cleanLine.split(' ');
            if (parts.length < 4) {
                console.warn('Línea de ítem demasiado corta:', cleanLine);
                return null;
            }

            let qty = parseInt(parts[0], 10);
            if (Number.isNaN(qty)) qty = 1;

            const refIdx = parts.findIndex(p => /^Ref\.?$/i.test(p));
            const actionIdx = parts.findIndex(p =>
                /^(Cambiar|Reparar|Reemplazar|Sustituir)$/i.test(p)
            );

            if (actionIdx === -1) {
                console.warn('No se encontró acción en bloque de ítem:', cleanLine);
                return null;
            }

            let nameEnd = actionIdx;
            let refValue = null;
            if (refIdx > 0 && refIdx < actionIdx) {
                nameEnd = refIdx;
                refValue = parts.slice(refIdx + 1, actionIdx).join(' ') || null;
            }
            const partName = parts.slice(1, nameEnd).join(' ');
            const action = parts[actionIdx];

            const tail = parts.slice(actionIdx + 1);

            let providerTokens = [];
            let firstNonProviderIdx = null;
            for (let i = 0; i < tail.length; i++) {
                const t = tail[i];
                const hasDigit = /\d/.test(t);
                const hasPercent = t.includes('%');
                const hasMoney = t.includes('$');
                if (!hasDigit && !hasPercent && !hasMoney) {
                    providerTokens.push(t);
                } else {
                    firstNonProviderIdx = i;
                    break;
                }
            }

            const provider = providerTokens.join(' ').trim() || null;

            const tailAfterProvider = firstNonProviderIdx != null
                ? tail.slice(firstNonProviderIdx)
                : tail.slice(0);

            let discountPercent = null;
            let quality = null;

            const dtoIdx = tailAfterProvider.findIndex(t => t.endsWith('%'));
            if (dtoIdx !== -1) {
                const d = tailAfterProvider[dtoIdx].replace('%', '');
                const dNum = parseFloat(d);
                discountPercent = Number.isNaN(dNum) ? null : dNum;
            }

            const qualityIdx = tailAfterProvider.findIndex(t =>
                /^(ORIGINAL|ALTERNATIVO|ALTERNO|HOMOLOGADO)$/i.test(t)
            );
            if (qualityIdx !== -1) {
                quality = tailAfterProvider[qualityIdx];
            }

            const moneyToNumberInline = (str) => {
                if (!str) return null;
                let cleaned = String(str).trim().replace(/[^\d,]/g, '');
                if (!cleaned) return null;
                const allDigits = cleaned.split(',').join('');
                const n = parseFloat(allDigits);
                return Number.isNaN(n) ? null : n;
            };

            let priceIdx = null;
            for (let i = tailAfterProvider.length - 1; i >= 0; i--) {
                if (moneyToNumberInline(tailAfterProvider[i]) != null) {
                    priceIdx = i;
                    break;
                }
            }

            let totalPrice = null;
            if (priceIdx != null) {
                totalPrice = moneyToNumberInline(tailAfterProvider[priceIdx]);
            }

            let leadTimeDays = null;
            if (priceIdx != null) {
                for (let i = priceIdx - 1; i >= 0; i--) {
                    const t = tailAfterProvider[i];
                    if (/^\d+$/.test(t)) {
                        leadTimeDays = parseInt(t, 10);
                        break;
                    }
                }
            }

            return {
                lineNumber: index + 1,
                qty,
                partName,
                action,
                ref: refValue,
                provider,
                quality,
                leadTimeDays,
                unitPrice: null,
                totalPrice
            };
        };

        const itemBlocks = buildItemBlocks(tableLines);

        const items = [];
        itemBlocks.forEach((block, idx) => {
            const item = parseItemLine(block, idx);
            if (item && item.partName) {
                items.push(item);
            } else {
                console.warn('No se pudo parsear bloque de ítem:', block);
            }
        });
        console.log('Items parseados desde la tabla de repuestos:', items);

        return {
            economics: {
                bodyworkValue,
                mechatronicsValue,
                materialsValue,
                paintTotal,
                partsValueNet,
                laborValueNet,
                subtotalValuation,
                deductible,
                totalWithTax,
                lossPercentage
            },
            items,
            document: {
                fileName,
                uploadedAt: new Date().toISOString()
            }
        };
    } catch (error) {
        console.error('Error en parseValuationFromText', error);
        return emptyValuation();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Login/Logout Logic
    const loginScreen = document.getElementById('loginScreen');
    const appContainer = document.getElementById('appContainer');
    const loginForm = document.getElementById('loginForm');
    const loadDemoCheckbox = document.getElementById('loadDemo');
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');
    const logoutBtn = document.getElementById('logoutBtn');
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');
    const sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn');
    const topBar = document.querySelector('.top-bar');
    const mobileSidebarMq = typeof window.matchMedia === 'function'
        ? window.matchMedia('(max-width: 1023px)')
        : { matches: false, addEventListener: null };

    const syncSidebarAria = (isOpen) => {
        if (!sidebar) return;
        if (mobileSidebarMq.matches) {
            sidebar.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        } else {
            sidebar.removeAttribute('aria-hidden');
        }
    };

    const syncTopBarOffset = () => {
        if (!topBar) return;
        const height = topBar.getBoundingClientRect().height;
        document.documentElement.style.setProperty('--topbar-offset', `${height}px`);
    };

    const scheduleTopBarOffset = () => {
        if (!topBar) return;
        requestAnimationFrame(syncTopBarOffset);
    };

    if (topBar && typeof ResizeObserver !== 'undefined') {
        const topBarObserver = new ResizeObserver(() => syncTopBarOffset());
        topBarObserver.observe(topBar);
    } else {
        window.addEventListener('resize', scheduleTopBarOffset);
    }

    const closeSidebar = () => {
        if (sidebar && mobileSidebarMq.matches && sidebar.contains(document.activeElement)) {
            if (sidebarToggle) {
                sidebarToggle.focus();
            } else if (document.activeElement) {
                document.activeElement.blur();
            }
        }
        document.body.classList.remove('sidebar-open');
        syncSidebarAria(false);
    };
    const openSidebar = () => {
        document.body.classList.add('sidebar-open');
        syncSidebarAria(true);
    };
    const toggleSidebar = () => {
        const isOpen = document.body.classList.toggle('sidebar-open');
        syncSidebarAria(isOpen);
    };

    const setSidebarCollapsed = (collapsed) => {
        document.body.classList.toggle('sidebar-collapsed', collapsed);
        if (!sidebarCollapseBtn) return;
        sidebarCollapseBtn.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
        sidebarCollapseBtn.setAttribute('aria-label', collapsed ? 'Expandir sidebar' : 'Contraer sidebar');
    };

    // Demo credentials
    const DEMO_EMAIL = 'demo@kensa.cl';
    const DEMO_PASSWORD = 'demo123';

    const findUsuarioByEmail = (email) => {
        if (!email) return null;
        const lower = email.toLowerCase();
        return usuariosState.find(u => (u.email || '').toLowerCase() === lower && u.estado !== 'INACTIVO');
    };

    // Check if user is already logged in
    const isLoggedIn = localStorage.getItem('kensaLoggedIn');
    if (isLoggedIn === 'true') {
        showApp();
    }

    // Load demo credentials when checkbox is checked
    if (loadDemoCheckbox && loginEmail && loginPassword) {
        const applyDemoCredentials = (checked) => {
            console.log('Checkbox Cargar demo cambiado. checked =', checked);
            if (checked) {
                loginEmail.value = DEMO_EMAIL;
                loginPassword.value = DEMO_PASSWORD;
            } else {
                if (loginEmail.value === DEMO_EMAIL) {
                    loginEmail.value = '';
                }
                if (loginPassword.value === DEMO_PASSWORD) {
                    loginPassword.value = '';
                }
            }
        };

        loadDemoCheckbox.addEventListener('change', (e) => {
            applyDemoCredentials(e.target.checked);
        });

        // Aplica estado inicial si ya viene marcado por el navegador
        applyDemoCredentials(loadDemoCheckbox.checked);
    } else {
        console.warn('Checkbox de demo o campos de login no encontrados en el DOM.');
    }

    // Login form submission
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const email = (loginEmail.value || '').trim();
        const password = loginPassword.value;

        // Demo backdoor
        if (email === DEMO_EMAIL && password === DEMO_PASSWORD) {
            const demoUser = { id: 'demo', name: 'Demo', role: 'Admin' };
            localStorage.setItem('kensaLoggedIn', 'true');
            localStorage.setItem('kensaUser', email);
            localStorage.setItem('kensaAud_currentUser', JSON.stringify(demoUser));
            showApp();
            return;
        }

        // Usuarios creados (solo validamos email, ya que no hay password persistido)
        const usr = findUsuarioByEmail(email);
        if (usr) {
            const now = new Date().toISOString();
            usr.ultimoAcceso = now;
            saveUsuariosToStorage();
            localStorage.setItem('kensaLoggedIn', 'true');
            localStorage.setItem('kensaUser', email);
            localStorage.setItem('kensaAud_currentUser', JSON.stringify({ id: usr.id, name: usr.nombre || usr.email, role: usr.rol || '' }));
            showApp();
            return;
        }

        alert('❌ Credenciales incorrectas. Usa un usuario activo o las credenciales de demo.');
    });

    // Logout functionality
    logoutBtn.addEventListener('click', () => {
        if (confirm('¿Estás seguro que deseas cerrar sesión?')) {
            localStorage.removeItem('kensaLoggedIn');
            localStorage.removeItem('kensaUser');
            localStorage.removeItem('kensaAud_currentUser');
            hideApp();
        }
    });

    function showApp() {
        closeSidebar();
        loginScreen.style.display = 'none';
        appContainer.style.display = 'flex';
        scheduleTopBarOffset();
    }

    function hideApp() {
        closeSidebar();
        loginScreen.style.display = 'flex';
        appContainer.style.display = 'none';
        loginForm.reset();
    }

    // Navigation Logic
    const navItems = document.querySelectorAll('.nav-item');
    const contentArea = document.getElementById('content-area');
    const pageTitle = document.getElementById('page-title');
    const topBarActions = document.getElementById('topBarActions');
    const sidebarFiltersContainer = document.getElementById('sidebarFilters');
    syncSidebarAria(document.body.classList.contains('sidebar-open'));

    if (sidebarCollapseBtn) {
        setSidebarCollapsed(document.body.classList.contains('sidebar-collapsed'));
        sidebarCollapseBtn.addEventListener('click', () => {
            if (mobileSidebarMq.matches) return;
            setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));
        });
    }

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', (e) => {
            e.preventDefault();
            toggleSidebar();
        });
    }
    if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener('click', closeSidebar);
    }
    document.addEventListener('keyup', (e) => {
        if (e.key === 'Escape') {
            closeSidebar();
        }
    });
    if (typeof mobileSidebarMq.addEventListener === 'function') {
        mobileSidebarMq.addEventListener('change', (e) => {
            if (!e.matches) {
                closeSidebar();
            } else {
                syncSidebarAria(document.body.classList.contains('sidebar-open'));
            }
        });
    }

    // Inicializar siniestros desde storage/mock y cargar vista por defecto
    loadClaimsFromStorage();
    loadClientesFromStorage();
    loadUsuariosFromStorage();
    renderClienteLogoHeader();

    // Initial Load - default to Siniestros
    loadView('claims');
    navItems.forEach(nav => {
        const navView = nav.getAttribute('data-view');
        nav.classList.toggle('active', navView === 'claims');
    });

    // Modal Logic
    const modal = document.getElementById('newClaimModal');
    const closeModalBtn = document.getElementById('closeModal');
    const cancelBtn = document.getElementById('cancelBtn');
    const newClaimForm = document.getElementById('newClaimForm');

    // Open modal from any "Nuevo Siniestro" trigger
    document.addEventListener('click', (e) => {
        const openTrigger = e.target.closest('[data-open-new-claim]');
        if (openTrigger) {
            e.preventDefault();
            modal.classList.add('active');
        }
    });

    // Close Modal
    closeModalBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    cancelBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    // Close on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });

    const newClaimPdfDropZone = document.getElementById('newClaimPdfDropZone');
    const newClaimPdfInput = document.getElementById('newClaimPdfInput');

    // Form Submission
    newClaimForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const claimNumberInput = document.getElementById('claimNumber');
        const workshopSelectEl = document.getElementById('workshop');
        const adjusterSelectEl = document.getElementById('adjuster');
        const typeSelectEl = document.getElementById('claimType');

        const claimData = {
            claimNumber: claimNumberInput ? claimNumberInput.value.trim() : '',
            brand: document.getElementById('vehicleBrand').value.trim(),
            model: document.getElementById('vehicleModel').value.trim(),
            year: document.getElementById('vehicleYear').value.trim(),
            plate: document.getElementById('vehiclePlate').value.trim(),
            workshopName: workshopSelectEl && workshopSelectEl.selectedIndex >= 0
                ? workshopSelectEl.options[workshopSelectEl.selectedIndex].textContent.trim()
                : '',
            adjusterName: adjusterSelectEl && adjusterSelectEl.selectedIndex >= 0
                ? adjusterSelectEl.options[adjusterSelectEl.selectedIndex].textContent.trim()
                : '',
            type: typeSelectEl ? typeSelectEl.value : 'Presencial'
        };

        const createdClaim = createClaimFromData(claimData);
        const vehicleInfo = `${createdClaim.brand} ${createdClaim.model} ${createdClaim.year}`.trim();

        // Reset form and close modal
        newClaimForm.reset();
        modal.classList.remove('active');

        // Mostrar lista actualizada con el nuevo siniestro
        loadView('claims');
    });

    setupNewClaimPdfImport();

    function setupNewClaimPdfImport() {
        if (!newClaimPdfDropZone || !newClaimPdfInput) return;

        const preventDefaults = (event) => {
            event.preventDefault();
            event.stopPropagation();
        };

        newClaimPdfDropZone.addEventListener('click', () => newClaimPdfInput.click());

        ['dragenter', 'dragover'].forEach(evt => {
            newClaimPdfDropZone.addEventListener(evt, (event) => {
                preventDefaults(event);
                newClaimPdfDropZone.classList.add('dropzone-active');
                newClaimPdfDropZone.classList.add('dragover');
                newClaimPdfDropZone.classList.add('is-dragover');
            });
        });

        ['dragleave', 'drop'].forEach(evt => {
            newClaimPdfDropZone.addEventListener(evt, (event) => {
                preventDefaults(event);
                newClaimPdfDropZone.classList.remove('dropzone-active');
                newClaimPdfDropZone.classList.remove('dragover');
                newClaimPdfDropZone.classList.remove('is-dragover');
            });
        });

        newClaimPdfDropZone.addEventListener('drop', async (event) => {
            const files = Array.from(event.dataTransfer?.files || []).filter(f => f.type === 'application/pdf');
            if (!files.length) return;
            await handleNewClaimPdfFiles(files);
        });

        newClaimPdfInput.addEventListener('change', async (event) => {
            const files = Array.from(event.target.files || []).filter(f => f.type === 'application/pdf');
            if (!files.length) return;
            await handleNewClaimPdfFiles(files);
            newClaimPdfInput.value = '';
        });
    }

    function bindClaimCheckboxEvents() {
        const rowCheckboxes = Array.from(document.querySelectorAll('#claimsTableBody .chk-siniestro, #claimsCards .chk-siniestro'));
        const selectAllBoxes = Array.from(document.querySelectorAll('#chkSiniestrosSelectAll, #chkSiniestrosSelectAllMobile')).filter(Boolean);
        if (!rowCheckboxes.length) return;
        const claimIds = Array.from(new Set(rowCheckboxes.map(chk => chk.dataset.claimId).filter(Boolean)));

        const syncRowCheckboxes = () => {
            rowCheckboxes.forEach(chk => {
                const id = chk.dataset.claimId;
                chk.checked = id ? selectedClaimIds.has(id) : false;
            });
        };

        const syncSelectAll = () => {
            const total = claimIds.length;
            const visibleSelected = claimIds.filter(id => selectedClaimIds.has(id)).length;
            selectAllBoxes.forEach(chkAll => {
                chkAll.checked = total > 0 && visibleSelected === total;
                chkAll.indeterminate = visibleSelected > 0 && visibleSelected < total;
            });
        };

        const handleSelectAllChange = (chkAll) => {
            const check = chkAll.checked;
            selectedClaimIds.clear();
            if (check) {
                claimIds.forEach(id => selectedClaimIds.add(id));
            }
            syncRowCheckboxes();
            syncSelectAll();
            updateBulkActionsUI();
        };

        selectAllBoxes.forEach(chkAll => {
            chkAll.onchange = () => handleSelectAllChange(chkAll);
        });

        rowCheckboxes.forEach(chk => {
            chk.onchange = (ev) => {
                ev.stopPropagation();
                const id = chk.dataset.claimId;
                if (!id) return;
                if (chk.checked) {
                    selectedClaimIds.add(id);
                } else {
                    selectedClaimIds.delete(id);
                }
                syncRowCheckboxes();
                syncSelectAll();
                updateBulkActionsUI();
            };
        });

        syncRowCheckboxes();
        syncSelectAll();
    }

    function updateBulkActionsUI() {
        const bar = document.getElementById('bulkActionsSiniestros');
        const countEl = document.getElementById('bulkSiniestrosCount');
        if (!bar || !countEl) return;
        const count = selectedClaimIds.size;
        if (count > 0) {
            bar.classList.remove('hidden');
            countEl.textContent = `${count} siniestro${count === 1 ? '' : 's'} seleccionado${count === 1 ? '' : 's'}`;
        } else {
            bar.classList.add('hidden');
            countEl.textContent = '0 seleccionados';
        }
    }

    function bindBulkActionsSiniestros() {
        const btnAsignar = document.getElementById('btnBulkSiniestrosAsignar');
        const btnEstado = document.getElementById('btnBulkSiniestrosEstado');
        const btnEliminar = document.getElementById('btnBulkSiniestrosEliminar');

        if (btnAsignar) btnAsignar.onclick = handleBulkAsignarSiniestros;
        if (btnEstado) btnEstado.onclick = handleBulkCambioEstadoSiniestros;
        if (btnEliminar) btnEliminar.onclick = handleBulkEliminarSiniestros;
    }

    function handleBulkEliminarSiniestros() {
        if (selectedClaimIds.size === 0) return;
        if (!confirm(`¿Eliminar ${selectedClaimIds.size} siniestro(s) seleccionados?`)) return;
        claimsState = claimsState.filter(c => !selectedClaimIds.has(c.id));
        saveClaimsToStorage();
        selectedClaimIds.clear();
        filterAndRenderClaims();
        updateBulkActionsUI();
    }

    function bindPhotoUploadControls(claim) {
        const input = document.getElementById('photoUploadInput');
        const drop = document.getElementById('photoDropzone');
        if (!input || !drop) return;

        const handleFiles = (fileList) => {
            if (!fileList || !fileList.length) return;
            const files = Array.from(fileList).filter(f => f.type && f.type.startsWith('image/'));
            if (!files.length) return;
            const readers = files.map(file => new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target?.result);
                reader.readAsDataURL(file);
            }));
            Promise.all(readers).then(urls => {
                if (!claim.photos) claim.photos = [];
                const beforeCount = claim.photos.length;
                urls.forEach(url => {
                    if (typeof url !== 'string') return;
                    if (claim.photos.length >= 25) return;
                    claim.photos.push(url);
                });
                const added = claim.photos.length - beforeCount;
                if (added > 0) {
                    addBitacoraEvent(claim, {
                        type: 'photo',
                        message: `Carga de imágenes: +${added} (Total: ${claim.photos.length})`,
                        meta: { added, total: claim.photos.length }
                    });
                }
                claimDetailDirty = true;
                touchClaimUpdatedAt(claim);
                saveClaimsToStorage();
                renderAuditDetail(claim.id, claimDetailActiveTab || 'photos');
            });
        };

        input.addEventListener('change', (e) => {
            handleFiles(e.target.files);
            input.value = '';
        });

        const prevent = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
        ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => { prevent(e); drop.classList.add('is-dragover'); }));
        ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => { prevent(e); drop.classList.remove('is-dragover'); }));
        drop.addEventListener('drop', (e) => {
            const files = e.dataTransfer?.files;
            handleFiles(files);
        });
        drop.addEventListener('click', () => input.click());
    }

    function bindPhotoSelection(claim) {
        const items = contentArea.querySelectorAll('.photo-item');
        if (!items || !items.length) return;
        items.forEach(item => {
            item.addEventListener('click', (event) => {
                if (event.target.closest('.photo-view-btn')) return;
                const idx = Number(item.getAttribute('data-photo-idx'));
                if (Number.isNaN(idx)) return;
                if (!Array.isArray(claim.photoHighlights)) claim.photoHighlights = [];
                const pos = claim.photoHighlights.indexOf(idx);
                if (pos !== -1) {
                    claim.photoHighlights.splice(pos, 1);
                } else {
                    if (claim.photoHighlights.length >= 4) {
                        claim.photoHighlights.shift();
                    }
                    claim.photoHighlights.push(idx);
                }
                claimDetailDirty = true;
                touchClaimUpdatedAt(claim);
                saveClaimsToStorage();
                renderAuditDetail(claim.id, claimDetailActiveTab || 'photos');
            });
        });
    }

    function ensurePhotoViewer() {
        if (photoViewerRefs) return photoViewerRefs;
        const viewer = document.createElement('div');
        viewer.id = 'photoViewer';
        viewer.className = 'photo-viewer';
        viewer.setAttribute('aria-hidden', 'true');
        viewer.innerHTML = `
            <div class="photo-viewer__backdrop"></div>
            <div class="photo-viewer__panel" role="dialog" aria-modal="true" aria-label="Visor de imágenes">
                <header class="photo-viewer__header">
                    <button type="button" class="photo-viewer__close" aria-label="Cerrar">
                        <i class="ph ph-x"></i>
                    </button>
                </header>
                <div class="photo-viewer__body">
                    <button type="button" class="photo-viewer__nav photo-viewer__nav--prev" aria-label="Anterior">
                        <i class="ph ph-caret-left"></i>
                    </button>
                    <div class="photo-viewer__canvas">
                        <div class="photo-viewer__stage">
                            <img class="photo-viewer__img" alt="Foto de siniestro">
                        </div>
                    </div>
                    <button type="button" class="photo-viewer__nav photo-viewer__nav--next" aria-label="Siguiente">
                        <i class="ph ph-caret-right"></i>
                    </button>
                </div>
                <footer class="photo-viewer__toolbar">
                    <div class="photo-viewer__counter">0 / 0</div>
                    <div class="photo-viewer__tools">
                        <button type="button" class="photo-viewer__tool" data-action="zoom-out" aria-label="Alejar">
                            <i class="ph ph-magnifying-glass-minus"></i>
                        </button>
                        <button type="button" class="photo-viewer__tool" data-action="zoom-in" aria-label="Acercar">
                            <i class="ph ph-magnifying-glass-plus"></i>
                        </button>
                        <button type="button" class="photo-viewer__tool" data-action="rotate-left" aria-label="Voltear a la izquierda">
                            <i class="ph ph-arrow-counter-clockwise"></i>
                        </button>
                        <button type="button" class="photo-viewer__tool" data-action="flip-x" aria-label="Invertir horizontal">
                            <i class="ph ph-flip-horizontal"></i>
                        </button>
                        <button type="button" class="photo-viewer__tool" data-action="flip-y" aria-label="Invertir vertical">
                            <i class="ph ph-flip-vertical"></i>
                        </button>
                    </div>
                </footer>
            </div>
        `;
        document.body.appendChild(viewer);

        const refs = {
            viewer,
            backdrop: viewer.querySelector('.photo-viewer__backdrop'),
            panel: viewer.querySelector('.photo-viewer__panel'),
            canvas: viewer.querySelector('.photo-viewer__canvas'),
            stage: viewer.querySelector('.photo-viewer__stage'),
            img: viewer.querySelector('.photo-viewer__img'),
            counter: viewer.querySelector('.photo-viewer__counter'),
            prevBtn: viewer.querySelector('.photo-viewer__nav--prev'),
            nextBtn: viewer.querySelector('.photo-viewer__nav--next'),
            closeBtn: viewer.querySelector('.photo-viewer__close'),
            tools: Array.from(viewer.querySelectorAll('.photo-viewer__tool'))
        };

        const clampIndex = (idx, total) => {
            if (!Number.isFinite(idx) || total <= 0) return 0;
            return Math.min(Math.max(idx, 0), total - 1);
        };

        const update = () => {
            if (!photoViewerState) return;
            const photos = photoViewerState.photos || [];
            const total = photos.length;
            const index = clampIndex(photoViewerState.index, total);
            photoViewerState.index = index;
            if (refs.counter) {
                refs.counter.textContent = total ? `${index + 1} / ${total}` : '0 / 0';
            }
            if (refs.img) {
                refs.img.src = photos[index] || '';
                const zoom = photoViewerState.zoom || 1;
                const rotate = photoViewerState.rotate || 0;
                const flipX = photoViewerState.flipX === -1 ? 180 : 0;
                const flipY = photoViewerState.flipY === -1 ? 180 : 0;
                refs.img.style.transform = `scale(${zoom}) rotate(${rotate}deg) rotateY(${flipX}deg) rotateX(${flipY}deg)`;
            }
            if (refs.stage) {
                const offsetX = photoViewerState.offsetX || 0;
                const offsetY = photoViewerState.offsetY || 0;
                refs.stage.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
            }
            if (refs.prevBtn) refs.prevBtn.disabled = index <= 0;
            if (refs.nextBtn) refs.nextBtn.disabled = index >= total - 1;
        };

        const close = () => {
            viewer.classList.remove('active');
            viewer.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('photo-viewer-open');
            photoViewerState = null;
        };

        const setIndex = (idx) => {
            if (!photoViewerState) return;
            photoViewerState.index = idx;
            photoViewerState.offsetX = 0;
            photoViewerState.offsetY = 0;
            update();
        };

        const clampZoom = (value) => Math.min(Math.max(value, 0.5), 4);

        const adjustZoom = (delta) => {
            if (!photoViewerState) return;
            const next = (photoViewerState.zoom || 1) + delta;
            photoViewerState.zoom = clampZoom(next);
            if (photoViewerState.zoom <= 1) {
                photoViewerState.offsetX = 0;
                photoViewerState.offsetY = 0;
            }
            update();
        };

        const toggleFlip = (axis) => {
            if (!photoViewerState) return;
            if (axis === 'x') {
                photoViewerState.flipX = (photoViewerState.flipX || 1) * -1;
            } else {
                photoViewerState.flipY = (photoViewerState.flipY || 1) * -1;
            }
            update();
        };

        if (refs.backdrop) {
            refs.backdrop.addEventListener('click', close);
        }
        if (refs.closeBtn) {
            refs.closeBtn.addEventListener('click', close);
        }
        if (refs.prevBtn) {
            refs.prevBtn.addEventListener('click', () => {
                if (!photoViewerState) return;
                setIndex(photoViewerState.index - 1);
            });
        }
        if (refs.nextBtn) {
            refs.nextBtn.addEventListener('click', () => {
                if (!photoViewerState) return;
                setIndex(photoViewerState.index + 1);
            });
        }
        if (refs.tools.length) {
            refs.tools.forEach(btn => {
                btn.addEventListener('click', () => {
                    const action = btn.dataset.action;
                    if (action === 'zoom-in') adjustZoom(0.2);
                    if (action === 'zoom-out') adjustZoom(-0.2);
                    if (action === 'rotate-left') {
                        if (photoViewerState) {
                            const next = (photoViewerState.rotate || 0) - 90;
                            photoViewerState.rotate = ((next % 360) + 360) % 360;
                        }
                        update();
                    }
                    if (action === 'flip-x') toggleFlip('x');
                    if (action === 'flip-y') toggleFlip('y');
                });
            });
        }

        if (refs.canvas) {
            let isPanning = false;
            let startX = 0;
            let startY = 0;
            let startOffsetX = 0;
            let startOffsetY = 0;
            let activePointerId = null;

            const endPan = () => {
                isPanning = false;
                activePointerId = null;
                if (refs.canvas) refs.canvas.classList.remove('is-panning');
            };

            refs.canvas.addEventListener('pointerdown', (event) => {
                if (!photoViewerState) return;
                if ((photoViewerState.zoom || 1) <= 1) return;
                event.preventDefault();
                isPanning = true;
                activePointerId = event.pointerId;
                startX = event.clientX;
                startY = event.clientY;
                startOffsetX = photoViewerState.offsetX || 0;
                startOffsetY = photoViewerState.offsetY || 0;
                refs.canvas.setPointerCapture(event.pointerId);
                refs.canvas.classList.add('is-panning');
            });

            refs.canvas.addEventListener('pointermove', (event) => {
                if (!isPanning || event.pointerId !== activePointerId || !photoViewerState) return;
                event.preventDefault();
                const dx = event.clientX - startX;
                const dy = event.clientY - startY;
                photoViewerState.offsetX = startOffsetX + dx;
                photoViewerState.offsetY = startOffsetY + dy;
                update();
            });

            refs.canvas.addEventListener('pointerup', endPan);
            refs.canvas.addEventListener('pointercancel', endPan);
            refs.canvas.addEventListener('pointerleave', endPan);

            refs.canvas.addEventListener('wheel', (event) => {
                if (!photoViewerState) return;
                event.preventDefault();
                const rect = refs.canvas.getBoundingClientRect();
                const cx = rect.width / 2;
                const cy = rect.height / 2;
                const x = event.clientX - rect.left;
                const y = event.clientY - rect.top;
                const oldZoom = photoViewerState.zoom || 1;
                const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
                const newZoom = clampZoom(oldZoom * zoomFactor);
                if (newZoom === oldZoom) return;
                const ratio = newZoom / oldZoom;
                const offsetX = photoViewerState.offsetX || 0;
                const offsetY = photoViewerState.offsetY || 0;
                photoViewerState.offsetX = offsetX * ratio + (1 - ratio) * (x - cx);
                photoViewerState.offsetY = offsetY * ratio + (1 - ratio) * (y - cy);
                photoViewerState.zoom = newZoom;
                if (photoViewerState.zoom <= 1) {
                    photoViewerState.offsetX = 0;
                    photoViewerState.offsetY = 0;
                }
                update();
            }, { passive: false });
        }

        document.addEventListener('keydown', (event) => {
            if (!viewer.classList.contains('active') || !photoViewerState) return;
            if (event.key === 'Escape') {
                close();
                return;
            }
            if (event.key === 'ArrowLeft') {
                setIndex(photoViewerState.index - 1);
            }
            if (event.key === 'ArrowRight') {
                setIndex(photoViewerState.index + 1);
            }
        });

        photoViewerRefs = { ...refs, update, close, setIndex };
        return photoViewerRefs;
    }

    function openPhotoViewer(claim, startIndex) {
        const refs = ensurePhotoViewer();
        const photos = Array.isArray(claim.photos) ? claim.photos.filter(Boolean) : [];
        if (!photos.length) return;
        photoViewerState = {
            photos,
            index: Number.isFinite(startIndex) ? startIndex : 0,
            zoom: 1,
            flipX: 1,
            flipY: 1,
            rotate: 0,
            offsetX: 0,
            offsetY: 0
        };
        refs.viewer.classList.add('active');
        refs.viewer.setAttribute('aria-hidden', 'false');
        document.body.classList.add('photo-viewer-open');
        refs.update();
    }

    function bindPhotoViewer(claim) {
        const buttons = contentArea.querySelectorAll('.photo-view-btn');
        if (!buttons || !buttons.length) return;
        buttons.forEach(btn => {
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                const idx = Number(btn.getAttribute('data-photo-idx'));
                if (Number.isNaN(idx)) return;
                openPhotoViewer(claim, idx);
            });
        });
    }

async function exportBudgetPdf(claimId) {
    commitClaimDetailEdits(claimId);
    saveClaimsToStorage();

    const claim = claimsState.find(c => c.id === claimId);
        if (!claim) {
            alert('No se encontró el siniestro para exportar.');
            return;
        }

        if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
            alert('No se pudo generar el PDF: librerías faltantes.');
            return;
        }

        const valId = claimDetailActiveValuationId || (claim.valuations?.[0]?.id);
        const valuation = (claim.valuations || []).find(v => v.id === valId);
        if (!valuation) {
            alert('No hay informe de valoración seleccionado para exportar.');
            return;
        }

        if (!ensureAuditDataFn) {
            alert('No se pudo obtener la auditoría para este siniestro.');
            return;
        }
        const audit = ensureAuditDataFn(valId, valuation);
        if (!audit || !Array.isArray(audit.lines) || !audit.lines.length) {
            alert('No hay líneas de auditoría disponibles para exportar.');
            return;
        }

        const client = getClientForClaim(claim);
        if (!client) {
            alert('No hay cliente configurado. Configura un cliente antes de exportar el presupuesto.');
            return;
        }
        const rates = getClientRates(client);
        if (!rates.hhMO || rates.hhMO <= 0) {
            alert('Configura HH MO en el cliente antes de exportar el presupuesto.');
            return;
        }
        const paintRate = rates.paintMode === 'TRICAPA' ? rates.hhPinTricapa : rates.hhPinBicapa;
        if (!paintRate || paintRate <= 0) {
            alert('Configura la tarifa de pintura (Bicapa/Tricapa) en el cliente antes de exportar el presupuesto.');
            return;
        }

    const model = buildBudgetModel({ claim, valuation, audit, rates });
    const qrDataUrl = await getKensaQrDataUrl();
    claim.__kensaQrDataUrl = qrDataUrl;
    const pagesRoot = renderBudgetPagesHtml({ claim, audit, valuation, client, rates, model });
    if (!pagesRoot) {
        alert('No se pudo preparar el presupuesto para exportar.');
        return;
    }

        try {
            await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
            await exportBudgetPagesToPdf(pagesRoot, `Presupuesto_${claim.id}.pdf`);
            claimDetailDirty = false;
        } finally {
            if (pagesRoot.parentNode) {
                pagesRoot.parentNode.removeChild(pagesRoot);
            }
        }
    }

    function ensureClaimDetailDirtyTracking() {
        if (!contentArea) return;
        if (claimDetailDirtyBound) return;
        const markDirty = (e) => {
            const t = e.target;
            if (!t) return;
            if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') {
                claimDetailDirty = true;
            }
        };
        contentArea.addEventListener('input', markDirty, true);
        contentArea.addEventListener('change', markDirty, true);
        claimDetailDirtyBound = true;
    }

    function showSaveStatusModal(claim, onDone) {
        if (!claim) {
            if (onDone) onDone('volver');
            return;
        }
        const existing = document.getElementById('saveStatusModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'saveStatusModal';
        modal.style.position = 'fixed';
        modal.style.inset = '0';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.background = 'rgba(15,23,42,0.35)';
        modal.style.backdropFilter = 'blur(4px)';
        modal.style.zIndex = '9998';

        const card = document.createElement('div');
        card.style.background = '#fff';
        card.style.borderRadius = '12px';
        card.style.boxShadow = '0 12px 30px rgba(0,0,0,0.18)';
        card.style.padding = '18px';
        card.style.minWidth = '320px';
        card.innerHTML = `
            <h3 style="margin:0 0 8px;">Guardar cambios</h3>
            <p style="margin:0 0 12px; color: var(--text-muted);">Elige el nuevo estado o solo guarda.</p>
            <div id="saveStatusOptions" style="display:grid;gap:8px; margin-bottom:12px;"></div>
            <div style="display:flex;justify-content:flex-end; gap:8px; flex-wrap:wrap;">
                <button id="saveStatusSolo" class="btn-primary">Solo guardar</button>
                <button id="saveStatusBack" class="btn-secondary">Volver</button>
            </div>
        `;
        modal.appendChild(card);

        const optionsContainer = card.querySelector('#saveStatusOptions');
        const states = ['Ingresado','En revisión','Revisar','Aprobado','Rechazado'];
        const remaining = states.filter(s => s !== claim.status);
        const makeBtn = (label, val, primary) => {
            const b = document.createElement('button');
            b.textContent = label;
            b.className = primary ? 'btn-primary' : 'btn-secondary';
            b.style.width = '100%';
            b.addEventListener('click', () => {
                modal.remove();
                if (onDone) onDone(val);
            });
            return b;
        };
        remaining.forEach(st => {
            optionsContainer.appendChild(makeBtn(st, st, false));
        });

        const soloBtn = card.querySelector('#saveStatusSolo');
        if (soloBtn) {
            soloBtn.addEventListener('click', () => {
                modal.remove();
                if (onDone) onDone('solo');
            });
        }
        const backBtn = card.querySelector('#saveStatusBack');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                modal.remove();
                if (onDone) onDone('volver');
            });
        }

        document.body.appendChild(modal);
    }
    function handleBulkCambioEstadoSiniestros() {
        if (selectedClaimIds.size === 0) return;
        const nuevoEstado = prompt('Ingresa el nuevo estado para los siniestros seleccionados:', 'En revisión');
        if (!nuevoEstado) return;
        claimsState = claimsState.map(c => selectedClaimIds.has(c.id) ? { ...c, status: nuevoEstado, updatedAt: new Date().toISOString() } : c);
        saveClaimsToStorage();
        selectedClaimIds.clear();
        filterAndRenderClaims();
        updateBulkActionsUI();
    }

    function handleBulkAsignarSiniestros() {
        if (selectedClaimIds.size === 0) return;
        const nuevoLiq = prompt('Ingresa el liquidador asignado para los siniestros seleccionados:', '');
        if (nuevoLiq === null) return;
        claimsState = claimsState.map(c => selectedClaimIds.has(c.id) ? { ...c, adjuster: nuevoLiq || c.adjuster, updatedAt: new Date().toISOString() } : c);
        saveClaimsToStorage();
        selectedClaimIds.clear();
        filterAndRenderClaims();
        updateBulkActionsUI();
    }
    async function handleNewClaimPdfFiles(files) {
        const validFiles = (files || []).filter(f => f && f.type === 'application/pdf');
        if (!validFiles.length) {
            alert('Por favor selecciona archivos PDF válidos.');
            return;
        }

        if (typeof pdfjsLib === 'undefined') {
            alert('No se pudo cargar pdf.js para procesar el documento.');
            return;
        }

        const createdClaims = [];

        for (const file of validFiles) {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const rawText = await extractFullTextFromPdf(arrayBuffer);
                const metadata = parseClaimMetadataFromPdfText(rawText);

                if (!metadata || (!metadata.claimNumber && !metadata.plate)) {
                    console.warn('PDF sin datos suficientes para crear siniestro:', file.name);
                    continue;
                }

                const created = createClaimFromData(metadata);

                try {
                    const valuation = parseValuationFromText(rawText, file.name);
                    const controlOps = extractOperacionesDeControl(rawText);
                    if (valuation) {
                        valuation.summary = valuation.summary || valuation.economics || {};
                        valuation.summary.controlOperations = controlOps;
                    }
                    if (!valuation || !valuation.economics || !Array.isArray(valuation.items)) {
                        console.warn('Valoración inválida devuelta por parseValuationFromText', valuation);
                    }
                    saveValuationForClaim(created.id, valuation || {
                        economics: {
                            bodyworkValue: null,
                            mechatronicsValue: null,
                            materialsValue: null,
                            paintTotal: null,
                            partsValueNet: null,
                            laborValueNet: null,
                            subtotalValuation: null,
                            deductible: null,
                            totalWithTax: null,
                            lossPercentage: null
                        },
                        summary: {
                            controlOperations: controlOps
                        },
                        items: [],
                        document: {
                            fileName: file.name,
                            uploadedAt: new Date().toISOString()
                        }
                    });
                } catch (err) {
                    console.error('Error procesando valoración del PDF', file.name, err);
                }

                createdClaims.push(created);
            } catch (err) {
                console.error('Error al procesar PDF para nuevo siniestro', file.name, err);
            }
        }

        if (createdClaims.length) {
            const modalEl = document.getElementById('newClaimModal');
            if (modalEl) modalEl.classList.remove('active');
            showAnalysisToast();
            loadView('claims');
            const last = createdClaims[createdClaims.length - 1];
            const vehicleInfo = `${last.brand} ${last.model} ${last.year}`.trim();
            console.debug('[Kensa Auditorías] Siniestro(s) creado(s) desde PDF:', createdClaims.length, { last: vehicleInfo });
        } else {
            alert('No se pudo crear ningún siniestro desde los PDF cargados.');
        }
    }

    async function handleNewClaimPdfFile(file) {
        if (!file) return;
        await handleNewClaimPdfFiles([file]);
    }

    function generateClaimNumberLikeUI(rawClaimNumber) {
        const cleaned = (rawClaimNumber || '').trim();
        if (cleaned) return cleaned;
        return generateClaimId();
    }

    function normalizePlateValue(plate) {
        return (plate || '').replace(/\s+/g, '').toUpperCase();
    }

    function resolveSelectValue(selectEl, desiredName) {
        if (!selectEl) return desiredName || '';
        const desired = (desiredName || '').trim();
        if (!desired) {
            return selectEl.value || '';
        }
        const normalizedDesired = desired.toLowerCase();
        const options = Array.from(selectEl.options);
        const found = options.find(opt =>
            opt.textContent.trim().toLowerCase() === normalizedDesired ||
            opt.value.trim().toLowerCase() === normalizedDesired
        );

        if (found) {
            selectEl.value = found.value;
            return found.value;
        }

        const opt = document.createElement('option');
        opt.value = `custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        opt.textContent = desiredName;
        selectEl.appendChild(opt);
        selectEl.value = opt.value;
        return opt.value;
    }

    function createClaimFromData({
        claimNumber,
        brand,
        model,
        year,
        plate,
        workshopName,
        adjusterName,
        type,
        pdfMapping,
        ...extraFields
    }) {
        const nowIso = new Date().toISOString();
        const trimmedClaimNumber = (claimNumber || '').trim();
        let finalId = trimmedClaimNumber || generateClaimNumberLikeUI('');
        const workshopSelect = document.getElementById('workshop');
        const adjusterSelect = document.getElementById('adjuster');
        const typeSelect = document.getElementById('claimType');

        const resolvedWorkshop = resolveSelectValue(workshopSelect, workshopName);
        const resolvedAdjuster = resolveSelectValue(adjusterSelect, adjusterName);
        const resolvedType = type || (typeSelect ? typeSelect.value : 'Presencial');

        const getOptionText = (selectEl, value) => {
            if (!selectEl || !value) return '';
            const opt = Array.from(selectEl.options).find(o => o.value === value);
            return opt ? opt.textContent.trim() : '';
        };

        const finalWorkshopName = (workshopName && workshopName.trim())
            ? workshopName.trim()
            : getOptionText(workshopSelect, resolvedWorkshop) || 'Por asignar';

        const finalAdjusterName = (adjusterName && adjusterName.trim())
            ? adjusterName.trim()
            : getOptionText(adjusterSelect, resolvedAdjuster) || 'Sin asignar';

        const formData = {
            id: finalId,
            brand: brand || 'N/D',
            model: model || 'N/D',
            year: year || '',
            plate: normalizePlateValue(plate),
            workshop: finalWorkshopName,
            adjuster: finalAdjusterName,
            status: 'Ingresado',
            sla: 80,
            type: resolvedType,
            pdfMapping,
            createdAt: nowIso,
            updatedAt: nowIso
        };

        const assignIfPresent = (key, value) => {
            if (value !== undefined && value !== null && value !== '') {
                formData[key] = value;
            }
        };

        assignIfPresent('vehicleType', extraFields.vehicleType || extraFields.tipoVehiculo);
        assignIfPresent('tipoVehiculo', extraFields.tipoVehiculo || extraFields.vehicleType);
        assignIfPresent('coverage', extraFields.coverage || extraFields.cobertura);
        assignIfPresent('cobertura', extraFields.cobertura || extraFields.coverage);
        assignIfPresent('vin', extraFields.vin || extraFields.chassis);
    assignIfPresent('valuedBy', extraFields.valuedBy || extraFields.valoradoPor);
    const paintVal = extraFields.paintType || extraFields.tipoPintura || extraFields.pinturaTipo || extraFields.paintMode;
    assignIfPresent('paintType', paintVal);
        assignIfPresent('pinturaTipo', paintVal);
        assignIfPresent('noticeNumber', extraFields.noticeNumber || extraFields.numeroAviso || extraFields.aviso);
        assignIfPresent('numeroAviso', extraFields.numeroAviso || extraFields.noticeNumber);
        assignIfPresent('deductible', extraFields.deductible ?? extraFields.deducible);
        assignIfPresent('deducible', extraFields.deducible ?? extraFields.deductible);
        assignIfPresent('lossType', extraFields.lossType ?? extraFields.perdida);
        assignIfPresent('perdida', extraFields.perdida ?? extraFields.lossType);
        assignIfPresent('workshopCity', extraFields.workshopCity ?? extraFields.ciudadTaller);
        assignIfPresent('ciudadTaller', extraFields.ciudadTaller ?? extraFields.workshopCity);
        assignIfPresent('materials', extraFields.materials ?? extraFields.materiales);
        assignIfPresent('materiales', extraFields.materiales ?? extraFields.materials);
        assignIfPresent('paintTotal', extraFields.paintTotal ?? extraFields.totalPintura);
        assignIfPresent('totalPintura', extraFields.totalPintura ?? extraFields.paintTotal);
        assignIfPresent('totalAmount', extraFields.totalAmount ?? extraFields.total);
        assignIfPresent('total', extraFields.total ?? extraFields.totalAmount);

        const matCLP = parseMoneyCLPStrict(extraFields.materiales ?? extraFields.materials);
        const totPaintCLP = parseMoneyCLPStrict(extraFields.totalPintura ?? extraFields.paintTotal);
        const dedCLP = parseMoneyCLPStrict(extraFields.deducible ?? extraFields.deductible);
        const lossPct = parsePercentStrict(extraFields.perdida ?? extraFields.lossType);

        if ('materialesCLP' in formData && matCLP != null && formData.materialesCLP == null) {
            formData.materialesCLP = matCLP;
        }
        if ('totalPinturaCLP' in formData && totPaintCLP != null && formData.totalPinturaCLP == null) {
            formData.totalPinturaCLP = totPaintCLP;
        }
        if ('deducibleCLP' in formData && dedCLP != null && formData.deducibleCLP == null) {
            formData.deducibleCLP = dedCLP;
        }
        if ('perdidaPct' in formData && lossPct != null && formData.perdidaPct == null) {
            formData.perdidaPct = lossPct;
        }

        return addClaimFromForm(formData) || formData;
    }

    // Toast eliminado: se mantiene la lógica de creación sin mostrar notificaciones emergentes.

    function attachToastPdfHandlers(toastElement) {
        if (!toastElement) return;

        const dropzone = toastElement.querySelector('#toastClaimPdfDropzone');
        const fileInput = toastElement.querySelector('#toastClaimPdfInput');
        if (!dropzone || !fileInput) return;

        const preventDefaults = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, () => {
                dropzone.classList.add('dragover');
                dropzone.classList.add('is-dragover');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, () => {
                dropzone.classList.remove('dragover');
                dropzone.classList.remove('is-dragover');
            });
        });

        dropzone.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', () => {
            const files = Array.from(fileInput.files || []).filter(f => f.type === 'application/pdf');
            if (files.length) {
                handleNewClaimPdfFiles(files);
            }
        });

        dropzone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            if (!dt || !dt.files || !dt.files.length) return;
            const fileList = Array.from(dt.files).filter(f => f.type === 'application/pdf');
            if (fileList.length) {
                handleNewClaimPdfFiles(fileList);
            }
        });
    }

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            if (isClaimDetailView && claimDetailDirty) {
                const confirmClose = window.confirm('¿Está seguro de cerrar sin guardar los cambios?');
                if (!confirmClose) return;
                claimDetailDirty = false;
            }
            // Update Active State
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Load View
            const viewName = item.getAttribute('data-view');
            loadView(viewName);
            if (mobileSidebarMq.matches) {
                closeSidebar();
            }
        });
    });

    function createClaimFromForm() {
        const now = new Date();
        const yearValue = parseInt(document.getElementById('vehicleYear').value, 10);
        const nowIso = now.toISOString();

        const newClaim = {
            id: generateClaimId(),
            brand: document.getElementById('vehicleBrand').value.trim(),
            model: document.getElementById('vehicleModel').value.trim(),
            year: Number.isNaN(yearValue) ? now.getFullYear() : yearValue,
            plate: document.getElementById('vehiclePlate').value.trim().toUpperCase(),
            workshop: document.getElementById('workshop').value,
            status: 'Ingresado',
            sla: 100,
            adjuster: document.getElementById('adjuster').value,
            type: document.getElementById('claimType').value,
            cost: 0,
            date: nowIso.slice(0, 10),
            createdAt: nowIso,
            updatedAt: nowIso,
            description: 'En evaluación. Pendiente de antecedentes.',
            photos: [],
            photoHighlights: [],
            repairItems: []
        };

        claimsState.unshift(newClaim);
        saveClaimsToStorage();
        return newClaim;
    }

    function generateClaimId() {
        let newId;
        do {
            newId = `CLM-2024-${Math.floor(1000 + Math.random() * 9000)}`;
        } while (claimsState.some(claim => claim.id === newId));
        return newId;
    }

    function setClaimsTopBarActions() {
        if (!topBarActions) return;

        topBarActions.classList.add('actions--claims');
        topBarActions.innerHTML = `
            <div class="topbar-search">
                <input type="text" id="searchClaim" placeholder="ID, Patente o Modelo...">
            </div>
            <button id="btnNewClaimTop" class="btn-primary" data-open-new-claim="true" aria-label="Nuevo Siniestro">
                <i class="ph ph-plus"></i>
                <span class="btn-label">Nuevo Siniestro</span>
            </button>
        `;

        const searchInput = document.getElementById('searchClaim');
        if (searchInput) {
            searchInput.addEventListener('input', filterAndRenderClaims);
        }

        const btnNewClaimTop = document.getElementById('btnNewClaimTop');
        if (btnNewClaimTop) {
            btnNewClaimTop.addEventListener('click', () => {
                const modalEl = document.getElementById('newClaimModal');
                if (modalEl) {
                    modalEl.classList.add('active');
                }
            });
        }
    }

    function setDashboardTopBarActions() {
        if (!topBarActions) return;

        topBarActions.classList.add('actions--dashboard');
        topBarActions.innerHTML = `
            <button id="btnDashboardFilters" class="btn-secondary btn-dashboard-filters" type="button" aria-expanded="${dashboardFiltersOpen ? 'true' : 'false'}" aria-controls="dashboardFilters">
                <i class="ph ph-faders-horizontal"></i>
                <span class="btn-label">Filtros</span>
            </button>
        `;

        const btnFilters = document.getElementById('btnDashboardFilters');
        if (btnFilters) {
            btnFilters.addEventListener('click', () => {
                dashboardFiltersOpen = !dashboardFiltersOpen;
                btnFilters.setAttribute('aria-expanded', dashboardFiltersOpen ? 'true' : 'false');
                const filtersCard = contentArea.querySelector('.dashboard-filters');
                if (filtersCard) {
                    filtersCard.classList.toggle('is-open', dashboardFiltersOpen);
                }
            });
        }
    }

    function clearTopBarActions() {
        if (topBarActions) {
            topBarActions.classList.remove('actions--claims');
            topBarActions.classList.remove('actions--dashboard');
            topBarActions.innerHTML = '';
        }
    }

    function setClaimDetailTopBarActions(claimId) {
        if (!topBarActions) return;
        topBarActions.innerHTML = `
            <div style="display:flex; gap:0.5rem;">
                <button id="btnCloseClaimDetail" class="btn-secondary">
                    <i class="ph ph-x"></i> Cerrar
                </button>
                <button id="btnSaveClaimDetail" class="btn-primary">
                    <i class="ph ph-floppy-disk"></i> Guardar cambios
                </button>
            </div>
        `;
        const btnClose = document.getElementById('btnCloseClaimDetail');
        const btnSave = document.getElementById('btnSaveClaimDetail');
        if (btnClose) {
            btnClose.addEventListener('click', () => {
                if (claimDetailDirty) {
                    const confirmClose = window.confirm('¿Está seguro de cerrar sin guardar los cambios?');
                    if (!confirmClose) return;
                }
                claimDetailDirty = false;
                loadView('claims');
            });
        }
        if (btnSave) {
            btnSave.addEventListener('click', () => {
                const claim = claimsState.find(c => c.id === claimId);
                const { changed: committedBeforeModal } = commitClaimDetailEdits(claimId);
                const hadDirtyChanges = claimDetailDirty || committedBeforeModal;
                if (hadDirtyChanges && claim) {
                    touchClaimUpdatedAt(claim);
                }
                saveClaimsToStorage();
                showSaveStatusModal(claim, (option) => {
                    if (!claim) return;
                    if (option === 'volver') return;
                    let statusChanged = false;
                    if (option && option !== 'solo') {
                        const prevStatus = claim.status;
                        if (option !== prevStatus) {
                            claim.status = option;
                            statusChanged = true;
                            addBitacoraEvent(claim, {
                                type: 'status',
                                message: `Cambio de estado: ${prevStatus || '—'} → ${option}`,
                                meta: { from: prevStatus, to: option }
                            });
                        }
                    }
                    const { changed: committedAfterModal } = commitClaimDetailEdits(claimId);
                    if (statusChanged || claimDetailDirty || committedAfterModal) {
                        touchClaimUpdatedAt(claim);
                    }
                    saveClaimsToStorage();
                    claimDetailDirty = false;
                    console.debug('Cambios de siniestro guardados', claimId, option);
                    renderAuditDetail(claimId, claimDetailActiveTab);
                });
            });
        }
    }

    function setClaimsSidebarFilters() {
        if (!sidebarFiltersContainer) return;
        const currentWorkshopSelection = claimsFilterWorkshop || '';
        const workshops = getWorkshopsFromClaims(claimsState);

        const workshopOptions = workshops.map(w => `<option value="${escapeHtml(w)}">${escapeHtml(w)}</option>`).join('');
        const workshopHint = workshops.length === 0
            ? '<small style="color: var(--text-muted); display:block; margin-top: 0.35rem;">Aún no hay talleres.</small>'
            : '';

        sidebarFiltersContainer.innerHTML = `
            <div class="sidebar-filter-group">
                <label for="filterStatus">Estado</label>
                <select id="filterStatus">
                    <option value="">Todos</option>
                    <option value="Ingresado">Ingresado</option>
                    <option value="En revisión">En revisión</option>
                    <option value="Revisar">Revisar</option>
                    <option value="Aprobado">Aprobado</option>
                    <option value="Rechazado">Rechazado</option>
                </select>
            </div>
            <div class="sidebar-filter-group">
                <label for="filterWorkshop">Taller</label>
                <select id="filterWorkshop">
                    <option value="">Todos</option>
                    ${workshopOptions}
                </select>
                ${workshopHint}
            </div>
        `;

        const statusSelect = document.getElementById('filterStatus');
        const workshopSelect = document.getElementById('filterWorkshop');

        if (statusSelect) statusSelect.addEventListener('change', filterAndRenderClaims);
        if (workshopSelect) {
            const normalizedSelection = workshopKey(currentWorkshopSelection);
            const availableKeys = workshops.map(workshopKey);
            if (normalizedSelection && availableKeys.includes(normalizedSelection)) {
                workshopSelect.value = currentWorkshopSelection;
            } else {
                claimsFilterWorkshop = '';
                workshopSelect.value = '';
            }
            workshopSelect.addEventListener('change', () => {
                claimsFilterWorkshop = workshopSelect.value;
                filterAndRenderClaims();
            });
        }
    }

    function setDashboardSidebarFilters() {
        if (!sidebarFiltersContainer) return;
        sidebarFiltersContainer.innerHTML = `
            <div class="sidebar-filter-group">
                <label for="dashboardStartDate">Fecha desde</label>
                <input type="date" id="dashboardStartDate" value="${dashboardFilterStart}">
            </div>
            <div class="sidebar-filter-group">
                <label for="dashboardEndDate">Fecha hasta</label>
                <input type="date" id="dashboardEndDate" value="${dashboardFilterEnd}">
            </div>
            <div class="sidebar-filter-group">
                <button id="dashboardClearDates" class="btn-secondary" type="button">Limpiar rango</button>
            </div>
        `;
        const startInput = document.getElementById('dashboardStartDate');
        const endInput = document.getElementById('dashboardEndDate');
        const clearBtn = document.getElementById('dashboardClearDates');
        if (startInput) {
            startInput.addEventListener('change', () => {
                dashboardFilterStart = startInput.value;
                dashboardResultsPage = 1;
                renderDashboard();
            });
        }
        if (endInput) {
            endInput.addEventListener('change', () => {
                dashboardFilterEnd = endInput.value;
                dashboardResultsPage = 1;
                renderDashboard();
            });
        }
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                dashboardFilterStart = '';
                dashboardFilterEnd = '';
                dashboardResultsPage = 1;
                renderDashboard();
            });
        }
    }

    function clearSidebarFilters() {
        if (sidebarFiltersContainer) {
            sidebarFiltersContainer.innerHTML = '';
        }
    }

    // ===== Clientes helpers =====
    const normalizarRut = (rut) => (rut || '').replace(/\./g, '').replace(/\s+/g, '').toUpperCase();

    function validarRut(rut) {
        const clean = normalizarRut(rut);
        if (!/^\d{1,8}-?[\dkK]$/.test(clean)) return false;
        const [numStr, dvRaw] = clean.includes('-') ? clean.split('-') : [clean.slice(0, -1), clean.slice(-1)];
        const dv = dvRaw.toUpperCase();
        let suma = 0;
        let mul = 2;
        for (let i = numStr.length - 1; i >= 0; i--) {
            suma += parseInt(numStr[i], 10) * mul;
            mul = mul === 7 ? 2 : mul + 1;
        }
        const res = 11 - (suma % 11);
        const dvCalc = res === 11 ? '0' : res === 10 ? 'K' : String(res);
        return dvCalc === dv;
    }

    function formatearRut(rut) {
        const clean = normalizarRut(rut);
        const [numStr, dvRaw] = clean.includes('-') ? clean.split('-') : [clean.slice(0, -1), clean.slice(-1)];
        return `${numStr}-${dvRaw}`;
    }

    function setFormError(fieldId, message) {
        const field = document.getElementById(fieldId);
        const err = document.querySelector(`[data-error-for="${fieldId}"]`);
        if (field) field.classList.toggle('input-error', !!message);
        if (err) err.textContent = message || '';
    }

    function loadView(viewName) {
        if (isClaimDetailView) {
            isClaimDetailView = false;
            claimDetailDirty = false;
            setSidebarCollapsed(false);
        }
        if (mobileSidebarMq.matches) {
            closeSidebar();
        }
        contentArea.innerHTML = ''; // Clear current content
        clearTopBarActions();
        clearSidebarFilters();
        document.body.classList.toggle('is-claims-view', viewName === 'claims');
        navItems.forEach(nav => {
            const navView = nav.getAttribute('data-view');
            nav.classList.toggle('active', navView === viewName);
        });

        switch (viewName) {
            case 'dashboard':
                pageTitle.textContent = 'Dashboard';
                dashboardFiltersOpen = false;
                setDashboardTopBarActions();
                setDashboardSidebarFilters();
                renderDashboard();
                break;
            case 'usuarios':
                pageTitle.textContent = 'Usuarios';
                renderUsuariosView();
                break;
            case 'clientes':
                pageTitle.textContent = 'Clientes';
                renderClientesView();
                break;
            case 'claims':
                pageTitle.innerHTML = `
                    <span class="page-title-text">Gestión de Siniestros</span>
                    <img id="clienteLogoTopbar" class="page-title-logo" alt="Logo cliente">
                `;
                setClaimsTopBarActions();
                setClaimsSidebarFilters();
                claimsCurrentPage = 1;
                renderClaimsList();
                renderClienteLogoHeader();
                break;
            case 'audits':
                pageTitle.textContent = 'Auditoría de Reparaciones';
                renderAuditDetail(); // Showing one detail for demo
                break;
            case 'reports':
                pageTitle.textContent = 'Análisis y Reportes';
                renderReports();
                break;
        }
        scheduleTopBarOffset();
    }

    // --- View Renderers ---

    function renderUsuarios() {
        const html = `
            <div class="fade-in">
                <div class="card">
                    <h2 style="margin-bottom:0.5rem;">Gestión de usuarios</h2>
                    <p style="color: var(--text-muted);">Sección en construcción.</p>
                </div>
            </div>
        `;
        contentArea.innerHTML = html;
    }

    function renderUsuariosView() {
        const tpl = document.getElementById('usuariosViewTemplate');
        if (!tpl) {
            contentArea.innerHTML = '<p style="padding:1rem;">No se encontró la vista de Usuarios.</p>';
            return;
        }
        contentArea.innerHTML = '';
        contentArea.appendChild(tpl.content.cloneNode(true));
        usuariosCurrentPage = 1;
        initUsuariosView();
    }

    function initUsuariosView() {
        loadUsuariosFromStorage();
        const searchInput = document.getElementById('searchUsuario');
        const rolSelect = document.getElementById('filterRolUsuario');
        const estadoSelect = document.getElementById('filterEstadoUsuario');
        const btnNuevo = document.getElementById('btnNuevoUsuario');
        const btnCerrar = document.getElementById('btnCerrarModalUsuario');
        const btnCancelar = document.getElementById('btnCancelarUsuario');
        const btnGuardar = document.getElementById('btnGuardarUsuario');
        const modalUsuario = document.getElementById('modalUsuario');

        if (searchInput) {
            searchInput.value = usuariosSearchText;
            searchInput.addEventListener('input', () => {
                usuariosSearchText = searchInput.value.toLowerCase();
                usuariosCurrentPage = 1;
                renderUsuariosTabla();
            });
        }
        if (rolSelect) {
            rolSelect.value = usuariosFilterRol;
            rolSelect.addEventListener('change', () => {
                usuariosFilterRol = rolSelect.value;
                usuariosCurrentPage = 1;
                renderUsuariosTabla();
            });
        }
        if (estadoSelect) {
            estadoSelect.value = usuariosFilterEstado;
            estadoSelect.addEventListener('change', () => {
                usuariosFilterEstado = estadoSelect.value;
                usuariosCurrentPage = 1;
                renderUsuariosTabla();
            });
        }
        if (btnNuevo) btnNuevo.addEventListener('click', () => openUsuarioModal());
        if (btnCerrar) btnCerrar.addEventListener('click', cerrarModalUsuario);
        if (btnCancelar) btnCancelar.addEventListener('click', cerrarModalUsuario);
        if (btnGuardar) btnGuardar.addEventListener('click', guardarUsuarioDesdeFormulario);
        if (modalUsuario) {
            modalUsuario.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal-backdrop')) cerrarModalUsuario();
            });
        }

        renderUsuariosTabla();
    }

    function getUsuariosFiltrados() {
        return usuariosState.filter(u => {
            const term = usuariosSearchText.trim().toLowerCase();
            const matchTexto = !term ||
                u.nombre.toLowerCase().includes(term) ||
                u.rut.toLowerCase().includes(term) ||
                (u.email || '').toLowerCase().includes(term);
            const matchRol = usuariosFilterRol === 'TODOS' || u.rol === usuariosFilterRol;
            const matchEstado = usuariosFilterEstado === 'TODOS' || u.estado === usuariosFilterEstado;
            return matchTexto && matchRol && matchEstado;
        });
    }

    function getClientesDisponibles() {
        // Usamos el estado en memoria; si no está cargado, lo cargamos
        if (!clientesState || !clientesState.length) {
            loadClientesFromStorage();
        }
        return (clientesState || []).filter(c => c.estado !== 'INACTIVO');
    }

    function poblarSelectClientesUsuario(selectedId) {
        const select = document.getElementById('usuarioClienteId');
        if (!select) return;
        const clientes = getClientesDisponibles();
        select.innerHTML = '';

        const optEmpty = document.createElement('option');
        optEmpty.value = '';
        optEmpty.textContent = 'Sin cliente asociado';
        select.appendChild(optEmpty);

        clientes.forEach(cli => {
            const opt = document.createElement('option');
            opt.value = cli.id;
            opt.textContent = `${cli.nombre} (${cli.rut})`;
            if (selectedId && selectedId === cli.id) {
                opt.selected = true;
            }
            select.appendChild(opt);
        });
    }

    function renderPaginacionUsuarios(totalPages) {
        const cont = document.getElementById('paginacionUsuarios');
        if (!cont) return;
        cont.innerHTML = '';
        if (totalPages <= 1) return;

        const prevBtn = document.createElement('button');
        prevBtn.className = 'btn-secondary btn-sm';
        prevBtn.textContent = 'Anterior';
        prevBtn.disabled = usuariosCurrentPage === 1;
        prevBtn.addEventListener('click', () => {
            usuariosCurrentPage = Math.max(1, usuariosCurrentPage - 1);
            renderUsuariosTabla();
        });

        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn-secondary btn-sm';
        nextBtn.textContent = 'Siguiente';
        nextBtn.disabled = usuariosCurrentPage === totalPages;
        nextBtn.addEventListener('click', () => {
            usuariosCurrentPage = Math.min(totalPages, usuariosCurrentPage + 1);
            renderUsuariosTabla();
        });

        const label = document.createElement('span');
        label.style.alignSelf = 'center';
        label.style.margin = '0 0.5rem';
        label.textContent = `Página ${usuariosCurrentPage} de ${totalPages}`;

        cont.appendChild(prevBtn);
        cont.appendChild(label);
        cont.appendChild(nextBtn);
    }

    function renderUsuariosTabla() {
        const tbody = document.getElementById('tbodyUsuarios');
        if (!tbody) return;
        const usuarios = getUsuariosFiltrados();
        const totalPages = Math.max(1, Math.ceil(usuarios.length / usuariosPageSize));
        usuariosCurrentPage = Math.min(usuariosCurrentPage, totalPages);
        const start = (usuariosCurrentPage - 1) * usuariosPageSize;
        const pageItems = usuarios.slice(start, start + usuariosPageSize);

        tbody.innerHTML = '';
        const clientes = getClientesDisponibles();
        const mapClientes = {};
        clientes.forEach(c => {
            mapClientes[c.id] = `${c.nombre} (${c.rut})`;
        });

        pageItems.forEach(usuario => {
            const nombreCliente = usuario.clienteId ? (mapClientes[usuario.clienteId] || 'Cliente no disponible') : '-';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${usuario.rut}</td>
                <td>${usuario.nombre}</td>
                <td>${usuario.email || '-'}</td>
                <td>${usuario.telefono || '-'}</td>
                <td>${usuario.rol}</td>
                <td>${nombreCliente}</td>
                <td>${usuario.estado === 'ACTIVO' ? 'Activo' : 'Inactivo'}</td>
                <td>${usuario.ultimoAcceso ? new Date(usuario.ultimoAcceso).toLocaleString('es-CL') : '-'}</td>
                <td class="text-right">
                    <button class="btn btn-sm btn-link" data-action="edit" data-id="${usuario.id}">Editar</button>
                    <button class="btn btn-sm btn-link ${usuario.estado === 'ACTIVO' ? 'text-danger' : ''}" data-action="toggle" data-id="${usuario.id}">
                        ${usuario.estado === 'ACTIVO' ? 'Inactivar' : 'Activar'}
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('button[data-action="edit"]').forEach(btn => {
            btn.addEventListener('click', () => openUsuarioModal(btn.dataset.id));
        });
        tbody.querySelectorAll('button[data-action="toggle"]').forEach(btn => {
            btn.addEventListener('click', () => toggleEstadoUsuario(btn.dataset.id));
        });

        renderPaginacionUsuarios(totalPages);
    }

    function clearUsuarioFormErrors() {
        ['usuarioRut', 'usuarioNombre', 'usuarioEmail', 'usuarioRol'].forEach(id => setFormError(id, ''));
    }

    function openUsuarioModal(idUsuario) {
        const modal = document.getElementById('modalUsuario');
        if (!modal) return;
        const titulo = document.getElementById('modalUsuarioTitulo');
        clearUsuarioFormErrors();
        const form = document.getElementById('formUsuario');
        if (form) form.reset();

        usuarioEnEdicionId = idUsuario || null;
        if (idUsuario) {
            const usuario = usuariosState.find(u => u.id === idUsuario);
            if (!usuario) return;
            if (titulo) titulo.textContent = 'Editar Usuario';
            document.getElementById('usuarioRut').value = usuario.rut;
            document.getElementById('usuarioNombre').value = usuario.nombre;
            document.getElementById('usuarioEmail').value = usuario.email || '';
            document.getElementById('usuarioTelefono').value = usuario.telefono || '';
            document.getElementById('usuarioRol').value = usuario.rol || '';
            document.getElementById('usuarioEstado').value = usuario.estado || 'ACTIVO';
            document.getElementById('usuarioObservaciones').value = usuario.observaciones || '';
            if (document.getElementById('usuarioPassword')) {
                document.getElementById('usuarioPassword').value = '';
            }
            poblarSelectClientesUsuario(usuario.clienteId || '');
        } else {
            if (titulo) titulo.textContent = 'Nuevo Usuario';
            const estado = document.getElementById('usuarioEstado');
            if (estado) estado.value = 'ACTIVO';
            poblarSelectClientesUsuario('');
        }

        modal.classList.add('active');
    }

    function cerrarModalUsuario() {
        const modal = document.getElementById('modalUsuario');
        if (modal) modal.classList.remove('active');
        usuarioEnEdicionId = null;
        clearUsuarioFormErrors();
    }

    function validarUsuarioFormulario(data) {
        const errores = {};
        if (!data.rut || !validarRut(data.rut)) {
            errores.usuarioRut = 'RUT inválido.';
        }
        if (!data.nombre || data.nombre.trim().length < 3) {
            errores.usuarioNombre = 'Nombre obligatorio (mínimo 3 caracteres).';
        }
        if (!data.email) {
            errores.usuarioEmail = 'El correo es obligatorio.';
        } else {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(data.email)) {
                errores.usuarioEmail = 'Formato de correo inválido.';
            }
        }
        if (!data.rol) {
            errores.usuarioRol = 'Debes seleccionar un rol.';
        }
        if (data.clienteId) {
            const clientes = getClientesDisponibles();
            const existe = clientes.some(c => c.id === data.clienteId);
            if (!existe) {
                errores.usuarioClienteId = 'El cliente seleccionado ya no está disponible.';
            }
        }
        return errores;
    }

    function guardarUsuarioDesdeFormulario() {
        const data = {
            rut: document.getElementById('usuarioRut')?.value.trim() || '',
            nombre: document.getElementById('usuarioNombre')?.value.trim() || '',
            email: document.getElementById('usuarioEmail')?.value.trim() || '',
            telefono: document.getElementById('usuarioTelefono')?.value.trim() || '',
            rol: document.getElementById('usuarioRol')?.value || '',
            estado: document.getElementById('usuarioEstado')?.value || 'ACTIVO',
            password: document.getElementById('usuarioPassword')?.value || '',
            observaciones: document.getElementById('usuarioObservaciones')?.value.trim() || '',
            clienteId: document.getElementById('usuarioClienteId')?.value || ''
        };

        const errores = validarUsuarioFormulario(data);
        clearUsuarioFormErrors();
        Object.entries(errores).forEach(([fieldId, msg]) => setFormError(fieldId, msg));
        if (Object.keys(errores).length) return;

        const ahora = new Date().toISOString();
        data.rut = formatearRut(data.rut);

        if (usuarioEnEdicionId) {
            const idx = usuariosState.findIndex(u => u.id === usuarioEnEdicionId);
            if (idx !== -1) {
                usuariosState[idx] = {
                    ...usuariosState[idx],
                    rut: data.rut,
                    nombre: data.nombre,
                    email: data.email,
                    telefono: data.telefono,
                    rol: data.rol,
                    estado: data.estado,
                    observaciones: data.observaciones,
                    clienteId: data.clienteId,
                    actualizadoEn: ahora
                };
            }
        } else {
            usuariosState.push({
                id: `usr_${Date.now()}`,
                rut: data.rut,
                nombre: data.nombre,
                email: data.email,
                telefono: data.telefono,
                rol: data.rol,
                estado: data.estado || 'ACTIVO',
                ultimoAcceso: null,
                observaciones: data.observaciones,
                clienteId: data.clienteId,
                creadoEn: ahora,
                actualizadoEn: ahora
            });
        }

        saveUsuariosToStorage();
        cerrarModalUsuario();
        renderUsuariosTabla();
    }

    function toggleEstadoUsuario(id) {
        const idx = usuariosState.findIndex(u => u.id === id);
        if (idx === -1) return;
        usuariosState[idx].estado = usuariosState[idx].estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
        usuariosState[idx].actualizadoEn = new Date().toISOString();
        saveUsuariosToStorage();
        renderUsuariosTabla();
    }

    function renderClientesView() {
        const tpl = document.getElementById('clientesViewTemplate');
        if (!tpl) {
            contentArea.innerHTML = '<p style="padding:1rem;">No se encontró la vista de Clientes.</p>';
            return;
        }
        contentArea.innerHTML = '';
        contentArea.appendChild(tpl.content.cloneNode(true));
        clientesCurrentPage = 1;
        initClientesView();
    }

    function initClientesView() {
        loadClientesFromStorage();
        const searchInput = document.getElementById('searchCliente');
        const estadoSelect = document.getElementById('filterEstadoCliente');
        const btnNuevo = document.getElementById('btnNuevoCliente');
        const btnCerrar = document.getElementById('btnCerrarModalCliente');
        const btnCancelar = document.getElementById('btnCancelarCliente');
        const btnGuardar = document.getElementById('btnGuardarCliente');

        if (searchInput) {
            searchInput.value = clientesSearchText;
            searchInput.addEventListener('input', () => {
                clientesSearchText = searchInput.value.toLowerCase();
                clientesCurrentPage = 1;
                renderClientesTabla();
            });
        }
        if (estadoSelect) {
            estadoSelect.value = clientesFilterEstado;
            estadoSelect.addEventListener('change', () => {
                clientesFilterEstado = estadoSelect.value;
                clientesCurrentPage = 1;
                renderClientesTabla();
            });
        }
        if (btnNuevo) {
            btnNuevo.addEventListener('click', () => openClienteModal());
        }
        if (btnCerrar) btnCerrar.addEventListener('click', cerrarModalCliente);
        if (btnCancelar) btnCancelar.addEventListener('click', cerrarModalCliente);
        if (btnGuardar) btnGuardar.addEventListener('click', guardarClienteDesdeFormulario);
        const modalCliente = document.getElementById('modalCliente');
        if (modalCliente) {
            modalCliente.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal-backdrop')) {
                    cerrarModalCliente();
                }
            });
        }
        const logoInput = document.getElementById('clienteLogo');
        if (logoInput) {
            logoInput.value = '';
            logoInput.addEventListener('change', (e) => {
                const file = e.target.files?.[0];
                if (!file) {
                    clienteLogoTemp = null;
                    return;
                }
                const reader = new FileReader();
                reader.onload = (ev) => {
                    clienteLogoTemp = ev.target?.result || null;
                };
                reader.readAsDataURL(file);
            });
        }
        const logoAudInput = document.getElementById('clienteLogoAuditor');
        if (logoAudInput) {
            logoAudInput.value = '';
            logoAudInput.addEventListener('change', (e) => {
                const file = e.target.files?.[0];
                if (!file) {
                    clienteLogoAuditorTemp = null;
                    return;
                }
                const reader = new FileReader();
                reader.onload = (ev) => {
                    clienteLogoAuditorTemp = ev.target?.result || null;
                };
                reader.readAsDataURL(file);
            });
        }

        renderClientesTabla();
    }

    function getClientesFiltrados() {
        return clientesState.filter(c => {
            const matchEstado = clientesFilterEstado === 'TODOS' || c.estado === clientesFilterEstado;
            const text = `${c.rut} ${c.nombre}`.toLowerCase();
            const matchTexto = !clientesSearchText || text.includes(clientesSearchText);
            return matchEstado && matchTexto;
        });
    }

    function renderPaginacionClientes(totalPages) {
        const cont = document.getElementById('paginacionClientes');
        if (!cont) return;
        cont.innerHTML = '';
        if (totalPages <= 1) return;

        const prevBtn = document.createElement('button');
        prevBtn.className = 'btn-secondary btn-sm';
        prevBtn.textContent = 'Anterior';
        prevBtn.disabled = clientesCurrentPage === 1;
        prevBtn.addEventListener('click', () => {
            clientesCurrentPage = Math.max(1, clientesCurrentPage - 1);
            renderClientesTabla();
        });

        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn-secondary btn-sm';
        nextBtn.textContent = 'Siguiente';
        nextBtn.disabled = clientesCurrentPage === totalPages;
        nextBtn.addEventListener('click', () => {
            clientesCurrentPage = Math.min(totalPages, clientesCurrentPage + 1);
            renderClientesTabla();
        });

        const label = document.createElement('span');
        label.style.alignSelf = 'center';
        label.style.margin = '0 0.5rem';
        label.textContent = `Página ${clientesCurrentPage} de ${totalPages}`;

        cont.appendChild(prevBtn);
        cont.appendChild(label);
        cont.appendChild(nextBtn);
    }

    function renderClientesTabla() {
        const tbody = document.getElementById('tbodyClientes');
        if (!tbody) return;
        const clientes = getClientesFiltrados();
        const totalPages = Math.max(1, Math.ceil(clientes.length / clientesPageSize));
        clientesCurrentPage = Math.min(clientesCurrentPage, totalPages);
        const start = (clientesCurrentPage - 1) * clientesPageSize;
        const pageItems = clientes.slice(start, start + clientesPageSize);

        tbody.innerHTML = '';
        pageItems.forEach(cliente => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${cliente.rut}</td>
                <td>${cliente.nombre}</td>
                <td>${cliente.email || '-'}</td>
                <td>${cliente.telefono || '-'}</td>
                <td>${cliente.comuna || '-'}</td>
                <td>${cliente.estado === 'ACTIVO' ? 'Activo' : 'Inactivo'}</td>
                <td class="text-right">
                    <button class="btn btn-sm btn-link" data-action="edit" data-id="${cliente.id}">Editar</button>
                    <button class="btn btn-sm btn-link text-danger" data-action="delete" data-id="${cliente.id}">Eliminar</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('button[data-action="edit"]').forEach(btn => {
            btn.addEventListener('click', () => openClienteModal(btn.dataset.id));
        });
        tbody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', () => deleteCliente(btn.dataset.id));
        });

        renderPaginacionClientes(totalPages);
    }

    function limpiarErroresCliente() {
        ['clienteRut', 'clienteNombre', 'clienteEmail'].forEach(id => setFormError(id, ''));
    }

    function openClienteModal(id) {
        const modal = document.getElementById('modalCliente');
        if (!modal) return;
        limpiarErroresCliente();
        clienteEnEdicionId = id || null;
        const isEdit = !!id;
        const cliente = clientesState.find(c => c.id === id);

        const setVal = (idField, value) => {
            const el = document.getElementById(idField);
            if (el) el.value = value ?? '';
        };

        if (isEdit && cliente) {
            document.getElementById('modalClienteTitulo').textContent = 'Editar Cliente';
            setVal('clienteRut', cliente.rut);
            setVal('clienteNombre', cliente.nombre);
            setVal('clienteEmail', cliente.email);
            setVal('clienteTelefono', cliente.telefono);
            setVal('clienteComuna', cliente.comuna);
            setVal('clienteDireccion', cliente.direccion);
            setVal('clienteTipo', cliente.tipo);
            setVal('clienteEstado', cliente.estado);
            setVal('clienteHhMo', cliente.hhMo);
            setVal('clienteHhPinBicapa', cliente.hhPinBicapa);
            setVal('clienteHhPinTricapa', cliente.hhPinTricapa);
            setVal('clienteValorUf', cliente.valorUf);
            clienteLogoTemp = cliente.logo || null;
            clienteLogoAuditorTemp = cliente.logoAuditor || null;
        } else {
            document.getElementById('modalClienteTitulo').textContent = 'Nuevo Cliente';
            ['clienteRut', 'clienteNombre', 'clienteEmail', 'clienteTelefono', 'clienteComuna', 'clienteDireccion', 'clienteHhMo', 'clienteHhPinBicapa', 'clienteHhPinTricapa', 'clienteValorUf'].forEach(idField => {
                setVal(idField, '');
            });
            setVal('clienteTipo', 'PERSONA');
            setVal('clienteEstado', 'ACTIVO');
            clienteLogoTemp = null;
            clienteLogoAuditorTemp = null;
            const logoInput = document.getElementById('clienteLogo');
            if (logoInput) logoInput.value = '';
            const logoAudInput = document.getElementById('clienteLogoAuditor');
            if (logoAudInput) logoAudInput.value = '';
        }

        modal.classList.add('active');
    }

    function cerrarModalCliente() {
        const modal = document.getElementById('modalCliente');
        if (modal) modal.classList.remove('active');
        clienteEnEdicionId = null;
        limpiarErroresCliente();
        clienteLogoTemp = null;
        clienteLogoAuditorTemp = null;
        const logoInput = document.getElementById('clienteLogo');
        if (logoInput) logoInput.value = '';
        const logoAudInput = document.getElementById('clienteLogoAuditor');
        if (logoAudInput) logoAudInput.value = '';
    }

    function validarClienteFormulario(data) {
        const errors = {};
        if (!data.rut || !validarRut(data.rut)) {
            errors.clienteRut = 'RUT inválido';
        }
        if (!data.nombre || !data.nombre.trim()) {
            errors.clienteNombre = 'Nombre requerido';
        }
        if (data.email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(data.email)) {
                errors.clienteEmail = 'Correo inválido';
            }
        }
        return errors;
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (ev) => resolve(ev.target?.result || null);
            reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo.'));
            reader.readAsDataURL(file);
        });
    }

    async function resolveLogoData(inputEl, fallback) {
        const file = inputEl?.files?.[0];
        if (!file) return fallback || null;
        try {
            const result = await readFileAsDataUrl(file);
            return typeof result === 'string' ? result : (fallback || null);
        } catch (err) {
            console.warn('No se pudo leer el archivo de logo:', err);
            return fallback || null;
        }
    }

    async function guardarClienteDesdeFormulario() {
        const toNumberOrEmpty = (val) => {
            const n = Number(String(val).replace(',', '.'));
            return Number.isFinite(n) ? n : '';
        };

        const baseData = {
            rut: document.getElementById('clienteRut')?.value.trim() || '',
            nombre: document.getElementById('clienteNombre')?.value.trim() || '',
            email: document.getElementById('clienteEmail')?.value.trim() || '',
            telefono: document.getElementById('clienteTelefono')?.value.trim() || '',
            comuna: document.getElementById('clienteComuna')?.value.trim() || '',
            direccion: document.getElementById('clienteDireccion')?.value.trim() || '',
            tipo: document.getElementById('clienteTipo')?.value || 'PERSONA',
            estado: document.getElementById('clienteEstado')?.value || 'ACTIVO',
            hhMo: toNumberOrEmpty(document.getElementById('clienteHhMo')?.value || ''),
            hhPinBicapa: toNumberOrEmpty(document.getElementById('clienteHhPinBicapa')?.value || ''),
            hhPinTricapa: toNumberOrEmpty(document.getElementById('clienteHhPinTricapa')?.value || ''),
            valorUf: toNumberOrEmpty(document.getElementById('clienteValorUf')?.value || '')
        };

        const errors = validarClienteFormulario(baseData);
        limpiarErroresCliente();
        Object.entries(errors).forEach(([fieldId, msg]) => setFormError(fieldId, msg));
        if (Object.keys(errors).length) return;

        const logoInput = document.getElementById('clienteLogo');
        const logoAudInput = document.getElementById('clienteLogoAuditor');
        const [logo, logoAuditor] = await Promise.all([
            resolveLogoData(logoInput, clienteLogoTemp),
            resolveLogoData(logoAudInput, clienteLogoAuditorTemp)
        ]);

        const data = {
            ...baseData,
            logo,
            logoAuditor
        };

        const nowIso = new Date().toISOString();
        data.rut = formatearRut(data.rut);

        if (clienteEnEdicionId) {
            const idx = clientesState.findIndex(c => c.id === clienteEnEdicionId);
            if (idx !== -1) {
                clientesState[idx] = { ...clientesState[idx], ...data, actualizadoEn: nowIso };
            }
        } else {
            clientesState.push({
                id: `cli_${Date.now()}`,
                ...data,
                creadoEn: nowIso,
                actualizadoEn: nowIso
            });
        }
        saveClientesToStorage();
        cerrarModalCliente();
        renderClientesTabla();
        renderClienteLogoHeader();
    }

    function deleteCliente(id) {
        const idx = clientesState.findIndex(c => c.id === id);
        if (idx !== -1) {
            clientesState[idx].estado = 'INACTIVO';
            clientesState[idx].actualizadoEn = new Date().toISOString();
            saveClientesToStorage();
            renderClientesTabla();
        }
    }

    function renderClienteLogoHeader() {
        const logoEl = document.getElementById('clienteLogoHeader');
        const topbarLogoEl = document.getElementById('clienteLogoTopbar');
        const activoConLogo = clientesState.find(c => c.logo);
        if (activoConLogo && activoConLogo.logo) {
            if (logoEl) {
                logoEl.src = activoConLogo.logo;
                logoEl.style.display = 'block';
            }
            if (topbarLogoEl) {
                topbarLogoEl.src = activoConLogo.logo;
                topbarLogoEl.dataset.hasLogo = 'true';
                topbarLogoEl.style.removeProperty('display');
            }
        } else {
            if (logoEl) {
                logoEl.removeAttribute('src');
                logoEl.style.display = 'none';
            }
            if (topbarLogoEl) {
                topbarLogoEl.removeAttribute('src');
                topbarLogoEl.dataset.hasLogo = 'false';
                topbarLogoEl.style.removeProperty('display');
            }
        }
    }

    function renderDashboard() {
        const responsiveMq = typeof window.matchMedia === 'function'
            ? window.matchMedia('(max-width: 768px)')
            : { matches: false };
        const maxDashboardResultsPageSize = responsiveMq.matches ? 20 : 50;
        if (dashboardResultsPageSize > maxDashboardResultsPageSize) {
            dashboardResultsPageSize = maxDashboardResultsPageSize;
        }
        const claims = getDashboardFilteredClaims();
        const activeCount = claims.length;
        const totalPages = Math.max(1, Math.ceil(activeCount / dashboardResultsPageSize));
        if (dashboardResultsPage > totalPages) {
            dashboardResultsPage = totalPages;
        }
        if (dashboardResultsPage < 1) {
            dashboardResultsPage = 1;
        }
        const pageStart = (dashboardResultsPage - 1) * dashboardResultsPageSize;
        const pageEnd = pageStart + dashboardResultsPageSize;
        const pagedClaims = claims.slice(pageStart, pageEnd);
        const dashboardResultsInfo = `Página ${dashboardResultsPage} de ${totalPages}`;
        const hasDashboardResults = activeCount > 0;
        const criticalSla = claims.filter(claim => claim.sla < 20).length;
        const pendingAudits = claims.filter(claim => claim.status === 'Ingresado').length;
        const { avgUf, sampleCount } = computeAverageSubtotalUf(claims);
        const { avgAdjUf } = computeAverageAdjustedCostUf(claims);
        const deviationPct = avgUf > 0 ? Math.max(0, ((avgUf - avgAdjUf) / avgUf) * 100) : 0;
        const deviationDisplay = `${deviationPct.toFixed(1)}%`;
        let deviationColor = 'var(--text-muted)';
        let deviationLabel = 'Sin desviación';
        if (deviationPct >= 16) {
            deviationColor = 'var(--danger)';
            deviationLabel = 'Deficiente';
        } else if (deviationPct >= 11) {
            deviationColor = 'var(--warning)';
            deviationLabel = 'Aceptable';
        } else if (deviationPct >= 1) {
            deviationColor = 'var(--success)';
            deviationLabel = 'Bueno';
        }
        const { avgPartsUf, avgLaborUf } = computeAveragePartsLaborUf(claims);
        const formattedAvgCost = sampleCount > 0
            ? `${avgUf.toLocaleString('es-CL', { maximumFractionDigits: 2 })} UF`
            : 'UF 0';
        const costCardTitleRaw =
            `Promedio Valor Repuestos: ${avgPartsUf.toLocaleString('es-CL', { maximumFractionDigits: 2 })} UF` +
            ` / Promedio Valor Mano de Obra: ${avgLaborUf.toLocaleString('es-CL', { maximumFractionDigits: 2 })} UF`;
        const costCardTitle = escapeHtml(costCardTitleRaw);
        const uniqueSorted = (arr) => Array.from(new Set(arr.filter(v => !!v && String(v).trim()))).sort((a, b) => a.localeCompare(b, 'es'));
        const adjusterOptions = uniqueSorted(claimsState.map(c => c.adjuster || '')).map(val => `<option value="${escapeHtml(val)}"${dashboardFilterAdjuster === val ? ' selected' : ''}>${escapeHtml(val)}</option>`).join('');
        const valuatorOptions = uniqueSorted(claimsState.map(c => c.valuedBy || c.valorador || c.evaluator || '')).map(val => `<option value="${escapeHtml(val)}"${dashboardFilterValuator === val ? ' selected' : ''}>${escapeHtml(val)}</option>`).join('');
        const workshopOptions = uniqueSorted(claimsState.map(c => c.workshop || '')).map(val => `<option value="${escapeHtml(val)}"${dashboardFilterWorkshop === val ? ' selected' : ''}>${escapeHtml(val)}</option>`).join('');
        const cityOptions = uniqueSorted(claimsState.map(c => c.workshopCity || '')).map(val => `<option value="${escapeHtml(val)}"${dashboardFilterCity === val ? ' selected' : ''}>${escapeHtml(val)}</option>`).join('');
        const ufVal = getEffectiveUfValue();
        const pickMoneyValue = (...candidates) => {
            for (const val of candidates) {
                if (typeof val === 'number' && Number.isFinite(val)) return val;
                const parsed = parseMoneyCLPStrict(val);
                if (parsed != null) return parsed;
            }
            return null;
        };
        const formatClpValue = (value) => (Number.isFinite(value) ? fmtCLP(value) : '-');
        const formatUfValue = (value) => (Number.isFinite(value) ? `${value.toFixed(2)} UF` : '-');
        const safeText = (value) => escapeHtml(value === null || value === undefined || value === '' ? '-' : String(value));
        const getDashboardClaimEntry = (claim) => {
            const valuation = pickPreferredValuation(claim);
            const summary = valuation?.summary || {};
            const audit = valuation && claim.auditByValuation ? claim.auditByValuation[valuation.id] || null : null;
            return {
                id: claim.id || '',
                adjuster: claim.adjuster || claim.liquidator || '',
                valuator: claim.valuedBy || claim.valorador || claim.evaluator || (valuation?.document?.uploadedBy) || '',
                workshop: claim.workshop || claim.taller || '',
                brand: claim.brand || '',
                model: claim.model || '',
                plate: claim.plate || claim.patente || '',
                year: claim.year ? String(claim.year) : '',
                chassis: claim.chassis || claim.vin || '',
                paintTotal: pickMoneyValue(
                    summary.paintTotal, summary.totalPaint, summary.totalPintura, summary.valorPintura,
                    claim.totalPinturaCLP, claim.totalPintura, claim.paintTotal, claim.valorPintura
                ),
                partsValue: pickMoneyValue(
                    summary.partsValueNet, summary.valorRepuestos,
                    claim.valorRepuestos, claim.partsValueNet, claim.repuestos
                ),
                bodyworkValue: pickMoneyValue(
                    summary.bodyworkValue, summary.carroceria,
                    claim.bodyworkValue, claim.carroceria
                ),
                mechatronicsValue: pickMoneyValue(
                    summary.mechatronicsValue, summary.mecatronica,
                    claim.mechatronicsValue, claim.mecatronica
                ),
                result: audit?.result || '',
                savingsUf: audit ? getAuditSavingsUf(claim, ufVal) : null
            };
        };
        const dashboardClaimsRows = hasDashboardResults
            ? pagedClaims.map((claim) => {
                const entry = getDashboardClaimEntry(claim);
                return `
                    <tr>
                        <td>${safeText(entry.adjuster)}</td>
                        <td>${safeText(entry.valuator)}</td>
                        <td>${safeText(entry.workshop)}</td>
                        <td>${safeText(entry.brand)}</td>
                        <td>${safeText(entry.model)}</td>
                        <td>${safeText(entry.plate)}</td>
                        <td>${safeText(entry.year)}</td>
                        <td>${safeText(entry.chassis)}</td>
                        <td>${safeText(formatClpValue(entry.paintTotal))}</td>
                        <td>${safeText(formatClpValue(entry.partsValue))}</td>
                        <td>${safeText(formatClpValue(entry.bodyworkValue))}</td>
                        <td>${safeText(formatClpValue(entry.mechatronicsValue))}</td>
                        <td>${safeText(entry.result)}</td>
                        <td>${safeText(formatUfValue(entry.savingsUf))}</td>
                    </tr>
                `;
            }).join('')
            : `
                <tr>
                    <td colspan="14" style="text-align:center; color: var(--text-muted); padding: 1.5rem;">
                        Sin siniestros para los filtros aplicados.
                    </td>
                </tr>
            `;
        const dashboardPageSizeOptions = [5, 10, 20, 50].filter(size => size <= maxDashboardResultsPageSize);
        const dashboardPageSizeOptionsHtml = dashboardPageSizeOptions.map(size => `
            <option value="${size}"${dashboardResultsPageSize === size ? ' selected' : ''}>${size}</option>
        `).join('');
        const dashboardHTML = `
            <div class="fade-in">
                <div class="card dashboard-filters" id="dashboardFilters">
                    <div class="dash-filters-row">
                        <div class="dash-filter">
                            <label for="dashFilterAdjuster">Liquidador</label>
                            <select id="dashFilterAdjuster" class="input-select">
                                <option value="">Todos</option>
                                ${adjusterOptions}
                            </select>
                        </div>
                        <div class="dash-filter">
                            <label for="dashFilterValuator">Valorador</label>
                            <select id="dashFilterValuator" class="input-select">
                                <option value="">Todos</option>
                                ${valuatorOptions}
                            </select>
                        </div>
                        <div class="dash-filter">
                            <label for="dashFilterWorkshop">Taller</label>
                            <select id="dashFilterWorkshop" class="input-select">
                                <option value="">Todos</option>
                                ${workshopOptions}
                            </select>
                        </div>
                        <div class="dash-filter">
                            <label for="dashFilterCity">Ciudad</label>
                            <select id="dashFilterCity" class="input-select">
                                <option value="">Todas</option>
                                ${cityOptions}
                            </select>
                        </div>
                    </div>
                </div>
                <div class="kpi-grid">
                    <div class="card kpi-card">
                        <h3>Siniestros Activos</h3>
                        <div class="kpi-value">${activeCount}</div>
                        <div class="kpi-trend trend-up"><i class="ph ph-trend-up"></i> +12% vs mes anterior</div>
                    </div>
                    <div class="card kpi-card">
                        <h3>Porcentaje de desviación</h3>
                        <div class="kpi-value" style="color: ${deviationColor}">${deviationDisplay}</div>
                        <div class="kpi-trend" style="color:${deviationColor}; font-weight:600;">${deviationLabel}</div>
                    </div>
                    <div class="card kpi-card has-tooltip" data-role="avg-cost-card" title="${costCardTitle}">
                        <h3>Costo Promedio</h3>
                        <div class="kpi-value">${formattedAvgCost}</div>
                        <div class="kpi-trend"><i class="ph ph-minus"></i> Estable</div>
                    </div>
                    <div class="card kpi-card">
                        <h3>Auditorías Pendientes</h3>
                        <div class="kpi-value" style="color: var(--warning)">${pendingAudits}</div>
                        <div class="kpi-trend trend-up"><i class="ph ph-clock"></i> +2 hoy</div>
                    </div>
                </div>

                <div class="fade-in">
                    <div class="grid-layout">
                        <div class="card">
                            <h3>Costo promedio vs Valores sugeridos</h3>
                            <canvas id="timeChart" style="max-height: 300px;"></canvas>
                        </div>
                        <div class="card">
                            <h3>Mix de Repuestos</h3>
                            <canvas id="partsChart" style="max-height: 300px;"></canvas>
                        </div>
                    </div>
                <div class="ranking-grid">
                    <div class="card ranking-card">
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem;">
                            <h3 style="margin:0;">Ranking de Talleres</h3>
                            <div class="ranking-controls">
                                <select id="rankingMetricSelect" class="input-select">
                                        <option value="riesgo"${dashboardRankingMetric === 'riesgo' ? ' selected' : ''}>Scoring</option>
                                        <option value="ahorro"${dashboardRankingMetric === 'ahorro' ? ' selected' : ''}>Ahorro UF</option>
                                        <option value="desviacion"${dashboardRankingMetric === 'desviacion' ? ' selected' : ''}>Desviación %</option>
                                        <option value="hallazgos"${dashboardRankingMetric === 'hallazgos' ? ' selected' : ''}>Hallazgos críticos</option>
                                        <option value="acciones"${dashboardRankingMetric === 'acciones' ? ' selected' : ''}>Acciones pendientes</option>
                                    </select>
                                    <select id="rankingTopSelect" class="input-select">
                                        <option value="5"${dashboardRankingTop === 5 ? ' selected' : ''}>Top 5</option>
                                        <option value="10"${dashboardRankingTop === 10 ? ' selected' : ''}>Top 10</option>
                                        <option value="20"${dashboardRankingTop === 20 ? ' selected' : ''}>Top 20</option>
                                    </select>
                                </div>
                            </div>
                            <div id="rankingChartContainer" class="ranking-container"></div>
                        </div>
                        <div class="card ranking-card">
                            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem;">
                                <h3 style="margin:0;">Ranking de Liquidadores</h3>
                                <div class="ranking-controls">
                                    <select id="adjusterRankingMetricSelect" class="input-select">
                                        <option value="riesgo"${dashboardAdjusterRankingMetric === 'riesgo' ? ' selected' : ''}>Scoring</option>
                                        <option value="ahorro"${dashboardAdjusterRankingMetric === 'ahorro' ? ' selected' : ''}>Ahorro UF</option>
                                        <option value="desviacion"${dashboardAdjusterRankingMetric === 'desviacion' ? ' selected' : ''}>Desviación %</option>
                                        <option value="hallazgos"${dashboardAdjusterRankingMetric === 'hallazgos' ? ' selected' : ''}>Hallazgos críticos</option>
                                        <option value="acciones"${dashboardAdjusterRankingMetric === 'acciones' ? ' selected' : ''}>Acciones pendientes</option>
                                    </select>
                                    <select id="adjusterRankingTopSelect" class="input-select">
                                        <option value="5"${dashboardAdjusterRankingTop === 5 ? ' selected' : ''}>Top 5</option>
                                        <option value="10"${dashboardAdjusterRankingTop === 10 ? ' selected' : ''}>Top 10</option>
                                        <option value="20"${dashboardAdjusterRankingTop === 20 ? ' selected' : ''}>Top 20</option>
                                    </select>
                                </div>
                            </div>
                            <div id="adjusterRankingChartContainer" class="ranking-container"></div>
                        </div>
                    </div>
                    <div class="card dashboard-results-card">
                        <div class="dashboard-results-header">
                            <div>
                                <h3 style="margin:0;">Siniestros del Dashboard</h3>
                                <p class="dashboard-results-subtitle">Resultados según los filtros aplicados.</p>
                            </div>
                            <span class="dashboard-results-count">${activeCount} resultado${activeCount === 1 ? '' : 's'}</span>
                        </div>
                        <div class="table-container dashboard-results-table">
                            <table class="dashboard-claims-table">
                                <thead>
                                    <tr>
                                        <th>Liquidador</th>
                                        <th>Valorador</th>
                                        <th>Taller</th>
                                        <th>Marca</th>
                                        <th>Modelo</th>
                                        <th>Patente</th>
                                        <th>Año</th>
                                        <th>Chasis</th>
                                        <th>Total Pintura</th>
                                        <th>Valor de repuestos</th>
                                        <th>Carrocería</th>
                                        <th>Mecatrónica</th>
                                        <th>Resultado</th>
                                        <th>Ahorro (UF)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${dashboardClaimsRows}
                                </tbody>
                            </table>
                        </div>
                        <div class="claims-pagination dashboard-pagination">
                            <div class="page-size-control">
                                <label for="dashboardResultsPageSize">Mostrar</label>
                                <select id="dashboardResultsPageSize">
                                    ${dashboardPageSizeOptionsHtml}
                                </select>
                            </div>
                            <div class="page-controls">
                                <button class="btn-secondary" id="dashboardResultsPrev"${dashboardResultsPage <= 1 ? ' disabled' : ''}>Anterior</button>
                                <span id="dashboardResultsInfo" style="color: var(--text-muted); font-size: 0.9rem;">${dashboardResultsInfo}</span>
                                <button class="btn-secondary" id="dashboardResultsNext"${dashboardResultsPage >= totalPages ? ' disabled' : ''}>Siguiente</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        contentArea.innerHTML = dashboardHTML;
        const dashboardFiltersCard = contentArea.querySelector('.dashboard-filters');
        if (dashboardFiltersCard && mobileSidebarMq.matches) {
            dashboardFiltersCard.classList.toggle('is-open', dashboardFiltersOpen);
        }
        const dashAdjusterSel = document.getElementById('dashFilterAdjuster');
        const dashValuatorSel = document.getElementById('dashFilterValuator');
        const dashWorkshopSel = document.getElementById('dashFilterWorkshop');
        const dashCitySel = document.getElementById('dashFilterCity');
        if (dashAdjusterSel) {
            dashAdjusterSel.value = dashboardFilterAdjuster || '';
            dashAdjusterSel.onchange = () => {
                dashboardFilterAdjuster = dashAdjusterSel.value;
                dashboardResultsPage = 1;
                renderDashboard();
            };
        }
        if (dashValuatorSel) {
            dashValuatorSel.value = dashboardFilterValuator || '';
            dashValuatorSel.onchange = () => {
                dashboardFilterValuator = dashValuatorSel.value;
                dashboardResultsPage = 1;
                renderDashboard();
            };
        }
        if (dashWorkshopSel) {
            dashWorkshopSel.value = dashboardFilterWorkshop || '';
            dashWorkshopSel.onchange = () => {
                dashboardFilterWorkshop = dashWorkshopSel.value;
                dashboardResultsPage = 1;
                renderDashboard();
            };
        }
        if (dashCitySel) {
            dashCitySel.value = dashboardFilterCity || '';
            dashCitySel.onchange = () => {
                dashboardFilterCity = dashCitySel.value;
                dashboardResultsPage = 1;
                renderDashboard();
            };
        }
        const dashboardPageSizeSelect = document.getElementById('dashboardResultsPageSize');
        if (dashboardPageSizeSelect) {
            dashboardPageSizeSelect.value = String(dashboardResultsPageSize);
            dashboardPageSizeSelect.addEventListener('change', () => {
                const nextSize = Number(dashboardPageSizeSelect.value) || 5;
                dashboardResultsPageSize = Math.min(nextSize, maxDashboardResultsPageSize);
                dashboardResultsPage = 1;
                renderDashboard();
            });
        }
        const dashboardPrevBtn = document.getElementById('dashboardResultsPrev');
        const dashboardNextBtn = document.getElementById('dashboardResultsNext');
        if (dashboardPrevBtn) {
            dashboardPrevBtn.addEventListener('click', () => {
                if (dashboardResultsPage > 1) {
                    dashboardResultsPage -= 1;
                    renderDashboard();
                }
            });
        }
        if (dashboardNextBtn) {
            dashboardNextBtn.addEventListener('click', () => {
                if (dashboardResultsPage < totalPages) {
                    dashboardResultsPage += 1;
                    renderDashboard();
                }
            });
        }
        const avgCard = contentArea.querySelector('[data-role="avg-cost-card"]');
        if (avgCard) {
            avgCard.setAttribute('title', '');
            avgCard.setAttribute('data-tooltip', costCardTitleRaw);
        }
        if (window.KensaCharts && typeof window.KensaCharts.bindTooltipElements === 'function') {
            window.KensaCharts.bindTooltipElements(contentArea);
        }
        const rankingMetricSelect = document.getElementById('rankingMetricSelect');
        const rankingTopSelect = document.getElementById('rankingTopSelect');
        const rankingContainer = document.getElementById('rankingChartContainer');

        const formatValue = (val) => {
            switch (dashboardRankingMetric) {
                case 'impacto':
                case 'ahorro':
                    return `${(val || 0).toFixed(2)} UF`;
                case 'desviacion':
                    return `${(val || 0).toFixed(1)} %`;
                default:
                    return Math.round(val || 0).toString();
            }
        };

        const openRankingDrilldown = (row, labelPrefix, formatFnValue) => {
            const overlay = document.createElement('div');
            overlay.className = 'modal';
            const rowLabel = row.workshop || row.name || row.entity || 'Sin nombre';
            overlay.innerHTML = `
                <div class="modal-backdrop"></div>
                <div class="modal-dialog" style="max-width: 780px;">
                    <header class="modal-header">
                        <h2>${labelPrefix}: ${rowLabel}</h2>
                        <button type="button" class="modal-close" id="closeWorkshopModal">×</button>
                    </header>
                    <div class="modal-body">
                        <div style="display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:1rem;">
                            <div class="card" style="flex:1 1 180px; padding:0.75rem;">
                                <div style="font-size:0.85rem; color:var(--text-muted);">Métrica</div>
                                <div style="font-weight:700;">${formatFnValue(row.value)}</div>
                            </div>
                            <div class="card" style="flex:1 1 180px; padding:0.75rem;">
                                <div style="font-size:0.85rem; color:var(--text-muted);">Siniestros</div>
                                <div style="font-weight:700;">${row.countClaims}</div>
                            </div>
                        </div>
                        <div class="table-container" style="max-height:320px; overflow:auto;">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Fecha</th>
                                        <th>Estado</th>
                                        <th>Resultado</th>
                                        <th>Impacto UF</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${(row.claims || []).slice(0, 10).map(c => {
                                        const dateStr = c.date ? new Date(c.date).toLocaleDateString('es-CL') : '-';
                                        return `
                                            <tr>
                                                <td>${c.id}</td>
                                                <td>${dateStr}</td>
                                                <td>${c.status || '-'}</td>
                                                <td>${c.result || '-'}</td>
                                                <td>${(c.impactUF || 0).toFixed(2)}</td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <footer class="modal-footer">
                        <button type="button" class="btn-secondary" id="closeWorkshopModalBtn">Cerrar</button>
                    </footer>
                </div>
            `;
            document.body.appendChild(overlay);
            const close = () => document.body.removeChild(overlay);
            overlay.querySelector('#closeWorkshopModal')?.addEventListener('click', close);
            overlay.querySelector('#closeWorkshopModalBtn')?.addEventListener('click', close);
            overlay.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal-backdrop')) close();
            });
        };

        const renderRanking = () => {
            if (typeof computeWorkshopRanking !== 'function' || typeof renderWorkshopRankingChart !== 'function') {
                if (rankingContainer) rankingContainer.innerHTML = '<div class="empty-state">Ranking no disponible.</div>';
                return;
            }
            const rankingData = computeWorkshopRanking(claims, {
                metric: dashboardRankingMetric,
                topN: dashboardRankingTop,
                ufValue: ufVal
            });
            renderWorkshopRankingChart(rankingContainer, rankingData, {
                metricLabel: dashboardRankingMetric,
                formatFn: formatValue,
                onBarClick: (row) => openRankingDrilldown(row, 'Taller', formatValue)
            });
        };

        const adjusterMetricSelect = document.getElementById('adjusterRankingMetricSelect');
        const adjusterTopSelect = document.getElementById('adjusterRankingTopSelect');
        const adjusterContainer = document.getElementById('adjusterRankingChartContainer');
        const formatAdjusterValue = (val) => {
            switch (dashboardAdjusterRankingMetric) {
                case 'impacto':
                case 'ahorro':
                    return `${(val || 0).toFixed(2)} UF`;
                case 'desviacion':
                    return `${(val || 0).toFixed(1)} %`;
                default:
                    return Math.round(val || 0).toString();
            }
        };

        const renderAdjusterRanking = () => {
            if (typeof computeAdjusterRanking !== 'function' || typeof renderWorkshopRankingChart !== 'function') {
                if (adjusterContainer) adjusterContainer.innerHTML = '<div class="empty-state">Ranking no disponible.</div>';
                return;
            }
            const data = computeAdjusterRanking(claims, {
                metric: dashboardAdjusterRankingMetric,
                topN: dashboardAdjusterRankingTop,
                ufValue: ufVal
            });
            renderWorkshopRankingChart(adjusterContainer, data, {
                metricLabel: dashboardAdjusterRankingMetric,
                formatFn: formatAdjusterValue,
                onBarClick: (row) => openRankingDrilldown(row, 'Liquidador', formatAdjusterValue)
            });
        };

        if (rankingMetricSelect) {
            rankingMetricSelect.onchange = () => {
                dashboardRankingMetric = rankingMetricSelect.value;
                renderRanking();
            };
        }
        if (rankingTopSelect) {
            rankingTopSelect.onchange = () => {
                dashboardRankingTop = Number(rankingTopSelect.value) || 10;
                renderRanking();
            };
        }

        if (adjusterMetricSelect) {
            adjusterMetricSelect.onchange = () => {
                dashboardAdjusterRankingMetric = adjusterMetricSelect.value;
                renderAdjusterRanking();
            };
        }
        if (adjusterTopSelect) {
            adjusterTopSelect.onchange = () => {
                dashboardAdjusterRankingTop = Number(adjusterTopSelect.value) || 10;
                renderAdjusterRanking();
            };
        }

        setTimeout(() => {
            initCharts();
            renderRanking();
            renderAdjusterRanking();
        }, 100);
    }

    function renderClaimsList() {
        const claimsHTML = `
            <div class="fade-in">
                <div id="bulkActionsSiniestros" class="bulk-actions hidden">
                    <div class="bulk-actions__left">
                        <span id="bulkSiniestrosCount" class="bulk-actions__count">0 seleccionados</span>
                    </div>
                    <div class="bulk-actions__right">
                        <button id="btnBulkSiniestrosAsignar" class="btn btn-sm btn-secondary">Asignar</button>
                        <button id="btnBulkSiniestrosEstado" class="btn btn-sm btn-secondary">Cambiar estado</button>
                        <button id="btnBulkSiniestrosEliminar" class="btn btn-sm btn-danger">Eliminar</button>
                    </div>
                </div>
                <div class="table-container">
                    <div class="claims-table-wrap">
                        <table id="claimsTable" class="claims-table">
                            <thead>
                                <tr>
                                    <th class="col-check">
                                        <input type="checkbox" id="chkSiniestrosSelectAll">
                                    </th>
                                    <th>Siniestro</th>
                                    <th>Vehículo</th>
                                    <th>Patente</th>
                                    <th>Taller</th>
                                    <th>Estado</th>
                                    <th>Tipo</th>
                                    <th>SLA</th>
                                    <th>Creación</th>
                                    <th>Actualización</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody id="claimsTableBody">
                                <!-- Rows injected by JS -->
                            </tbody>
                        </table>
                    </div>
                    <div class="claims-list" id="claimsList">
                        <div class="claims-list-header">
                            <label for="chkSiniestrosSelectAllMobile">
                                <input type="checkbox" id="chkSiniestrosSelectAllMobile">
                                <span>Seleccionar todos</span>
                            </label>
                        </div>
                        <div id="claimsCards"></div>
                    </div>
                    <div class="claims-pagination" id="claimsPagination">
                        <div class="page-size-control">
                            <label for="claimsPageSizeSelect">Mostrar</label>
                            <select id="claimsPageSizeSelect">
                                <option value="8" ${claimsPageSize === 8 ? 'selected' : ''}>8</option>
                                <option value="15" ${claimsPageSize === 15 ? 'selected' : ''}>15</option>
                                <option value="30" ${claimsPageSize === 30 ? 'selected' : ''}>30</option>
                                <option value="60" ${claimsPageSize === 60 ? 'selected' : ''}>60</option>
                            </select>
                        </div>
                        <div class="page-controls">
                            <button class="btn-secondary prev-page" id="claimsPrevPage">Anterior</button>
                            <span id="claimsPageInfo" style="color: var(--text-muted); font-size: 0.9rem;">Página 1 de 1</span>
                            <button class="btn-secondary next-page" id="claimsNextPage">Siguiente</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        contentArea.innerHTML = claimsHTML;

        // Initial Render
        filterAndRenderClaims();
        bindBulkActionsSiniestros();
    }

    function filterAndRenderClaims() {
        const searchText = (document.getElementById('searchClaim')?.value || '').toLowerCase();
        const statusFilter = document.getElementById('filterStatus')?.value || '';
        const workshopFilterValue = (claimsFilterWorkshop || document.getElementById('filterWorkshop')?.value || '').trim();
        claimsFilterWorkshop = workshopFilterValue;
        const workshopFilterKey = workshopKey(workshopFilterValue);
        const tbody = document.getElementById('claimsTableBody');
        const cardsContainer = document.getElementById('claimsCards');

        const filteredClaims = claimsState.filter(claim => {
            const matchesSearch =
                claim.id.toLowerCase().includes(searchText) ||
                claim.model.toLowerCase().includes(searchText) ||
                claim.brand.toLowerCase().includes(searchText) ||
                claim.plate.toLowerCase().includes(searchText);
            const matchesStatus = statusFilter === '' || claim.status === statusFilter;
            const matchesWorkshop = workshopFilterKey === '' || workshopKey(claim.workshop) === workshopFilterKey;
            return matchesSearch && matchesStatus && matchesWorkshop;
        });

        const totalItems = filteredClaims.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / claimsPageSize));
        if (claimsCurrentPage > totalPages) claimsCurrentPage = totalPages;
        if (claimsCurrentPage < 1) claimsCurrentPage = 1;

        const startIndex = (claimsCurrentPage - 1) * claimsPageSize;
        const endIndex = startIndex + claimsPageSize;
        const visibleClaims = filteredClaims.slice(startIndex, endIndex);

        const badgeClassFor = (status) => {
            if (status === 'En revisión') return 'status-parts';
            if (status === 'Aprobado') return 'status-qa';
            return 'status-repair';
        };

        const slaColorFor = (sla) => {
            if (sla < 20) return 'var(--danger)';
            if (sla < 50) return 'var(--warning)';
            return 'var(--success)';
        };

        if (tbody) {
            tbody.innerHTML = visibleClaims.map(claim => {
                const badgeClass = badgeClassFor(claim.status);
                const slaColor = slaColorFor(claim.sla);
                const tipo = claim.type || '-';
                const createdParts = formatDateTimeSplit(claim.createdAt);
                const updatedParts = formatDateTimeSplit(claim.updatedAt);
                const checked = selectedClaimIds.has(claim.id) ? 'checked' : '';

                return `
                    <tr>
                        <td class="col-check">
                            <input type="checkbox" class="chk-siniestro" data-claim-id="${claim.id}" ${checked}>
                        </td>
                        <td class="claim-id-cell">${claim.id}</td>
                        <td>${claim.brand} ${claim.model} ${claim.year}</td>
                        <td>${claim.plate}</td>
                        <td>${claim.workshop}</td>
                        <td><span class="status-badge ${badgeClass}">${claim.status}</span></td>
                        <td>${tipo}</td>
                        <td>
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <div style="width: 80px; height: 6px; background: #e2e8f0; border-radius: 3px;">
                                    <div style="width: ${claim.sla}%; height: 100%; background: ${slaColor}; border-radius: 3px;"></div>
                                </div>
                                <span style="font-size: 0.8rem; color: var(--text-muted);">${claim.sla}%</span>
                            </div>
                        </td>
                        <td>
                            <div class="dt-block">
                                <span>${createdParts.date}</span>
                                ${createdParts.time ? `<span class="dt-time">${createdParts.time}</span>` : ''}
                            </div>
                        </td>
                        <td>
                            <div class="dt-block">
                                <span>${updatedParts.date}</span>
                                ${updatedParts.time ? `<span class="dt-time">${updatedParts.time}</span>` : ''}
                            </div>
                        </td>
                        <td>
                            <button class="icon-btn view-claim-btn" data-id="${claim.id}" title="Ver Detalle">
                                <i class="ph ph-eye"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        if (cardsContainer) {
            cardsContainer.innerHTML = visibleClaims.map(claim => {
                const badgeClass = badgeClassFor(claim.status);
                const slaColor = slaColorFor(claim.sla);
                const tipo = claim.type || '-';
                const createdParts = formatDateTimeSplit(claim.createdAt);
                const updatedParts = formatDateTimeSplit(claim.updatedAt);
                const checked = selectedClaimIds.has(claim.id) ? 'checked' : '';

                return `
                    <article class="claim-row-card" data-claim-id="${claim.id}">
                        <div class="row-top">
                            <div class="row-id">
                                <input type="checkbox" class="chk-siniestro" data-claim-id="${claim.id}" ${checked}>
                                <div>
                                    <div class="claim-id-cell">${claim.id}<span class="claim-plate-inline"> - ${claim.plate || '-'}</span></div>
                                    <div class="claim-vehicle">${claim.brand} ${claim.model} ${claim.year}</div>
                                </div>
                            </div>
                            <div class="claim-row-actions">
                                <span class="status-badge ${badgeClass}">${claim.status}</span>
                                <button class="icon-btn view-claim-btn" data-id="${claim.id}" type="button" title="Ver detalle" aria-label="Ver detalle">
                                    <i class="ph ph-eye"></i>
                                </button>
                            </div>
                        </div>
                        <div class="claim-row-meta">
                            <div class="claim-meta claim-meta--plate"><strong>Patente</strong>${claim.plate}</div>
                            <div class="claim-meta claim-meta--workshop"><strong>Taller</strong>${claim.workshop}</div>
                            <div class="claim-meta claim-meta--type"><strong>Tipo</strong>${tipo}</div>
                        </div>
                        <div class="claim-row-meta">
                            <div class="claim-meta claim-meta--created"><strong>Creación</strong>${createdParts.date}${createdParts.time ? ` · <span class="dt-time">${createdParts.time}</span>` : ''}</div>
                            <div class="claim-meta claim-meta--updated"><strong>Actualización</strong>${updatedParts.date}${updatedParts.time ? ` · <span class="dt-time">${updatedParts.time}</span>` : ''}</div>
                            <div>
                                <strong class="claim-sla-label">SLA</strong>
                                <div class="claim-sla-row">
                                    <div class="claim-sla-track">
                                        <div class="claim-sla-fill" style="width: ${claim.sla}%; background: ${slaColor};"></div>
                                    </div>
                                    <span class="claim-sla-value">${claim.sla}%</span>
                                </div>
                            </div>
                        </div>
                    </article>
                `;
            }).join('');
        }

        const pageInfo = document.getElementById('claimsPageInfo');
        const prevBtn = document.getElementById('claimsPrevPage');
        const nextBtn = document.getElementById('claimsNextPage');
        const pageSizeSelect = document.getElementById('claimsPageSizeSelect');

        if (pageInfo) {
            pageInfo.textContent = `Página ${claimsCurrentPage} de ${totalPages}`;
        }
        if (prevBtn) {
            prevBtn.disabled = claimsCurrentPage === 1;
            prevBtn.onclick = () => {
                if (claimsCurrentPage > 1) {
                    claimsCurrentPage--;
                    filterAndRenderClaims();
                }
            };
        }
        if (nextBtn) {
            nextBtn.disabled = claimsCurrentPage === totalPages;
            nextBtn.onclick = () => {
                if (claimsCurrentPage < totalPages) {
                    claimsCurrentPage++;
                    filterAndRenderClaims();
                }
            };
        }
        if (pageSizeSelect) {
            pageSizeSelect.value = String(claimsPageSize);
            pageSizeSelect.onchange = () => {
                const value = parseInt(pageSizeSelect.value, 10);
                if (!Number.isNaN(value)) {
                    claimsPageSize = value;
                    claimsCurrentPage = 1;
                    filterAndRenderClaims();
                }
            };
        }

        // Re-attach listeners to new buttons
        document.querySelectorAll('.view-claim-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const claimId = btn.getAttribute('data-id');
                renderAuditDetail(claimId);
            });
        });

        bindClaimCheckboxEvents();
        updateBulkActionsUI();
    }

    function renderAuditDetail(claimId, activeTab = 'photos') {
        // Find claim data (or use default if not found/passed)
        const claim = claimsState.find(c => c.id === claimId) || claimsState[0];
        if (!claim) {
            contentArea.innerHTML = '<p style="padding:1rem;">No hay siniestros disponibles.</p>';
            return;
        }
        isClaimDetailView = true;
        setSidebarCollapsed(true);
        claim.bitacora = claim.bitacora || [];
        currentAuditClaim = claim;
        const normalizedTabRaw = activeTab || claimDetailActiveTab || 'photos';
        let normalizedTab = normalizedTabRaw === 'general' ? 'photos' : normalizedTabRaw;
        const mobileDetailMq = typeof window.matchMedia === 'function'
            ? window.matchMedia('(max-width: 768px)')
            : { matches: false };
        if (mobileDetailMq.matches && (normalizedTab === 'costs' || normalizedTab === 'auditar')) {
            normalizedTab = 'photos';
        }
        claimDetailActiveTab = normalizedTab;
        claimDetailDirty = false;
        if (pageTitle) {
            pageTitle.innerHTML = claim.id
                ? `Detalle del siniestro: <span class="claim-number-inline">${claim.id}</span>`
                : 'Detalle del siniestro';
        }
        setClaimDetailTopBarActions(claim.id);
        const createdAtSplit = formatDateTimeSplit(claim.createdAt);
        const updatedAtSplit = formatDateTimeSplit(claim.updatedAt);
        const cleanMappedText = (txt) => {
            if (!txt) return '';
            const starMatch = txt.match(/\*(.*?)\*/s);
            const base = starMatch ? starMatch[1] : txt;
            return base.trim();
        };
        const claimPhotos = Array.isArray(claim.photos) ? claim.photos : [];
        if (!Array.isArray(claim.photoHighlights)) {
            claim.photoHighlights = [];
        }
        const mappedFacts = cleanMappedText((claim.pdfMapping && claim.pdfMapping.facts) || claim.description) || 'Sin registro de la versión de los hechos proveniente del PDF.';
        const mappedControl = cleanMappedText(claim.pdfMapping && claim.pdfMapping.control) || 'Sin operaciones de control registradas desde el PDF.';
        addBitacoraEvent(claim, {
            type: 'view',
            message: 'Ingreso al siniestro',
            meta: { tab: normalizedTab || 'photos' }
        });

        const storedValuation = loadValuationForClaim(claim.id);
        if ((!claim.valuations || !claim.valuations.length) && storedValuation) {
            const summary = storedValuation.economics;
            const parts = storedValuation.items || [];
            const signature = buildValuationSignature(claim.id, summary);
            claim.valuations = [{
                id: `${claim.id}-OR`,
                label: 'OR',
                signature,
                summary,
                parts,
                createdAt: storedValuation.document?.uploadedAt || new Date().toISOString(),
                document: storedValuation.document
            }];
            saveClaimsToStorage();
        }
        const valuations = claim.valuations || [];
        let activeValuation = null;
        if (claimDetailActiveValuationId) {
            activeValuation = valuations.find(v => v.id === claimDetailActiveValuationId) || null;
        }
        if (!activeValuation) {
            activeValuation = valuations[0] || null;
        }
        claimDetailActiveValuationId = activeValuation ? activeValuation.id : null;
        const hasValuation = !!activeValuation;
        console.log('Valuation cargada para claim', claim.id, activeValuation);
        const formatMoney = (value) => {
            if (typeof value !== 'number' || Number.isNaN(value)) return '-';
            return `$${value.toLocaleString('es-CL')}`;
        };
        const formatNumber = (value) => {
            if (typeof value !== 'number' || Number.isNaN(value)) return '-';
            return value.toString();
        };
        const documentInfoHTML = hasValuation && activeValuation?.document
            ? `<p style="font-size: 0.85rem; color: var(--text-muted);">
                   Documento registrado: <strong>${activeValuation.document.fileName}</strong><br>
                   Fecha de carga: ${new Date(activeValuation.document.uploadedAt).toLocaleString('es-CL')}
                </p>`
            : `<p style="font-size: 0.85rem; color: var(--text-muted);">
                   Aún no hay un documento de valoración registrado para este siniestro.
                </p>`;

        const renderValuationSummaryHTML = (valuation) => {
            if (!valuation || !valuation.summary) return '';
            const econ = valuation.summary;
            const pickMoneyValue = (...candidates) => {
                for (const val of candidates) {
                    if (typeof val === 'number' && !Number.isNaN(val)) return val;
                    const parsed = parseMoneyCLPStrict(val);
                    if (parsed != null) return parsed;
                }
                return null;
            };
            const pickPercentValue = (...candidates) => {
                for (const val of candidates) {
                    if (typeof val === 'number' && !Number.isNaN(val)) return val;
                    const parsed = parsePercentStrict(val);
                    if (parsed != null) return parsed;
                    if (typeof val === 'string' && val.trim()) return val.trim();
                }
                return null;
            };
            const materialsValue = pickMoneyValue(
                econ.materialsValue, econ.materiales, econ.material, econ.materialesValor,
                claim?.materialesCLP, claim?.materiales, claim?.materials
            );
            const paintTotalValue = pickMoneyValue(
                econ.paintTotal, econ.totalPaint, econ.totalPintura, econ.valorPintura,
                claim?.totalPinturaCLP, claim?.totalPintura, claim?.paintTotal
            );
            const deductibleValue = pickMoneyValue(
                econ.deductible, econ.valorDeducible, econ.deducible,
                claim?.deducibleCLP, claim?.deducible, claim?.deductible
            );
            const lossValue = pickPercentValue(
                econ.lossPercentage, econ.loss, econ.perdida, econ.porcentajePerdida,
                claim?.perdidaPct, claim?.perdida, claim?.lossType
            );
            const controlOps = Array.isArray(econ.controlOperations)
                ? econ.controlOperations
                : Array.isArray(valuation.controlOperations)
                    ? valuation.controlOperations
                    : (typeof econ.controlOperations === 'string' ? econ.controlOperations.split(/[,;•·]+/).map(s => s.trim()).filter(Boolean) : []);
            const controlOpsText = controlOps.length ? controlOps.join(' · ') : '—';
            const formatLoss = (value) => {
                if (typeof value === 'number' && !Number.isNaN(value)) return `${value}%`;
                if (typeof value === 'string' && value.trim()) return value;
                return '-';
            };
            return `
                <div class="card">
                    <h3 style="margin-bottom: 1rem;">Resumen de Costos (${valuation.label})</h3>
                    <div class="cost-summary-grid">
                        <div style="display: grid; row-gap: 1rem; grid-auto-rows: minmax(0, auto);">
                            <div style="background: #f8fafc; border: 1px solid var(--border); border-radius: 10px; padding: 1rem; display: grid; row-gap: 0.65rem; font-size: 0.9rem;">
                                <div style="display:flex; justify-content:space-between; gap:0.5rem;">
                                    <span style="color: var(--text-muted);">Carrocería</span>
                                    <strong class="valuation-summary-value">${formatMoney(econ.bodyworkValue ?? econ.carroceria)}</strong>
                                </div>
                                <div style="display:flex; justify-content:space-between; gap:0.5rem;">
                                    <span style="color: var(--text-muted);">Mecatrónica</span>
                                    <strong class="valuation-summary-value">${formatMoney(econ.mechatronicsValue ?? econ.mecatronica)}</strong>
                                </div>
                                <div style="display:flex; justify-content:space-between; gap:0.5rem;">
                                    <span style="color: var(--text-muted);">Materiales</span>
                                    <strong class="valuation-summary-value">${formatMoney(materialsValue)}</strong>
                                </div>
                                <div style="display:flex; justify-content:space-between; gap:0.5rem;">
                                    <span style="color: var(--text-muted);">Total Pintura</span>
                                    <strong class="valuation-summary-value">${formatMoney(paintTotalValue)}</strong>
                                </div>
                            </div>
                            <div style="background: #f8fafc; border: 1px solid var(--border); border-radius: 10px; padding: 1rem; display: grid; row-gap: 0.65rem; font-size: 0.9rem;">
                                <div style="display:flex; justify-content:space-between; gap:0.5rem;">
                                    <span style="color: var(--text-muted);">Valor de Repuestos</span>
                                    <strong class="valuation-summary-value">${formatMoney(econ.partsValueNet ?? econ.valorRepuestos)}</strong>
                                </div>
                                <div style="display:flex; justify-content:space-between; gap:0.5rem;">
                                    <span style="color: var(--text-muted);">Valor de Mano de Obra</span>
                                    <strong class="valuation-summary-value">${formatMoney(econ.laborValueNet ?? econ.valorManoObra)}</strong>
                                </div>
                                <div style="display:flex; justify-content:space-between; gap:0.5rem;">
                                    <span style="color: var(--text-muted);">Subtotal Valoración</span>
                                    <strong class="valuation-summary-value">${formatMoney(econ.subtotalValuation ?? econ.subtotalValoracion)}</strong>
                                </div>
                            </div>
                        </div>
                        <div style="display: grid; row-gap: 0.9rem;">
                            <div style="background: #f8fafc; border: 1px solid var(--border); border-radius: 10px; padding: 1rem; display: grid; row-gap: 0.65rem; font-size: 0.9rem;">
                                <div style="display:flex; justify-content:space-between; gap:0.5rem;">
                                    <span style="color: var(--text-muted);">Deducible</span>
                                    <strong class="valuation-summary-value">${formatMoney(deductibleValue)}</strong>
                                </div>
                                <div style="display:flex; justify-content:space-between; gap:0.5rem;">
                                    <span style="color: var(--text-muted);">Pérdida</span>
                                    <strong class="valuation-summary-value">${formatLoss(lossValue)}</strong>
                                </div>
                            </div>
                            <div style="background: #f8fafc; border: 1px solid var(--border); border-radius: 10px; padding: 1rem; display: grid; row-gap: 0.35rem; font-size: 0.9rem;">
                                <div style="display:flex; justify-content:space-between; gap:0.5rem;">
                                    <span style="color: var(--text-muted);">Operaciones de control</span>
                                </div>
                                <div class="valuation-summary-value control-ops-value" style="color: var(--text-main); line-height: 1.4;">
                                    ${controlOpsText}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        };

        const renderValuationItemsHTML = (valuation) => {
            if (!valuation || !Array.isArray(valuation.parts)) return '';
            const itemsRowsHTML = valuation.parts.map(item => {
                const actionLower = (item.action || item.accion || '').toString().toLowerCase();
                const codigo = actionLower.includes('cambiar')
                    ? (item.ref || item.reference || item.codigo || item.code || '')
                    : '';
                return `
                <tr>
                    <td>${item.lineNumber ?? ''}</td>
                    <td>${item.qty ?? ''}</td>
                    <td>${item.partName ?? item.nombre ?? ''}</td>
                    <td>${codigo || ''}</td>
                    <td>${item.action ?? item.accion ?? ''}</td>
                    <td>${item.provider ?? item.sucursalProveedor ?? ''}</td>
                    <td>${item.quality ?? item.calidad ?? ''}</td>
                    <td style="text-align:right;">${item.leadTimeDays ?? item.dias ?? ''}</td>
                    <td style="text-align:right;">${typeof item.totalPrice === 'number' ? formatMoney(item.totalPrice) : (typeof item.unitPrice === 'number' ? formatMoney(item.unitPrice) : (item.totalPrice ?? item.unitPrice ?? item.precio ?? ''))}</td>
                </tr>
            `;
            }).join('');

            return `
                <div class="card table-container">
                    <div style="padding: 1rem; border-bottom: 1px solid var(--border); display:flex;justify-content:space-between;align-items:center;">
                        <h3 style="margin:0;">Detalle de Repuestos y Trabajos (${valuation.label})</h3>
                        <span style="font-size:0.8rem;color:var(--text-muted);">Fuente: documento PDF importado</span>
                    </div>
                    <div class="table-wrap">
                        <table style="width:100%; border-collapse: collapse; font-size: 0.85rem;">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Und</th>
                                    <th>Repuesto / Trabajo</th>
                                    <th>Código</th>
                                    <th>Acción</th>
                                    <th>Proveedor</th>
                                    <th>Calidad</th>
                                    <th style="text-align:right;">Días</th>
                                    <th style="text-align:right;">Precio</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsRowsHTML || '<tr><td colspan="9" style="padding:1rem;text-align:center;color:var(--text-muted);">Sin ítems.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        };

        const tabsHTML = valuations.length > 0 ? `
            <div class="valuation-tabs" id="valuationTabs">
                ${valuations.map((v, idx) => `<button type="button" class="valuation-tab ${idx === 0 ? 'active' : ''}" data-val-id="${v.id}">${v.label}</button>`).join('')}
            </div>
        ` : '';

        const valuationSummaryHTML = hasValuation ? renderValuationSummaryHTML(activeValuation) : '';
        const valuationItemsTableHTML = hasValuation ? renderValuationItemsHTML(activeValuation) : '';

        const noValuationHTML = `
            <div class="card">
                <h3 style="margin-bottom: 0.5rem;">Costos y Repuestos</h3>
                <p style="color: var(--text-muted);">
                    Aún no se ha importado una valoración desde PDF para este siniestro.
                </p>
            </div>
        `;

        const contentValuationHTML = hasValuation
            ? `<div class="grid-layout grid-layout--stack">
                 ${valuationSummaryHTML}
                 ${valuationItemsTableHTML}
               </div>`
            : noValuationHTML;

        const paintType = claim.pinturaTipo || claim.paintType || claim.paintMode || '-';
        const vehicleType = claim.vehicleType || claim.tipoVehiculo || '-';
        const vin = claim.vin || claim.chassis || '-';
        const avisoNumber = claim.noticeNumber || claim.notice || claim.numeroAviso || '-';
        const coverage = claim.coverage || claim.cobertura || '-';
        const valuedBy = claim.valuedBy || claim.valorador || claim.evaluator || (activeValuation?.document?.uploadedBy) || '-';
        const plateLabel = claim.plate || '-';
        const vehicleTitle = [claim.brand, claim.model].filter(Boolean).join(' ').trim() || '-';
        const yearLabel = claim.year ? String(claim.year) : '';
        const vehicleHeaderLine = `${vehicleTitle}${plateLabel ? ` - ${plateLabel}` : ''}${yearLabel ? ` - ${yearLabel}` : ''}`;

        const costsSectionHTML = `
            <div class="card" style="margin-bottom: 1.5rem;">
                <h3 style="margin-bottom: 0.75rem;">Importar informe de valoración</h3>
                ${documentInfoHTML}
                <div class="valuation-upload-area">
                    <div id="valuationDropZone" class="valuation-dropzone">
                        <p class="valuation-dropzone-title">Arrastra y suelta aquí el informe PDF</p>
                        <p class="valuation-dropzone-subtitle">o haz clic en el botón para seleccionar el archivo desde tu equipo</p>
                        <button type="button" class="btn-secondary" id="valuationBrowseButton">
                            Seleccionar archivo
                        </button>
                        <input type="file" id="valuationPdfInput" accept="application/pdf" hidden />
                    </div>
                </div>
            </div>
            ${tabsHTML}
            <div id="valuationContent">${contentValuationHTML}</div>
        `;

        const auditHTML = `
            <div class="fade-in">
                <div class="detail-header">
                    <div>
                        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">
                            <h2 style="margin: 0;">${vehicleHeaderLine}</h2>
                        </div>
                        <div class="detail-meta-toggle-row">
                            <span>Datos generales</span>
                            <button type="button" class="detail-meta-toggle" id="detailMetaToggle" aria-expanded="false" aria-controls="detailMeta">
                                <i class="ph ph-caret-down"></i>
                            </button>
                        </div>
                        <div class="detail-meta" id="detailMeta">
                            <div class="detail-meta-group">
                                <span><i class="ph ph-user"></i> Liq: ${claim.adjuster}</span>
                                <span><i class="ph ph-user-circle"></i> Valorado por: ${valuedBy}</span>
                            </div>
                            <div class="detail-meta-group">
                                <span><i class="ph ph-car"></i> Tipo de vehículo: ${vehicleType}</span>
                                <span><i class="ph ph-paint-roller"></i> Tipo de pintura: ${paintType}</span>
                                <span><i class="ph ph-identification-card"></i> VIN: ${vin}</span>
                            </div>
                            <div class="detail-meta-group">
                                <span><i class="ph ph-shield-check"></i> Cobertura: ${coverage}</span>
                                <span><i class="ph ph-ticket"></i> Nº Aviso: ${avisoNumber}</span>
                            </div>
                            <div class="detail-meta-group">
                                <span><i class="ph ph-warehouse"></i> Taller: ${claim.workshop || '-'}</span>
                                <span><i class="ph ph-map-pin"></i> Ciudad del Taller: ${claim.workshopCity || '-'}</span>
                            </div>
                            <div class="detail-meta-group">
                                <span>
                                    <i class="ph ph-clock"></i> Creación:
                                    <span>${createdAtSplit.date}${createdAtSplit.time ? ` ${createdAtSplit.time}` : ''}</span>
                                </span>
                                <span>
                                    <i class="ph ph-clock-clockwise"></i> Actualización:
                                    <span>${updatedAtSplit.date}${updatedAtSplit.time ? ` ${updatedAtSplit.time}` : ''}</span>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="tabs">
                    <button class="tab-btn ${activeTab === 'photos' ? 'active' : ''}" data-tab="photos">Fotos y Daños</button>
                    <button class="tab-btn ${activeTab === 'costs' ? 'active' : ''}" data-tab="costs">Costos y Repuestos</button>
                    <button class="tab-btn ${activeTab === 'auditar' ? 'active' : ''}" data-tab="auditar">Auditoría</button>
                </div>

                <div id="photosTabSection" data-tab-content="photos">
                    <div class="grid-layout">
                        <div class="card">
                            <h3 style="margin-bottom: 1rem;">Dinámica del Siniestro</h3>
                            <p style="color: var(--text-muted); line-height: 1.6;">
                                ${claim.description}
                                <br><br>
                                <span style="color: var(--success); font-weight: 500;"><i class="ph ph-check-circle"></i> Coherencia Verificada</span>
                            </p>
                            <div class="card" style="margin-top: 1rem; background: #f8fafc;">
                                <h4 style="margin: 0 0 0.5rem; color: var(--text-main);">Resultado del mapeo del PDF</h4>
                                <div style="font-size: 0.9rem; color: var(--text-muted); line-height: 1.5;">
                                    <div style="margin-bottom: 0.5rem;">
                                        <strong style="color: var(--text-main);">Versión de los hechos:</strong><br>
                                        ${ (mappedFacts || 'No disponible.').replace(/\n/g, '<br>') }
                                    </div>
                                </div>
                            </div>
                            
                            <h3 style="margin-bottom: 1rem; margin-top: 2rem;">Evidencia Fotográfica</h3>
                            <div class="photo-upload-controls">
                                <input type="file" id="photoUploadInput" accept="image/*" multiple style="display:none;" />
                                <div class="photo-dropzone" id="photoDropzone" aria-label="Arrastra y suelta fotografías aquí o haz clic para seleccionarlas">
                                    <div class="photo-dropzone__icon" aria-hidden="true">
                                        <i class="ph ph-camera"></i>
                                    </div>
                                    <div class="photo-dropzone__text">
                                        <strong>Arrastra y suelta fotografías aquí</strong>
                                        <span>O haz clic para seleccionarlas desde tu equipo</span>
                                    </div>
                                </div>
                            </div>
                            <div class="photo-grid">
                                ${claimPhotos.map((photo, idx) => {
                                    const pos = claim.photoHighlights.indexOf(idx);
                                    const label = pos !== -1 ? `Foto ${pos + 1}` : '';
                                    return `
                                        <div class="photo-item ${pos !== -1 ? 'photo-selected' : ''}" data-photo-idx="${idx}">
                                            ${label ? `<span class="photo-badge">${label}</span>` : ''}
                                            <button type="button" class="photo-view-btn" data-photo-idx="${idx}" aria-label="Ver imagen">
                                                <i class="ph ph-eye"></i>
                                            </button>
                                            <img src="${photo}" alt="Daño">
                                        </div>
                                    `;
                                }).join('')}
                                ${claimPhotos.length === 0 ? '<p style="color: var(--text-muted);">No hay fotos disponibles.</p>' : ''}
                            </div>
                        </div>

                        <div class="card bitacora-card">
                            <div class="bitacora-header">
                                <h3>Bitácora</h3>
                                <div class="bitacora-filters">
                                    <button type="button" id="bitFilterView" class="bitacora-filter-btn bitacora-filter-btn--green" data-filter="view" aria-label="Filtrar verdes"></button>
                                    <button type="button" id="bitFilterStatus" class="bitacora-filter-btn bitacora-filter-btn--blue" data-filter="status" aria-label="Filtrar azules"></button>
                                    <button type="button" id="bitFilterComment" class="bitacora-filter-btn bitacora-filter-btn--black" data-filter="comment" aria-label="Filtrar negros"></button>
                                    <button type="button" id="bitFilterClear" class="bitacora-filter-btn" data-filter="" aria-label="Quitar filtro"></button>
                                </div>
                            </div>
                            <div class="bitacora-compose">
                                <textarea id="bitacoraCommentInput" placeholder="Escribe un comentario..."></textarea>
                                <button id="bitacoraAddCommentBtn" class="btn-primary">Agregar</button>
                            </div>
                            <div id="bitacoraList" class="bitacora-list" aria-label="Bitácora del siniestro"></div>
                        </div>
                    </div>
                </div>

                <div id="costsTabSection" data-tab-content="costs" style="margin-top: 2rem;">
                    ${costsSectionHTML}
                </div>

                <div id="auditTabSection" data-tab-content="auditar" class="card" style="margin-top: 1.5rem;">
                    <h3 style="margin-bottom: 0.75rem;">Auditoría del Siniestro</h3>

                    <div class="form-grid">
                        <div class="form-group">
                            <label for="auditSettlementComment">Observación de Liquidación</label>
                            <textarea
                                id="auditSettlementComment"
                                name="auditSettlementComment"
                                rows="4"
                                maxlength="450"
                                placeholder="Ingresa las observaciones de liquidación para este siniestro..."
                            ></textarea>
                            <span class="audit-comment-counter" id="auditSettlementCounter">0/450</span>
                        </div>

                        <div class="form-group">
                            <label for="auditTechnicalComment">Observación técnica</label>
                            <textarea
                                id="auditTechnicalComment"
                                name="auditTechnicalComment"
                                rows="4"
                                maxlength="450"
                                placeholder="Ingresa las observaciones técnicas para este siniestro..."
                            ></textarea>
                            <span class="audit-comment-counter" id="auditTechnicalCounter">0/450</span>
                        </div>
                    </div>
                    <div class="audit-selects">
                        <div class="audit-valuation-selector">
                            <label for="auditValuationSelect">Informe de valoración asociado</label>
                            <select id="auditValuationSelect"></select>
                        </div>
                        <div class="audit-result-selector">
                            <label for="auditResultSelect">Resultado</label>
                            <select id="auditResultSelect">
                                <option value="">Selecciona...</option>
                                <option value="Aprobado">Aprobado</option>
                                <option value="Revisar">Revisar</option>
                                <option value="Rechazado">Rechazado</option>
                            </select>
                        </div>
                        <div class="audit-paint-selector">
                            <label for="auditPaintSelect">Pintura</label>
                            <select id="auditPaintSelect">
                                <option value="BICAPA">Bicapa</option>
                                <option value="TRICAPA">Tricapa</option>
                            </select>
                        </div>
                        <div class="audit-savings">
                            <label for="auditSavingsUfValue" class="audit-savings-label">Ahorro (UF)</label>
                            <div class="audit-savings-value" id="auditSavingsUfValue" aria-live="polite">—</div>
                        </div>
                        <div class="audit-export">
                            <button type="button" class="btn-primary" id="exportAuditBudgetBtn">Exportar Presupuesto</button>
                            <button type="button" class="btn-primary" id="exportAuditPdfBtn">Exportar informe PDF</button>
                        </div>
                    </div>
                    <div class="audit-lines-container">
                        <table class="audit-lines-table">
                            <thead>
                                <tr>
                                    <th>Repuesto / Trabajo</th>
                                    <th>Acción</th>
                                    <th>Calidad</th>
                                    <th>Precio</th>
                                    <th>Mecánica</th>
                                    <th>DYM</th>
                                    <th>Desabolladura</th>
                                    <th>Pintura</th>
                                    <th>OBS. TÉCNICA</th>
                                    <th>OBS. REPUESTOS</th>
                                    <th>Sugerido</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody id="auditLinesBody"></tbody>
                        </table>
                    </div>
                    <div class="audit-checklist" id="auditChecklist"></div>
                </div>
            </div>
        `;
        contentArea.innerHTML = auditHTML;
        if (contentArea) {
            contentArea.scrollTop = 0;
        }
        scheduleTopBarOffset();
        const detailMeta = contentArea.querySelector('#detailMeta');
        const detailMetaToggle = contentArea.querySelector('#detailMetaToggle');
        if (detailMeta && detailMetaToggle) {
            const isResponsive = mobileSidebarMq.matches;
            detailMeta.classList.toggle('is-open', !isResponsive);
            detailMetaToggle.setAttribute('aria-expanded', isResponsive ? 'false' : 'true');
            detailMetaToggle.addEventListener('click', () => {
                const willOpen = !detailMeta.classList.contains('is-open');
                detailMeta.classList.toggle('is-open', willOpen);
                detailMetaToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
            });
        }
        renderBitacora(claim);
        const bitacoraAddBtn = contentArea.querySelector('#bitacoraAddCommentBtn');
        const bitacoraInput = contentArea.querySelector('#bitacoraCommentInput');
        const bitacoraFilterBtns = contentArea.querySelectorAll('.bitacora-filter-btn');
        if (bitacoraAddBtn && bitacoraInput) {
            const submitComment = () => {
                const txt = (bitacoraInput.value || '').trim();
                if (!txt) return;
                addBitacoraEvent(claim, { type: 'comment', message: txt });
                bitacoraInput.value = '';
                renderBitacora(claim);
            };
            bitacoraAddBtn.addEventListener('click', () => {
                submitComment();
            });
            bitacoraInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submitComment();
                }
            });
        }
        if (bitacoraFilterBtns && bitacoraFilterBtns.length) {
            bitacoraFilterBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const target = btn.getAttribute('data-filter');
                    bitacoraActiveFilter = target === bitacoraActiveFilter ? null : target || null;
                    bitacoraFilterBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-filter') === bitacoraActiveFilter));
                    renderBitacora(claim);
                });
            });
        }
        bindPhotoUploadControls(claim);
        bindPhotoSelection(claim);
        bindPhotoViewer(claim);
        ensureClaimDetailDirtyTracking();
        const valuationContentContainer = contentArea.querySelector('#valuationContent');
        const valuationTabs = contentArea.querySelectorAll('#valuationTabs .valuation-tab');
        const updateValuationView = (valId) => {
            const selected = valuations.find(v => v.id === valId) || valuations[0];
            if (!selected || !valuationContentContainer) return;
            valuationContentContainer.innerHTML = `
                <div class="grid-layout grid-layout--stack">
                    ${renderValuationSummaryHTML(selected)}
                    ${renderValuationItemsHTML(selected)}
                </div>
            `;
            valuationTabs.forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-val-id') === valId);
            });
        };
        if (valuationTabs.length && valuations.length) {
            valuationTabs.forEach(btn => {
                btn.addEventListener('click', () => {
                    updateValuationView(btn.getAttribute('data-val-id'));
                });
            });
        }

        const auditValuationSelect = contentArea.querySelector('#auditValuationSelect');
        const auditResultSelect = contentArea.querySelector('#auditResultSelect');
        const auditPaintSelect = contentArea.querySelector('#auditPaintSelect');
        const auditSavingsValueEl = contentArea.querySelector('#auditSavingsUfValue');
        const auditLinesBody = contentArea.querySelector('#auditLinesBody');
        const auditChecklist = contentArea.querySelector('#auditChecklist');
        const checklistItems = [
            { key: 'deducible', label: 'Deducible' },
            { key: 'coberturas', label: 'Coberturas' },
            { key: 'exclusiones', label: 'Exclusiones' },
            { key: 'preexistencias', label: 'Preexistencias' },
            { key: 'limiteCoberturas', label: 'Mano de obra' },
            { key: 'documentacionAsegurado', label: 'Pintura' },
            { key: 'partePolicial', label: 'Parte Policial' },
            { key: 'pagareAlcoholemia', label: 'Repuesto(s)' },
            { key: 'denuncioFueraPlazo', label: 'Denuncio fuera de plazo' },
            { key: 'separacionEventos', label: 'Separación de eventos' },
            { key: 'declaracionFraudulenta', label: 'Declaración fraudulenta' }
        ];

        const ensureAuditData = (valuationId, valuation) => {
            claim.auditByValuation = claim.auditByValuation || {};
            const numOrEmpty = (v) => {
                if (v === null || v === undefined) return '';
                const s = String(v).trim();
                if (!s) return '';
                return parseAuditNumber(s);
            };

            if (!claim.auditByValuation[valuationId]) {
                claim.auditByValuation[valuationId] = {
                    lines: (valuation?.parts || []).map((p, idx) => ({
                        id: `${valuationId}-line-${idx}`,
                        repuestoTrabajo: p.partName ?? p.nombre ?? '',
                        accion: p.action ?? p.accion ?? '',
                        calidad: p.quality ?? p.calidad ?? '',
                        precioOriginal: numOrEmpty(p.totalPrice ?? p.unitPrice ?? p.precio),
                        precioAuditado: numOrEmpty(p.totalPrice ?? p.unitPrice ?? p.precio),
                        mecanica: '',
                        dym: '',
                        desabolladura: '',
                        pintura: '',
                        observacion: '',
                        observacionRepuestos: '',
                        sugerido: '',
                        excluded: false
                    })),
                    result: '',
                    pinturaTipo: 'BICAPA',
                    checklist: {},
                    facts: mappedFacts || '',
                    settlementComment: '',
                    technicalComment: ''
                };
            }
            const audit = claim.auditByValuation[valuationId];
            audit.lines = audit.lines.map((line, idx) => ({
                id: line.id || `${valuationId}-line-${idx}`,
                repuestoTrabajo: line.repuestoTrabajo ?? line.partName ?? '',
                accion: line.accion ?? line.action ?? '',
                calidad: line.calidad ?? '',
                precioOriginal: numOrEmpty(line.precioOriginal),
                precioAuditado: numOrEmpty(line.precioAuditado ?? line.precioOriginal),
                mecanica: numOrEmpty(line.mecanica),
                dym: numOrEmpty(line.dym),
                desabolladura: numOrEmpty(line.desabolladura),
                pintura: numOrEmpty(line.pintura),
                observacion: line.observacion ?? '',
                observacionRepuestos: line.observacionRepuestos ?? line.obsRepuestos ?? '',
                sugerido: numOrEmpty(line.sugerido ?? line.sugeridoHH),
                excluded: !!line.excluded
            }));
            if (!audit.checklist) {
                audit.checklist = {};
            }
            if (!audit.pinturaTipo) {
                audit.pinturaTipo = 'BICAPA';
            }
            checklistItems.forEach(item => {
                if (audit.checklist[item.key] === undefined) {
                    audit.checklist[item.key] = false;
                }
            });
            if (typeof audit.facts !== 'string') {
                audit.facts = (audit.facts ?? mappedFacts ?? '').toString();
            }
            if (typeof audit.settlementComment !== 'string') {
                audit.settlementComment = (audit.settlementComment ?? '').toString();
            }
            if (typeof audit.technicalComment !== 'string') {
                audit.technicalComment = (audit.technicalComment ?? '').toString();
            }
            saveClaimsToStorage();
            return audit;
        };
        ensureAuditDataFn = ensureAuditData;

        const computeAuditSavings = (auditData, ufVal = getEffectiveUfValue()) => {
            if (!auditData || !Array.isArray(auditData.lines)) {
                return { totalPesos: 0, totalUf: 0 };
            }
            const uf = Number(ufVal);
            const divisor = Number.isFinite(uf) && uf > 0 ? uf : UF_VALUE;
            const totalPesos = auditData.lines
                .filter(line => !line.excluded)
                .reduce((acc, line) => {
                    const precio = parseAuditNumber(line.precioAuditado);
                    const mec = parseAuditNumber(line.mecanica);
                    const dym = parseAuditNumber(line.dym);
                    const des = parseAuditNumber(line.desabolladura);
                    const pint = parseAuditNumber(line.pintura);
                    const sug = parseAuditNumber(line.sugerido);
                    return acc + (precio + mec + dym + des + pint - sug);
                }, 0);
            const totalUf = divisor > 0 ? totalPesos / divisor : 0;
            return { totalPesos, totalUf };
        };

        const computeAuditSavingsFromDom = () => {
            if (!auditLinesBody) return { totalPesos: 0, totalUf: 0 };
            const ufVal = getEffectiveUfValue();
            let totalPesos = 0;
            const rows = auditLinesBody.querySelectorAll('tr');
            rows.forEach((tr) => {
                if (tr.classList.contains('audit-line-void')) return;
                const read = (field) => {
                    const el = tr.querySelector(`[data-field="${field}"]`);
                    return parseAuditNumber(el ? el.value : 0);
                };
                const precio = read('precioAuditado');
                const mec = read('mecanica');
                const dym = read('dym');
                const des = read('desabolladura');
                const pint = read('pintura');
                const sug = read('sugerido');
                totalPesos += (precio + mec + dym + des + pint - sug);
            });
            const totalUf = ufVal > 0 ? totalPesos / ufVal : 0;
            return { totalPesos, totalUf };
        };

        const renderAuditSavings = (valuationId, auditData) => {
            if (!auditSavingsValueEl) return;
            const { totalUf } = auditData
                ? computeAuditSavings(auditData, getEffectiveUfValue())
                : computeAuditSavingsFromDom();
            auditSavingsValueEl.textContent = Number.isFinite(totalUf) ? `${totalUf.toFixed(2)} UF` : '—';
        };

        const validateAuditBeforeExport = (audit, valuationId) => {
            let isValid = true;

            const resultSelect = document.getElementById('auditResultSelect');
            const tbody = auditLinesBody || document.querySelector('.audit-lines-table tbody');

            // Limpia errores previos
            if (resultSelect) {
                resultSelect.classList.remove('input-error');
            }
            if (tbody) {
                tbody.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
            }

            // 1) Validar campo Resultado obligatorio
            const validResults = ['APROBADO', 'APROBADO ', 'REVISAR', 'RECHAZADO'];
            const currentResult = (audit.result || '').toUpperCase().trim();
            if (!currentResult || !validResults.some(r => r === currentResult)) {
                isValid = false;
                if (resultSelect) {
                    resultSelect.classList.add('input-error');
                }
            }

            // 2) Validar Observación y Sugerido por cada línea activa
            if (tbody && Array.isArray(audit.lines)) {
                const rows = Array.from(tbody.querySelectorAll('tr'));

                audit.lines.forEach(line => {
                    if (line.excluded) return;

                    const row = rows.find(r => r.dataset.lineId === String(line.id));
                    if (!row) return;

                    const obsEl = row.querySelector('select[data-field="observacion"]');
                    const sugEl = row.querySelector('input[data-field="sugerido"]');

                    const obsVal = (line.observacion || '').trim();
                    if (!obsVal) {
                        isValid = false;
                        if (obsEl) obsEl.classList.add('input-error');
                    }

                    const sugRawText = sugEl ? (sugEl.value || '').trim() : '';
                    const sugParsed = parseAuditNumber(sugRawText);
                    const sugHasValue = sugRawText !== '';
                    if (!sugHasValue || !Number.isFinite(sugParsed) || sugParsed < 0) {
                        isValid = false;
                        if (sugEl) sugEl.classList.add('input-error');
                    } else {
                        line.sugerido = sugParsed;
                    }
                });
            }

            if (!isValid) {
                alert('No puedes exportar el informe PDF hasta completar todos los campos obligatorios de auditoría (Resultado, Observación y Sugerido en las líneas activas).');
            }

            return isValid;
        };

        const bindAuditComments = (valuationId) => {
            const valuation = (claim.valuations || []).find(v => v.id === valuationId);
            if (!valuation) return;
            const audit = ensureAuditData(valuationId, valuation);
            const settlementEl = contentArea.querySelector('#auditSettlementComment');
            const technicalEl = contentArea.querySelector('#auditTechnicalComment');
            const settlementCounter = contentArea.querySelector('#auditSettlementCounter');
            const technicalCounter = contentArea.querySelector('#auditTechnicalCounter');
            const maxChars = 450;

            if (settlementEl) {
                settlementEl.value = (audit.settlementComment || '').slice(0, maxChars);
                if (settlementCounter) {
                    settlementCounter.textContent = `${settlementEl.value.length}/${maxChars}`;
                }
                settlementEl.oninput = () => {
                    audit.settlementComment = settlementEl.value.slice(0, maxChars);
                    settlementEl.value = audit.settlementComment;
                    if (settlementCounter) {
                        settlementCounter.textContent = `${settlementEl.value.length}/${maxChars}`;
                    }
                    claimDetailDirty = true;
                    debouncedSaveClaimsToStorage();
                };
            }
            if (technicalEl) {
                technicalEl.value = (audit.technicalComment || '').slice(0, maxChars);
                if (technicalCounter) {
                    technicalCounter.textContent = `${technicalEl.value.length}/${maxChars}`;
                }
                technicalEl.oninput = () => {
                    audit.technicalComment = technicalEl.value.slice(0, maxChars);
                    technicalEl.value = audit.technicalComment;
                    if (technicalCounter) {
                        technicalCounter.textContent = `${technicalEl.value.length}/${maxChars}`;
                    }
                    claimDetailDirty = true;
                    debouncedSaveClaimsToStorage();
                };
            }
        };

        const renderAuditChecklist = (valuationId) => {
            if (!auditChecklist) return;
            auditChecklist.innerHTML = '';
            if (!valuationId) return;
            const valuation = (claim.valuations || []).find(v => v.id === valuationId);
            if (!valuation) return;
            const audit = ensureAuditData(valuationId, valuation);
            checklistItems.forEach(item => {
                const label = document.createElement('label');
                label.className = 'audit-check';
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.name = item.key;
                input.checked = !!audit.checklist[item.key];
                input.addEventListener('change', () => {
                    audit.checklist[item.key] = input.checked;
                    claimDetailDirty = true;
                    debouncedSaveClaimsToStorage();
                });
                const span = document.createElement('span');
                span.textContent = item.label;
                label.appendChild(input);
                label.appendChild(span);
                auditChecklist.appendChild(label);
            });
        };

        const renderAuditLines = (valuationId) => {
            if (!auditLinesBody) return;
            auditLinesBody.innerHTML = '';
            if (!valuationId) {
                renderAuditSavings(null);
                return;
            }

            const valuation = (claim.valuations || []).find(v => v.id === valuationId);
            if (!valuation) {
                renderAuditSavings(null);
                return;
            }

            const audit = ensureAuditData(valuationId, valuation);
            bindAuditComments(valuationId);
            const refreshSavings = () => renderAuditSavings(null, null);

            audit.lines.forEach(line => {
                const tr = document.createElement('tr');
                tr.dataset.lineId = line.id;
                if (line.excluded) {
                    tr.classList.add('audit-line-void');
                }

                const tdNombre = document.createElement('td');
                tdNombre.textContent = line.repuestoTrabajo;
                tr.appendChild(tdNombre);

                const tdAccion = document.createElement('td');
                tdAccion.textContent = line.accion || '';
                tr.appendChild(tdAccion);

                const tdCalidad = document.createElement('td');
                tdCalidad.textContent = line.calidad;
                tr.appendChild(tdCalidad);

                const tdPrecio = document.createElement('td');
                const inputPrecio = document.createElement('input');
                inputPrecio.type = 'number';
                inputPrecio.value = line.precioAuditado === '' ? '' : line.precioAuditado;
                inputPrecio.maxLength = 7;
                inputPrecio.max = 9999999;
                inputPrecio.dataset.field = 'precioAuditado';
                inputPrecio.disabled = !!line.excluded;
                inputPrecio.addEventListener('input', () => {
                    line.precioAuditado = parseAuditNumber(inputPrecio.value);
                    claimDetailDirty = true;
                    debouncedSaveClaimsToStorage();
                    refreshSavings();
                });
                tdPrecio.appendChild(inputPrecio);
                tr.appendChild(tdPrecio);

                const tdMec = document.createElement('td');
                const inputMec = document.createElement('input');
                inputMec.type = 'number';
                inputMec.step = '0.1';
                inputMec.value = line.mecanica === '' ? '' : line.mecanica;
                inputMec.maxLength = 7;
                inputMec.max = 9999999;
                inputMec.dataset.field = 'mecanica';
                inputMec.disabled = !!line.excluded;
                inputMec.addEventListener('input', () => {
                    line.mecanica = parseAuditNumber(inputMec.value);
                    claimDetailDirty = true;
                    debouncedSaveClaimsToStorage();
                    refreshSavings();
                });
                tdMec.appendChild(inputMec);
                tr.appendChild(tdMec);

                const tdDym = document.createElement('td');
                const inputDym = document.createElement('input');
                inputDym.type = 'number';
                inputDym.step = '0.1';
                inputDym.value = line.dym === '' ? '' : line.dym;
                inputDym.maxLength = 7;
                inputDym.max = 9999999;
                inputDym.dataset.field = 'dym';
                inputDym.disabled = !!line.excluded;
                inputDym.addEventListener('input', () => {
                    line.dym = parseAuditNumber(inputDym.value);
                    claimDetailDirty = true;
                    debouncedSaveClaimsToStorage();
                    refreshSavings();
                });
                tdDym.appendChild(inputDym);
                tr.appendChild(tdDym);

                const tdDes = document.createElement('td');
                const inputDes = document.createElement('input');
                inputDes.type = 'number';
                inputDes.step = '0.1';
                inputDes.value = line.desabolladura === '' ? '' : line.desabolladura;
                inputDes.maxLength = 7;
                inputDes.max = 9999999;
                inputDes.dataset.field = 'desabolladura';
                inputDes.disabled = !!line.excluded;
                inputDes.addEventListener('input', () => {
                    line.desabolladura = parseAuditNumber(inputDes.value);
                    claimDetailDirty = true;
                    debouncedSaveClaimsToStorage();
                    refreshSavings();
                });
                tdDes.appendChild(inputDes);
                tr.appendChild(tdDes);

                const tdPint = document.createElement('td');
                const inputPint = document.createElement('input');
                inputPint.type = 'number';
                inputPint.step = '0.1';
                inputPint.value = line.pintura === '' ? '' : line.pintura;
                inputPint.maxLength = 7;
                inputPint.max = 9999999;
                inputPint.dataset.field = 'pintura';
                inputPint.disabled = !!line.excluded;
                inputPint.addEventListener('input', () => {
                    line.pintura = parseAuditNumber(inputPint.value);
                    claimDetailDirty = true;
                    debouncedSaveClaimsToStorage();
                    refreshSavings();
                });
                tdPint.appendChild(inputPint);
                tr.appendChild(tdPint);

                const tdObs = document.createElement('td');
                const selectObs = document.createElement('select');
                selectObs.dataset.field = 'observacion';
                selectObs.classList.add('audit-field-observacion');
                const opcionesObs = ['', 'Reparable', 'HH excesiva', 'Sin cobertura', 'Sin fotografías', 'No corresponde'];
                opcionesObs.forEach(val => {
                    const opt = document.createElement('option');
                    opt.value = val;
                    opt.textContent = val || 'Selecciona...';
                    if (line.observacion === val) opt.selected = true;
                    selectObs.appendChild(opt);
                });
                selectObs.addEventListener('change', () => {
                    line.observacion = selectObs.value || '';
                    selectObs.classList.remove('input-error');
                    claimDetailDirty = true;
                    debouncedSaveClaimsToStorage();
                });
                selectObs.disabled = !!line.excluded;
                tdObs.appendChild(selectObs);
                tr.appendChild(tdObs);

                const tdObsRepuestos = document.createElement('td');
                const selectObsRepuestos = document.createElement('select');
                selectObsRepuestos.dataset.field = 'observacionRepuestos';
                const opcionesObsRepuestos = ['', 'Sobreprecio', 'Atraso', 'Calidad incorrecta', 'Rep. incorrecto'];
                opcionesObsRepuestos.forEach(val => {
                    const opt = document.createElement('option');
                    opt.value = val;
                    opt.textContent = val || 'Selecciona...';
                    if (line.observacionRepuestos === val) opt.selected = true;
                    selectObsRepuestos.appendChild(opt);
                });
                selectObsRepuestos.addEventListener('change', () => {
                    line.observacionRepuestos = selectObsRepuestos.value || '';
                    claimDetailDirty = true;
                    debouncedSaveClaimsToStorage();
                });
                selectObsRepuestos.disabled = !!line.excluded;
                tdObsRepuestos.appendChild(selectObsRepuestos);
                tr.appendChild(tdObsRepuestos);

                const tdHH = document.createElement('td');
                const inputHH = document.createElement('input');
                inputHH.type = 'number';
                inputHH.step = '0.1';
                inputHH.value = line.sugerido === '' ? '' : line.sugerido;
                inputHH.maxLength = 7;
                inputHH.max = 9999999;
                inputHH.dataset.field = 'sugerido';
                inputHH.classList.add('audit-field-sugerido');
                inputHH.disabled = !!line.excluded;
                inputHH.addEventListener('input', () => {
                    const val = parseAuditNumber(inputHH.value);
                    line.sugerido = Number.isFinite(val) ? val : 0;
                    inputHH.classList.toggle('input-error', !Number.isFinite(val) || val <= 0);
                    claimDetailDirty = true;
                    debouncedSaveClaimsToStorage();
                    refreshSavings();
                });
                tdHH.appendChild(inputHH);
                tr.appendChild(tdHH);

                const tdAcc = document.createElement('td');
                const btnDel = document.createElement('button');
                btnDel.type = 'button';
                btnDel.textContent = line.excluded ? '↺' : '✕';
                btnDel.className = 'btn-link-small';
                btnDel.dataset.lineId = line.id;
                btnDel.addEventListener('click', () => {
                    // Sincroniza valores actuales antes de alternar exclusión para no perder cambios sin guardar
                    commitClaimDetailEdits(claim.id);
                    const targetId = btnDel.dataset.lineId;
                    const target = audit.lines.find(l => l.id === targetId);
                    if (target) {
                        target.excluded = !target.excluded;
                    }
                    claimDetailDirty = true;
                    touchClaimUpdatedAt(claim);
                    saveClaimsToStorage();
                    renderAuditLines(valuationId);
                });
                tdAcc.appendChild(btnDel);
                tr.appendChild(tdAcc);

                auditLinesBody.appendChild(tr);
            });

            refreshSavings();

            if (auditResultSelect) {
                auditResultSelect.value = audit.result || '';
                auditResultSelect.onchange = () => {
                    audit.result = auditResultSelect.value;
                    auditResultSelect.classList.remove('input-error');
                    claimDetailDirty = true;
                    debouncedSaveClaimsToStorage();
                };
            }
            if (auditPaintSelect) {
                auditPaintSelect.value = audit.pinturaTipo || 'BICAPA';
                auditPaintSelect.onchange = () => {
                    audit.pinturaTipo = auditPaintSelect.value || 'BICAPA';
                    claimDetailDirty = true;
                    debouncedSaveClaimsToStorage();
                };
            }

            renderAuditChecklist(valuationId);
        };

        const renderAuditValuationSelector = () => {
            if (!auditValuationSelect) return;
            auditValuationSelect.innerHTML = '';
            const vals = claim.valuations || [];
            if (!vals.length) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = 'Sin informes de valoración cargados';
                auditValuationSelect.appendChild(opt);
                auditValuationSelect.disabled = true;
                renderAuditLines(null);
                renderAuditChecklist(null);
                renderAuditSavings(null);
                return;
            }
            auditValuationSelect.disabled = false;
            vals.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.id;
                opt.textContent = v.label;
                auditValuationSelect.appendChild(opt);
            });
            const defaultValId = (claimDetailActiveValuationId && vals.some(v => v.id === claimDetailActiveValuationId))
                ? claimDetailActiveValuationId
                : (vals[0]?.id || '');
            claimDetailActiveValuationId = defaultValId || null;
            auditValuationSelect.value = defaultValId;
            renderAuditLines(defaultValId);
            renderAuditChecklist(defaultValId);
            bindAuditComments(defaultValId);
            auditValuationSelect.onchange = () => {
                commitClaimDetailEdits(claim.id);
                saveClaimsToStorage();
                claimDetailActiveValuationId = auditValuationSelect.value || null;
                renderAuditLines(auditValuationSelect.value);
                renderAuditChecklist(auditValuationSelect.value);
                bindAuditComments(auditValuationSelect.value);
                renderAuditSavings(null);
            };
        };

        renderAuditValuationSelector();

        const buildGestionEstado = (auditData) => {
            const checks = auditData && auditData.checklist ? Object.entries(auditData.checklist).filter(([, val]) => !!val).map(([key]) => {
                const item = checklistItems.find(i => i.key === key);
                return item ? item.label : key;
            }) : [];
            if (!checks.length) {
                return { estado: 'Con Observación', checks: [] };
            }
            return { estado: 'Sin observación', checks };
        };

        const drawAuditManagementGraph = (svgEl, checklistState = []) => {
            if (!svgEl) return;
            const n = checklistState.length || 0;
            if (!n) return;
            const labels = checklistItems.map(item => item.label);
            const rect = svgEl.getBoundingClientRect();
            const baseW = Math.max(680, rect.width || (svgEl.parentElement?.clientWidth) || 800);
            const cssH = parseInt(getComputedStyle(svgEl).height, 10);
            const h = Math.max(260, isNaN(cssH) ? 280 : cssH);
            const LEFT_PAD = 60;
            const RIGHT_PAD = 16;
            const TOP_PAD = 20;
            const BOTTOM_PAD = 50;
            const MIN_STEP = 70;
            const MAX_STEP = 135;
            const GAP = 140;
            const usableBaseW = Math.max(100, baseW - LEFT_PAD - RIGHT_PAD);
            let xStep = n > 1 ? usableBaseW / (n - 1) : usableBaseW;
            xStep = Math.min(MAX_STEP, Math.max(MIN_STEP, xStep));
            const w = Math.max(baseW, LEFT_PAD + RIGHT_PAD + xStep * Math.max(1, n - 1));
            const usableW = Math.max(100, w - LEFT_PAD - RIGHT_PAD);
            const center = (h - TOP_PAD - BOTTOM_PAD) / 2 + TOP_PAD;
            const yTop = Math.max(TOP_PAD, Math.round(center - GAP / 2));
            const yBot = Math.min(h - BOTTOM_PAD, Math.round(center + GAP / 2));
            const offsetX = Math.max(0, usableW * 0.2);
            const offsetY = 0;

            svgEl.setAttribute('viewBox', `0 0 ${w + offsetX} ${h + offsetY}`);
            svgEl.innerHTML = '';

            const xPositions = [];
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('transform', `translate(${offsetX}, 0)`);
            for (let i = 0; i < n; i++) {
                const x = Math.round(LEFT_PAD + i * Math.min(xStep, usableW / Math.max(1, n - 1)));
                xPositions.push(x);
                const guide = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                guide.setAttribute('x1', x);
                guide.setAttribute('x2', x);
                guide.setAttribute('y1', TOP_PAD);
                guide.setAttribute('y2', h - BOTTOM_PAD);
                guide.setAttribute('class', 'guideline');
                g.appendChild(guide);
            }

            let points = '';
            for (let i = 0; i < n; i++) {
                const x = Math.min(w - RIGHT_PAD, xPositions[i]);
                const y = checklistState[i] ? yTop : yBot; // con observación apunta hacia arriba
                points += `${x},${y} `;
            }
            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            poly.setAttribute('points', points.trim());
            poly.setAttribute('class', 'poly');
            g.appendChild(poly);

            const baseY = h - 14;
            const labelAngle = -30;
            const labelFontSize = 12;
            for (let i = 0; i < n; i++) {
                const label = labels[i] || '';
                const x = Math.min(w - RIGHT_PAD, xPositions[i]);
                const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                t.setAttribute('x', x);
                t.setAttribute('y', baseY);
                t.setAttribute('text-anchor', 'end');
                t.setAttribute('font-size', String(labelFontSize));
                t.setAttribute('transform', `rotate(${labelAngle}, ${x}, ${baseY})`);
                t.textContent = label;
                g.appendChild(t);
            }
            svgEl.appendChild(g);
        };

        const clearTaintedImages = (rootEl) => {
            if (!rootEl) return;
            const transparentPx = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAr8B9oSpEJwAAAAASUVORK5CYII=';
            rootEl.querySelectorAll('img').forEach(img => {
                const src = img.getAttribute('src') || '';
                // data URLs o rutas locales se mantienen
                if (src.startsWith('data:')) return;
                if (src && !/^(https?:)?\/\//i.test(src)) return; // relativo = mismo origen
                try {
                    const url = new URL(src, location.href);
                    if (url.origin !== location.origin) {
                        img.setAttribute('crossorigin', 'anonymous');
                        img.setAttribute('src', transparentPx);
                    }
                } catch (_) {
                    img.setAttribute('src', transparentPx);
                }
            });
        };

        const sanitizeImagesForCanvas = (rootEl) => {
            if (!rootEl) return;
            const imgs = rootEl.querySelectorAll('img');
            imgs.forEach((img) => {
                const src = img.getAttribute('src') || '';
                const id = img.id || '';
                // No tocar los logos locales del informe
                if (/^reportLogo/i.test(id)) {
                    return;
                }
                img.setAttribute('crossorigin', 'anonymous');
                if (/^https?:\/\//i.test(src)) {
                    img.setAttribute('data-original-src', src);
                    img.setAttribute('src', '');
                }
            });
        };

        const generateAuditReportPdf = async () => {
            try {
                if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
                    alert('No se pudo generar el PDF: librerías faltantes.');
                    return;
                }

                commitClaimDetailEdits(claim.id);
                saveClaimsToStorage();

                const valId = auditValuationSelect ? auditValuationSelect.value : (claim.valuations?.[0]?.id || '');
                const valuation = (claim.valuations || []).find(v => v.id === valId);
                if (!valuation) {
                    alert('No hay informe de valoración seleccionado para exportar.');
                    return;
                }
                const audit = ensureAuditData(valId, valuation);

                // Validación de reglas de negocio antes de exportar
                if (!validateAuditBeforeExport(audit, valId)) {
                    return;
                }
                const toNumber = parseAuditNumber;
                const obsLiqEl = contentArea.querySelector('#auditSettlementComment');
                const obsTecEl = contentArea.querySelector('#auditTechnicalComment');
                if (obsLiqEl) {
                    audit.settlementComment = obsLiqEl.value || '';
                }
                if (obsTecEl) {
                    audit.technicalComment = obsTecEl.value || '';
                }
                saveClaimsToStorage();

                const { totalPesos, totalUf } = computeAuditSavings(audit, getEffectiveUfValue());

                const gestion = buildGestionEstado(audit);
                const obsLiq = audit.settlementComment || '';
                const obsTec = audit.technicalComment || '';

                let photos = [];
                if (Array.isArray(claim.photoHighlights) && claim.photoHighlights.length) {
                    const sorted = claim.photoHighlights.slice(0, 4);
                    sorted.forEach(idx => {
                        const src = claim.photos?.[idx];
                        if (src) photos.push(src);
                    });
                }
                if (!photos.length && Array.isArray(claim.photos)) {
                    photos = claim.photos.slice(0, 4);
                }
                while (photos.length < 4) {
                    photos.push(null);
                }

                const template = document.getElementById('auditReportTemplate');
                if (!template) {
                    alert('No se encontró la plantilla de informe.');
                    return;
                }

                const fragment = template.content.cloneNode(true);
                const reportRoot = fragment.querySelector('.audit-report');
                if (!reportRoot) {
                    alert('Plantilla de informe inválida.');
                    return;
                }
                reportRoot.id = 'audit-report-print';
                reportRoot.style.position = 'absolute';
                reportRoot.style.left = '-9999px';

                const setText = (sel, value) => {
                    const el = reportRoot.querySelector(sel);
                    if (el) el.textContent = value ?? '';
                };

            const setImg = (sel, src) => {
                const el = reportRoot.querySelector(sel);
                if (!el) return;
                if (src) {
                    el.setAttribute('src', src);
                } else {
                    el.removeAttribute('src');
                }
            };

                const now = new Date();
                const fechaStr = now.toLocaleDateString('es-CL');
                setText('.date-pill__value strong', fechaStr);
                setText('.title-band h1', 'INFORME DE AUDITORÍA');
                setText('.title-band h2', `SINIESTRO: ${claim.id}`);
                setText('.uf-card__value', `${totalUf.toFixed(2)} UF`);
                const estadoClass = (audit.result || '').toLowerCase() || 'revisar';
                const statusEl = reportRoot.querySelector('.uf-card__status');
                if (statusEl) {
                    statusEl.textContent = audit.result || 'Revisar';
                    statusEl.classList.add(`estado-${estadoClass}`);
                }
                const loginLogoEl = document.querySelector('.login-logo-img');
                // Logo auditor (sección Clientes) tiene prioridad; fallback al logo del login y luego al archivo local
                if (!clientesState || !clientesState.length) {
                    loadClientesFromStorage();
                }
                const auditorLogoFromCliente = (clientesState || []).find(c => c.logoAuditor) || null;
                const kensaLogoSrc = auditorLogoFromCliente?.logoAuditor
                    || (loginLogoEl && loginLogoEl.getAttribute('src'))
                    || new URL('Imagenes/Logo Kensa fondo blanco.png', location.href).toString();
                const clientLogoEl = document.getElementById('clienteLogoHeader');
                const clientLogoRaw = clientLogoEl && clientLogoEl.getAttribute('src') ? clientLogoEl.getAttribute('src') : '';
                let clientLogoSrc = '';
                if (clientLogoRaw) {
                    if (clientLogoRaw.startsWith('data:')) {
                        clientLogoSrc = clientLogoRaw;
                    } else {
                        try {
                            const url = new URL(clientLogoRaw, location.href);
                            clientLogoSrc = url.toString();
                        } catch (_) {
                            // dejarlo vacío
                        }
                    }
                }
                setImg('#reportLogoLeftP1', kensaLogoSrc);
                setImg('#reportLogoRightP1', clientLogoSrc);
                setImg('#reportLogoLeftP2', kensaLogoSrc);
                setImg('#reportLogoRightP2', clientLogoSrc);
        const setCaseValue = (label, value) => {
            const items = reportRoot.querySelectorAll('.case-item');
            items.forEach((item) => {
                const strong = item.querySelector('strong');
                const span = item.querySelector('span');
                        if (strong && span && strong.textContent.toLowerCase().includes(label.toLowerCase())) {
                            span.textContent = value ?? '';
                        }
                    });
                };
                setCaseValue('LIQUIDADOR', claim.adjuster || '');
                setCaseValue('TALLER', claim.workshop || '');
                setCaseValue('MARCA', claim.brand || '');
                setCaseValue('MODELO', claim.model || '');
                setCaseValue('PATENTE', claim.plate || '');
                setCaseValue('AÑO', claim.year || '');

                const cleanFacts = (txt) => {
                    if (!txt) return '';
                    const star = txt.match(/\*(.*?)\*/s);
                    const base = star ? star[1] : txt;
                    return base.trim();
                };
                const factsSource =
                    (claim.pdfMapping && (claim.pdfMapping.facts || claim.pdfMapping.description || claim.pdfMapping.mappedFacts)) ||
                    claim.mappedFacts ||
                    claim.description ||
                    '';
                const denuncioText = cleanFacts(factsSource);
                setText('.panel-box--denuncio .panel-box__body', denuncioText || 'Sin registro de versión de los hechos.');
                setText('.panel-box--obsliq .panel-box__body', obsLiq || 'Con observación.');
                setText('.panel-box--obstec .panel-box__body', obsTec || 'Con observación.');

                const tb = reportRoot.querySelector('#reportTableBody');
                if (tb) {
                    tb.innerHTML = '';
                    audit.lines.filter(l => !l.excluded).forEach((line) => {
                        const precio = toNumber(line.precioAuditado);
                        const mec = toNumber(line.mecanica);
                        const dym = toNumber(line.dym);
                        const des = toNumber(line.desabolladura);
                        const pint = toNumber(line.pintura);
                        const sug = toNumber(line.sugerido);
                        const ajusteLiq = precio + mec + dym + des + pint; // suma de todos los ajustes auditados
                        const ahorro = ajusteLiq - sug; // resta del total menos el sugerido (valor auditado)
                        const formatObs = (val) => {
                            const txt = String(val ?? '').trim();
                            return txt ? txt : '-';
                        };
                        const row = document.createElement('div');
                        row.className = 'table__row';
                        row.innerHTML = `
                            <div class="table__cell w-25">${line.repuestoTrabajo || ''}</div>
                            <div class="table__cell w-35 report-col-obstec">${formatObs(line.observacion)}</div>
                            <div class="table__cell w-10 report-col-obsrep">${formatObs(line.observacionRepuestos || line.obsRepuestos)}</div>
                            <div class="table__cell w-10 ta-right">${ajusteLiq.toLocaleString('es-CL', { minimumFractionDigits: 0 })}</div>
                            <div class="table__cell w-10 ta-right">${sug.toLocaleString('es-CL', { minimumFractionDigits: 0 })}</div>
                            <div class="table__cell w-10 ta-right">${ahorro.toLocaleString('es-CL', { minimumFractionDigits: 0 })}</div>
                        `;
                        tb.appendChild(row);
                    });
                    const totalCell = reportRoot.querySelector('.table__row--foot .table__cell:last-child strong');
                    if (totalCell) totalCell.textContent = totalPesos.toLocaleString('es-CL', { minimumFractionDigits: 0 });
                }

                const photoImgs = reportRoot.querySelectorAll('.photo-card .photo-stage img');
                photoImgs.forEach((img, idx) => {
                    const src = photos[idx];
                    if (src) {
                        img.setAttribute('src', src);
                    } else {
                        img.setAttribute('src', '');
                        img.setAttribute('alt', 'Foto no disponible');
                    }
                });

                const checklistState = checklistItems.map(item => !!audit.checklist[item.key]);
                const svg = reportRoot.querySelector('#mgGraphStatic');
                drawAuditManagementGraph(svg, checklistState);

                clearTaintedImages(reportRoot);

                document.body.appendChild(reportRoot);

                const pages = reportRoot.querySelectorAll('.page');
                const pdf = new window.jspdf.jsPDF('p', 'pt', 'a4');
                for (let i = 0; i < pages.length; i++) {
                    const canvas = await html2canvas(pages[i], {
                        scale: 2,
                        useCORS: true,
                        allowTaint: false,
                        backgroundColor: '#ffffff',
                        logging: false
                    });
                    const imgData = canvas.toDataURL('image/png');
                    const imgWidth = pdf.internal.pageSize.getWidth();
                    const imgHeight = canvas.height * imgWidth / canvas.width;
                    if (i > 0) pdf.addPage();
                    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
                }

                pdf.save(`Informe_Auditoria_${claim.id}.pdf`);
                document.body.removeChild(reportRoot);
            } catch (err) {
                console.error('Error generando PDF de auditoría', err);
                alert('No se pudo generar el PDF. Revisa la consola para más detalles.');
            }
        };

        if (exportAuditPdfBtn) {
            exportAuditPdfBtn.addEventListener('click', generateAuditReportPdf);
        }
        const exportAuditBudgetBtn = contentArea.querySelector('#exportAuditBudgetBtn');
        if (exportAuditBudgetBtn) {
            exportAuditBudgetBtn.addEventListener('click', () => {
                exportBudgetPdf(claim.id);
            });
        }

        // Back button logic
        const backBtn = document.getElementById('backToClaims');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                loadView('claims');
            });
        }

        // Tab behavior
        const tabButtons = contentArea.querySelectorAll('.tabs .tab-btn');
        const tabSections = contentArea.querySelectorAll('[data-tab-content]');

        const showTab = (tabName) => {
            claimDetailActiveTab = tabName || 'photos';
            tabButtons.forEach((btn) => {
                const btnTab = btn.dataset.tab;
                btn.classList.toggle('active', btnTab === tabName);
            });

            tabSections.forEach((section) => {
                const sectionTab = section.dataset.tabContent;
                section.style.display = sectionTab === tabName ? 'block' : 'none';
            });
        };

        tabButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                showTab(tab);
            });
        });

        showTab(normalizedTab || 'photos');

        syncAuditModelFn = (valId) => commitClaimDetailEdits(claim.id, { valuationId: valId });

        async function processValuationPdfFile(file) {
            if (!file || file.type !== 'application/pdf') {
                alert('Por favor selecciona un archivo PDF válido.');
                return;
            }
            if (typeof pdfjsLib === 'undefined') {
                alert('No se pudo cargar pdf.js para procesar el documento.');
                return;
            }
            try {
                const arrayBuffer = await file.arrayBuffer();
                const fullText = await extractFullTextFromPdf(arrayBuffer);
                console.log('========= TEXTO COMPLETO DEL PDF =========');
                console.log(fullText);
                console.log('========= FIN TEXTO PDF =========');
                console.log('Longitud del texto extraído:', fullText.length);
                const metaFromPdf = parseClaimMetadataFromPdfText(fullText);
                const valuation = parseValuationFromText(fullText, file.name);
                const controlOps = extractOperacionesDeControl(fullText);
                if (valuation) {
                    valuation.summary = valuation.summary || valuation.economics || {};
                    valuation.summary.controlOperations = controlOps;
                }
                if (!valuation || !valuation.economics || !Array.isArray(valuation.items)) {
                    console.warn('Valoración inválida devuelta por parseValuationFromText', valuation);
                }
                saveValuationForClaim(claim.id, valuation || {
                    economics: {
                        bodyworkValue: null,
                        mechatronicsValue: null,
                        materialsValue: null,
                        paintTotal: null,
                        partsValueNet: null,
                        laborValueNet: null,
                        subtotalValuation: null,
                        deductible: null,
                        totalWithTax: null,
                        lossPercentage: null
                    },
                    summary: {
                        controlOperations: controlOps
                    },
                    items: [],
                    document: {
                        fileName: file.name,
                        uploadedAt: new Date().toISOString()
                    }
                });
                if (metaFromPdf && metaFromPdf.pdfMapping && (metaFromPdf.pdfMapping.facts || metaFromPdf.pdfMapping.control)) {
                    claim.pdfMapping = {
                        facts: metaFromPdf.pdfMapping.facts || (claim.pdfMapping && claim.pdfMapping.facts) || '',
                        control: metaFromPdf.pdfMapping.control || (claim.pdfMapping && claim.pdfMapping.control) || ''
                    };
                    touchClaimUpdatedAt(claim);
                    saveClaimsToStorage();
                }
                renderAuditDetail(claim.id, 'costs');
            } catch (err) {
                console.error('Error leyendo o parseando el PDF', err);
                alert('Hubo un problema al procesar el PDF. Revisa la consola para más detalles.');
            }
        }

        const pdfInput = contentArea.querySelector('#valuationPdfInput');
        const dropZone = contentArea.querySelector('#valuationDropZone');
        const browseButton = contentArea.querySelector('#valuationBrowseButton');

        if (browseButton && pdfInput) {
            browseButton.addEventListener('click', () => {
                pdfInput.click();
            });
        }

        if (pdfInput) {
            pdfInput.addEventListener('change', (event) => {
                const file = event.target.files && event.target.files[0];
                if (!file) return;
                processValuationPdfFile(file);
            });
        }

        if (dropZone) {
            const preventDefaults = (e) => {
                e.preventDefault();
                e.stopPropagation();
            };

            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, preventDefaults, false);
            });

            ['dragenter', 'dragover'].forEach(eventName => {
                dropZone.addEventListener(eventName, () => {
                    dropZone.classList.add('dragover');
                }, false);
            });

            ['dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, () => {
                    dropZone.classList.remove('dragover');
                }, false);
            });

            dropZone.addEventListener('drop', (event) => {
                const dt = event.dataTransfer;
                if (!dt || !dt.files || !dt.files.length) return;
                const file = dt.files[0];
                processValuationPdfFile(file);
            });
        }
    }

    function renderReports() {
        const reportsHTML = `
            <div class="fade-in">
                <div class="grid-layout">
                    <div class="card">
                        <h3>Costo promedio vs Valores sugeridos</h3>
                        <canvas id="timeChart" style="max-height: 300px;"></canvas>
                    </div>
                    <div class="card">
                        <h3>Mix de Repuestos</h3>
                        <canvas id="partsChart" style="max-height: 300px;"></canvas>
                    </div>
                </div>
                
                <div class="card">
                    <h3>Desempeño por Taller</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Taller</th>
                                <th>Siniestros</th>
                                <th>Tiempo Promedio</th>
                                <th>Costo Promedio</th>
                                <th>Calidad</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Sociedad rutakar spa</td>
                                <td>45</td>
                                <td>12 días</td>
                                <td>$980.000</td>
                                <td><span style="color: var(--success)">9.8/10</span></td>
                            </tr>
                            <tr>
                                <td>Servicio automotriz raul jovino</td>
                                <td>32</td>
                                <td>15 días</td>
                                <td>$1.100.000</td>
                                <td><span style="color: var(--warning)">8.5/10</span></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        contentArea.innerHTML = reportsHTML;

        // Initialize Charts
        setTimeout(initCharts, 100);
    }



    function initCharts() {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js no disponible; se omite renderizado de gráficos');
            return;
        }

        const ctxTime = document.getElementById('timeChart');
        const ctxParts = document.getElementById('partsChart');
        const mixData = computeMixRepuestosFromClaims(getDashboardFilteredClaims());
        const costSeries = computeCostVsSuggestedSeries(getDashboardFilteredClaims());

        if (ctxTime) {
            const lineChart = new Chart(ctxTime, {
                type: 'line',
                data: {
                    labels: costSeries.labels,
                    datasets: [{
                        label: 'Costo promedio (UF)',
                        data: costSeries.avgCosts,
                        borderColor: '#3b82f6',
                        tension: 0.4
                    }, {
                        label: 'Costo - ahorro (UF)',
                        data: costSeries.adjustedCosts,
                        borderColor: '#94a3b8',
                        borderDash: [5, 5],
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        tooltip: window.KensaCharts ? window.KensaCharts.kensaChartTooltip('Costo promedio') : {}
                    }
                }
            });
            ctxTime.addEventListener('mouseleave', () => {
                if (window.KensaCharts && typeof window.KensaCharts.hideTooltip === 'function') {
                    window.KensaCharts.hideTooltip();
                }
            });
        }

        if (ctxParts) {
            const labels = mixData.labels;
            const data = mixData.data;
            const colors = mixData.colors;
            const donutChart = new Chart(ctxParts, {
                type: 'doughnut',
                data: {
                    labels,
                    datasets: [{
                        data,
                        backgroundColor: colors
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        tooltip: window.KensaCharts ? window.KensaCharts.kensaChartTooltip('Mix de Repuestos') : {}
                    }
                }
            });
            ctxParts.addEventListener('mouseleave', () => {
                if (window.KensaCharts && typeof window.KensaCharts.hideTooltip === 'function') {
                    window.KensaCharts.hideTooltip();
                }
            });
        }
    }
});

function pickPreferredValuation(claim) {
    const vals = Array.isArray(claim?.valuations) ? claim.valuations : [];
    if (!vals.length) return null;

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

function normalizeQualityBucket(q) {
    const s = String(q || '')
        .replace(/\u00A0/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .trim()
        .toUpperCase();
    if (!s) return '';
    if (s.includes('ALTERNO')) return 'ALTERNO';
    if (s.includes('ORIGINAL')) return 'ORIGINAL';
    if (s.includes('GENUINO') || s.includes('OEM')) return 'ORIGINAL';
    return 'OTROS';
}

function getLinePrice(line) {
    const raw = line?.totalPrice ?? line?.unitPrice ?? line?.precio ?? line?.price ?? 0;
    if (typeof raw === 'number') return raw;
    const digits = String(raw || '').replace(/[^\d]/g, '');
    return digits ? Number(digits) : 0;
}

function computeMixRepuestosFromClaims(claims) {
    const counts = { ORIGINAL: 0, ALTERNO: 0, OTROS: 0 };

    (claims || []).forEach((claim) => {
        const val = pickPreferredValuation(claim);
        if (!val) return;

        const parts = getValuationParts(val);
        parts.forEach((line) => {
            const qualityRaw = line?.quality ?? line?.calidad ?? line?.Calidad ?? '';
            const bucket = normalizeQualityBucket(qualityRaw);
            if (!bucket) return;
            const price = getLinePrice(line);
            if (price <= 0) return;
            counts[bucket] = (counts[bucket] || 0) + 1;
        });
    });

    const orderedBuckets = ['ORIGINAL', 'ALTERNO', 'OTROS'];
    const labels = [];
    const data = [];
    const colors = [];
    const palette = {
        ORIGINAL: '#3b82f6',
        ALTERNO: '#10b981',
        OTROS: '#f59e0b',
        EMPTY: '#cbd5e1'
    };

    orderedBuckets.forEach((b) => {
        const val = counts[b] || 0;
        if (val > 0) {
            labels.push(b === 'OTROS' ? 'Otros' : (b === 'ALTERNO' ? 'Alternativos' : 'Originales'));
            data.push(val);
            colors.push(palette[b]);
        }
    });

    if (!data.length) {
        return {
            labels: ['Sin datos'],
            data: [1],
            colors: [palette.EMPTY]
        };
    }

    return { labels, data, colors };
}

function getDashboardFilteredClaims() {
    const start = parseDateValue(dashboardFilterStart);
    const end = parseDateValue(dashboardFilterEnd);

    return claimsState.filter((claim) => {
        if (!claim.date) return false;
        const claimDate = parseDateValue(claim.date);
        if (!claimDate) return false;
        if (start && claimDate < start) return false;
        if (end && claimDate > end) return false;
        if (dashboardFilterAdjuster && String(claim.adjuster || '').toLowerCase() !== dashboardFilterAdjuster.toLowerCase()) return false;
        if (dashboardFilterValuator) {
            const valBy = String(claim.valuedBy || claim.valorador || claim.evaluator || '').toLowerCase();
            if (valBy !== dashboardFilterValuator.toLowerCase()) return false;
        }
        if (dashboardFilterWorkshop && String(claim.workshop || '').toLowerCase() !== dashboardFilterWorkshop.toLowerCase()) return false;
        if (dashboardFilterCity && String(claim.workshopCity || '').toLowerCase() !== dashboardFilterCity.toLowerCase()) return false;
        return true;
    });
}

function getClaimSubtotalUf(claim, ufVal) {
    if (!claim) return 0;
    const uf = ufVal || getEffectiveUfValue();
    if (!uf || uf <= 0) return 0;
    const val = pickPreferredValuation(claim);
    if (!val || !val.summary) return 0;
    const econ = val.summary || {};
    const rawSubtotal = econ.subtotalValuation ?? econ.subtotalValoracion ?? null;
    const subtotal = typeof rawSubtotal === 'number' && Number.isFinite(rawSubtotal)
        ? rawSubtotal
        : Number(String(rawSubtotal || '').replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(subtotal) || subtotal <= 0) return 0;
    return subtotal / uf;
}

function getAuditSavingsUf(claim, ufVal) {
    if (!claim) return 0;
    const uf = ufVal || getEffectiveUfValue();
    if (!uf || uf <= 0) return 0;
    const val = pickPreferredValuation(claim);
    const valId = val?.id;
    const audit = valId && claim.auditByValuation ? claim.auditByValuation[valId] : null;
    if (!audit || !Array.isArray(audit.lines)) return 0;
    const total = audit.lines
        .filter(line => !line.excluded)
        .reduce((acc, line) => {
            const precio = parseAuditNumber(line.precioAuditado);
            const mec = parseAuditNumber(line.mecanica);
            const dym = parseAuditNumber(line.dym);
            const des = parseAuditNumber(line.desabolladura);
            const pint = parseAuditNumber(line.pintura);
            const sug = parseAuditNumber(line.sugerido);
            return acc + (precio + mec + dym + des + pint - sug);
        }, 0);
    const savingsUf = total / uf;
    return Number.isFinite(savingsUf) && savingsUf > 0 ? savingsUf : 0;
}

function computeCostVsSuggestedSeries(claims) {
    const monthLabels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const monthsBack = 6;
    const now = new Date();
    const keys = [];
    const labels = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        keys.push(key);
        labels.push(monthLabels[d.getMonth()]);
    }

    const buckets = keys.map(() => ({ costSum: 0, savingsSum: 0, count: 0 }));
    const uf = getEffectiveUfValue();

    (claims || []).forEach((claim) => {
        const claimDate = parseDateValue(claim.date || claim.createdAt);
        if (!claimDate) return;
        const key = `${claimDate.getFullYear()}-${String(claimDate.getMonth() + 1).padStart(2, '0')}`;
        const idx = keys.indexOf(key);
        if (idx === -1) return;
        const costUf = getClaimSubtotalUf(claim, uf);
        const savingsUf = getAuditSavingsUf(claim, uf);
        if (costUf <= 0) return;
        buckets[idx].costSum += costUf;
        buckets[idx].savingsSum += Math.max(savingsUf, 0);
        buckets[idx].count += 1;
    });

    const avgCosts = buckets.map(b => b.count ? b.costSum / b.count : 0);
    const adjustedCosts = buckets.map(b => {
        if (!b.count) return 0;
        const val = (b.costSum - b.savingsSum) / b.count;
        return val > 0 ? val : 0;
    });

    return { labels, avgCosts, adjustedCosts };
}

function computeAverageSubtotalUf(claims) {
    const uf = getEffectiveUfValue();
    if (!uf || uf <= 0) return { avgUf: 0, sampleCount: 0 };

    const values = [];
    (claims || []).forEach((claim) => {
        const val = pickPreferredValuation(claim);
        if (!val || !val.summary) return;
        const econ = val.summary || {};
        const subtotal = econ.subtotalValuation ?? econ.subtotalValoracion ?? null;
        if (typeof subtotal === 'number' && Number.isFinite(subtotal) && subtotal > 0) {
            values.push(subtotal);
        }
    });

    if (!values.length) return { avgUf: 0, sampleCount: 0 };
    const avgClp = values.reduce((a, b) => a + b, 0) / values.length;
    return { avgUf: avgClp / uf, sampleCount: values.length };
}

function computeAverageAdjustedCostUf(claims) {
    const uf = getEffectiveUfValue();
    if (!uf || uf <= 0) return { avgAdjUf: 0, sampleCount: 0 };

    const values = [];
    (claims || []).forEach((claim) => {
        const subtotalUf = getClaimSubtotalUf(claim, uf);
        if (subtotalUf <= 0) return;
        const savingsUf = getAuditSavingsUf(claim, uf);
        const adjusted = Math.max(subtotalUf - savingsUf, 0);
        values.push(adjusted);
    });

    if (!values.length) return { avgAdjUf: 0, sampleCount: 0 };
    const avgAdjUf = values.reduce((a, b) => a + b, 0) / values.length;
    return { avgAdjUf, sampleCount: values.length };
}

function computeAveragePartsLaborUf(claims) {
    const uf = getEffectiveUfValue();
    if (!uf || uf <= 0) return { avgPartsUf: 0, avgLaborUf: 0 };

    const partsVals = [];
    const laborVals = [];

    (claims || []).forEach((claim) => {
        const val = pickPreferredValuation(claim);
        if (!val || !val.summary) return;
        const econ = val.summary || {};
        const parts = econ.partsValueNet ?? econ.valorRepuestos ?? null;
        const labor = econ.laborValueNet ?? econ.valorManoObra ?? null;
        partsVals.push(typeof parts === 'number' && Number.isFinite(parts) ? parts : 0);
        laborVals.push(typeof labor === 'number' && Number.isFinite(labor) ? labor : 0);
    });

    const avgPartsUf = partsVals.length
        ? (partsVals.reduce((a, b) => a + b, 0) / partsVals.length) / uf
        : 0;
    const avgLaborUf = laborVals.length
        ? (laborVals.reduce((a, b) => a + b, 0) / laborVals.length) / uf
        : 0;

    return { avgPartsUf, avgLaborUf };
}

function getEffectiveUfValue() {
    const activeClient = (clientesState || []).find(c => c && c.valorUf && Number(c.valorUf) > 0);
    const ufVal = activeClient ? Number(activeClient.valorUf) : UF_VALUE;
    return Number.isFinite(ufVal) && ufVal > 0 ? ufVal : UF_VALUE;
}

function normPdfText(t) {
    return (t || '')
        .replace(/\u00A0/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\r/g, '')
        .trim();
}

function pickAfterLabel(text, labels) {
    const t = normPdfText(text);
    for (const lab of labels) {
        const re = new RegExp(`${lab}\\s*[:：]\\s*([^\\n]+)`, 'i');
        const m = t.match(re);
        if (m && m[1]) return m[1].trim();
    }
    return '';
}

function pickLineValue(text, labels) {
    const linesArr = (text || '').split('\n').map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < linesArr.length; i++) {
        for (const lab of labels) {
            if (new RegExp(`^${lab}\\s*[:：]?\\s*$`, 'i').test(linesArr[i]) && linesArr[i + 1]) {
                return linesArr[i + 1].trim();
            }
            const inline = linesArr[i].match(new RegExp(`^${lab}\\s*[:：]\\s*(.+)$`, 'i'));
            if (inline && inline[1]) return inline[1].trim();
        }
    }
    return '';
}

function extractOperacionesDeControl(pdfText) {
    const t = String(pdfText || '');
    const lines = t.split(/\r?\n/).map(l => l.trim());
    const idxLine = lines.findIndex(l => /Operaciones\s+de\s+control/i.test(l));
    if (idxLine === -1) return [];

    // Tomar solo la primera línea no vacía siguiente al encabezado
    let payload = '';
    for (let i = idxLine + 1; i < lines.length; i++) {
        if (lines[i]) {
            payload = lines[i];
            break;
        }
    }
    if (!payload) return [];
    if (/Mano\s+de\s+obra\s+carrocer[ií]a\s+y\s+mecatr[oó]nica/i.test(payload)) return [];

    // 1) Intentar capturar si vienen entre comillas en esa línea
    let matches = [...payload.matchAll(/["“”]([^"“”]+)["“”]/g)]
        .map(m => (m[1] || '').trim())
        .filter(Boolean);

    // 2) Sin comillas: dividir por grupos iniciados en mayúscula o por dobles espacios
    if (!matches.length) {
        const byDoubleSpace = payload.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
        if (byDoubleSpace.length > 1) {
            matches = byDoubleSpace;
        } else {
            const segs = [...payload.matchAll(/([A-ZÁÉÍÓÚÑ][^A-ZÁÉÍÓÚÑ]+)/g)]
                .map(m => (m[1] || '').trim())
                .filter(Boolean);
            matches = segs.length ? segs : [payload.trim()];
        }
    }

    const seen = new Set();
    const uniq = [];
    for (const s of matches) {
        const k = s.toLowerCase();
        if (!seen.has(k)) {
            seen.add(k);
            uniq.push(s);
        }
    }
    return uniq;
}

function parseMoneyCLP(val) {
    if (val == null) return null;
    const s = String(val).trim();
    const cleaned = s.replace(/[^\d]/g, '');
    if (!cleaned) return null;
    const num = Number(cleaned);
    return Number.isNaN(num) ? null : num;
}

function cleanQuotedVal(s) {
    return String(s || '')
        .replace(/"/g, '')
        .replace(/\u00A0/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .trim();
}

function parseMoneyCLPStrict(s) {
    const v = cleanQuotedVal(s);
    const digits = v.replace(/[^\d]/g, '');
    return digits ? Number(digits) : null;
}

function parsePercentStrict(s) {
    const v = cleanQuotedVal(s);
    const m = v.match(/(\d+(?:[.,]\d+)?)/);
    if (!m) return null;
    return Number(m[1].replace(',', '.'));
}

function findVIN(val) {
    const s = String(val || '');
    const m = s.match(/\b([A-HJ-NPR-Z0-9]{17})\b/i);
    return m ? m[1].toUpperCase() : s.trim();
}

function pickTotalWithContext(text) {
    const t = text || '';
    const idx = t.search(/Subtotal\s*(Valoraci[oó]n|Valuaci[oó]n)/i);
    if (idx >= 0) {
        const slice = t.slice(idx, idx + 1200);
        const v = pickAfterLabel(slice, [
            'Total Valoración',
            'Total Valuación',
            'Total valoración',
            'Total valuación',
            'Total'
        ]);
        if (v) return v;
    }
    return pickAfterLabel(t, [
        'Total Valoración',
        'Total Valuación',
        'Total valoración',
        'Total valuación',
        'Total'
    ]);
}

function parseClaimMetadataFromPdfText(pdfText) {
    const result = {
        claimNumber: '',
        brand: '',
        model: '',
        year: '',
        plate: '',
        workshopName: '',
        workshopCity: '',
        adjusterName: '',
        pdfMapping: {
            facts: '',
            control: ''
        }
    };

    if (!pdfText) return result;

    const text = String(pdfText);
    const lines = text
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);

    const getValueAfterLabel = (labelRegex, maxLookahead = 5) => {
        const idx = lines.findIndex(l => labelRegex.test(l));
        if (idx === -1) return '';

        const sameLine = lines[idx].split(':')[1];
        if (sameLine && sameLine.trim()) {
            return sameLine.trim();
        }

        for (let i = idx + 1; i <= idx + maxLookahead && i < lines.length; i++) {
            const candidate = lines[i].trim();
            if (!candidate) continue;
            if (/:$/.test(candidate)) continue;
            return candidate;
        }
        return '';
    };

    const findPlate = () => {
        const idx = lines.findIndex(l => /Placa\s+Asegurado/i.test(l));
        if (idx === -1) return '';

        const isPlate = (s) => /^[A-Z0-9]{5,8}$/.test((s || '').trim());

        for (let offset = -3; offset <= 3; offset++) {
            if (offset === 0) continue;
            const i = idx + offset;
            if (i < 0 || i >= lines.length) continue;
            const candidate = lines[i].trim();
            if (!candidate || candidate.endsWith(':')) continue;
            if (isPlate(candidate)) return candidate;
        }
        return '';
    };

    const findWorkshop = () => {
        const idxCiudad = lines.findIndex(l => /Ciudad del taller/i.test(l) && /Taller:/i.test(l));
        if (idxCiudad !== -1 && idxCiudad + 1 < lines.length) {
            const nextLine = lines[idxCiudad + 1].trim();
            const parts = nextLine.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);
            if (parts.length) {
                return parts[parts.length - 1];
            }
        }

        const idxTaller = lines.findIndex(l => /Taller:/i.test(l));
        if (idxTaller !== -1) {
            const after = lines[idxTaller].split(/Taller:/i)[1];
            if (after && after.trim()) {
                return after.trim();
            }
        }

        return '';
    };

    const findWorkshopCity = () => {
        const idxCiudad = lines.findIndex(l => /Ciudad del taller/i.test(l) && /Taller:/i.test(l));
        if (idxCiudad !== -1 && idxCiudad + 1 < lines.length) {
            const nextLine = lines[idxCiudad + 1].trim();
            const parts = nextLine.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);
            if (parts.length) {
                return parts[0];
            }
        }

        const idxAlt = lines.findIndex(l => /Ciudad del taller/i.test(l));
        if (idxAlt !== -1) {
            const after = lines[idxAlt].split(/Ciudad del taller:/i)[1];
            if (after && after.trim()) return after.trim();
            if (idxAlt + 1 < lines.length) {
                const candidate = lines[idxAlt + 1].trim();
                if (candidate) return candidate;
            }
        }

        return '';
    };

    const findSectionText = (labelRegex, stopRegexList = []) => {
        const idx = lines.findIndex(l => labelRegex.test(l));
        if (idx === -1) return '';
        let collected = [];
        for (let i = idx + 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;
            if (stopRegexList.some(rx => rx.test(line))) break;
            collected.push(line);
        }
        const text = collected.join(' ').trim();
        const starMatch = text.match(/\*(.*?)\*/s);
        return (starMatch ? starMatch[1] : text).trim();
    };

    const findAdjuster = () => {
        const idxAuth = lines.findIndex(l => /Autorizado por/i.test(l));
        if (idxAuth === -1) return '';

        for (let i = idxAuth - 1; i >= 0 && i >= idxAuth - 5; i--) {
            const candidate = lines[i].trim();
            if (!candidate) continue;
            if (candidate.endsWith(':')) continue;
            if (/\d{2}\/\d{2}\/\d{4}/.test(candidate)) continue;
            if (/\d{1,2}:\d{2}/.test(candidate)) continue;
            if (/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(candidate)) {
                return candidate;
            }
        }
        return '';
    };

    const findClaimNumber = () => {
        // 1) Valor en la misma línea (ej: "Nº Siniestro: 125146848-1")
        for (const line of lines) {
            const inline = line.match(/N[º°]?\s*Siniestro:\s*([A-Za-z0-9\-_.\/]+)/i);
            if (inline && inline[1]) {
                return inline[1].trim();
            }
        }

        // 2) Etiqueta sola, valor en líneas siguientes
        const idx = lines.findIndex(l => /N[º°]?\s*Siniestro:?/i.test(l));
        if (idx === -1) return '';

        for (let i = idx + 1; i < lines.length; i++) {
            const candidate = lines[i].trim();
            if (!candidate) continue;
            if (candidate.endsWith(':')) continue;
            return candidate;
        }

        // 3) Fallback: buscar un patrón de siniestro en cualquier línea (ej: 125146848-1)
        for (const line of lines) {
            const match = line.match(/(\d{6,}-\d+)/);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
        return '';
    };

    const findWorkshopName = () => {
        const idx = lines.findIndex(l => /Ciudad del taller/i.test(l) && /Taller:/i.test(l));
        if (idx !== -1 && idx + 1 < lines.length) {
            const nextLine = lines[idx + 1].trim();
            const parts = nextLine.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);
            if (parts.length) return parts[parts.length - 1];
        }

        const idxTaller = lines.findIndex(l => /Taller:/i.test(l));
        if (idxTaller !== -1) {
            const after = lines[idxTaller].split(/Taller:/i)[1];
            if (after && after.trim()) return after.trim();
        }
        return '';
    };

    const findAdjusterName = () => {
        const idxAuth = lines.findIndex(l => /Autorizado por/i.test(l));
        if (idxAuth === -1) return '';

        for (let i = idxAuth - 1; i >= 0 && i >= idxAuth - 6; i--) {
            const candidate = lines[i].trim();
            if (!candidate) continue;
            if (candidate.endsWith(':')) continue;
            if (/\d{2}\/\d{2}\/\d{4}/.test(candidate)) continue;
            if (/\d{1,2}:\d{2}/i.test(candidate)) continue;
            if (/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(candidate)) {
                return candidate;
            }
        }
        return '';
    };

    let plate =
        findPlate() ||
        getValueAfterLabel(/^Placa\s+Asegurado:/i, 3) ||
        getValueAfterLabel(/^Placa\s+Tercero:/i, 3);
    if (plate) {
        plate = plate.replace(/\s+/g, '').toUpperCase();
    }

    const brand = getValueAfterLabel(/^Marca:/i, 3);
    const model = getValueAfterLabel(/^L[ií]nea:/i, 3);
    const year = getValueAfterLabel(/^Año:/i, 3);
    const claimNumber = findClaimNumber() || getValueAfterLabel(/^N[º°]\s*Siniestro:/i, 3);

    const workshopName = findWorkshopName() || findWorkshop() || getValueAfterLabel(/Taller:/i, 2);
    const workshopCity = findWorkshopCity() || '';
    const adjusterName = findAdjusterName() || findAdjuster() || getValueAfterLabel(/Autorizado por/i, 3);
    const factsText = findSectionText(/Versi[oó]n de los hechos/i, [/Operaciones de control/i]);
    const controlText = findSectionText(/Operaciones de control/i, [/Versi[oó]n de los hechos/i]);

    const parsed = {
        claimNumber: claimNumber || '',
        brand: brand || '',
        model: model || '',
        year: year || '',
        plate: plate || '',
        workshopName: workshopName || '',
        workshopCity: workshopCity || '',
        adjusterName: adjusterName || '',
        pdfMapping: {
            facts: factsText,
            control: controlText
        }
    };

    // Nuevos campos opcionales desde PDF (sin sobreescribir si ya existen)
    const tipoVehiculo =
        pickAfterLabel(pdfText, ['Tipo de vehículo', 'Tipo vehículo', 'Tipo Vehiculo', 'Tipo']) ||
        pickLineValue(pdfText, ['Tipo de vehículo', 'Tipo vehículo', 'Tipo Vehiculo', 'Tipo']);
    if (tipoVehiculo && !parsed.tipoVehiculo) parsed.tipoVehiculo = tipoVehiculo;

    const cobertura =
        pickAfterLabel(pdfText, ['Cobertura', 'Coberturas']) ||
        pickLineValue(pdfText, ['Cobertura', 'Coberturas']);
    if (cobertura && !parsed.cobertura) parsed.cobertura = cobertura;

    const vinRaw =
        pickAfterLabel(pdfText, ['VIN', 'N° VIN', 'Nº VIN', 'No VIN', 'Número VIN', 'Numero VIN', 'Chasis', 'N° Chasis', 'Nº Chasis']) ||
        pickLineValue(pdfText, ['VIN', 'N° VIN', 'Nº VIN', 'No VIN', 'Número VIN', 'Numero VIN', 'Chasis', 'N° Chasis', 'Nº Chasis']);
    const vin = vinRaw ? findVIN(vinRaw) : '';
    if (vin && !parsed.vin) parsed.vin = vin;

    const valoradoPor =
        pickAfterLabel(pdfText, ['Valorado por', 'Valorado Por', 'Peritado por', 'Peritado Por', 'Tasado por', 'Tasado Por']) ||
        pickLineValue(pdfText, ['Valorado por', 'Valorado Por', 'Peritado por', 'Peritado Por', 'Tasado por', 'Tasado Por']);
    if (valoradoPor && !parsed.valoradoPor) parsed.valoradoPor = valoradoPor;

    const tipoPintura =
        pickAfterLabel(pdfText, ['Tipo de pintura', 'Tipo Pintura', 'Pintura']) ||
        pickLineValue(pdfText, ['Tipo de pintura', 'Tipo Pintura', 'Pintura']);
    if (tipoPintura && !parsed.tipoPintura) parsed.tipoPintura = tipoPintura;

    const numeroAviso =
        pickAfterLabel(pdfText, ['Nº Aviso', 'N° Aviso', 'No. Aviso', 'Número Aviso', 'Numero Aviso', 'Aviso']) ||
        pickLineValue(pdfText, ['Nº Aviso', 'N° Aviso', 'No. Aviso', 'Número Aviso', 'Numero Aviso', 'Aviso']);
    if (numeroAviso && !parsed.numeroAviso) parsed.numeroAviso = numeroAviso;

    const deducibleRaw =
        pickAfterLabel(pdfText, ['Valor deducible', 'Deducible']) ||
        pickLineValue(pdfText, ['Valor deducible', 'Deducible']);
    if (deducibleRaw && !parsed.deducible) {
        const money = parseMoneyCLP(deducibleRaw);
        const isPercent = /%/.test(deducibleRaw);
        parsed.deducible = isPercent ? deducibleRaw.trim() : (money ?? deducibleRaw.trim());
    }

    const perdidaRaw =
        pickAfterLabel(pdfText, ['Pérdida total', 'Perdida total', 'Pérdida', 'Perdida']) ||
        pickLineValue(pdfText, ['Pérdida total', 'Perdida total', 'Pérdida', 'Perdida']);
    if (perdidaRaw && !parsed.perdida) {
        const perc = perdidaRaw.match(/(\d+(?:[.,]\d+)?)\s*%/);
        parsed.perdida = perc ? `${perc[1].replace(',', '.')}%` : perdidaRaw.trim();
    }

    const materialesRaw =
        pickAfterLabel(pdfText, ['Materiales']) ||
        pickLineValue(pdfText, ['Materiales']);
    if (materialesRaw && !parsed.materiales) {
        const money = parseMoneyCLP(materialesRaw);
        parsed.materiales = money ?? materialesRaw.trim();
    }

    const totalPinturaRaw =
        pickAfterLabel(pdfText, ['Total Pintura', 'Total de Pintura']) ||
        pickLineValue(pdfText, ['Total Pintura', 'Total de Pintura']);
    if (totalPinturaRaw && !parsed.totalPintura) {
        const money = parseMoneyCLP(totalPinturaRaw);
        parsed.totalPintura = money ?? totalPinturaRaw.trim();
    }

    const totalRaw = pickTotalWithContext(pdfText);
    if (totalRaw && !parsed.total) {
        const money = parseMoneyCLP(totalRaw);
        parsed.total = money ?? totalRaw.trim();
    }

    const paintBlock = extractPaintMaterialsAndTotal(pdfText);
    if (paintBlock) {
        if (paintBlock.materiales && !parsed.materiales) parsed.materiales = paintBlock.materiales;
        if (paintBlock.totalPintura && !parsed.totalPintura) parsed.totalPintura = paintBlock.totalPintura;
    }

    const dedLoss = extractDeductibleAndLoss(pdfText);
    if (dedLoss) {
        if (dedLoss.deducible && !parsed.deducible) parsed.deducible = dedLoss.deducible;
        if (dedLoss.perdidaPct && !parsed.perdida) parsed.perdida = dedLoss.perdidaPct;
    }

    console.log('DEBUG metadata:', {
        claimNumber: parsed.claimNumber,
        workshopName: parsed.workshopName,
        adjusterName: parsed.adjusterName
    });

    return parsed;

    function extractPaintMaterialsAndTotal(text) {
        const t = String(text || '');
        const re = /\(\s*Materiales\s+Total\s*[\r\n]+["“]?\s*(\$?\s*[\d\.\,]+)\s*["”]?\s+["“]?\s*(\$?\s*[\d\.\,]+)\s*["”]?\s*\)/i;
        const m = t.match(re);
        if (!m) return null;
        return {
            materiales: cleanQuotedVal(m[1]),
            totalPintura: cleanQuotedVal(m[2])
        };
    }

    function extractDeductibleAndLoss(text) {
        const t = String(text || '');
        const start = t.search(/Valor\s+deducible/i);
        if (start < 0) return null;
        const slice = t.slice(start, start + 800);
        const moneyRe = /Perdida\s*["“]?\s*(\$?\s*[\d\.\,]+)\s*["”]?/i;
        const pctRe = /["“]?\s*(\d+(?:[.,]\d+)?)\s*%/i;

        const mMoney = slice.match(moneyRe);
        const mPct = slice.match(pctRe);

        return {
            deducible: mMoney ? cleanQuotedVal(mMoney[1]) : '',
            perdidaPct: mPct ? `${cleanQuotedVal(mPct[1])} %` : ''
        };
    }
}
// Extract full text from a PDF using pdf.js, preserving some structure
async function extractFullTextFromPdf(arrayBuffer) {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();

        let lastY = null;
        let currentLine = '';
        const lines = [];

        content.items.forEach((item) => {
            const text = item.str || '';
            const transform = item.transform;
            const y = transform ? transform[5] : null;

            if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) {
                if (currentLine.trim()) lines.push(currentLine.trim());
                currentLine = text;
            } else {
                currentLine += (currentLine ? ' ' : '') + text;
            }

            lastY = y;
        });

        if (currentLine.trim()) lines.push(currentLine.trim());

        fullText += `\n\n----- PAGE ${pageNum} -----\n` + lines.join('\n');
    }

    return fullText;
}
