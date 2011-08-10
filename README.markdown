BrowserID
============

**Latest Version**: 0.0.1

BrowserID is an implementation of Verified Email Protocal (VEP).
This repository contains several parts that make up the BrowserID Project:

* *The browserid server* - A node.js server which implements a web services api, stores a record of users, the email addresses they've verified, a bcrypted password, outstanding verification tokens, etc
* *The verifier* - A stateless node.js server which does cryptographic verification of assertions. This thing is hosted on browserid.org as a convenience, but people using browserid can choose to relocated it if they want to their own servers.
* *Sample and test code* - To test the above parts
* *The browserid.org website* - The templates, css, and javascript that make up the visible part of browserid.org
* *The javascript/HTML dialog & include library* - This is include.js and the code that it includes, the bit that someone using browserid will include.


Examples
--------

Using BrowserID is really simple:

First include the BrowserID JavaScript library in your site by adding a script tag to your `<head>`:

``` html
<script src="https://browserid.org/include.js" type="text/javascript"></script>
```

Instead of displaying a form element which takes a username and password, you trigger the BrowserID JavaScript API when the user clicks your sign-in button.
An example:

``` javascript
navigator.id.getVerifiedEmail(function(assertion) {
    if (assertion) {
        // This code will be invoked once the user has successfully
        // selected an email address they control to sign in with.
    } else {
        // something went wrong!  the user isn't logged in.
    }
});
```

Upon a successful sign-in you'll be called back with an assertion:
a string containing a signed claim that "proves" who the user is.
To verify the assertion is authentic extract the user's email address from the assertion.
The easiest way to do these is to use the free verification service provided by BrowserID.
To use it you send a request to `https://browserid.org/verify` with two POST parameters:

``` json
{
  assertion: ...,           # The encoded assertion
  audience: 127.0.0.1:9000  # The hostname and optional port of your site
}
```

The verifier will check that the assertion was meant for you site, and is valid.
Here's a real example:

``` terminal
$ curl -d "assertion=<ASSERTION>&audience=mysite.com" "https://browserid.org/verify"
```

And the response:

``` json
{
  "status": "okay",
  "email": "lloyd@mozilla.com",
  "audience": "mysite.com",
  "valid-until": 1308859352261,
  "issuer": "browserid.org:443"
}
```

While a bit more complicated you can choose to reduce your dependencies on remote services and validate your own assertions.
Refer to the specification and the source for the reference validator.
Having completed the steps above you can trust that the user really owns the email address.
You don't need to perform any additional authentication unless you want to!


Installing
----------

To contribute to the project you'll need the following:

**Requirements**

1. `node.js` version [0.4.5 or better](http://nodejs.org/)
2. `npm.js` version [1.0.0 or better](http://npmjs.org/)

After installing all of the requirements you'll need to run this code in the terminal:

``` terminal
~/browserid/$ npm install
> bcrypt@0.2.3 install /Users/krainboltgreene/repo/javascript/node/browserid/node_modules/bcrypt
> node-waf configure build

Checking for program g++ or c++          : ...
...
```

Then you should then only need to type the following into your terminal:

``` terminal
~/browserid/$ node ./run.js
```

And open your web browser to any of these to see the test servers:

* A local Verify server: http://127.0.0.1:10000
* The implentation example: http://127.0.0.1:10001
* The BrowserID website: http://127.0.0.1:10002


**Testing**

To make sure you did everything right, just do the following:

```
$ ./test.sh
```

A series of passing and/or failing tests should appear.
Some tests require MySQL databases to work, any that fail due to this should still work fine.


Issues & Documentation
----------------------

* [Documentation]()
* [Issues](https://github.com/mozilla/browserid/issues)

We use Git Flow, and so one minor difference you might notice is that the "main" branch is `dev`, not `master`.
The approach is described in a [blog post](http://lloyd.io/applying-gitflow).
Please issue pull requests targeted at the `dev` branch.
Unit tests are under `browserid/tests/`, and you should run them often.


Changelog
---------

**train-2011.08.04**

* When user closes dialog without clicking `cancel`, properly return `null` to the webpage (via `getVerifiedEmail` callback). *issue #107*
* Improve checks to warn developer that prerequisite software is missing. *issue #110*
* Parameterize software to support multiple deployment environments: `dev`, `beta`, and `prod`. *issues #102 & #52*
* Documentation updates.
* Improved logging using the `winston` logging framework for `node.js`.
* [Website] fixed inclusion of youtube video, now over https to keep browsers from getting scared about mixed mode resource inclusion.

**train-1**

* Beginning of time, everything is new.
* (2011.08.03) Include youtube video embedding over https *issue #112*
* (2011.08.04) Fix mozillalabs.com link in dialog. *issue #116*


Contributing
------------

* **Fork** the repository
* **Clone the repository** locally, or **edit via Github**
* Create a **new branch** using the [Git Flow Standard](http://yakiloo.com/getting-started-git-flow/) conventions
* Commit **often** and **when important**
* **DO NOT CHANGE** ANY OF THESE (without making a new branch for *that* change):
  * `.gitignore`
  * Any part of the git history
* **Write tests** specifically for the changes you've made, if no test exist
* **Push** your feature or hotfix branch to Github.
* Make a **Pull Request**


Credits
-------

* [name-of-person](mailto: email@email.com)
* [name-of-person](mailto: email@email.com)
* [name-of-person](mailto: email@email.com)
* [name-of-person](mailto: email@email.com)
* [name-of-person](mailto: email@email.com)


License
-------

Copyright (c) YEAR YOUR NAME

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

