/*jshint browser: true*/
/*globals BrowserID: true */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
BrowserID.Models.UsersComputer = (function() {
  "use strict";

  var bid = BrowserID,
      ONE_DAY_IN_MS = (1000 * 60 * 60 * 24),
      storage = bid.getStorage(),
      EmailToUserID = bid.Models.EmailToUserID;

  // tools to manage knowledge of whether this is the user's computer,
  // which helps us set appropriate authentication duration.
  function validState(state) {
    return (state === 'seen' || state === 'confirmed' || state === 'denied');
  }

  function setConfirmationState(userid, state) {
    userid = EmailToUserID.mapEmailToUserID(userid);

    if (typeof userid !== 'number') throw 'bad userid ' + userid;

    if (!validState(state)) throw "invalid state";

    var allInfo;
    var currentState;
    var lastUpdated = 0;

    try {
      allInfo = JSON.parse(storage.usersComputer);
      if (typeof allInfo !== 'object') throw 'bogus';

      var userInfo = allInfo[userid];
      if (userInfo) {
        currentState = userInfo.state;
        lastUpdated = Date.parse(userInfo.updated);

        if (!validState(currentState)) throw "corrupt/outdated";
        if (isNaN(lastUpdated)) throw "corrupt/outdated";
      }
    } catch(e) {
      currentState = undefined;
      lastUpdated = 0;
      allInfo = {};
    }

    // ...now determine if we should update the state...

    // first if the user said this wasn't their computer over 24 hours ago,
    // forget that setting (we will revisit this)
    if (currentState === 'denied' &&
        ((new Date()).getTime() - lastUpdated) > ONE_DAY_IN_MS) {
      currentState = undefined;
      lastUpdated = 0;
    }

    // if the user has a non-null state and this is another user sighting
    // (seen), then forget it
    if (state === 'seen' && currentState) return;

    // good to go!  let's make the update
    allInfo[userid] = {state: state, updated: new Date().toString()};
    storage.usersComputer = JSON.stringify(allInfo);
  }

  function userConfirmedOnComputer(userid) {
    try {
      userid = EmailToUserID.mapEmailToUserID(userid);
      var allInfo = JSON.parse(storage.usersComputer || "{}");
      return allInfo[userid].state === 'confirmed';
    } catch(e) {
      return false;
    }
  }

  function shouldAskUserAboutHerComputer(userid) {
    // if any higher level code passes in a non-userid,
    // we'll tell them not to ask, triggering ephemeral sessions.
    if (typeof userid !== 'number') return false;

    // we should ask the user if this is their computer if they were
    // first seen over a minute ago, if they haven't denied ownership
    // of this computer in the last 24 hours, and they haven't confirmed
    // ownership of this computer
    try {
      userid = EmailToUserID.mapEmailToUserID(userid);
      var allInfo = JSON.parse(storage.usersComputer);
      var userInfo = allInfo[userid];
      if(userInfo) {
        var s = userInfo.state;
        var timeago = new Date() - Date.parse(userInfo.updated);

        // The ask state is an artificial state that should never be seen in
        // the wild.  It is used in testing.
        if (s === 'ask') return true;
        if (s === 'confirmed') return false;
        if (s === 'denied' && timeago > ONE_DAY_IN_MS) return true;
        if (s === 'seen' && timeago > (60 * 1000)) return true;
      }
    } catch (e) {
      return true;
    }

    return false;
  }

  function setUserSeenOnComputer(userid) {
    setConfirmationState(userid, 'seen');
  }

  function setUserConfirmedOnComputer(userid) {
    setConfirmationState(userid, 'confirmed');
  }

  function setNotMyComputer(userid) {
    setConfirmationState(userid, 'denied');
  }

  function setUserMustConfirmComputer(userid) {
      try {
        userid = EmailToUserID.mapEmailToUserID(userid);
        var allInfo = JSON.parse(storage.usersComputer);
        if (typeof allInfo !== 'object') throw 'bogus';

        var userInfo = allInfo[userid] || {};
        userInfo.state = 'ask';
        storage.usersComputer = JSON.stringify(allInfo);
      } catch(e) {}
  }

  function clearUsersComputerOwnershipStatus(userid) {
    try {
      var allInfo = JSON.parse(storage.usersComputer);
      if (typeof allInfo !== 'object') throw 'bogus';

      var userInfo = allInfo[userid];
      if (userInfo) {
        allInfo[userid] = null;
        delete allInfo[userid];
        storage.usersComputer = JSON.stringify(allInfo);
      }
    } catch (e) {}
  }

  var UsersComputer = {
    /**
     * Query whether the user has confirmed that this is their computer
     * @param {integer} userid - the user's numeric id, returned from session_context when authed.
     * @method usersComputer.confirmed */
    confirmed: userConfirmedOnComputer,
    /**
     * Save the fact that a user confirmed that this is their computer
     * @param {integer} userid - the user's numeric id, returned from session_context when authed.
     * @method usersComputer.setConfirmed */
    setConfirmed: setUserConfirmedOnComputer,
    /**
     * Save the fact that a user denied that this is their computer
     * @param {integer} userid - the user's numeric id, returned from session_context when authed.
     * @method usersComputer.setDenied */
    setDenied: setNotMyComputer,
    /**
     * Should we ask the user if this is their computer, based on the last
     * time they used browserid and the last time they answered a question
     * about this device
     * @param {integer} userid - the user's numeric id, returned
     *   from session_context when authed.
     * @method usersComputer.seen */
    shouldAsk: shouldAskUserAboutHerComputer,
    /**
     * Save the fact that a user has been seen on this computer before, but do not overwrite
     *  existing state
     * @param {integer} userid - the user's numeric id, returned from session_context when authed.
     * @method usersComputer.setSeen */
    setSeen: setUserSeenOnComputer,
    /**
     * Clear the status for the user
     * @param {integer} userid - the user's numeric id, returned from session_context when authed.
     * @method usersComputer.clear */
    clear: clearUsersComputerOwnershipStatus,
    /**
     * Force the user to be asked their status
     * @param {integer} userid - the user's numeric id, returned from session_context when authed.
     * @method usersComputer.forceAsk */
    forceAsk: setUserMustConfirmComputer
  };

  return UsersComputer;

}());

