# TAŞITMEDİSA — Faz 1A / 1B Git Durumu Düzeltme Notu

**Tarih:** 11 Temmuz 2026  
**Repo:** `akelilker/tasitmedisa`  
**Kapsam:** Ölü kod temizliği Faz 1A / Faz 1B için sonradan üretilen hatalı Git durum yorumlarının düzeltilmesi

## 1. Düzeltmenin nedeni

11 Temmuz 2026 tarihli bir geliştirici raporunda Faz 1A ve Faz 1B'nin farklı ortamlarda parçalı kaldığı, henüz birleştirilmediği ve push öncesi cherry-pick/rebase gerektiği ileri sürülmüştür.

Bu yorum repository commit ancestry'si ile uyuşmamaktadır. Rapor, yalnızca çalışma ortamlarının anlık HEAD/diff görünümünü esas almış; `5c8a3810` commit'inin geçmişinde Faz 1A'nın zaten bulunduğunu hesaba katmamıştır.

Bu dosya söz konusu yorumları geçersiz kılar ve canonical Git durumunu sabitler.

## 2. Canonical commit zinciri

Faz 1A ve Faz 1B GitHub `main` geçmişinde art arda bulunmaktadır:

1. `c26fa9fd` — `refactor: raporlar kullanici sekmesi olu kodunu temizle`
2. `5c8a3810` — `refactor: gereksiz export ve orphan css temizle`

`5c8a3810`, `c26fa9fd` commit'inin doğrudan devamıdır. Bu nedenle `5c8a3810` üzerinde bulunan bir çalışma ağacı Faz 1A'yı da içerir.

Sonuç:

- Faz 1A ve Faz 1B ayrı kalmamıştır.
- İki faz tek commit zincirinde birleşmiştir.
- Her iki commit de GitHub `main` üzerindedir.
- Yeniden cherry-pick, manuel patch, rebase veya yeni PR gerekmez.

## 3. `5c277977` hakkında karar

`5c277977` hash'i cloud workspace kaynaklı, push edilmemiş duplicate Faz 1A çalışmasıdır.

Canonical Faz 1A commit'i:

`c26fa9fd refactor: raporlar kullanici sekmesi olu kodunu temizle`

Karar:

- `5c277977` canonical değildir.
- GitHub repository commit'i olarak kullanılmayacaktır.
- Lokal repository'ye cherry-pick edilmeyecektir.
- Bu hash üzerinden patch veya branch üretimi yapılmayacaktır.

## 4. Geçersiz kılınan yorumlar

Aşağıdaki yorumlar artık geçersizdir ve operasyon talimatı olarak uygulanmamalıdır:

- "Lokal ortamda yalnızca Faz 1B tamamlandı; Faz 1A eksik."
- "Cloud workspace'te yalnızca Faz 1A tamamlandı; Faz 1B eksik."
- "İki ortamın commit'leri birleştirilmeli."
- "`git cherry-pick 5c277977` çalıştırılmalı."
- "17 commit geride olduğu için Faz 1A/1B push öncesi rebase edilmeli."
- "Faz 1A/1B henüz push edilmedi."
- "Push, deploy ve browser smoke eksik."
- "Yeni feature branch veya PR açılmalı."

Cloud workspace'in geride olması yalnızca o geçici ortamın senkron durumudur; repository'deki canonical commit zincirinin parçalı olduğu anlamına gelmez.

## 5. Doğru kapanış durumu

| Konu | Doğru durum |
|---|---|
| Faz 1A | Tamamlandı |
| Faz 1A canonical commit | `c26fa9fd` |
| Faz 1B | Tamamlandı |
| Faz 1B canonical commit | `5c8a3810` |
| Fazlar tek zincirde mi? | Evet |
| GitHub `main` üzerinde mi? | Evet |
| Push tamam mı? | Evet |
| Deploy doğrulaması | Tamamlandı |
| Browser smoke | Tamamlandı |
| Yeni cherry-pick / patch | Gereksiz ve uygulanmamalı |
| Yeni PR | Gereksiz |

## 6. Teknik tespitlerden korunanlar

Hatalı Git yorumlarına rağmen aşağıdaki teknik tespitler geçerlidir:

### Faz 1A

- `raporlar.js` içindeki kullanılmayan Kullanıcı sekmesi state/render/list/detail/search/back akışları kaldırılmıştır.
- `raporlar.css` içindeki ilgili `.kullanici-*` ve legacy `.stok-left-controls` kuralları kaldırılmıştır.
- Stok raporundaki aktif `Kullanıcı` kolonu korunmuştur.
- Admin raporundaki `.kullanici-list-item` sınıfları ayrı owner altında aktif olduğundan korunmuştur.

### Faz 1B

- `window.API_LOAD_KASKO` export'u kaldırılmıştır; iç `API_LOAD_KASKO` kullanımı korunmuştur.
- `window.storePortalToken` alias'ı kaldırılmıştır.
- Orphan utility selector'lar kaldırılmıştır.
- Kullanılmayan `.driver-home-link` CSS kuralı kaldırılmıştır.

### Opsiyonel micro-cleanup

`data-manager.js` içindeki aşağıdaki selector guard'ı artık davranışsal fark üretmeyen bir kalıntıdır:

```js
a.user-panel-link:not(.driver-home-link)
```

Repository'de `driver-home-link` class'ı bulunmadığı için ileride ayrı, düşük riskli bir micro-cleanup kapsamında `a.user-panel-link` olarak sadeleştirilebilir.

Bu konu Faz 1A / 1B kapanışını engellemez ve bu düzeltme notunda kod değişikliği yapılmamıştır.

## 7. Operasyon kararı

Faz 1A ve Faz 1B kapalıdır.

Bu hat için:

- Kod değişikliği yapılmayacak.
- Eski cloud commit'i alınmayacak.
- Duplicate cherry-pick yapılmayacak.
- Geçmiş commit'ler yeniden yazılmayacak.
- Gereksiz rebase/merge/PR süreci başlatılmayacak.

Lokal repository güncel değilse, çalışma ağacı ayrıca kontrol edildikten sonra yalnızca normal `origin/main` senkronizasyonu yapılmalıdır. Bu senkronizasyon Faz 1A / 1B'yi birleştirme işlemi değildir; güncel `main` geçmişini lokalde ileri alma işlemidir.

## 8. Kaynak gerçeklik

Bu düzeltmede kaynak gerçeklik sırası şöyledir:

1. GitHub `main` commit ancestry'si
2. `c26fa9fd` ve `5c8a3810` canonical commit diff'leri
3. `docs/raporlar/2026-07-09-tasitmedisa-olu-kod-temizligi-kapanis-raporu.md`
4. Deploy ve browser smoke kayıtları

Geçici cloud workspace raporları repository ancestry'siyle çeliştiğinde kaynak gerçeklik kabul edilmez.

## 9. Nihai karar

Faz 1A / Faz 1B ölü kod temizliği doğru uygulanmış, push edilmiş, deploy edilmiş ve doğrulanmıştır.

Düzeltilmesi gereken alan kod değil; parçalı ortam görünümünden üretilen hatalı Git yorumlarıdır.

Bu dosya yalnızca dokümantasyon düzeltmesidir; runtime dosyalarına ve uygulama davranışına dokunulmamıştır.
