<?php
/**
 * Varsayılan kimlik bilgisi migrasyonu testleri.
 * Yalnız sentetik geçici dosyalar kullanır.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'scripts'
    . DIRECTORY_SEPARATOR . 'migrate-medisa-default-credentials.php';

$passed = 0;
$failed = 0;
$tempDirs = [];

function dcAssert(string $label, bool $condition): void
{
    global $passed, $failed;
    if ($condition) {
        $passed++;
        echo "[PASS] {$label}\n";
        return;
    }
    $failed++;
    echo "[FAIL] {$label}\n";
}

function dcTempDir(): string
{
    global $tempDirs;
    $dir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'medisa-default-credentials-' . bin2hex(random_bytes(5));
    if (!mkdir($dir, 0700, true)) {
        throw new RuntimeException('TEMP_DIR_FAILED');
    }
    $tempDirs[] = $dir;
    return $dir;
}

function dcCleanup(): void
{
    global $tempDirs;
    foreach ($tempDirs as $dir) {
        if (!is_dir($dir)) {
            continue;
        }
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($iterator as $item) {
            $item->isDir() ? @rmdir($item->getPathname()) : @unlink($item->getPathname());
        }
        @rmdir($dir);
    }
}

function dcWriteFixture(string $path, array $data): void
{
    $encoded = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if ($encoded === false || !medisaAtomicWriteFile($path, $encoded)) {
        throw new RuntimeException('FIXTURE_WRITE_FAILED');
    }
}

register_shutdown_function('dcCleanup');

$serhan = medisaBuildLegacyDefaultCredentials(['isim' => 'Serhan KÖSE']);
dcAssert('örnek kullanıcı adı serhanK', $serhan['username'] === 'serhanK');
dcAssert('örnek parola Kose123', $serhan['password'] === 'Kose123');
dcAssert('Türkçe ASCII dönüşümü', medisaDefaultCredentialsTransliterate('ÇĞİÖŞÜçğıöşü') === 'CGIOSUcgiosu');
$serviceAccount = medisaBuildLegacyDefaultCredentials(['isim' => 'Sevkiyat']);
dcAssert('tek kelimeli servis kullanıcı adı', $serviceAccount['username'] === 'sevkiyatS');
dcAssert('tek kelimeli servis parolası', $serviceAccount['password'] === 'Sevkiyat123');

$dir = dcTempDir();
$dataPath = $dir . DIRECTORY_SEPARATOR . 'data.json';
$fixture = [
    'users' => [
        [
            'id' => 'u1',
            'isim' => 'Serhan KÖSE',
            'rol' => 'genel_yonetici',
            'kullanici_adi' => 'old-one',
            'sifre_hash' => password_hash('OldPass1', PASSWORD_DEFAULT),
            'ilk_giris_parola_onerisi_bekliyor' => false,
            'branchIds' => ['b1'],
        ],
        [
            'id' => 'u2',
            'isim' => 'İlker AKEL',
            'rol' => 'sube_yonetici',
            'kullanici_adi' => 'old-two',
            'sifre_hash' => password_hash('OldPass2', PASSWORD_DEFAULT),
            'aktif' => true,
        ],
        [
            'id' => 'u3',
            'isim' => 'Ali ECE',
            'rol' => 'kullanici',
            'kullanici_adi' => 'old-three',
            'sifre' => 'LegacyPlain3',
            'tasit_id' => 'v1',
        ],
    ],
    'tasitlar' => [['id' => 'v1', 'plaka' => 'TEST']],
    'branches' => [['id' => 'b1', 'name' => 'B1']],
];
dcWriteFixture($dataPath, $fixture);

$beforeRaw = (string)file_get_contents($dataPath);
$dry = medisaDefaultCredentialsRun([
    'mode' => 'dry-run',
    'data' => $dataPath,
    'expect_users' => 3,
    'confirm' => '',
]);
dcAssert('dry-run veri değiştirmez', hash('sha256', $beforeRaw) === hash_file('sha256', $dataPath));
dcAssert('dry-run üç benzersiz kullanıcı adı', (int)$dry['unique_usernames'] === 3);
dcAssert('dry-run minimum parola altı', (int)$dry['minimum_default_password_length'] >= 6);
dcAssert('dry-run parola/hash raporlamaz', strpos((string)json_encode($dry), 'Kose123') === false);

$apply = medisaDefaultCredentialsRun([
    'mode' => 'apply',
    'data' => $dataPath,
    'expect_users' => 3,
    'confirm' => 'RESET_DEFAULT_CREDENTIALS',
]);
dcAssert('apply başarılı', $apply['applied'] === true);
dcAssert('rollback yedeği var', is_file((string)$apply['rollback_backup']['path']));
dcAssert('kullanıcı sayısı sabit', (int)$apply['users_before'] === 3 && (int)$apply['users_after'] === 3);
dcAssert('plaintext sıfır', (int)$apply['post_checks']['plaintext'] === 0);
dcAssert('hash-only üç', (int)$apply['post_checks']['valid_hashes'] === 3);
dcAssert('ilk giriş bekleyen üç', (int)$apply['post_checks']['first_login_pending'] === 3);
dcAssert('diğer kullanıcı alanı değişmedi', (int)$apply['post_checks']['other_user_field_changes'] === 0);
dcAssert('üç varsayılan parola doğrulandı', (int)$apply['post_checks']['default_password_verified'] === 3);

$after = json_decode((string)file_get_contents($dataPath), true);
$byId = [];
foreach ($after['users'] as $user) {
    $byId[$user['id']] = $user;
}
dcAssert('Serhan kullanıcı adı dönüştü', ($byId['u1']['kullanici_adi'] ?? '') === 'serhanK');
dcAssert('İlker kullanıcı adı dönüştü', ($byId['u2']['kullanici_adi'] ?? '') === 'ilkerA');
dcAssert('Ali kullanıcı adı dönüştü', ($byId['u3']['kullanici_adi'] ?? '') === 'aliE');
dcAssert('Serhan varsayılan parola doğrulanır', medisaVerifyUserPassword($byId['u1'], 'Kose123'));
dcAssert('İlker varsayılan parola doğrulanır', medisaVerifyUserPassword($byId['u2'], 'Akel123'));
dcAssert('Ali varsayılan parola doğrulanır', medisaVerifyUserPassword($byId['u3'], 'Ece123'));
dcAssert('rol ve scope korundu', ($byId['u1']['rol'] ?? '') === 'genel_yonetici'
    && ($byId['u1']['branchIds'] ?? []) === ['b1']);
dcAssert('taşıt ataması korundu', ($byId['u3']['tasit_id'] ?? '') === 'v1');

$collisionPath = dcTempDir() . DIRECTORY_SEPARATOR . 'data.json';
dcWriteFixture($collisionPath, [
    'users' => [
        ['id' => 'c1', 'isim' => 'Ali ECE'],
        ['id' => 'c2', 'isim' => 'Ali EREN'],
    ],
]);
$collisionBlocked = false;
try {
    medisaDefaultCredentialsRun([
        'mode' => 'dry-run',
        'data' => $collisionPath,
        'expect_users' => 2,
        'confirm' => '',
    ]);
} catch (Throwable $e) {
    $collisionBlocked = $e->getMessage() === 'USERNAME_COLLISION';
}
dcAssert('kullanıcı adı çakışması bloklanır', $collisionBlocked);

$countBlocked = false;
try {
    medisaDefaultCredentialsRun([
        'mode' => 'dry-run',
        'data' => $dataPath,
        'expect_users' => 47,
        'confirm' => '',
    ]);
} catch (Throwable $e) {
    $countBlocked = $e->getMessage() === 'USER_COUNT_MISMATCH';
}
dcAssert('beklenen kullanıcı sayısı kapısı', $countBlocked);

echo "\nDEFAULT_CREDENTIALS_PASSED={$passed}\n";
echo "DEFAULT_CREDENTIALS_FAILED={$failed}\n";
exit($failed === 0 ? 0 : 1);
