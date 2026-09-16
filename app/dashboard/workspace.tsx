"use client";

import Link from "next/link";
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

type Preview = {
  fileName: string;
  size: number;
  sheetName: string;
  columns: string[];
  rows: string[][];
  totalRows: number;
  rowFills?: Record<string, string>;
};
type Upload = { fileId: string; preview: Preview };
type Step = {
  kind: string;
  column?: string;
  operator?: string;
  value?: string;
  newName?: string;
  descending?: boolean;
  color?: string;
  secondColumn?: string;
  formulaOperator?: string;
  replacement?: string;
  mode?: string;
  separator?: string;
  aggregate?: string;
  start?: number;
  length?: number;
  values?: Record<string, string>;
};
type MultiFileRequest = {
  kind: string;
  fileIds: string[];
  keyColumn?: string;
  otherKeyColumn?: string;
  fuzzy?: boolean;
  similarityThreshold?: number;
};
type Plan = {
  operationId: string;
  plan: { summary: string; steps: Step[]; warnings: string[] };
  originalRows: number;
  estimatedRows: number;
  previewRows: string[][];
  columns: string[];
};
type HistoryItem = {
  id: string;
  fileName: string;
  summary: string;
  rows: number;
  time: string;
  downloadReady: boolean;
};
type Recipe = { id: string; name: string; steps: Step[] };
type View = "workspace" | "files" | "history" | "actions";
type ActionCategory =
  | "Satırlar"
  | "Temizleme"
  | "Kolonlar"
  | "Raporlama"
  | "Çoklu dosya";
type ReadyAction = {
  id: string;
  icon: string;
  title: string;
  description: string;
  category: ActionCategory;
};

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5190";
const actionCategories: ActionCategory[] = [
  "Satırlar",
  "Temizleme",
  "Kolonlar",
  "Raporlama",
  "Çoklu dosya",
];
const readyActions: ReadyAction[] = [
  {
    id: "delete",
    icon: "−",
    title: "Satırları sil",
    description: "Koşula uyan satırları kaldır.",
    category: "Satırlar",
  },
  {
    id: "highlight",
    icon: "◩",
    title: "Satırları boya",
    description: "Koşula uyan satırları renklendir.",
    category: "Satırlar",
  },
  {
    id: "filter",
    icon: "⌕",
    title: "Satırları filtrele",
    description: "Yalnızca koşula uyan satırları tut.",
    category: "Satırlar",
  },
  {
    id: "sortText",
    icon: "AZ",
    title: "Metne göre sırala",
    description: "A–Z veya Z–A sıralama yap.",
    category: "Satırlar",
  },
  {
    id: "sortNumber",
    icon: "12",
    title: "Sayıya göre sırala",
    description: "Sayısal değerleri sırala.",
    category: "Satırlar",
  },
  {
    id: "duplicate",
    icon: "⌁",
    title: "Mükerrerleri kaldır",
    description: "İlk, son veya en yüksek kaydı koru.",
    category: "Satırlar",
  },
  {
    id: "fill",
    icon: "◫",
    title: "Boşlukları doldur",
    description: "Boş hücrelere varsayılan değer yaz.",
    category: "Satırlar",
  },
  {
    id: "validate",
    icon: "✓?",
    title: "Hatalı verileri bul",
    description: "Boş, e-posta, telefon, sayı ve tarih hatalarını çıkar.",
    category: "Satırlar",
  },
  {
    id: "addRow",
    icon: "+R",
    title: "Yeni satır ekle",
    description: "Kolon değerlerini girerek çalışma kopyasına yeni kayıt ekle.",
    category: "Satırlar",
  },
  {
    id: "editRow",
    icon: "✎",
    title: "Satır/hücre düzenle",
    description: "Anahtar değere uyan satırdaki bir alanı değiştir.",
    category: "Satırlar",
  },
  {
    id: "replace",
    icon: "↔",
    title: "Bul ve değiştir",
    description: "Metni bir kolonda veya tüm dosyada değiştir.",
    category: "Temizleme",
  },
  {
    id: "clean",
    icon: "✦",
    title: "Metni temizle",
    description: "Boşluk, görünmeyen karakter ve sayı biçimini düzelt.",
    category: "Temizleme",
  },
  {
    id: "case",
    icon: "Aa",
    title: "Büyük/küçük harf",
    description: "Metinlerin harf düzenini standartlaştır.",
    category: "Temizleme",
  },
  {
    id: "split",
    icon: "A|B",
    title: "Kolonu böl",
    description: "Bir ayırıcıya göre iki yeni kolon oluştur.",
    category: "Temizleme",
  },
  {
    id: "merge",
    icon: "A+B",
    title: "Kolonları birleştir",
    description: "İki kolonu yeni bir kolonda birleştir.",
    category: "Temizleme",
  },
  {
    id: "extractText",
    icon: "Ab",
    title: "Metinden parça al",
    description: "Önce, sonra, soldan veya sağdan metin çıkar.",
    category: "Temizleme",
  },
  {
    id: "extractDate",
    icon: "31",
    title: "Tarihten bilgi çıkar",
    description: "Yıl, ay, gün, çeyrek veya hafta günü oluştur.",
    category: "Temizleme",
  },
  {
    id: "deleteColumn",
    icon: "−C",
    title: "Kolonu sil",
    description: "Seçilen kolonu kaldır.",
    category: "Kolonlar",
  },
  {
    id: "renameColumn",
    icon: "Aa",
    title: "Kolonu yeniden adlandır",
    description: "Kolon başlığını değiştir.",
    category: "Kolonlar",
  },
  {
    id: "constant",
    icon: "+C",
    title: "Sabit kolon ekle",
    description: "Tüm satırlara aynı değeri yazan kolon ekle.",
    category: "Kolonlar",
  },
  {
    id: "rowNumber",
    icon: "#",
    title: "Sıra numarası ekle",
    description: "Her satıra otomatik sıra numarası ver.",
    category: "Kolonlar",
  },
  {
    id: "calculate",
    icon: "ƒx",
    title: "Hesaplanan kolon",
    description: "İki kolonla toplama, çıkarma, çarpma veya bölme yap.",
    category: "Kolonlar",
  },
  {
    id: "group",
    icon: "Σ",
    title: "Grupla ve özetle",
    description: "Adet, toplam, ortalama, en düşük veya en yüksek değer çıkar.",
    category: "Raporlama",
  },
  {
    id: "splitFiles",
    icon: "ZIP",
    title: "Gruplara göre dosyalara böl",
    description: "Her kategori için ayrı Excel üret ve ZIP indir.",
    category: "Raporlama",
  },
  {
    id: "recipe",
    icon: "▶",
    title: "İşlem şablonu çalıştır",
    description: "Kaydettiğin işlem zincirini başka bir Excel'e uygula.",
    category: "Raporlama",
  },
  {
    id: "append",
    icon: "⇊",
    title: "Excel'leri alt alta birleştir",
    description: "Yüklü dosyaları tek çalışma tablosunda topla.",
    category: "Çoklu dosya",
  },
  {
    id: "compare",
    icon: "≠",
    title: "İki Excel'i karşılaştır",
    description: "Eklenen, silinen ve değişen kayıtları raporla.",
    category: "Çoklu dosya",
  },
  {
    id: "join",
    icon: "⋈",
    title: "Eksik kolonları tamamla",
    description:
      "Mevcut çalışanları koruyup ikinci dosyadaki eksik bilgileri getir.",
    category: "Çoklu dosya",
  },
  {
    id: "fullJoin",
    icon: "⊕",
    title: "Kolon ve çalışanları tam birleştir",
    description:
      "İki dosyanın tüm kolonlarını ve eksik çalışanlarını tek tabloda topla.",
    category: "Çoklu dosya",
  },
  {
    id: "missing",
    icon: "∅",
    title: "Eksik kayıtları bul",
    description: "İlk dosyada olup ikinci dosyada olmayanları çıkar.",
    category: "Çoklu dosya",
  },
];
const stepNames: Record<string, string> = {
  Filter: "Filtrele",
  DeleteRows: "Eşleşen satırları sil",
  HighlightRows: "Eşleşen satırları boya",
  Sort: "Sırala",
  RemoveDuplicates: "Mükerrerleri kaldır",
  RenameColumn: "Kolonu yeniden adlandır",
  DeleteColumn: "Kolonu sil",
  FillBlanks: "Boşlukları doldur",
  AddCalculatedColumn: "Hesaplanan kolon ekle",
  FindReplace: "Bul ve değiştir",
  CleanText: "Metni temizle",
  ChangeCase: "Harf düzenini değiştir",
  SplitColumn: "Kolonu böl",
  MergeColumns: "Kolonları birleştir",
  AddConstantColumn: "Sabit kolon ekle",
  AddRowNumbers: "Sıra numarası ekle",
  ExtractDatePart: "Tarihten bilgi çıkar",
  ExtractText: "Metinden parça al",
  GroupSummary: "Grupla ve özetle",
  ValidateData: "Hatalı verileri bul",
  AddRow: "Yeni satır ekle",
  UpdateRows: "Satır/hücre düzenle",
  AppendFiles: "Excel'leri birleştir",
  CompareFiles: "Excel'leri karşılaştır",
  JoinFiles: "Eksik kolonları tamamla",
  FullJoinFiles: "Kolon ve çalışanları tam birleştir",
  FindMissing: "Eksik kayıtları bul",
};

export default function Workspace() {
  const input = useRef<HTMLInputElement>(null);
  const connection = useRef<HubConnection | null>(null);
  const [view, setView] = useState<View>("workspace");
  const [files, setFiles] = useState<Upload[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [result, setResult] = useState<Preview | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [workflowByFile, setWorkflowByFile] = useState<Record<string, Step[]>>(
    {},
  );
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [busy, setBusy] = useState<
    "upload" | "plan" | "execute" | "apply" | "revert" | null
  >(null);
  const [appliedToCurrent, setAppliedToCurrent] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const active =
    files.find((file) => file.fileId === activeId) ?? files[0] ?? null;

  useEffect(
    () => () => {
      void connection.current?.stop();
    },
    [],
  );

  async function readJson(response: Response) {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? "İşlem tamamlanamadı.");
    return body;
  }

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
        uploaded.push(
          await readJson(
            await fetch(`${api}/api/files/upload`, {
              method: "POST",
              body: form,
            }),
          ),
        );
      }
      setFiles((current) => [
        ...current,
        ...uploaded.filter(
          (item) =>
            !current.some(
              (old) => old.preview.fileName === item.preview.fileName,
            ),
        ),
      ]);
      setActiveId(uploaded[0]?.fileId ?? activeId);
      setPlan(null);
      setResult(null);
      setView("workspace");
    } catch (exception) {
      setError(
        exception instanceof Error
          ? exception.message
          : "Dosyalar yüklenemedi.",
      );
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  function selectFile(fileId: string) {
    setActiveId(fileId);
    setPlan(null);
    setResult(null);
    setPrompt("");
    setError("");
    setAppliedToCurrent(false);
    setShowResult(false);
    setView("workspace");
  }
  function removeFile(fileId: string) {
    setFiles((current) => current.filter((file) => file.fileId !== fileId));
    if (activeId === fileId)
      setActiveId(files.find((file) => file.fileId !== fileId)?.fileId ?? null);
  }

  async function createPlan(text = prompt, executeImmediately = false) {
    if (!active || !text.trim()) return;
    setBusy("plan");
    setError("");
    setPlan(null);
    setResult(null);
    setAppliedToCurrent(false);
    try {
      const created = await readJson(
        await fetch(`${api}/api/operations/plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: active.fileId, prompt: text }),
        }),
      );
      setPlan(created);
      if (executeImmediately) await execute(created);
    } catch (exception) {
      setError(
        exception instanceof Error
          ? exception.message
          : "Komut anlaşılamadı. Kolon adını komutta açıkça belirtin.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function runReadyAction(step: Step, summary: string) {
    if (!active) return;
    setView("workspace");
    setPrompt(summary);
    setBusy("plan");
    setError("");
    setPlan(null);
    setResult(null);
    setAppliedToCurrent(false);
    setShowResult(false);
    try {
      const created: Plan = await readJson(
        await fetch(`${api}/api/operations/prepare`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: active.fileId, step, summary }),
        }),
      );
      setPlan(created);
      await execute(created);
    } catch (exception) {
      setError(
        exception instanceof Error
          ? exception.message
          : "Hazır işlem uygulanamadı.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function runMultiReadyAction(
    request: MultiFileRequest,
    summary: string,
  ) {
    if (!active) return;
    setView("workspace");
    setPrompt(summary);
    setBusy("plan");
    setError("");
    setPlan(null);
    setResult(null);
    setAppliedToCurrent(false);
    setShowResult(false);
    try {
      const created: Plan = await readJson(
        await fetch(`${api}/api/operations/prepare-multiple`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...request, summary }),
        }),
      );
      setPlan(created);
      await execute(created);
    } catch (exception) {
      setError(
        exception instanceof Error
          ? exception.message
          : "Çoklu dosya işlemi uygulanamadı.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function runRecipe(recipe: Recipe) {
    if (!active) return;
    setView("workspace");
    setPrompt(recipe.name);
    setBusy("plan");
    setError("");
    setPlan(null);
    setResult(null);
    setAppliedToCurrent(false);
    setShowResult(false);
    try {
      const created: Plan = await readJson(
        await fetch(`${api}/api/operations/prepare-workflow`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileId: active.fileId,
            steps: recipe.steps,
            summary: recipe.name,
          }),
        }),
      );
      setPlan(created);
      await execute(created);
    } catch (exception) {
      setError(
        exception instanceof Error
          ? exception.message
          : "İşlem şablonu uygulanamadı. Kolon adlarını kontrol et.",
      );
    } finally {
      setBusy(null);
    }
  }

  function splitCurrent(column: string) {
    if (!active || !column) return;
    window.location.href = `${api}/api/files/${active.fileId}/split?column=${encodeURIComponent(column)}`;
  }

  async function execute(selectedPlan: Plan | null = plan) {
    if (!selectedPlan || !active) return;
    setBusy("execute");
    setProgress(15);
    setProgressMessage("İşlem hazırlanıyor");
    setError("");
    try {
      try {
        const hub = new HubConnectionBuilder()
          .withUrl(`${api}/hubs/jobs`)
          .withAutomaticReconnect()
          .build();
        hub.on("progress", (event: { progress: number; message: string }) => {
          setProgress(event.progress);
          setProgressMessage(event.message);
        });
        await hub.start();
        await hub.invoke("WatchOperation", selectedPlan.operationId);
        connection.current = hub;
      } catch {
        setProgress(55);
        setProgressMessage("Excel işlemi uygulanıyor");
      }
      const done = await readJson(
        await fetch(`${api}/api/operations/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operationId: selectedPlan.operationId }),
        }),
      );
      setResult(done.preview);
      setShowResult(true);
      setProgress(100);
      setProgressMessage("Değişiklik önizlemesi hazır");
      setHistory((current) => [
        {
          id: selectedPlan.operationId,
          fileName: active.preview.fileName,
          summary: selectedPlan.plan.summary,
          rows: done.preview.totalRows,
          time: new Date().toLocaleTimeString("tr-TR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          downloadReady: true,
        },
        ...current,
      ]);
    } catch (exception) {
      setError(
        exception instanceof Error ? exception.message : "İşlem uygulanamadı.",
      );
    } finally {
      setBusy(null);
      void connection.current?.stop();
    }
  }

  function download(operationId = plan?.operationId) {
    if (operationId)
      window.location.href = `${api}/api/operations/${operationId}/download`;
  }
  function downloadCurrent() {
    if (active)
      window.location.href = `${api}/api/files/${active.fileId}/download`;
  }
  async function applyToCurrent() {
    if (!plan || !active) return;
    setBusy("apply");
    setError("");
    try {
      const updated: Upload = await readJson(
        await fetch(`${api}/api/operations/${plan.operationId}/apply`, {
          method: "POST",
        }),
      );
      setFiles((current) =>
        current.map((file) =>
          file.fileId === updated.fileId ? updated : file,
        ),
      );
      setActiveId(updated.fileId);
      const reusableSteps = plan.plan.steps.filter(
        (step) =>
          ![
            "AppendFiles",
            "CompareFiles",
            "JoinFiles",
            "FullJoinFiles",
            "FindMissing",
          ].includes(step.kind),
      );
      if (reusableSteps.length)
        setWorkflowByFile((current) => ({
          ...current,
          [updated.fileId]: [
            ...(current[updated.fileId] ?? []),
            ...reusableSteps,
          ],
        }));
      setResult(updated.preview);
      setAppliedToCurrent(true);
      setShowResult(false);
      setPrompt("");
    } catch (exception) {
      setError(
        exception instanceof Error
          ? exception.message
          : "Sonuç mevcut dosyaya uygulanamadı.",
      );
    } finally {
      setBusy(null);
    }
  }
  async function revertCurrent() {
    if (!plan || !active) return;
    if (!appliedToCurrent) {
      setPlan(null);
      setResult(null);
      setShowResult(false);
      setPrompt("");
      setError("");
      return;
    }
    setBusy("revert");
    setError("");
    try {
      const restored: Upload = await readJson(
        await fetch(`${api}/api/operations/${plan.operationId}/revert`, {
          method: "POST",
        }),
      );
      setFiles((current) =>
        current.map((file) =>
          file.fileId === restored.fileId ? restored : file,
        ),
      );
      setActiveId(restored.fileId);
      const reusableCount = plan.plan.steps.filter(
        (step) =>
          ![
            "AppendFiles",
            "CompareFiles",
            "JoinFiles",
            "FullJoinFiles",
            "FindMissing",
          ].includes(step.kind),
      ).length;
      if (reusableCount)
        setWorkflowByFile((current) => ({
          ...current,
          [restored.fileId]: (current[restored.fileId] ?? []).slice(
            0,
            -reusableCount,
          ),
        }));
      setPlan(null);
      setResult(null);
      setAppliedToCurrent(false);
      setShowResult(false);
      setPrompt("");
    } catch (exception) {
      setError(
        exception instanceof Error
          ? exception.message
          : "Son değişiklik geri alınamadı.",
      );
    } finally {
      setBusy(null);
    }
  }
  function saveWorkflow() {
    if (!active) return;
    const steps = workflowByFile[active.fileId] ?? [];
    if (!steps.length) {
      setError("Şablon olarak kaydedilecek uygulanmış işlem bulunamadı.");
      return;
    }
    const recipe: Recipe = {
      id: `${Date.now()}-${recipes.length}`,
      name: `${active.preview.fileName} · ${steps.length} adım`,
      steps: steps.map((step) => ({ ...step })),
    };
    setRecipes((current) => [recipe, ...current]);
    setError("");
  }
  function useAction(text: string, run = false) {
    setPrompt(text);
    setView("workspace");
    if (!active) setTimeout(() => input.current?.click(), 0);
    else if (run && text.trim()) void createPlan(text, true);
  }

  const changeStep = showResult && result ? plan?.plan.steps[0] : undefined;
  const markerBasedKinds = [
    "DeleteRows",
    "HighlightRows",
    "Filter",
    "RemoveDuplicates",
    "DeleteColumn",
  ];
  const resultBasedPreview =
    changeStep && !markerBasedKinds.includes(changeStep.kind);
  const preview = resultBasedPreview && result ? result : active?.preview;

  return (
    <main className={`dash ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar
        view={view}
        setView={setView}
        files={files}
        active={active}
        historyCount={history.length}
        collapsed={sidebarCollapsed}
        toggle={() => setSidebarCollapsed((value) => !value)}
        selectFile={selectFile}
        addFile={() => input.current?.click()}
      />
      <section className="dash-main week2">
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
            <button
              className={view === "workspace" ? "active" : ""}
              onClick={() => setView("workspace")}
            >
              Çalışma
            </button>
            <button
              className={view === "files" ? "active" : ""}
              onClick={() => setView("files")}
            >
              Dosyalar
            </button>
            <button
              className={view === "history" ? "active" : ""}
              onClick={() => setView("history")}
            >
              Geçmiş
            </button>
            <button
              className={view === "actions" ? "active" : ""}
              onClick={() => setView("actions")}
            >
              Hazır işlemler
            </button>
          </nav>
          <div className="top-actions">
            <button className="icon-action" aria-label="Yardım">
              ?
            </button>
            {active && (
              <button
                className="top-download"
                onClick={() => downloadCurrent()}
              >
                ↓ Günceli indir
              </button>
            )}
            <button
              className="top-upload"
              onClick={() => input.current?.click()}
            >
              ＋ Dosya ekle
            </button>
          </div>
        </header>
        <input
          ref={input}
          type="file"
          accept=".xlsx,.csv"
          multiple
          hidden
          onChange={(event) => loadFiles(event.target.files ?? undefined)}
        />
        {view === "files" && (
          <FilesView
            files={files}
            selectFile={selectFile}
            removeFile={removeFile}
            add={() => input.current?.click()}
          />
        )}
        {view === "history" && (
          <HistoryView history={history} download={download} />
        )}
        {view === "actions" && (
          <ActionsView
            columns={active?.preview.columns ?? []}
            files={files}
            activeId={active?.fileId}
            recipes={recipes}
            hasFile={!!active}
            runAction={runReadyAction}
            runMultiAction={runMultiReadyAction}
            runRecipe={runRecipe}
            splitFile={splitCurrent}
          />
        )}
        {view === "workspace" && !active && (
          <EmptyWorkspace
            busy={busy === "upload"}
            error={error}
            open={() => input.current?.click()}
            drop={loadFiles}
            useAction={useAction}
          />
        )}
        {view === "workspace" && active && (
          <div className="studio">
            <section className="data-stage">
              <div className="data-toolbar">
                <div>
                  <span className="table-status">
                    <i /> CANLI TABLO
                  </span>
                  <b>{preview?.totalRows.toLocaleString("tr-TR")} satır</b>
                  <span>{preview?.columns.length} kolon</span>
                </div>
                <div className="legend">
                  <strong>
                    {changeStep
                      ? "Değişiklik önizlemesi"
                      : "Tüm satırlar yüklendi"}
                  </strong>
                  <small>
                    {changeStep
                      ? "İşaretli alanlar değişiklikten etkilenecek"
                      : "Kaydırarak tamamını görüntüle"}
                  </small>
                </div>
              </div>
              {preview && (
                <DataTable
                  preview={preview}
                  original={active.preview}
                  result={result ?? undefined}
                  change={changeStep}
                />
              )}
            </section>
            <aside className="ai-panel ready-panel">
              <div className="ai-head">
                <span>⚙</span>
                <div>
                  <b>Hazır İşlemler</b>
                </div>
              </div>
              <div className="ai-scroll">
                <div className="compact-ready">
                  <ActionsView
                    columns={active.preview.columns}
                    files={files}
                    activeId={active.fileId}
                    recipes={recipes}
                    hasFile
                    runAction={runReadyAction}
                    runMultiAction={runMultiReadyAction}
                    runRecipe={runRecipe}
                    splitFile={splitCurrent}
                  />
                </div>
                {busy === "plan" && (
                  <div className="ai-thinking">
                    <i />
                    <i />
                    <i /> İşlem hazırlanıyor
                  </div>
                )}
                {busy === "execute" && (
                  <Progress value={progress} message={progressMessage} />
                )}{" "}
                {error && <div className="studio-error">! {error}</div>}
              </div>
              {result && (
                <div className="result-dock">
                  <div className="result-card">
                    <span>✓</span>
                    <div>
                      <b>
                        {appliedToCurrent
                          ? "Çalışma kopyası güncellendi"
                          : "Sonuç önizlemesi hazır"}
                      </b>
                      <p>
                        {appliedToCurrent
                          ? `${workflowByFile[active.fileId]?.length ?? 0} işlem çalışma kopyasında birikti. Sonraki işlemler bu sonuçtan devam edecek.`
                          : "İşlem sonucu tabloda gösteriliyor. Çalışma kopyasına uygulayabilir veya iptal edebilirsin."}
                      </p>
                      <div className="result-actions">
                        <button
                          className="cancel-change"
                          disabled={busy === "revert"}
                          onClick={() => revertCurrent()}
                        >
                          {busy === "revert"
                            ? "Geri alınıyor..."
                            : "Değişikliği iptal et"}
                        </button>
                        {!appliedToCurrent && (
                          <button
                            className="secondary"
                            disabled={busy === "apply"}
                            onClick={() => applyToCurrent()}
                          >
                            {busy === "apply"
                              ? "Uygulanıyor..."
                              : "Excel'e uygula"}
                          </button>
                        )}
                        {appliedToCurrent && (
                          <button
                            className="secondary save-recipe"
                            onClick={saveWorkflow}
                          >
                            İşlem zincirini kaydet
                          </button>
                        )}
                        {appliedToCurrent && (
                          <button
                            className="download-workbook"
                            onClick={() => downloadCurrent()}
                          >
                            Tüm işlemleri içeren Excel'i indir ↓
                          </button>
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

function Sidebar({
  view,
  setView,
  files,
  active,
  historyCount,
  collapsed,
  toggle,
  selectFile,
  addFile,
}: {
  view: View;
  setView: (view: View) => void;
  files: Upload[];
  active: Upload | null;
  historyCount: number;
  collapsed: boolean;
  toggle: () => void;
  selectFile: (id: string) => void;
  addFile: () => void;
}) {
  const items: { id: View; icon: string; label: string; count?: number }[] = [
    { id: "workspace", icon: "▦", label: "Çalışma alanı" },
    { id: "files", icon: "♧", label: "Dosyalarım", count: files.length },
    { id: "history", icon: "↻", label: "İşlem geçmişi", count: historyCount },
    { id: "actions", icon: "☆", label: "Hazır işlemler" },
  ];
  const menu = items.map((item) => ({
    ...item,
    count: item.id === "files" ? files.length : item.count,
  }));
  return (
    <>
      <aside className="tool-rail">
        <Link href="/" className="rail-brand" title="Sheetly">
          <span className="mark">
            <i />
            <i />
            <i />
          </span>
        </Link>
        <nav>
          {menu.map((item) => (
            <button
              title={item.label}
              key={item.id}
              className={view === item.id ? "selected" : ""}
              onClick={() => {
                setView(item.id);
                if (collapsed) toggle();
              }}
            >
              <strong>{item.icon}</strong>
              <span>{item.label}</span>
              {item.count !== undefined && item.count > 0 && (
                <em>{item.count}</em>
              )}
            </button>
          ))}
        </nav>
        <div className="rail-bottom">
          <button
            className="rail-toggle"
            title={collapsed ? "İçerik panelini aç" : "İçerik panelini kapat"}
            onClick={toggle}
          >
            {collapsed ? "›" : "‹"}
          </button>
          <span className="rail-avatar">EA</span>
        </div>
      </aside>
      <aside className={`asset-drawer ${collapsed ? "is-closed" : ""}`}>
        <header>
          <div>
            <small>ÇALIŞMA ALANI</small>
            <b>Proje içeriği</b>
          </div>
          <button aria-label="İçerik panelini kapat" onClick={toggle}>
            ×
          </button>
        </header>
        <button className="drawer-upload" onClick={addFile}>
          <span>＋</span>
          <div>
            <b>Dosya yükle</b>
            <small>Excel veya CSV ekle</small>
          </div>
        </button>
        <div className="drawer-scroll">
          <div className="side-section-title">
            <span>DOSYALAR</span>
            <em>{files.length}</em>
          </div>
          <div className="side-file-list">
            {files.map((file) => (
              <button
                className={`side-file ${file.fileId === active?.fileId ? "active" : ""}`}
                key={file.fileId}
                onClick={() => selectFile(file.fileId)}
              >
                <span className="xls">X</span>
                <div>
                  <b>{file.preview.fileName}</b>
                  <small>
                    {file.preview.totalRows.toLocaleString("tr-TR")} satır ·{" "}
                    {file.preview.columns.length} kolon
                  </small>
                </div>
              </button>
            ))}
          </div>
          {!files.length && (
            <div className="drawer-empty">
              <span>⇧</span>
              <b>Henüz dosya yok</b>
              <small>Çalışmaya başlamak için bir Excel yükle.</small>
            </div>
          )}
          {active && (
            <>
              <div className="side-section-title sheet-title">
                <span>SAYFALAR</span>
                <em>1</em>
              </div>
              <button className="side-sheet active">
                <i />
                <span>{active.preview.sheetName}</span>
                <em>{active.preview.totalRows}</em>
              </button>
            </>
          )}
        </div>
        <footer>
          <div className="workspace-user">
            <span>EA</span>
            <div>
              <b>Workspace</b>
              <small>Yerel ücretsiz plan</small>
            </div>
          </div>
        </footer>
      </aside>
    </>
  );
}

function EmptyWorkspace({
  busy,
  error,
  open,
  drop,
  useAction,
}: {
  busy: boolean;
  error: string;
  open: () => void;
  drop: (files: FileList) => void;
  useAction: (text: string) => void;
}) {
  return (
    <>
      <div className="workspace-card">
        <div className="ws-head">
          <div>
            <span className="ws-icon">✦</span>
            <h2>Bir veya birden fazla dosya yükle.</h2>
            <p>
              Excel ve CSV dosyalarını birlikte seçebilir, ardından her dosyada
              ayrı işlem yapabilirsin.
            </p>
          </div>
          <span className="status">
            <i /> Yerel motor hazır
          </span>
        </div>
        <div
          className="drop"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void drop(event.dataTransfer.files);
          }}
          onClick={open}
        >
          <div className="upload-icon">⇧</div>
          <b>{busy ? "Dosyalar okunuyor..." : "Dosyalarını buraya sürükle"}</b>
          <p>
            veya bilgisayarından <u>birden fazla dosya seç</u>
          </p>
          <small>XLSX veya CSV · Dosya başına en fazla 25 MB</small>
        </div>
      </div>
      {error && <div className="global-error">{error}</div>}
      <QuickActions onSelect={useAction} />
    </>
  );
}
function DataTable({
  preview,
  original,
  result,
  change,
}: {
  preview: Preview;
  original: Preview;
  result?: Preview;
  change?: Step;
}) {
  const text = (value = "") => value.toLocaleLowerCase("tr-TR");
  const targetColumn = change?.column
    ? original.columns.findIndex(
        (column) => text(column) === text(change.column),
      )
    : -1;
  const rowKey = (row: string[], columns = original.columns) =>
    columns
      .map((_, index) => row[index] ?? "")
      .join("\u001f")
      .toLocaleLowerCase("tr-TR");
  const matches = (row: string[]) => {
    if (targetColumn < 0) return false;
    const cell = row[targetColumn] ?? "";
    const value = change?.value ?? "";
    if (change?.operator === "Equals") return text(cell) === text(value);
    if (change?.operator === "IsBlank") return !cell.trim();
    if (change?.operator === "IsNotBlank") return !!cell.trim();
    if (change?.operator === "GreaterThan")
      return Number(cell.replace(",", ".")) > Number(value.replace(",", "."));
    if (change?.operator === "LessThan")
      return Number(cell.replace(",", ".")) < Number(value.replace(",", "."));
    return text(cell).includes(text(value));
  };
  const duplicateRows = new Set<number>();
  if (change?.kind === "RemoveDuplicates") {
    const seen = new Set<string>();
    original.rows.forEach((row, index) => {
      const key =
        targetColumn >= 0 ? text(row[targetColumn] ?? "") : rowKey(row);
      if (seen.has(key)) duplicateRows.add(index);
      else seen.add(key);
    });
  }
  const originalPositions = new Map<string, number[]>();
  if (change?.kind === "Sort")
    original.rows.forEach((row, index) => {
      const key = rowKey(row);
      originalPositions.set(key, [
        ...(originalPositions.get(key) ?? []),
        index,
      ]);
    });
  return (
    <div className="data-table">
      <table>
        <thead>
          <tr>
            <th>#</th>
            {preview.columns.map((column, columnIndex) => {
              const deleteColumn =
                change?.kind === "DeleteColumn" &&
                text(column) === text(change.column);
              const renamedColumn =
                change?.kind === "RenameColumn" &&
                text(column) === text(change.newName);
              const addedColumn =
                change?.kind === "AddCalculatedColumn" &&
                text(column) === text(change.newName);
              return (
                <th
                  key={column}
                  className={
                    deleteColumn
                      ? "column-delete"
                      : renamedColumn || addedColumn
                        ? "column-change"
                        : ""
                  }
                >
                  {column}
                  {deleteColumn && (
                    <small className="change-label danger">Silinecek</small>
                  )}
                  {renamedColumn && (
                    <small className="change-label">Yeni ad</small>
                  )}
                  {addedColumn && (
                    <small className="change-label">Yeni kolon</small>
                  )}
                  <span>↕</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((row, rowIndex) => {
            const deleteRow = change?.kind === "DeleteRows" && matches(row);
            const filteredOut = change?.kind === "Filter" && !matches(row);
            const duplicate =
              change?.kind === "RemoveDuplicates" &&
              duplicateRows.has(rowIndex);
            const highlighted =
              change?.kind === "HighlightRows" && matches(row);
            const persistedFill = preview.rowFills?.[String(rowIndex)];
            const oldPosition =
              change?.kind === "Sort"
                ? originalPositions.get(rowKey(row))?.shift()
                : undefined;
            const moved = oldPosition !== undefined && oldPosition !== rowIndex;
            const rowClass = deleteRow
              ? "row-delete"
              : filteredOut
                ? "row-filtered"
                : duplicate
                  ? "row-duplicate"
                  : moved
                    ? "row-moved"
                    : highlighted
                      ? "row-highlighted"
                      : persistedFill
                        ? "row-persisted-fill"
                        : "";
            const badge = deleteRow
              ? "Silinecek"
              : filteredOut
                ? "Filtre dışı"
                : duplicate
                  ? "Mükerrer"
                  : moved
                    ? `${oldPosition! + 1}→${rowIndex + 1}`
                    : highlighted
                      ? "Boyanacak"
                      : "";
            const rowBackground = highlighted
              ? (change?.color ?? "#FEF08A")
              : persistedFill;
            return (
              <tr
                key={rowIndex}
                className={rowClass}
                style={
                  rowBackground ? { backgroundColor: rowBackground } : undefined
                }
              >
                <td>
                  {rowIndex + 1}
                  {badge && <small className="row-change-badge">{badge}</small>}
                </td>
                {preview.columns.map((column, columnIndex) => {
                  const deleteCell =
                    change?.kind === "DeleteColumn" &&
                    text(column) === text(change.column);
                  const originalColumnIndex = original.columns.findIndex(
                    (item) => text(item) === text(column),
                  );
                  const filledCell =
                    change?.kind === "FillBlanks" &&
                    originalColumnIndex >= 0 &&
                    !(
                      original.rows[rowIndex]?.[originalColumnIndex] ?? ""
                    ).trim() &&
                    !!(row[columnIndex] ?? "").trim();
                  const renamedCell =
                    change?.kind === "RenameColumn" &&
                    text(column) === text(change.newName);
                  const addedCell =
                    change?.kind === "AddCalculatedColumn" &&
                    text(column) === text(change.newName);
                  return (
                    <td
                      key={columnIndex}
                      className={
                        deleteCell
                          ? "cell-delete"
                          : filledCell || renamedCell || addedCell
                            ? "cell-change"
                            : ""
                      }
                    >
                      {row[columnIndex] ?? ""}
                      {filledCell && (
                        <small className="cell-note">Dolduruldu</small>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {change && result && (
        <div className="change-summary">
          <span>●</span>
          <b>İşlem önizlemesi</b>
          <small>
            {change.kind === "DeleteRows"
              ? `${original.totalRows - result.totalRows} satır silinecek`
              : change.kind === "Filter"
                ? `${original.totalRows - result.totalRows} satır filtre dışında kalacak`
                : change.kind === "DeleteColumn"
                  ? `“${change.column}” kolonu silinecek`
                  : change.kind === "RenameColumn"
                    ? `“${change.column}” → “${change.newName}”`
                    : change.kind === "HighlightRows"
                      ? "Eşleşen satırlar seçilen renkle boyanacak"
                      : change.kind === "Sort"
                        ? "Satırların yeni konumları gösteriliyor"
                        : "Değişecek alanlar tabloda işaretlendi"}
          </small>
        </div>
      )}
    </div>
  );
}
function QuickActions({ onSelect }: { onSelect: (text: string) => void }) {
  return (
    <div className="quick">
      <div className="quick-title">
        <div>
          <h3>Genel hazır işlemler</h3>
          <p>
            Bir dosya yükledikten sonra kolon ve koşul bilgilerini seçebilirsin.
          </p>
        </div>
      </div>
      <div className="quick-grid">
        {readyActions.slice(0, 4).map((action) => (
          <button key={action.id} onClick={() => onSelect("")}>
            <span>{action.icon}</span>
            <b>{action.title}</b>
            <i>→</i>
          </button>
        ))}
      </div>
    </div>
  );
}
function FilesView({
  files,
  selectFile,
  removeFile,
  add,
}: {
  files: Upload[];
  selectFile: (id: string) => void;
  removeFile: (id: string) => void;
  add: () => void;
}) {
  return (
    <div className="management">
      <div className="management-head">
        <div>
          <h2>Dosyalarım</h2>
          <p>Bu oturumda yüklediğin Excel ve CSV dosyaları.</p>
        </div>
        <button onClick={add}>＋ Dosya yükle</button>
      </div>
      {files.length ? (
        <div className="file-library">
          {files.map((file) => (
            <article key={file.fileId}>
              <span className="xls">X</span>
              <div>
                <b>{file.preview.fileName}</b>
                <small>
                  {file.preview.totalRows.toLocaleString("tr-TR")} satır ·{" "}
                  {file.preview.columns.length} kolon · {file.preview.sheetName}
                </small>
              </div>
              <button onClick={() => selectFile(file.fileId)}>Aç →</button>
              <button
                className="remove"
                onClick={() => removeFile(file.fileId)}
              >
                Kaldır
              </button>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="♧"
          title="Henüz dosya yüklemedin"
          action="İlk dosyanı yükle"
          onClick={add}
        />
      )}
    </div>
  );
}
function HistoryView({
  history,
  download,
}: {
  history: HistoryItem[];
  download: (id: string) => void;
}) {
  return (
    <div className="management">
      <div className="management-head">
        <div>
          <h2>İşlem geçmişi</h2>
          <p>Bu oturumda tamamlanan Excel işlemleri.</p>
        </div>
      </div>
      {history.length ? (
        <div className="history-list">
          {history.map((item) => (
            <article key={item.id}>
              <span>✓</span>
              <div>
                <b>{item.fileName}</b>
                <p>{item.summary}</p>
                <small>
                  {item.time} · {item.rows.toLocaleString("tr-TR")} sonuç satırı
                </small>
              </div>
              <button onClick={() => download(item.id)}>İndir ↓</button>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon="↻" title="Henüz tamamlanan işlem yok" />
      )}
    </div>
  );
}
function ActionsView({
  columns,
  files,
  activeId,
  recipes,
  hasFile,
  runAction,
  runMultiAction,
  runRecipe,
  splitFile,
}: {
  columns: string[];
  files: Upload[];
  activeId?: string;
  recipes: Recipe[];
  hasFile: boolean;
  runAction: (step: Step, summary: string) => void;
  runMultiAction: (request: MultiFileRequest, summary: string) => void;
  runRecipe: (recipe: Recipe) => void;
  splitFile: (column: string) => void;
}) {
  const [category, setCategory] = useState<ActionCategory>("Satırlar");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(readyActions[0].id);
  const [column, setColumn] = useState(columns[0] ?? "");
  const [secondColumn, setSecondColumn] = useState(
    columns[1] ?? columns[0] ?? "",
  );
  const [value, setValue] = useState("");
  const [replacement, setReplacement] = useState("");
  const [newName, setNewName] = useState("");
  const [separator, setSeparator] = useState(" ");
  const [direction, setDirection] = useState("asc");
  const [color, setColor] = useState("sarı");
  const [operator, setOperator] = useState("Contains");
  const [mode, setMode] = useState("trim");
  const [aggregate, setAggregate] = useState("count");
  const [otherFileId, setOtherFileId] = useState("");
  const [otherColumn, setOtherColumn] = useState("");
  const [fuzzy, setFuzzy] = useState(false);
  const [recipeId, setRecipeId] = useState("");
  const [rowValues, setRowValues] = useState<Record<string, string>>({});

  const otherFiles = files.filter((file) => file.fileId !== activeId);
  const otherFile =
    otherFiles.find((file) => file.fileId === otherFileId) ?? otherFiles[0];
  const otherColumns = otherFile?.preview.columns ?? [];
  const action =
    readyActions.find((item) => item.id === selected) ?? readyActions[0];
  const visibleActions = readyActions.filter((item) => {
    const matchesQuery =
      !query.trim() ||
      `${item.title} ${item.description}`
        .toLocaleLowerCase("tr-TR")
        .includes(query.toLocaleLowerCase("tr-TR"));
    return matchesQuery && (query.trim() ? true : item.category === category);
  });

  useEffect(() => {
    setColumn((current) =>
      columns.includes(current) ? current : (columns[0] ?? ""),
    );
  }, [columns]);
  useEffect(() => {
    setSecondColumn((current) =>
      columns.includes(current) ? current : (columns[1] ?? columns[0] ?? ""),
    );
  }, [columns]);
  useEffect(() => {
    setOtherFileId((current) =>
      otherFiles.some((file) => file.fileId === current)
        ? current
        : (otherFiles[0]?.fileId ?? ""),
    );
  }, [files, activeId]);
  useEffect(() => {
    setOtherColumn((current) =>
      otherColumns.includes(current) ? current : (otherColumns[0] ?? ""),
    );
  }, [otherFileId, otherFile?.fileId]);
  useEffect(() => {
    setRecipeId((current) =>
      recipes.some((recipe) => recipe.id === current)
        ? current
        : (recipes[0]?.id ?? ""),
    );
  }, [recipes]);
  useEffect(() => {
    setRowValues((current) =>
      Object.fromEntries(columns.map((item) => [item, current[item] ?? ""])),
    );
  }, [columns]);

  function chooseAction(item: ReadyAction) {
    setSelected(item.id);
    setValue("");
    setReplacement("");
    setNewName("");
    setSeparator(" ");
    setOperator("Contains");
    setAggregate("count");
    setFuzzy(false);
    if (item.id === "addRow")
      setRowValues(
        Object.fromEntries(columns.map((columnName) => [columnName, ""])),
      );
    const defaults: Record<string, string> = {
      duplicate: "first",
      clean: "trim",
      case: "upper",
      extractText: "before",
      extractDate: "year",
      validate: "required",
      calculate: "+",
    };
    setMode(defaults[item.id] ?? "trim");
  }

  function buildCommand() {
    if (!activeId) return;
    const safeColumn = column || columns[0] || "ilgili";
    const conditionValue = ["IsBlank", "IsNotBlank"].includes(operator)
      ? ""
      : value;
    const colors: Record<string, string> = {
      sarı: "#FEF08A",
      kırmızı: "#FECACA",
      yeşil: "#BBF7D0",
      mavi: "#BFDBFE",
      turuncu: "#FED7AA",
    };
    let step: Step | null = null;
    let summary = action.title;

    switch (selected) {
      case "delete":
        step = {
          kind: "DeleteRows",
          column: safeColumn,
          operator,
          value: conditionValue,
        };
        summary = `${safeColumn} kolonunda koşula uyan satırları sil`;
        break;
      case "highlight":
        step = {
          kind: "HighlightRows",
          column: safeColumn,
          operator,
          value: conditionValue,
          color: colors[color],
        };
        summary = `${safeColumn} kolonunda koşula uyan satırları ${color} boya`;
        break;
      case "filter":
        step = {
          kind: "Filter",
          column: safeColumn,
          operator,
          value: conditionValue,
        };
        summary = `${safeColumn} kolonunda koşula uyan satırları filtrele`;
        break;
      case "sortText":
      case "sortNumber":
        step = {
          kind: "Sort",
          column: safeColumn,
          descending: direction === "desc",
        };
        summary = `${safeColumn} kolonunu ${direction === "asc" ? "artan" : "azalan"} sırala`;
        break;
      case "duplicate":
        step = {
          kind: "RemoveDuplicates",
          column: column || undefined,
          mode,
          secondColumn: mode === "highest" ? secondColumn : undefined,
        };
        summary = `${column || "Tüm kolonlar"} için mükerrerleri kaldır`;
        break;
      case "fill":
        step = {
          kind: "FillBlanks",
          column: column || undefined,
          value: value || "0",
        };
        summary = `${column || "Tüm kolonlar"} boşluklarını doldur`;
        break;
      case "validate":
        step = { kind: "ValidateData", column: safeColumn, mode };
        summary = `${safeColumn} kolonundaki hatalı verileri raporla`;
        break;
      case "addRow":
        step = { kind: "AddRow", values: rowValues };
        summary = "Çalışma kopyasına yeni satır ekle";
        break;
      case "editRow":
        step = {
          kind: "UpdateRows",
          column: safeColumn,
          operator: "Equals",
          value,
          secondColumn,
          replacement,
        };
        summary = `${safeColumn} değeri "${value}" olan satırda ${secondColumn} alanını düzenle`;
        break;
      case "replace":
        step = {
          kind: "FindReplace",
          column: column || undefined,
          value,
          replacement,
        };
        summary = `"${value}" değerini "${replacement}" ile değiştir`;
        break;
      case "clean":
        step = { kind: "CleanText", column: column || undefined, mode };
        summary = `${column || "Tüm kolonlar"} metinlerini temizle`;
        break;
      case "case":
        step = { kind: "ChangeCase", column: column || undefined, mode };
        summary = `${column || "Tüm kolonlar"} harf düzenini değiştir`;
        break;
      case "split":
        step = {
          kind: "SplitColumn",
          column: safeColumn,
          separator,
          newName: newName || `${safeColumn} 1`,
          replacement: replacement || `${safeColumn} 2`,
        };
        summary = `${safeColumn} kolonunu iki kolona böl`;
        break;
      case "merge":
        step = {
          kind: "MergeColumns",
          column: safeColumn,
          secondColumn,
          separator,
          newName: newName || "Birleştirilen",
        };
        summary = `${safeColumn} ve ${secondColumn} kolonlarını birleştir`;
        break;
      case "extractText":
        step = {
          kind: "ExtractText",
          column: safeColumn,
          mode,
          value,
          length: ["left", "right"].includes(mode) ? Number(value) : undefined,
          newName: newName || "Çıkarılan Metin",
        };
        summary = `${safeColumn} kolonundan metin parçası çıkar`;
        break;
      case "extractDate":
        step = {
          kind: "ExtractDatePart",
          column: safeColumn,
          mode,
          newName: newName || "Tarih Bilgisi",
        };
        summary = `${safeColumn} tarihinden ${mode} bilgisini çıkar`;
        break;
      case "deleteColumn":
        step = { kind: "DeleteColumn", column: safeColumn };
        summary = `${safeColumn} kolonunu sil`;
        break;
      case "renameColumn":
        step = { kind: "RenameColumn", column: safeColumn, newName };
        summary = `${safeColumn} kolonunu "${newName}" olarak yeniden adlandır`;
        break;
      case "constant":
        step = {
          kind: "AddConstantColumn",
          newName: newName || "Yeni Kolon",
          value,
        };
        summary = `${newName || "Yeni Kolon"} sabit kolonunu ekle`;
        break;
      case "rowNumber":
        step = { kind: "AddRowNumbers", newName: newName || "Sıra No" };
        summary = "Satırlara sıra numarası ekle";
        break;
      case "calculate":
        step = {
          kind: "AddCalculatedColumn",
          column: safeColumn,
          secondColumn,
          formulaOperator: mode || "+",
          newName: newName || "Hesaplanan",
        };
        summary = `${safeColumn} ve ${secondColumn} ile hesaplanan kolon ekle`;
        break;
      case "group":
        step = {
          kind: "GroupSummary",
          column: safeColumn,
          secondColumn: aggregate === "count" ? undefined : secondColumn,
          aggregate,
        };
        summary = `${safeColumn} kolonuna göre ${aggregate} özeti oluştur`;
        break;
      case "splitFiles":
        splitFile(safeColumn);
        return;
      case "recipe": {
        const recipe =
          recipes.find((item) => item.id === recipeId) ?? recipes[0];
        if (recipe) runRecipe(recipe);
        return;
      }
      case "append":
        runMultiAction(
          {
            kind: "AppendFiles",
            fileIds: [activeId, ...otherFiles.map((file) => file.fileId)],
          },
          "Yüklü Excel dosyalarını alt alta birleştir",
        );
        return;
      case "compare":
      case "join":
      case "fullJoin":
      case "missing": {
        if (!otherFile) return;
        const kind =
          selected === "compare"
            ? "CompareFiles"
            : selected === "join"
              ? "JoinFiles"
              : selected === "fullJoin"
                ? "FullJoinFiles"
                : "FindMissing";
        runMultiAction(
          {
            kind,
            fileIds: [activeId, otherFile.fileId],
            keyColumn: safeColumn,
            otherKeyColumn: otherColumn,
            fuzzy,
            similarityThreshold: 0.8,
          },
          action.title,
        );
        return;
      }
    }
    if (step) runAction(step, summary);
  }

  const conditional = ["delete", "highlight", "filter"].includes(selected);
  const conditionNeedsValue =
    conditional && !["IsBlank", "IsNotBlank"].includes(operator);
  const needsColumn = ![
    "constant",
    "rowNumber",
    "append",
    "recipe",
    "addRow",
  ].includes(selected);
  const needsOtherFile = ["compare", "join", "fullJoin", "missing"].includes(
    selected,
  );
  const canRun =
    hasFile &&
    (!needsColumn || !!column) &&
    (!conditionNeedsValue || !!value.trim()) &&
    (selected !== "replace" || !!value) &&
    (selected !== "renameColumn" || !!newName.trim()) &&
    (selected !== "addRow" ||
      Object.values(rowValues).some((item) => item.trim())) &&
    (selected !== "editRow" || (!!value.trim() && !!secondColumn)) &&
    (!["merge", "calculate"].includes(selected) || !!secondColumn) &&
    (!needsOtherFile || (!!otherFile && !!otherColumn)) &&
    (selected !== "append" || files.length > 1) &&
    (selected !== "recipe" || recipes.length > 0);

  return (
    <div className="management action-management">
      <div className="management-head">
        <div>
          <h2>Hazır işlemler</h2>
          <p>
            Temizleme, karşılaştırma, birleştirme ve raporlama işlemlerini kod
            yazmadan uygula.
          </p>
        </div>
      </div>
      <div className="action-catalog">
        <div className="action-tabs">
          {actionCategories.map((item) => (
            <button
              key={item}
              className={category === item && !query ? "active" : ""}
              onClick={() => {
                setCategory(item);
                setQuery("");
                const first = readyActions.find(
                  (actionItem) => actionItem.category === item,
                );
                if (first) chooseAction(first);
              }}
            >
              {item}
            </button>
          ))}
        </div>
        <label className="action-search">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="İşlem ara..."
          />
        </label>
      </div>
      <div className="action-builder">
        <div className="action-picker">
          {visibleActions.map((item) => (
            <button
              key={item.id}
              className={selected === item.id ? "active" : ""}
              onClick={() => chooseAction(item)}
            >
              <span>{item.icon}</span>
              <div>
                <b>{item.title}</b>
                <small>{item.description}</small>
              </div>
            </button>
          ))}
        </div>
        <section className="action-form">
          <span className="form-icon">{action.icon}</span>
          <h3>{action.title}</h3>
          <p>{action.description}</p>
          {!hasFile && (
            <div className="form-warning">
              Önce çalışma alanından bir Excel veya CSV dosyası yüklemelisin.
            </div>
          )}
          {needsColumn && (
            <label>
              {needsOtherFile
                ? "İlk dosyadaki anahtar kolon"
                : selected === "group"
                  ? "Gruplanacak kolon"
                  : selected === "editRow"
                    ? "Satırı bulmak için anahtar kolon"
                    : "İşlem yapılacak kolon"}
              <select
                value={column}
                onChange={(event) => setColumn(event.target.value)}
              >
                {["fill", "duplicate", "replace", "clean", "case"].includes(
                  selected,
                ) && <option value="">Tüm kolonlar</option>}
                {columns.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          )}
          {conditional && (
            <>
              <label>
                Koşul
                <select
                  value={operator}
                  onChange={(event) => setOperator(event.target.value)}
                >
                  <option value="Contains">İçerir</option>
                  <option value="NotContains">İçermez</option>
                  <option value="Equals">Eşittir</option>
                  <option value="NotEquals">Eşit değildir</option>
                  <option value="StartsWith">İle başlar</option>
                  <option value="EndsWith">İle biter</option>
                  <option value="GreaterThan">Büyüktür</option>
                  <option value="GreaterThanOrEqual">Büyük veya eşittir</option>
                  <option value="LessThan">Küçüktür</option>
                  <option value="LessThanOrEqual">Küçük veya eşittir</option>
                  <option value="IsBlank">Boştur</option>
                  <option value="IsNotBlank">Boş değildir</option>
                </select>
              </label>
              {conditionNeedsValue && (
                <Field
                  label="Aranacak değer"
                  value={value}
                  setValue={setValue}
                  placeholder="Örn: iptal veya 1000"
                />
              )}
            </>
          )}
          {selected === "highlight" && (
            <label>
              Vurgu rengi
              <select
                value={color}
                onChange={(event) => setColor(event.target.value)}
              >
                <option>sarı</option>
                <option>kırmızı</option>
                <option>yeşil</option>
                <option>mavi</option>
                <option>turuncu</option>
              </select>
            </label>
          )}
          {["sortText", "sortNumber"].includes(selected) && (
            <label>
              Sıralama yönü
              <select
                value={direction}
                onChange={(event) => setDirection(event.target.value)}
              >
                <option value="asc">Artan</option>
                <option value="desc">Azalan</option>
              </select>
            </label>
          )}
          {selected === "duplicate" && (
            <>
              <label>
                Korunacak kayıt
                <select
                  value={mode}
                  onChange={(event) => setMode(event.target.value)}
                >
                  <option value="first">İlk kayıt</option>
                  <option value="last">Son kayıt</option>
                  <option value="highest">En yüksek değerli kayıt</option>
                </select>
              </label>
              {mode === "highest" && (
                <ColumnField
                  label="Değer kolonu"
                  value={secondColumn}
                  setValue={setSecondColumn}
                  columns={columns}
                />
              )}
            </>
          )}
          {selected === "fill" && (
            <Field
              label="Boş hücrelere yazılacak değer"
              value={value}
              setValue={setValue}
              placeholder="Örn: 0 veya Bilinmiyor"
            />
          )}
          {selected === "validate" && (
            <label>
              Kontrol kuralı
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value)}
              >
                <option value="required">Boş olamaz</option>
                <option value="email">Geçerli e-posta</option>
                <option value="phone">Geçerli telefon</option>
                <option value="number">Sayısal değer</option>
                <option value="date">Geçerli tarih</option>
              </select>
            </label>
          )}
          {selected === "addRow" && (
            <div className="row-editor-fields">
              {columns.map((item) => (
                <Field
                  key={item}
                  label={item}
                  value={rowValues[item] ?? ""}
                  setValue={(next) =>
                    setRowValues((current) => ({ ...current, [item]: next }))
                  }
                  placeholder={`${item} değeri`}
                />
              ))}
            </div>
          )}
          {selected === "editRow" && (
            <>
              <Field
                label="Satırı bulacak değer"
                value={value}
                setValue={setValue}
                placeholder="Örn: Ahmet Yılmaz veya P-1024"
              />
              <ColumnField
                label="Düzenlenecek kolon"
                value={secondColumn}
                setValue={setSecondColumn}
                columns={columns}
              />
              <Field
                label="Yeni değer"
                value={replacement}
                setValue={setReplacement}
                placeholder="Yeni hücre değeri"
              />
            </>
          )}
          {selected === "replace" && (
            <>
              <Field
                label="Bul"
                value={value}
                setValue={setValue}
                placeholder="Eski değer"
              />
              <Field
                label="Şununla değiştir"
                value={replacement}
                setValue={setReplacement}
                placeholder="Yeni değer (boş bırakılabilir)"
              />
            </>
          )}
          {selected === "clean" && (
            <label>
              Temizleme türü
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value)}
              >
                <option value="trim">Fazla boşlukları temizle</option>
                <option value="nonprinting">
                  Görünmeyen karakterleri kaldır
                </option>
                <option value="ascii">Aksanları sadeleştir</option>
                <option value="number">Sayı biçimini standartlaştır</option>
              </select>
            </label>
          )}
          {selected === "case" && (
            <label>
              Harf düzeni
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value)}
              >
                <option value="upper">BÜYÜK HARF</option>
                <option value="lower">küçük harf</option>
                <option value="title">Baş Harfler Büyük</option>
              </select>
            </label>
          )}
          {selected === "split" && (
            <>
              <Field
                label="Ayırıcı"
                value={separator}
                setValue={setSeparator}
                placeholder="Örn: boşluk, - veya /"
              />
              <Field
                label="Birinci yeni kolon"
                value={newName}
                setValue={setNewName}
                placeholder="Örn: Ad"
              />
              <Field
                label="İkinci yeni kolon"
                value={replacement}
                setValue={setReplacement}
                placeholder="Örn: Soyad"
              />
            </>
          )}
          {selected === "merge" && (
            <>
              <ColumnField
                label="İkinci kolon"
                value={secondColumn}
                setValue={setSecondColumn}
                columns={columns}
              />
              <Field
                label="Araya yazılacak ayırıcı"
                value={separator}
                setValue={setSeparator}
                placeholder="Örn: boşluk veya -"
              />
              <Field
                label="Yeni kolon adı"
                value={newName}
                setValue={setNewName}
                placeholder="Örn: Ad Soyad"
              />
            </>
          )}
          {selected === "extractText" && (
            <>
              <label>
                Parça türü
                <select
                  value={mode}
                  onChange={(event) => setMode(event.target.value)}
                >
                  <option value="before">İşaretten önce</option>
                  <option value="after">İşaretten sonra</option>
                  <option value="left">Soldan karakter</option>
                  <option value="right">Sağdan karakter</option>
                </select>
              </label>
              <Field
                label={
                  ["left", "right"].includes(mode)
                    ? "Karakter sayısı"
                    : "Ayırıcı işaret"
                }
                value={value}
                setValue={setValue}
                placeholder={
                  ["left", "right"].includes(mode) ? "Örn: 5" : "Örn: - veya /"
                }
              />
              <Field
                label="Yeni kolon adı"
                value={newName}
                setValue={setNewName}
                placeholder="Örn: Ürün Kodu"
              />
            </>
          )}
          {selected === "extractDate" && (
            <>
              <label>
                Çıkarılacak bilgi
                <select
                  value={mode}
                  onChange={(event) => setMode(event.target.value)}
                >
                  <option value="year">Yıl</option>
                  <option value="month">Ay numarası</option>
                  <option value="monthName">Ay adı</option>
                  <option value="day">Gün</option>
                  <option value="weekday">Haftanın günü</option>
                  <option value="quarter">Çeyrek</option>
                </select>
              </label>
              <Field
                label="Yeni kolon adı"
                value={newName}
                setValue={setNewName}
                placeholder="Örn: Sipariş Yılı"
              />
            </>
          )}
          {selected === "renameColumn" && (
            <Field
              label="Yeni kolon adı"
              value={newName}
              setValue={setNewName}
              placeholder="Örn: Sipariş Durumu"
            />
          )}
          {selected === "constant" && (
            <>
              <Field
                label="Yeni kolon adı"
                value={newName}
                setValue={setNewName}
                placeholder="Örn: Şube"
              />
              <Field
                label="Sabit değer"
                value={value}
                setValue={setValue}
                placeholder="Örn: İstanbul"
              />
            </>
          )}
          {selected === "rowNumber" && (
            <Field
              label="Kolon adı"
              value={newName}
              setValue={setNewName}
              placeholder="Sıra No"
            />
          )}
          {selected === "calculate" && (
            <>
              <ColumnField
                label="İkinci kolon"
                value={secondColumn}
                setValue={setSecondColumn}
                columns={columns}
              />
              <label>
                İşlem
                <select
                  value={mode}
                  onChange={(event) => setMode(event.target.value)}
                >
                  <option value="+">Topla</option>
                  <option value="-">Çıkar</option>
                  <option value="*">Çarp</option>
                  <option value="/">Böl</option>
                </select>
              </label>
              <Field
                label="Yeni kolon adı"
                value={newName}
                setValue={setNewName}
                placeholder="Örn: Toplam"
              />
            </>
          )}
          {selected === "group" && (
            <>
              <label>
                Özet türü
                <select
                  value={aggregate}
                  onChange={(event) => setAggregate(event.target.value)}
                >
                  <option value="count">Kayıt adedi</option>
                  <option value="sum">Toplam</option>
                  <option value="average">Ortalama</option>
                  <option value="min">En düşük</option>
                  <option value="max">En yüksek</option>
                </select>
              </label>
              {aggregate !== "count" && (
                <ColumnField
                  label="Hesaplanacak kolon"
                  value={secondColumn}
                  setValue={setSecondColumn}
                  columns={columns}
                />
              )}
            </>
          )}
          {selected === "recipe" && (
            <>
              {recipes.length ? (
                <>
                  <label>
                    Kayıtlı işlem zinciri
                    <select
                      value={recipeId}
                      onChange={(event) => setRecipeId(event.target.value)}
                    >
                      {recipes.map((recipe) => (
                        <option key={recipe.id} value={recipe.id}>
                          {recipe.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="form-info">
                    {(
                      recipes.find((recipe) => recipe.id === recipeId) ??
                      recipes[0]
                    )?.steps.length ?? 0}{" "}
                    adım sırayla bu çalışma kopyasına uygulanacak.
                  </div>
                </>
              ) : (
                <div className="form-info">
                  Önce bir veya daha fazla işlemi Excel'e uygula, ardından sonuç
                  alanındaki “İşlem zincirini kaydet” seçeneğini kullan.
                </div>
              )}
            </>
          )}
          {selected === "append" && (
            <div className="form-info">
              {files.length > 1
                ? `${files.length} yüklü dosya kolonları eşleştirilerek alt alta eklenecek.`
                : "Bu işlem için en az iki dosya yüklemelisin."}
            </div>
          )}
          {needsOtherFile && (
            <>
              <label>
                İkinci Excel dosyası
                <select
                  value={otherFile?.fileId ?? ""}
                  onChange={(event) => setOtherFileId(event.target.value)}
                >
                  {otherFiles.map((file) => (
                    <option key={file.fileId} value={file.fileId}>
                      {file.preview.fileName}
                    </option>
                  ))}
                </select>
              </label>
              <ColumnField
                label="İkinci dosyadaki anahtar kolon"
                value={otherColumn}
                setValue={setOtherColumn}
                columns={otherColumns}
              />
              <label className="toggle-field">
                <input
                  type="checkbox"
                  checked={fuzzy}
                  onChange={(event) => setFuzzy(event.target.checked)}
                />
                <span>Benzer yazımları da eşleştir (%80 benzerlik)</span>
              </label>
              {selected === "join" && (
                <div className="form-info">
                  Aktif Excel’deki çalışanlar korunur. İkinci dosyadaki eksik
                  kolon ve boş bilgiler eşleşen kişilere eklenir; ikinci dosyaya
                  özel çalışanlar eklenmez.
                </div>
              )}
              {selected === "fullJoin" && (
                <div className="form-info">
                  İki Excel’in bütün kolonları birleştirilir. Bir dosyada
                  bulunmayan çalışan yeni satır olarak eklenir; karşılığı
                  olmayan alanlar boş bırakılır.
                </div>
              )}
            </>
          )}
          {selected === "splitFiles" && (
            <div className="form-info">
              Seçilen kolondaki her farklı değer için ayrı Excel oluşturulur ve
              tek ZIP dosyası olarak indirilir.
            </div>
          )}
          <button
            className="create-command"
            disabled={!canRun}
            onClick={buildCommand}
          >
            {selected === "splitFiles"
              ? "Excel'leri oluştur ve ZIP indir ↓"
              : "İşlemi uygula ve sonucu göster →"}
          </button>
        </section>
      </div>
    </div>
  );
}
function Field({
  label,
  value,
  setValue,
  placeholder,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label>
      {label}
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
function ColumnField({
  label,
  value,
  setValue,
  columns,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  columns: string[];
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => setValue(event.target.value)}>
        {columns.map((item) => (
          <option key={item}>{item}</option>
        ))}
      </select>
    </label>
  );
}
function EmptyState({
  icon,
  title,
  action,
  onClick,
}: {
  icon: string;
  title: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="management-empty">
      <span>{icon}</span>
      <b>{title}</b>
      {action && <button onClick={onClick}>{action}</button>}
    </div>
  );
}
function PlanCard({
  plan,
  onExecute,
  executing,
}: {
  plan: Plan;
  onExecute: () => void;
  executing: boolean;
}) {
  return (
    <div className="plan-card">
      <div className="plan-title">
        <span>✓</span>
        <div>
          <b>İşlem planı hazır</b>
          <small>
            {plan.originalRows.toLocaleString("tr-TR")} →{" "}
            {plan.estimatedRows.toLocaleString("tr-TR")} satır
          </small>
        </div>
      </div>
      <p>{plan.plan.summary}</p>
      <ol>
        {plan.plan.steps.map((step, i) => (
          <li key={i}>
            <i>{i + 1}</i>
            <div>
              <b>{stepNames[step.kind] ?? step.kind}</b>
              <small>
                {[step.column, step.operator, step.value, step.newName]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </div>
          </li>
        ))}
      </ol>
      <div className="safe-note">◇ Orijinal dosyan değiştirilmeyecek</div>
      <div className="plan-buttons">
        <button onClick={() => {}}>Planı kontrol et</button>
        <button className="apply" onClick={onExecute} disabled={executing}>
          {executing ? "Uygulanıyor..." : "Onayla ve uygula →"}
        </button>
      </div>
    </div>
  );
}
function Progress({ value, message }: { value: number; message: string }) {
  return (
    <div className="job-progress">
      <div>
        <b>{message}</b>
        <span>%{value}</span>
      </div>
      <i>
        <em style={{ width: `${value}%` }} />
      </i>
    </div>
  );
}
