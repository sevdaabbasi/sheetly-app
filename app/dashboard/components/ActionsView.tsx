"use client";

import { useEffect, useState } from "react";
import { ACTION_CATEGORIES, READY_ACTIONS } from "../constants";
import type { ActionCategory, MultiFileRequest, ReadyAction, Recipe, Step, Upload } from "../types";
import { ColumnField, Field } from "./shared";

/** Hazır işlemler paneli: kategori seçimi, form ve işlem tetikleme */
export function ActionsView({
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
  const [query,        setQuery]        = useState("");
  const [selected,     setSelected]     = useState(READY_ACTIONS[0].id);
  const [column,       setColumn]       = useState(columns[0] ?? "");
  const [secondColumn, setSecondColumn] = useState(columns[1] ?? columns[0] ?? "");
  const [value,        setValue]        = useState("");
  const [replacement,  setReplacement]  = useState("");
  const [newName,      setNewName]      = useState("");
  const [separator,    setSeparator]    = useState(" ");
  const [direction,    setDirection]    = useState("asc");
  const [color,        setColor]        = useState("sarı");
  const [operator,     setOperator]     = useState("Contains");
  const [mode,         setMode]         = useState("trim");
  const [aggregate,    setAggregate]    = useState("count");
  const [otherFileId,  setOtherFileId]  = useState("");
  const [otherColumn,  setOtherColumn]  = useState("");
  const [fuzzy,        setFuzzy]        = useState(false);
  const [recipeId,     setRecipeId]     = useState("");
  const [rowValues,    setRowValues]    = useState<Record<string, string>>({});

  const otherFiles   = files.filter((f) => f.fileId !== activeId);
  const otherFile    = otherFiles.find((f) => f.fileId === otherFileId) ?? otherFiles[0];
  const otherColumns = otherFile?.preview.columns ?? [];
  const action       = READY_ACTIONS.find((a) => a.id === selected) ?? READY_ACTIONS[0];

  const visibleActions = READY_ACTIONS.filter((item) => {
    const matchesQuery =
      !query.trim() ||
      `${item.title} ${item.description}`.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR"));
    return matchesQuery && (query.trim() ? true : item.category === category);
  });

  // Kolon listesi değişince seçimleri sıfırla
  useEffect(() => { setColumn((c) => columns.includes(c) ? c : (columns[0] ?? "")); }, [columns]);
  useEffect(() => { setSecondColumn((c) => columns.includes(c) ? c : (columns[1] ?? columns[0] ?? "")); }, [columns]);
  useEffect(() => { setOtherFileId((c) => otherFiles.some((f) => f.fileId === c) ? c : (otherFiles[0]?.fileId ?? "")); }, [files, activeId]);
  useEffect(() => { setOtherColumn((c) => otherColumns.includes(c) ? c : (otherColumns[0] ?? "")); }, [otherFileId, otherFile?.fileId]);
  useEffect(() => { setRecipeId((c) => recipes.some((r) => r.id === c) ? c : (recipes[0]?.id ?? "")); }, [recipes]);
  useEffect(() => { setRowValues((c) => Object.fromEntries(columns.map((col) => [col, c[col] ?? ""]))); }, [columns]);

  function chooseAction(item: ReadyAction) {
    setSelected(item.id);
    setValue(""); setReplacement(""); setNewName("");
    setSeparator(" "); setOperator("Contains"); setAggregate("count"); setFuzzy(false);
    if (item.id === "addRow")
      setRowValues(Object.fromEntries(columns.map((col) => [col, ""])));
    const modeDefaults: Record<string, string> = {
      duplicate: "first", clean: "trim", case: "upper",
      extractText: "before", extractDate: "year", validate: "required", calculate: "+",
    };
    setMode(modeDefaults[item.id] ?? "trim");
  }

  function buildCommand() {
    if (!activeId) return;
    const safeColumn    = column || columns[0] || "ilgili";
    const conditionValue = ["IsBlank", "IsNotBlank"].includes(operator) ? "" : value;
    const colorHex: Record<string, string> = {
      sarı: "#FEF08A", kırmızı: "#FECACA", yeşil: "#BBF7D0", mavi: "#BFDBFE", turuncu: "#FED7AA",
    };
    let step: Step | null = null;
    let summary = action.title;

    switch (selected) {
      case "delete":      step = { kind: "DeleteRows",   column: safeColumn, operator, value: conditionValue };           summary = `${safeColumn} kolonunda koşula uyan satırları sil`; break;
      case "highlight":   step = { kind: "HighlightRows", column: safeColumn, operator, value: conditionValue, color: colorHex[color] }; summary = `${safeColumn} kolonunda koşula uyan satırları ${color} boya`; break;
      case "filter":      step = { kind: "Filter",        column: safeColumn, operator, value: conditionValue };           summary = `${safeColumn} kolonunda koşula uyan satırları filtrele`; break;
      case "sortText":
      case "sortNumber":  step = { kind: "Sort",           column: safeColumn, descending: direction === "desc" };         summary = `${safeColumn} kolonunu ${direction === "asc" ? "artan" : "azalan"} sırala`; break;
      case "duplicate":   step = { kind: "RemoveDuplicates", column: column || undefined, mode, secondColumn: mode === "highest" ? secondColumn : undefined }; summary = `${column || "Tüm kolonlar"} için mükerrerleri kaldır`; break;
      case "fill":        step = { kind: "FillBlanks",    column: column || undefined, value: value || "0" };              summary = `${column || "Tüm kolonlar"} boşluklarını doldur`; break;
      case "validate":    step = { kind: "ValidateData",  column: safeColumn, mode };                                      summary = `${safeColumn} kolonundaki hatalı verileri raporla`; break;
      case "addRow":      step = { kind: "AddRow",         values: rowValues };                                             summary = "Çalışma kopyasına yeni satır ekle"; break;
      case "editRow":     step = { kind: "UpdateRows",     column: safeColumn, operator: "Equals", value, secondColumn, replacement }; summary = `${safeColumn} değeri "${value}" olan satırda ${secondColumn} alanını düzenle`; break;
      case "replace":     step = { kind: "FindReplace",   column: column || undefined, value, replacement };               summary = `"${value}" değerini "${replacement}" ile değiştir`; break;
      case "clean":       step = { kind: "CleanText",     column: column || undefined, mode };                             summary = `${column || "Tüm kolonlar"} metinlerini temizle`; break;
      case "case":        step = { kind: "ChangeCase",    column: column || undefined, mode };                             summary = `${column || "Tüm kolonlar"} harf düzenini değiştir`; break;
      case "split":       step = { kind: "SplitColumn",   column: safeColumn, separator, newName: newName || `${safeColumn} 1`, replacement: replacement || `${safeColumn} 2` }; summary = `${safeColumn} kolonunu iki kolona böl`; break;
      case "merge":       step = { kind: "MergeColumns",  column: safeColumn, secondColumn, separator, newName: newName || "Birleştirilen" }; summary = `${safeColumn} ve ${secondColumn} kolonlarını birleştir`; break;
      case "extractText": step = { kind: "ExtractText",   column: safeColumn, mode, value, length: ["left", "right"].includes(mode) ? Number(value) : undefined, newName: newName || "Çıkarılan Metin" }; summary = `${safeColumn} kolonundan metin parçası çıkar`; break;
      case "extractDate": step = { kind: "ExtractDatePart", column: safeColumn, mode, newName: newName || "Tarih Bilgisi" }; summary = `${safeColumn} tarihinden ${mode} bilgisini çıkar`; break;
      case "deleteColumn":  step = { kind: "DeleteColumn",  column: safeColumn };             summary = `${safeColumn} kolonunu sil`; break;
      case "renameColumn":  step = { kind: "RenameColumn",  column: safeColumn, newName };    summary = `${safeColumn} kolonunu "${newName}" olarak yeniden adlandır`; break;
      case "constant":      step = { kind: "AddConstantColumn", newName: newName || "Yeni Kolon", value }; summary = `${newName || "Yeni Kolon"} sabit kolonunu ekle`; break;
      case "rowNumber":     step = { kind: "AddRowNumbers", newName: newName || "Sıra No" };  summary = "Satırlara sıra numarası ekle"; break;
      case "calculate":     step = { kind: "AddCalculatedColumn", column: safeColumn, secondColumn, formulaOperator: mode || "+", newName: newName || "Hesaplanan" }; summary = `${safeColumn} ve ${secondColumn} ile hesaplanan kolon ekle`; break;
      case "group":         step = { kind: "GroupSummary", column: safeColumn, secondColumn: aggregate === "count" ? undefined : secondColumn, aggregate }; summary = `${safeColumn} kolonuna göre ${aggregate} özeti oluştur`; break;
      case "splitFiles":
        splitFile(safeColumn); return;
      case "recipe": {
        const recipe = recipes.find((r) => r.id === recipeId) ?? recipes[0];
        if (recipe) runRecipe(recipe);
        return;
      }
      case "append":
        runMultiAction({ kind: "AppendFiles", fileIds: [activeId, ...otherFiles.map((f) => f.fileId)] }, "Yüklü Excel dosyalarını alt alta birleştir");
        return;
      case "compare": case "join": case "fullJoin": case "missing": {
        if (!otherFile) return;
        const kindMap: Record<string, string> = { compare: "CompareFiles", join: "JoinFiles", fullJoin: "FullJoinFiles", missing: "FindMissing" };
        runMultiAction({ kind: kindMap[selected], fileIds: [activeId, otherFile.fileId], keyColumn: safeColumn, otherKeyColumn: otherColumn, fuzzy, similarityThreshold: 0.8 }, action.title);
        return;
      }
    }
    if (step) runAction(step, summary);
  }

  const conditional         = ["delete", "highlight", "filter"].includes(selected);
  const conditionNeedsValue = conditional && !["IsBlank", "IsNotBlank"].includes(operator);
  const needsColumn         = !["constant", "rowNumber", "append", "recipe", "addRow"].includes(selected);
  const needsOtherFile      = ["compare", "join", "fullJoin", "missing"].includes(selected);
  const canRun =
    hasFile &&
    (!needsColumn         || !!column) &&
    (!conditionNeedsValue || !!value.trim()) &&
    (selected !== "replace"      || !!value) &&
    (selected !== "renameColumn" || !!newName.trim()) &&
    (selected !== "addRow"       || Object.values(rowValues).some((v) => v.trim())) &&
    (selected !== "editRow"      || (!!value.trim() && !!secondColumn)) &&
    (!["merge", "calculate"].includes(selected) || !!secondColumn) &&
    (!needsOtherFile             || (!!otherFile && !!otherColumn)) &&
    (selected !== "append"       || files.length > 1) &&
    (selected !== "recipe"       || recipes.length > 0);

  return (
    <div className="management action-management">
      <div className="management-head">
        <div>
          <h2>Hazır işlemler</h2>
          <p>Temizleme, karşılaştırma, birleştirme ve raporlama işlemlerini kod yazmadan uygula.</p>
        </div>
      </div>

      {/* Kategori sekmeleri + arama */}
      <div className="action-catalog">
        <div className="action-tabs">
          {ACTION_CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={category === cat && !query ? "active" : ""}
              onClick={() => {
                setCategory(cat); setQuery("");
                const first = READY_ACTIONS.find((a) => a.category === cat);
                if (first) chooseAction(first);
              }}
            >
              {cat}
            </button>
          ))}
        </div>
        <label className="action-search">
          <span>⌕</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="İşlem ara..." />
        </label>
      </div>

      {/* İşlem seçici + form */}
      <div className="action-builder">
        <div className="action-picker">
          {visibleActions.map((item) => (
            <button key={item.id} className={selected === item.id ? "active" : ""} onClick={() => chooseAction(item)}>
              <span>{item.icon}</span>
              <div><b>{item.title}</b><small>{item.description}</small></div>
            </button>
          ))}
        </div>

        <section className="action-form">
          <span className="form-icon">{action.icon}</span>
          <h3>{action.title}</h3>
          <p>{action.description}</p>

          {!hasFile && <div className="form-warning">Önce çalışma alanından bir Excel veya CSV dosyası yüklemelisin.</div>}

          {needsColumn && (
            <label>
              {needsOtherFile ? "İlk dosyadaki anahtar kolon" : selected === "group" ? "Gruplanacak kolon" : selected === "editRow" ? "Satırı bulmak için anahtar kolon" : "İşlem yapılacak kolon"}
              <select value={column} onChange={(e) => setColumn(e.target.value)}>
                {["fill", "duplicate", "replace", "clean", "case"].includes(selected) && <option value="">Tüm kolonlar</option>}
                {columns.map((col) => <option key={col}>{col}</option>)}
              </select>
            </label>
          )}

          {conditional && (
            <>
              <label>
                Koşul
                <select value={operator} onChange={(e) => setOperator(e.target.value)}>
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
              {conditionNeedsValue && <Field label="Aranacak değer" value={value} setValue={setValue} placeholder="Örn: iptal veya 1000" />}
            </>
          )}

          {selected === "highlight" && (
            <label>Vurgu rengi
              <select value={color} onChange={(e) => setColor(e.target.value)}>
                <option>sarı</option><option>kırmızı</option><option>yeşil</option><option>mavi</option><option>turuncu</option>
              </select>
            </label>
          )}

          {["sortText", "sortNumber"].includes(selected) && (
            <label>Sıralama yönü
              <select value={direction} onChange={(e) => setDirection(e.target.value)}>
                <option value="asc">Artan</option><option value="desc">Azalan</option>
              </select>
            </label>
          )}

          {selected === "duplicate" && (
            <>
              <label>Korunacak kayıt
                <select value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="first">İlk kayıt</option><option value="last">Son kayıt</option><option value="highest">En yüksek değerli kayıt</option>
                </select>
              </label>
              {mode === "highest" && <ColumnField label="Değer kolonu" value={secondColumn} setValue={setSecondColumn} columns={columns} />}
            </>
          )}

          {selected === "fill"     && <Field label="Boş hücrelere yazılacak değer" value={value} setValue={setValue} placeholder="Örn: 0 veya Bilinmiyor" />}

          {selected === "validate" && (
            <label>Kontrol kuralı
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="required">Boş olamaz</option><option value="email">Geçerli e-posta</option>
                <option value="phone">Geçerli telefon</option><option value="number">Sayısal değer</option><option value="date">Geçerli tarih</option>
              </select>
            </label>
          )}

          {selected === "addRow" && (
            <div className="row-editor-fields">
              {columns.map((col) => (
                <Field key={col} label={col} value={rowValues[col] ?? ""} setValue={(v) => setRowValues((c) => ({ ...c, [col]: v }))} placeholder={`${col} değeri`} />
              ))}
            </div>
          )}

          {selected === "editRow" && (
            <>
              <Field label="Satırı bulacak değer" value={value} setValue={setValue} placeholder="Örn: Ahmet Yılmaz veya P-1024" />
              <ColumnField label="Düzenlenecek kolon" value={secondColumn} setValue={setSecondColumn} columns={columns} />
              <Field label="Yeni değer" value={replacement} setValue={setReplacement} placeholder="Yeni hücre değeri" />
            </>
          )}

          {selected === "replace" && (
            <>
              <Field label="Bul" value={value} setValue={setValue} placeholder="Eski değer" />
              <Field label="Şununla değiştir" value={replacement} setValue={setReplacement} placeholder="Yeni değer (boş bırakılabilir)" />
            </>
          )}

          {selected === "clean" && (
            <label>Temizleme türü
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="trim">Fazla boşlukları temizle</option>
                <option value="nonprinting">Görünmeyen karakterleri kaldır</option>
                <option value="ascii">Aksanları sadeleştir</option>
                <option value="number">Sayı biçimini standartlaştır</option>
              </select>
            </label>
          )}

          {selected === "case" && (
            <label>Harf düzeni
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="upper">BÜYÜK HARF</option><option value="lower">küçük harf</option><option value="title">Baş Harfler Büyük</option>
              </select>
            </label>
          )}

          {selected === "split" && (
            <>
              <Field label="Ayırıcı" value={separator} setValue={setSeparator} placeholder="Örn: boşluk, - veya /" />
              <Field label="Birinci yeni kolon" value={newName} setValue={setNewName} placeholder="Örn: Ad" />
              <Field label="İkinci yeni kolon" value={replacement} setValue={setReplacement} placeholder="Örn: Soyad" />
            </>
          )}

          {selected === "merge" && (
            <>
              <ColumnField label="İkinci kolon" value={secondColumn} setValue={setSecondColumn} columns={columns} />
              <Field label="Araya yazılacak ayırıcı" value={separator} setValue={setSeparator} placeholder="Örn: boşluk veya -" />
              <Field label="Yeni kolon adı" value={newName} setValue={setNewName} placeholder="Örn: Ad Soyad" />
            </>
          )}

          {selected === "extractText" && (
            <>
              <label>Parça türü
                <select value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="before">İşaretten önce</option><option value="after">İşaretten sonra</option>
                  <option value="left">Soldan karakter</option><option value="right">Sağdan karakter</option>
                </select>
              </label>
              <Field label={["left", "right"].includes(mode) ? "Karakter sayısı" : "Ayırıcı işaret"} value={value} setValue={setValue} placeholder={["left", "right"].includes(mode) ? "Örn: 5" : "Örn: - veya /"} />
              <Field label="Yeni kolon adı" value={newName} setValue={setNewName} placeholder="Örn: Ürün Kodu" />
            </>
          )}

          {selected === "extractDate" && (
            <>
              <label>Çıkarılacak bilgi
                <select value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="year">Yıl</option><option value="month">Ay numarası</option><option value="monthName">Ay adı</option>
                  <option value="day">Gün</option><option value="weekday">Haftanın günü</option><option value="quarter">Çeyrek</option>
                </select>
              </label>
              <Field label="Yeni kolon adı" value={newName} setValue={setNewName} placeholder="Örn: Sipariş Yılı" />
            </>
          )}

          {selected === "renameColumn" && <Field label="Yeni kolon adı" value={newName} setValue={setNewName} placeholder="Örn: Sipariş Durumu" />}

          {selected === "constant" && (
            <>
              <Field label="Yeni kolon adı" value={newName} setValue={setNewName} placeholder="Örn: Şube" />
              <Field label="Sabit değer" value={value} setValue={setValue} placeholder="Örn: İstanbul" />
            </>
          )}

          {selected === "rowNumber"  && <Field label="Kolon adı" value={newName} setValue={setNewName} placeholder="Sıra No" />}

          {selected === "calculate" && (
            <>
              <ColumnField label="İkinci kolon" value={secondColumn} setValue={setSecondColumn} columns={columns} />
              <label>İşlem
                <select value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="+">Topla</option><option value="-">Çıkar</option><option value="*">Çarp</option><option value="/">Böl</option>
                </select>
              </label>
              <Field label="Yeni kolon adı" value={newName} setValue={setNewName} placeholder="Örn: Toplam" />
            </>
          )}

          {selected === "group" && (
            <>
              <label>Özet türü
                <select value={aggregate} onChange={(e) => setAggregate(e.target.value)}>
                  <option value="count">Kayıt adedi</option><option value="sum">Toplam</option><option value="average">Ortalama</option>
                  <option value="min">En düşük</option><option value="max">En yüksek</option>
                </select>
              </label>
              {aggregate !== "count" && <ColumnField label="Hesaplanacak kolon" value={secondColumn} setValue={setSecondColumn} columns={columns} />}
            </>
          )}

          {selected === "recipe" && (
            <>
              {recipes.length ? (
                <>
                  <label>Kayıtlı işlem zinciri
                    <select value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
                      {recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </label>
                  <div className="form-info">
                    {(recipes.find((r) => r.id === recipeId) ?? recipes[0])?.steps.length ?? 0} adım sırayla bu çalışma kopyasına uygulanacak.
                  </div>
                </>
              ) : (
                <div className="form-info">Önce bir veya daha fazla işlemi Excel'e uygula, ardından sonuç alanındaki "İşlem zincirini kaydet" seçeneğini kullan.</div>
              )}
            </>
          )}

          {selected === "append" && (
            <div className="form-info">
              {files.length > 1 ? `${files.length} yüklü dosya kolonları eşleştirilerek alt alta eklenecek.` : "Bu işlem için en az iki dosya yüklemelisin."}
            </div>
          )}

          {needsOtherFile && (
            <>
              <label>İkinci Excel dosyası
                <select value={otherFile?.fileId ?? ""} onChange={(e) => setOtherFileId(e.target.value)}>
                  {otherFiles.map((f) => <option key={f.fileId} value={f.fileId}>{f.preview.fileName}</option>)}
                </select>
              </label>
              <ColumnField label="İkinci dosyadaki anahtar kolon" value={otherColumn} setValue={setOtherColumn} columns={otherColumns} />
              <label className="toggle-field">
                <input type="checkbox" checked={fuzzy} onChange={(e) => setFuzzy(e.target.checked)} />
                <span>Benzer yazımları da eşleştir (%80 benzerlik)</span>
              </label>
              {selected === "join"     && <div className="form-info">Aktif Excel'deki çalışanlar korunur. İkinci dosyadaki eksik kolon ve boş bilgiler eşleşen kişilere eklenir; ikinci dosyaya özel çalışanlar eklenmez.</div>}
              {selected === "fullJoin" && <div className="form-info">İki Excel'in bütün kolonları birleştirilir. Bir dosyada bulunmayan çalışan yeni satır olarak eklenir; karşılığı olmayan alanlar boş bırakılır.</div>}
            </>
          )}

          {selected === "splitFiles" && <div className="form-info">Seçilen kolondaki her farklı değer için ayrı Excel oluşturulur ve tek ZIP dosyası olarak indirilir.</div>}

          <button className="create-command" disabled={!canRun} onClick={buildCommand}>
            {selected === "splitFiles" ? "Excel'leri oluştur ve ZIP indir ↓" : "İşlemi uygula ve sonucu göster →"}
          </button>
        </section>
      </div>
    </div>
  );
}
