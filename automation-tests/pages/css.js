// absolutely all CSS and dom identifiers for all sites used in tests
// are kept here.  This makes it easy to update all tests when dom structure
// changes.

module.exports = {
  "123done.org": {
    signinButton: 'li#loggedout button img',
    // the email address of the user who is currently logged in
    currentlyLoggedInEmail: 'li#loggedin span',
    logoutLink: 'li#loggedin a'
  },
  "persona.org": {
    windowName: "__persona_dialog",
    accountManagerHeader: '#manage h1',
    accountEmail: "#emailList .email",
    changePasswordButton: '#edit_password button.edit',
    oldPassword: '#edit_password_form input#old_password',
    newPassword: '#edit_password_form input#new_password',
    passwordChangeDoneButton: 'button#changePassword',
    header: {
      signIn: '#header a.signIn',
      signOut: '#header a.signOut'
    },
    signInForm: {
      email: '#signUpForm input#email',
      nextButton: '#signUpForm button#next',
      verifyPrimaryButton: '#signUpForm button#authWithPrimary',
      password: '#signUpForm input#password',
      verifyPassword: '#signUpForm input#vpassword',
      verifyEmailButton: '#signUpForm button#verifyEmail',
      finishButton: '#signUpForm .password_entry button'
    },
    congratsMessage: 'div#congrats',
    verifyPrimaryDialogName: 'auth_with_primary'
  },
  "dialog": {
    emailInput: 'input#email',
    newEmailNextButton: 'p.submit.buttonrow button.start',
    existingPassword: 'div#signIn input#password',
    choosePassword: 'div#set_password input#password',
    verifyPassword: 'input#vpassword',
    // the button you click on after typing and re-typing your password
    createUserButton: 'button#verify_user',
    returningUserButton: 'button.returning',
    verifyWithPrimaryButton: 'button#verifyWithPrimary',
    thisIsNotMe: '#thisIsNotMe',
    useNewEmail: 'a#useNewEmail',
    newEmail: 'input#newEmail',
    addNewEmailButton: 'button#addNewEmail',
    firstEmail: '#email_0',
    secondEmail: '#email_1',
    signInButton: 'button#signInButton',
    notMyComputerButton: 'button#this_is_not_my_computer',
    myComputerButton: 'button#this_is_my_computer'
  },
  "myfavoritebeer.org": {
    signinButton: '#loginInfo .login',
    currentlyLoggedInEmail: 'span.username',
    logout: 'a#logout'
  },
  "eyedee.me": {
    newPassword: 'input#new_password',
    createAccountButton: 'button#create_account'
  }
};
