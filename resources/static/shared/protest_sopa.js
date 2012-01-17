$(function() {
  if(!localStorage.SOPA_STOPPED) {
    window.showingSOPA = true;
    localStorage.SOPA_STOPPED = true;
    var sopaEl = $("#protest_sopa");
    sopaEl.show();
    setTimeout(function() {
      window.showingSOPA = false;
      // refocus the first input element that we overrode.
      $("input:visible:eq(0)").focus();
      sopaEl.fadeOut();
    }, 5000);
  }
});


