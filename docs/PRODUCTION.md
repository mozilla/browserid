<!-- This Source Code Form is subject to the terms of the Mozilla Public
   - License, v. 2.0. If a copy of the MPL was not distributed with this
   - file, You can obtain one at http://mozilla.org/MPL/2.0/. -->

This document details the Persona production environment, how we maintain it, and how we deploy new code.

# Persona Production Environment

The Persona service is deployed, in production, as a set of clusters
with DNS load-balancing across them. Each cluster is internally
redundant, so no single host failure will take down the
service. Geographic distribution of clusters exists for failover and
scale. At this time, there are two clusters at two geographically
distant data centers. The number of clusters will likely increase.

A single Persona cluster looks like:

![alt](https://raw.github.com/benadida/browserid/opsdocs/docs/persona_arch.png "Optional title")

## Processes

Persona is composed of a few different distinct processes:

* *router* - the main entry point for all web requests, responsible for forwarding API requests appropriately. [QUESTION: should router be entry point for verifier? I don't think so... Maybe a separate router process?]

* *static* - handles all static file requests, e.g. images, CSS, etc.

* *reader* - handles all read only API requests, forwarding when needed to dbwriter and certifier.

* *writer* - handles all API requests which require write access to the database.

* *certifier* - handles certification of user keys.

* *verifier* - handles verification of assertions.

* *Squid proxy* - handles requests to third-party domains to check their BrowserID support (Note: not bin/proxy which is a development simulation of Squid).

This process separation lets us scale optimally, by giving each function the ability to scale independently of the others. More importantly, it lets us do privilege separation:

* only <tt>writer</tt> has DB-write access.
* only <tt>certifier</tt> has access to the private key.
* <tt>writer</tt> and <tt>certifier</tt> are not directly reachable from the public web, requests must be proxied via <tt>router</tt> and <tt>reader</tt>, serially.

## Database

We use MySQL in single-master / many-slaves mode, with the ability to
promote any slave to master when needed. This process is not
instantaneous: a master failure leads to 20 minutes of write-downtime
(while reads are unaffected.)

## Hosts

We could host each process on a separate host, but we don't need to do that yet. Instead, we have four classes of hosts:

* *webhead* - runs the <tt>router</tt>, <tt>static</tt>, <tt>reader</tt>, <tt>verifier</tt>, and <tt>proxy</tt> processes. Also runs <tt>nginx</tt> as the web-facing process.

* *dbwriter* - runs the <tt>writer</tt> process.

* *certifier* - runs the <tt>certifier</tt> process.

* *db* - runs the MySQL Database, master or slave.

Today, Ops calls dbwriter by the name secure webhead, swebhead, or sweb. The certifier is also a secure webhead, but they don't
mean that box, usually.

Each class of hosts has at least 3 instances so that maintenance can
proceed with remaining fault tolerance.

## Load Balancers

We use the Zeus load balancer in front of our multi-host system.

## Configuration Management

Hosts are configured with [Puppet](http://puppetlabs.com/puppet/what-is-puppet/), a tool that lets us specify invariants that Puppet ensures, e.g. "make sure that node 0.8.0 is installed."

# Deploying New Code

[This section merits further discussion.]

## High-Level Process

When deploying new code, we upgrade one cluster at a time, taking the
cluster offline first, upgrading it fully, then bringing it back
online. The alternative -- upgrading a cluster while it serves traffic
-- leaves open the possibility that a change in the internal API would
cause erratic behavior if, e.g. a read API call is served by old code
while a write API call is served by new code. This kind of
cluster-based deployment indicates that we'll need at least 3 clusters
for true robustness.

Within a given cluster, each host is upgraded. Since the whole cluster
is offline, we could technically upgrade all machines in parallel. To
be safe, we upgrade one machine at a time and halt if an error is
encountered. And to ensure that we can still hit the cluster and
remain mostly functional (in case we later choose not to take the
cluster offline), we take a machine out of rotation for its class,
upgrade it, then put it back in rotation.

## The Build and Coordination Server

Currently, a build-and-coordination server is used to construct the [RPM](http://en.wikipedia.org/wiki/RPM_Package_Manager), which
contains all dependencies that sit above <tt>node.js</tt>, and the
post-install actions taht restart appropriate services. This RPM is then pushed to individual hosts.

## Upgrading a Single Host

Each host is upgraded by copying the RPM to it and installing it.

## Database Schema Updates

Schema updates require more care. We aim to perform schema updates
with zero downtime. Using the MySQL Percona toolchain, we perform
schema updates by creating entirely new tables and in-place swapping
the old and new. This means that a schema update can take multiple
hours to perform and spread to all slaves.

When a code change includes a schema update, a separate deployment
ticket needs to be filed.

## Configuration Updates

Configuration updates, whether new configuration fields or changes to
existing configuration fields, should be flagged separately.

## Deployment Tickets

A new deployment is thus performed by:

* preparing a deployment changelog, and determining whether database and/or configuration updates are necessary.
* filing separate schema update and configuration update tickets if necessary, leaving 2 days for the schema update ticket to be performed.
* filing a code update ticket, blocking on schema update and configuration update tickets if need be.

# Monitoring & Escalation