/**
 * Copyright 2016 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

var tape = require('tape');
var _test = require('tape-promise');
var test = _test(tape);

var hfc = require('fabric-client');
var Client = hfc;
var User = require('fabric-client/lib/User.js');
var FabricCAServices = require('fabric-ca-client/lib/FabricCAClientImpl');
var CouchDBKeyValueStore = require('fabric-client/lib/impl/CouchDBKeyValueStore');

var utils = require('fabric-client/lib/utils.js');
var couchdbUtil = require('./couchdb-util.js');

require('../unit/util.js').resetDefaults();

hfc.addConfigFile('test/fixtures/cloudant.json');
var keyValueStore = hfc.getConfigSetting('key-value-store');

var cloudantUrl = 'https://1421acc7-6faa-491a-8e10-951e2e190684-bluemix:7179ef7a72602189243deeabe207889bde1c2fada173ae1022b5592e5a79dacc@1421acc7-6faa-491a-8e10-951e2e190684-bluemix.cloudant.com';

// This test first checks to see if a user has already been enrolled. If so,
// the test terminates. If the user is not yet enrolled, the test uses the
// FabricCAClientImpl to enroll a user, and saves the enrollment materials into the
// CouchDB KeyValueStore. Then the test uses the Chain class to load the member
// from the key value store.
test('Use FabricCAServices wih a Cloudant CouchDB KeyValueStore', function(t) {
	t.equal(keyValueStore, 'fabric-client/lib/impl/CouchDBKeyValueStore.js', 'Check key value store override for CouchDBKeyValueStore');

	//var user = new User();
	var client = new Client();

	// Set the relevant configuration values
	utils.setConfigSetting('crypto-keysize', 256);

	// Clean up the cloudant couchdb test database
	var dbname = 'member_db';

	var member;
	couchdbUtil.destroy(dbname, cloudantUrl)
	.then( function(status) {
		t.comment('Cleanup of existing ' + dbname + ' returned '+status);
		t.comment('Initilize the Cloudant CouchDB KeyValueStore');
		utils.newKeyValueStore({name: dbname, url: cloudantUrl})
		.then(
			function(kvs) {
				t.comment('Setting client keyValueStore to: ' + kvs);
				client.setStateStore(kvs);
				if (client.getStateStore() === kvs) {
					t.pass('Successfully set Cloudant CouchDB KeyValueStore for client');
				} else {
					t.pass('Cloudant CouchDB KeyValStore is not set successfully on this client!');
					t.end();
					process.exit(1);
				}
				t.comment('Initialize the CA server connection and KeyValueStore');
				return new FabricCAServices('http://localhost:7054', {name: dbname, url: cloudantUrl});
			},
			function(err) {
				console.log(err);
				t.fail('Error initializing Cloudant KeyValueStore. Exiting.');
				t.end();
				process.exit(1);
			})
		.then(
			function(caService) {
				console.log('ADD: caService - ' + caService);
				t.pass('Successfully initialized the Fabric CA service.');

				client.setCryptoSuite(caService.getCrypto());
				t.comment('Set cryptoSuite on client');
				t.comment('Begin caService.enroll');
				return caService.enroll({
					enrollmentID: 'admin',
					enrollmentSecret: 'adminpw'
				});
			},
			function(err) {
				t.fail('Failed to initilize the Fabric CA service: ' + err);
				t.end();
			}
		)
		.then(
			function(admin2) {
				t.pass('Successfully enrolled admin2 with CA server');

				// Persist the user state
				member = new User('admin2', client);
				return member.setEnrollment(admin2.key, admin2.certificate);
			},
			function(err) {
				t.fail('Failed to use obtained private key and certificate to construct a User object. Error: ' + err);
				t.end();
			}
		).then(
			function() {
				if (member.isEnrolled()) {
					t.pass('Member isEnrolled successfully.');
				} else {
					t.fail('Member isEnrolled failed.');
				}
				return client.setUserContext(member);
			},
			function(err) {
				t.fail('Failed to enroll admin2 with CA server. Error: ' + err);
				t.end();
			})
		.then(
			function(user) {
				return client.loadUserFromStateStore('admin2');
			}
		).then(
			function(user) {
				if (user && user.getName() === 'admin2') {
					t.pass('Successfully loaded the user from key value store');
					t.end();
				} else {
					t.fail('Failed to load the user from key value store');
					t.end();
				}
			},
			function(err) {
				t.fail('Failed to load the user admin2 from key value store. Error: ' + err);
				t.end();
			}
		).catch(
			function(err) {
				t.fail('Failed cloudant-fabricca-test with error:' + err.stack ? err.stack : err);
				t.end();
			}
		);
	});
});
