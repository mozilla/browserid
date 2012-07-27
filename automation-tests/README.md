getting started
===============

## how to run selenium tests inside the automation-tests directory against 123done (new API) and myfavoritebeers (old API)

Node bindings don't exist for Selenium 2 API (webdriver), so we're using python bindings instead. This requires some python-centric setup, but it shouldn't take more than 15 minutes or so to get up and running.

### check system-wide python requirements

You should have python 2.7 on your system (check python --version).

We have to install a bunch of python libraries. pip fetches packages; virtualenv sandboxes them. If pip and virtualenv aren't on your system already, you'll need to do this once (once per computer, not once per repo):

    # only do this if pip and virtualenv aren't on your computer already
    easy_install pip
    pip install virtualenv (might need to use sudo)

### build a sandboxed python test environment

From the automated-tests directory, create a sandboxed python environment to install python dependencies (only need to do this once per clone):

    # only do this once per clone
    virtualenv bid_selenium 

Be sure you do not accidentally add the virtualenv directory (here, bid_selenium) to git.

You can activate the sandbox, meaning link installed programs, via:

    . bid_selenium/bin/activate

And when you want to stop using the sandbox, you can exit via ```deactivate```. Deactivating the virtualenv doesn't destroy it.

In order to install python dependencies into the sandbox, activate the virtualenv, then install the python requirements in requirements.txt:

    pip install -Ur requirements.txt

Sweet. Your environment is now ready.

### create a test user in credentials.yaml

Some of the automation tests verify that existing accounts work, so create a test account, and put the info into credentials.yaml.

### run the tests locally

When you want to run the tests, make sure the virtualenv is active:

    . bid_selenium/bin/activate

Then, run the tests by calling py.test on the command line with some options.

Here's an example incantation to run the 123done tests locally, assuming you have firefox installed:

    py.test --destructive --driver=firefox --baseurl=http://dev.123done.org \
        --credentials=credentials.yaml -q 123done

To run myfavoritebeer tests, switch up the baseurl:

    py.test --destructive --driver=firefox --baseurl=http://dev.myfavoritebeer.org \
        --credentials=credentials.yaml -q myfavoritebeer

If you want to use Chrome instead of FF, download [Chromedriver](http://code.google.com/p/selenium/wiki/ChromeDriver), put it somewhere, then update a few command-line options:

    py.test --destructive --driver=chrome --baseurl=http://dev.myfavoritebeer.org \
        --chromepath=/usr/local/bin/chromedriver --credentials=credentials.yaml \ 
        -q myfavoritebeer

## writing automation tests

The most important thing to note is that this code is a git subtree pulled from github.com/6a68/BrowserID-Tests.git, which means we can push and pull changes to that repo, and from there, share out to the upstream mozilla/BrowserID-Tests repo. See [git-subtree help file](https://github.com/apenwarr/git-subtree/blob/master/git-subtree.txt) for details on moving patches across repos using git-subtree, which is an awesome tool. See also apenwarr's [blog post](http://apenwarr.ca/log/?m=200904#30).
