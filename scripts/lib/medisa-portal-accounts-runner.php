<?php
/**
 * Paylaşımlı portal hesap dry-run / apply mantığı (CLI araçları).
 * Web endpoint değildir.
 */

function medisaPortalAccountsRepoRoot() {
    return realpath(__DIR__ . '/../..');
}

function medisaPortalAccountsIsValidUsername($username) {
    $value = trim((string)$username);
    return $value !== '' && preg_match('/^[A-Za-z][A-Za-z0-9]*$/', $value) === 1;
}

function medisaPortalAccountsUserIsActive($user) {
    return is_array($user) && (!isset($user['aktif']) || $user['aktif'] === true);
}

function medisaPortalAccountsUserHasCredential($user) {
    if (!is_array($user)) {
        return false;
    }
    $plain = trim((string)($user['sifre'] ?? ''));
    $hash = trim((string)($user['sifre_hash'] ?? ''));
    return $plain !== '' || $hash !== '';
}

function medisaPortalAccountsUserHasPortalAccount($user) {
    if (!is_array($user)) {
        return false;
    }
    $username = trim((string)($user['kullanici_adi'] ?? ''));
    return medisaPortalAccountsIsValidUsername($username) && medisaPortalAccountsUserHasCredential($user);
}

function medisaPortalAccountsSuggestionCompleted($user) {
    if (!is_array($user)) {
        return false;
    }
    if (($user['ilk_giris_parola_onerisi_bekliyor'] ?? null) === false) {
        $shownAt = trim((string)($user['ilk_giris_parola_onerisi_gosterildi_tarihi'] ?? ''));
        if ($shownAt !== '') {
            return true;
        }
    }
    return false;
}

function medisaPortalAccountsResolvePathOutsideRepo($path, $mustExist = true) {
    $repoRoot = medisaPortalAccountsRepoRoot();
    $real = realpath($path);
    if ($real === false || $repoRoot === false) {
        return null;
    }
    $repoPrefix = strtolower(rtrim(str_replace('\\', '/', $repoRoot), '/'));
    $candidate = strtolower(str_replace('\\', '/', $real));
    if ($candidate === $repoPrefix || str_starts_with($candidate, $repoPrefix . '/')) {
        return null;
    }
    if ($mustExist && (!is_file($real) || filesize($real) <= 0)) {
        return null;
    }
    return $real;
}

function medisaPortalAccountsResolveOutputDirOutsideRepo($path) {
    $repoRoot = medisaPortalAccountsRepoRoot();
    if ($repoRoot === false) {
        return null;
    }
    $real = realpath($path);
    if ($real === false) {
        if (!is_dir($path) && !@mkdir($path, 0700, true)) {
            return null;
        }
        $real = realpath($path);
    }
    if ($real === false || !is_dir($real)) {
        return null;
    }
    $repoPrefix = strtolower(rtrim(str_replace('\\', '/', $repoRoot), '/'));
    $candidate = strtolower(str_replace('\\', '/', $real));
    if ($candidate === $repoPrefix || str_starts_with($candidate, $repoPrefix . '/')) {
        return null;
    }
    return $real;
}

function medisaPortalAccountsCaptureInputIntegrity($inputPath) {
    return [
        'sha256' => hash_file('sha256', $inputPath),
        'size' => filesize($inputPath),
        'mtime' => filemtime($inputPath),
    ];
}

function medisaPortalAccountsVerifyInputIntegrity($inputPath, array $before) {
    return is_file($inputPath)
        && filesize($inputPath) === ($before['size'] ?? -1)
        && filemtime($inputPath) === ($before['mtime'] ?? -1)
        && hash_file('sha256', $inputPath) === ($before['sha256'] ?? '');
}

function medisaPortalAccountsHashIsValid($hash) {
    $value = trim((string)$hash);
    if ($value === '') {
        return false;
    }
    return (password_get_info($value)['algoName'] ?? 'unknown') !== 'unknown';
}

function medisaPortalAccountsCredentialFieldNames() {
    return [
        'kullanici_adi',
        'sifre',
        'sifre_hash',
        'sifre_guncellendi_at',
        'ilk_giris_parola_onerisi_bekliyor',
        'ilk_giris_parola_onerisi_gosterildi_tarihi',
        'parola_son_degisim_tarihi',
        'portal_credential_durumu',
        'portal_sifresi_var',
    ];
}

function medisaPortalAccountsUserComparableSnapshot($user) {
    if (!is_array($user)) {
        return [];
    }
    $copy = $user;
    foreach (medisaPortalAccountsCredentialFieldNames() as $field) {
        unset($copy[$field]);
    }
    ksort($copy);
    return $copy;
}

function medisaPortalAccountsMigrateLegacyPlaintext(&$user) {
    $plain = trim((string)($user['sifre'] ?? ''));
    if ($plain === '') {
        return null;
    }
    $user['sifre_hash'] = password_hash($plain, PASSWORD_DEFAULT);
    $user['sifre_guncellendi_at'] = date('c');
    $user['portal_credential_durumu'] = 'aktif';
    if (!medisaPortalAccountsSuggestionCompleted($user)) {
        $user['ilk_giris_parola_onerisi_bekliyor'] = true;
        $user['ilk_giris_parola_onerisi_gosterildi_tarihi'] = null;
    } else {
        $user['ilk_giris_parola_onerisi_bekliyor'] = false;
    }
    unset($user['sifre']);
    return $plain;
}

function medisaPortalAccountsNormalizeExistingPortalUser(&$user) {
    $plainPassword = null;
    $username = trim((string)($user['kullanici_adi'] ?? ''));
    if (!medisaPortalAccountsIsValidUsername($username)) {
        return null;
    }
    $plain = trim((string)($user['sifre'] ?? ''));
    $hash = trim((string)($user['sifre_hash'] ?? ''));
    if ($plain !== '') {
        $plainPassword = medisaPortalAccountsMigrateLegacyPlaintext($user);
    } elseif ($hash !== '' && medisaPortalAccountsHashIsValid($hash)) {
        unset($user['sifre']);
        $user['portal_credential_durumu'] = $user['portal_credential_durumu'] ?? 'aktif';
    }
    return [
        'username' => $username,
        'plain_password' => $plainPassword,
        'csv_password_status' => $plainPassword !== null ? 'BILINEN_PAROLA' : ($hash !== '' ? 'MEVCUT_HASH_KORUNDU' : 'PAROLA_YOK'),
        'action' => 'preserved',
    ];
}

function medisaPortalAccountsBuildCsvCell($value) {
    $text = (string)$value;
    if ($text !== '' && preg_match('/^[=+\-@\t\r]/', $text) === 1) {
        $text = "'" . $text;
    }
    if (str_contains($text, '"') || str_contains($text, ',') || str_contains($text, "\n") || str_contains($text, "\r")) {
        return '"' . str_replace('"', '""', $text) . '"';
    }
    return $text;
}

function medisaPortalAccountsBuildCsvRow(array $row) {
    $cells = [
        medisaPortalAccountsBuildCsvCell($row['user_id'] ?? ''),
        medisaPortalAccountsBuildCsvCell($row['full_name'] ?? ''),
        medisaPortalAccountsBuildCsvCell($row['username'] ?? ''),
        medisaPortalAccountsBuildCsvCell($row['password_cell'] ?? ''),
        medisaPortalAccountsBuildCsvCell($row['role'] ?? ''),
        medisaPortalAccountsBuildCsvCell($row['active_label'] ?? ''),
        medisaPortalAccountsBuildCsvCell($row['suggestion_label'] ?? ''),
    ];
    return implode(',', $cells);
}

function medisaPortalAccountsSuggestionLabel($user) {
    return (($user['ilk_giris_parola_onerisi_bekliyor'] ?? false) === true) ? 'Evet' : 'Hayır';
}

function medisaPortalAccountsPasswordCell(array $meta) {
    $status = (string)($meta['csv_password_status'] ?? '');
    if ($status === 'MEVCUT_HASH_KORUNDU') {
        return 'MEVCUT_HASH_KORUNDU';
    }
    if ($status === 'PAROLA_YOK') {
        return '';
    }
    return (string)($meta['plain_password'] ?? '');
}

function medisaPortalAccountsTransformData(array $data, $includeCsvRows = false) {
    if (!isset($data['users']) || !is_array($data['users'])) {
        throw new RuntimeException('users koleksiyonu geçersiz.');
    }
    $users = array_values($data['users']);
    $beforeSnapshots = [];
    foreach ($users as $idx => $user) {
        if (!is_array($user)) {
            continue;
        }
        $beforeSnapshots[$idx] = medisaPortalAccountsUserComparableSnapshot($user);
    }

    $stats = [
        'total_users' => count($users),
        'active_users' => 0,
        'passive_users' => 0,
        'roles' => [],
        'portal_accounts_before' => 0,
        'portal_accounts_after' => 0,
        'preserved_existing_credentials' => 0,
        'legacy_plaintext_migrated' => 0,
        'new_credentials_created' => 0,
        'passive_excluded' => 0,
        'eligible_active_without_credentials' => 0,
        'planned_accounts' => 0,
        'valid_usernames' => 0,
        'username_collisions' => 0,
        'legacy_plaintext_records' => 0,
        'canonical_hash_present' => 0,
        'canonical_hash_missing' => 0,
        'canonical_hash_invalid' => 0,
        'credential_inconsistent_records' => 0,
        'plaintext_fields_remaining' => 0,
        'invalid_usernames_remaining' => 0,
    ];
    $csvRows = [];
    $usernameLookup = [];

    foreach ($users as $user) {
        if (!is_array($user)) {
            continue;
        }
        if (medisaPortalAccountsUserHasPortalAccount($user)) {
            $stats['portal_accounts_before']++;
        }
        $active = medisaPortalAccountsUserIsActive($user);
        $active ? $stats['active_users']++ : $stats['passive_users']++;
        $role = medisaResolveUserRole($user);
        $stats['roles'][$role] = ($stats['roles'][$role] ?? 0) + 1;
        $username = trim((string)($user['kullanici_adi'] ?? ''));
        $usernameValid = medisaPortalAccountsIsValidUsername($username);
        if ($usernameValid) {
            $stats['valid_usernames']++;
            $key = medisaPortalUsernameKey($username);
            if (isset($usernameLookup[$key])) {
                $stats['username_collisions']++;
            }
            $usernameLookup[$key] = true;
        }
        $plain = trim((string)($user['sifre'] ?? ''));
        $hash = trim((string)($user['sifre_hash'] ?? ''));
        if ($plain !== '') {
            $stats['legacy_plaintext_records']++;
        }
        if ($hash === '') {
            $stats['canonical_hash_missing']++;
        } elseif (!medisaPortalAccountsHashIsValid($hash)) {
            $stats['canonical_hash_invalid']++;
        } else {
            $stats['canonical_hash_present']++;
        }
        $hasCredential = medisaPortalAccountsUserHasCredential($user);
        if (($usernameValid && !$hasCredential) || (!$usernameValid && $hasCredential)) {
            $stats['credential_inconsistent_records']++;
        }
        if ($active && !medisaPortalAccountsUserHasPortalAccount($user)) {
            $stats['eligible_active_without_credentials']++;
            $stats['planned_accounts']++;
        }
    }

    $transformMeta = [];
    foreach ($users as $idx => &$user) {
        if (!is_array($user)) {
            continue;
        }
        $meta = null;
        if (!medisaPortalAccountsUserIsActive($user)) {
            $stats['passive_excluded']++;
            if (trim((string)($user['sifre'] ?? '')) !== '') {
                medisaPortalAccountsMigrateLegacyPlaintext($user);
            }
            $meta = ['action' => 'passive_skipped'];
        } elseif (medisaPortalAccountsUserHasPortalAccount($user)) {
            $meta = medisaPortalAccountsNormalizeExistingPortalUser($user);
            $stats['preserved_existing_credentials']++;
            if (($meta['csv_password_status'] ?? '') === 'BILINEN_PAROLA') {
                $stats['legacy_plaintext_migrated']++;
            }
        } else {
            $plainBefore = trim((string)($user['sifre'] ?? ''));
            $userId = (string)($user['id'] ?? '');
            $fullName = $user['isim'] ?? $user['name'] ?? '';
            $username = medisaCreateUniquePortalUsername($fullName, $users, $userId);
            if ($username === '') {
                throw new RuntimeException('Kullanıcı adı oluşturulamadı.');
            }
            $user['kullanici_adi'] = $username;
            if ($plainBefore !== '') {
                $plainPassword = medisaPortalAccountsMigrateLegacyPlaintext($user);
                $meta = [
                    'username' => $username,
                    'plain_password' => $plainPassword,
                    'csv_password_status' => 'BILINEN_PAROLA',
                    'action' => 'created',
                ];
                $stats['legacy_plaintext_migrated']++;
            } else {
                $plainPassword = medisaAssignInitialPortalPassword($user, $users);
                $meta = [
                    'username' => $username,
                    'plain_password' => $plainPassword,
                    'csv_password_status' => 'YENI_BASLANGIC_PAROLASI',
                    'action' => 'created',
                ];
            }
            $stats['new_credentials_created']++;
        }
        $transformMeta[$idx] = $meta;
        $username = trim((string)($user['kullanici_adi'] ?? ''));
        if ($username !== '') {
            $usernameLookup[medisaPortalUsernameKey($username)] = true;
        }
        if (medisaPortalAccountsUserHasPortalAccount($user)) {
            $stats['portal_accounts_after']++;
        }
        if (trim((string)($user['sifre'] ?? '')) !== '') {
            $stats['plaintext_fields_remaining']++;
        }
        if (!medisaPortalAccountsIsValidUsername($user['kullanici_adi'] ?? '')) {
            $stats['invalid_usernames_remaining']++;
        }
        $hash = trim((string)($user['sifre_hash'] ?? ''));
        if ($hash === '' || !medisaPortalAccountsHashIsValid($hash)) {
            if (($meta['action'] ?? '') !== 'passive_skipped') {
                throw new RuntimeException('Credential sonrası geçersiz hash kaldı.');
            }
        }
        if ($includeCsvRows && is_array($meta) && ($meta['action'] ?? '') !== 'passive_skipped') {
            $csvRows[] = [
                'user_id' => (string)($user['id'] ?? ''),
                'full_name' => (string)($user['isim'] ?? $user['name'] ?? ''),
                'username' => (string)($user['kullanici_adi'] ?? ''),
                'password_cell' => medisaPortalAccountsPasswordCell($meta),
                'role' => medisaResolveUserRole($user),
                'active_label' => medisaPortalAccountsUserIsActive($user) ? 'Aktif' : 'Pasif',
                'suggestion_label' => medisaPortalAccountsSuggestionLabel($user),
            ];
        }
    }
    unset($user);

    foreach ($users as $idx => $user) {
        if (!is_array($user)) {
            continue;
        }
        $after = medisaPortalAccountsUserComparableSnapshot($user);
        $before = $beforeSnapshots[$idx] ?? [];
        if ($after !== $before) {
            $meta = $transformMeta[$idx] ?? [];
            if (($meta['action'] ?? '') === 'passive_skipped') {
                throw new RuntimeException('Pasif kullanıcı credential dışı alanları değişti.');
            }
        }
    }

    ksort($stats['roles']);
    $data['users'] = $users;
    return [
        'data' => $data,
        'stats' => $stats,
        'csv_rows' => $csvRows,
    ];
}

function medisaPortalAccountsComputeDryRunReport(array $data) {
    $users = is_array($data['users'] ?? null) ? array_values($data['users']) : [];
    $counts = [
        'total_users' => count($users),
        'active_users' => 0,
        'passive_users' => 0,
        'roles' => [],
        'portal_accounts' => 0,
        'eligible_active_without_credentials' => 0,
        'valid_usernames' => 0,
        'username_collisions' => 0,
        'planned_accounts' => 0,
        'preserved_existing_credentials' => 0,
        'passive_excluded_from_auto' => 0,
        'legacy_plaintext_present' => false,
        'legacy_plaintext_records' => 0,
        'canonical_hash_present' => 0,
        'canonical_hash_missing' => 0,
        'canonical_hash_invalid' => 0,
        'credential_inconsistent_records' => 0,
    ];
    $existingUsernameLookup = [];
    foreach ($users as $user) {
        if (!is_array($user)) {
            continue;
        }
        $active = medisaPortalAccountsUserIsActive($user);
        $active ? $counts['active_users']++ : $counts['passive_users']++;
        if (!$active) {
            $counts['passive_excluded_from_auto']++;
        }
        $role = medisaResolveUserRole($user);
        $counts['roles'][$role] = ($counts['roles'][$role] ?? 0) + 1;
        $username = trim((string)($user['kullanici_adi'] ?? ''));
        $usernameValid = medisaPortalAccountsIsValidUsername($username);
        if ($usernameValid) {
            $counts['valid_usernames']++;
        }
        if ($username !== '') {
            $key = medisaPortalUsernameKey($username);
            if (isset($existingUsernameLookup[$key])) {
                $counts['username_collisions']++;
            }
            $existingUsernameLookup[$key] = true;
        }
        $plain = trim((string)($user['sifre'] ?? ''));
        $hash = trim((string)($user['sifre_hash'] ?? ''));
        if ($plain !== '') {
            $counts['legacy_plaintext_present'] = true;
            $counts['legacy_plaintext_records']++;
        }
        if ($hash === '') {
            $counts['canonical_hash_missing']++;
        } elseif (!medisaPortalAccountsHashIsValid($hash)) {
            $counts['canonical_hash_invalid']++;
        } else {
            $counts['canonical_hash_present']++;
        }
        $hasCredential = medisaPortalAccountsUserHasCredential($user);
        $hasPortalAccount = medisaPortalAccountsUserHasPortalAccount($user);
        if ($hasPortalAccount) {
            $counts['portal_accounts']++;
            $counts['preserved_existing_credentials']++;
        }
        if (($usernameValid && !$hasCredential) || (!$usernameValid && $hasCredential)) {
            $counts['credential_inconsistent_records']++;
        }
        if ($active && !$hasPortalAccount) {
            $counts['eligible_active_without_credentials']++;
            $counts['planned_accounts']++;
        }
    }

    $plannedLookup = $existingUsernameLookup;
    foreach ($users as $user) {
        if (!is_array($user)) {
            continue;
        }
        $active = medisaPortalAccountsUserIsActive($user);
        $hasCredential = medisaPortalAccountsUserHasCredential($user);
        $username = trim((string)($user['kullanici_adi'] ?? ''));
        $usernameValid = medisaPortalAccountsIsValidUsername($username);
        if (!$active || medisaPortalAccountsUserHasPortalAccount($user) || $usernameValid) {
            continue;
        }
        $fullName = $user['isim'] ?? $user['name'] ?? '';
        $base = medisaBuildPortalUsernameBase($fullName);
        if ($base !== '' && isset($plannedLookup[medisaPortalUsernameKey($base)])) {
            $counts['username_collisions']++;
        }
        if ($base !== '') {
            $candidate = $base;
            $suffix = 2;
            while (isset($plannedLookup[medisaPortalUsernameKey($candidate)])) {
                $candidate = $base . $suffix++;
            }
            $plannedLookup[medisaPortalUsernameKey($candidate)] = true;
        }
    }
    ksort($counts['roles']);
    return $counts;
}

function medisaPortalAccountsWriteAtomic($path, $content) {
    return medisaAtomicWriteFile($path, $content);
}

function medisaPortalAccountsHardenOutputAcl($path) {
    if (PHP_OS_FAMILY !== 'Windows') {
        return true;
    }
    $username = getenv('USERNAME') ?: getenv('USER') ?: '';
    if ($username === '') {
        return false;
    }
    $command = 'icacls ' . escapeshellarg($path)
        . ' /inheritance:r /grant:r ' . escapeshellarg($username . ':(F)');
    $output = [];
    $exitCode = 1;
    @exec($command, $output, $exitCode);
    return $exitCode === 0;
}

function medisaPortalAccountsMaskBackupName($basename) {
    return preg_replace('/^(tasitmedisa-data-canli-).+(\\.json)$/', '$1********$2', (string)$basename);
}

function medisaPortalAccountsBuildOutputBasenames() {
    $stamp = date('Ymd-His');
    return [
        'json' => 'tasitmedisa-data-hazir-' . $stamp . '.json',
        'csv' => 'tasitmedisa-baslangic-hesaplari-' . $stamp . '.csv',
    ];
}

function medisaPortalAccountsBuildCsvContent(array $rows) {
    $header = 'Kullanıcı ID,Ad Soyad,Kullanıcı Adı,Başlangıç Parolası,Rol,Aktif/Pasif,İlk Giriş Önerisi';
    $lines = [$header];
    foreach ($rows as $row) {
        $lines[] = medisaPortalAccountsBuildCsvRow($row);
    }
    return "\xEF\xBB\xBF" . implode("\r\n", $lines) . "\r\n";
}

function medisaPortalAccountsValidateTransformedData(array $data, array $beforeUsers) {
    $afterUsers = array_values($data['users'] ?? []);
    if (count($afterUsers) !== count($beforeUsers)) {
        throw new RuntimeException('Kullanıcı sayısı değişti.');
    }
    $beforeIds = [];
    $afterIds = [];
    foreach ($beforeUsers as $user) {
        if (!is_array($user)) {
            continue;
        }
        $beforeIds[] = (string)($user['id'] ?? '');
    }
    foreach ($afterUsers as $user) {
        if (!is_array($user)) {
            continue;
        }
        $afterIds[] = (string)($user['id'] ?? '');
    }
    sort($beforeIds);
    sort($afterIds);
    if ($beforeIds !== $afterIds) {
        throw new RuntimeException('Kullanıcı ID listesi değişti.');
    }
    $usernameLookup = [];
    foreach ($afterUsers as $user) {
        if (!is_array($user)) {
            continue;
        }
        if (trim((string)($user['sifre'] ?? '')) !== '') {
            throw new RuntimeException('Düz metin parola alanı kaldı.');
        }
        $username = trim((string)($user['kullanici_adi'] ?? ''));
        $active = medisaPortalAccountsUserIsActive($user);
        $hash = trim((string)($user['sifre_hash'] ?? ''));
        if ($active) {
            if (!medisaPortalAccountsIsValidUsername($username)) {
                throw new RuntimeException('Aktif kullanıcıda geçersiz kullanıcı adı kaldı.');
            }
            if ($hash === '' || !medisaPortalAccountsHashIsValid($hash)) {
                throw new RuntimeException('Aktif kullanıcıda geçersiz hash kaldı.');
            }
            $key = medisaPortalUsernameKey($username);
            if (isset($usernameLookup[$key])) {
                throw new RuntimeException('Kullanıcı adı çakışması oluştu.');
            }
            $usernameLookup[$key] = true;
        }
        $projected = medisaProjectUserForClient($user);
        foreach (['sifre', 'sifre_hash', 'password', 'password_hash'] as $field) {
            if (array_key_exists($field, $projected)) {
                throw new RuntimeException('Projection credential sızıntısı.');
            }
        }
    }
    return true;
}
