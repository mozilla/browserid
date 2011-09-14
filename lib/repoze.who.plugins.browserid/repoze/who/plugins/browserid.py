import urllib2, urllib

import simplejson as json

from zope.interface import implements
from repoze.who.interfaces import IAuthenticator, IChallenger, IIdentifier
import repoze.who.api

from paste.httpexceptions import HTTPUnauthorized, HTTPSeeOther

from webob import Request

import logging
log = logging.getLogger(__name__)

version = (0, 0, 1)

template = """
<html>
<head>
<script src="https://browserid.org/include.js" type="text/javascript"></script>
<script src="http://ajax.googleapis.com/ajax/libs/jquery/1.6.2/jquery.min.js" type="text/javascript"></script>
</head>
<body>
Please wait while logging in via browser id...

<script type="text/javascript">
navigator.id.getVerifiedEmail(function(assertion) {
    if (assertion) {
        $.get("", {"assertion": assertion}, function() {window.location.reload()});
    } else {
        // something went wrong!  the user isn't logged in.
    }
});
</script>
</body>
</html>
"""

class BrowserIDPlugin(object):

    implements(IAuthenticator, IIdentifier, IChallenger)

    def __init__(self, audience, remember_name, service='https://browserid.org/verify'):
        self.service = service
        self.audience = audience
        self.remember_name = remember_name

    def identify(self, environ):
        req = Request(environ)
        if 'assertion' in req.str_GET:
            return {'assertion': req.str_GET['assertion']}

        return None

    def forget(self, environ, identity):
        api = repoze.who.api.get_api(environ)
        return api.name_registry[self.remember_name].forget(environ, identity)

    def remember(self, environ, identity):
        api = repoze.who.api.get_api(environ)
        return api.name_registry[self.remember_name].remember(environ, identity)

    def authenticate(self, environ, identity):
        try:
            assertion = identity['assertion']
        except KeyError:
            return None

        req_data = urllib.urlencode([
                ('assertion', assertion),
                ('audience', self.audience),
                ])
        req = urllib2.urlopen(self.service, req_data)
        try:
            data = json.load(req)
            if data['status'] == 'okay':
                return data['email']
            log.info("Failed to verify assertion: %s", data)
        except:
            log.exception("Failed to load/parse data")
            return None

    def challenge(self, environ, status, app_headers, forget_headers):
        if forget_headers:
            return HTTPSeeOther("/", headers=forget_headers)

        def app(environ, start_response):
            #headers = app_headers[:]
            headers = []
            headers.append( ('Content-Length', str(len(template))) )
            start_response('200 OK', headers)
            return template
        return app

def make_plugin(audience, remember_name, service="https://browserid.org/verify"):
    return BrowserIDPlugin(audience, remember_name=remember_name, service=service)

if __name__ == '__main__':
    a = BrowserIDPlugin("localhost")
    assertion = raw_input("Assertion: ")
    print a.authenticate({}, {'assertion': assertion})
