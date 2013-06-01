#!/bin/bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#
# This script install all dependencies needed to build, test and contribute
# to Mozilla Persona on Ubuntu.
#
# Works on : 
#		- Ubuntu 13.04 (quack1)
#		- Debian 6.0.6/6.0.7 (quack1)
#
# http://quack1.me/persona_setup_ubuntu-en.html

usage ()
{	
	echo "This script install all dependencies needed to build, test and contribute to Mozilla Persona on Ubuntu."
	echo "You must run it directly from the root directory of the browserid repository."
	echo "Usage:"
	echo "$0 {install|-h|bcrypt}"
	echo "	install <browsedid_directory> <nvm_directory>"
	echo "		Install all modules used by Persona."
	echo "		<browserid_directory> : Directory where to clone ''browserid''"
	echo "		<nvm_directory> : Directory where to clone ''nvm''"
	echo "	-h"
	echo "		Display an help message"
	echo "	bcrypt <bcrypt_directory>"
	echo "		In case of failure during the installation of the module ''bcrypt'',"
	echo "		install it from the sources."
	echo "		<bcrypt_directory> : Directory where to clone ''bcrypt''"
}

install () 
{
	sudo apt-get install -y \
	python-software-properties \
	git-core \
	libgmp3-dev \
	g++ \
	libssl-dev \
	curl

	git clone https://github.com/mozilla/browserid.git $1/browserid

	git clone http://github.com/creationix/nvm.git $2/nvm
	echo ". $2/nvm/nvm.sh" >> ~/.bashrc
	source $2/nvm/nvm.sh

	nvm install 0.10.9
	nvm alias default 0.10.9
	cd $1/browserid
	npm install

	echo ""
	echo ""
	echo "Installation successfull"
	echo "To start Browserid examples :"
	echo "	$ cd $1/browserid"
	echo "	$ npm start"
	echo "To run them without restarting your shell : "
	echo "	$ cd $1/browserid"
	echo "	$ nvm use 0.8.12"
	echo "	$ npm start"
}

install_bcrypt ()
{
	source ~/.bashrc
	git clone http://github.com/ncb000gt/node.bcrypt.js.git $1/node.bcrypt
	pushd .
	cd $1/node.bcrypt
	npm install -g node-gyp
	node-gyp configure
	node-gyp build
	popd
	rm -r var node_modules
	npm install
}

if [ $# -lt 1 ];
	then
	usage;
	exit 1;
fi

case "$1" in
	'install')
		if [ $# -ne 3 ];
			then
			usage;
			exit 1;
		fi
		install "$2" "$3"
	;;
	'bcrypt')
		if [ $# -ne 2 ];
			then
			usage;
			exit 1;
		fi
		install_bcrypt "$2"
	;;
	*)
		usage;
		exit 1
	;;
esac
