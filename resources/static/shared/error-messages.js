/*global BrowserID: true, gettext: true*/
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
BrowserID.Errors = (function(){
  "use strict";

  // NOTE: The majority of these strings do not have gettext because they are
  // not immediately user facing.  These strings are used in the error dialog
  // and are only shown after the user clicks on "show more info"
  var Errors = {
    authenticate: {
      title: "Authenticating User"
    },

    addEmail: {
      title: "Adding Address"
    },

    addEmailWithAssertion: {
      title: "Adding Primary Email Address to User"
    },

    addressInfo: {
      title: "Checking Address Info"
    },

    authenticateWithAssertion: {
      title: "Authenticating with Assertion"
    },

    cancelUser: {
      title: "Cancelling User Account"
    },

    checkAuthentication: {
      title: "Checking Authentication"
    },

    checkScriptVersion: {
      title: "Checking Script Version"
    },

    completeUserRegistration: {
      title: "Completing User Registration"
    },

    cookiesDisabled: {
      title: gettext("BrowserID requires cookies"),
      message: format(gettext("Please close this window, <a target='_blank' href='%s'>enable cookies</a> and try again"), ["http://support.mozilla.org/en-US/kb/Websites%20say%20cookies%20are%20blocked"])
    },

    cookiesEnabled: {
      title: "Checking if Cookies are Enabled"
    },

    createUser: {
      title: "Creating Account"
    },

    getAssertion: {
      title: "Getting Assertion"
    },

    getTokenInfo: {
      title: "Checking Registration Token"
    },

    isEmailRegistered: {
      title: "Checking Email Address"
    },

    isUserAuthenticatedToPrimary: {
      title: "Checking Whether User is Authenticated with IdP"
    },

    logoutUser: {
      title: "Logout Failed"
    },

    offline: {
      title: gettext("You are offline!"),
      message: gettext("Unfortunately, BrowserID cannot communicate while offline!")
    },

    primaryAuthentication: {
      title: "Authenticating with Identity Provider",
      message: "We had trouble communicating with your email provider, please try again!"
    },

    provisioningPrimary: {
      title: "Provisioning with Identity Provider",
      message: "We had trouble communicating with your email provider, please try again!"
    },

    provisioningBadPrimary: {
      title: "Provisioning Unsupported Identity Provider",
      message: "Unfortunately, the email address provided cannot act as a Primary Identity Provider"
    },

    registration: {
      title: "Registration Failed"
    },

    relaySetup: {
      title: "Establishing Relay",
      message: "Relay frame could not be found"
    },

    requestPasswordReset: {
      title: "Resetting Password"
    },

    removeEmail: {
      title: "Remove Email Address from Account"
    },

    setPassword: {
      title: "Setting Password"
    },

    signIn: {
      title: "Signin Failed"
    },

    signUp: {
      title: "Signup Failed"
    },

    syncAddress: {
      title: "Syncing Address"
    },

    syncEmails: {
      title: "Syncing Email Addresses"
    },

    syncEmailKeypair: {
      title: "Sync Keys for Address"
    },

    tokenInfo: {
      title: "Getting Token Info"
    },

    updatePassword: {
      title: "Updating password"
    },

    verifyEmail: {
      title: "Verifying email address"
    },

    xhrError: {
      title: gettext("Communication Error")
    }

  };


  return Errors;
}());


