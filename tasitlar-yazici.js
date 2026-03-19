/* =========================================
   TAŞITLAR MODÜLÜ - YAZDIRMA İŞLEMLERİ
   ========================================= */
(function() {
  'use strict';

  var parsedKaportaSvgCache = null;

  function getParsedKaportaSvg() {
    if (parsedKaportaSvgCache) {
      return Promise.resolve(parsedKaportaSvgCache.cloneNode(true));
    }
    if (typeof window.getKaportaSvg !== 'function') {
      return Promise.reject(new Error('Kaporta SVG fonksiyonu bulunamadı'));
    }
    return window.getKaportaSvg().then(function(svgText) {
      var parser = new DOMParser();
      var svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
      parsedKaportaSvgCache = svgDoc.querySelector('svg');
      return parsedKaportaSvgCache ? parsedKaportaSvgCache.cloneNode(true) : null;
    });
  }

  function readBranches() { return (typeof window.getMedisaBranches === 'function' ? window.getMedisaBranches() : null) || []; }
  function readVehicles() { return (typeof window.getMedisaVehicles === 'function' ? window.getMedisaVehicles() : null) || []; }
  function readUsers() { return (typeof window.getMedisaUsers === 'function' ? window.getMedisaUsers() : null) || []; }
  function toTitleCase(str) { return (typeof window.toTitleCase === 'function' ? window.toTitleCase(str) : str); }
  function formatNumber(num) { return (typeof window.formatNumber === 'function' ? window.formatNumber(num) : num); }
  function escapeHtml(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    return String(str == null ? '' : str).replace(/[&<>'"]/g, function(ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch];
    });
  }

  function formatDateForDisplay(dateStr) {
    if (!dateStr) return '';
    if (typeof window.formatDateShort === 'function') {
      var formatted = window.formatDateShort(dateStr);
      if (formatted) return String(formatted);
    }
    var raw = String(dateStr).trim();
    var iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return iso[3] + '/' + iso[2] + '/' + iso[1];
    var dot = raw.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
    if (dot) return dot[1] + '/' + dot[2] + '/' + dot[3];
    var parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) {
      var d = String(parsed.getDate()).padStart(2, '0');
      var m = String(parsed.getMonth() + 1).padStart(2, '0');
      var y = String(parsed.getFullYear());
      return d + '/' + m + '/' + y;
    }
    return raw;
  }

  function getVehicleTypeLabel(type) {
    var labels = {
      'otomobil': 'Otomobil / SUV',
      'minivan': 'Küçük Ticari',
      'kamyon': 'Büyük Ticari'
    };
    return labels[type] || type;
  }

  function getKaportaPartNames() {
    return {
      'on-tampon': 'Ön Tampon',
      'arka-tampon': 'Arka Tampon',
      'kaput': 'Kaput',
      'bagaj': 'Bagaj Kapağı',
      'sag-on-kapi': 'Sağ Ön Kapı',
      'sol-on-kapi': 'Sol Ön Kapı',
      'sag-arka-kapi': 'Sağ Arka Kapı',
      'sol-arka-kapi': 'Sol Arka Kapı',
      'sag-on-camurluk': 'Sağ Ön Çamurluk',
      'sol-on-camurluk': 'Sol Ön Çamurluk',
      'sag-arka-camurluk': 'Sağ Arka Çamurluk',
      'sol-arka-camurluk': 'Sol Arka Çamurluk',
      'tavan': 'Tavan'
    };
  }

  function getVehiclePrintRows(vehicle) {
    var users = readUsers();
    var branches = readBranches();
    var assignedUserId = vehicle.assignedUserId || '';
    var assignedUser = assignedUserId ? users.find(function(u) { return u.id === assignedUserId; }) : null;
    var assignedUserName = (assignedUser && assignedUser.name) ? assignedUser.name : (vehicle.tahsisKisi || '-');
    var branchName = vehicle.branchId
      ? ((branches.find(function(b) { return String(b.id) === String(vehicle.branchId); }) || {}).name || '-')
      : 'Tahsis Edilmemiş';
    var kmValue = vehicle.guncelKm ? formatNumber(vehicle.guncelKm) : (vehicle.km ? formatNumber(vehicle.km) : '-');
    var anahtarLabel = vehicle.anahtar === 'var' ? (vehicle.anahtarNerede || 'Var') : 'Yoktur.';
    var krediLabel = vehicle.kredi === 'var' ? (vehicle.krediDetay || 'Var') : 'Yoktur.';
    var lastikLabel = vehicle.lastikDurumu === 'var' ? (vehicle.lastikAdres || 'Var') : 'Yoktur.';

    var tramerLabel = 'Yoktur.';
    if (vehicle.tramer === 'var' && vehicle.tramerRecords && vehicle.tramerRecords.length > 0) {
      tramerLabel = vehicle.tramerRecords.map(function(r) {
        return (formatDateForDisplay(r.date) || '-') + ' - ' + (r.amount || '');
      }).join(' | ');
      if (vehicle.tramerRecords.length > 1) {
        var total = 0;
        vehicle.tramerRecords.forEach(function(record) {
          var amountStr = (record.amount || '').replace(/\./g, '').replace(',', '.').replace(/TL/gi, '').trim();
          total += parseFloat(amountStr) || 0;
        });
        tramerLabel += ' | Toplam: ' + total.toFixed(2).replace('.', ',') + ' TL';
      }
    }

    var kaskoDegeri = vehicle.kaskoDegeri;
    if (kaskoDegeri == null || kaskoDegeri === '') {
      var yearForKasko = vehicle.year || vehicle.modelYili || '';
      kaskoDegeri = (typeof window.getKaskoDegeri === 'function') ? window.getKaskoDegeri(vehicle.kaskoKodu, yearForKasko) : '-';
    }
    var kaskoDegeriDisplay = (kaskoDegeri != null && String(kaskoDegeri).trim() !== '') ? String(kaskoDegeri).trim() : '-';

    return [
      ['Plaka', vehicle.plate || '-'],
      ['Marka / Model', toTitleCase(vehicle.brandModel || '-')],
      ['Kullanıcı', assignedUserName || '-'],
      ['Şube', branchName],
      ['Taşıt Tipi', getVehicleTypeLabel(vehicle.vehicleType || '-')],
      ['Üretim Yılı', vehicle.year || '-'],
      ['Tescil Tarihi', vehicle.tescilTarihi || '-'],
      ['Km', kmValue],
      ['Şanzıman', vehicle.transmission || '-'],
      ['Tramer Kaydı', tramerLabel],
      ['Sigorta Bitiş Tarihi', vehicle.sigorta || '-'],
      ['Kasko Bitiş Tarihi', vehicle.kasko || '-'],
      ['Muayene Bitiş Tarihi', vehicle.muayene || '-'],
      ['Yedek Anahtar', anahtarLabel],
      ['Kredi/Rehin', krediLabel],
      ['Yazlık/Kışlık Lastik', lastikLabel],
      ['UTTS', vehicle.uttsTanimlandi ? 'Evet' : 'Hayır'],
      ['Taşıt Takip', vehicle.takipCihaziMontaj ? 'Evet' : 'Hayır'],
      ['Kasko Kodu', vehicle.kaskoKodu || '-'],
      ['Kasko Değeri', kaskoDegeriDisplay],
      ['Notlar', vehicle.notes || '-']
    ];
  }

  function renderPrintHistorySection(title, items) {
    var bodyHtml = items.length
      ? '<ul class="history-print-list">' + items.map(function(item) {
          return '<li class="history-print-item">' +
            '<div class="history-print-date">' + escapeHtml(item.date || '-') + '</div>' +
            '<div class="history-print-text">' + escapeHtml(item.text || '-') + '</div>' +
            (item.extra ? '<div class="history-print-extra">' + escapeHtml(item.extra) + '</div>' : '') +
          '</li>';
        }).join('') + '</ul>'
      : '<div class="history-print-empty">Kayıt bulunmamaktadır.</div>';
    return '<section class="history-print-card"><h2>' + escapeHtml(title) + '</h2>' + bodyHtml + '</section>';
  }

  function summarizeOtherHistoryEvent(event, branches) {
    var eventType = String(event.type || '').trim();
    var d = event.data || {};
    var text = '';
    var extra = '';

    if (eventType === 'anahtar-guncelle') {
      var durum1 = String(d.durum || 'yok').toLowerCase();
      text = 'Yedek Anahtar: ' + (durum1 === 'var' ? 'Var' : 'Yok');
      if (d.detay) extra = 'Konum: ' + toTitleCase(String(d.detay));
    } else if (eventType === 'lastik-guncelle') {
      var durum2 = String(d.durum || 'yok').toLowerCase();
      text = 'Yazlık/Kışlık Lastik: ' + (durum2 === 'var' ? 'Var' : 'Yok');
      if (d.adres) extra = 'Konum: ' + toTitleCase(String(d.adres));
    } else if (eventType === 'kasko-guncelle') {
      text = 'Kasko Güncelleme';
      var details1 = [];
      if (d.bitisTarihi) details1.push('Bitiş: ' + (formatDateForDisplay(d.bitisTarihi) || '-'));
      if (d.firma) details1.push('Firma: ' + toTitleCase(String(d.firma)));
      if (d.acente) details1.push('Acente: ' + toTitleCase(String(d.acente)));
      extra = details1.join(' | ');
    } else if (eventType === 'sigorta-guncelle') {
      text = 'Sigorta Güncelleme';
      var details2 = [];
      if (d.bitisTarihi) details2.push('Bitiş: ' + (formatDateForDisplay(d.bitisTarihi) || '-'));
      if (d.firma) details2.push('Firma: ' + toTitleCase(String(d.firma)));
      if (d.acente) details2.push('Acente: ' + toTitleCase(String(d.acente)));
      extra = details2.join(' | ');
    } else if (eventType === 'muayene-guncelle') {
      text = 'Muayene Güncelleme';
      if (d.bitisTarihi) extra = 'Bitiş: ' + (formatDateForDisplay(d.bitisTarihi) || '-');
    } else if (eventType === 'kullanici-atama') {
      text = 'Kullanıcı Ataması';
      var details3 = [];
      if (d.kullaniciAdi) details3.push('Yeni: ' + toTitleCase(String(d.kullaniciAdi)));
      if (d.eskiKullaniciAdi) details3.push('Önceki: ' + toTitleCase(String(d.eskiKullaniciAdi)));
      extra = details3.join(' | ');
    } else if (eventType === 'sube-degisiklik') {
      text = 'Şube Değişikliği';
      var yeni = d.yeniSubeAdi || ((branches.find(function(b) { return String(b.id) === String(d.yeniSubeId); }) || {}).name) || '';
      var eski = d.eskiSubeAdi || ((branches.find(function(b) { return String(b.id) === String(d.eskiSubeId); }) || {}).name) || '';
      var details4 = [];
      if (yeni) details4.push('Yeni: ' + toTitleCase(String(yeni)));
      if (eski) details4.push('Önceki: ' + toTitleCase(String(eski)));
      extra = details4.join(' | ');
    } else if (eventType === 'kredi-guncelle') {
      var durum3 = String(d.durum || 'yok').toLowerCase();
      text = 'Kredi/Rehin: ' + (durum3 === 'var' ? 'Var' : 'Yok');
      if (d.detay) extra = 'Detay: ' + toTitleCase(String(d.detay));
    } else if (eventType === 'utts-guncelle') {
      text = 'UTTS: ' + ((d.durum === true || d.durum === 'evet') ? 'Evet' : 'Hayır');
    } else if (eventType === 'takip-cihaz-guncelle') {
      text = 'Takip Cihazı: ' + ((d.durum === true || d.durum === 'var') ? 'Var' : 'Yok');
    } else if (eventType === 'ceza') {
      text = 'Trafik Cezası';
      var details5 = [];
      if (d.tutar) details5.push('Tutar: ' + d.tutar + ' TL');
      if (d.aciklama) details5.push('Nedeni: ' + toTitleCase(String(d.aciklama)));
      extra = details5.join(' | ');
    } else if (eventType === 'not-guncelle') {
      text = 'Not Güncelleme';
      if (d.not) extra = String(d.not).length > 120 ? String(d.not).slice(0, 120) + '...' : String(d.not);
    } else if (eventType === 'satis') {
      text = 'Satış / Pert';
    } else {
      text = toTitleCase(eventType || 'Diğer İşlem');
    }

    return { text: text || '-', extra: extra || '' };
  }

  function buildPrintHistorySections(vehicleRecord) {
    var sections = { bakim: [], kaza: [], km: [], diger: [] };
    var events = Array.isArray(vehicleRecord.events) ? vehicleRecord.events : [];
    var branches = readBranches();
    var partNames = getKaportaPartNames();

    events.forEach(function(event) {
      var dateText = formatDateForDisplay(event.date) || '-';
      var data = event.data || {};

      if (event.type === 'bakim') {
        var details = [
          'Servis: ' + toTitleCase(String(data.servis || '-')),
          'Kişi: ' + toTitleCase(String(data.kisi || '-'))
        ];
        if (data.km) details.push('Km: ' + formatNumber(data.km));
        if (data.tutar) details.push('Tutar: ' + data.tutar);
        sections.bakim.push({
          date: dateText,
          text: toTitleCase(String(data.islemler || '-')),
          extra: details.join(' | ')
        });
        return;
      }

      if (event.type === 'kaza') {
        var detailsKaza = ['Kullanıcı: ' + toTitleCase(String(data.surucu || '-'))];
        if (data.hasarTutari) detailsKaza.push('Hasar Tutarı: ' + data.hasarTutari);

        var hasarParcalari = data.hasarParcalari;
        if (hasarParcalari && typeof hasarParcalari === 'object') {
          var boyaliList = [];
          var degisenList = [];
          Object.keys(hasarParcalari).forEach(function(partId) {
            var partName = toTitleCase(String(partNames[partId] || partId));
            if (hasarParcalari[partId] === 'boyali') boyaliList.push(partName);
            if (hasarParcalari[partId] === 'degisen') degisenList.push(partName);
          });
          if (boyaliList.length) detailsKaza.push('Boyalı: ' + boyaliList.join(', '));
          if (degisenList.length) detailsKaza.push('Değişen: ' + degisenList.join(', '));
        }

        var aciklama = String(data.aciklama || '').trim();
        sections.kaza.push({
          date: dateText,
          text: detailsKaza.join(' | '),
          extra: aciklama ? ('Açıklama: ' + toTitleCase(aciklama)) : ''
        });
        return;
      }

      if (event.type === 'km-revize') {
        var userRaw = String(data.surucu || data.kullaniciAdi || '').trim();
        var userText = userRaw ? toTitleCase(userRaw) : 'Bilinmiyor';
        var eskiKm = data.eskiKm ? formatNumber(data.eskiKm) : '-';
        var yeniKm = data.yeniKm ? formatNumber(data.yeniKm) : '-';
        sections.km.push({
          date: dateText,
          text: userText + ': ' + eskiKm + ' -> ' + yeniKm,
          extra: ''
        });
        return;
      }

      var otherSummary = summarizeOtherHistoryEvent(event, branches);
      sections.diger.push({
        date: dateText,
        text: otherSummary.text,
        extra: otherSummary.extra
      });
    });

    return [
      renderPrintHistorySection('Bakım', sections.bakim),
      renderPrintHistorySection('Kaza', sections.kaza),
      renderPrintHistorySection('Km', sections.km),
      renderPrintHistorySection('Diğer', sections.diger)
    ].join('');
  }

  function buildKaportaPrintSectionHtml(vehicleRecord) {
    var partNames = getKaportaPartNames();
    var stateMap = (vehicleRecord && vehicleRecord.boyaliParcalar && typeof vehicleRecord.boyaliParcalar === 'object')
      ? vehicleRecord.boyaliParcalar
      : {};
    var boyaliList = [];
    var degisenList = [];

    Object.keys(stateMap).forEach(function(partId) {
      var partName = toTitleCase(String(partNames[partId] || partId));
      if (stateMap[partId] === 'boyali') boyaliList.push(partName);
      if (stateMap[partId] === 'degisen') degisenList.push(partName);
    });

    boyaliList.sort(function(a, b) { return a.localeCompare(b, 'tr'); });
    degisenList.sort(function(a, b) { return a.localeCompare(b, 'tr'); });

    function listHtml(items) {
      if (!items.length) return '<div class="kaporta-print-empty">Yok</div>';
      return '<ul class="kaporta-print-list">' + items.map(function(name) { return '<li>' + escapeHtml(name) + '</li>'; }).join('') + '</ul>';
    }

    var svgMarkup = '';
    try {
      if (parsedKaportaSvgCache) {
        var svgClone = parsedKaportaSvgCache.cloneNode(true);
        var defaultGray = '#b5b5b5';
        var allParts = svgClone.querySelectorAll('path[id]');
        allParts.forEach(function(part) {
          part.setAttribute('fill', defaultGray);
          part.style.fill = defaultGray;
        });
        Object.keys(stateMap).forEach(function(partId) {
          var part = svgClone.querySelector('#' + partId);
          if (!part) return;
          if (stateMap[partId] === 'boyali') {
            part.setAttribute('fill', '#28a745');
            part.style.fill = '#28a745';
          } else if (stateMap[partId] === 'degisen') {
            part.setAttribute('fill', '#d40000');
            part.style.fill = '#d40000';
          }
        });
        svgClone.classList.add('kaporta-print-svg');
        svgMarkup = svgClone.outerHTML;
      }
    } catch (e) {
      svgMarkup = '';
    }

    if (!svgMarkup) {
      var fallbackSrc = new URL('icon/kaporta.svg', window.location.href).href;
      svgMarkup = '<img src="' + escapeHtml(fallbackSrc) + '" alt="Kaporta Şeması" class="kaporta-print-fallback">';
    }

    return '<section class="kaporta-print-section kaporta-print-box">' +
      '<h2 class="kaporta-print-title">Kaporta Durumu</h2>' +
      '<div class="kaporta-print-row">' +
        '<div class="kaporta-print-state-grid">' +
          '<div class="kaporta-print-col">' +
            '<h3>Boyalı</h3>' +
            listHtml(boyaliList) +
          '</div>' +
          '<div class="kaporta-print-col">' +
            '<h3>Değişen</h3>' +
            listHtml(degisenList) +
          '</div>' +
        '</div>' +
        '<div class="kaporta-print-schema-wrap">' + svgMarkup + '</div>' +
      '</div>' +
    '</section>';
  }

  function doPrintVehicleCard(vehicle) {
    var allRows = getVehiclePrintRows(vehicle);
    var sigortaIdx = allRows.findIndex(function(pair) { return pair[0] === 'Sigorta Bitiş Tarihi'; });
    var leftRows = sigortaIdx >= 0 ? allRows.slice(0, sigortaIdx) : allRows.slice(0, 9);
    var rightRows = sigortaIdx >= 0 ? allRows.slice(sigortaIdx) : [];
    var leftTable = leftRows.map(function(row) {
      return '<tr><th>' + escapeHtml(row[0]) + '</th><td>' + escapeHtml(String(row[1] || '-')).replace(/\n/g, '<br>') + '</td></tr>';
    }).join('');
    var rightTable = rightRows.map(function(row) {
      return '<tr><th>' + escapeHtml(row[0]) + '</th><td>' + escapeHtml(String(row[1] || '-')).replace(/\n/g, '<br>') + '</td></tr>';
    }).join('');
    var rows = rightTable
      ? '<div class="vehicle-card-print-grid"><table>' + leftTable + '</table><table>' + rightTable + '</table></div>'
      : '<table>' + leftTable + '</table>';
    var now = new Date();
    var printedAt = String(now.getDate()).padStart(2, '0') + '.' + String(now.getMonth() + 1).padStart(2, '0') + '.' + now.getFullYear() + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

    var historySectionsHtml = buildPrintHistorySections(vehicle);
    var kaportaPrintSectionHtml = buildKaportaPrintSectionHtml(vehicle);

    var printHtml = '<!doctype html>' +
'<html lang="tr">' +
'<head>' +
'  <meta charset="utf-8">' +
'  <title>Taşıt Kartı - ' + escapeHtml(vehicle.plate || '-') + '</title>' +
'  <style>' +
'    /* TÜM PLATFORMLAR İÇİN BİRLEŞTİRİLMİŞ KUSURSUZ CSS */' +
'    body { font-family: Arial, sans-serif; margin: 24px; color: #111; }' +
'    h1 { margin: 0 0 4px; font-size: 24px; }' +
'    .subtitle { margin: 0 0 10px; color: #555; font-size: 13px; }' +
'    .print-preview-toolbar { display: flex; justify-content: flex-end; gap: 8px; margin: 0 0 10px; position: sticky; top: 0; background: #fff; z-index: 10; padding: 4px 0; }' +
'    .print-preview-btn { border: 1px solid #cfcfcf; background: #fff; color: #222; border-radius: 7px; font-size: 12px; line-height: 1; padding: 7px 10px; cursor: pointer; }' +
'    .print-preview-btn-primary { border-color: #999; }' +
'    table { width: 100%; border-collapse: collapse; table-layout: fixed; }' +
'    th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; font-size: 13px; line-height: 1.3; }' +
'    th { width: 35%; min-width: 100px; max-width: 160px; background: #f4f4f4; }' +
'    td { width: 65%; }' +
'    .vehicle-card-print-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 0; }' +
'    .vehicle-card-print-grid table { width: 100%; }' +
'    @media (max-width: 760px) { .vehicle-card-print-grid { grid-template-columns: 1fr 1fr; } }' +
'    .kaporta-print-section { margin-top: 2px; border: 1px solid #ddd; border-radius: 8px; padding: 4px; page-break-inside: auto; break-inside: auto; }' +
'    .kaporta-print-section h2.kaporta-print-title { margin: 0 0 2px; font-size: 16px; }' +
'    .kaporta-print-row { position: relative; display: flex; min-height: 160px; }' +
'    .kaporta-print-state-grid { width: 35%; min-width: 200px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 5px; align-content: start; z-index: 2; }' +
'    .kaporta-print-schema-wrap { position: absolute; left: 50%; top: -15px; margin-left: -120px; width: 240px; height: 150px; display: flex; align-items: flex-start; justify-content: center; overflow: visible; z-index: 1; }' +
'    .kaporta-print-schema-wrap svg, .kaporta-print-fallback { position: static; width: 150px; height: 240px; margin-top: -45px; transform: rotate(90deg); transform-origin: center center; object-fit: contain; }' +
'    .kaporta-print-col h3 { margin: 0 0 4px; margin-bottom: 2px; font-size: 13px; }' +
'    .kaporta-print-list { margin: 0; padding-left: 18px; }' +
'    .kaporta-print-list li { font-size: 12px; line-height: 1.3; margin-bottom: 2px; }' +
'    .kaporta-print-empty { font-size: 12px; color: #666; }' +
'    .history-page { margin-top: 2px; page-break-inside: avoid; break-inside: avoid; }' +
'    .history-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: start; }' +
'    .history-print-card { width: 100%; box-sizing: border-box; border: 1px solid #ddd; border-radius: 8px; padding: 8px; page-break-inside: avoid; break-inside: avoid; }' +
'    .history-print-card h2 { margin: 0 0 5px; font-size: 14px; page-break-after: avoid; break-after: avoid-page; }' +
'    .history-print-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }' +
'    .history-print-item { border-top: 1px solid #eee; padding-top: 4px; }' +
'    .history-print-item:first-child { border-top: none; padding-top: 0; }' +
'    .history-print-date { font-size: 11px; color: #666; font-weight: 600; margin-bottom: 1px; }' +
'    .history-print-text { font-size: 12px; line-height: 1.25; }' +
'    .history-print-extra { font-size: 11px; color: #444; margin-top: 1px; line-height: 1.2; }' +
'    .history-print-empty { font-size: 12px; color: #666; }' +
'    @media (max-width: 760px) { .history-grid { grid-template-columns: 1fr 1fr; } }' +
'    @media print { body { margin: 8mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .print-preview-toolbar { display: none !important; } .kaporta-print-section { page-break-inside: auto; break-inside: auto; } .print-history-block { break-inside: avoid; page-break-inside: avoid; } .history-page h3, .history-page .subtitle { page-break-after: avoid; break-after: avoid-page; } }' +
'  </style>' +
'</head>' +
'<body>' +
'  <div class="print-preview-toolbar">' +
'    <button type="button" class="print-preview-btn" id="print-preview-back">Geri Dön</button>' +
'    <button type="button" class="print-preview-btn print-preview-btn-primary" id="print-preview-close">Kapat</button>' +
'  </div>' +
'  <section class="summary-page print-summary">' +
'    <h1>Taşıt Kartı</h1>' +
'    <p class="subtitle">Plaka: ' + escapeHtml(vehicle.plate || '-') + ' - Oluşturma: ' + printedAt + '</p>' +
      rows +
      kaportaPrintSectionHtml +
'  </section>' +
'  <section class="history-page">' +
'    <div class="print-history-block">' +
'      <h3>Taşıt Tarihçesi</h3>' +
'      <p class="subtitle">Plaka: ' + escapeHtml(vehicle.plate || '-') + ' - Oluşturma: ' + printedAt + '</p>' +
'      <div class="history-grid">' + historySectionsHtml + '</div>' +
'    </div>' +
'  </section>' +
'  <script>' +
'    (function() {' +
'      var returnUrl = ' + JSON.stringify(window.location.href) + ';' +
'      function safeReturnToApp() {' +
'        try { if (window.opener && !window.opener.closed) { window.close(); return; } } catch (e) {}' +
'        try { if (window.history.length > 1) { window.history.back(); return; } } catch (e) {}' +
'        if (returnUrl) { window.location.href = returnUrl; }' +
'      }' +
'      if (document.readyState === "loading") {' +
'        document.addEventListener("DOMContentLoaded", function() {' +
'          var backBtn = document.getElementById("print-preview-back");' +
'          var closeBtn = document.getElementById("print-preview-close");' +
'          if (backBtn) backBtn.addEventListener("click", safeReturnToApp);' +
'          if (closeBtn) closeBtn.addEventListener("click", function() { try { window.close(); } catch (e) {} setTimeout(safeReturnToApp, 80); });' +
'        });' +
'      } else {' +
'        var backBtn = document.getElementById("print-preview-back");' +
'        var closeBtn = document.getElementById("print-preview-close");' +
'        if (backBtn) backBtn.addEventListener("click", safeReturnToApp);' +
'        if (closeBtn) closeBtn.addEventListener("click", function() { try { window.close(); } catch (e) {} setTimeout(safeReturnToApp, 80); });' +
'      }' +
'    })();' +
'  <\/script>' +
'</body>' +
'</html>';

    function printWithIframeFallback() {
      var iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';

      var done = false;
      function cleanup() {
        try { iframe.onload = null; } catch (e) {}
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }
      function fail() {
        if (done) return;
        done = true;
        cleanup();
        alert('Yazdırma başlatılamadı. Lütfen tekrar deneyin.');
      }

      try {
        document.body.appendChild(iframe);
        var frameWindow = iframe.contentWindow;
        var frameDoc = frameWindow ? frameWindow.document : iframe.contentDocument;
        if (!frameWindow || !frameDoc) throw new Error('iframe_unavailable');

        frameDoc.open();
        frameDoc.write(printHtml);
        frameDoc.close();

        function runPrint() {
          if (done) return;
          try {
            var cleanupTimer = setTimeout(function() {
              if (done) return;
              done = true;
              cleanup();
            }, 2000);
            var onAfterPrint = function() {
              clearTimeout(cleanupTimer);
              if (done) return;
              done = true;
              cleanup();
              try { frameWindow.removeEventListener('afterprint', onAfterPrint); } catch (e) {}
            };
            frameWindow.addEventListener('afterprint', onAfterPrint);
            try {
              if (typeof frameWindow.__medisaPreparePrintLayout === 'function') {
                frameWindow.__medisaPreparePrintLayout();
              }
            } catch (e) {}
            frameWindow.focus();
            frameWindow.print();
          } catch (printErr) {
            fail();
          }
        }

        // iOS: print() aynı kullanıcı hareketi zincirinde çağrılmalı; setTimeout/onload izin istemesine yol açar.
        runPrint();
      } catch (iframeErr) {
        fail();
      }
    }

    printWithIframeFallback();
  }

  window.printVehicleCard = function(vehicleId) {
    var vehicles = readVehicles();
    var vehicle = vehicles.find(function(v) { return String(v.id) === String(vehicleId); });
    if (!vehicle) {
      alert('Taşıt bulunamadı!');
      return;
    }
    getParsedKaportaSvg().then(function() {
      doPrintVehicleCard(vehicle);
    }).catch(function() {
      doPrintVehicleCard(vehicle);
    });
  };
})();
