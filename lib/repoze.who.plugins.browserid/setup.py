from setuptools import setup, find_packages

version = (0, 0, 1)

setup(
      name='repoze.who.plugins.browserid',
      namespace_packages=['repoze', 'repoze.who', 'repoze.who.plugins'],
      zip_safe=False,
      include_package_data=True,
      version=".".join(map(str, version)),
      description="""repoze.who.plugins.browserid -- BrowserID Authentication for WSGI Applications

        repoze.who.plugins.browserid is a plugin for authenticatining users
        using BrowserID (https://browserid.org/).""",
      classifiers=[
          'Development Status :: 1 - Planning',
          'Intended Audience :: Developers',
          'Natural Language :: English',
          'Operating System :: POSIX :: Linux',
          'Programming Language :: Python',
          'Topic :: Internet :: WWW/HTTP :: WSGI :: Middleware',
          'Topic :: System :: Systems Administration :: Authentication/Directory :: BrowserID',
      ],
      keywords='browserid web application server wsgi repoze repoze.who',
      author='Chris AtLee',
      author_email='chris@atlee.ca',
      packages=find_packages(),
      install_requires=[
          'setuptools',
          'repoze.who',
          'simplejson',
          'webob',
          ],
      )
