import Link from "next/link";

const features = [
  { n: "01", title: "Dosyanı güvenle yükle", text: "Excel, CSV ve PDF dosyalarını tek bir çalışma alanında düzenle." },
  { n: "02", title: "Ne istediğini yaz", text: "Karmaşık formüller yerine doğal dille işlemini tarif et." },
  { n: "03", title: "Kontrol et ve indir", text: "Değişiklikleri uygulamadan önce gör, sonucu yeni dosya olarak al." },
];

function Mark() {
  return <span className="mark"><i /><i /><i /></span>;
}

export default function Home() {
  return (
    <main>
      <nav className="nav shell">
        <Link href="/" className="brand"><Mark /> <span>Sheetly</span></Link>
        <div className="navlinks"><a href="#urun">Ürün</a><a href="#guvenlik">Güvenlik</a><a href="#fiyat">Fiyatlandırma</a></div>
        <div className="navactions"><Link href="/login" className="login">Giriş yap</Link><Link href="/login?mode=register" className="button small">Ücretsiz dene <span>↗</span></Link></div>
      </nav>

      <section className="hero shell">
        <div className="eyebrow"><span className="pulse" /> Excel işlerinin yeni çalışma biçimi</div>
        <h1>Verilerinle konuş.<br/><em>İşini hızlandır.</em></h1>
        <p className="hero-copy">Excel ve PDF dosyalarını yükle. Yapmak istediğini tek cümleyle anlat. Sheetly verilerini düzenlesin, birleştirsin ve raporlasın.</p>
        <div className="hero-actions"><Link href="/login?mode=register" className="button">Ücretsiz çalışmaya başla <span>→</span></Link><a href="#demo" className="text-button"><b>▶</b> 90 saniyede nasıl çalışır?</a></div>
        <div className="trust"><span>Kredi kartı gerekmez</span><span>•</span><span>14 gün ücretsiz</span><span>•</span><span>Dosyaların sana ait kalır</span></div>

        <div className="product" id="demo">
          <div className="windowbar"><div className="dots"><i/><i/><i/></div><span>Q3_Satis_Raporu.xlsx</span><div className="secure">● Güvenli çalışma alanı</div></div>
          <div className="product-body">
            <aside className="files"><div className="side-title">DOSYALAR</div><div className="file active"><span className="xls">X</span><div><b>Q3_Satis_Raporu.xlsx</b><small>2.4 MB · 4 sayfa</small></div></div><div className="file"><span className="pdf">P</span><div><b>Faturalar_Eylul.pdf</b><small>8.1 MB · 24 sayfa</small></div></div><button>＋ Dosya ekle</button></aside>
            <div className="sheet"><div className="sheet-tabs"><b>Satışlar</b><span>Müşteriler</span><span>Ürünler</span></div><div className="grid"><div className="grid-row head"><span>#</span><span>Müşteri</span><span>Bölge</span><span>Satış</span></div>{[["1","Arven Teknoloji","Marmara","₺84.250"],["2","Nova Lojistik","Ege","₺61.800"],["3","Pera Gıda","Akdeniz","₺47.120"],["4","Kuzey Yapı","İç Anadolu","₺92.400"],["5","Atlas Medya","Marmara","₺38.750"]].map((r)=><div className="grid-row" key={r[0]}>{r.map((c,i)=><span className={i===3&&Number(c.replace(/\D/g,""))>50000?"hot":""} key={c}>{c}</span>)}</div>)}</div></div>
            <aside className="chat"><div className="chat-title"><span className="spark">✦</span><div><b>Sheetly AI</b><small>Çevrimiçi</small></div></div><div className="bubble">Satış tutarı 50.000 TL’den yüksek müşterileri yeni bir sayfaya aktar.</div><div className="thinking"><span>✦</span><div><b>İşlem hazır</b><p>83 kayıt “Yüksek Satışlar” isimli yeni sayfaya aktarılacak.</p><div className="chips"><i>✓ 1.247 satır tarandı</i><i>✓ Orijinal veri korunacak</i></div></div></div><div className="approve">Önizle <button>Uygula →</button></div></aside>
          </div>
        </div>
      </section>

      <section className="logos"><span>10.000+ veri ekibinin yeni iş arkadaşı</span><div><b>ARVEN</b><b>nord</b><b>orbit.</b><b>MONO</b><b>kapsül</b></div></section>

      <section className="section shell" id="urun"><div className="section-kicker">NASIL ÇALIŞIR?</div><h2>Dosyadan sonuca,<br/><em>üç basit adımda.</em></h2><div className="feature-grid">{features.map(f=><article key={f.n}><span>{f.n}</span><div className={`feature-icon fi-${f.n}`}>{f.n==="01"?"⇧":f.n==="02"?"✦":"✓"}</div><h3>{f.title}</h3><p>{f.text}</p></article>)}</div></section>

      <section className="security" id="guvenlik"><div className="shell security-inner"><div><div className="section-kicker light">VERİLERİN GÜVENDE</div><h2>Dosyaların<br/><em>sadece senin.</em></h2><p>Her çalışma alanı izole edilir. Orijinal dosyan korunur ve işlemler senin onayın olmadan uygulanmaz.</p></div><div className="shield">◇<span>Uçtan uca<br/>koruma</span></div></div></section>

      <section className="cta shell" id="fiyat"><div><span className="section-kicker">BUGÜN BAŞLA</span><h2>İlk dosyanı birlikte<br/><em>kolaylaştıralım.</em></h2></div><Link href="/login?mode=register" className="button">Ücretsiz dene <span>→</span></Link></section>
      <footer className="shell"><Link href="/" className="brand"><Mark/> <span>Sheetly</span></Link><p>Excel işlerinin yeni çalışma biçimi.</p><span>© 2026 Sheetly</span></footer>
    </main>
  );
}
