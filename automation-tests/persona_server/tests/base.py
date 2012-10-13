#!/usr/bin/env python

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


class BaseTest(object):

    def clear_browser(self, mozwebqa):
        mozwebqa.selenium.execute_script('localStorage.clear()')


    def create_verified_user(self, mozwebqa):
        '''Create a pre-verified user, and returns it.'''
        from browserid import BrowserID
        bidpom = BrowserID(mozwebqa.selenium, mozwebqa.timeout)
        env = None
        if 'dev' in mozwebqa.base_url:
            env = 'dev'
        elif 'anosrep' in mozwebqa.base_url:
            env = 'stage'
        else:
            env = 'prod'
        user = bidpom.persona_test_user(env=env)
        print user  # important for debugging
        return user
 
    def get_confirm_url_from_email(self, email, message_count=1, regex='(https?:.*?token=.{48})'):
        '''
        Checks the restmail inbox for the specified address
        and returns the confirm url.
        Specify message_count if you expect there to be more than one message for the user.
        Specify regex if you wish to use a specific regex. By default searches for a url with a 48 char token."
        '''
        import re
        from browserid.tests import restmail

        mail = restmail.get_mail(email, message_count=message_count, timeout=60)
        message_text = mail[message_count - 1]['text']
        return re.search(regex, message_text).group(0)
