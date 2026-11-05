(function () {
  var apiBase = '';

  window.FNK_API_BASE = apiBase;

  window.fnkApiUrl = function (path) {
    return apiBase + path;
  };
})();