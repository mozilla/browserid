#!/usr/bin/env python

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import pytest

from browser_id import BrowserID
from tests.base import BaseTest

@pytest.mark.nondestructive
class TestBrowserID(BaseTest):

    @pytest.mark.travis
    def test_sign_in(self, mozwebqa):
        browser_id = BrowserID(mozwebqa.selenium, mozwebqa.timeout)
        user = self.get_test_user(mozwebqa)
        browser_id.sign_in(user['email'], user['password'])

        WebDriverWait(mozwebqa.selenium, mozwebqa.timeout).until(
            lambda s: s.find_element_by_id('loggedin').is_displayed())

    @pytest.mark.travis
    @pytest.mark.skip_selenium
    def test_persona_test_user_verified_prod(self, mozwebqa):

        user = BrowserID(mozwebqa.selenium, mozwebqa.timeout).persona_test_user()
        assert user['email']
        assert user['password']
        assert user['browserid'] == 'https://login.persona.org'
        assert user['verifier'] == 'https://login.persona.org/verify'
        assert not user.has_key('token')

    @pytest.mark.travis
    @pytest.mark.skip_selenium
    def test_persona_test_user_verified_stage(self, mozwebqa):

        user = BrowserID(mozwebqa.selenium, mozwebqa.timeout).persona_test_user(env='stage')
        assert user['email']
        assert user['password']
        assert user['browserid'] == 'https://login.anosrep.org'
        assert not user.has_key('token')

    @pytest.mark.travis
    @pytest.mark.skip_selenium
    def test_persona_test_user_verified_dev(self, mozwebqa):

        user = BrowserID(mozwebqa.selenium, mozwebqa.timeout).persona_test_user(env='dev')
        assert user['email']
        assert user['password']
        assert user['browserid'] == 'https://login.dev.anosrep.org'
        assert not user.has_key('token')

    @pytest.mark.travis
    @pytest.mark.skip_selenium
    def test_persona_test_user_unverified_prod(self, mozwebqa):

        user = BrowserID(mozwebqa.selenium, mozwebqa.timeout).persona_test_user(verified=False)
        assert user['email']
        assert user['password']
        assert user['browserid'] == 'https://login.persona.org'
        assert user['verifier'] == 'https://login.persona.org/verify'
        assert user.has_key('token')

    @pytest.mark.travis
    @pytest.mark.skip_selenium
    def test_persona_test_user_unverified_stage(self, mozwebqa):

        user = BrowserID(mozwebqa.selenium, mozwebqa.timeout).persona_test_user(verified=False, env='stage')
        assert user['email']
        assert user['password']
        assert user['browserid'] == 'https://login.anosrep.org'
        assert user['verifier'] == 'https://login.anosrep.org/verify'
        assert user.has_key('token')

    @pytest.mark.travis
    @pytest.mark.skip_selenium
    def test_persona_test_user_unverified_dev(self, mozwebqa):

        user = BrowserID(mozwebqa.selenium, mozwebqa.timeout).persona_test_user(verified=False, env='dev')
        assert user['email']
        assert user['password']
        assert user['browserid'] == 'https://login.dev.anosrep.org'
        assert user['verifier'] == 'https://verifier.dev.anosrep.org'
        assert user.has_key('token')

    @pytest.mark.travis
    @pytest.mark.skip_selenium
    def test_mock_user_add_email_with_email(self, mozwebqa):
        user = BrowserID(mozwebqa.selenium, mozwebqa.timeout).persona_test_user(verified=False, env='dev')
        user.add_additional_email('george@brown.gov')
        assert len(user['additional_emails']) == 1
        assert 'george@brown.gov' in user['additional_emails']

    @pytest.mark.travis
    @pytest.mark.skip_selenium
    def test_mock_user_add_email_default(self, mozwebqa):
        user = BrowserID(mozwebqa.selenium, mozwebqa.timeout).persona_test_user(verified=False, env='dev')
        user.add_additional_email()
        user.add_additional_email()
        assert len(user['additional_emails']) == 2
