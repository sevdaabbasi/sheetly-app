"use client";

import type { Preview, Step } from "../types";

/** Veri tablosu: satır ve kolon bazlı değişiklik gösterimi ile birlikte */
export function DataTable({
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
    ? original.columns.findIndex((col) => text(col) === text(change.column))
    : -1;

  const rowKey = (row: string[], columns = original.columns) =>
    columns.map((_, i) => row[i] ?? "").join("\u001f").toLocaleLowerCase("tr-TR");

  const matches = (row: string[]) => {
    if (targetColumn < 0) return false;
    const cell = row[targetColumn] ?? "";
    const value = change?.value ?? "";
    if (change?.operator === "Equals")        return text(cell) === text(value);
    if (change?.operator === "IsBlank")       return !cell.trim();
    if (change?.operator === "IsNotBlank")    return !!cell.trim();
    if (change?.operator === "GreaterThan")   return Number(cell.replace(",", ".")) > Number(value.replace(",", "."));
    if (change?.operator === "LessThan")      return Number(cell.replace(",", ".")) < Number(value.replace(",", "."));
    return text(cell).includes(text(value));
  };

  // Mükerrer satır hesabı
  const duplicateRows = new Set<number>();
  if (change?.kind === "RemoveDuplicates") {
    const seen = new Set<string>();
    original.rows.forEach((row, index) => {
      const key = targetColumn >= 0 ? text(row[targetColumn] ?? "") : rowKey(row);
      if (seen.has(key)) duplicateRows.add(index);
      else seen.add(key);
    });
  }

  // Sıralama için orijinal pozisyonlar
  const originalPositions = new Map<string, number[]>();
  if (change?.kind === "Sort") {
    original.rows.forEach((row, index) => {
      const key = rowKey(row);
      originalPositions.set(key, [...(originalPositions.get(key) ?? []), index]);
    });
  }

  return (
    <div className="data-table">
      <table>
        <thead>
          <tr>
            <th>#</th>
            {preview.columns.map((col) => {
              const isDeleteCol   = change?.kind === "DeleteColumn"       && text(col) === text(change.column);
              const isRenamedCol  = change?.kind === "RenameColumn"       && text(col) === text(change.newName);
              const isAddedCol    = change?.kind === "AddCalculatedColumn" && text(col) === text(change.newName);
              return (
                <th
                  key={col}
                  className={isDeleteCol ? "column-delete" : isRenamedCol || isAddedCol ? "column-change" : ""}
                >
                  {col}
                  {isDeleteCol  && <small className="change-label danger">Silinecek</small>}
                  {isRenamedCol && <small className="change-label">Yeni ad</small>}
                  {isAddedCol   && <small className="change-label">Yeni kolon</small>}
                  <span>↕</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((row, rowIndex) => {
            const deleteRow    = change?.kind === "DeleteRows"      && matches(row);
            const filteredOut  = change?.kind === "Filter"          && !matches(row);
            const duplicate    = change?.kind === "RemoveDuplicates" && duplicateRows.has(rowIndex);
            const highlighted  = change?.kind === "HighlightRows"   && matches(row);
            const persistedFill = preview.rowFills?.[String(rowIndex)];
            const oldPosition  = change?.kind === "Sort" ? originalPositions.get(rowKey(row))?.shift() : undefined;
            const moved        = oldPosition !== undefined && oldPosition !== rowIndex;

            const rowClass =
              deleteRow    ? "row-delete"
              : filteredOut  ? "row-filtered"
              : duplicate    ? "row-duplicate"
              : moved        ? "row-moved"
              : highlighted  ? "row-highlighted"
              : persistedFill ? "row-persisted-fill"
              : "";

            const badge =
              deleteRow    ? "Silinecek"
              : filteredOut  ? "Filtre dışı"
              : duplicate    ? "Mükerrer"
              : moved        ? `${oldPosition! + 1}→${rowIndex + 1}`
              : highlighted  ? "Boyanacak"
              : "";

            const rowBackground = highlighted ? (change?.color ?? "#FEF08A") : persistedFill;

            return (
              <tr
                key={rowIndex}
                className={rowClass}
                style={rowBackground ? { backgroundColor: rowBackground } : undefined}
              >
                <td>
                  {rowIndex + 1}
                  {badge && <small className="row-change-badge">{badge}</small>}
                </td>
                {preview.columns.map((col, colIndex) => {
                  const originalColIndex = original.columns.findIndex((c) => text(c) === text(col));
                  const deleteCell  = change?.kind === "DeleteColumn"       && text(col) === text(change.column);
                  const filledCell  = change?.kind === "FillBlanks"         && originalColIndex >= 0 && !(original.rows[rowIndex]?.[originalColIndex] ?? "").trim() && !!(row[colIndex] ?? "").trim();
                  const renamedCell = change?.kind === "RenameColumn"       && text(col) === text(change.newName);
                  const addedCell   = change?.kind === "AddCalculatedColumn" && text(col) === text(change.newName);
                  return (
                    <td
                      key={colIndex}
                      className={deleteCell ? "cell-delete" : filledCell || renamedCell || addedCell ? "cell-change" : ""}
                    >
                      {row[colIndex] ?? ""}
                      {filledCell && <small className="cell-note">Dolduruldu</small>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Değişiklik özet satırı */}
      {change && result && (
        <div className="change-summary">
          <span>●</span>
          <b>İşlem önizlemesi</b>
          <small>
            {change.kind === "DeleteRows"    ? `${original.totalRows - result.totalRows} satır silinecek`
            : change.kind === "Filter"       ? `${original.totalRows - result.totalRows} satır filtre dışında kalacak`
            : change.kind === "DeleteColumn" ? `"${change.column}" kolonu silinecek`
            : change.kind === "RenameColumn" ? `"${change.column}" → "${change.newName}"`
            : change.kind === "HighlightRows" ? "Eşleşen satırlar seçilen renkle boyanacak"
            : change.kind === "Sort"         ? "Satırların yeni konumları gösteriliyor"
            : "Değişecek alanlar tabloda işaretlendi"}
          </small>
        </div>
      )}
    </div>
  );
}
