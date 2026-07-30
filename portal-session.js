(function() {
  "use strict";

  var LOCAL_KEYS = ["medisa_portal_token", "driver_token"];
  var REMEMBER_FLAG_KEY = "driver_remember_me";
  var REMEMBER_USERNAME_KEY = "driver_saved_username";
  var REMEMBER_PASSWORD_KEY = "driver_saved_password";
  var REMEMBER_EXPIRES_KEY = "driver_remember_expires_at";
  var REMEMBER_KEYS = [
    REMEMBER_FLAG_KEY,
    REMEMBER_USERNAME_KEY,
    REMEMBER_PASSWORD_KEY,
    REMEMBER_EXPIRES_KEY
  ];
  var LEGACY_REMEMBER_KEYS = [
    "remember_me",
    "saved_username",
    "saved_password",
    "driver_remember",
    "driver_username",
    "driver_password"
  ];
  var REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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

  function readRememberRaw() {
    return {
      flag: readFrom(window.localStorage, REMEMBER_FLAG_KEY),
      username: readFrom(window.localStorage, REMEMBER_USERNAME_KEY),
      password: readFrom(window.localStorage, REMEMBER_PASSWORD_KEY),
      expiresAtRaw: readFrom(window.localStorage, REMEMBER_EXPIRES_KEY)
    };
  }

  function parseExpiresAt(raw) {
    if (!raw) return NaN;
    var value = Number(raw);
    return Number.isFinite(value) ? value : NaN;
  }

  var api = {
    getStoredToken: function getStoredToken() {
      for (var i = 0; i < LOCAL_KEYS.length; i++) {
        var key = LOCAL_KEYS[i];
        var localValue = readFrom(window.localStorage, key);
        if (localValue) return localValue;
        var sessionValue = readFrom(window.sessionStorage, key);
        if (sessionValue) return sessionValue;
      }
      return "";
    },

    clearStoredTokens: function clearStoredTokens() {
      for (var i = 0; i < LOCAL_KEYS.length; i++) {
        var key = LOCAL_KEYS[i];
        removeFrom(window.localStorage, key);
        removeFrom(window.sessionStorage, key);
      }
    },

    storeToken: function storeToken(token, remember) {
      if (!token) return false;

      api.clearStoredTokens();

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
    },

    clearRememberCredentials: function clearRememberCredentials() {
      var i;
      for (i = 0; i < REMEMBER_KEYS.length; i++) {
        removeFrom(window.localStorage, REMEMBER_KEYS[i]);
      }
      for (i = 0; i < LEGACY_REMEMBER_KEYS.length; i++) {
        removeFrom(window.localStorage, LEGACY_REMEMBER_KEYS[i]);
      }
    },

    getValidRememberCredentials: function getValidRememberCredentials() {
      try {
        var raw = readRememberRaw();
        if (raw.flag !== "1") return null;

        var username = String(raw.username || "").trim();
        var password = String(raw.password || "");
        var expiresAt = parseExpiresAt(raw.expiresAtRaw);

        if (!username || !password || !Number.isFinite(expiresAt)) {
          api.clearRememberCredentials();
          return null;
        }

        if (Date.now() >= expiresAt) {
          api.clearRememberCredentials();
          return null;
        }

        return {
          username: username,
          password: password,
          expiresAt: expiresAt
        };
      } catch (e) {
        return null;
      }
    },

    saveRememberCredentials: function saveRememberCredentials(username, password) {
      try {
        var normalizedUser = String(username || "").trim();
        var normalizedPass = String(password || "");
        if (!normalizedUser || !normalizedPass) {
          api.clearRememberCredentials();
          return false;
        }
        var expiresAt = String(Date.now() + REMEMBER_TTL_MS);
        var ok = writeTo(window.localStorage, REMEMBER_FLAG_KEY, "1")
          && writeTo(window.localStorage, REMEMBER_USERNAME_KEY, normalizedUser)
          && writeTo(window.localStorage, REMEMBER_PASSWORD_KEY, normalizedPass)
          && writeTo(window.localStorage, REMEMBER_EXPIRES_KEY, expiresAt);
        if (!ok) {
          api.clearRememberCredentials();
          return false;
        }
        return true;
      } catch (e) {
        return false;
      }
    },

    syncRememberPasswordAfterChange: function syncRememberPasswordAfterChange(newPassword) {
      try {
        var raw = readRememberRaw();
        if (raw.flag !== "1") return false;
        var username = String(raw.username || "").trim();
        var normalizedPass = String(newPassword || "");
        if (!username || !normalizedPass) return false;
        return api.saveRememberCredentials(username, normalizedPass);
      } catch (e) {
        return false;
      }
    },

    forgetThisDevice: function forgetThisDevice() {
      api.clearStoredTokens();
      api.clearRememberCredentials();
    },

    REMEMBER_TTL_MS: REMEMBER_TTL_MS
  };

  window.medisaPortalSession = api;
  window.getStoredPortalToken = api.getStoredToken;
  window.clearStoredPortalTokens = api.clearStoredTokens;
})();
