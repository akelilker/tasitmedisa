/**
 * users[] düzenlemesi:
 * - kullanici_adi → küçük ad + soyadın ilk harfi (tr-TR), örn. İrfan Yavuzer → irfanY
 * - sifre → soyadın tamamı küçük harf + "123", örn. … Yavuzer → yavuzer123
 *   (core.php: sifre_hash doluysa düz şifre yok sayılır → sıfırlanır.)
 * İstisna: İlker Akel — kullanici_adi, isim, sifre dokunulmaz.
 * Kullanım: node tools/normalize-kullanici-adi.mjs <girdi.json> [çıktı.json]
 */
import fs from 'fs';

const LOCALE = 'tr-TR';
const SIFRE_SUFFIX = '123';

function isIlkerAkel(isim) {
  if (!isim || typeof isim !== 'string') return false;
  const parts = isim.trim().replace(/\s+/g, ' ').split(' ');
  if (parts.length < 2) return false;
  const ad = parts[0].toLocaleLowerCase(LOCALE);
  const soyadlar = parts.slice(1).join(' ');
  const soyadNorm = soyadlar.toLocaleLowerCase(LOCALE);
  return ad === 'ilker' && soyadNorm === 'akel';
}

/** Soyad = isimdeki son kelime (çok kelimeli soyad için son parça). Tek kelime ise o kelime. */
function soyadTokenFromIsim(isim) {
  if (!isim || typeof isim !== 'string') return '';
  const collapsed = isim.trim().replace(/\s+/g, ' ');
  if (!collapsed) return '';
  const parts = collapsed.split(' ');
  return parts[parts.length - 1];
}

function sifreFromIsim(isim) {
  const soy = soyadTokenFromIsim(isim);
  if (!soy) return '';
  return soy.toLocaleLowerCase(LOCALE) + SIFRE_SUFFIX;
}

function kullaniciAdiFromIsim(isim) {
  if (!isim || typeof isim !== 'string') return '';
  const collapsed = isim.trim().replace(/\s+/g, ' ');
  if (!collapsed) return '';
  const parts = collapsed.split(' ');
  if (parts.length === 1) {
    return parts[0].toLocaleLowerCase(LOCALE);
  }
  const adLower = parts[0].toLocaleLowerCase(LOCALE);
  const soySon = parts[parts.length - 1];
  const harf = soySon.charAt(0).toLocaleUpperCase(LOCALE);
  return adLower + harf;
}

function patchUsers(data) {
  const users = data.users;
  if (!Array.isArray(users)) {
    throw new Error('JSON içinde users dizisi yok.');
  }
  let changedLogin = 0;
  let changedPassword = 0;
  let skippedIlker = 0;
  for (const u of users) {
    if (!u || typeof u !== 'object') continue;
    const isim = u.isim;
    if (isIlkerAkel(isim)) {
      skippedIlker++;
      continue;
    }
    const nextLogin = kullaniciAdiFromIsim(isim);
    if (nextLogin && u.kullanici_adi !== nextLogin) {
      u.kullanici_adi = nextLogin;
      changedLogin++;
    }
    const nextPass = sifreFromIsim(isim);
    if (nextPass) {
      const prevPass = typeof u.sifre === 'string' ? u.sifre : '';
      const hadHash = typeof u.sifre_hash === 'string' && u.sifre_hash.trim() !== '';
      if (prevPass !== nextPass || hadHash) {
        u.sifre = nextPass;
        u.sifre_hash = '';
        changedPassword++;
      }
    }
  }
  return {
    changedLogin,
    changedPassword,
    skippedIlker,
    total: users.length,
  };
}

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath) {
    console.error('Kullanım: node tools/normalize-kullanici-adi.mjs <girdi.json> [çıktı.json]');
    process.exit(1);
  }
  const raw = fs.readFileSync(inputPath, 'utf8');
  const data = JSON.parse(raw);
  const stats = patchUsers(data);
  const out = JSON.stringify(data, null, 4) + '\n';
  if (outputPath) {
    fs.writeFileSync(outputPath, out, 'utf8');
    console.error(JSON.stringify({ ok: true, inputPath, outputPath, ...stats }, null, 2));
  } else {
    process.stdout.write(out);
    console.error(JSON.stringify({ ok: true, inputPath, stdout: true, ...stats }, null, 2));
  }
}

main();
