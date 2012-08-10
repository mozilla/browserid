#!/bin/bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

usage()
{
    cat <<EOU
    Usage: $0 [-hv] [major]

    Creates an rpm package of the current version

    Options:
        -h
            Show this help
        -v
            Be verbose

    Parameters:
        major
            Major version to use, defaults to '0'


EOU
    exit ${1:-0}
}


## works as a describe, but giving the name of the branch and the number of
## commits of it if there are no newer tags
get_version_string()
{
    local branch describe_all describe_tags version ancestor
    branch="$(git symbolic-ref HEAD 2>/dev/null)" \
    || branch="(unnamed branch)"
    branch=${branch##refs/heads/}
    describe_all="$(git describe --all --long)"
    describe_tags="$(git describe --tags --long 2>/dev/null)"
    [[ $? -ne 0 ]] \
    && {
        ## we have no reachable tags in the history, use the branch name
        ## if we are in the master branch, use the total count of commits
        version="${describe_all#*/}"
        version="${version%%-*-*}"
        [[ "${version}" == "$(get_master_branch)" ]] \
        && echo "${version}-$(get_ci_count)-$(git log --pretty=format:'%h' -n 1)" \
        || echo "${describe_all#*/}"
        return
    }
    [[ "${describe_tags%-*-*}" == "${describe_all#*/}" ]] \
    && {
        ## the tag we got with the describe is newer than the branch, use it
        echo "$describe_tags"
        return
    } || {
        ## Iep, we got a tag that is older than the current branch, use the
        ## branch name and calculate the commit count since the newest ancestor
        version="${describe_all#*/}"
        version="${version%%-*-*}"
        ## if we are in the master branch use the total count of commits instead
        [[ "${version}" == "$(get_master_branch)" ]] \
        && echo "${version}-$(get_ci_count)-$(git log --pretty=format:'%h' -n 1)" \
        || {
            ## calculate the ancestor of this branch in the master one
            ancestor="$(git merge-base $branch $(get_master_branch))"
            echo "${version}-$(get_ci_count $ancestor)-$(git log --pretty=format:'%h' -n 1)"
        }
    }
}

## Parse the version string and sanitize it
## to use it you can do, for example:
##   ># read ver rel < <(get_rpm_version_string)
get_rpm_version_string() {
    local version_string ver rel
    version_string="$(get_version_string)"
    ver="${version_string%-*-*}"
    rel="${version_string:$((${#ver}+1))}"
    echo "${ver//[[:space:]-\/#]}" "${rel//[-]/.}"
}


## Count the commits from a given hash-like or from the start of history
get_ci_count()
{
    ## wc alone does not get the last line because there's no new line
    local res="$(git log --oneline ${1:+$1..} --pretty='format:%h')"
    [[ -z $res ]] && echo "0" || { echo "$res" | wc -l; }
}

## Get the currente remote that we are using, alas the one with name origin or
## the first of the list... maybe there's a better way to find out
get_current_remote()
{
    local remotes="$(git remote)"
    [[ "$remotes" != "${remotes/origin}" ]] \
    && echo 'origin' \
    || echo "${remotes%%[[:space:]]*}"
}

## Get the remote repo where we got the code
get_remote()
{
    local rem_line="$(git remote -v | egrep "^$( get_current_remote ).*fetch\)$" )"
    rem_line="${rem_line#*[[:space:]]}"
    echo ${rem_line%[[:space:]]*}
}

## Maybe our default amster branch is not 'master'
get_master_branch()
{
    local master_branch="$(git branch -a | grep "$(get_current_remote)/HEAD ->")"
    master_branch="${master_branch##* -> }"
    echo "${master_branch#*/}"
}

get_locale()
{
    [[ -d locale/.svn ]] \
    && svn up locale \
    || {
        [[ -d locale ]] \
        || svn co http://svn.mozilla.org/projects/l10n-misc/trunk/browserid/locale
    }
    LOCALE_REV="$(svn info locale/ | sed -n -e "s,^Rev.*n: ,,p")"
}

#### MAIN

while getopts 'hv' option; do
    case $option in
        h) usage;;
        v) set -e;;
        *) usage 1;;
    esac
done
shift $((OPTIND - 1))

MAJOR=${1:-0}


progname=$(basename $0)

cd $(dirname $0)/..    # top level of the checkout

rm -rf rpmbuild/RPMS rpmbuild/SOURCES/browserid &>/dev/null
mkdir -p rpmbuild/{SOURCES,SPECS,RPMS,BUILD}

tar --exclude rpmbuild --exclude .git \
    --exclude var -czf \
    $PWD/rpmbuild/SOURCES/browserid-server.tar.gz .

set +e

## this also sets the LOCALE_REV variable
get_locale

ver_string="$(get_version_string)"
ver="${ver_string%-*-*}"
rel="${ver_string:$((${#ver} + 1))}"
## the char '-' is not allowed in the version nor the release
rpmbuild --define "_topdir $PWD/rpmbuild" \
         --define "ver $MAJOR.${ver//-/_}" \
         --define "rel ${rel//-/.}" \
         --define "fullver ${ver_string}" \
         --define "src_repo $(get_remote)" \
         -ba scripts/browserid.spec
rc=$? \
&& ls -l $PWD/rpmbuild/RPMS/*/*.rpm \
|| echo "$progname: failed to build browserid RPM (rpmbuild rc=$rc)" >&2
exit $rc
