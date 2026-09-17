"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Upload, View } from "../types";

/** Sol rail + asset drawer: navigasyon, profil popup ve dosya listesi */
export function Sidebar({
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
  const [profileOpen, setProfileOpen] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("sheetly_user");
      if (raw) setUser(JSON.parse(raw) as { name: string; email: string });
    } catch { }
  }, []);

  function getInitials(name: string) {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");
  }

  function logout() {
    localStorage.removeItem("sheetly_session");
    localStorage.removeItem("sheetly_user");
    window.location.href = "/login";
  }

  const initials = user ? getInitials(user.name) : "?";
  const displayName = user?.name ?? "Kullanıcı";

  const navItems: { id: View; icon: string; label: string; count?: number }[] = [
    { id: "workspace", icon: "▦", label: "Çalışma alanı" },
    { id: "files", icon: "♧", label: "Dosyalarım", count: files.length },
    { id: "history", icon: "↻", label: "İşlem geçmişi", count: historyCount },
    { id: "actions", icon: "☆", label: "Hazır işlemler" },
  ];

  return (
    <>
      {/* Sol dar navigasyon rail */}
      <aside className="tool-rail">
        <Link href="/" className="rail-brand" title="Sheetly">
          <span className="mark">
            <i /><i /><i />
          </span>
        </Link>
        <nav>
          {navItems.map((item) => (
            <button
              key={item.id}
              title={item.label}
              className={view === item.id ? "selected" : ""}
              onClick={() => {
                setView(item.id);
                if (collapsed) toggle();
              }}
            >
              <strong>{item.icon}</strong>
              <span>{item.label}</span>
              {!!item.count && item.count > 0 && <em>{item.count}</em>}
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
          <button
            className="rail-avatar"
            title={displayName}
            onClick={() => setProfileOpen((v) => !v)}
            style={{ border: 0, cursor: "pointer" }}
          >
            {initials}
          </button>
        </div>
      </aside>

      {/* Genişleyen içerik çekmecesi */}
      <aside className={`asset-drawer ${collapsed ? "is-closed" : ""}`}>
        <header>
          <div>
            <small>ÇALIŞMA ALANI</small>
            <b>Proje içeriği</b>
          </div>
          <button aria-label="İçerik panelini kapat" onClick={toggle}>×</button>
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
                key={file.fileId}
                className={`side-file ${file.fileId === active?.fileId ? "active" : ""}`}
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

        {/* Alt profil alanı */}
        <footer style={{ position: "relative" }}>
          {profileOpen && (
            <div className="profile-popup">
              <div className="profile-popup-avatar">{initials}</div>
              <div className="profile-popup-info">
                <b>{displayName}</b>
                {user?.email && <small>{user.email}</small>}
              </div>
              <button className="profile-popup-logout" onClick={logout}>
                ↪ Çıkış yap
              </button>
            </div>
          )}
          <button
            className="workspace-user"
            onClick={() => setProfileOpen((v) => !v)}
            style={{ width: "100%", border: 0, cursor: "pointer", background: "transparent", textAlign: "left", padding: 0 }}
          >
            <span>{initials}</span>
            <div>
              <b>{displayName}</b>
            </div>
          </button>
        </footer>
      </aside>
    </>
  );
}
