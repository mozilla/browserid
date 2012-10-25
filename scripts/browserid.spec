%define _rootdir /opt/browserid

Name:          browserid-server
Version:       0.2012.10.26
Release:       1%{?dist}_%{svnrev}
Summary:       BrowserID server
Packager:      Gene Wood <gene@mozilla.com>
Group:         Development/Libraries
License:       MPL 2.0
URL:           https://github.com/mozilla/browserid
Source0:       %{name}.tar.gz
BuildRoot:     %{_tmppath}/%{name}-%{version}-%{release}-root
AutoReqProv:   no
Requires:      openssl, nodejs == 0.8.12
BuildRequires: gcc-c++, git, jre, make, npm, openssl-devel, expat-devel, nodejs == 0.8.12

%description
persona server & web home for persona.org

%prep
%setup -q -c -n browserid

%build
npm install
export PATH=$PWD/node_modules/.bin:$PATH
./locale/compile-mo.sh locale/
./locale/compile-json.sh locale/ resources/static/i18n/
env CONFIG_FILES=$PWD/config/l10n-all.json scripts/compress
rm -r resources/static/build resources/static/test
echo "$GIT_REVISION" > resources/static/ver.txt
echo "locale svn r$SVN_REVISION" >> resources/static/ver.txt

%install
rm -rf %{buildroot}
mkdir -p %{buildroot}%{_rootdir}
for f in bin lib locale node_modules resources scripts *.json; do
    cp -rp $f %{buildroot}%{_rootdir}/
done
mkdir -p %{buildroot}%{_rootdir}/config
cp -p config/l10n-all.json %{buildroot}%{_rootdir}/config
cp -p config/l10n-prod.json %{buildroot}%{_rootdir}/config

%clean
rm -rf %{buildroot}

%files
%defattr(-,root,root,-)
%{_rootdir}

%changelog
* Tue Oct 18 2011 Pete Fritchman <petef@mozilla.com>
- Initial version
