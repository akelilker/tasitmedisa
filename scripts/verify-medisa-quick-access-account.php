<?php
// Yalnız bellek ve ayrı temp fixture; repo/canlı data dosyalarına yazmaz.
define('MEDISA_RESTORE_TEST_MODE', true);
$temp = sys_get_temp_dir() . '/medisa-quick-access-' . bin2hex(random_bytes(6));
mkdir($temp, 0700, true);
$GLOBALS['MEDISA_RESTORE_ENV_OVERRIDE'] = ['data_file' => $temp . '/data.json'];
require_once __DIR__ . '/../core.php';

function qaCheck($label, $condition) {
    if (!$condition) throw new RuntimeException('FAIL ' . $label);
    echo 'PASS ' . $label . PHP_EOL;
}
function qaContext(array $data, $id = 'u1', $role = 'genel_yonetici') {
    return ['user_id' => $id, 'role' => $role, 'user' => medisaFindUserById($data, $id), 'branch_ids' => []];
}
function qaPayload(array $ids, $active = true, $migrate = false) {
    return ['_medisaQuickAccessPref' => ['aktif' => $active, 'aracIds' => $ids], '_medisaQuickAccessOnlyIfMissing' => $migrate];
}

try {
    $data = medisaDefaultData();
    $data['users'] = [
        ['id' => 'u1', 'role' => 'genel_yonetici', 'isim' => 'Fixture A', 'sifre_hash' => 'fixture-hash', 'ilk_giris_parola_onerisi_bekliyor' => false],
        ['id' => 'u2', 'role' => 'sube_yonetici', 'isim' => 'Fixture B', 'sifre_hash' => 'fixture-hash', 'quickAccessPref' => ['aktif' => false, 'aracIds' => []]],
    ];
    $data['tasitlar'] = [
        ['id' => 'v1', 'assignedUserId' => 'u1'], ['id' => 'v2', 'assignedUserId' => 'u1'],
        ['id' => 'v3', 'assignedUserId' => 'u2'],
    ];
    $before = $data;
    $session = medisaBuildSessionPayload(qaContext($data));
    qaCheck('Eski hesapta tercih yok: null', $session['user']['quickAccessPref'] === null);
    $r = medisaSaveQuickAccessPref(qaPayload(['v1', 'v2']), $data, qaContext($data));
    qaCheck('Kendi hesabına seçim kaydı', $r['success'] === true);
    $expected = $before;
    $expected['users'][0]['quickAccessPref'] = ['aktif' => true, 'aracIds' => ['v1', 'v2']];
    qaCheck('Başka kullanıcı ve bütün iş verileri aynı', $data === $expected);
    $session = medisaBuildSessionPayload(qaContext($data));
    qaCheck('Yeni cihaz oturumu aynı seçimi alır', $session['user']['quickAccessPref'] === $expected['users'][0]['quickAccessPref']);
    $userView = medisaProjectUserForClient($data['users'][0]);
    qaCheck('Diğer kullanıcılara kişisel tercih yansıtılmaz', !array_key_exists('quickAccessPref', $userView));

    foreach ([
        'Başkasının taşıtı' => qaPayload(['v3']),
        'Tekrarlanan seçim' => qaPayload(['v1', 'v1']),
        'Dörtten fazla seçim' => qaPayload(['v1', 'v2', 'v1', 'v2', 'v1']),
        'Başka veri gönderimi' => qaPayload(['v1']) + ['users' => []],
        'İstemciden kullanıcı hedefi' => qaPayload(['v1']) + ['user_id' => 'u2'],
        'Bozuk tercih' => ['_medisaQuickAccessPref' => ['aktif' => 'true', 'aracIds' => []]],
    ] as $label => $payload) {
        $previous = $data;
        $r = medisaSaveQuickAccessPref($payload, $data, qaContext($data));
        qaCheck($label . ' reddedilir ve veri değişmez', $r['success'] === false && $data === $previous);
    }
    $previous = $data;
    $r = medisaSaveQuickAccessPref(qaPayload([]), $data, qaContext($data, 'u1', 'kullanici'));
    qaCheck('Yetkisiz rol reddedilir', $r['status'] === 403 && $data === $previous);
    $r = medisaSaveQuickAccessPref(qaPayload([]), $data, qaContext($data, 'missing'));
    qaCheck('Eksik oturum sahibi reddedilir', $r['status'] === 403 && $data === $previous);
    $r = medisaSaveQuickAccessPref(qaPayload(['v2'], true, true), $data, qaContext($data));
    qaCheck('Eski cihaz aktarımı sunucudaki seçimi ezmez', $r['success'] && $r['save'] === false && $data === $previous);

    $incoming = $data['users'];
    unset($incoming[0]['quickAccessPref']);
    $incoming[1]['quickAccessPref'] = ['aktif' => true, 'aracIds' => ['v1']];
    $r = medisaReconcileUserCredentials($data['users'], $incoming, null, qaContext($data));
    qaCheck('Genel kullanıcı kaydı tercihleri silemez veya değiştiremez', $r['success'] && $r['users'][0]['quickAccessPref'] === $data['users'][0]['quickAccessPref'] && $r['users'][1]['quickAccessPref'] === $data['users'][1]['quickAccessPref']);
    $r = medisaSaveQuickAccessPref(qaPayload([], false), $data, qaContext($data));
    qaCheck('Kapalı/boş tercih kalıcı bir seçimdir', $r['success'] && $data['users'][0]['quickAccessPref'] === ['aktif' => false, 'aracIds' => []]);
    $previous = $data;
    $r = medisaSaveQuickAccessPref(qaPayload(['v1'], true, true), $data, qaContext($data));
    qaCheck('Aktarım kapalı tercihi de korur', $r['save'] === false && $data === $previous);
    unset($data['users'][0]['quickAccessPref']);
    $r = medisaSaveQuickAccessPref(qaPayload(['v2'], true, true), $data, qaContext($data));
    qaCheck('İlk aktarım seçimi kaydeder', $r['success'] && $data['users'][0]['quickAccessPref']['aracIds'] === ['v2']);
    $r = medisaSaveQuickAccessPref(qaPayload(['v3']), $data, qaContext($data, 'u2', 'sube_yonetici'));
    qaCheck('Şube yöneticisi kendi atanmış taşıtını seçebilir', $r['success']);

    file_put_contents(getDataFilePath(), json_encode($data, JSON_UNESCAPED_UNICODE));
    $r = medisaMutateData(function (&$locked) {
        return medisaSaveQuickAccessPref(qaPayload(['v1']), $locked, qaContext($locked));
    });
    $reloaded = loadData();
    qaCheck('Gerçek kilitli yazım ve yeni okuma seçimi korur', $r['success'] && medisaBuildSessionPayload(qaContext($reloaded))['user']['quickAccessPref']['aracIds'] === ['v1']);
    $data['users'][0]['quickAccessPref'] = ['aktif' => true, 'aracIds' => ['v1']];
    qaCheck('Disk yazımında diğer veriler korunur', $reloaded === $data);
    echo "Quick access account PHP: PASS\n";
} finally {
    $resolved = realpath($temp);
    if ($resolved && strpos($resolved, realpath(sys_get_temp_dir()) . DIRECTORY_SEPARATOR . 'medisa-quick-access-') === 0) {
        $entries = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($resolved, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
        foreach ($entries as $entry) {
            if ($entry->isDir()) rmdir($entry->getPathname());
            else unlink($entry->getPathname());
        }
        rmdir($resolved);
    }
}
