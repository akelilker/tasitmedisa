<?php
require_once __DIR__ . '/../core.php';

$passed = 0;
$failed = 0;

function kmAssertSame($label, $expected, $actual) {
    global $passed, $failed;
    if ($expected === $actual) {
        $passed++;
        echo "[PASS] {$label}\n";
        return;
    }
    $failed++;
    echo "[FAIL] {$label}\n";
}

function kmAssertState($label, $expected, $selectedPeriod, $currentPeriod, $day, $hasKm, $hasFuture, $hasHistory, $hasBase) {
    kmAssertSame(
        $label,
        $expected,
        medisaComputeKmState($selectedPeriod, $currentPeriod, $day, $hasKm, $hasFuture, $hasHistory, $hasBase)
    );
}

kmAssertSame('KM null bos kabul edilir', false, medisaHasKmValue(['guncel_km' => null]));
kmAssertSame('KM bos string bos kabul edilir', false, medisaHasKmValue(['guncel_km' => '']));
kmAssertSame('KM whitespace bos kabul edilir', false, medisaHasKmValue(['guncel_km' => '  ']));
kmAssertSame('KM sayisal string dolu kabul edilir', true, medisaHasKmValue(['guncel_km' => '1250']));
kmAssertSame('KM string sifir dolu kabul edilir', true, medisaHasKmValue(['guncel_km' => '0']));
kmAssertSame('KM sayisal sifir dolu kabul edilir', true, medisaHasKmValue(['guncel_km' => 0]));
kmAssertSame('KM pozitif sayi dolu kabul edilir', true, medisaHasKmValue(['guncel_km' => 1250]));
kmAssertSame('KM alani olmayan kayit bos kabul edilir', false, medisaHasKmValue([]));

kmAssertSame('Gelecek KM donemi bulunur', true, medisaHasFutureKmPeriod(['2026-06', '2026-08'], '2026-07'));
kmAssertSame('Ayni veya eski KM donemi gelecek sayilmaz', false, medisaHasFutureKmPeriod(['2026-06', '2026-07'], '2026-07'));
kmAssertSame('Bos donem listesi gelecek sayilmaz', false, medisaHasFutureKmPeriod([], '2026-07'));

kmAssertState('Gelecek donem uyarmaz', [
    'state' => 'OK', 'reason' => 'future_period_no_warning',
    'is_current_period' => false, 'is_past_period' => false, 'is_future_period' => true,
], '2026-08', '2026-07', 12, false, false, false, false);
kmAssertState('Ilk giris gerekir', [
    'state' => 'FIRST_ENTRY_REQUIRED', 'reason' => 'no_reliable_history_and_no_base_km',
    'is_current_period' => true, 'is_past_period' => false, 'is_future_period' => false,
], '2026-07', '2026-07', 1, false, false, false, false);
kmAssertState('Ilk giris kontrolu donem KM kontrolunden once kalir', [
    'state' => 'FIRST_ENTRY_REQUIRED', 'reason' => 'no_reliable_history_and_no_base_km',
    'is_current_period' => true, 'is_past_period' => false, 'is_future_period' => false,
], '2026-07', '2026-07', 1, true, false, false, false);
kmAssertState('Mevcut donem KM kaydi OK', [
    'state' => 'OK', 'reason' => 'period_km_exists',
    'is_current_period' => true, 'is_past_period' => false, 'is_future_period' => false,
], '2026-07', '2026-07', 12, true, false, true, true);
kmAssertState('Gecmis donem gelecek kayitla kapanir', [
    'state' => 'TELAFI_CLOSED', 'reason' => 'past_period_closed_by_future_km',
    'is_current_period' => false, 'is_past_period' => true, 'is_future_period' => false,
], '2026-06', '2026-07', 12, false, true, true, true);
kmAssertState('Eksik gecmis donem sert uyari', [
    'state' => 'MONTHLY_UPDATE_DUE_HARD', 'reason' => 'past_period_unclosed_missing_km',
    'is_current_period' => false, 'is_past_period' => true, 'is_future_period' => false,
], '2026-06', '2026-07', 12, false, false, true, true);
kmAssertState('Mevcut donem ilk iki gun yumusak uyari', [
    'state' => 'MONTHLY_UPDATE_DUE_SOFT', 'reason' => 'current_period_day_1_2_missing_km',
    'is_current_period' => true, 'is_past_period' => false, 'is_future_period' => false,
], '2026-07', '2026-07', 2, false, false, true, true);
kmAssertState('Mevcut donem ucuncu gun sert uyari', [
    'state' => 'MONTHLY_UPDATE_DUE_HARD', 'reason' => 'current_period_day_3_plus_missing_km',
    'is_current_period' => true, 'is_past_period' => false, 'is_future_period' => false,
], '2026-07', '2026-07', 3, false, false, true, true);
kmAssertState('Gecersiz gelecek donem mevcut string siralamasini korur', [
    'state' => 'OK', 'reason' => 'future_period_no_warning',
    'is_current_period' => false, 'is_past_period' => false, 'is_future_period' => true,
], 'invalid', '2026-07', 12, false, false, false, false);
kmAssertState('Bos secili donem mevcut string siralamasini korur', [
    'state' => 'MONTHLY_UPDATE_DUE_HARD', 'reason' => 'past_period_unclosed_missing_km',
    'is_current_period' => false, 'is_past_period' => true, 'is_future_period' => false,
], '', '2026-07', 12, false, false, true, true);

$adminReportSource = file_get_contents(__DIR__ . '/../admin/admin_report.php');
$driverDataSource = file_get_contents(__DIR__ . '/../driver/driver_data.php');
$adminExportSource = file_get_contents(__DIR__ . '/../admin/admin_export.php');
kmAssertSame('Admin atamasiz state kontrati korunur', true, strpos($adminReportSource, "\$kmState = 'UNASSIGNED';") !== false);
kmAssertSame('Admin atamasiz reason kontrati korunur', true, strpos($adminReportSource, "'reason' => 'vehicle_has_no_active_assignee'") !== false);
kmAssertSame('Admin zengin metadata projection korunur', true,
    strpos($adminReportSource, "'km_state_reason'") !== false
    && strpos($adminReportSource, "'is_current_period'") !== false
    && strpos($adminReportSource, "'is_past_period'") !== false
    && strpos($adminReportSource, "'is_future_period'") !== false
);
kmAssertSame('Surucu state ve reason projection korunur', true,
    strpos($driverDataSource, "\$vehicle['km_state']") !== false
    && strpos($driverDataSource, "\$vehicle['km_state_reason']") !== false
);
kmAssertSame('Export state-only projection korunur', true,
    strpos($adminExportSource, "\$kmState = (string)(\$kmStateResult['state'] ?? 'OK');") !== false
);

echo "Summary: PASS={$passed} FAIL={$failed}\n";
if ($failed > 0) exit(1);
echo "verify-medisa-km-state-invariants: OK\n";
