# Sheetly

Excel, CSV ve PDF dosyalarını doğal dil ile düzenlemeyi hedefleyen premium SaaS ürününün ilk hafta teslimatı.

## İçerik

- Premium landing page ve responsive dashboard
- Kayıt/giriş arayüzü ve .NET kimlik doğrulama uçları
- Sürükle-bırak dosya yükleme ile CSV/XLSX önizleme
- ASP.NET Core API, güvenlik başlıkları ve dosya doğrulama
- Kalıcı dosya/veri depolama bildirimleri ve sosyal paylaşım görseli
- AI komutundan güvenli, yapılandırılmış Excel işlem planı üretimi
- Filtreleme, sıralama, mükerrer temizleme, kolon düzenleme ve hesaplanan kolonlar
- Plan önizleme, kullanıcı onayı, SignalR ilerlemesi ve yeni XLSX indirme

## Web

```bash
npm install
npm run dev
npm run build
```

`npm run dev`, web uygulamasını ve .NET API'yi birlikte başlatır. Yalnızca web için `npm run dev:web`, yalnızca API için `npm run dev:api` kullanılabilir.

## API

```bash
dotnet run --project backend/Sheetly.Api
```

API varsayılan olarak `http://localhost:5190` adresinde çalışır. Web tarafında farklı bir adres için `NEXT_PUBLIC_API_URL` kullanılır.
