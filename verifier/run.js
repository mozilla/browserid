#!/usr/bin/env node

/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Mozilla BrowserID.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var sys = require("sys"),
path = require("path"),
fs = require("fs"),
cluster = require("cluster"),
configuration = require("../libs/configuration.js"),
express = require("express");

var PRIMARY_HOST = "127.0.0.1";
var PRIMARY_PORT = 62800;

var handler = require("./app.js");

var app = express.createServer();

// let the specific server interact directly with the express server to register their middleware
if (handler.setup) handler.setup(app);

if (/^test_/.test(process.env['NODE_ENV'])) {
  app.listen(PRIMARY_PORT, PRIMARY_HOST);
} else {
  var process_type = configuration.get("process_type");
  var cluster_dir = configuration.get("var_path") + "/cluster-" + process_type;
  var cluster_cfg = configuration.get("cluster");

  cluster(app)
    .use(cluster.logger(cluster_dir))
    .use(cluster.stats({ connections: true, requests: true }))
    .use(cluster.repl(cluster_dir + "/cluster.sock"))
    .set("workers", parseInt(cluster_cfg.workers))
    .set("timeout", 30*1000)
    .set("title", "cluster master: " + process_type)
    .set("worker title", "cluster worker {n}: " + process_type)
    .listen(PRIMARY_PORT, PRIMARY_HOST);
}
