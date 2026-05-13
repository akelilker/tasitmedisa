(function() {
  "use strict";

  var LOCAL_KEYS = ["medisa_portal_token", "driver_token"];

  function readFrom(storage, key) {
    try {
      return storage.getItem(key) || "";
    } catch (e) {
      return "";
    }
  }

  function writeTo(storage, key, value) {
    try {
      storage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  function removeFrom(storage, key) {
    try {
      storage.removeItem(key);
    } catch (e) {}
  }

  window.getStoredPortalToken = function getStoredPortalToken() {
    for (var i = 0; i < LOCAL_KEYS.length; i++) {
      var key = LOCAL_KEYS[i];
      var localValue = readFrom(window.localStorage, key);
      if (localValue) return localValue;
      var sessionValue = readFrom(window.sessionStorage, key);
      if (sessionValue) return sessionValue;
    }
    return "";
  };

  window.clearStoredPortalTokens = function clearStoredPortalTokens() {
    for (var i = 0; i < LOCAL_KEYS.length; i++) {
      var key = LOCAL_KEYS[i];
      removeFrom(window.localStorage, key);
      removeFrom(window.sessionStorage, key);
    }
  };

  window.storePortalToken = function storePortalToken(token, remember) {
    if (!token) return false;

    window.clearStoredPortalTokens();

    var primaryStorage = remember ? window.localStorage : window.sessionStorage;
    for (var i = 0; i < LOCAL_KEYS.length; i++) {
      if (!writeTo(primaryStorage, LOCAL_KEYS[i], token)) {
        for (var j = 0; j < LOCAL_KEYS.length; j++) {
          writeTo(window.sessionStorage, LOCAL_KEYS[j], token);
        }
        return false;
      }
    }
    return true;
  };
})();
