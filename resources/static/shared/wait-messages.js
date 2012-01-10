/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
BrowserID.Wait = (function(){
  "use strict";

  var Wait = {
    authentication: {
      title: "Finishing Sign In...",
      message: "In just a moment you'll be signed into BrowserID."
    },

    generateKey: {
      title: "Finishing Sign In...",
      message: "Please wait a few seconds while we sign you into the site."
    }

  };


  return Wait;
}());


