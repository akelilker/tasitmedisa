<?php
/**
 * Owner-only varsayılan kimlik bilgisi migrasyonu.
 *
 * Kural:
 * - Kullanıcı adı: ilk ad (küçük ASCII) + soyadın ilk harfi (büyük ASCII)
 * - Geçici parola: Soyad (ASCII, baş harf büyük) + 123
 * - İlk giriş parola değişikliği zorunlu
 *
 * Parola veya hash değerlerini çıktıya yazmaz.
 *
 * Kullanım:
 *   php scripts/migrate-medisa-default-credentials.php --mode=dry-run --data=/path/to/data.json --expect-users=47
 *   php scripts/migrate-medisa-default-credentials.php --mode=apply --confirm=RESET_DEFAULT_CREDENTIALS --data=/path/to/data.json --expect-users=47
 */

declare(strict_types=1);

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'core.php';

function medisaDefaultCredentialsParseArgs(array $argv): array
{
    $opts = [
        'mode' => 'dry-run',
        'data' => getDataFilePath(),
        'confirm' => '',
        'expect_users' => 47,
    ];

    foreach (array_slice($argv, 1) as $arg) {
        if (strpos($arg, '--mode=') === 0) {
            $opts['mode'] = trim(substr($arg, 7));
        } elseif (strpos($arg, '--data=') === 0) {
            $opts['data'] = trim(substr($arg, 7));
        } elseif (strpos($arg, '--confirm=') === 0) {
            $opts['confirm'] = trim(substr($arg, 10));
        } elseif (strpos($arg, '--expect-users=') === 0) {
            $opts['expect_users'] = (int)trim(substr($arg, 15));
        } elseif ($arg === '--help' || $arg === '-h') {
            echo "Owner-only varsayılan kimlik bilgisi migrasyonu. Parola/hash çıktısı üretmez.\n";
            exit(0);
        } else {
            throw new RuntimeException('UNKNOWN_ARGUMENT');
        }
    }

    return $opts;
}

function medisaDefaultCredentialsTransliterate(string $value): string
{
    return strtr($value, [
        'Ç' => 'C',
        'ç' => 'c',
        'Ğ' => 'G',
        'ğ' => 'g',
        'İ' => 'I',
        'ı' => 'i',
        'Ö' => 'O',
        'ö' => 'o',
        'Ş' => 'S',
        'ş' => 's',
        'Ü' => 'U',
        'ü' => 'u',
    ]);
}

function medisaDefaultCredentialsAsciiToken(string $value): string
{
    $ascii = medisaDefaultCredentialsTransliterate(trim($value));
    return (string)preg_replace('/[^A-Za-z0-9]/', '', $ascii);
}

/**
 * @return array{username:string,password:string,password_length:int}
 */
function medisaBuildLegacyDefaultCredentials(array $user): array
{
    $fullName = trim((string)($user['isim'] ?? $user['name'] ?? $user['ad_soyad'] ?? ''));
    $parts = preg_split('/\s+/u', $fullName, -1, PREG_SPLIT_NO_EMPTY);
    if (!is_array($parts) || count($parts) < 1) {
        throw new RuntimeException('USER_NAME_PARTS_INVALID');
    }

    $firstName = medisaDefaultCredentialsAsciiToken((string)$parts[0]);
    $surname = medisaDefaultCredentialsAsciiToken((string)$parts[count($parts) - 1]);
    if ($firstName === '' || $surname === '') {
        throw new RuntimeException('USER_NAME_ASCII_INVALID');
    }

    $username = strtolower($firstName) . strtoupper(substr($surname, 0, 1));
    $password = strtoupper(substr($surname, 0, 1)) . strtolower(substr($surname, 1)) . '123';
    $passwordLength = strlen($password);
    $passwordValid = $passwordLength >= 6
        && preg_match('/[A-Z]/', $password) === 1
        && preg_match('/[a-z]/', $password) === 1
        && preg_match('/[0-9]/', $password) === 1;
    if (!$passwordValid) {
        throw new RuntimeException('DEFAULT_PASSWORD_POLICY_INVALID');
    }

    return [
        'username' => $username,
        'password' => $password,
        'password_length' => $passwordLength,
    ];
}

function medisaDefaultCredentialsLoadData(string $path): array
{
    if (!is_file($path)) {
        throw new RuntimeException('DATA_MISSING');
    }

    $raw = file_get_contents($path);
    if ($raw === false) {
        throw new RuntimeException('DATA_READ_FAILED');
    }

    $data = json_decode($raw, true);
    if (!is_array($data) || !isset($data['users']) || !is_array($data['users'])) {
        throw new RuntimeException('DATA_INVALID');
    }

    return [$raw, $data];
}

function medisaDefaultCredentialsIsValidHash(string $hash): bool
{
    if ($hash === '') {
        return false;
    }
    $info = password_get_info($hash);
    return is_array($info) && !empty($info['algo']);
}

function medisaDefaultCredentialsAcquireLock(string $dataPath)
{
    $lockPath = dirname($dataPath) . DIRECTORY_SEPARATOR . '.medisa_data.lock';
    $handle = @fopen($lockPath, 'c+');
    if (!$handle || !@flock($handle, LOCK_EX)) {
        if (is_resource($handle)) {
            @fclose($handle);
        }
        throw new RuntimeException('DATA_LOCK_FAILED');
    }
    return $handle;
}

function medisaDefaultCredentialsReleaseLock($handle): void
{
    if (!is_resource($handle)) {
        return;
    }
    @flock($handle, LOCK_UN);
    @fclose($handle);
}

function medisaDefaultCredentialsSecureBackup(string $dataPath, string $raw): array
{
    $secureDir = dirname($dataPath) . DIRECTORY_SEPARATOR . '.migration-secure';
    if (!is_dir($secureDir) && !@mkdir($secureDir, 0750, true)) {
        throw new RuntimeException('SECURE_BACKUP_DIR_FAILED');
    }
    @chmod($secureDir, 0750);

    $stamp = gmdate('Ymd\THis\Z');
    $backupPath = $secureDir . DIRECTORY_SEPARATOR . "pre-default-credentials-{$stamp}.json";
    if (!medisaAtomicWriteFile($backupPath, $raw)) {
        throw new RuntimeException('ROLLBACK_BACKUP_WRITE_FAILED');
    }
    @chmod($backupPath, 0640);

    $backupRaw = file_get_contents($backupPath);
    if ($backupRaw === false || !hash_equals(hash('sha256', $raw), hash('sha256', $backupRaw))) {
        throw new RuntimeException('ROLLBACK_BACKUP_VERIFY_FAILED');
    }

    return [
        'path' => str_replace('\\', '/', $backupPath),
        'sha256' => hash('sha256', $backupRaw),
        'bytes' => strlen($backupRaw),
    ];
}

function medisaDefaultCredentialsUserWithoutAllowedFields(array $user): array
{
    foreach ([
        'kullanici_adi',
        'sifre',
        'sifre_hash',
        'sifre_guncellendi_at',
        'ilk_giris_parola_onerisi_bekliyor',
    ] as $field) {
        unset($user[$field]);
    }
    return $user;
}

function medisaDefaultCredentialsPrepare(array $users, int $expectedUsers): array
{
    if ($expectedUsers < 1 || count($users) !== $expectedUsers) {
        throw new RuntimeException('USER_COUNT_MISMATCH');
    }

    $seenIds = [];
    $seenUsernames = [];
    $transformed = [];
    $defaultsById = [];
    $usernameChanges = 0;
    $minimumPasswordLength = null;

    foreach ($users as $user) {
        if (!is_array($user)) {
            throw new RuntimeException('USER_RECORD_INVALID');
        }

        $userId = trim((string)($user['id'] ?? ''));
        if ($userId === '' || isset($seenIds[$userId])) {
            throw new RuntimeException($userId === '' ? 'USER_ID_MISSING' : 'DUPLICATE_USER_IDS');
        }
        $seenIds[$userId] = true;

        $credentials = medisaBuildLegacyDefaultCredentials($user);
        $usernameKey = strtolower($credentials['username']);
        if (isset($seenUsernames[$usernameKey])) {
            throw new RuntimeException('USERNAME_COLLISION');
        }
        $seenUsernames[$usernameKey] = true;

        if ((string)($user['kullanici_adi'] ?? '') !== $credentials['username']) {
            $usernameChanges++;
        }
        $minimumPasswordLength = $minimumPasswordLength === null
            ? $credentials['password_length']
            : min($minimumPasswordLength, $credentials['password_length']);

        $out = $user;
        $out['kullanici_adi'] = $credentials['username'];
        medisaSetUserPasswordHash($out, $credentials['password']);
        $out['ilk_giris_parola_onerisi_bekliyor'] = true;

        if (medisaDefaultCredentialsUserWithoutAllowedFields($out)
            !== medisaDefaultCredentialsUserWithoutAllowedFields($user)
        ) {
            throw new RuntimeException('UNEXPECTED_USER_FIELD_CHANGE');
        }

        $transformed[] = $out;
        $defaultsById[$userId] = $credentials['password'];
    }

    return [
        'users' => $transformed,
        'defaults_by_id' => $defaultsById,
        'username_changes' => $usernameChanges,
        'minimum_password_length' => $minimumPasswordLength ?? 0,
        'unique_usernames' => count($seenUsernames),
    ];
}

function medisaDefaultCredentialsPostCheck(array $beforeUsers, array $afterUsers, array $defaultsById): array
{
    if (count($beforeUsers) !== count($afterUsers)) {
        throw new RuntimeException('POST_USER_COUNT_MISMATCH');
    }

    $beforeById = [];
    foreach ($beforeUsers as $user) {
        if (is_array($user)) {
            $beforeById[(string)($user['id'] ?? '')] = $user;
        }
    }

    $validHashes = 0;
    $plaintext = 0;
    $pending = 0;
    $defaultPasswordVerified = 0;
    $otherFieldChanges = 0;

    foreach ($afterUsers as $user) {
        if (!is_array($user)) {
            throw new RuntimeException('POST_USER_RECORD_INVALID');
        }
        $userId = (string)($user['id'] ?? '');
        if (!isset($beforeById[$userId], $defaultsById[$userId])) {
            throw new RuntimeException('POST_USER_ID_MISMATCH');
        }

        $hash = trim((string)($user['sifre_hash'] ?? ''));
        if (medisaDefaultCredentialsIsValidHash($hash)) {
            $validHashes++;
        }
        if (trim((string)($user['sifre'] ?? '')) !== '') {
            $plaintext++;
        }
        if (($user['ilk_giris_parola_onerisi_bekliyor'] ?? null) === true) {
            $pending++;
        }
        if ($hash !== '' && password_verify($defaultsById[$userId], $hash)) {
            $defaultPasswordVerified++;
        }
        if (medisaDefaultCredentialsUserWithoutAllowedFields($beforeById[$userId])
            !== medisaDefaultCredentialsUserWithoutAllowedFields($user)
        ) {
            $otherFieldChanges++;
        }
    }

    $expected = count($afterUsers);
    if ($validHashes !== $expected
        || $plaintext !== 0
        || $pending !== $expected
        || $defaultPasswordVerified !== $expected
        || $otherFieldChanges !== 0
    ) {
        throw new RuntimeException('POST_CHECK_FAILED');
    }

    return [
        'valid_hashes' => $validHashes,
        'plaintext' => $plaintext,
        'first_login_pending' => $pending,
        'default_password_verified' => $defaultPasswordVerified,
        'other_user_field_changes' => $otherFieldChanges,
    ];
}

function medisaDefaultCredentialsRun(array $opts): array
{
    $mode = (string)($opts['mode'] ?? 'dry-run');
    $dataPath = (string)($opts['data'] ?? '');
    $expectedUsers = (int)($opts['expect_users'] ?? 47);
    if (!in_array($mode, ['dry-run', 'apply'], true)) {
        throw new RuntimeException('INVALID_MODE');
    }
    if ($mode === 'apply' && ($opts['confirm'] ?? '') !== 'RESET_DEFAULT_CREDENTIALS') {
        throw new RuntimeException('APPLY_CONFIRM_REQUIRED');
    }

    $lockHandle = null;
    try {
        if ($mode === 'apply') {
            $lockHandle = medisaDefaultCredentialsAcquireLock($dataPath);
        }

        [$beforeRaw, $data] = medisaDefaultCredentialsLoadData($dataPath);
        $beforeSha = hash('sha256', $beforeRaw);
        $beforeUsers = $data['users'];
        $prepared = medisaDefaultCredentialsPrepare($beforeUsers, $expectedUsers);

        $report = [
            'mode' => $mode,
            'data_path' => str_replace('\\', '/', $dataPath),
            'before_sha256' => $beforeSha,
            'before_bytes' => strlen($beforeRaw),
            'users_before' => count($beforeUsers),
            'users_after' => count($prepared['users']),
            'unique_usernames' => $prepared['unique_usernames'],
            'username_collisions' => 0,
            'username_changes' => $prepared['username_changes'],
            'password_hashes_to_replace' => count($prepared['users']),
            'minimum_default_password_length' => $prepared['minimum_password_length'],
            'first_login_flags_to_set' => count($prepared['users']),
            'other_user_field_changes' => 0,
            'applied' => false,
            'rollback_backup' => null,
            'post_checks' => null,
            'secrets_logged' => false,
        ];

        if ($mode === 'dry-run') {
            $afterProbe = file_get_contents($dataPath);
            if ($afterProbe === false || !hash_equals($beforeSha, hash('sha256', $afterProbe))) {
                throw new RuntimeException('DRY_RUN_MUTATED_DATA');
            }
            $report['dry_run_data_unchanged'] = true;
            return $report;
        }

        $backup = medisaDefaultCredentialsSecureBackup($dataPath, $beforeRaw);
        $report['rollback_backup'] = $backup;

        $data['users'] = $prepared['users'];
        $jsonFlags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT;
        if (defined('JSON_INVALID_UTF8_SUBSTITUTE')) {
            $jsonFlags |= JSON_INVALID_UTF8_SUBSTITUTE;
        }
        $encoded = json_encode($data, $jsonFlags);
        if ($encoded === false || !medisaAtomicWriteFile($dataPath, $encoded)) {
            throw new RuntimeException('ATOMIC_WRITE_FAILED');
        }

        try {
            [, $afterData] = medisaDefaultCredentialsLoadData($dataPath);
            $postChecks = medisaDefaultCredentialsPostCheck(
                $beforeUsers,
                $afterData['users'],
                $prepared['defaults_by_id']
            );
        } catch (Throwable $postError) {
            if (!medisaAtomicWriteFile($dataPath, $beforeRaw)) {
                throw new RuntimeException('POST_CHECK_AND_ROLLBACK_FAILED');
            }
            throw $postError;
        }

        $afterRaw = file_get_contents($dataPath);
        if ($afterRaw === false) {
            throw new RuntimeException('POST_READ_FAILED');
        }
        $report['applied'] = true;
        $report['after_sha256'] = hash('sha256', $afterRaw);
        $report['after_bytes'] = strlen($afterRaw);
        $report['post_checks'] = $postChecks;
        $report['sessions_invalidated'] = count($prepared['users']);
        return $report;
    } finally {
        medisaDefaultCredentialsReleaseLock($lockHandle);
    }
}

if (PHP_SAPI === 'cli'
    && isset($_SERVER['SCRIPT_FILENAME'])
    && realpath((string)$_SERVER['SCRIPT_FILENAME']) === realpath(__FILE__)
) {
    try {
        $report = medisaDefaultCredentialsRun(medisaDefaultCredentialsParseArgs($argv));
        echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
        exit(0);
    } catch (Throwable $e) {
        fwrite(STDERR, 'ERROR: ' . $e->getMessage() . PHP_EOL);
        exit(1);
    }
}
