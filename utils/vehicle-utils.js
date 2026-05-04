/* =========================================
   MEDISA VEHICLE UTILS
   =========================================
   Taşıtlarla ilgili ortak yardımcı fonksiyonlar
   ========================================= */

(function() {
  function toTitleCase(str) { return (typeof window.toTitleCase === 'function' ? window.toTitleCase(str) : str); }
  function formatBrandModel(str) { return (typeof window.formatBrandModel === 'function' ? window.formatBrandModel(str) : toTitleCase(str)); }
  function formatPlaka(str) { return (typeof window.formatPlaka === 'function' ? window.formatPlaka(str) : (str == null ? '-' : String(str))); }
  function formatAdSoyad(str) { return (typeof window.formatAdSoyad === 'function' ? window.formatAdSoyad(str) : str); }

  function buildVehicleUserNameHtml(rawName) {
    const userName = formatAdSoyad(rawName || '-');
    const cleanName = String(userName || '-').trim();
    if (!cleanName || cleanName === '-') return window.escapeHtml(cleanName || '-');

    const parts = cleanName.split(/\s+/);
    if (parts.length <= 1) {
      return '<span class="user-name-line1 user-name-single" title="' + window.escapeHtml(cleanName) + '">' + window.escapeHtml(cleanName) + '</span>';
    }

    const surname = parts.pop();
    const givenNames = parts.join(' ');
    return '<span class="user-name-line1" title="' + window.escapeHtml(givenNames) + '">' + window.escapeHtml(givenNames) + '</span>' +
      '<span class="user-name-line2" title="' + window.escapeHtml(surname) + '">' + window.escapeHtml(surname) + '</span>';
  }

  function normalizeVehicleSearchText(value) {
    return String(value == null ? '' : value).toLocaleLowerCase('tr-TR').trim();
  }

  function normalizePlateSearchText(value) {
    return normalizeVehicleSearchText(value).replace(/[\s-]+/g, '');
  }

  function vehicleMatchesSearchQuery(vehicle, query) {
    const q = normalizeVehicleSearchText(query);
    if (!q) return true;

    const source = vehicle || {};
    const plate = String(source.plate != null ? source.plate : '');
    const compactQuery = normalizePlateSearchText(q);
    const rawPlate = normalizeVehicleSearchText(plate);
    const compactPlate = normalizePlateSearchText(plate);
    const formattedPlate = normalizePlateSearchText(formatPlaka(plate));

    return (rawPlate && rawPlate.includes(q)) ||
      (compactQuery && (compactPlate.includes(compactQuery) || formattedPlate.includes(compactQuery))) ||
      (source.brandModel && normalizeVehicleSearchText(source.brandModel).includes(q)) ||
      (source.year && String(source.year).includes(q)) ||
      (source.tahsisKisi && normalizeVehicleSearchText(source.tahsisKisi).includes(q));
  }

  function getTransmissionLabel(transmission) {
    var value = String(transmission || '').trim().toLowerCase();
    if (value === 'otomatik') return 'Otomatik';
    if (value === 'manuel') return 'Manuel';
    return '-';
  }

  function getTransmissionShortLabel(transmission) {
    var value = String(transmission || '').trim().toLowerCase();
    if (value === 'otomatik') return 'Otm.';
    if (value === 'manuel' || value === 'düz' || value === 'duz') return 'Düz';
    return '-';
  }

  // Global exports
  window.buildVehicleUserNameHtml = buildVehicleUserNameHtml;
  window.normalizeVehicleSearchText = normalizeVehicleSearchText;
  window.normalizePlateSearchText = normalizePlateSearchText;
  window.vehicleMatchesSearchQuery = vehicleMatchesSearchQuery;
  window.getTransmissionLabel = getTransmissionLabel;
  window.getTransmissionShortLabel = getTransmissionShortLabel;
})();
