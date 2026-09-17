"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5190";

export default function LoginPage() {
  const params = useSearchParams();
  const router = useRouter();
  const [register, setRegister] = useState(params.get("mode") === "register");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const body = register
      ? {
          name: data.get("name"),
          email: data.get("email"),
          password: data.get("password"),
        }
      : { email: data.get("email"), password: data.get("password") };
    try {
      let response: Response;
      try {
        response = await fetch(
          `${api}/api/auth/${register ? "register" : "login"}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
      } catch {
        throw new Error(
          "Sheetly API çalışmıyor. Projeyi terminalde 'npm run dev' ile başlatın.",
        );
      }
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(
          detail?.error ??
            (register ? "Kayıt oluşturulamadı." : "E-posta veya şifre hatalı."),
        );
      }
      const result = await response.json();
      localStorage.setItem("sheetly_session", result.token);
      if (result.user) {
        localStorage.setItem("sheetly_user", JSON.stringify({ name: result.user.name, email: result.user.email }));
      }
      router.push("/dashboard");
    } catch (exception) {
      setError(
        exception instanceof Error ? exception.message : "Bir hata oluştu.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <Link href="/" className="brand auth-brand">
        <span className="mark">
          <i />
          <i />
          <i />
        </span>
        <span>Sheetly</span>
      </Link>
      <section className="auth-card">
        <div className="auth-badge">✦ TAMAMEN ÜCRETSİZ YEREL MOD</div>
        <h1>{register ? "Ücretsiz hesabını oluştur" : "Tekrar hoş geldin"}</h1>
        <p>
          {register
            ? "İlk Excel işlemini birkaç dakika içinde tamamla."
            : "Çalışma alanına kaldığın yerden devam et."}
        </p>
        <div className="auth-tabs">
          <button
            type="button"
            className={!register ? "active" : ""}
            onClick={() => setRegister(false)}
          >
            Giriş yap
          </button>
          <button
            type="button"
            className={register ? "active" : ""}
            onClick={() => setRegister(true)}
          >
            Hesap oluştur
          </button>
        </div>
        <form onSubmit={submit}>
          {register && (
            <label>
              Ad soyad
              <input name="name" required placeholder="Adınız ve soyadınız" />
            </label>
          )}
          <label>
            E-posta
            <input
              name="email"
              type="email"
              required
              placeholder="ornek@sirket.com"
            />
          </label>
          <label>
            Şifre
            <input
              name="password"
              type="password"
              minLength={8}
              required
              placeholder="En az 8 karakter"
            />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button className="button auth-submit" disabled={busy}>
            {busy
              ? "Lütfen bekle..."
              : register
                ? "Ücretsiz hesap oluştur →"
                : "Giriş yap →"}
          </button>
        </form>
      </section>
      <aside className="auth-visual">
        <div className="auth-quote">
          <span>“</span>
          <p>
            Excel işlemlerini kendi bilgisayarında, ek AI maliyeti olmadan
            tamamla.
          </p>
          <b>Ücretsiz yerel komut motoru</b>
        </div>
        <div className="data-orbit">
          <i />
          <i />
          <i />
          <strong>✦</strong>
        </div>
      </aside>
    </main>
  );
}
