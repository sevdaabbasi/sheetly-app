"use client";

import { QuickActions } from "./shared";
import type { Upload, HistoryItem } from "../types";
import { EmptyState } from "./shared";

/** Dosya yüklemeden önceki boş çalışma alanı ekranı */
export function EmptyWorkspace({
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
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); void drop(e.dataTransfer.files); }}
          onClick={open}
        >
          <div className="upload-icon">⇧</div>
          <b>{busy ? "Dosyalar okunuyor..." : "Dosyalarını buraya sürükle"}</b>
          <p>veya bilgisayarından <u>birden fazla dosya seç</u></p>
          <small>XLSX veya CSV · Dosya başına en fazla 25 MB</small>
        </div>
      </div>
      {error && <div className="global-error">{error}</div>}
      <QuickActions onSelect={useAction} />
    </>
  );
}

/** Yüklenen dosyaların listesi */
export function FilesView({
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
              <button className="remove" onClick={() => removeFile(file.fileId)}>Kaldır</button>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon="♧" title="Henüz dosya yüklemedin" action="İlk dosyanı yükle" onClick={add} />
      )}
    </div>
  );
}

/** İşlem geçmişi görünümü */
export function HistoryView({
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
