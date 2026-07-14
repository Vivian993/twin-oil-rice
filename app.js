import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Home, Calendar as CalendarIcon, BarChart3, Plus, X, Edit2, Trash2,
  Printer, Download, ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  Search, AlertTriangle, Check, Loader2, FileText
} from 'lucide-react';

/* ===================== 常數與工具 ===================== */

const STORAGE_KEY = 'twin-oil-rice-records';
const PRESETS_KEY = 'twin-oil-rice-presets';

const DEFAULT_PURCHASE_NAMES = ['大竹進貨', '肉絲', '大骨', '爌肉底', '瓦斯', '麵類', '魚丸赤肉羹', '滷蛋', '白蛋', '豆芽', '糯米', '櫻花蝦', '辛香料'];
const DEFAULT_PRODUCT_NAMES = ['麵', '米粉', '辣椒醬'];
const DEFAULT_PRODUCT_UNITS = { '麵': '份', '米粉': '份', '辣椒醬': '瓶' };

const COLUMN_DEFS = [
  { key: 'revenue', label: '今日營業額' },
  { key: 'uberEats', label: 'Uber Eats' },
  { key: 'linePay', label: 'Line Pay' },
  { key: 'salesQty', label: '銷售數量' },
  { key: 'purchaseCost', label: '本日進貨' },
  { key: 'cash', label: '實際現金' },
  { key: 'totalRevenue', label: '今日總收入' },
  { key: 'netIncome', label: '今日淨收入' },
  { key: 'note', label: '備註' },
];

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function pad2(n) { return String(n).padStart(2, '0'); }
function toDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function todayStr() { return toDateStr(new Date()); }
function fmtMoney(n) { const num = Number(n) || 0; return num.toLocaleString('en-US'); }
function monthLabel(y, m) { return `${y} 年 ${m + 1} 月`; }
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function uid() { return `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

function sumItems(obj) {
  if (!obj) return 0;
  return Object.values(obj).reduce((s, v) => s + (Number(v) || 0), 0);
}
function getPurchaseCost(r) { return sumItems(r.purchaseItems); }
function getSalesQty(r) { return sumItems(r.salesItems); }
function hasAnySales(r) { return Object.values(r.salesItems || {}).some(v => Number(v) > 0); }
function calcTotalRevenue(r) { return (Number(r.cash) || 0) + (Number(r.linePay) || 0) + (Number(r.uberEats) || 0); }
function calcNetIncome(r) { return calcTotalRevenue(r) - getPurchaseCost(r); }

function cellValue(r, key) {
  switch (key) {
    case 'date': return r.date;
    case 'note': return r.note || '';
    case 'totalRevenue': return fmtMoney(calcTotalRevenue(r));
    case 'netIncome': return fmtMoney(calcNetIncome(r));
    case 'revenue': return fmtMoney(calcTotalRevenue(r));
    case 'purchaseCost': return fmtMoney(getPurchaseCost(r));
    case 'salesQty': return fmtMoney(getSalesQty(r));
    default: return fmtMoney(r[key]);
  }
}

/* ===================== 音效 ===================== */

let audioCtx;
function playTone(freq = 600, duration = 0.09, type = 'sine') {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.09, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) { /* 靜音環境忽略 */ }
}
const sound = {
  tap: () => playTone(660, 0.05, 'sine'),
  add: () => playTone(740, 0.09, 'sine'),
  save: () => { playTone(660, 0.06, 'sine'); setTimeout(() => playTone(880, 0.08, 'sine'), 70); },
  delete: () => playTone(260, 0.14, 'triangle'),
  step: () => playTone(520, 0.04, 'square'),
};

/* ===================== 主程式 ===================== */

export default function App() {
  const [records, setRecords] = useState([]);
  const [presets, setPresets] = useState({ purchaseNames: DEFAULT_PURCHASE_NAMES, productNames: DEFAULT_PRODUCT_NAMES, productUnits: DEFAULT_PRODUCT_UNITS });
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState('home');
  const [calCursor, setCalCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [reportCursor, setReportCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selectedDay, setSelectedDay] = useState(null);
  const [formState, setFormState] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, true);
        if (mounted && res && res.value) setRecords(JSON.parse(res.value));
      } catch (e) { /* 尚無資料 */ }
      try {
        const res2 = await window.storage.get(PRESETS_KEY, true);
        if (mounted && res2 && res2.value) {
          const p = JSON.parse(res2.value);
          setPresets(prev => ({ ...prev, ...p }));
        }
      } catch (e) { /* 尚無自訂品項，使用預設值 */ }
      if (mounted) setLoaded(true);
    })();
    return () => { mounted = false; };
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }, []);

  const persist = useCallback(async (next) => {
    setSaving(true);
    try {
      const res = await window.storage.set(STORAGE_KEY, JSON.stringify(next), true);
      if (!res) throw new Error('儲存失敗');
      setLoadError(false);
    } catch (e) {
      setLoadError(true);
      showToast('儲存失敗，請檢查裝置儲存空間後再試一次');
    } finally {
      setSaving(false);
    }
  }, [showToast]);

  const persistPresets = useCallback(async (next) => {
    try { await window.storage.set(PRESETS_KEY, JSON.stringify(next), true); } catch (e) { /* 忽略，不影響本次記帳 */ }
  }, []);

  const addPurchasePreset = useCallback((name) => {
    setPresets(prev => {
      if (prev.purchaseNames.includes(name)) return prev;
      const next = { ...prev, purchaseNames: [...prev.purchaseNames, name] };
      persistPresets(next);
      return next;
    });
  }, [persistPresets]);

  const addProductPreset = useCallback((name, unit) => {
    setPresets(prev => {
      if (prev.productNames.includes(name)) return prev;
      const next = { ...prev, productNames: [...prev.productNames, name], productUnits: { ...prev.productUnits, [name]: unit || '份' } };
      persistPresets(next);
      return next;
    });
  }, [persistPresets]);

  const upsertRecord = useCallback((data) => {
    setRecords(prev => {
      const exists = prev.some(r => r.id === data.id);
      const next = exists ? prev.map(r => (r.id === data.id ? data : r)) : [...prev, data];
      persist(next);
      return next;
    });
  }, [persist]);

  const deleteRecord = useCallback((id) => {
    setRecords(prev => {
      const next = prev.filter(r => r.id !== id);
      persist(next);
      return next;
    });
  }, [persist]);

  const byDate = useMemo(() => {
    const map = {};
    for (const r of records) {
      if (!map[r.date]) map[r.date] = [];
      map[r.date].push(r);
    }
    Object.values(map).forEach(arr => arr.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
    return map;
  }, [records]);

  const todayRecords = byDate[todayStr()] || [];
  const todaySummary = useMemo(() => {
    const cash = todayRecords.reduce((s, r) => s + (Number(r.cash) || 0), 0);
    const purchaseCost = todayRecords.reduce((s, r) => s + getPurchaseCost(r), 0);
    const totalRevenue = todayRecords.reduce((s, r) => s + calcTotalRevenue(r), 0);
    return { revenue: totalRevenue, cash, purchaseCost, totalRevenue, netIncome: totalRevenue - purchaseCost, count: todayRecords.length };
  }, [todayRecords]);

  function openAdd(dateHint) {
    sound.tap();
    setFormState({ mode: 'add', dateHint: dateHint || todayStr() });
  }
  function openEdit(record) {
    sound.tap();
    setFormState({ mode: 'edit', data: record });
  }

  return (
    <div style={{ background: 'var(--cream)', minHeight: '100vh' }} className="app-root">
      <GlobalStyle />
      <div className="app-ui">
        <Header saving={saving} loadError={loadError} onGoCalendar={() => { sound.tap(); setView('calendar'); }} onGoReport={() => { sound.tap(); setView('report'); }} />

        <main style={{ maxWidth: 720, margin: '0 auto', padding: '0 16px 96px' }}>
          {!loaded ? (
            <LoadingState />
          ) : view === 'home' ? (
            <HomeView summary={todaySummary} onAdd={() => openAdd(todayStr())} onGoCalendar={() => setView('calendar')} />
          ) : view === 'calendar' ? (
            <CalendarView
              cursor={calCursor} setCursor={setCalCursor}
              byDate={byDate}
              selectedDay={selectedDay} setSelectedDay={setSelectedDay}
              onAdd={openAdd} onEdit={openEdit}
              onDelete={(r) => setDeleteTarget(r)}
            />
          ) : (
            <ReportView
              cursor={reportCursor} setCursor={setReportCursor}
              records={records} byDate={byDate}
              keyword={keyword} setKeyword={setKeyword}
              onPrint={() => setPrintOpen(true)}
              onEdit={openEdit}
              onDelete={(r) => setDeleteTarget(r)}
            />
          )}
        </main>

        <BottomNav view={view} setView={(v) => { sound.tap(); setView(v); }} />
      </div>

      {formState && (
        <EntryFormModal
          state={formState}
          presets={presets}
          onAddPurchasePreset={addPurchasePreset}
          onAddProductPreset={addProductPreset}
          onClose={() => setFormState(null)}
          onSave={(data) => { upsertRecord(data); sound.save(); setFormState(null); showToast(formState.mode === 'add' ? '已新增一筆記帳' : '已儲存修改'); }}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          record={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => { sound.delete(); deleteRecord(deleteTarget.id); setDeleteTarget(null); showToast('已刪除該筆資料'); }}
        />
      )}

      {printOpen && (
        <PrintModal records={records} defaultCursor={reportCursor} onClose={() => setPrintOpen(false)} />
      )}

      {toast && <Toast msg={toast} />}
    </div>
  );
}

/* ===================== 版面元件 ===================== */

function Header({ saving, loadError, onGoCalendar, onGoReport }) {
  const now = new Date();
  const dateStr = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日 · 週${WEEKDAYS[now.getDay()]}`;
  return (
    <header className="app-header">
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '18px 20px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="brand-badge">☕</div>
            <div>
              <div className="brand-eyebrow">TWIN OIL RICE</div>
              <h1 className="brand-title">雙子油飯</h1>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="icon-btn" onClick={onGoCalendar} title="月曆"><CalendarIcon size={17} /></button>
            <button className="icon-btn" onClick={onGoReport} title="報表"><FileText size={17} /></button>
          </div>
        </div>
        <div className="date-line">
          {dateStr}
          <span className="save-indicator">{saving ? (<><Loader2 size={12} className="spin" /> 儲存中</>) : loadError ? '離線' : '已同步'}</span>
        </div>
      </div>
    </header>
  );
}

function BottomNav({ view, setView }) {
  const items = [
    { key: 'home', label: '首頁', icon: Home },
    { key: 'calendar', label: '月曆', icon: CalendarIcon },
    { key: 'report', label: '報表', icon: BarChart3 },
  ];
  return (
    <nav className="bottom-nav">
      {items.map(it => {
        const Icon = it.icon;
        const active = view === it.key;
        return (
          <button key={it.key} className={`nav-btn ${active ? 'nav-btn-active' : ''}`} onClick={() => setView(it.key)}>
            <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
            <span>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function LoadingState() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 0', color: 'var(--ink-soft)' }}>
      <Loader2 size={22} className="spin" />
      <div style={{ marginTop: 10, fontSize: 14 }}>資料讀取中…</div>
    </div>
  );
}

function Toast({ msg }) { return <div className="toast">{msg}</div>; }

/* ===================== 首頁 ===================== */

function HomeView({ summary, onAdd, onGoCalendar }) {
  return (
    <div>
      <section className="summary-card">
        <div className="summary-tape" />
        <div className="summary-title">今日營業摘要</div>
        <div className="summary-grid">
          <SummaryStat label="今日營業額" value={summary.revenue} />
          <SummaryStat label="今日實際現金" value={summary.cash} />
          <SummaryStat label="今日進貨成本" value={summary.purchaseCost} />
          <SummaryStat label="今日淨收入" value={summary.netIncome} highlight />
        </div>
        <div className="summary-foot">
          {summary.count === 0 ? '今天還沒有記帳紀錄' : `今天已記錄 ${summary.count} 筆`}
        </div>
      </section>

      <button className="btn-primary btn-big" onClick={onAdd}><Plus size={18} /> 新增今日記帳</button>
      <button className="btn-ghost btn-big" onClick={onGoCalendar} style={{ marginTop: 10 }}><CalendarIcon size={16} /> 查看月曆</button>
    </div>
  );
}

function SummaryStat({ label, value, highlight }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${highlight ? 'stat-value-accent' : ''}`}>NT$ {fmtMoney(value)}</div>
    </div>
  );
}

/* ===================== 月曆檢視 ===================== */

function CalendarView({ cursor, setCursor, byDate, selectedDay, setSelectedDay, onAdd, onEdit, onDelete }) {
  const { y, m } = cursor;
  const first = new Date(y, m, 1);
  const startWeekday = first.getDay();
  const total = daysInMonth(y, m);
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(d);

  function shift(delta) {
    sound.tap();
    let nm = m + delta, ny = y;
    if (nm < 0) { nm = 11; ny -= 1; }
    if (nm > 11) { nm = 0; ny += 1; }
    setCursor({ y: ny, m: nm });
  }

  const dayList = selectedDay ? (byDate[selectedDay] || []) : [];

  return (
    <div>
      <div className="cal-nav">
        <button className="icon-btn" onClick={() => shift(-1)}><ChevronLeft size={18} /></button>
        <div className="cal-title">{monthLabel(y, m)}</div>
        <button className="icon-btn" onClick={() => shift(1)}><ChevronRight size={18} /></button>
      </div>

      <div className="cal-weekdays">{WEEKDAYS.map(w => <div key={w} className="cal-weekday">{w}</div>)}</div>

      <div className="cal-grid">
        {cells.map((d, idx) => {
          if (d === null) return <div key={idx} className="cal-cell cal-cell-empty" />;
          const dateStr = `${y}-${pad2(m + 1)}-${pad2(d)}`;
          const entries = byDate[dateStr] || [];
          const isToday = dateStr === todayStr();
          return (
            <button key={idx} className={`cal-cell ${isToday ? 'cal-cell-today' : ''} ${entries.length ? 'cal-cell-has' : ''}`} onClick={() => { sound.tap(); setSelectedDay(dateStr); }}>
              <span className="cal-daynum">{d}</span>
              {entries.length > 0 && (<><span className="cal-dot" /><span className="cal-mini">{entries.length} 筆</span></>)}
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <DayPanel date={selectedDay} entries={dayList} onClose={() => setSelectedDay(null)} onAdd={() => onAdd(selectedDay)} onEdit={onEdit} onDelete={onDelete} />
      )}
    </div>
  );
}

function DayPanel({ date, entries, onClose, onAdd, onEdit, onDelete }) {
  const [y, m, d] = date.split('-').map(Number);
  const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  const totalNet = entries.reduce((s, r) => s + calcNetIncome(r), 0);

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet-panel" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div>
            <div className="sheet-title">{`${y} 年 ${m} 月 ${d} 日`}</div>
            <div className="sheet-sub">週{wd} · 共 {entries.length} 筆 · 淨收入 NT$ {fmtMoney(totalNet)}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="sheet-body">
          {entries.length === 0 ? (
            <div className="empty-hint">這天還沒有記帳紀錄，點下方新增一筆吧。</div>
          ) : entries.map(r => <EntryCard key={r.id} record={r} onEdit={() => onEdit(r)} onDelete={() => onDelete(r)} />)}
        </div>

        <button className="btn-primary btn-big" onClick={onAdd} style={{ margin: '4px 16px 18px' }}><Plus size={18} /> 新增這天的記帳</button>
      </div>
    </div>
  );
}

function EntryCard({ record: r, onEdit, onDelete }) {
  const total = calcTotalRevenue(r);
  const net = calcNetIncome(r);
  return (
    <div className="entry-card">
      <div className="entry-card-tape" />
      <div className="entry-row entry-row-top">
        <div className="entry-net">
          <span className="entry-net-label">淨收入</span>
          <span className={`entry-net-value ${net < 0 ? 'neg' : ''}`}>NT$ {fmtMoney(net)}</span>
        </div>
        <div className="entry-actions">
          <button className="icon-btn" onClick={onEdit}><Edit2 size={15} /></button>
          <button className="icon-btn icon-btn-danger" onClick={onDelete}><Trash2 size={15} /></button>
        </div>
      </div>
      <div className="entry-grid">
        <EntryMini label="Uber Eats" value={r.uberEats} />
        <EntryMini label="Line Pay" value={r.linePay} />
        <EntryMini label="現金" value={r.cash} />
        <EntryMini label="進貨成本" value={getPurchaseCost(r)} />
        <EntryMini label="總收入" value={total} />
        {hasAnySales(r) ? (
          Object.entries(r.salesItems || {})
            .filter(([, v]) => Number(v) > 0)
            .map(([name, v]) => <EntryMini key={name} label={name} value={v} />)
        ) : (
          <EntryMini label="銷售份數" value={0} />
        )}
      </div>
      {r.note && <div className="entry-note">備註：{r.note}</div>}
    </div>
  );
}

function EntryMini({ label, value }) {
  return (
    <div className="entry-mini">
      <div className="entry-mini-label">{label}</div>
      <div className="entry-mini-value">{fmtMoney(value)}</div>
    </div>
  );
}

/* ===================== 報表 ===================== */

function ReportView({ cursor, setCursor, records, byDate, keyword, setKeyword, onPrint, onEdit, onDelete }) {
  const { y, m } = cursor;

  function shift(delta) {
    sound.tap();
    let nm = m + delta, ny = y;
    if (nm < 0) { nm = 11; ny -= 1; }
    if (nm > 11) { nm = 0; ny += 1; }
    setCursor({ y: ny, m: nm });
  }

  const monthRecords = useMemo(() => {
    const prefix = `${y}-${pad2(m + 1)}`;
    return records.filter(r => r.date.startsWith(prefix));
  }, [records, y, m]);

  const filtered = useMemo(() => {
    if (!keyword.trim()) return monthRecords;
    const k = keyword.trim().toLowerCase();
    return monthRecords.filter(r => (r.note || '').toLowerCase().includes(k) || r.date.includes(k));
  }, [monthRecords, keyword]);

  const stats = useMemo(() => {
    const uberEats = monthRecords.reduce((s, r) => s + (Number(r.uberEats) || 0), 0);
    const linePay = monthRecords.reduce((s, r) => s + (Number(r.linePay) || 0), 0);
    const purchaseCost = monthRecords.reduce((s, r) => s + getPurchaseCost(r), 0);
    const totalRevenue = monthRecords.reduce((s, r) => s + calcTotalRevenue(r), 0);
    return { revenue: totalRevenue, uberEats, linePay, purchaseCost, totalRevenue, netIncome: totalRevenue - purchaseCost };
  }, [monthRecords]);

  const dailyRows = useMemo(() => {
    const map = {};
    for (const r of monthRecords) { if (!map[r.date]) map[r.date] = []; map[r.date].push(r); }
    return Object.keys(map).sort().map(date => {
      const list = map[date];
      const purchaseCost = list.reduce((s, r) => s + getPurchaseCost(r), 0);
      const totalRevenue = list.reduce((s, r) => s + calcTotalRevenue(r), 0);
      const netIncome = totalRevenue - purchaseCost;
      return { date, count: list.length, purchaseCost, totalRevenue, netIncome };
    });
  }, [monthRecords]);

  const maxAbsNet = Math.max(1, ...dailyRows.map(d => Math.abs(d.netIncome)));

  function exportCSV() {
    sound.tap();
    const headers = ['日期', '今日營業額', 'Uber Eats', 'Line Pay', '銷售數量', '本日進貨', '實際現金', '今日總收入', '今日淨收入', '備註'];
    const lines = [headers.join(',')];
    monthRecords.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(r => {
      const row = [
        r.date, calcTotalRevenue(r), r.uberEats || 0, r.linePay || 0, getSalesQty(r),
        getPurchaseCost(r), r.cash || 0, calcTotalRevenue(r), calcNetIncome(r),
        `"${(r.note || '').replace(/"/g, '""')}"`
      ];
      lines.push(row.join(','));
    });
    const csv = '\uFEFF' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `雙子油飯記帳_${y}-${pad2(m + 1)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="cal-nav">
        <button className="icon-btn" onClick={() => shift(-1)}><ChevronLeft size={18} /></button>
        <div className="cal-title">{monthLabel(y, m)} 報表</div>
        <button className="icon-btn" onClick={() => shift(1)}><ChevronRight size={18} /></button>
      </div>

      <div className="report-stats">
        <SummaryStat label="月營業額" value={stats.revenue} />
        <SummaryStat label="月 Uber Eats" value={stats.uberEats} />
        <SummaryStat label="月 Line Pay" value={stats.linePay} />
        <SummaryStat label="月進貨成本" value={stats.purchaseCost} />
        <SummaryStat label="月總收入" value={stats.totalRevenue} />
        <SummaryStat label="月淨利" value={stats.netIncome} highlight />
      </div>

      {dailyRows.length > 0 && (
        <div className="chart-card">
          <div className="chart-title">每日淨收入</div>
          <div className="chart-bars">
            {dailyRows.map(d => {
              const h = Math.max(4, Math.round((Math.abs(d.netIncome) / maxAbsNet) * 64));
              return (
                <div key={d.date} className="chart-col" title={`${d.date}：NT$ ${fmtMoney(d.netIncome)}`}>
                  <div className={`chart-bar ${d.netIncome < 0 ? 'chart-bar-neg' : ''}`} style={{ height: `${h}px` }} />
                  <div className="chart-day">{Number(d.date.slice(-2))}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="search-row">
        <Search size={15} style={{ color: 'var(--ink-soft)' }} />
        <input className="search-input" placeholder="搜尋備註或日期關鍵字" value={keyword} onChange={e => setKeyword(e.target.value)} />
      </div>

      <div className="action-row">
        <button className="btn-secondary" onClick={exportCSV}><Download size={15} /> 匯出備份 CSV</button>
        <button className="btn-secondary" onClick={onPrint}><Printer size={15} /> 列印明細</button>
      </div>

      <div className="report-list">
        {filtered.length === 0 ? (
          <div className="empty-hint">這個月沒有符合的記帳紀錄</div>
        ) : filtered.slice().sort((a, b) => b.date.localeCompare(a.date)).map(r => (
          <EntryCard key={r.id} record={r} onEdit={() => onEdit(r)} onDelete={() => onDelete(r)} />
        ))}
      </div>
    </div>
  );
}

/* ===================== 新增／編輯表單 ===================== */

const REQUIRED_KEYS = ['uberEats', 'linePay', 'cash'];

function zeroFilled(names) { return Object.fromEntries(names.map(n => [n, 0])); }

function EntryFormModal({ state, presets, onAddPurchasePreset, onAddProductPreset, onClose, onSave }) {
  const initial = state.mode === 'edit'
    ? {
        ...state.data,
        purchaseItems: { ...zeroFilled(presets.purchaseNames), ...(state.data.purchaseItems || {}) },
        salesItems: { ...zeroFilled(presets.productNames), ...(state.data.salesItems || {}) },
      }
    : {
        id: uid(), date: state.dateHint, uberEats: '', linePay: '', cash: '', note: '', createdAt: Date.now(),
        purchaseItems: zeroFilled(presets.purchaseNames),
        salesItems: zeroFilled(presets.productNames),
      };
  const [form, setForm] = useState(initial);
  const [confirmMissing, setConfirmMissing] = useState(false);

  const total = calcTotalRevenue(form);
  const purchaseCost = sumItems(form.purchaseItems);
  const salesQty = sumItems(form.salesItems);
  const net = total - purchaseCost;

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }
  function setPurchaseItem(name, val) { setForm(f => ({ ...f, purchaseItems: { ...f.purchaseItems, [name]: val } })); }
  function setSalesItem(name, val) { setForm(f => ({ ...f, salesItems: { ...f.salesItems, [name]: val } })); }

  function handleAddPurchaseItem() {
    const name = window.prompt('新增進貨項目名稱：');
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    onAddPurchasePreset(trimmed);
    setForm(f => ({ ...f, purchaseItems: { ...f.purchaseItems, [trimmed]: f.purchaseItems[trimmed] ?? 0 } }));
  }

  function handleAddProductItem() {
    const name = window.prompt('新增商品名稱：');
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    const unit = window.prompt('這個商品的單位是？（例如：份、瓶、杯）', '份') || '份';
    onAddProductPreset(trimmed, unit);
    setForm(f => ({ ...f, salesItems: { ...f.salesItems, [trimmed]: f.salesItems[trimmed] ?? 0 } }));
  }

  function missingFields() {
    return REQUIRED_KEYS.filter(k => form[k] === '' || form[k] === null || form[k] === undefined);
  }

  function handleSaveClick() {
    const missing = missingFields();
    if (missing.length > 0 && !confirmMissing) { setConfirmMissing(true); return; }
    const cleaned = { ...form };
    REQUIRED_KEYS.forEach(k => { if (cleaned[k] === '') cleaned[k] = 0; });
    onSave(cleaned);
  }

  const productUnits = { ...DEFAULT_PRODUCT_UNITS, ...(presets.productUnits || {}) };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{state.mode === 'add' ? '新增記帳' : '編輯記帳'}</div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body">
          <FormField label="日期">
            <input type="date" className="input" value={form.date} onChange={e => set('date', e.target.value)} />
          </FormField>

          <FormField label="今日營業額（由下方收入細項自動加總）">
            <div className="auto-field">$ {fmtMoney(total)}</div>
          </FormField>

          <div className="calc-box">
            <div className="calc-row"><span>今日總收入</span><b>NT$ {fmtMoney(total)}</b></div>
            <div className="calc-row"><span>今日淨收入</span><b className={net < 0 ? 'neg' : ''}>NT$ {fmtMoney(net)}</b></div>
          </div>

          <div className="section-title-row">
            <div className="section-title">商品銷售數量</div>
          </div>
          <div className="stepper-grid">
            {presets.productNames.map(name => (
              <Stepper key={name} label={name} unit={productUnits[name] || '份'} value={form.salesItems[name] ?? 0} onChange={v => setSalesItem(name, v)} />
            ))}
          </div>
          <div className="sum-line"><span>本筆銷售加總</span><b>{salesQty} 份/瓶</b></div>
          <button type="button" className="add-link" onClick={handleAddProductItem}>＋ 新增其他商品</button>

          <div className="section-title-row" style={{ marginTop: 6 }}>
            <div className="section-title">收入細項</div>
          </div>
          <div className="form-grid">
            <FormField label="實際收入現金"><MoneyInput value={form.cash} onChange={v => set('cash', v)} /></FormField>
            <FormField label="Line Pay"><MoneyInput value={form.linePay} onChange={v => set('linePay', v)} /></FormField>
            <FormField label="Uber Eats"><MoneyInput value={form.uberEats} onChange={v => set('uberEats', v)} /></FormField>
          </div>

          <div className="section-title-row" style={{ marginTop: 6 }}>
            <div className="section-title">本日進貨成本細項</div>
            <div className="section-sum">加總：$ {fmtMoney(purchaseCost)}</div>
          </div>
          <div className="form-grid">
            {presets.purchaseNames.map(name => (
              <FormField key={name} label={name}>
                <MoneyInput value={form.purchaseItems[name] ?? 0} onChange={v => setPurchaseItem(name, v)} accentIfNonZero />
              </FormField>
            ))}
          </div>
          <button type="button" className="add-link" onClick={handleAddPurchaseItem}>＋ 新增其他進貨項目</button>

          <FormField label="整體備註">
            <textarea className="input textarea" rows={2} value={form.note} onChange={e => set('note', e.target.value)} placeholder="有什麼特別需要記錄的嗎？" />
          </FormField>

          {confirmMissing && (
            <div className="warn-box">
              <AlertTriangle size={16} />
              <div>
                <div>有欄位還沒有填寫，未填的欄位會以 0 計算，確定要這樣儲存嗎？</div>
                <div className="warn-actions">
                  <button className="btn-secondary btn-sm" onClick={() => setConfirmMissing(false)}>返回填寫</button>
                  <button className="btn-primary btn-sm" onClick={handleSaveClick}>仍要儲存</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {!confirmMissing && (
          <div className="modal-footer">
            <button className="btn-secondary btn-big" onClick={onClose}>取消</button>
            <button className="btn-primary btn-big" onClick={handleSaveClick}><Check size={17} /> 儲存紀錄</button>
          </div>
        )}
      </div>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

function MoneyInput({ value, onChange, accentIfNonZero }) {
  const nonZero = Number(value) > 0;
  return (
    <div className={`money-input ${accentIfNonZero && nonZero ? 'money-input-accent' : ''}`}>
      <span className="money-prefix">$</span>
      <input type="number" inputMode="decimal" value={value} onChange={e => onChange(e.target.value)} placeholder="0" />
    </div>
  );
}

function Stepper({ label, unit, value, onChange }) {
  const v = Number(value) || 0;
  function bump(delta) {
    sound.step();
    onChange(Math.max(0, v + delta));
  }
  return (
    <div className="stepper">
      <div className="stepper-label">{label}</div>
      <div className="stepper-control">
        <span className="stepper-value">{v} <small>{unit}</small></span>
        <div className="stepper-arrows">
          <button type="button" onClick={() => bump(1)}><ChevronUp size={13} /></button>
          <button type="button" onClick={() => bump(-1)}><ChevronDown size={13} /></button>
        </div>
      </div>
    </div>
  );
}

/* ===================== 刪除確認 ===================== */

function ConfirmDeleteModal({ record, onCancel, onConfirm }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-panel modal-panel-sm" onClick={e => e.stopPropagation()}>
        <div className="confirm-icon"><Trash2 size={22} /></div>
        <div className="confirm-title">確定要刪除此筆資料嗎？</div>
        <div className="confirm-sub">{record.date} · 淨收入 NT$ {fmtMoney(calcNetIncome(record))}</div>
        <div className="confirm-sub-2">刪除後將無法復原</div>
        <div className="modal-footer">
          <button className="btn-secondary btn-big" onClick={onCancel}>取消</button>
          <button className="btn-danger btn-big" onClick={onConfirm}><Trash2 size={16} /> 確定刪除</button>
        </div>
      </div>
    </div>
  );
}

/* ===================== 列印 ===================== */

function PrintModal({ records, defaultCursor, onClose }) {
  const [rangeType, setRangeType] = useState('month');
  const [monthY, setMonthY] = useState(defaultCursor.y);
  const [monthM, setMonthM] = useState(defaultCursor.m);
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [cols, setCols] = useState(() => Object.fromEntries(COLUMN_DEFS.map(c => [c.key, true])));

  function toggleCol(key) { setCols(c => ({ ...c, [key]: !c[key] })); }

  const rangeRecords = useMemo(() => {
    let from, to;
    if (rangeType === 'month') {
      from = `${monthY}-${pad2(monthM + 1)}-01`;
      to = `${monthY}-${pad2(monthM + 1)}-${pad2(daysInMonth(monthY, monthM))}`;
    } else { from = startDate; to = endDate; }
    return records.filter(r => r.date >= from && r.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  }, [records, rangeType, monthY, monthM, startDate, endDate]);

  const stats = useMemo(() => {
    const uberEats = rangeRecords.reduce((s, r) => s + (Number(r.uberEats) || 0), 0);
    const linePay = rangeRecords.reduce((s, r) => s + (Number(r.linePay) || 0), 0);
    const purchaseCost = rangeRecords.reduce((s, r) => s + getPurchaseCost(r), 0);
    const totalRevenue = rangeRecords.reduce((s, r) => s + calcTotalRevenue(r), 0);
    return { revenue: totalRevenue, uberEats, linePay, purchaseCost, totalRevenue, netIncome: totalRevenue - purchaseCost };
  }, [rangeRecords]);

  function doPrint() { sound.tap(); setTimeout(() => window.print(), 60); }

  const activeCols = COLUMN_DEFS.filter(c => cols[c.key]);
  const rangeLabel = rangeType === 'month' ? monthLabel(monthY, monthM) : `${startDate} ～ ${endDate}`;

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-panel" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">列印明細</div>
            <button className="icon-btn" onClick={onClose}><X size={18} /></button>
          </div>

          <div className="modal-body">
            <FormField label="範圍">
              <div className="seg">
                <button className={`seg-btn ${rangeType === 'month' ? 'seg-btn-active' : ''}`} onClick={() => setRangeType('month')}>整月</button>
                <button className={`seg-btn ${rangeType === 'custom' ? 'seg-btn-active' : ''}`} onClick={() => setRangeType('custom')}>自訂區間</button>
              </div>
            </FormField>

            {rangeType === 'month' ? (
              <div className="form-grid">
                <FormField label="年"><input className="input" type="number" value={monthY} onChange={e => setMonthY(Number(e.target.value))} /></FormField>
                <FormField label="月">
                  <select className="input" value={monthM} onChange={e => setMonthM(Number(e.target.value))}>
                    {Array.from({ length: 12 }).map((_, i) => <option key={i} value={i}>{i + 1} 月</option>)}
                  </select>
                </FormField>
              </div>
            ) : (
              <div className="form-grid">
                <FormField label="開始日期"><input className="input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></FormField>
                <FormField label="結束日期"><input className="input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></FormField>
              </div>
            )}

            <FormField label={`選擇要列印的欄位（共 ${rangeRecords.length} 筆資料）`}>
              <div className="col-check-grid">
                {COLUMN_DEFS.map(c => (
                  <label key={c.key} className="col-check">
                    <input type="checkbox" checked={!!cols[c.key]} onChange={() => toggleCol(c.key)} />
                    {c.label}
                  </label>
                ))}
              </div>
            </FormField>
          </div>

          <div className="modal-footer">
            <button className="btn-secondary btn-big" onClick={onClose}>取消</button>
            <button className="btn-primary btn-big" onClick={doPrint}><Printer size={16} /> 開始列印</button>
          </div>
        </div>
      </div>

      <div className="print-area">
        <div className="print-title">雙子油飯 每日記帳明細</div>
        <div className="print-range">範圍：{rangeLabel}　｜　共 {rangeRecords.length} 筆</div>

        <table className="print-table">
          <thead><tr>{activeCols.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead>
          <tbody>
            {rangeRecords.map(r => (
              <tr key={r.id}>{activeCols.map(c => <td key={c.key}>{cellValue(r, c.key)}</td>)}</tr>
            ))}
          </tbody>
        </table>

        <div className="print-stats">
          <div className="print-stats-title">統計總覽</div>
          <div className="print-stats-grid">
            <div>月營業額：NT$ {fmtMoney(stats.revenue)}</div>
            <div>Uber Eats：NT$ {fmtMoney(stats.uberEats)}</div>
            <div>Line Pay：NT$ {fmtMoney(stats.linePay)}</div>
            <div>進貨成本：NT$ {fmtMoney(stats.purchaseCost)}</div>
            <div>總收入：NT$ {fmtMoney(stats.totalRevenue)}</div>
            <div><b>淨利：NT$ {fmtMoney(stats.netIncome)}</b></div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ===================== 樣式 ===================== */

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@500;700&family=Noto+Sans+TC:wght@400;500;700&display=swap');

      :root {
        --cream: #F6F1E7;
        --paper: #FFFDF8;
        --tea: #C6A985;
        --wood: #7A5B3E;
        --ink: #4A3728;
        --ink-soft: #93816F;
        --accent: #B4784C;
        --accent-dark: #96613A;
        --danger: #B2543F;
        --success: #7C8F5C;
        --line: #E7DCC9;
      }

      html, body { margin: 0; padding: 0; background: var(--cream); }
      .app-root, .app-root * { box-sizing: border-box; font-family: 'Noto Sans TC', -apple-system, sans-serif; }
      .app-root { color: var(--ink); }
      .spin { animation: spin 1s linear infinite; }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

      .app-header { background: var(--cream); border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 20; }
      .brand-badge { width: 36px; height: 36px; border-radius: 50%; background: var(--tea); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 16px; }
      .brand-eyebrow { font-size: 10px; letter-spacing: 1.5px; color: var(--tea); font-weight: 700; }
      .brand-title { font-family: 'Noto Serif TC', serif; font-size: 21px; font-weight: 700; color: var(--wood); margin: 1px 0 0; }
      .date-line { font-size: 12px; color: var(--ink-soft); margin-top: 10px; display: flex; align-items: center; justify-content: space-between; }
      .save-indicator { font-size: 11px; color: var(--ink-soft); display: flex; align-items: center; gap: 4px; }

      .bottom-nav { position: fixed; bottom: 0; left: 0; right: 0; background: var(--paper); border-top: 1px solid var(--line); display: flex; justify-content: space-around; padding: 8px 0 calc(8px + env(safe-area-inset-bottom)); z-index: 20; }
      .nav-btn { display: flex; flex-direction: column; align-items: center; gap: 3px; background: none; border: none; color: var(--ink-soft); font-size: 11px; padding: 4px 18px; cursor: pointer; }
      .nav-btn-active { color: var(--accent-dark); font-weight: 700; }

      .summary-card { background: var(--paper); border-radius: 22px; padding: 20px 18px 16px; margin-top: 18px; box-shadow: 0 6px 18px rgba(122,91,62,0.08); position: relative; overflow: hidden; border: 1px solid var(--line); }
      .summary-tape { position: absolute; top: 0; left: 24px; width: 64px; height: 14px; background: var(--tea); opacity: 0.55; border-radius: 0 0 4px 4px; }
      .summary-title { font-family: 'Noto Serif TC', serif; font-weight: 700; color: var(--wood); font-size: 15px; margin-bottom: 14px; }
      .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .stat-label { font-size: 12px; color: var(--ink-soft); margin-bottom: 3px; }
      .stat-value { font-size: 17px; font-weight: 700; color: var(--ink); }
      .stat-value-accent { color: var(--accent-dark); }
      .summary-foot { margin-top: 14px; font-size: 12px; color: var(--ink-soft); border-top: 1px dashed var(--line); padding-top: 10px; }

      .btn-primary, .btn-secondary, .btn-ghost, .btn-danger { border: none; border-radius: 14px; font-size: 14.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; }
      .btn-big { width: 100%; padding: 14px; margin-top: 14px; font-size: 15px; }
      .btn-sm { padding: 8px 14px; font-size: 13px; margin-top: 0; }
      .btn-primary { background: var(--accent); color: #fff; }
      .btn-primary:hover { background: var(--accent-dark); }
      .btn-secondary { background: var(--paper); color: var(--ink); border: 1px solid var(--line); }
      .btn-ghost { background: transparent; color: var(--wood); border: 1px dashed var(--tea); }
      .btn-danger { background: var(--danger); color: #fff; }

      .icon-btn { background: var(--paper); border: 1px solid var(--line); border-radius: 10px; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--ink); }
      .icon-btn-danger { color: var(--danger); }

      .cal-nav { display: flex; align-items: center; justify-content: space-between; margin-top: 18px; }
      .cal-title { font-family: 'Noto Serif TC', serif; font-weight: 700; color: var(--wood); font-size: 17px; }
      .cal-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); margin-top: 14px; }
      .cal-weekday { text-align: center; font-size: 11.5px; color: var(--ink-soft); padding-bottom: 6px; }
      .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
      .cal-cell { aspect-ratio: 1; background: var(--paper); border: 1px solid var(--line); border-radius: 13px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; position: relative; }
      .cal-cell-empty { background: transparent; border: none; cursor: default; }
      .cal-cell-today { border-color: var(--accent); box-shadow: 0 0 0 1.5px var(--accent) inset; }
      .cal-cell-has { background: #FBF6EC; }
      .cal-daynum { font-size: 13px; font-weight: 600; }
      .cal-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); margin-top: 3px; }
      .cal-mini { font-size: 9px; color: var(--ink-soft); margin-top: 1px; }

      .sheet-overlay { position: fixed; inset: 0; background: rgba(74,55,40,0.35); z-index: 40; display: flex; align-items: flex-end; }
      .sheet-panel { background: var(--cream); width: 100%; max-height: 82vh; overflow-y: auto; border-radius: 22px 22px 0 0; margin: 0 auto; max-width: 720px; }
      .sheet-handle { width: 40px; height: 4px; background: var(--line); border-radius: 4px; margin: 10px auto 4px; }
      .sheet-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 8px 18px 12px; }
      .sheet-title { font-family: 'Noto Serif TC', serif; font-weight: 700; font-size: 17px; color: var(--wood); }
      .sheet-sub { font-size: 12px; color: var(--ink-soft); margin-top: 3px; }
      .sheet-body { padding: 0 16px; display: flex; flex-direction: column; gap: 10px; }

      .entry-card { background: var(--paper); border: 1px solid var(--line); border-radius: 16px; padding: 14px; position: relative; overflow: hidden; }
      .entry-card-tape { position: absolute; top: 0; right: 20px; width: 40px; height: 10px; background: var(--tea); opacity: 0.5; border-radius: 0 0 3px 3px; }
      .entry-row-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
      .entry-net-label { font-size: 11px; color: var(--ink-soft); display: block; }
      .entry-net-value { font-size: 18px; font-weight: 700; color: var(--success); }
      .entry-net-value.neg { color: var(--danger); }
      .entry-actions { display: flex; gap: 6px; }
      .entry-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
      .entry-mini-label { font-size: 10.5px; color: var(--ink-soft); }
      .entry-mini-value { font-size: 13px; font-weight: 600; }
      .entry-note { margin-top: 10px; font-size: 12px; color: var(--ink-soft); border-top: 1px dashed var(--line); padding-top: 8px; }

      .report-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; background: var(--paper); border: 1px solid var(--line); border-radius: 18px; padding: 16px; }
      .chart-card { background: var(--paper); border: 1px solid var(--line); border-radius: 16px; padding: 14px; margin-top: 14px; }
      .chart-title { font-size: 13px; font-weight: 700; color: var(--wood); margin-bottom: 10px; }
      .chart-bars { display: flex; align-items: flex-end; gap: 3px; height: 74px; overflow-x: auto; }
      .chart-col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; min-width: 8px; height: 100%; }
      .chart-bar { width: 6px; background: var(--accent); border-radius: 3px 3px 0 0; }
      .chart-bar-neg { background: var(--danger); }
      .chart-day { font-size: 8px; color: var(--ink-soft); margin-top: 3px; }

      .search-row { display: flex; align-items: center; gap: 8px; background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 10px 14px; margin-top: 14px; }
      .search-input { border: none; outline: none; background: transparent; font-size: 13.5px; flex: 1; }
      .action-row { display: flex; gap: 10px; margin-top: 12px; }
      .action-row .btn-secondary { flex: 1; padding: 11px; }
      .report-list { margin-top: 16px; display: flex; flex-direction: column; gap: 10px; }

      .empty-hint { text-align: center; color: var(--ink-soft); font-size: 13px; padding: 30px 0; }

      .modal-overlay { position: fixed; inset: 0; background: rgba(74,55,40,0.4); z-index: 50; display: flex; align-items: center; justify-content: center; padding: 16px; }
      .modal-panel { background: var(--cream); border-radius: 22px; width: 100%; max-width: 460px; max-height: 88vh; overflow-y: auto; }
      .modal-panel-sm { max-width: 340px; padding: 26px 22px; text-align: center; }
      .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 18px 18px 6px; }
      .modal-title { font-family: 'Noto Serif TC', serif; font-weight: 700; font-size: 17px; color: var(--wood); }
      .modal-body { padding: 8px 18px; display: flex; flex-direction: column; gap: 12px; }
      .modal-footer { display: flex; gap: 10px; padding: 10px 18px 20px; }
      .modal-footer .btn-primary, .modal-footer .btn-secondary, .modal-footer .btn-danger { flex: 1; }

      .field-label { font-size: 12px; color: var(--ink-soft); display: block; margin-bottom: 5px; }
      .field { display: flex; flex-direction: column; }
      .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .input { width: 100%; border: 1px solid var(--line); background: var(--paper); border-radius: 10px; padding: 10px 12px; font-size: 14px; color: var(--ink); outline: none; }
      .input:focus { border-color: var(--accent); }
      .textarea { resize: none; font-family: inherit; }

      .auto-field { width: 100%; border: 1px solid var(--line); background: #EFE9DC; border-radius: 10px; padding: 12px 14px; font-size: 17px; font-weight: 700; color: var(--wood); }

      .money-input { display: flex; align-items: center; border: 1px solid var(--line); background: var(--paper); border-radius: 10px; padding: 0 12px; }
      .money-input input { border: none; outline: none; background: transparent; padding: 10px 6px; font-size: 14px; width: 100%; color: var(--ink-soft); }
      .money-input-accent input { color: var(--accent); font-weight: 700; }
      .money-prefix { color: var(--ink-soft); font-size: 13px; }

      .calc-box { background: #FBF6EC; border: 1px dashed var(--tea); border-radius: 14px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
      .calc-row { display: flex; justify-content: space-between; font-size: 12.5px; }
      .calc-row b { font-size: 16px; }
      .calc-row b.neg { color: var(--danger); }

      .section-title-row { display: flex; justify-content: space-between; align-items: baseline; margin-top: 4px; padding-top: 10px; border-top: 1px solid var(--line); }
      .section-title { font-family: 'Noto Serif TC', serif; font-weight: 700; color: var(--wood); font-size: 14px; }
      .section-sum { font-size: 13px; font-weight: 700; color: var(--accent-dark); }

      .stepper-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
      .stepper-label { font-size: 12px; color: var(--ink-soft); margin-bottom: 5px; }
      .stepper-control { display: flex; align-items: center; justify-content: space-between; border: 1px solid var(--line); background: var(--paper); border-radius: 10px; padding: 8px 10px; }
      .stepper-value { font-size: 15px; font-weight: 700; }
      .stepper-value small { font-size: 11px; font-weight: 400; color: var(--ink-soft); }
      .stepper-arrows { display: flex; flex-direction: column; }
      .stepper-arrows button { background: none; border: none; color: var(--ink-soft); cursor: pointer; line-height: 0; padding: 1px; }
      .stepper-arrows button:hover { color: var(--accent); }

      .sum-line { display: flex; justify-content: space-between; font-size: 12.5px; color: var(--ink-soft); padding: 6px 2px 0; }
      .sum-line b { color: var(--ink); font-size: 14px; }

      .add-link { align-self: flex-start; background: none; border: none; color: var(--accent-dark); font-size: 13px; font-weight: 700; cursor: pointer; padding: 2px 0; }

      .warn-box { display: flex; gap: 10px; background: #FBEFE2; border: 1px solid #E3C79A; border-radius: 14px; padding: 12px 14px; font-size: 12.5px; color: var(--ink); align-items: flex-start; }
      .warn-actions { display: flex; gap: 8px; margin-top: 10px; }

      .confirm-icon { width: 48px; height: 48px; border-radius: 50%; background: #F6E4DD; color: var(--danger); display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; }
      .confirm-title { font-weight: 700; font-size: 15.5px; }
      .confirm-sub { font-size: 12.5px; color: var(--ink-soft); margin-top: 6px; }
      .confirm-sub-2 { font-size: 11.5px; color: var(--danger); margin-top: 3px; }

      .seg { display: flex; background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 3px; }
      .seg-btn { flex: 1; border: none; background: transparent; padding: 8px; border-radius: 8px; font-size: 13px; cursor: pointer; color: var(--ink-soft); }
      .seg-btn-active { background: var(--accent); color: #fff; font-weight: 700; }

      .col-check-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .col-check { display: flex; align-items: center; gap: 6px; font-size: 13px; background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; }

      .toast { position: fixed; bottom: 84px; left: 50%; transform: translateX(-50%); background: var(--wood); color: #fff; padding: 10px 18px; border-radius: 12px; font-size: 13px; z-index: 60; box-shadow: 0 6px 16px rgba(0,0,0,0.2); }

      .print-area { display: none; }
      @media print {
        .app-ui { display: none !important; }
        .modal-overlay { display: none !important; }
        .print-area { display: block !important; padding: 20px; }
        .print-title { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
        .print-range { font-size: 12px; color: #555; margin-bottom: 14px; }
        .print-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .print-table th, .print-table td { border: 1px solid #ccc; padding: 5px 7px; text-align: right; }
        .print-table th:first-child, .print-table td:first-child { text-align: left; }
        .print-stats { margin-top: 16px; border-top: 1px solid #999; padding-top: 10px; }
        .print-stats-title { font-weight: 700; margin-bottom: 6px; }
        .print-stats-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; font-size: 12px; }
      }

      @media (min-width: 640px) {
        .summary-grid { grid-template-columns: repeat(4, 1fr); }
        .entry-grid { grid-template-columns: repeat(6, 1fr); }
        .stepper-grid { grid-template-columns: repeat(4, 1fr); }
      }
    `}</style>
  );
}

/* ===================== 掛載到頁面 ===================== */

const rootEl = document.getElementById('root');
const root = createRoot(rootEl);
root.render(<App />);
