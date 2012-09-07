#!/usr/bin/env python

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import urllib2
import json

import selenium


class BrowserID(object):

    VERIFY_URL_REGEX = 'https?:\/\/(\S+)\/verify_email_address\?token=(.{48})'
    CONFIRM_URL_REGEX = 'https?:\/\/(\S+)\/confirm\?token=(.{48})'
    RESET_URL_REGEX = 'https?:\/\/(\S+)\/reset_password\?token=(.{48})'
    INCLUDE_URL_REGEX = '(https?:\/\/(\S+))\/include\.js'

    def __init__(self, selenium, timeout=60):
        self.selenium = selenium
        self.timeout = timeout

    def sign_in(self, email, password):
        """Signs in using the specified email address and password."""
        from pages.sign_in import SignIn
        sign_in = SignIn(self.selenium, timeout=self.timeout, expect='new')
        sign_in.sign_in(email, password)

    def persona_test_user(self, verified=True, env='prod'):
        '''
        Create a test user.

        ::Args::
        - verified - boolean True/False should the user be verified (default True)
        - env      - string dev/stage/prod instance of persona.org used by 
                     the system under test(default prod)

        ::Returns::
        A MockUser (dictionary) object that combines the values returned by the personatestuser API
        and the values returned by browserid.mocks.MockUser.

        {
            'email': 'lopez401@personatestuser.org'
            'primary_email': 'lopez401@personatestuser.org', 
            'pass': 'SOaUo9qJqYyBl1sN', 
            'password': 'SOaUo9qJqYyBl1sN', 
            'expires': '1346445745', 
            'verifier': 'https://verifier.dev.anosrep.org',
            'browserid': 'https://login.dev.anosrep.org', 
            'token': 'U6bFrRZJrZggwkJ0gkpvC9tuNNaIXpvEZM11gzLnw9l4o4UK', # for verified=False only
            'env': 'dev', 
            'id': 'lopez401',
            'additional_emails': ['george@gmail.com']
        }

        '''
        command = ''
        if verified:
            command = 'email'
        else:
            command = 'unverified_email'

        # url = 'http://resutsetanosrep.org/%s/%s' % (command, env)
        url = 'http://personatestuser.org/%s/%s' % (command, env)

        response = urllib2.urlopen(url, timeout=self.timeout)
        user = json.loads(response.read())
        print user

        from browserid.mocks.user import MockUser
        class MockUser(MockUser):

            def __init__(self, kwargs):
                '''
                Constructor. Not intended for external use.
                '''
                kwargs.pop('events')
                self.update(kwargs)
                self['additional_emails'] = []
                self['password'] = user['pass']
                self['primary_email'] = user['email']
                self['id'] = user['email'].split("@")[0]

            def add_additional_email(self, email=None):
                ''' Add email addresses to the user. If an email is provided, it will be used.
                Otherwise it will be auto-generated. The new email address is added to the object
                as wella s returned.
                '''
                if not email:
                    appendage = len(self['additional_emails'])
                    email = self['id'] + '_' + str(appendage) + '@personatestuser.org'
                self['additional_emails'].append(email)

                return email

        return MockUser(user)
