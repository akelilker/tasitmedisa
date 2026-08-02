<?php
/**
 * TaşıtMedisa staging sentetik veri üretici.
 *
 * Parola veya hash değerlerini stdout'a yazmaz.
 *
 * Ortam / CLI:
 *   MEDISA_STAGING_ADMIN_USER (varsayılan: staging_admin)
 *   MEDISA_STAGING_ADMIN_PASSWORD (zorunlu)
 *   MEDISA_STAGING_OUTPUT_DIR (zorunlu)
 *
 * Kullanım:
 *   MEDISA_STAGING_ADMIN_PASSWORD='...' MEDISA_STAGING_OUTPUT_DIR=/path/to/out php scripts/generate-medisa-staging-seed.php
 */

declare(strict_types=1);

function medisaStagingSeedParseArgs(array $argv): array
{
    $opts = [
        'admin_user' => getenv('MEDISA_STAGING_ADMIN_USER') ?: 'staging_admin',
        'admin_password' => getenv('MEDISA_STAGING_ADMIN_PASSWORD') ?: '',
        'output_dir' => getenv('MEDISA_STAGING_OUTPUT_DIR') ?: '',
    ];

    foreach (array_slice($argv, 1) as $arg) {
        if (strpos($arg, '--admin-user=') === 0) {
            $opts['admin_user'] = trim(substr($arg, 13));
        } elseif (strpos($arg, '--admin-password=') === 0) {
            $opts['admin_password'] = trim(substr($arg, 17));
        } elseif (strpos($arg, '--output-dir=') === 0) {
            $opts['output_dir'] = trim(substr($arg, 13));
        } elseif ($arg === '--help' || $arg === '-h') {
            echo "Medisa staging seed generator. Parola/hash stdout'a yazilmaz.\n";
            exit(0);
        } else {
            fwrite(STDERR, "Bilinmeyen arguman: {$arg}\n");
            exit(1);
        }
    }

    return $opts;
}

function medisaStagingSeedFail(string $message, int $code = 1): void
{
    fwrite(STDERR, $message . "\n");
    exit($code);
}

function medisaStagingSeedEnsureDir(string $path): string
{
    if ($path === '') {
        medisaStagingSeedFail('MEDISA_STAGING_OUTPUT_DIR zorunludur.');
    }

    if (!is_dir($path)) {
        if (!@mkdir($path, 0755, true) && !is_dir($path)) {
            medisaStagingSeedFail('Cikti dizini olusturulamadi.');
        }
    }

    $resolved = realpath($path);
    if ($resolved === false) {
        medisaStagingSeedFail('Cikti dizini cozulemedi.');
    }

    return $resolved;
}

function medisaStagingSeedSafePath(string $baseDir, string $relative): string
{
    $relative = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, ltrim($relative, '/\\'));
    $full = $baseDir . DIRECTORY_SEPARATOR . $relative;
    $parent = dirname($full);
    if (!is_dir($parent) && !@mkdir($parent, 0755, true) && !is_dir($parent)) {
        medisaStagingSeedFail('Alt dizin olusturulamadi.');
    }

    $baseReal = realpath($baseDir);
    $parentReal = realpath($parent);
    if ($baseReal === false || $parentReal === false || strpos($parentReal, $baseReal) !== 0) {
        medisaStagingSeedFail('Guvenli yol disina cikildi.');
    }

    return $parentReal . DIRECTORY_SEPARATOR . basename($full);
}

function medisaStagingSeedWriteJson(string $path, array $data): void
{
    $json = json_encode(
        $data,
        JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR
    );
    if (@file_put_contents($path, $json . "\n") === false) {
        medisaStagingSeedFail('Dosya yazilamadi: ' . basename($path));
    }
}

function medisaStagingSeedSnapshotBasename(string $fixtureSlug, int $sequence): string
{
    $date = '2026-08-02';
    $time = str_pad((string)(120000 + $sequence), 6, '0', STR_PAD_LEFT);
    $hex = substr(hash('sha256', 'medisa-staging-fixture|' . $fixtureSlug), 0, 8);

    return 'snapshot-' . $date . '-' . $time . '-' . $hex . '.json';
}

function medisaStagingSeedEmptyCollections(): array
{
    return [
        'kayitlar' => [],
        'sifreler' => [],
        'notificationReadState' => [],
        'monthlyTodoWhatsAppLogs' => [],
    ];
}

function medisaStagingSeedAyarlar(string $adminUser, string $fixtureSlug = ''): array
{
    $ayarlar = [
        'sirketAdi' => 'Medisa Staging Synthetic',
        'yetkiliKisi' => 'Staging Yetkili',
        'telefon' => '',
        'eposta' => 'staging@example.invalid',
        'k2Belgesi' => [
            'expiryDate' => '',
            'documentPath' => '',
            'updatedAt' => '',
        ],
        'stagingSynthetic' => true,
    ];

    if ($fixtureSlug !== '') {
        $ayarlar['stagingFixture'] = $fixtureSlug;
    }

    return $ayarlar;
}

function medisaStagingSeedVehicleEvents(): array
{
    return [
        [
            'id' => 'evt-bakim-v1',
            'type' => 'bakim',
            'date' => '2026-01-15',
            'timestamp' => '2026-01-15T10:00:00+03:00',
            'data' => [
                'islemler' => 'Sentetik bakim kaydi',
                'servis' => 'Staging Servis',
                'kisi' => 'Staging Surucu',
                'km' => '15000',
                'tutar' => '1200',
            ],
        ],
        [
            'id' => 'evt-km-v1',
            'type' => 'km-revize',
            'date' => '2026-01-10',
            'timestamp' => '2026-01-10T09:00:00+03:00',
            'data' => [
                'eskiKm' => '14000',
                'yeniKm' => '15000',
                'surucu' => 'Staging Surucu',
            ],
        ],
        [
            'id' => 'evt-kaza-v1',
            'type' => 'kaza',
            'date' => '2026-02-01',
            'timestamp' => '2026-02-01T14:00:00+03:00',
            'data' => [
                'surucu' => 'Staging Surucu',
                'aciklama' => 'Sentetik kaza kaydi',
            ],
        ],
    ];
}

function medisaStagingSeedVehicle(string $id, string $plate, int $km, array $events = [], array $belgeler = []): array
{
    return [
        'id' => $id,
        'plate' => $plate,
        'version' => 1,
        'branchId' => 'b-test-1',
        'km' => $km,
        'guncelKm' => (string)$km,
        'events' => $events,
        'belgeler' => $belgeler !== [] ? $belgeler : [['id' => 'doc-' . $id]],
    ];
}

function medisaStagingSeedBranches(): array
{
    return [
        ['id' => 'b-test-1', 'name' => 'Staging Sube 1'],
        ['id' => 'b-test-2', 'name' => 'Staging Sube 2'],
    ];
}

function medisaStagingSeedAdminUser(string $adminUser, string $adminHash, bool $active = true, string $role = 'genel_yonetici'): array
{
    return [
        'id' => $adminUser,
        'isim' => 'Staging Admin',
        'kullanici_adi' => $adminUser,
        'role' => $role,
        'aktif' => $active,
        'sifre_hash' => $adminHash,
    ];
}

function medisaStagingSeedAltGmUser(string $adminHash): array
{
    return [
        'id' => 'staging_gm_alt',
        'isim' => 'Staging Alt GM',
        'kullanici_adi' => 'staging_gm_alt',
        'role' => 'genel_yonetici',
        'aktif' => true,
        'sifre_hash' => $adminHash,
    ];
}

function medisaStagingSeedRegularUser(string $userHash): array
{
    return [
        'id' => 'staging_user',
        'isim' => 'Staging User',
        'kullanici_adi' => 'staging_user',
        'role' => 'kullanici',
        'aktif' => true,
        'branchIds' => ['b-test-1'],
        'sifre_hash' => $userHash,
    ];
}

function medisaStagingSeedKmCorrection(string $adminUser): array
{
    return [
        'arac_aylik_hareketler' => [
            [
                'id' => 1,
                'arac_id' => 'v-test-1',
                'surucu_id' => 'staging_user',
                'donem' => '2026-07',
                'guncel_km' => 15200,
                'bakim_durumu' => 0,
                'kaza_durumu' => 0,
                'kayit_tarihi' => '2026-07-15T10:00:00+03:00',
                'guncelleme_tarihi' => '2026-07-20T12:00:00+03:00',
                'durum' => 'onaylandi',
            ],
        ],
        'duzeltme_talepleri' => [
            [
                'id' => 1,
                'kayit_id' => 1,
                'surucu_id' => 'staging_user',
                'surucu_adi' => 'Staging User',
                'talep_tarihi' => '2026-07-18T11:00:00+03:00',
                'sebep' => 'Sentetik KM duzeltme talebi',
                'eski_km' => 15000,
                'yeni_km' => 15200,
                'durum' => 'onaylandi',
                'admin_yanit_tarihi' => '2026-07-20T12:00:00+03:00',
                'admin_notu' => 'Staging onay',
                'admin_id' => $adminUser,
            ],
        ],
    ];
}

function medisaStagingSeedBaselineVehicles(): array
{
    $events = medisaStagingSeedVehicleEvents();

    return [
        medisaStagingSeedVehicle('v-test-1', 'TEST 001', 15000, $events, [['id' => 'doc-v-test-1']]),
        medisaStagingSeedVehicle('v-test-2', 'TEST 002', 22000, [], [['id' => 'doc-v-test-2']]),
        medisaStagingSeedVehicle('v-test-3', 'TEST 003', 31000, [], [['id' => 'doc-v-test-3']]),
    ];
}

function medisaStagingSeedBuildDocument(string $adminUser, string $adminHash, string $userHash, string $fixtureSlug = ''): array
{
    $km = medisaStagingSeedKmCorrection($adminUser);

    return array_merge(
        [
            'schema_version' => 'legacy-v1',
            'tasitlar' => medisaStagingSeedBaselineVehicles(),
            'branches' => medisaStagingSeedBranches(),
            'users' => [
                medisaStagingSeedAdminUser($adminUser, $adminHash),
                medisaStagingSeedRegularUser($userHash),
            ],
            'ayarlar' => medisaStagingSeedAyarlar($adminUser, $fixtureSlug),
        ],
        medisaStagingSeedEmptyCollections(),
        $km
    );
}

function medisaStagingSeedClone(array $document): array
{
    return json_decode(json_encode($document, JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR);
}

function medisaStagingSeedWithFixture(array $document, string $fixtureSlug, callable $mutator): array
{
    $copy = medisaStagingSeedClone($document);
    $copy['ayarlar'] = medisaStagingSeedAyarlar(
        (string)($copy['users'][0]['id'] ?? 'staging_admin'),
        $fixtureSlug
    );
    $mutator($copy);

    return $copy;
}

$opts = medisaStagingSeedParseArgs($argv);

if ($opts['admin_user'] === '') {
    medisaStagingSeedFail('MEDISA_STAGING_ADMIN_USER bos olamaz.');
}
if ($opts['admin_password'] === '') {
    medisaStagingSeedFail('MEDISA_STAGING_ADMIN_PASSWORD zorunludur.');
}

$outputDir = medisaStagingSeedEnsureDir($opts['output_dir']);
$adminUser = $opts['admin_user'];
$adminHash = password_hash($opts['admin_password'], PASSWORD_DEFAULT);
$userHash = password_hash('StagingUser!1', PASSWORD_DEFAULT);

$baseline = medisaStagingSeedBuildDocument($adminUser, $adminHash, $userHash);
$validRestoreCandidate = medisaStagingSeedWithFixture($baseline, 'valid-restore-candidate', function (array &$doc): void {
    $doc['tasitlar'] = array_values(array_filter(
        $doc['tasitlar'],
        static fn(array $vehicle): bool => in_array((string)($vehicle['id'] ?? ''), ['v-test-1', 'v-test-2'], true)
    ));
});

$fixtures = [
    'valid-restore-candidate' => static function () use ($validRestoreCandidate): array {
        return $validRestoreCandidate;
    },
    'zero-active-general-manager' => static function () use ($baseline, $adminUser, $adminHash, $userHash): array {
        return medisaStagingSeedWithFixture($baseline, 'zero-active-general-manager', static function (array &$doc) use ($userHash): void {
            $doc['users'] = [medisaStagingSeedRegularUser($userHash)];
        });
    },
    'duplicate-user-id' => static function () use ($baseline, $adminUser, $adminHash, $userHash): array {
        return medisaStagingSeedWithFixture($baseline, 'duplicate-user-id', static function (array &$doc) use ($adminUser, $adminHash, $userHash): void {
            $doc['users'] = [
                medisaStagingSeedAdminUser($adminUser, $adminHash),
                medisaStagingSeedRegularUser($userHash),
                [
                    'id' => $adminUser,
                    'isim' => 'Duplicate Admin',
                    'kullanici_adi' => 'duplicate_admin',
                    'role' => 'kullanici',
                    'aktif' => true,
                    'sifre_hash' => $adminHash,
                ],
            ];
        });
    },
    'actor-missing' => static function () use ($baseline, $adminHash, $userHash): array {
        return medisaStagingSeedWithFixture($baseline, 'actor-missing', static function (array &$doc) use ($adminHash, $userHash): void {
            $doc['users'] = [
                medisaStagingSeedAltGmUser($adminHash),
                medisaStagingSeedRegularUser($userHash),
            ];
        });
    },
    'actor-inactive' => static function () use ($baseline, $adminUser, $adminHash, $userHash): array {
        return medisaStagingSeedWithFixture($baseline, 'actor-inactive', static function (array &$doc) use ($adminUser, $adminHash, $userHash): void {
            $doc['users'] = [
                medisaStagingSeedAdminUser($adminUser, $adminHash, false),
                medisaStagingSeedAltGmUser($adminHash),
                medisaStagingSeedRegularUser($userHash),
            ];
        });
    },
    'actor-role-downgrade' => static function () use ($baseline, $adminUser, $adminHash, $userHash): array {
        return medisaStagingSeedWithFixture($baseline, 'actor-role-downgrade', static function (array &$doc) use ($adminUser, $adminHash, $userHash): void {
            $doc['users'] = [
                medisaStagingSeedAdminUser($adminUser, $adminHash, true, 'kullanici'),
                medisaStagingSeedAltGmUser($adminHash),
                medisaStagingSeedRegularUser($userHash),
            ];
        });
    },
    'plaintext-credential' => static function () use ($baseline, $adminUser, $adminHash, $userHash): array {
        return medisaStagingSeedWithFixture($baseline, 'plaintext-credential', static function (array &$doc) use ($adminUser, $adminHash, $userHash): void {
            $admin = medisaStagingSeedAdminUser($adminUser, $adminHash);
            $admin['sifre'] = 'plaintext-secret';
            $doc['users'] = [$admin, medisaStagingSeedRegularUser($userHash)];
        });
    },
    'invalid-password-hash' => static function () use ($baseline, $adminUser, $userHash): array {
        return medisaStagingSeedWithFixture($baseline, 'invalid-password-hash', static function (array &$doc) use ($adminUser, $userHash): void {
            $admin = medisaStagingSeedAdminUser($adminUser, 'not-a-valid-bcrypt-hash');
            $doc['users'] = [$admin, medisaStagingSeedRegularUser($userHash)];
        });
    },
    'unknown-role' => static function () use ($baseline, $adminUser, $adminHash, $userHash): array {
        return medisaStagingSeedWithFixture($baseline, 'unknown-role', static function (array &$doc) use ($adminUser, $adminHash, $userHash): void {
            $admin = medisaStagingSeedAdminUser($adminUser, $adminHash);
            $admin['role'] = 'superadmin';
            $doc['users'] = [$admin, medisaStagingSeedRegularUser($userHash)];
        });
    },
    'unknown-collection' => static function () use ($baseline): array {
        return medisaStagingSeedWithFixture($baseline, 'unknown-collection', static function (array &$doc): void {
            $doc['mystery_collection'] = [['x' => 1]];
        });
    },
    'same-count-different-content' => static function () use ($baseline): array {
        return medisaStagingSeedWithFixture($baseline, 'same-count-different-content', static function (array &$doc): void {
            $doc['tasitlar'][0]['km'] = 16000;
            $doc['tasitlar'][0]['guncelKm'] = '16000';
            $doc['tasitlar'][1]['km'] = 22500;
            $doc['tasitlar'][1]['guncelKm'] = '22500';
            $doc['tasitlar'][2]['km'] = 31500;
            $doc['tasitlar'][2]['guncelKm'] = '31500';
        });
    },
    'replay-alternate-candidate' => static function () use ($baseline, $adminUser, $adminHash, $userHash): array {
        return medisaStagingSeedWithFixture($baseline, 'replay-alternate-candidate', static function (array &$doc) use ($adminUser, $adminHash, $userHash): void {
            $doc['tasitlar'] = [
                medisaStagingSeedVehicle('v-test-2', 'TEST 002', 22500, [], [['id' => 'doc-v-test-2-alt']]),
                medisaStagingSeedVehicle('v-test-3', 'TEST 003', 32000, [], [['id' => 'doc-v-test-3-alt']]),
            ];
            $doc['users'] = [
                medisaStagingSeedAdminUser($adminUser, $adminHash),
                medisaStagingSeedRegularUser($userHash),
            ];
            $doc['ayarlar']['sirketAdi'] = 'Medisa Staging Alternate';
        });
    },
];

$expectedFixtures = [
    'valid-restore-candidate',
    'zero-active-general-manager',
    'duplicate-user-id',
    'actor-missing',
    'actor-inactive',
    'actor-role-downgrade',
    'plaintext-credential',
    'invalid-password-hash',
    'unknown-role',
    'unknown-collection',
    'same-count-different-content',
    'replay-alternate-candidate',
];

$written = 0;

$dataJsonPath = medisaStagingSeedSafePath($outputDir, 'data/data.json');
medisaStagingSeedWriteJson($dataJsonPath, $baseline);
$written++;

$backupPath = medisaStagingSeedSafePath($outputDir, 'data/data.json.backup');
medisaStagingSeedWriteJson($backupPath, $validRestoreCandidate);
$written++;

$sequence = 0;
foreach ($expectedFixtures as $fixtureSlug) {
    if (!isset($fixtures[$fixtureSlug])) {
        medisaStagingSeedFail('Fixture tanimi eksik: ' . $fixtureSlug);
    }
    $snapshotName = medisaStagingSeedSnapshotBasename($fixtureSlug, $sequence);
    $snapshotPath = medisaStagingSeedSafePath($outputDir, 'data/backups/' . $snapshotName);
    medisaStagingSeedWriteJson($snapshotPath, $fixtures[$fixtureSlug]());
    $written++;
    $sequence++;
}

echo 'Seed wrote ' . $written . ' files to ' . $outputDir . "\n";
exit(0);
