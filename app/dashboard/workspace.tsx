"use client";

// ─────────────────────────────────────────────────────────────────────────────
// workspace.tsx — Ana orkestrasyon bileşeni
// Tüm durum yönetimi ve API çağrıları burada yapılır.
// UI bileşenleri components/ klasöründe ayrı dosyalarda tutulur.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { HubConnection, HubConnectionBuilder } from "@microsoft/signalr";

import "./workspace.css";
import "./functional.css";
import "./actions.css";
import "./result-actions.css";
import "./ready-panel.css";
import "./dashboard-polish.css";
import "./canva-sidebar.css";
import "./top-menu.css";
import "./change-preview.css";
import "./readability.css";

import { API_URL } from "./constants";
import type {
  BusyState, HistoryItem, MultiFileRequest, Plan,
  Preview, Recipe, Step, Upload, View,
} from "./types";

import { Sidebar }       from "./components/Sidebar";
import { DataTable }     from "./components/DataTable";
import { ActionsView }   from "./components/ActionsView";
import { EmptyWorkspace, FilesView, HistoryView } from "./components/panels";
import { Progress }      from "./components/shared";

// ─── Ana bileşen ────────────────────────────────────────────────────────────

export default function Workspace() {
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const connectionRef = useRef<HubConnection | null>(null);

  // Görünüm ve dosya durumu
  const [view,            setView]            = useState<View>("workspace");
  const [files,           setFiles]           = useState<Upload[]>([]);
  const [activeId,        setActiveId]        = useState<string | null>(null);

  // İşlem durumu
  const [prompt,          setPrompt]          = useState("");
  const [plan,            setPlan]            = useState<Plan | null>(null);
  const [result,          setResult]          = useState<Preview | null>(null);
  const [history,         setHistory]         = useState<HistoryItem[]>([]);
  const [workflowByFile,  setWorkflowByFile]  = useState<Record<string, Step[]>>({});
  const [recipes,         setRecipes]         = useState<Recipe[]>([]);

  // UI durumu
  const [busy,            setBusy]            = useState<BusyState>(null);
  const [appliedToCurrent,setAppliedToCurrent]= useState(false);
  const [showResult,      setShowResult]      = useState(false);
  const [sidebarCollapsed,setSidebarCollapsed]= useState(false);
  const [error,           setError]           = useState("");
  const [progress,        setProgress]        = useState(0);
  const [progressMessage, setProgressMessage] = useState("");

  // Aktif dosya
  const active = files.find((f) => f.fileId === activeId) ?? files[0] ?? null;

  // SignalR bağlantısını temizle
  useEffect(() => () => { void connectionRef.current?.stop(); }, []);

  // ─── Yardımcı ─────────────────────────────────────────────────────────────

  async function readJson(response: Response) {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? "İşlem tamamlanamadı.");
    return body;
  }

  // ─── Dosya yönetimi ───────────────────────────────────────────────────────

  async function loadFiles(selected?: FileList | File[]) {
    const incoming = Array.from(selected ?? []);
    if (!incoming.length) return;
    setBusy("upload");
    setError("");
    const uploaded: Upload[] = [];
    try {
      for (const file of incoming) {
        const form = new FormData();
        form.append("file", file);
        uploaded.push(await readJson(await fetch(`${API_URL}/api/files/upload`, { method: "POST", body: form })));
      }
      setFiles((current) => [
        ...current,
        ...uploaded.filter((item) => !current.some((old) => old.preview.fileName === item.preview.fileName)),
      ]);
      setActiveId(uploaded[0]?.fileId ?? activeId);
      setPlan(null); setResult(null); setView("workspace");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dosyalar yüklenemedi.");
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function selectFile(fileId: string) {
    setActiveId(fileId); setPlan(null); setResult(null);
    setPrompt(""); setError(""); setAppliedToCurrent(false); setShowResult(false); setView("workspace");
  }

  function removeFile(fileId: string) {
    setFiles((current) => current.filter((f) => f.fileId !== fileId));
    if (activeId === fileId)
      setActiveId(files.find((f) => f.fileId !== fileId)?.fileId ?? null);
  }

  // ─── AI plan ve yürütme ───────────────────────────────────────────────────

  async function createPlan(text = prompt, executeImmediately = false) {
    if (!active || !text.trim()) return;
    setBusy("plan"); setError(""); setPlan(null); setResult(null); setAppliedToCurrent(false);
    try {
      const created = await readJson(await fetch(`${API_URL}/api/operations/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: active.fileId, prompt: text }),
      }));
      setPlan(created);
      if (executeImmediately) await execute(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Komut anlaşılamadı. Kolon adını komutta açıkça belirtin.");
    } finally { setBusy(null); }
  }

  async function runReadyAction(step: Step, summary: string) {
    if (!active) return;
    setView("workspace"); setPrompt(summary); setBusy("plan"); setError("");
    setPlan(null); setResult(null); setAppliedToCurrent(false); setShowResult(false);
    try {
      const created: Plan = await readJson(await fetch(`${API_URL}/api/operations/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: active.fileId, step, summary }),
      }));
      setPlan(created);
      await execute(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hazır işlem uygulanamadı.");
    } finally { setBusy(null); }
  }

  async function runMultiReadyAction(request: MultiFileRequest, summary: string) {
    if (!active) return;
    setView("workspace"); setPrompt(summary); setBusy("plan"); setError("");
    setPlan(null); setResult(null); setAppliedToCurrent(false); setShowResult(false);
    try {
      const created: Plan = await readJson(await fetch(`${API_URL}/api/operations/prepare-multiple`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...request, summary }),
      }));
      setPlan(created);
      await execute(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Çoklu dosya işlemi uygulanamadı.");
    } finally { setBusy(null); }
  }

  async function runRecipe(recipe: Recipe) {
    if (!active) return;
    setView("workspace"); setPrompt(recipe.name); setBusy("plan"); setError("");
    setPlan(null); setResult(null); setAppliedToCurrent(false); setShowResult(false);
    try {
      const created: Plan = await readJson(await fetch(`${API_URL}/api/operations/prepare-workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: active.fileId, steps: recipe.steps, summary: recipe.name }),
      }));
      setPlan(created);
      await execute(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "İşlem şablonu uygulanamadı. Kolon adlarını kontrol et.");
    } finally { setBusy(null); }
  }

  async function execute(selectedPlan: Plan | null = plan) {
    if (!selectedPlan || !active) return;
    setBusy("execute"); setProgress(15); setProgressMessage("İşlem hazırlanıyor"); setError("");
    try {
      // SignalR ile ilerleme takibi
      try {
        const hub = new HubConnectionBuilder()
          .withUrl(`${API_URL}/hubs/jobs`)
          .withAutomaticReconnect()
          .build();
        hub.on("progress", (e: { progress: number; message: string }) => {
          setProgress(e.progress); setProgressMessage(e.message);
        });
        await hub.start();
        await hub.invoke("WatchOperation", selectedPlan.operationId);
        connectionRef.current = hub;
      } catch {
        setProgress(55); setProgressMessage("Excel işlemi uygulanıyor");
      }

      const done = await readJson(await fetch(`${API_URL}/api/operations/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationId: selectedPlan.operationId }),
      }));

      setResult(done.preview); setShowResult(true);
      setProgress(100); setProgressMessage("Değişiklik önizlemesi hazır");
      setHistory((current) => [{
        id:   selectedPlan.operationId,
        fileName: active.preview.fileName,
        summary:  selectedPlan.plan.summary,
        rows:     done.preview.totalRows,
        time: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
        downloadReady: true,
      }, ...current]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "İşlem uygulanamadı.");
    } finally {
      setBusy(null);
      void connectionRef.current?.stop();
    }
  }

  // ─── İndirme ──────────────────────────────────────────────────────────────

  function download(operationId = plan?.operationId) {
    if (operationId) window.location.href = `${API_URL}/api/operations/${operationId}/download`;
  }
  function downloadCurrent() {
    if (active) window.location.href = `${API_URL}/api/files/${active.fileId}/download`;
  }
  function splitCurrent(column: string) {
    if (active && column)
      window.location.href = `${API_URL}/api/files/${active.fileId}/split?column=${encodeURIComponent(column)}`;
  }

  // ─── Uygula / Geri al ─────────────────────────────────────────────────────

  const MULTI_FILE_KINDS = ["AppendFiles", "CompareFiles", "JoinFiles", "FullJoinFiles", "FindMissing"];

  async function applyToCurrent() {
    if (!plan || !active) return;
    setBusy("apply"); setError("");
    try {
      const updated: Upload = await readJson(await fetch(`${API_URL}/api/operations/${plan.operationId}/apply`, { method: "POST" }));
      setFiles((current) => current.map((f) => f.fileId === updated.fileId ? updated : f));
      setActiveId(updated.fileId);
      const reusableSteps = plan.plan.steps.filter((s) => !MULTI_FILE_KINDS.includes(s.kind));
      if (reusableSteps.length)
        setWorkflowByFile((current) => ({ ...current, [updated.fileId]: [...(current[updated.fileId] ?? []), ...reusableSteps] }));
      setResult(updated.preview); setAppliedToCurrent(true); setShowResult(false); setPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sonuç mevcut dosyaya uygulanamadı.");
    } finally { setBusy(null); }
  }

  async function revertCurrent() {
    if (!plan || !active) return;
    if (!appliedToCurrent) {
      setPlan(null); setResult(null); setShowResult(false); setPrompt(""); setError(""); return;
    }
    setBusy("revert"); setError("");
    try {
      const restored: Upload = await readJson(await fetch(`${API_URL}/api/operations/${plan.operationId}/revert`, { method: "POST" }));
      setFiles((current) => current.map((f) => f.fileId === restored.fileId ? restored : f));
      setActiveId(restored.fileId);
      const reusableCount = plan.plan.steps.filter((s) => !MULTI_FILE_KINDS.includes(s.kind)).length;
      if (reusableCount)
        setWorkflowByFile((current) => ({ ...current, [restored.fileId]: (current[restored.fileId] ?? []).slice(0, -reusableCount) }));
      setPlan(null); setResult(null); setAppliedToCurrent(false); setShowResult(false); setPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Son değişiklik geri alınamadı.");
    } finally { setBusy(null); }
  }

  // ─── Şablon kaydet ────────────────────────────────────────────────────────

  function saveWorkflow() {
    if (!active) return;
    const steps = workflowByFile[active.fileId] ?? [];
    if (!steps.length) { setError("Şablon olarak kaydedilecek uygulanmış işlem bulunamadı."); return; }
    const recipe: Recipe = {
      id:    `${Date.now()}-${recipes.length}`,
      name:  `${active.preview.fileName} · ${steps.length} adım`,
      steps: steps.map((s) => ({ ...s })),
    };
    setRecipes((current) => [recipe, ...current]);
    setError("");
  }

  function useAction(text: string, run = false) {
    setPrompt(text); setView("workspace");
    if (!active) setTimeout(() => fileInputRef.current?.click(), 0);
    else if (run && text.trim()) void createPlan(text, true);
  }

  // ─── Hesaplanmış değerler ─────────────────────────────────────────────────

  const changeStep = showResult && result ? plan?.plan.steps[0] : undefined;
  const markerKinds = ["DeleteRows", "HighlightRows", "Filter", "RemoveDuplicates", "DeleteColumn"];
  const resultBasedPreview = changeStep && !markerKinds.includes(changeStep.kind);
  const preview = resultBasedPreview && result ? result : active?.preview;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className={`dash ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar
        view={view} setView={setView} files={files} active={active}
        historyCount={history.length} collapsed={sidebarCollapsed}
        toggle={() => setSidebarCollapsed((v) => !v)}
        selectFile={selectFile} addFile={() => fileInputRef.current?.click()}
      />

      <section className="dash-main week2">
        {/* Üst menü */}
        <header className="workspace-topbar">
          <div className="top-file">
            <span className="xls">X</span>
            <div>
              <b>{active?.preview.fileName ?? "Yeni çalışma alanı"}</b>
              <small>
                {active
                  ? `${active.preview.totalRows.toLocaleString("tr-TR")} satır · ${active.preview.columns.length} kolon`
                  : "Bir Excel dosyası yükleyerek başla"}
              </small>
            </div>
          </div>
          <nav className="top-nav">
            {(["workspace", "files", "history", "actions"] as View[]).map((v) => (
              <button key={v} className={view === v ? "active" : ""} onClick={() => setView(v)}>
                {{ workspace: "Çalışma", files: "Dosyalar", history: "Geçmiş", actions: "Hazır işlemler" }[v]}
              </button>
            ))}
          </nav>
          <div className="top-actions">
            <button className="icon-action" aria-label="Yardım">?</button>
            {active && <button className="top-download" onClick={downloadCurrent}>↓ Günceli indir</button>}
            <button className="top-upload" onClick={() => fileInputRef.current?.click()}>＋ Dosya ekle</button>
          </div>
        </header>

        {/* Gizli dosya input */}
        <input
          ref={fileInputRef} type="file" accept=".xlsx,.csv" multiple hidden
          onChange={(e) => loadFiles(e.target.files ?? undefined)}
        />

        {/* Görünüm panelleri */}
        {view === "files"   && <FilesView   files={files} selectFile={selectFile} removeFile={removeFile} add={() => fileInputRef.current?.click()} />}
        {view === "history" && <HistoryView history={history} download={download} />}
        {view === "actions" && (
          <ActionsView
            columns={active?.preview.columns ?? []} files={files} activeId={active?.fileId}
            recipes={recipes} hasFile={!!active}
            runAction={runReadyAction} runMultiAction={runMultiReadyAction}
            runRecipe={runRecipe} splitFile={splitCurrent}
          />
        )}

        {/* Boş çalışma alanı */}
        {view === "workspace" && !active && (
          <EmptyWorkspace busy={busy === "upload"} error={error} open={() => fileInputRef.current?.click()} drop={loadFiles} useAction={useAction} />
        )}

        {/* Çalışma alanı: tablo + panel */}
        {view === "workspace" && active && (
          <div className="studio">
            <section className="data-stage">
              <div className="data-toolbar">
                <div>
                  <span className="table-status"><i /> CANLI TABLO</span>
                  <b>{preview?.totalRows.toLocaleString("tr-TR")} satır</b>
                  <span>{preview?.columns.length} kolon</span>
                </div>
                <div className="legend">
                  <strong>{changeStep ? "Değişiklik önizlemesi" : "Tüm satırlar yüklendi"}</strong>
                  <small>{changeStep ? "İşaretli alanlar değişiklikten etkilenecek" : "Kaydırarak tamamını görüntüle"}</small>
                </div>
              </div>
              {preview && (
                <DataTable preview={preview} original={active.preview} result={result ?? undefined} change={changeStep} />
              )}
            </section>

            {/* Sağ panel */}
            <aside className="ai-panel ready-panel">
              <div className="ai-head">
                <span>⚙</span>
                <div><b>Hazır İşlemler</b></div>
              </div>
              <div className="ai-scroll">
                <div className="compact-ready">
                  <ActionsView
                    columns={active.preview.columns} files={files} activeId={active.fileId}
                    recipes={recipes} hasFile
                    runAction={runReadyAction} runMultiAction={runMultiReadyAction}
                    runRecipe={runRecipe} splitFile={splitCurrent}
                  />
                </div>
                {busy === "plan"    && <div className="ai-thinking"><i /><i /><i /> İşlem hazırlanıyor</div>}
                {busy === "execute" && <Progress value={progress} message={progressMessage} />}
                {error && <div className="studio-error">! {error}</div>}
              </div>

              {/* Sonuç dock */}
              {result && (
                <div className="result-dock">
                  <div className="result-card">
                    <span>✓</span>
                    <div>
                      <b>{appliedToCurrent ? "Çalışma kopyası güncellendi" : "Sonuç önizlemesi hazır"}</b>
                      <p>
                        {appliedToCurrent
                          ? `${workflowByFile[active.fileId]?.length ?? 0} işlem çalışma kopyasında birikti. Sonraki işlemler bu sonuçtan devam edecek.`
                          : "İşlem sonucu tabloda gösteriliyor. Çalışma kopyasına uygulayabilir veya iptal edebilirsin."}
                      </p>
                      <div className="result-actions">
                        <button className="cancel-change" disabled={busy === "revert"} onClick={revertCurrent}>
                          {busy === "revert" ? "Geri alınıyor..." : "Değişikliği iptal et"}
                        </button>
                        {!appliedToCurrent && (
                          <button className="secondary" disabled={busy === "apply"} onClick={applyToCurrent}>
                            {busy === "apply" ? "Uygulanıyor..." : "Excel'e uygula"}
                          </button>
                        )}
                        {appliedToCurrent && (
                          <button className="secondary save-recipe" onClick={saveWorkflow}>İşlem zincirini kaydet</button>
                        )}
                        {appliedToCurrent && (
                          <button className="download-workbook" onClick={downloadCurrent}>Tüm işlemleri içeren Excel'i indir ↓</button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}
